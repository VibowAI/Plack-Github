import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Search, ChevronRight, CheckCircle2, Video, BookOpen, MessageSquare, Github } from 'lucide-react';
import { cn } from '@/lib/utils';
import ZoomWorkspace from './ZoomWorkspace';

export interface ConnectionsViewProps {
  theme: 'light' | 'dark' | 'cosmic';
  zoomEmail: string | null;
  onConnectZoom: () => void;
  onDisconnectZoom: () => void;
  onClose: () => void;
  isSidebarOpen?: boolean;
  sidebarWidth?: number;
  isMobile?: boolean;
}

export default function ConnectionsView({
  theme,
  zoomEmail,
  onConnectZoom,
  onDisconnectZoom,
  onClose,
  isSidebarOpen,
  sidebarWidth = 280,
  isMobile
}: ConnectionsViewProps) {
  const apps = [
    {
      id: 'zoom',
      name: 'Zoom',
      description: 'Native AI meeting capability for Plack AI.',
      icon: <Video size={24} className="text-blue-500" />,
      color: 'bg-blue-500/10 border-blue-500/15',
      connected: !!zoomEmail,
      email: zoomEmail,
      label: 'Video Conferencing'
    }
  ];

  return (
    <div 
      className={cn(
        "flex-1 flex flex-col min-h-0 font-sans relative z-10 transition-colors duration-300 overflow-x-hidden",
        theme === 'light' ? "bg-[#fcfcfc] text-neutral-800" :
        theme === 'cosmic' ? "bg-[#04020a] text-indigo-50" :
        "bg-[#060606] text-neutral-100"
      )}
    >
      <header className={cn(
        "flex-none h-[80px] px-6 md:px-10 flex items-center justify-between border-b backdrop-blur-md sticky top-0 z-20 transition-colors",
        theme === 'light' ? "border-neutral-200/60 bg-white/70" :
        theme === 'cosmic' ? "border-indigo-500/10 bg-[#09051c]/60" :
        "border-neutral-800/60 bg-[#0a0a0a]/70"
      )}>
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight leading-none mb-1.5">Connections</h1>
          <p className="text-[13.5px] opacity-60 font-medium">Manage your external AI capabilities.</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 md:px-10 py-10 w-full">
        <div className="max-w-4xl mx-auto">
          {apps.map((app) => (
            <div
              key={app.id}
              className={cn(
                "p-8 rounded-[32px] border transition-all duration-300",
                theme === 'light' ? "bg-white border-neutral-200 shadow-sm" : "bg-neutral-900 border-neutral-800 shadow-xl"
              )}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-5">
                  <div className={cn(
                    "w-16 h-16 rounded-2xl flex items-center justify-center border",
                    app.color
                  )}>
                    {app.icon}
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold tracking-tight">{app.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      {app.connected ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-[14px] font-bold text-emerald-500 uppercase tracking-wider">Connected</span>
                        </>
                      ) : (
                        <span className="text-[14px] font-bold text-neutral-400 uppercase tracking-wider italic">Not Connected</span>
                      )}
                    </div>
                  </div>
                </div>
                
                {app.connected ? (
                  <div className="flex items-center gap-6">
                    <div className="text-right hidden md:block">
                      <p className={cn(
                        "text-[14px] font-bold truncate leading-tight",
                        theme === 'light' ? "text-neutral-900" : "text-neutral-100"
                      )}>
                        {app.email}
                      </p>
                      <p className="text-[12px] font-medium opacity-50">Authenticated session</p>
                    </div>
                    <button
                      onClick={onDisconnectZoom}
                      className="px-6 py-2.5 rounded-xl bg-red-500/10 text-red-500 text-[14px] font-bold hover:bg-red-500/20 transition-all active:scale-95 cursor-pointer"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={onConnectZoom}
                    className={cn(
                      "px-8 py-3 rounded-2xl text-[15px] font-bold transition-all active:scale-95 shadow-lg cursor-pointer",
                      theme === 'light' ? "bg-neutral-950 text-white hover:bg-neutral-850" : "bg-white text-black hover:bg-neutral-200"
                    )}
                  >
                    Connect {app.name}
                  </button>
                )}
              </div>

              {app.connected && (
                <div className={cn(
                  "mt-8 pt-8 border-t",
                  theme === 'light' ? "border-neutral-100" : "border-neutral-800"
                )}>
                  <p className="text-[14px] text-neutral-500 dark:text-neutral-400 leading-relaxed font-medium">
                    Zoom is now integrated as a native AI capability. You can ask Plack AI to view your meetings, summarize recordings, and analyze discussions directly in any chat.
                  </p>
                </div>
              )}
            </div>
          ))}
          
          <div className="mt-12">
             <p className="text-center text-[13px] opacity-40 font-medium">More native capabilities coming soon.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

