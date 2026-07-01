'use client';

import React from 'react';

const ChatInterface = React.lazy(() => import('@/components/ChatInterface'));

export default function Page() {
  return (
    <React.Suspense fallback={<div className="h-screen w-screen flex items-center justify-center bg-black text-white">Loading...</div>}>
      <ChatInterface />
    </React.Suspense>
  );
}
