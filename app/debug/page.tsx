'use client';

import { useEffect, useState } from 'react';

export default function DebugPage() {
  const [debugInfo, setDebugInfo] = useState<any>({
      version: '0.1.0',
      env: process.env.NODE_ENV,
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      screen: typeof window !== 'undefined' ? `${window.innerWidth} x ${window.innerHeight}` : '',
      online: typeof navigator !== 'undefined' ? (navigator.onLine ? 'Online' : 'Offline') : 'Unknown',
    });

  useEffect(() => {
    // Lazy-load and initialize Eruda
    import('eruda').then(({ default: eruda }) => {
      if (!eruda._isInit) {
        eruda.init();
      }
      eruda.show('console');
    });

    return () => {
      // We don't destroy Eruda here as it handles itself well
    };
  }, []);

  if (!debugInfo) return null;

  return (
    <div className="p-8 font-mono min-h-screen bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100">
      <h1 className="text-2xl font-bold mb-6">Plack AI Debug Environment</h1>
      <div className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700">
        <h2 className="text-lg font-semibold mb-4">System Information</h2>
        <ul className="space-y-3">
          {Object.entries(debugInfo).map(([key, value]) => (
            <li key={key} className="flex gap-4">
              <span className="font-bold text-neutral-500 dark:text-neutral-400 w-32 capitalize">
                {key}:
              </span>
              <span className="text-neutral-900 dark:text-neutral-100">
                {String(value)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-8 text-sm text-neutral-500 dark:text-neutral-400">
        Eruda console is initialized and active. Check the floating button to inspect logs, network, and errors.
      </p>
    </div>
  );
}
