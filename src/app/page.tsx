/**
 * Root route — redirect to dashboard.
 *
 * NOTE: The actual dashboard lives in app/(dashboard)/page.tsx.
 * This file exists only to satisfy the App Router; in practice Next.js
 * resolves (dashboard)/page.tsx at "/" because route groups don't add URL
 * segments. If you see a conflict, delete this file.
 */
export { default } from './(dashboard)/page';
