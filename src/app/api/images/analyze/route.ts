/**
 * POST /api/images/analyze — Phase 04 pipeline
 *
 *   1.  Parse request → buffer
 *   2.  Validate image
 *   3.  Generate fingerprints (SHA-256 + pHash + CLIP embedding)
 *   4.  Extract EXIF metadata
 *   5.  Exact duplicate check → early return if found
 *   6.  pHash / CLIP similarity check
 *   7.  Upload to Cloudinary
 *   6.5 Run ELA analysis (try/catch — never blocks pipeline)
 *   6.6 Run combined edit assessment (EXIF + ELA + CLIP)
 *   8.  Determine parent hash + depth
 *   9.  Save root ImageNode to MongoDB
 *  10.  Google Vision reverse search
 *  11.  Batch-download & analyze discovered images
 *  12.  Upsert discovered ImageNodes in MongoDB
 *  13.  Build relationship graph (with CLIP embeddings map)
 *  14.  Persist parent/child refs + depths (bulkWrite)
 *  15.  Build nested TreeJSON + stats
 *  16.  Return full response
 */

import { NextRequest, NextResponse }           from 'next/server';
import { connectDB }                           from '@/lib/db/mongodb';
import { ImageNodeModel }                      from '@/lib/db/models/ImageNode';
import { uploadImage }                         from '@/lib/cloudinary/upload';
import {
  downloadImageFromUrl,
  validateImageBuffer,
  InvalidUrlError,
  FileTooLargeError,
  NotAnImageError,
}                                              from '@/lib/utils/imageIngestion';
import { generateFingerprints }                from '@/lib/utils/fingerprint';
import { extractExifData }                     from '@/lib/utils/exifExtractor';
import { checkForDuplicates }                  from '@/lib/utils/duplicateDetector';
import { performELA }                          from '@/lib/utils/elaAnalysis';
import { assessEditProbability }               from '@/lib/utils/editDetector';
import { reverseImageSearch }                  from '@/lib/services/googleVision';
import { analyzeDiscoveredImages }             from '@/lib/services/batchAnalyzer';
import { buildRelationships }                  from '@/lib/services/relationshipEngine';
import { buildTreeJson, getTreeStats, singleNodeTree } from '@/lib/utils/treeBuilder';
import { cosineSimilarity }                          from '@/lib/services/clipService';
import type { IImageNode }                     from '@/lib/db/models/ImageNode';
import type { AnalyzedImage }                  from '@/lib/services/batchAnalyzer';
import type { ImageNode, ImageSource }         from '@/types/image';

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[Phase04] ── POST /api/images/analyze — pipeline start ──');

  try {
    // ── Step 1: Parse request ──────────────────────────────────────────────
    let buffer: Buffer;
    const contentType = request.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file     = formData.get('image') as File | null;
      if (!file) {
        return NextResponse.json(
          { error: 'No image file provided (field name must be "image")', code: 'MISSING_FILE' },
          { status: 400 }
        );
      }
      buffer = Buffer.from(await file.arrayBuffer());
      console.log(`[Phase04] Step 1: file ${file.name} — ${(buffer.byteLength / 1024).toFixed(1)} KB`);
    } else {
      let body: { url?: string };
      try { body = await request.json(); }
      catch {
        return NextResponse.json({ error: 'Invalid request body', code: 'INVALID_BODY' }, { status: 400 });
      }
      if (!body.url?.trim()) {
        return NextResponse.json({ error: 'No URL provided', code: 'MISSING_URL' }, { status: 400 });
      }
      buffer = await downloadImageFromUrl(body.url.trim());
      console.log(`[Phase04] Step 1: URL downloaded — ${(buffer.byteLength / 1024).toFixed(1)} KB`);
    }

    // ── Step 2: Validate ───────────────────────────────────────────────────
    console.log('[Phase04] Step 2: Validating image…');
    const validation = await validateImageBuffer(buffer);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error, code: 'INVALID_IMAGE' },
        { status: validation.error?.includes('large') ? 413 : 422 }
      );
    }

    // ── Step 3: Fingerprints (SHA-256 + pHash + CLIP) ─────────────────────
    console.log('[Phase04] Step 3: Generating fingerprints…');
    const { cryptoHash, pHash, dHash, clipEmbedding, clipServiceAvailable } =
      await generateFingerprints(buffer);

    // ── Step 4: EXIF ───────────────────────────────────────────────────────
    console.log('[Phase04] Step 4: Extracting EXIF…');
    const exifData = await extractExifData(buffer);

    // ── Step 5: Exact duplicate check ─────────────────────────────────────
    console.log('[Phase04] Step 5: Checking for exact duplicate…');
    await connectDB();

    const existingNode = await ImageNodeModel.findOne({ cryptoHash });
    if (existingNode) {
      console.log('[Phase04] Exact duplicate — returning cached node');
      await ImageNodeModel.updateOne({ cryptoHash }, { $inc: { seenCount: 1 } }).catch(() => null);
      const tree  = singleNodeTree(existingNode.toObject() as unknown as ImageNode);
      const stats = getTreeStats(tree);
      return NextResponse.json({
        status: 'duplicate',
        node:   existingNode.toObject(),
        tree,   stats,
        processingTime:  Date.now() - startTime,
        discoveredCount: 0,
      });
    }

    // ── Step 6: pHash / CLIP similarity check ─────────────────────────────
    const dupResult = await checkForDuplicates(cryptoHash, pHash, clipEmbedding);

    // ── Step 7: Upload to Cloudinary ───────────────────────────────────────
    console.log('[Phase04] Step 7: Uploading to Cloudinary…');
    const uploadResult = await uploadImage(buffer, { sha256Hash: cryptoHash });

    // ── Step 6.5: ELA analysis ────────────────────────────────────────────
    console.log('[Phase04] Step 6.5: Running ELA analysis…');
    const elaResult = await performELA(buffer).catch((err) => {
      console.error('[Phase04] ELA failed (continuing):', (err as Error).message);
      return {
        elaScore: 0, elaHeatmapUrl: '', elaHeatmapPublicId: '',
        isLikelyEdited: false, confidence: 0, highDiffRegions: 0, analysisTime: 0,
      };
    });
    console.log(`[Phase04] ELA: score=${elaResult.elaScore.toFixed(4)}, likelyEdited=${elaResult.isLikelyEdited}`);

    // ── Step 6.6: Combined edit assessment ────────────────────────────────
    console.log('[Phase04] Step 6.6: Running edit assessment…');
    const editAssessment = assessEditProbability(exifData, elaResult, null);
    console.log(`[Phase04] Verdict: ${editAssessment.verdict} (${(editAssessment.editProbability * 100).toFixed(0)}% edit probability)`);

    // ── Step 8: Determine parent hash + depth ─────────────────────────────
    let parentHash: string | null = null;
    let depth = 0;

    if (
      (dupResult.status === 'similar' || dupResult.status === 'uncertain') &&
      dupResult.matchedNode
    ) {
      parentHash = dupResult.matchedNode.hash;
      depth      = (dupResult.matchedNode.depth ?? 0) + 1;
      await ImageNodeModel.updateOne(
        { hash: parentHash },
        { $addToSet: { children: pHash } }
      ).catch(() => null);
    }

    // ── Step 9: Save root ImageNode ────────────────────────────────────────
    console.log('[Phase04] Step 9: Saving root ImageNode…');
    const { editingDetection } = exifData;
    const isEdited = editAssessment.verdict === 'edited' || depth > 0;

    const nodeData = {
      hash:               pHash,
      cryptoHash,
      dHash,
      clipEmbedding:      clipEmbedding ?? [],
      cloudinaryUrl:      uploadResult.url,
      cloudinaryPublicId: uploadResult.publicId,
      metadata: {
        width:       exifData.width,
        height:      exifData.height,
        format:      exifData.format,
        fileSize:    exifData.fileSize,
        dateCreated: exifData.dateCreated,
        camera:      exifData.camera,
        software:    exifData.software,
        gps:         exifData.gps,
      },
      forensics: {
        isEdited,
        editingSoftware: editingDetection.software ?? undefined,
        elaScore:        elaResult.elaScore,
        elaHeatmapUrl:   elaResult.elaHeatmapUrl || undefined,
        confidence:      editAssessment.overallConfidence,
        editProbability: editAssessment.editProbability,
        editVerdict:     editAssessment.verdict,
        signals: {
          exif: editAssessment.signals.exif,
          ela:  editAssessment.signals.ela,
          clip: editAssessment.signals.clip,
        },
      },
      sources:    [],
      parentHash,
      children:   [],
      depth,
      uploadedAt: new Date(),
    } as unknown as IImageNode;

    const rootMongoNode = await ImageNodeModel.create(nodeData);

    // ── Steps 10–15: Vision + relationship pipeline ────────────────────────
    const rootAnalyzed: AnalyzedImage = {
      url:              uploadResult.url,
      pHash,
      cryptoHash,
      metadata: {
        width:       exifData.width,
        height:      exifData.height,
        format:      exifData.format,
        fileSize:    exifData.fileSize,
        dateCreated: exifData.dateCreated,
        camera:      exifData.camera,
        software:    exifData.software,
      },
      editingDetection,
      matchType:       'full',
      pHashDistance:    0,
      googleScore:     1.0,
      platform:        'Uploaded',
      downloadedAt:    new Date(),
      downloadSuccess: true,
      clipEmbedding:          clipEmbedding,
      dHash,
      elaScore:               elaResult.elaScore,
      elaHeatmapUrl:          elaResult.elaHeatmapUrl,
      isPartialOfRoot:        false,  // root is never a crop of itself
      partialMatchConfidence: 0,
      partialMatchWhich:      null,
    };

    // ── Step 10: Google Vision reverse search ──────────────────────────────
    let visionSearchFailed = false;
    let visionErrorMessage = '';
    const visionResults = await reverseImageSearch(uploadResult.url).catch((err) => {
      visionSearchFailed = true;
      visionErrorMessage = (err as Error).message;
      console.error('[Phase04] Vision search failed:', visionErrorMessage);
      return [];
    });
    console.log(`[Phase04] Step 10: ${visionResults.length} images via Google Vision${visionSearchFailed ? ' (FAILED — ' + visionErrorMessage.slice(0, 60) + ')' : ''}`);

    // ── Step 11: Batch analyze discovered images ───────────────────────────
    const analyzedImages = visionResults.length > 0
      ? await analyzeDiscoveredImages(visionResults, pHash, buffer)
      : [];

    // ── Step 12: Upsert discovered ImageNodes ─────────────────────────────
    console.log(`[Phase04] Step 12: Upserting ${analyzedImages.length} discovered nodes…`);
    const discoveredMongoNodes: IImageNode[] = [];

    for (const img of analyzedImages) {
      try {
        const existing = await ImageNodeModel.findOne({ cryptoHash: img.cryptoHash });
        if (existing) {
          const source: ImageSource = {
            url: img.url, foundAt: img.downloadedAt.toISOString(), platform: img.platform,
          };
          await ImageNodeModel.updateOne(
            { cryptoHash: img.cryptoHash },
            { $addToSet: { sources: source } }
          );
          discoveredMongoNodes.push(existing);
        } else {
          const imgAssessment = (img as AnalyzedImage & { _assessment?: ReturnType<typeof assessEditProbability> })._assessment;
          const newNode = await ImageNodeModel.create({
            hash:               img.pHash,
            cryptoHash:         img.cryptoHash,
            clipEmbedding:      img.clipEmbedding ?? [],
            dHash:              img.dHash,
            cloudinaryUrl:      img.url,
            cloudinaryPublicId: img.cryptoHash.slice(0, 32),
            metadata:           img.metadata,
            forensics: {
              isEdited:        imgAssessment ? imgAssessment.verdict !== 'original' : img.editingDetection.wasEdited,
              editingSoftware: img.editingDetection.software ?? undefined,
              elaScore:        img.elaScore,
              elaHeatmapUrl:   img.elaHeatmapUrl || undefined,
              confidence:      imgAssessment?.overallConfidence ?? img.editingDetection.confidence,
              editProbability: imgAssessment?.editProbability,
              editVerdict:     imgAssessment?.verdict,
              signals:         imgAssessment ? {
                exif: imgAssessment.signals.exif,
                ela:  imgAssessment.signals.ela,
                clip: imgAssessment.signals.clip,
              } : undefined,
            },
            sources: [{
              url: img.url, foundAt: img.downloadedAt.toISOString(), platform: img.platform,
            }],
            parentHash: null, children: [], depth: 0, uploadedAt: new Date(),
          } as unknown as IImageNode);
          discoveredMongoNodes.push(newNode);
        }
      } catch (err) {
        console.warn(`[Phase04] Failed to upsert ${img.pHash.slice(0, 12)}: ${(err as Error).message}`);
      }
    }

    // ── Step 12.5: Full edit assessment for each discovered image ──────────
    console.log('[Phase04] Step 12.5: Running full edit assessment for discovered images…');

    for (const img of analyzedImages) {
      const imgClip  = img.clipEmbedding;
      const clipSim  = clipEmbedding && imgClip
        ? cosineSimilarity(clipEmbedding, imgClip)
        : null;

      const imgElaResult = {
        elaScore:           img.elaScore,
        elaHeatmapUrl:      img.elaHeatmapUrl,
        elaHeatmapPublicId: '',
        isLikelyEdited:     img.elaScore > 0.15,
        confidence:         img.elaScore > 0.15 ? 0.85 : 0.75,
        highDiffRegions:    0,
        analysisTime:       0,
      };

      const imgMeta = {
        width:            img.metadata.width,
        height:           img.metadata.height,
        format:           img.metadata.format,
        fileSize:         img.metadata.fileSize,
        dateCreated:      img.metadata.dateCreated,
        camera:           img.metadata.camera,
        software:         img.metadata.software,
        gps:              img.metadata.gps,
        editingDetection: img.editingDetection,
      };

      const assessment = assessEditProbability(imgMeta, imgElaResult, clipSim, img.pHashDistance);
      // Attach to the img object so step 12 can use it
      (img as AnalyzedImage & { _assessment?: typeof assessment })._assessment = assessment;

      console.log(
        `[Phase04] Discovered ${img.pHash.slice(0, 12)}… verdict=${assessment.verdict} (${(assessment.editProbability * 100).toFixed(0)}%) ELA=${img.elaScore.toFixed(3)} CLIP_sim=${clipSim?.toFixed(3) ?? 'n/a'} pHashDist=${img.pHashDistance}`
      );
    }

    // ── Step 13: Build relationship graph with CLIP map ───────────────────
    console.log('[Phase04] Step 13: Building relationship graph…');
    const clipMap = new Map<string, number[]>();
    if (clipEmbedding) clipMap.set(pHash, clipEmbedding);
    for (const img of analyzedImages) {
      if (img.clipEmbedding) clipMap.set(img.pHash, img.clipEmbedding);
    }

    const graph = buildRelationships(rootAnalyzed, analyzedImages, clipMap);

    // ── Step 14: Persist edges via bulkWrite ──────────────────────────────
    if (graph.edges.length > 0) {
      console.log(`[Phase04] Step 14: Persisting ${graph.edges.length} edges…`);
      const bulkOps: Parameters<typeof ImageNodeModel.bulkWrite>[0] = [];

      for (const edge of graph.edges) {
        bulkOps.push({
          updateOne: { filter: { hash: edge.childHash },  update: { $set: { parentHash: edge.parentHash } } },
        });
        bulkOps.push({
          updateOne: { filter: { hash: edge.parentHash }, update: { $addToSet: { children: edge.childHash } } },
        });
      }
      for (const [hash, node] of graph.nodes) {
        bulkOps.push({
          updateOne: { filter: { hash }, update: { $set: { depth: node.depth } } },
        });
      }

      await ImageNodeModel.bulkWrite(bulkOps).catch((err) => {
        console.warn('[Phase04] bulkWrite partial failure:', (err as Error).message);
      });
    }

    // ── Step 15: Build TreeJSON + stats ────────────────────────────────────
    console.log('[Phase04] Step 15: Building tree JSON…');
    const allNodes: ImageNode[] = [
      rootMongoNode.toObject() as unknown as ImageNode,
      ...discoveredMongoNodes.map((n) => n.toObject() as unknown as ImageNode),
    ];

    const tree  = buildTreeJson(graph, allNodes);
    const stats = getTreeStats(tree);

    const processingTime = Date.now() - startTime;
    console.log(
      `[Phase04] ── Complete in ${processingTime}ms | nodes: ${stats.totalNodes} | ELA: ${elaResult.elaScore.toFixed(3)} | CLIP: ${clipServiceAvailable} ──`
    );

    return NextResponse.json({
      status:             'success',
      node:               rootMongoNode.toObject(),
      tree,               stats,
      processingTime,
      discoveredCount:    analyzedImages.length,
      visionSearchFailed,
      visionError:        visionSearchFailed ? visionErrorMessage : undefined,
      unrelatedImages:    graph.unrelated.map((img) => ({
        url:           img.url,
        platform:      img.platform,
        pHashDistance: img.pHashDistance,
      })),
    });

  } catch (error: unknown) {
    console.error('[Phase04] Pipeline error:', error);
    if (error instanceof InvalidUrlError)   return NextResponse.json({ error: error.message, code: 'INVALID_URL' },     { status: 400 });
    if (error instanceof FileTooLargeError) return NextResponse.json({ error: error.message, code: 'FILE_TOO_LARGE' }, { status: 413 });
    if (error instanceof NotAnImageError)   return NextResponse.json({ error: error.message, code: 'NOT_AN_IMAGE' },   { status: 422 });
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
