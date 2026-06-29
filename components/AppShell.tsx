'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import ZoomNotification from '@/components/ZoomNotification';
import { useAppContext } from '@/context/AppContext';
import Auth from '@/components/Auth';
import { cn } from '@/lib/utils';
import { useRouter, usePathname } from 'next/navigation';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { 
    session, 
    user, 
    chats, 
    theme, 
    isSidebarOpen, 
    setIsSidebarOpen, 
    activeChatId, 
    onNewChat, 
    onSelectChat, 
    onRenameChat, 
    onDeleteChat, 
    onTogglePinChat,
    sidebarWidth,
    setSidebarWidth,
    isMobile
  } = useAppContext();

  const router = useRouter();
  const pathname = usePathname();

  if (!session) {
    return <Auth />;
  }

  return (
    <div className={cn(
      "flex h-[100dvh] w-full overflow-hidden transition-colors duration-300",
      theme === 'light' ? "bg-white text-neutral-900" : 
      theme === 'cosmic' ? "bg-[#04020a] text-indigo-50" : 
      "bg-[#0a0a0a] text-neutral-100"
    )}>
      <Sidebar 
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        activeChatId={activeChatId}
        onSelectChat={onSelectChat}
        onNewChat={onNewChat}
        chats={chats}
        onRenameChat={onRenameChat}
        onDeleteChat={onDeleteChat}
        onTogglePinChat={onTogglePinChat}
        theme={theme}
        user={user}
        width={sidebarWidth}
        onWidthChange={setSidebarWidth}
        onOpenConnections={() => router.push('/connections')}
      />

      <ZoomNotification theme={theme} />
      
      <main 
        className={cn(
          "flex-1 relative flex flex-col min-w-0 transition-all duration-300 ease-out h-full",
          isSidebarOpen && !isMobile ? `pl-4` : "pl-0"
        )}
        style={{
          marginLeft: isSidebarOpen && !isMobile ? `${sidebarWidth}px` : '0px'
        }}
      >
        {children}
      </main>
    </div>
  );
}
