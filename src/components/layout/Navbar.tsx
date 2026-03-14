'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ScanSearch, LayoutDashboard, GitCompareArrows, Layers, Clock, Info } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const NAV_LINKS = [
  { href: '/analyze', label: 'Analyzer', icon: LayoutDashboard },
  { href: '/compare', label: 'Compare',  icon: GitCompareArrows },
  { href: '/batch',   label: 'Batch',    icon: Layers },
  { href: '/history', label: 'History',  icon: Clock },
  { href: '/about',   label: 'About',    icon: Info },
] as const;

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header
      className="sticky top-0 z-50 w-full"
      style={{
        background: 'rgba(13,17,23,0.9)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid #30363d',
      }}
    >
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-4 lg:px-6">

        {/* ── Logo ─────────────────────────────────────────── */}
        <Link href="/" className="flex items-center gap-2.5 select-none group">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200 group-hover:scale-105"
            style={{ background: 'rgba(30,132,73,0.15)', border: '1px solid rgba(30,132,73,0.35)' }}
          >
            <ScanSearch size={16} style={{ color: '#3fb950' }} />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-bold tracking-tight" style={{ color: '#e6edf3' }}>
              Image<span style={{ color: '#3fb950' }}>Trace</span>
            </span>
            <span
              className="hidden text-xs font-normal lg:inline-block"
              style={{ color: '#484f58' }}
            >
              / forensic provenance
            </span>
          </div>
        </Link>

        {/* ── Status badge ─────────────────────────────────── */}
        <div className="hidden items-center gap-1.5 sm:flex">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: '#3fb950', boxShadow: '0 0 6px #3fb950' }}
          />
          <span className="text-xs" style={{ color: '#8b949e' }}>Phase 05</span>
        </div>

        {/* ── Nav links ─────────────────────────────────────── */}
        <nav className="flex items-center gap-0.5">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-150',
                  isActive ? '' : 'hover:bg-white/5'
                )}
                style={{
                  color:      isActive ? '#3fb950' : '#8b949e',
                  background: isActive ? 'rgba(63,185,80,0.1)' : undefined,
                }}
              >
                <Icon size={13} className="shrink-0" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
