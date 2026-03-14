// ─────────────────────────────────────────────────────────────────────────────
// ImageNode — Mongoose model
//
// Central document that represents one image in the provenance graph.
// Each node knows its parent hash (null = root) and the hashes of its
// children, forming a directed tree that React Flow will render in Phase 03.
// ─────────────────────────────────────────────────────────────────────────────

import mongoose, {
  Document,
  Model,
  Schema,
  CallbackError,
} from 'mongoose';
import type { TreeNode } from '@/types/image';

// ─── Sub-document schemas ─────────────────────────────────────────────────────

const GpsSchema = new Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { _id: false }
);

const MetadataSchema = new Schema(
  {
    width:       { type: Number, required: true },
    height:      { type: Number, required: true },
    format:      { type: String, required: true },
    fileSize:    { type: Number, required: true },
    dateCreated: { type: String },
    camera:      { type: String },
    software:    { type: String },
    gps:         { type: GpsSchema },
  },
  { _id: false }
);

// Phase 04: sub-document for a single edit signal
const EditSignalSchema = new Schema(
  {
    score:  { type: Number, required: true },
    weight: { type: Number, required: true },
    reason: { type: String, required: true },
  },
  { _id: false }
);

const ForensicsSchema = new Schema(
  {
    isEdited:        { type: Boolean, required: true, default: false },
    editingSoftware: { type: String },
    elaScore:        { type: Number, required: true, default: 0 },
    elaHeatmapUrl:   { type: String },
    confidence:      { type: Number, required: true, default: 0 },
    // Phase 04 additions
    editProbability: { type: Number, default: null },
    editVerdict:     { type: String, enum: ['original', 'edited', 'uncertain', null], default: null },
    signals: {
      type: new Schema(
        {
          exif: { type: EditSignalSchema },
          ela:  { type: EditSignalSchema },
          clip: { type: EditSignalSchema, default: null },
        },
        { _id: false }
      ),
      default: null,
    },
  },
  { _id: false }
);

const SourceSchema = new Schema(
  {
    url:       { type: String, required: true },
    foundAt:   { type: String, required: true },
    platform:  { type: String },
  },
  { _id: false }
);

// ─── Main document interface ─────────────────────────────────────────────────

export interface IImageNode extends Document {
  // Fingerprints
  hash:              string;   // perceptual hash (pHash)
  cryptoHash:        string;   // SHA-256

  // Embedding (Phase 02)
  clipEmbedding:     number[];

  // Storage
  cloudinaryUrl:     string;
  cloudinaryPublicId: string;

  // Descriptive data
  metadata:   (typeof MetadataSchema)['obj'];
  forensics:  (typeof ForensicsSchema)['obj'];
  sources:    (typeof SourceSchema)['obj'][];

  // Tree position
  parentHash: string | null;
  children:   string[];
  depth:      number;

  uploadedAt: Date;

  // Instance method
  toTreeNode(): TreeNode;
}

/** Statics added to the model class */
export interface IImageNodeModel extends Model<IImageNode> {
  findByHashOrCreate(
    hash: string,
    defaults: Partial<IImageNode>
  ): Promise<IImageNode>;
}

// ─── Main schema ─────────────────────────────────────────────────────────────

const ImageNodeSchema = new Schema<IImageNode, IImageNodeModel>(
  {
    hash: {
      type:     String,
      required: true,
      unique:   true,
      index:    true,
    },
    cryptoHash: {
      type:     String,
      required: true,
    },
    clipEmbedding: {
      type:    [Number],
      default: [],
      // Phase 02: populated by CLIP microservice
    },
    cloudinaryUrl: {
      type:     String,
      required: true,
    },
    cloudinaryPublicId: {
      type:     String,
      required: true,
    },
    metadata:  { type: MetadataSchema,  required: true },
    forensics: { type: ForensicsSchema, required: true },
    sources:   { type: [SourceSchema],  default: [] },

    parentHash: { type: String, default: null },
    children:   { type: [String], default: [] },
    depth:      { type: Number,  required: true, default: 0 },

    uploadedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    collection: 'image_nodes',
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Compound index used for paginated history queries
ImageNodeSchema.index({ hash: 1, uploadedAt: -1 });
// For tree traversal: "find all children of this hash"
ImageNodeSchema.index({ parentHash: 1 });
// SHA-256 lookups (detect exact byte-for-byte duplicates quickly)
ImageNodeSchema.index({ cryptoHash: 1 });

// ─── Instance methods ─────────────────────────────────────────────────────────

/**
 * Converts this MongoDB document to a React Flow-compatible TreeNode shape.
 * Phase 03: position (x, y) will be computed by the layout algorithm.
 */
ImageNodeSchema.methods.toTreeNode = function (this: IImageNode): TreeNode {
  return {
    id:       this.hash,
    type:     'imageNode',
    position: { x: 0, y: 0 }, // TODO Phase 03: compute via Dagre / ELK layout
    data: {
      label:     this.cloudinaryPublicId,
      imageUrl:  this.cloudinaryUrl,
      status:    this.forensics.isEdited
        ? 'edited'
        : this.depth === 0
          ? 'original'
          : 'uncertain',
      depth:     this.depth,
      metadata:  this.metadata  as unknown as import('@/types/image').ImageMetadata,
      forensics: this.forensics as unknown as import('@/types/image').ForensicsResult,
      isEdited:  (this.forensics.isEdited as unknown) as boolean,
      elaScore:  (this.forensics.elaScore as unknown) as number,
    },
  };
};

// ─── Static methods ───────────────────────────────────────────────────────────

/**
 * Atomically find a document by pHash, or create it with provided defaults.
 * Used during the ingestion pipeline to avoid duplicate insertions.
 *
 * TODO Phase 02: hook this into the analysis route handler.
 */
ImageNodeSchema.statics.findByHashOrCreate = async function (
  hash: string,
  defaults: Partial<IImageNode>
): Promise<IImageNode> {
  const existing = await this.findOne({ hash });
  if (existing) return existing;
  return this.create({ hash, ...defaults });
};

// ─── Model export ─────────────────────────────────────────────────────────────

// Guard against Mongoose model re-registration in Next.js hot-reload
export const ImageNodeModel: IImageNodeModel =
  (mongoose.models.ImageNode as IImageNodeModel) ||
  mongoose.model<IImageNode, IImageNodeModel>('ImageNode', ImageNodeSchema);

export default ImageNodeModel;
