import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets:  ['latin'],
  variable: '--font-inter',
  display:  'swap',
});

export const metadata: Metadata = {
  title:       'ImageTrace — Life Cycle of an Image',
  description: 'Trace the provenance and lifecycle of any image across the web. Detect edits, find origins, and visualize the propagation graph.',
  keywords:    ['image provenance', 'forensics', 'ELA', 'perceptual hash', 'CLIP'],
  authors:     [{ name: 'ImageTrace' }],
};

export const viewport: Viewport = {
  themeColor: '#1a1a2e',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
