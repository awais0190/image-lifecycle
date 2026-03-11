import type { ReactNode } from 'react';
import Navbar from '@/components/layout/Navbar';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col" style={{ background: '#0d1117' }}>
      <Navbar />
      <main className="flex flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
