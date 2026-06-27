'use client';

import React from 'react';
import Sidebar from '@/components/Sidebar';
import ConnectionsView from '@/components/ConnectionsView';
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

  // Fetch connections status
  useEffect(() => {
    if (!session?.user?.id) return;
    
    const fetchConnections = async () => {
      const { data, error } = await supabase
        .from('connections')
        .select('*')
        .eq('user_id', session.user.id);
        
      if (!error && data) {
        const zoom = data.find(c => c.provider === 'zoom');
        if (zoom) setZoomEmail(zoom.email);
      }
    };
    
    fetchConnections();
  }, [session, supabase]);

  const handleConnectZoom = () => {
    // Zoom OAuth logic
    window.location.href = `/api/zoom/auth?userId=${session?.user?.id}`;
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
  );
}
