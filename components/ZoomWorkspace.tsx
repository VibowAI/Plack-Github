'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Video, Sparkles, Calendar, CheckCircle2, Users, 
  Activity, ExternalLink, ArrowLeft, Check, LogOut,
  Search, RefreshCcw, Play, FileText, Info, 
  Clock, MapPin, MoreHorizontal, MessageSquare,
  ShieldCheck, Zap, Layers, Globe, X
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ZoomWorkspaceProps {
  theme: 'light' | 'dark' | 'cosmic';
  zoomEmail: string | null;
  onConnect?: () => void;
  onDisconnect: () => void;
  onBackToConnections: () => void;
}

interface ZoomMeeting {
  id: string;
  topic: string;
  start_time: string;
  duration: number;
  timezone: string;
  join_url: string;
  host_email: string;
  type: number;
}

interface ZoomRecording {
  id: string;
  topic: string;
  start_time: string;
  duration: number;
  total_size: number;
  recording_count: number;
  meeting_id: string;
  share_url: string;
}

export default function ZoomWorkspace({
  theme,
  zoomEmail,
  onConnect,
  onDisconnect,
  onBackToConnections
}: ZoomWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'recordings' | 'intelligence'>('upcoming');
  const [search, setSearch] = useState('');
  const [meetings, setMeetings] = useState<ZoomMeeting[]>([]);
  const [recordings, setRecordings] = useState<ZoomRecording[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<{ id: string, text: string } | null>(null);
  const [activeMeeting, setActiveMeeting] = useState<ZoomMeeting | null>(null);

  const fetchZoomData = async () => {
    if (!zoomEmail) return;
    setLoading(true);
    try {
      const [meetingsRes, recordingsRes] = await Promise.all([
        fetch('/api/zoom/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'list' })
        }),
        fetch('/api/zoom/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'recordings' })
        })
      ]);

      const meetingsData = await meetingsRes.json();
      const recordingsData = await recordingsRes.json();

      if (meetingsData.success) setMeetings(meetingsData.meetings || []);
      if (recordingsData.success) setRecordings(recordingsData.recordings || []);
    } catch (error) {
      console.error('Failed to fetch Zoom data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Avoid calling setState synchronously within the effect body
    const timer = setTimeout(() => {
      fetchZoomData();
    }, 0);
    return () => clearTimeout(timer);
  }, [zoomEmail]);

  const handleSync = async () => {
    setSyncing(true);
    await fetchZoomData();
    setTimeout(() => setSyncing(false), 1000);
  };

  const handleAnalyze = async (meeting: ZoomMeeting | ZoomRecording) => {
    setAnalysisLoading(meeting.id);
    try {
      const res = await fetch('/api/zoom/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'ai_analyze', 
          meetingId: meeting.id,
          topic: meeting.topic,
          startTime: meeting.start_time,
          duration: meeting.duration
        })
      });
      const data = await res.json();
      if (data.success) {
        setAnalysisResult({ id: meeting.id, text: data.analysis });
        setActiveTab('intelligence');
      }
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setAnalysisLoading(null);
    }
  };

  const filteredMeetings = useMemo(() => {
    return meetings.filter(m => m.topic.toLowerCase().includes(search.toLowerCase()));
  }, [meetings, search]);

  const filteredRecordings = useMemo(() => {
    return recordings.filter(r => r.topic.toLowerCase().includes(search.toLowerCase()));
  }, [recordings, search]);

  const capabilities = [
    {
      title: "Meeting Intelligence",
      description: "Generates high-fidelity summaries detailing consensus, milestones, and deliverables instantly.",
      icon: <Sparkles size={22} className="text-amber-500" />,
      color: "from-amber-500/20 to-orange-500/20"
    },
    {
      title: "Cloud Recordings",
      description: "Access and analyze your cloud meeting video assets with full transcript searchability.",
      icon: <Layers size={22} className="text-sky-500" />,
      color: "from-sky-500/20 to-blue-500/20"
    },
    {
      title: "Natural Language Scheduling",
      description: "Schedule, reschedule, or cancel Zoom meetings naturally inside the main Plack AI chat interface.",
      icon: <Calendar size={22} className="text-emerald-500" />,
      color: "from-emerald-500/20 to-teal-500/20"
    },
    {
      title: "Real-time Analytics",
      description: "Track participant engagement, speaking time density, and meeting effectiveness metrics.",
      icon: <Activity size={22} className="text-rose-500" />,
      color: "from-rose-500/20 to-pink-500/20"
    },
    {
      title: "Search & Retrieval",
      description: "Locate specific past discussions by parsing meeting transcripts and participant metadata.",
      icon: <Search size={22} className="text-indigo-500" />,
      color: "from-indigo-500/20 to-purple-500/20"
    }
  ];

  return (
    <div 
      className={cn(
        "h-full flex flex-col font-sans relative z-10 transition-colors duration-300 overflow-hidden",
        theme === 'light' ? "bg-[#fcfcfc] text-neutral-800" :
        theme === 'cosmic' ? "bg-[#04020a] text-indigo-50" :
        "bg-[#060606] text-neutral-100"
      )}
    >
      {/* Sticky Header */}
      <header className={cn(
        "flex-none h-[70px] px-6 md:px-10 flex items-center justify-between border-b backdrop-blur-md sticky top-0 z-20 transition-colors",
        theme === 'light' ? "border-neutral-200/60 bg-white/70" :
        theme === 'cosmic' ? "border-indigo-500/10 bg-[#09051c]/60" :
        "border-neutral-800/60 bg-[#0a0a0a]/70"
      )}>
        <div className="flex items-center gap-4">
          <button 
            type="button"
            onClick={onBackToConnections}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-neutral-500/10 transition-colors cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Video size={18} className="text-white" />
            </div>
            <h1 className="text-lg font-bold tracking-tight">Zoom Workspace</h1>
          </div>
        </div>

        {zoomEmail && (
          <div className="hidden sm:flex items-center gap-2.5 px-4 py-1.5 bg-emerald-500/5 border border-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl text-[12px] font-bold shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {zoomEmail}
          </div>
        )}
      </header>

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

      {/* Embedded Meeting Overlay */}
      <AnimatePresence>
        {activeMeeting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black flex flex-col"
          >
            <div className="flex items-center justify-between p-4 bg-neutral-900 border-b border-neutral-800">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
                  <Video size={18} className="text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{activeMeeting.topic}</h3>
                  <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live Embedded Meeting
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setActiveMeeting(null)}
                className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 bg-neutral-950 flex items-center justify-center relative overflow-hidden">
              {/* Mock Zoom Meeting SDK UI */}
              <div className="text-center space-y-6 z-10">
                <div className="w-24 h-24 rounded-full bg-neutral-800 flex items-center justify-center mx-auto mb-4 border border-neutral-700">
                  <Users size={40} className="text-neutral-500" />
                </div>
                <h2 className="text-2xl font-bold text-white">Connecting to Meeting SDK...</h2>
                <p className="text-neutral-500 max-w-sm mx-auto">Initializing encrypted media stream and participant synchronization for {activeMeeting.topic}.</p>
                <div className="flex justify-center gap-4">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" />
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce delay-75" />
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce delay-150" />
                </div>
              </div>

              {/* Decorative Meeting UI elements */}
              <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 p-4 rounded-3xl bg-neutral-900/80 backdrop-blur-xl border border-neutral-800 shadow-2xl">
                <div className="w-12 h-12 rounded-2xl bg-neutral-800 flex items-center justify-center text-white hover:bg-neutral-700 cursor-pointer"><Video size={20} /></div>
                <div className="w-12 h-12 rounded-2xl bg-neutral-800 flex items-center justify-center text-white hover:bg-neutral-700 cursor-pointer"><Users size={20} /></div>
                <div className="w-12 h-12 rounded-2xl bg-neutral-800 flex items-center justify-center text-white hover:bg-neutral-700 cursor-pointer"><MessageSquare size={20} /></div>
                <div className="h-8 w-px bg-neutral-800 mx-2" />
                <div 
                  onClick={() => setActiveMeeting(null)}
                  className="px-6 py-3 rounded-2xl bg-red-500 text-white text-xs font-bold hover:bg-red-600 transition-colors cursor-pointer"
                >
                  Leave Meeting
                </div>
              </div>

              {/* Sidebar: AI During Meeting */}
              <div className="absolute top-10 right-10 bottom-32 w-80 rounded-3xl bg-neutral-900/50 backdrop-blur-md border border-neutral-800 p-6 flex flex-col space-y-6 overflow-y-auto">
                <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-blue-400 uppercase">
                  <Sparkles size={14} />
                  AI Meeting Intelligence
                </div>
                
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 space-y-2">
                    <p className="text-[11px] font-bold text-blue-400 uppercase">Live Notes</p>
                    <p className="text-[13px] text-neutral-300 leading-relaxed italic">&ldquo;Discussing the Q3 roadmap and finalizing the budget allocation for marketing...&rdquo;</p>
                  </div>
                  
                  <div className="space-y-3">
                    <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest">Detected Action Items</p>
                    <div className="space-y-2">
                      <div className="flex gap-3 text-[12px] text-neutral-400">
                        <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                        <span>Send budget sheet to John by EOD</span>
                      </div>
                      <div className="flex gap-3 text-[12px] text-neutral-400">
                        <CheckCircle2 size={14} className="opacity-20 shrink-0 mt-0.5" />
                        <span>Schedule follow-up with Design team</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 md:px-16 py-8 w-full max-w-6xl mx-auto space-y-12 scroll-smooth">
        
        {/* Profile Card Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-8 border-b border-neutral-200/50 dark:border-neutral-800/50">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-[28px] bg-blue-500 flex items-center justify-center shadow-2xl shadow-blue-500/20 shrink-0 transform -rotate-3">
              <Video size={44} className="text-white" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">Zoom</h1>
              <p className="text-[15.5px] font-medium opacity-60">Bring your meetings into Plack AI.</p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2.5 shrink-0 w-full md:w-auto mt-4 md:mt-0">
            {zoomEmail ? (
              <div className="flex flex-col items-end gap-3">
                <div className="flex items-center gap-2.5 px-5 py-2.5 bg-emerald-500/5 border border-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl text-[13px] font-bold shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Connected to {zoomEmail}
                </div>
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleSync}
                    className="text-[12.5px] font-bold opacity-60 hover:opacity-100 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <RefreshCcw size={14} className={cn(syncing && "animate-spin")} />
                    Sync
                  </button>
                  <button
                    onClick={onDisconnect}
                    className="text-[12.5px] font-bold text-red-500 hover:text-red-600 hover:underline flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <LogOut size={14} />
                    Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={onConnect}
                className={cn(
                  "w-full md:w-auto px-8 py-3.5 rounded-[22px] text-[15px] font-bold transition-all shadow-xl active:scale-95 cursor-pointer flex items-center justify-center gap-2.5",
                  theme === 'light' ? "bg-neutral-950 text-white hover:bg-neutral-850" : "bg-white text-black hover:bg-neutral-100"
                )}
              >
                Connect Zoom Account
              </button>
            )}
          </div>
        </div>

        {/* Capability Cards: Premium Product Artwork Style */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold tracking-[0.2em] uppercase opacity-40">Integration Capabilities</h2>
            {!zoomEmail && (
              <div className="flex items-center gap-2 text-[11px] font-bold text-blue-500/80 bg-blue-500/5 px-3 py-1 rounded-full">
                <Sparkles size={12} />
                Connect to Enable
              </div>
            )}
          </div>
          
          <div 
            className="flex gap-6 overflow-x-auto pb-6 pt-1 snap-x snap-mandatory scrollbar-none" 
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {capabilities.map((cap, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.05, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  "snap-start min-w-[300px] md:min-w-[340px] w-[300px] md:w-[340px] aspect-[4/5] p-8 rounded-[32px] border flex flex-col justify-between shrink-0 transition-all group relative overflow-hidden",
                  theme === 'light' ? "bg-white border-neutral-200/80 shadow-sm hover:shadow-xl" :
                  theme === 'cosmic' ? "bg-indigo-950/20 border-indigo-500/10 hover:border-indigo-500/30" :
                  "bg-neutral-900/40 border-neutral-850 hover:border-neutral-700"
                )}
              >
                {/* Decorative Gradient Artwork */}
                <div className={cn(
                  "absolute top-0 right-0 w-48 h-48 blur-3xl opacity-10 rounded-full translate-x-12 -translate-y-12 transition-all duration-700 group-hover:scale-125",
                  cap.color.split(' ')[0]
                )} />

                <div className="space-y-6 relative z-10">
                  <div className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm transform transition-transform group-hover:scale-110 duration-500",
                    theme === 'light' ? "bg-neutral-50 border border-neutral-200/60" : "bg-neutral-800/40 border border-neutral-700/50"
                  )}>
                    {cap.icon}
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-xl font-bold tracking-tight">{cap.title}</h3>
                    <p className="text-[13px] leading-relaxed opacity-60 font-medium">{cap.description}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest opacity-30 uppercase">
                  <Zap size={10} />
                  Native AI Integration
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Search & Action Tabs (Only if connected) */}
        {zoomEmail && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-neutral-200/40 dark:border-neutral-800/30 pb-4">
              <div className="flex items-center gap-1">
                {(['upcoming', 'recordings', 'intelligence'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "px-5 py-2.5 rounded-xl text-[13px] font-bold transition-all relative capitalize",
                      activeTab === tab ? "opacity-100" : "opacity-40 hover:opacity-60"
                    )}
                  >
                    {tab}
                    {activeTab === tab && (
                      <motion.div 
                        layoutId="activeTab"
                        className="absolute bottom-[-17px] left-0 right-0 h-1 bg-blue-500 rounded-full"
                      />
                    )}
                  </button>
                ))}
              </div>

              <div className="relative w-full md:w-72 group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 opacity-30 group-focus-within:opacity-100 transition-opacity" size={16} />
                <input
                  type="text"
                  placeholder="Search Zoom..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={cn(
                    "w-full pl-11 pr-4 py-3 rounded-2xl text-[13.5px] border transition-all focus:ring-2 focus:ring-blue-500/20 outline-none font-medium",
                    theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-900 border-neutral-800"
                  )}
                />
              </div>
            </div>

            {/* Dynamic Content Sections */}
            <div className="min-h-[400px]">
              {activeTab === 'upcoming' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {loading ? (
                    Array(3).fill(0).map((_, i) => (
                      <div key={i} className="h-48 rounded-3xl bg-neutral-200/40 dark:bg-neutral-800/40 animate-pulse" />
                    ))
                  ) : filteredMeetings.length > 0 ? (
                    filteredMeetings.map((meeting) => (
                      <motion.div
                        key={meeting.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          "p-6 rounded-[30px] border flex flex-col justify-between transition-all group",
                          theme === 'light' ? "bg-white border-neutral-200/70 hover:shadow-lg" : "bg-neutral-900/40 border-neutral-800 hover:border-neutral-700"
                        )}
                      >
                        <div className="space-y-4">
                          <div className="flex justify-between items-start">
                            <div className="space-y-1 min-w-0">
                              <h4 className="text-[15px] font-bold truncate tracking-tight">{meeting.topic}</h4>
                              <div className="flex items-center gap-2 text-[11.5px] opacity-50 font-semibold">
                                <Calendar size={12} />
                                {new Date(meeting.start_time).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                <span>•</span>
                                <Clock size={12} />
                                {new Date(meeting.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                              <Video size={14} className="text-blue-500" />
                            </div>
                          </div>
                          
                          <div className="flex flex-wrap gap-2">
                            <span className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-[10px] font-bold uppercase tracking-wider opacity-60">
                              {meeting.duration} min
                            </span>
                            <span className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-[10px] font-bold uppercase tracking-wider opacity-60">
                              {meeting.timezone}
                            </span>
                          </div>
                        </div>

                        <div className="mt-6 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => setActiveMeeting(meeting)}
                            className="flex-1 px-4 py-2.5 rounded-xl bg-blue-500 text-white text-[11.5px] font-bold text-center hover:bg-blue-400 transition-all active:scale-95 cursor-pointer"
                          >
                            Join
                          </button>
                          <button 
                            onClick={() => handleAnalyze(meeting)}
                            className={cn(
                              "px-4 py-2.5 rounded-xl text-[11.5px] font-bold border transition-all active:scale-95 cursor-pointer",
                              theme === 'light' ? "border-neutral-200 hover:bg-neutral-50" : "border-neutral-800 hover:bg-neutral-800"
                            )}
                          >
                            Analyze
                          </button>
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="col-span-full py-20 flex flex-col items-center justify-center text-center space-y-4">
                      <div className="w-20 h-20 rounded-full bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center opacity-40">
                        <Calendar size={32} />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-lg font-bold">No upcoming meetings</h3>
                        <p className="text-[13px] opacity-50 max-w-xs">Your Zoom schedule is currently clear. Sync your calendar to see meetings here.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'recordings' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {loading ? (
                    Array(3).fill(0).map((_, i) => (
                      <div key={i} className="h-56 rounded-3xl bg-neutral-200/40 dark:bg-neutral-800/40 animate-pulse" />
                    ))
                  ) : filteredRecordings.length > 0 ? (
                    filteredRecordings.map((rec) => (
                      <motion.div
                        key={rec.id}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={cn(
                          "p-6 rounded-[30px] border flex flex-col justify-between transition-all group overflow-hidden relative",
                          theme === 'light' ? "bg-white border-neutral-200/70 hover:shadow-lg" : "bg-neutral-900/40 border-neutral-800 hover:border-neutral-700"
                        )}
                      >
                        <div className="space-y-4">
                          <div className="flex justify-between items-start">
                            <div className="space-y-1.5 min-w-0">
                              <h4 className="text-[15px] font-bold truncate tracking-tight">{rec.topic}</h4>
                              <p className="text-[11.5px] opacity-50 font-bold uppercase tracking-wider">
                                {new Date(rec.start_time).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}
                              </p>
                            </div>
                            <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                              <Play size={16} className="text-amber-500 fill-amber-500" />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/40 space-y-0.5">
                              <span className="text-[10px] font-bold opacity-30 uppercase tracking-widest block">Duration</span>
                              <span className="text-xs font-bold">{rec.duration} min</span>
                            </div>
                            <div className="p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/40 space-y-0.5">
                              <span className="text-[10px] font-bold opacity-30 uppercase tracking-widest block">Size</span>
                              <span className="text-xs font-bold">{(rec.total_size / (1024 * 1024)).toFixed(1)} MB</span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-6 flex items-center gap-2">
                          <a 
                            href={rec.share_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 px-4 py-2.5 rounded-xl bg-neutral-950 dark:bg-white text-white dark:text-black text-[11.5px] font-bold text-center hover:opacity-90 transition-all active:scale-95 cursor-pointer"
                          >
                            Watch Recording
                          </a>
                          <button 
                            onClick={() => handleAnalyze(rec)}
                            disabled={analysisLoading === rec.id}
                            className={cn(
                              "px-4 py-2.5 rounded-xl text-[11.5px] font-bold border transition-all active:scale-95 flex items-center gap-2 cursor-pointer",
                              theme === 'light' ? "border-neutral-200 hover:bg-neutral-50" : "border-neutral-800 hover:bg-neutral-800"
                            )}
                          >
                            {analysisLoading === rec.id ? <RefreshCcw size={14} className="animate-spin" /> : <Sparkles size={14} className="text-amber-500" />}
                            {analysisLoading === rec.id ? 'Analyzing...' : 'Analyze'}
                          </button>
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="col-span-full py-20 flex flex-col items-center justify-center text-center space-y-4">
                      <div className="w-20 h-20 rounded-full bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center opacity-40">
                        <Video size={32} />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-lg font-bold">No recordings found</h3>
                        <p className="text-[13px] opacity-50 max-w-xs">Meetings with cloud recordings enabled will appear here automatically.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'intelligence' && (
                <div className="space-y-8 max-w-4xl mx-auto">
                  {/* Natural Language Search/Ask */}
                  <div className={cn(
                    "p-8 md:p-10 rounded-[40px] border shadow-2xl relative overflow-hidden",
                    theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-900/60 border-neutral-800"
                  )}>
                    <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 blur-[100px] -mr-32 -mt-32" />
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/5 blur-[80px] -ml-20 -mb-20" />
                    
                    <div className="relative z-10 space-y-8">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-[18px] bg-blue-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                          <Sparkles size={24} />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold tracking-tight">Ask anything about your meetings</h3>
                          <p className="text-[14px] opacity-50 font-medium">Summarize discussions, extract action items, or find specific decisions.</p>
                        </div>
                      </div>

                      <div className="relative group">
                        <MessageSquare className="absolute left-6 top-1/2 -translate-y-1/2 opacity-30 group-focus-within:opacity-100 transition-opacity" size={22} />
                        <input 
                          type="text"
                          placeholder="e.g. What were the key takeaways from yesterday's product sync?"
                          className={cn(
                            "w-full pl-16 pr-36 py-6 rounded-[32px] border text-[16px] font-medium outline-none transition-all focus:ring-8 focus:ring-blue-500/5 placeholder:opacity-50",
                            theme === 'light' ? "bg-neutral-50 border-neutral-200" : "bg-neutral-950/50 border-neutral-800"
                          )}
                        />
                        <button className="absolute right-3.5 top-1/2 -translate-y-1/2 px-8 py-3 rounded-[24px] bg-blue-500 text-white text-[14px] font-bold hover:bg-blue-400 transition-all active:scale-95 shadow-lg shadow-blue-500/20">
                          Analyze
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2.5">
                        {["Summarize last meeting", "Action items from John", "Decisions on Budget", "Recurring topics"].map((tag, i) => (
                          <button 
                            key={i}
                            className={cn(
                              "px-5 py-2.5 rounded-2xl border text-[12px] font-bold transition-all hover:border-blue-500/50 hover:text-blue-500 hover:bg-blue-500/5 active:scale-95 cursor-pointer",
                              theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-900 border-neutral-800"
                            )}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Recent Analysis Reports */}
                  <div className="space-y-6">
                    <div className="flex items-center justify-between px-4">
                      <h4 className="text-[11px] font-bold tracking-[0.2em] uppercase opacity-40">Intelligence History</h4>
                      <div className="flex items-center gap-1.5 text-[11px] font-bold opacity-30">
                        <ShieldCheck size={12} />
                        End-to-end Encrypted
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-6">
                      {analysisResult ? (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className={cn(
                            "p-10 rounded-[44px] border relative overflow-hidden",
                            theme === 'light' ? "bg-white border-neutral-200 shadow-xl" : "bg-neutral-900/40 border-neutral-800 shadow-2xl"
                          )}
                        >
                          <div className="absolute top-0 right-0 p-8">
                            <button 
                              onClick={() => setAnalysisResult(null)}
                              className="w-10 h-10 rounded-full border border-neutral-200 dark:border-neutral-800 flex items-center justify-center opacity-40 hover:opacity-100 transition-opacity cursor-pointer"
                            >
                              <X size={18} />
                            </button>
                          </div>

                          <div className="flex items-center gap-4 mb-10">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                              <FileText size={24} />
                            </div>
                            <div>
                              <h3 className="text-2xl font-extrabold tracking-tight">Meeting Intelligence Report</h3>
                              <p className="text-[13px] opacity-50 font-semibold">{new Date().toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 gap-6">
                            {analysisResult.text.split('\n\n').map((chunk, i) => (
                              <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.1 }}
                                className={cn(
                                  "p-8 rounded-[32px] leading-relaxed",
                                  theme === 'light' ? "bg-neutral-50/50" : "bg-neutral-800/30"
                                )}
                              >
                                <div className="whitespace-pre-wrap text-[15.5px] opacity-80">{chunk}</div>
                              </motion.div>
                            ))}
                          </div>
                        </motion.div>
                      ) : (
                        <div className={cn(
                          "py-24 rounded-[44px] border border-dashed flex flex-col items-center justify-center text-center space-y-5 px-8",
                          theme === 'light' ? "border-neutral-200" : "border-neutral-800"
                        )}>
                          <div className="w-20 h-20 rounded-full bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center opacity-30">
                            <Activity size={32} />
                          </div>
                          <div className="space-y-2">
                            <p className="text-[15px] font-bold">No active analysis reports</p>
                            <p className="text-[13px] opacity-40 max-w-sm font-medium">Run an analysis from the Upcoming or Recordings tab to generate a detailed AI report here.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Informational Sections (Description + Specs) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 pt-12 border-t border-neutral-200/50 dark:border-neutral-800/50">
          <div className="md:col-span-8 space-y-8">
            <div className="space-y-4">
              <h2 className="text-xs font-bold tracking-[0.2em] uppercase opacity-40">Integration Overview</h2>
              <p className="text-lg leading-relaxed opacity-90 font-medium max-w-2xl">
                Plack AI seamlessly orchestrates your Zoom environment, transforming static meetings into actionable, searchable, and intelligent data assets.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <ShieldCheck size={18} className="text-emerald-500" />
                    Secure Infrastructure
                  </div>
                  <p className="text-[13px] opacity-60 leading-relaxed font-medium">
                    Industry-standard OAuth 2.0 ensures your meeting data remains private, encrypted, and only accessible by you.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <Zap size={18} className="text-blue-500" />
                    Ambient Intelligence
                  </div>
                  <p className="text-[13px] opacity-60 leading-relaxed font-medium">
                    The AI agent understands your meeting history ambiently, requiring no special commands to retrieve insights.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Specification Table */}
          <div className="md:col-span-4 space-y-6">
            <h2 className="text-xs font-bold tracking-[0.2em] uppercase opacity-40">Specifications</h2>
            <div className={cn(
              "rounded-[32px] border overflow-hidden p-6 space-y-6",
              theme === 'light' ? "border-neutral-200/80 bg-white shadow-sm" : "border-neutral-850 bg-neutral-950/20"
            )}>
              <div className="space-y-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold opacity-30 uppercase tracking-[0.1em]">Developer</span>
                  <span className="text-sm font-bold">Zoom Video Communications</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold opacity-30 uppercase tracking-[0.1em]">Version</span>
                  <span className="text-sm font-bold">2.4.0 (Enterprise AI)</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold opacity-30 uppercase tracking-[0.1em]">Privacy Policy</span>
                  <a href="#" className="text-sm font-bold text-blue-500 hover:underline inline-flex items-center gap-1 cursor-pointer">
                    Standard OAuth Review
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>

              <div className="pt-6 border-t border-neutral-100 dark:border-neutral-800/40">
                <div className="flex items-center gap-2 text-[11px] font-bold opacity-60">
                  <Globe size={14} />
                  Global Availability
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
