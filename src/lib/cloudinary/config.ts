// ─────────────────────────────────────────────────────────────────────────────
// Cloudinary — SDK initialisation
//
// Import this module in any server-side code that needs the v2 SDK.
// Never import on the client — the API secret must stay server-side only.
// ─────────────────────────────────────────────────────────────────────────────

import { v2 as cloudinary } from 'cloudinary';

const cloudName  = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey     = process.env.CLOUDINARY_API_KEY;
const apiSecret  = process.env.CLOUDINARY_API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
  // Warn in development; throw in production to surface config errors fast.
  const msg =
    'Cloudinary env vars are missing. Set CLOUDINARY_CLOUD_NAME, ' +
    'CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env.local';

  if (process.env.NODE_ENV === 'production') {
    throw new Error(msg);
  } else {
    console.warn('[Cloudinary]', msg);
  }
}

cloudinary.config({
  cloud_name: cloudName,
  api_key:    apiKey,
  api_secret: apiSecret,
  secure:     true,   // always use https URLs
});

export { cloudinary };
export default cloudinary;
