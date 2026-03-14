/**
 * Central environment configuration.
 * All process.env accesses go through here — never scattered in application code.
 */
export const config = {
  mongodb: {
    uri: process.env.MONGODB_URI ?? '',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
    apiKey: process.env.CLOUDINARY_API_KEY ?? '',
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
  },
  googleVision: {
    apiKey: process.env.GOOGLE_VISION_API_KEY ?? '',
  },
  clip: {
    serviceUrl: process.env.CLIP_SERVICE_URL ?? null,
  },
  app: {
    url: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    maxDiscoveredImages: Number(process.env.NEXT_PUBLIC_MAX_DISCOVERED_IMAGES ?? '15'),
  },
} as const;
