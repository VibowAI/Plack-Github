'use client';

import React from 'react';
import { motion } from 'motion/react';
import { 
  Video, Sparkles, Calendar, CheckCircle2, Users, 
  Activity, ExternalLink, ArrowLeft, Check, LogOut
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ZoomWorkspaceProps {
  theme: 'light' | 'dark' | 'cosmic';
  zoomEmail: string | null;
  onConnect?: () => void;
  onDisconnect: () => void;
  onBackToConnections: () => void;
}

export default function ZoomWorkspace({
  theme,
  zoomEmail,
  onConnect,
  onDisconnect,
  onBackToConnections
}: ZoomWorkspaceProps) {
  const capabilities = [
    {
      title: "Summarize my last meeting",
      description: "Generates an elegant, high-fidelity markdown executive summary detailing primary consensus, milestones, and assigned deliverables instantly.",
      icon: <Sparkles size={20} className="text-amber-500" />
    },
    {
      title: "What decisions were made yesterday?",
      description: "Sifts through all of yesterday's meeting transcripts to surface finalized agreements, strategic pivots, and key outcomes.",
      icon: <CheckCircle2 size={20} className="text-emerald-500" />
    },
    {
      title: "Find meetings with John",
      description: "Locates specific past synced discussions, video files, and historical contexts by parsing transcript details and meeting participant names.",
      icon: <Users size={20} className="text-sky-500" />
    },
    {
      title: "Show upcoming meetings",
      description: "Lists your scheduled calendar slots, agenda overviews, and allows generating pre-meeting briefing notes to keep you ahead.",
      icon: <Calendar size={20} className="text-indigo-500" />
    },
    {
      title: "Analyze recurring meetings",
      description: "Interrogates repeated series for duration fatigue, host patterns, action item backlogs, and overall meeting structure health.",
      icon: <Activity size={20} className="text-rose-500" />
    }
  ];

  return (
    <div 
      className={cn(
        "min-h-screen flex flex-col font-sans relative z-10 transition-colors duration-300 overflow-x-hidden",
        theme === 'light' ? "bg-[#fcfcfc] text-neutral-800" :
        theme === 'cosmic' ? "bg-[#04020a] text-indigo-50" :
        "bg-[#060606] text-neutral-100"
      )}
    >
      {/* Background Glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        {theme === 'cosmic' && (
          <>
            <div className="absolute top-[5%] left-[10%] w-[35rem] h-[35rem] bg-indigo-500/5 blur-[140px] rounded-full mix-blend-screen animate-pulse duration-[6000ms]" />
            <div className="absolute bottom-[10%] right-[5%] w-[30rem] h-[30rem] bg-rose-500/5 blur-[120px] rounded-full mix-blend-screen animate-pulse duration-[8000ms]" />
          </>
        )}
        {theme === 'dark' && (
          <div className="absolute top-1/6 left-1/4 w-[50vw] h-[50vw] bg-neutral-900/30 blur-[130px] rounded-full" />
        )}
        {theme === 'light' && (
          <div className="absolute top-0 right-0 w-[45vw] h-[45vh] bg-neutral-100/40 blur-[120px] rounded-bl-full" />
        )}
      </div>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto px-6 md:px-16 py-8 w-full max-w-5xl mx-auto space-y-12">
        
        {/* Top Navigation Breadcrumbs */}
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase opacity-50">
          <button 
            type="button"
            onClick={onBackToConnections}
            className="hover:underline hover:opacity-100 flex items-center gap-1 transition-all cursor-pointer"
          >
            <ArrowLeft size={12} />
            Apps
          </button>
          <span>/</span>
          <span className="opacity-100">Zoom</span>
        </div>

        {/* Profile Card Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-neutral-200/50 dark:border-neutral-800/50">
          <div className="flex items-center gap-5">
            {/* Elegant Large Zoom Logo */}
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-[22px] bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/10 shrink-0">
              <Video size={36} className="text-white" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Zoom</h1>
              <p className="text-[14.5px] font-medium opacity-60">Smart meeting intelligence from Zoom.</p>
            </div>
          </div>

          {/* Action Trigger */}
          <div className="flex flex-col items-end gap-1.5 shrink-0 w-full md:w-auto mt-4 md:mt-0">
            {zoomEmail ? (
              <div className="flex flex-row md:flex-col items-center md:items-end justify-between w-full md:w-auto gap-4">
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 rounded-full text-xs font-bold shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Connected to {zoomEmail}
                </div>
                <button
                  type="button"
                  onClick={onDisconnect}
                  className="text-xs font-semibold text-red-500 hover:text-red-600 hover:underline flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <LogOut size={13} />
                  Disconnect Account
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onConnect}
                className={cn(
                  "w-full md:w-auto px-6 py-3 rounded-2xl text-[14px] font-bold transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-2",
                  theme === 'light' ? "bg-neutral-950 text-white hover:bg-neutral-850" : "bg-white text-black hover:bg-neutral-100"
                )}
              >
                Connect Zoom
              </button>
            )}
          </div>
        </div>

        {/* Hero: Horizontally Scrollable Preview Cards */}
        <div className="space-y-4">
          <h2 className="text-xs font-bold tracking-widest uppercase opacity-40">Sample Capabilities</h2>
          
          <div 
            className="flex gap-4 overflow-x-auto pb-4 pt-1 snap-x snap-mandatory scrollbar-none" 
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {capabilities.map((cap, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                className={cn(
                  "snap-start min-w-[280px] md:min-w-[320px] w-[280px] md:w-[320px] p-6 rounded-[24px] border flex flex-col justify-between shrink-0 transition-all",
                  theme === 'light' ? "bg-white border-neutral-200/80 hover:shadow-md" :
                  theme === 'cosmic' ? "bg-indigo-950/20 border-indigo-500/15 hover:border-indigo-500/30" :
                  "bg-neutral-900/30 border-neutral-850 hover:border-neutral-800"
                )}
              >
                <div className="space-y-4">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shadow-sm",
                    theme === 'light' ? "bg-neutral-50 border border-neutral-200/60" : "bg-neutral-900/60 border border-neutral-800"
                  )}>
                    {cap.icon}
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-bold tracking-tight">{cap.title}</h3>
                    <p className="text-xs leading-relaxed opacity-60 font-medium">{cap.description}</p>
                  </div>
                </div>
                
                <div className="mt-6 pt-3 border-t border-neutral-100/50 dark:border-neutral-800/40 flex items-center text-[10.5px] font-bold opacity-30">
                  EXAMPLE CONVERSATION PROMPT
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Description Section */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pt-4">
          <div className="md:col-span-8 space-y-4">
            <h2 className="text-xs font-bold tracking-widest uppercase opacity-40">Integration Overview</h2>
            <div className="prose prose-neutral dark:prose-invert max-w-none">
              <p className="text-[15.5px] leading-relaxed opacity-85 font-normal">
                Bring Zoom meeting intelligence directly into Plack AI. Instantly summarize meetings, analyze discussions, review recordings, understand action items, search transcripts, and answer questions about your meetings using natural language.
              </p>
              <p className="text-[14.5px] leading-relaxed opacity-60 font-normal mt-3">
                No complex dashboards or confusing workflows are required. Once the connection is authorized, Plack AI works ambiently in the background, drawing upon Zoom API capabilities whenever you ask relevant questions or commands in the main chat.
              </p>
            </div>
          </div>

          {/* Simple Information Table */}
          <div className="md:col-span-4 space-y-4">
            <h2 className="text-xs font-bold tracking-widest uppercase opacity-40">Integration Specifications</h2>
            <div className={cn(
              "rounded-2xl border overflow-hidden text-xs font-medium",
              theme === 'light' ? "border-neutral-200/80 bg-white" : "border-neutral-850 bg-neutral-950/20"
            )}>
              <div className="divide-y divide-neutral-200/60 dark:divide-neutral-800/40">
                <div className="px-4 py-3.5 flex justify-between gap-2">
                  <span className="opacity-40">Category</span>
                  <span className="text-right">Collaboration</span>
                </div>
                <div className="px-4 py-3.5 flex justify-between gap-2 items-start">
                  <span className="opacity-40">Capabilities</span>
                  <div className="flex flex-col items-end gap-1 text-right leading-tight max-w-[180px]">
                    <span>Meeting summaries</span>
                    <span>Meeting analysis</span>
                    <span>Meeting search</span>
                    <span>Meeting scheduling</span>
                    <span>Recording insights</span>
                    <span>Natural language interaction</span>
                  </div>
                </div>
                <div className="px-4 py-3.5 flex justify-between gap-2">
                  <span className="opacity-40">Website</span>
                  <a 
                    href="https://zoom.us" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline flex items-center gap-1 inline-flex cursor-pointer"
                  >
                    Zoom
                    <ExternalLink size={10} />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
