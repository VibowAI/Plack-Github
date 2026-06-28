'use client';

import React from 'react';
import { useAppContext } from '@/context/AppContext';
import Auth from '@/components/Auth';
import { usePathname } from 'next/navigation';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAppContext();
  const pathname = usePathname();

  // If we're loading session state, show nothing or a loader
  if (isLoading) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // If there is no session, show the Auth component
  if (!session) {
    return (
      <div className="flex h-[100dvh] w-full relative">
        <Auth />
      </div>
    );
  }

  return <>{children}</>;
}
