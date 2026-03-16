'use client';

/**
 * ErrorBoundary — 
 * Class-based React error boundary for wrapping UI sections.
 * Shows a friendly fallback card instead of a white-screen crash.
 */

import { Component, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
  children:  ReactNode;
  /** Optional custom fallback UI */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  message:  string;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred';
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }) {
    console.error('[ErrorBoundary] Component crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          className="flex flex-col items-center gap-3 rounded-xl p-6 text-center"
          style={{ background: '#1c1418', border: '1px solid rgba(248,81,73,0.2)' }}
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.2)' }}
          >
            <AlertCircle size={18} style={{ color: '#f85149' }} />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium" style={{ color: '#e6edf3' }}>
              Something went wrong displaying this section
            </p>
            <p className="text-xs" style={{ color: '#8b949e' }}>
              Try uploading the image again.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
