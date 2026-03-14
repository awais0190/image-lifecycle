import type { ReactNode } from 'react';

export default function LandingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: '#0d1117' }}>
      {children}
    </div>
  );
}
