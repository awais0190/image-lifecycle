import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility: merge Tailwind class names safely.
 * Combines clsx (conditional classes) with tailwind-merge (conflict resolution).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
