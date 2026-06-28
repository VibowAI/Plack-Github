'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';

declare global {
  interface Window {
    eruda: any;
  }
}

export default function DebugPage() {
  const router = useRouter();

  useEffect(() => {
    let script: HTMLScriptElement;
    
    // Load eruda dynamically to avoid affecting production global scope
    if (!window.eruda) {
      script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/eruda';
      script.async = true;
      script.onload = () => {
        if (window.eruda) {
          window.eruda.init({
            defaults: {
              displaySize: 50,
              transparency: 1,
              theme: 'Dark'
            }
          });
          window.eruda.show('console');
        }
      };
      document.body.appendChild(script);
    } else {
      window.eruda.init();
      window.eruda.show('console');
    }

    return () => {
      // Cleanup eruda when leaving debug page
      if (window.eruda) {
        window.eruda.destroy();
      }
      if (script && document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#020204] text-neutral-100 p-8 font-sans">
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold mb-4">Developer Debug Environment</h1>
        <p className="text-neutral-400 mb-6">
          Eruda has been dynamically injected into this page. It will be removed automatically when you leave.
        </p>
        <button
          onClick={() => router.push('/')}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-medium transition-colors"
        >
          Return to Workspace
        </button>
      </div>
    </div>
  );
}
