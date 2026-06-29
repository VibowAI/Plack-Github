'use client';

import React from 'react';
import Sidebar from '@/components/Sidebar';
import ConnectionsView from '@/components/ConnectionsView';
import AuthGuard from '@/components/AuthGuard';
import { useAppContext } from '@/context/AppContext';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ConnectionsPage() {
  const { 
    theme, 
    isSidebarOpen, 
    sidebarWidth, 
    isMobile,
    session
  } = useAppContext();
  
  const router = useRouter();
  const supabase = createClient();
  
  const [zoomEmail, setZoomEmail] = useState<string | null>(null);

  const fetchConnections = async () => {
    if (!session?.user?.id) return;
    const { data, error } = await supabase
      .from('connections')
      .select('*')
      .eq('user_id', session.user.id);
      
    if (!error && data) {
      const zoom = data.find(c => c.provider === 'zoom');
      if (zoom) {
        setZoomEmail(zoom.account_email || zoom.email);
      } else {
        setZoomEmail(null);
      }
    }
  };

  // Fetch connections status
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchConnections();
  }, [session, supabase]);

  // Listen for message from Zoom callback popup
  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'ZOOM_CONNECTED') {
        if (event.data.success) {
          fetchConnections();
        }
      }
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [session, supabase]);

  const handleConnectZoom = async () => {
    if (!session?.user?.id) return;
    
    try {
      const headers: Record<string, string> = {
        'Accept': 'application/json'
      };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      
      const urlWithParams = `/api/auth/zoom?userId=${session.user.id}`;
      const res = await fetch(urlWithParams, { headers });
      if (!res.ok) {
        throw new Error(`Failed to initiate Zoom authentication: ${await res.text()}`);
      }
      
      const data = await res.json() as any;
      if (!data.url) {
        throw new Error('OAuth URL not returned from server');
      }
      
      // Open Zoom OAuth provider's URL in a popup
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.innerWidth - width) / 2;
      const top = window.screenY + (window.innerHeight - height) / 2;
      
      const popup = window.open(
        data.url,
        'Connect Zoom',
        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
      );
      
      if (!popup) {
        // Popup was blocked, fallback to direct redirect
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('[ZOOM] Failed to initiate Zoom auth via API route:', err);
      // Fallback: direct browser navigation (relying on session cookie / userId query param)
      window.location.href = `/api/auth/zoom?userId=${session.user.id}`;
    }
  };

  const handleDisconnectZoom = async () => {
    if (!session?.user?.id) return;
    const { error } = await supabase
      .from('connections')
      .delete()
      .eq('user_id', session.user.id)
      .eq('provider', 'zoom');
      
    if (!error) setZoomEmail(null);
  };

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        
        <main className="flex-1 relative overflow-hidden">
          <ConnectionsView
            theme={theme}
            zoomEmail={zoomEmail}
            onConnectZoom={handleConnectZoom}
            onDisconnectZoom={handleDisconnectZoom}
            onClose={() => router.push('/')}
            isSidebarOpen={isSidebarOpen}
            sidebarWidth={sidebarWidth}
            isMobile={isMobile}
          />
        </main>
      </div>
    </AuthGuard>
  );
}
