'use client';

/**
 * Sidebar — currently a layout placeholder.
 *
 * TODO: populate with recent analysis history, filter controls, node search.
 */

import { LayoutDashboard, History, Settings } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';

const SIDEBAR_ITEMS = [
  { href: '/',        label: 'Dashboard', icon: LayoutDashboard },
  { href: '/history', label: 'History',   icon: History },
  { href: '/settings',label: 'Settings',  icon: Settings },
] as const;

interface SidebarProps {
  className?: string;
}

export default function Sidebar({ className }: SidebarProps) {
  return (
    <aside
      className={cn('flex h-full w-56 flex-col gap-1 p-3', className)}
      style={{ background: '#16213e', borderRight: '1px solid #2d3748' }}
    >
      {SIDEBAR_ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-white/5"
          style={{ color: '#8892a4' }}
        >
          <Icon size={15} className="shrink-0" />
          {label}
        </Link>
      ))}
    </aside>
  );
}
