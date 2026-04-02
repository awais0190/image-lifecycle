import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['sharp', 'exifr'],

  images: {
    remotePatterns: [
      // Cloudinary — all subdomains (res.cloudinary.com, etc.)
      { protocol: 'https', hostname: '**.cloudinary.com' },
      // Common image CDNs that may appear in discovered images
      { protocol: 'https', hostname: '**.imgur.com' },
      { protocol: 'https', hostname: '**.twimg.com' },
      { protocol: 'https', hostname: '**.fbcdn.net' },
    ],
  },
};

export default nextConfig;
