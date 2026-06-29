'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Video, Clock, Calendar, Sparkles, Plus, Search, RefreshCw, 
  Trash2, Play, FileText, Check, CheckCircle2, AlertCircle, 
  X, ExternalLink, Send, Copy, ChevronRight, User, Users, 
  BarChart2, Smile, Activity, HelpCircle, ArrowLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Meeting {
  id: string;
  topic: string;
  type: number;
  start_time?: string;
  duration?: number;
  timezone?: string;
  created_at?: string;
  join_url?: string;
  start_url?: string;
  host_email?: string;
  agenda?: string;
}

interface Recording {
  id: string;
  meeting_id: string;
  topic: string;
  start_time: string;
  duration: number;
  download_url?: string;
  playback_url?: string;
  recording_files?: Array<{
    id: string;
    file_type: string;
    file_size: number;
    play_url?: string;
  }>;
}

interface Message {
  role: 'user' | 'model';
  content: string;
  id: string;
  pendingConfirm?: {
    action: 'create' | 'update' | 'cancel';
    params: any;
  };
}

interface ZoomWorkspaceProps {
  theme: 'light' | 'dark' | 'cosmic';
  zoomEmail: string | null;
  onDisconnect: () => void;
  onBackToConnections: () => void;
}

export default function ZoomWorkspace({
  theme,
  zoomEmail,
  onDisconnect,
  onBackToConnections
}: ZoomWorkspaceProps) {
  // Tabs & Views
  const [activeTab, setActiveTab] = useState<'upcoming' | 'recent' | 'recordings' | 'summaries'>('upcoming');
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Data State
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [analyses, setAnalyses] = useState<Record<string, string>>({}); // keyed by meetingId
  
  // UI Loaders
  const [isLoading, setIsLoading] = useState(false);
  const [syncState, setSyncState] = useState<'idle' | 'connecting' | 'fetching_meetings' | 'loading_recordings' | 'complete'>('idle');
  const [aiAnalysisProgress, setAiAnalysisProgress] = useState<string[]>([]);
  const [isAnalyzingId, setIsAnalyzingId] = useState<string | null>(null);

  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      content: "Hello! I am your **Plack AI Zoom Assistant**. I can help you search your meetings, summarize past sessions, write reviews, and even schedule new slots. Try asking me:\n\n* *'Summarize my latest meeting'* \n* *'Schedule a sync tomorrow at 3 PM called Kickoff'* \n* *'Which meetings lasted longer than 40 minutes?'*"
    }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatProgressStep, setChatProgressStep] = useState<string | null>(null);

  // Scheduling Quick form
  const [isScheduling, setIsScheduling] = useState(false);
  const [newMeetingTopic, setNewMeetingTopic] = useState('');
  const [newMeetingDate, setNewMeetingDate] = useState('');
  const [newMeetingTime, setNewMeetingTime] = useState('');
  const [newMeetingDuration, setNewMeetingDuration] = useState('40');

  // Copied notifications
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isChatLoading, chatProgressStep]);

  // Fetch live Zoom data on mount
  useEffect(() => {
    fetchZoomData(true);
  }, []);

  const fetchZoomData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    setSyncState('connecting');

    try {
      // Step 1: Fetch Upcoming Meetings
      setSyncState('fetching_meetings');
      const meetingsRes = await fetch('/api/zoom/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' })
      });
      const meetingsData = await meetingsRes.json();
      if (meetingsData.success && Array.isArray(meetingsData.meetings)) {
        setMeetings(meetingsData.meetings);
      }

      // Step 2: Fetch Cloud Recordings
      setSyncState('loading_recordings');
      const recsRes = await fetch('/api/zoom/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'recordings' })
      });
      const recsData = await recsRes.json();
      if (recsData.success && Array.isArray(recsData.recordings)) {
        setRecordings(recsData.recordings);
      }

      setSyncState('complete');
      setTimeout(() => setSyncState('idle'), 2000);
    } catch (err) {
      console.error('[ZOOM SYNC ERROR]', err);
      setSyncState('idle');
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  const handleSyncClick = () => {
    fetchZoomData(false);
  };

  // Helper to copy links
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Divide meetings into upcoming and past
  const now = new Date();
  const upcomingMeetingsList = meetings.filter(m => {
    if (!m.start_time) return true;
    return new Date(m.start_time) >= now;
  });

  const recentMeetingsList = meetings.filter(m => {
    if (!m.start_time) return false;
    return new Date(m.start_time) < now;
  });

  // Filter lists based on search bar
  const filterMeetingList = (list: Meeting[]) => {
    if (!searchQuery) return list;
    const query = searchQuery.toLowerCase();
    return list.filter(m => 
      m.topic.toLowerCase().includes(query) || 
      (m.agenda && m.agenda.toLowerCase().includes(query)) ||
      (m.id && m.id.includes(query))
    );
  };

  const filterRecordingList = (list: Recording[]) => {
    if (!searchQuery) return list;
    const query = searchQuery.toLowerCase();
    return list.filter(r => 
      r.topic.toLowerCase().includes(query) || 
      (r.meeting_id && r.meeting_id.includes(query))
    );
  };

  const getFilteredUpcoming = () => filterMeetingList(upcomingMeetingsList);
  const getFilteredRecent = () => filterMeetingList(recentMeetingsList);
  const getFilteredRecordings = () => filterRecordingList(recordings);

  // Trigger Live AI Analysis for a past meeting
  const handleAnalyzeMeeting = async (meeting: Meeting) => {
    setIsAnalyzingId(meeting.id);
    setAiAnalysisProgress([
      "Loading meeting metadata...",
      "Extracting participants details...",
      "Analyzing meeting topic and duration..."
    ]);

    setTimeout(() => {
      setAiAnalysisProgress(prev => [...prev, "Running high-fidelity Gemini semantic intelligence engine..."]);
    }, 1000);

    setTimeout(() => {
      setAiAnalysisProgress(prev => [...prev, "Structuring key decisions and action items..."]);
    }, 2500);

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
      if (data.success && data.analysis) {
        setAnalyses(prev => ({
          ...prev,
          [meeting.id]: data.analysis
        }));
        // Select meeting to view analysis
        setSelectedMeeting(meeting);
        setActiveTab('summaries');
      }
    } catch (err) {
      console.error('[ZOOM ANALYZE ERROR]', err);
    } finally {
      setIsAnalyzingId(null);
      setAiAnalysisProgress([]);
    }
  };

  // Send message to Dedicated Zoom AI Assistant
  const handleSendChatMessage = async (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const promptToSend = (customText || chatInput).trim();
    if (!promptToSend) return;

    // Add user message
    const userMsgId = Math.random().toString();
    const userMsg: Message = {
      id: userMsgId,
      role: 'user',
      content: promptToSend
    };

    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsChatLoading(true);

    // Live AI progress simulation
    setChatProgressStep("Reading your Zoom schedule...");
    setTimeout(() => setChatProgressStep("Analyzing available meeting context..."), 1000);
    setTimeout(() => setChatProgressStep("Evaluating questions relative to UTC 2026..."), 2000);
    setTimeout(() => setChatProgressStep("Formulating intelligence response..."), 3000);

    try {
      // Map history for endpoint
      const history = chatMessages.map(m => ({
        role: m.role,
        content: m.content
      }));

      const res = await fetch('/api/zoom/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptToSend,
          history
        })
      });

      const data = await res.json();
      if (data.success && data.text) {
        const text = data.text;
        const responseId = Math.random().toString();

        // Check if there is a ZOOM_CONFIRM_REQUIRED tag
        // Tag pattern: [ZOOM_CONFIRM_REQUIRED:actionType:jsonParams]
        const confirmMatch = text.match(/\[ZOOM_CONFIRM_REQUIRED:(create|update|cancel):(\{.*\})\]/);

        let pendingConfirm: any = undefined;
        let cleanedContent = text;

        if (confirmMatch) {
          const action = confirmMatch[1] as 'create' | 'update' | 'cancel';
          try {
            const params = JSON.parse(confirmMatch[2]);
            pendingConfirm = { action, params };
            // Remove the raw tag from user view
            cleanedContent = text.replace(/\[ZOOM_CONFIRM_REQUIRED:(create|update|cancel):(\{.*\})\]/, '').trim();
          } catch (pErr) {
            console.error('Failed to parse confirmation JSON:', pErr);
          }
        }

        setChatMessages(prev => [
          ...prev,
          {
            id: responseId,
            role: 'model',
            content: cleanedContent,
            pendingConfirm
          }
        ]);
      } else {
        throw new Error(data.error || 'Chat error');
      }
    } catch (err: any) {
      setChatMessages(prev => [
        ...prev,
        {
          id: Math.random().toString(),
          role: 'model',
          content: `⚠️ Failed to get a response: ${err.message || 'Server connection timed out. Please verify your connection status and retry.'}`
        }
      ]);
    } finally {
      setIsChatLoading(false);
      setChatProgressStep(null);
    }
  };

  // Perform scheduling / cancelation action upon user clicking "Confirm" in chat card
  const handleConfirmAction = async (msgId: string, action: 'create' | 'update' | 'cancel', params: any) => {
    // Show spinner in card
    setChatMessages(prev => prev.map(m => {
      if (m.id === msgId) {
        return {
          ...m,
          content: m.content + "\n\n*Processing requested action with real Zoom API...*"
        };
      }
      return m;
    }));

    try {
      let bodyParams: any = { action };
      if (action === 'create') {
        bodyParams.topic = params.topic;
        bodyParams.startTime = params.startTime;
        bodyParams.duration = params.duration || 40;
        bodyParams.timezone = params.timezone || 'UTC';
      } else if (action === 'update') {
        bodyParams.meetingId = params.meetingId;
        bodyParams.topic = params.topic;
        bodyParams.startTime = params.startTime;
        bodyParams.duration = params.duration;
      } else if (action === 'cancel') {
        bodyParams.meetingId = params.meetingId;
      }

      const res = await fetch('/api/zoom/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyParams)
      });

      const data = await res.json();
      if (data.success) {
        // Success state
        setChatMessages(prev => prev.map(m => {
          if (m.id === msgId) {
            // Remove pending confirmation and append success message
            const successMsg = action === 'create'
              ? `✅ **Meeting scheduled successfully!**\n\n**Topic:** ${data.meeting?.topic || params.topic}\n**ID:** \`${data.meeting?.id || 'N/A'}\`\n**Time:** ${new Date(data.meeting?.start_time || params.startTime).toLocaleString()}\n\n[Join Zoom Meeting](${data.meeting?.join_url})`
              : action === 'cancel'
                ? `❌ **Meeting cancelled successfully.**\n\nThe schedule has been cleared from your live Zoom agenda.`
                : `✅ **Meeting updated successfully!**`;
            
            return {
              ...m,
              content: m.content.split("*Processing requested")[0] + "\n\n" + successMsg,
              pendingConfirm: undefined
            };
          }
          return m;
        }));

        // Refresh meetings list
        fetchZoomData(true);
      } else {
        throw new Error(data.error || 'Action failed');
      }
    } catch (e: any) {
      setChatMessages(prev => prev.map(m => {
        if (m.id === msgId) {
          return {
            ...m,
            content: m.content.split("*Processing requested")[0] + `\n\n⚠️ **Failed to complete action:** ${e.message || 'Unknown Zoom API error.'}`,
            pendingConfirm: undefined
          };
        }
        return m;
      }));
    }
  };

  const handleCancelConfirmCard = (msgId: string) => {
    setChatMessages(prev => prev.map(m => {
      if (m.id === msgId) {
        return {
          ...m,
          content: m.content + "\n\n*Action cancelled by user.*",
          pendingConfirm: undefined
        };
      }
      return m;
    }));
  };

  // Direct manual scheduling modal/form submission
  const handleManualSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMeetingTopic || !newMeetingDate || !newMeetingTime) return;

    setIsLoading(true);
    try {
      const combinedDateTime = `${newMeetingDate}T${newMeetingTime}:00`;
      
      const res = await fetch('/api/zoom/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          topic: newMeetingTopic,
          startTime: new Date(combinedDateTime).toISOString(),
          duration: parseInt(newMeetingDuration) || 40,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        })
      });

      const data = await res.json();
      if (data.success) {
        setNewMeetingTopic('');
        setNewMeetingDate('');
        setNewMeetingTime('');
        setIsScheduling(false);
        fetchZoomData(true);
      } else {
        alert(`Failed to create meeting: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error scheduling meeting: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelMeeting = async (meetingId: string) => {
    if (!confirm("Are you sure you want to cancel this Zoom meeting?")) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/zoom/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel',
          meetingId
        })
      });

      const data = await res.json();
      if (data.success) {
        if (selectedMeeting?.id === meetingId) {
          setSelectedMeeting(null);
        }
        fetchZoomData(true);
      } else {
        alert(`Failed to cancel meeting: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn(
      "h-screen flex flex-col font-sans overflow-hidden transition-colors duration-300",
      theme === 'light' ? "bg-[#f9f9fb] text-neutral-800" :
      theme === 'cosmic' ? "bg-[#04020a] text-indigo-50" :
      "bg-[#070708] text-neutral-100"
    )}>
      {/* Top Banner - Compact Header */}
      <header className={cn(
        "flex-none h-16 px-6 flex items-center justify-between border-b backdrop-blur-md sticky top-0 z-20",
        theme === 'light' ? "border-neutral-200/60 bg-white/80" :
        theme === 'cosmic' ? "border-indigo-500/10 bg-[#09051c]/80" :
        "border-neutral-800/60 bg-[#0a0a0b]/80"
      )}>
        <div className="flex items-center gap-4">
          <button 
            onClick={onBackToConnections}
            className={cn(
              "p-2 rounded-xl border hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer",
              theme === 'light' ? "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50" :
              theme === 'cosmic' ? "bg-indigo-950/40 border-indigo-500/20 text-indigo-200 hover:bg-indigo-900/40" :
              "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800"
            )}
            title="Back to All Connections"
          >
            <ArrowLeft size={16} />
          </button>
          
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500 flex items-center justify-center text-white shadow-sm">
              <Video size={18} className="stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-tight">Zoom</h1>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/10">
                  <CheckCircle2 size={10} className="stroke-[2.5]" />
                  Active Workspace
                </span>
              </div>
              <p className="text-[11px] opacity-60 leading-none">Smart meeting intelligence powered by Zoom.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {zoomEmail && (
            <div className={cn(
              "hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold",
              theme === 'light' ? "bg-white border-neutral-200 text-neutral-600" :
              theme === 'cosmic' ? "bg-indigo-950/20 border-indigo-500/10 text-indigo-200" :
              "bg-neutral-900/40 border-neutral-800 text-neutral-300"
            )}>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="truncate max-w-[150px]">{zoomEmail}</span>
            </div>
          )}

          <button
            type="button"
            onClick={onDisconnect}
            className="text-xs font-bold text-red-500 hover:text-red-600 hover:underline px-3 py-1.5 transition-colors cursor-pointer"
          >
            Disconnect Account
          </button>
        </div>
      </header>

      {/* Main Container - Split Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Hand: Zoom Meetings / Recordings Dashboard */}
        <div className="flex-1 flex flex-col min-w-0 h-full border-r border-neutral-200 dark:border-neutral-800/60">
          
          {/* Controls Panel */}
          <div className={cn(
            "p-5 flex-none border-b flex flex-col md:flex-row md:items-center justify-between gap-4",
            theme === 'light' ? "bg-white/40 border-neutral-200/60" : "bg-black/10 border-neutral-800/40"
          )}>
            {/* Search Bar */}
            <div className={cn(
              "flex items-center gap-2 px-3.5 py-2 rounded-xl border w-full md:w-[280px] shadow-sm transition-all focus-within:ring-2",
              theme === 'light' ? "bg-white border-neutral-200 focus-within:border-neutral-300 focus-within:ring-neutral-200" : "bg-neutral-900/60 border-neutral-800 focus-within:border-neutral-700 focus-within:ring-white/5"
            )}>
              <Search size={15} className="text-neutral-500 shrink-0" />
              <input 
                type="text" 
                placeholder="Search meetings & recordings..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-xs w-full font-medium"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-neutral-500 hover:text-neutral-700">
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Sync & Schedule Trigger */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleSyncClick}
                disabled={syncState !== 'idle'}
                className={cn(
                  "p-2 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95 shadow-sm cursor-pointer",
                  theme === 'light' ? "bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50" : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800",
                  syncState !== 'idle' && "opacity-70 cursor-wait"
                )}
              >
                <RefreshCw size={13} className={cn("shrink-0", syncState !== 'idle' && "animate-spin")} />
                {syncState === 'idle' && "Sync Zoom"}
                {syncState === 'connecting' && "Connecting..."}
                {syncState === 'fetching_meetings' && "Retrieving meetings..."}
                {syncState === 'loading_recordings' && "Loading recordings..."}
                {syncState === 'complete' && "Sync Complete"}
              </button>

              <button
                type="button"
                onClick={() => setIsScheduling(true)}
                className={cn(
                  "px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 shadow-sm cursor-pointer",
                  theme === 'light' ? "bg-neutral-900 text-white hover:bg-neutral-800" : "bg-white text-black hover:bg-neutral-200"
                )}
              >
                <Plus size={13} className="stroke-[2.5px]" />
                Schedule
              </button>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex-none px-5 py-2.5 border-b border-neutral-200 dark:border-neutral-800/40 flex gap-1 bg-black/5 dark:bg-black/20">
            {[
              { id: 'upcoming', label: `Upcoming (${upcomingMeetingsList.length})` },
              { id: 'recent', label: `Recent Past (${recentMeetingsList.length})` },
              { id: 'recordings', label: `Cloud Recordings (${recordings.length})` },
              { id: 'summaries', label: `AI Summaries (${Object.keys(analyses).length})` }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setSelectedMeeting(null);
                }}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                  activeTab === tab.id 
                    ? (theme === 'light' ? "bg-white text-neutral-950 shadow-sm" : "bg-neutral-800 text-white") 
                    : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* List Area */}
          <div className="flex-1 overflow-y-auto p-5 relative" style={{ scrollbarWidth: 'none' }}>
            
            {/* Direct manual scheduling sub-section form */}
            <AnimatePresence>
              {isScheduling && (
                <motion.form
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  onSubmit={handleManualSchedule}
                  className={cn(
                    "mb-6 p-4 rounded-2xl border flex flex-col gap-3 overflow-hidden shadow-sm",
                    theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-900/50 border-neutral-800"
                  )}
                >
                  <div className="flex items-center justify-between border-b pb-2 mb-1 border-neutral-200 dark:border-neutral-800">
                    <h3 className="text-xs font-bold flex items-center gap-1.5">
                      <Calendar size={13} className="text-blue-500" />
                      Schedule New Zoom Meeting
                    </h3>
                    <button type="button" onClick={() => setIsScheduling(false)} className="text-neutral-500 hover:text-neutral-700">
                      <X size={14} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="col-span-1 sm:col-span-2">
                      <label className="block text-[10px] font-bold uppercase opacity-50 mb-1">Meeting Topic</label>
                      <input 
                        type="text" 
                        required
                        placeholder="e.g. Design Sync & Review" 
                        value={newMeetingTopic}
                        onChange={(e) => setNewMeetingTopic(e.target.value)}
                        className={cn(
                          "w-full px-3 py-2 rounded-xl border text-xs font-medium outline-none",
                          theme === 'light' ? "bg-[#fafafa] border-neutral-200 focus:border-neutral-300" : "bg-neutral-950 border-neutral-800 focus:border-neutral-700"
                        )}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase opacity-50 mb-1">Date</label>
                      <input 
                        type="date" 
                        required
                        value={newMeetingDate}
                        onChange={(e) => setNewMeetingDate(e.target.value)}
                        className={cn(
                          "w-full px-3 py-2 rounded-xl border text-xs font-medium outline-none",
                          theme === 'light' ? "bg-[#fafafa] border-neutral-200 focus:border-neutral-300" : "bg-neutral-950 border-neutral-800 focus:border-neutral-700"
                        )}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase opacity-50 mb-1">Time</label>
                      <input 
                        type="time" 
                        required
                        value={newMeetingTime}
                        onChange={(e) => setNewMeetingTime(e.target.value)}
                        className={cn(
                          "w-full px-3 py-2 rounded-xl border text-xs font-medium outline-none",
                          theme === 'light' ? "bg-[#fafafa] border-neutral-200 focus:border-neutral-300" : "bg-neutral-950 border-neutral-800 focus:border-neutral-700"
                        )}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase opacity-50 mb-1">Duration (Minutes)</label>
                      <select 
                        value={newMeetingDuration}
                        onChange={(e) => setNewMeetingDuration(e.target.value)}
                        className={cn(
                          "w-full px-3 py-2 rounded-xl border text-xs font-medium outline-none",
                          theme === 'light' ? "bg-[#fafafa] border-neutral-200 focus:border-neutral-300" : "bg-neutral-950 border-neutral-800 focus:border-neutral-700"
                        )}
                      >
                        <option value="15">15 minutes</option>
                        <option value="30">30 minutes</option>
                        <option value="40">40 minutes</option>
                        <option value="60">60 minutes</option>
                        <option value="90">90 minutes</option>
                      </select>
                    </div>

                    <div className="flex items-end justify-end">
                      <button
                        type="submit"
                        disabled={isLoading}
                        className={cn(
                          "w-full px-4 py-2 rounded-xl text-xs font-bold text-center transition-all cursor-pointer",
                          theme === 'light' ? "bg-neutral-900 text-white hover:bg-neutral-800" : "bg-white text-black hover:bg-neutral-200",
                          isLoading && "opacity-70 cursor-wait"
                        )}
                      >
                        {isLoading ? "Scheduling..." : "Create Meeting"}
                      </button>
                    </div>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Inner Dashboard View: Either list of tab items OR inline detail panel */}
            <AnimatePresence mode="wait">
              {selectedMeeting ? (
                <motion.div
                  key="detail"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className={cn(
                    "p-6 rounded-[24px] border",
                    theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-900/40 border-neutral-800/80"
                  )}
                >
                  {/* Detailed Panel Header */}
                  <div className="flex items-start justify-between border-b pb-5 mb-5 border-neutral-200 dark:border-neutral-800">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="p-1 rounded-lg bg-blue-500/10 text-blue-500">
                          <Video size={16} />
                        </span>
                        <span className="text-[10px] font-bold opacity-50 uppercase tracking-wider">Zoom Meeting Details</span>
                      </div>
                      <h2 className="text-xl font-extrabold tracking-tight leading-tight">{selectedMeeting.topic}</h2>
                      <p className="text-[11px] font-mono opacity-50">Meeting ID: {selectedMeeting.id}</p>
                    </div>
                    <button 
                      onClick={() => setSelectedMeeting(null)}
                      className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
                    <div className="space-y-4">
                      {selectedMeeting.start_time && (
                        <div className="flex items-start gap-2.5">
                          <Calendar size={15} className="text-blue-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-[10px] font-bold opacity-45 uppercase tracking-wider">Date</p>
                            <p className="text-xs font-semibold">
                              {new Date(selectedMeeting.start_time).toLocaleDateString(undefined, { 
                                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
                              })}
                            </p>
                          </div>
                        </div>
                      )}

                      {selectedMeeting.start_time && (
                        <div className="flex items-start gap-2.5">
                          <Clock size={15} className="text-blue-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-[10px] font-bold opacity-45 uppercase tracking-wider">Time & Duration</p>
                            <p className="text-xs font-semibold">
                              {new Date(selectedMeeting.start_time).toLocaleTimeString(undefined, { 
                                hour: '2-digit', minute: '2-digit', timeZoneName: 'short' 
                              })} 
                              <span className="opacity-50 ml-1">({selectedMeeting.duration || 40} mins)</span>
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-start gap-2.5">
                        <User size={15} className="text-blue-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] font-bold opacity-45 uppercase tracking-wider">Organizer Host</p>
                          <p className="text-xs font-semibold truncate max-w-[200px]">{selectedMeeting.host_email || 'You'}</p>
                        </div>
                      </div>

                      {selectedMeeting.agenda && (
                        <div className="flex items-start gap-2.5">
                          <FileText size={15} className="text-blue-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-[10px] font-bold opacity-45 uppercase tracking-wider">Agenda</p>
                            <p className="text-xs font-medium opacity-80 leading-relaxed">{selectedMeeting.agenda}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex flex-wrap items-center gap-2.5 border-t border-b py-4 mb-6 border-neutral-200 dark:border-neutral-800">
                    {selectedMeeting.join_url && (
                      <a 
                        href={selectedMeeting.join_url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm hover:shadow active:scale-95 transition-all cursor-pointer"
                      >
                        <ExternalLink size={13} />
                        Join Meeting
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => copyToClipboard(selectedMeeting.join_url || '', selectedMeeting.id)}
                      className={cn(
                        "px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer",
                        theme === 'light' ? "bg-white border-neutral-200 hover:bg-neutral-50 text-neutral-700" : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800"
                      )}
                    >
                      {copiedId === selectedMeeting.id ? (
                        <>
                          <Check size={13} className="text-emerald-500" />
                          Copied Link
                        </>
                      ) : (
                        <>
                          <Copy size={13} />
                          Copy Link
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSendChatMessage(undefined, `Tell me more details about meeting "${selectedMeeting.topic}"`)}
                      className={cn(
                        "px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer",
                        theme === 'light' ? "bg-white border-neutral-200 hover:bg-neutral-50 text-neutral-700" : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800"
                      )}
                    >
                      <Sparkles size={13} className="text-indigo-500" />
                      Ask AI
                    </button>

                    {new Date(selectedMeeting.start_time || '') >= now && (
                      <button
                        type="button"
                        onClick={() => handleCancelMeeting(selectedMeeting.id)}
                        className="px-3 py-2 hover:bg-red-500/10 text-red-500 rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all ml-auto cursor-pointer"
                      >
                        <Trash2 size={13} />
                        Cancel Meeting
                      </button>
                    )}
                  </div>

                  {/* AI Analysis View for this selected meeting */}
                  <div>
                    <h3 className="text-xs font-extrabold mb-3 flex items-center gap-1.5 tracking-tight uppercase opacity-55">
                      <Sparkles size={14} className="text-indigo-500" />
                      AI Summarization & Analysis
                    </h3>

                    {analyses[selectedMeeting.id] ? (
                      <div className={cn(
                        "p-5 rounded-2xl border prose dark:prose-invert max-w-none text-xs leading-relaxed space-y-4",
                        theme === 'light' ? "bg-[#fafafa] border-neutral-150" : "bg-black/30 border-white/5"
                      )}>
                        {/* We display parsed summaries beautifully */}
                        <div className="whitespace-pre-line text-neutral-700 dark:text-neutral-300">
                          {analyses[selectedMeeting.id]}
                        </div>
                      </div>
                    ) : (
                      <div className={cn(
                        "p-6 rounded-2xl border border-dashed flex flex-col items-center text-center gap-3",
                        theme === 'light' ? "bg-[#fafafa] border-neutral-200" : "bg-neutral-950/20 border-neutral-800"
                      )}>
                        <Activity size={24} className="text-indigo-500/70" />
                        <div>
                          <p className="text-xs font-bold">No AI Summary Cached</p>
                          <p className="text-[11px] opacity-60 max-w-sm mt-0.5">Let Plack AI execute an advanced analytical review of this meeting&apos;s metadata, host, duration, and agenda.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAnalyzeMeeting(selectedMeeting)}
                          disabled={isAnalyzingId === selectedMeeting.id}
                          className={cn(
                            "px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all shadow-sm cursor-pointer",
                            theme === 'light' ? "bg-neutral-900 text-white hover:bg-neutral-800" : "bg-white text-black hover:bg-neutral-200",
                            isAnalyzingId === selectedMeeting.id && "opacity-75 cursor-wait"
                          )}
                        >
                          <Sparkles size={13} className="text-indigo-400" />
                          {isAnalyzingId === selectedMeeting.id ? "Analyzing..." : "Analyze Meeting"}
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  {/* --- UPCOMING MEETINGS TAB --- */}
                  {activeTab === 'upcoming' && (
                    <>
                      {getFilteredUpcoming().length === 0 ? (
                        <div className="py-16 flex flex-col items-center text-center gap-3">
                          <div className="w-14 h-14 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center">
                            <Video size={24} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold">No Upcoming Meetings Found</h3>
                            <p className="text-xs opacity-60 max-w-xs mt-1">Ready to sync? Click schedule above or ask the Zoom AI Assistant to book a slot for you.</p>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {getFilteredUpcoming().map(meeting => (
                            <motion.div
                              key={meeting.id}
                              whileHover={{ y: -2 }}
                              onClick={() => setSelectedMeeting(meeting)}
                              className={cn(
                                "p-5 rounded-[22px] border cursor-pointer hover:shadow-md transition-all flex flex-col justify-between group h-[170px]",
                                theme === 'light' ? "bg-white border-neutral-200/70" : "bg-neutral-900/30 border-neutral-800/80"
                              )}
                            >
                              <div>
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-500">
                                    <Clock size={10} />
                                    Upcoming
                                  </span>
                                  <span className="text-[10px] font-mono opacity-50">ID: {meeting.id}</span>
                                </div>
                                <h4 className="text-sm font-bold tracking-tight line-clamp-2 leading-snug group-hover:text-blue-500 transition-colors">
                                  {meeting.topic}
                                </h4>
                              </div>

                              <div className="space-y-2 border-t pt-3 border-neutral-100 dark:border-neutral-800/60 flex items-center justify-between">
                                <div className="space-y-0.5">
                                  <p className="text-[11px] font-semibold">
                                    {meeting.start_time ? new Date(meeting.start_time).toLocaleDateString(undefined, {
                                      month: 'short', day: 'numeric'
                                    }) : 'Scheduled'}
                                  </p>
                                  <p className="text-[10px] opacity-50">
                                    {meeting.start_time ? new Date(meeting.start_time).toLocaleTimeString(undefined, {
                                      hour: '2-digit', minute: '2-digit'
                                    }) : 'UTC'} ({meeting.duration || 40}m)
                                  </p>
                                </div>
                                
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (meeting.join_url) window.open(meeting.join_url, '_blank');
                                  }}
                                  className="px-3 py-1.5 bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                                >
                                  Join
                                  <ChevronRight size={12} />
                                </button>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* --- RECENT MEETINGS TAB --- */}
                  {activeTab === 'recent' && (
                    <>
                      {getFilteredRecent().length === 0 ? (
                        <div className="py-16 flex flex-col items-center text-center gap-3">
                          <div className="w-14 h-14 rounded-full bg-neutral-500/10 text-neutral-500 flex items-center justify-center">
                            <Clock size={24} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold">No Recent Past Meetings Found</h3>
                            <p className="text-xs opacity-60 max-w-xs mt-1">Historical meetings completed within this active user profile will accumulate here.</p>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {getFilteredRecent().map(meeting => (
                            <motion.div
                              key={meeting.id}
                              whileHover={{ y: -2 }}
                              onClick={() => setSelectedMeeting(meeting)}
                              className={cn(
                                "p-5 rounded-[22px] border cursor-pointer hover:shadow-md transition-all flex flex-col justify-between group h-[170px]",
                                theme === 'light' ? "bg-white border-neutral-200/70" : "bg-neutral-900/30 border-neutral-800/80"
                              )}
                            >
                              <div>
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-500/10 text-neutral-500">
                                    <Check size={10} />
                                    Completed
                                  </span>
                                  <span className="text-[10px] font-mono opacity-50">ID: {meeting.id}</span>
                                </div>
                                <h4 className="text-sm font-bold tracking-tight line-clamp-2 leading-snug group-hover:text-indigo-500 transition-colors">
                                  {meeting.topic}
                                </h4>
                              </div>

                              <div className="space-y-2 border-t pt-3 border-neutral-100 dark:border-neutral-800/60 flex items-center justify-between">
                                <div className="space-y-0.5">
                                  <p className="text-[11px] font-semibold">
                                    {meeting.start_time ? new Date(meeting.start_time).toLocaleDateString(undefined, {
                                      month: 'short', day: 'numeric'
                                    }) : 'Recent'}
                                  </p>
                                  <p className="text-[10px] opacity-50">
                                    {meeting.start_time ? new Date(meeting.start_time).toLocaleTimeString(undefined, {
                                      hour: '2-digit', minute: '2-digit'
                                    }) : 'UTC'} ({meeting.duration || 40}m)
                                  </p>
                                </div>
                                
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAnalyzeMeeting(meeting);
                                  }}
                                  className="px-3 py-1.5 bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500 hover:text-white rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                                >
                                  <Sparkles size={11} />
                                  Analyze
                                </button>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* --- CLOUD RECORDINGS TAB --- */}
                  {activeTab === 'recordings' && (
                    <>
                      {getFilteredRecordings().length === 0 ? (
                        <div className="py-16 flex flex-col items-center text-center gap-3">
                          <div className="w-14 h-14 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center">
                            <Play size={24} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold">No Cloud Recordings Found</h3>
                            <p className="text-xs opacity-60 max-w-xs mt-1">If Cloud recording is enabled in your Zoom settings, recording logs will dynamically appear here.</p>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {getFilteredRecordings().map(rec => (
                            <div
                              key={rec.id}
                              className={cn(
                                "p-5 rounded-[22px] border transition-all flex flex-col justify-between h-[170px]",
                                theme === 'light' ? "bg-white border-neutral-200/70" : "bg-neutral-900/30 border-neutral-800/80"
                              )}
                            >
                              <div>
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600">
                                    <Play size={10} className="fill-emerald-600 shrink-0" />
                                    Recording Ready
                                  </span>
                                  <span className="text-[10px] opacity-50">ID: {rec.meeting_id}</span>
                                </div>
                                <h4 className="text-sm font-bold tracking-tight line-clamp-2 leading-snug">
                                  {rec.topic}
                                </h4>
                              </div>

                              <div className="space-y-2 border-t pt-3 border-neutral-100 dark:border-neutral-800/60 flex items-center justify-between">
                                <div className="space-y-0.5">
                                  <p className="text-[11px] font-semibold">
                                    {new Date(rec.start_time).toLocaleDateString(undefined, {
                                      month: 'short', day: 'numeric'
                                    })}
                                  </p>
                                  <p className="text-[10px] opacity-50">
                                    Duration: {rec.duration} mins
                                  </p>
                                </div>

                                {rec.playback_url && (
                                  <a
                                    href={rec.playback_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                                  >
                                    Play Cloud
                                    <ExternalLink size={11} />
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* --- AI SUMMARIES TAB --- */}
                  {activeTab === 'summaries' && (
                    <>
                      {Object.keys(analyses).length === 0 ? (
                        <div className="py-16 flex flex-col items-center text-center gap-3">
                          <div className="w-14 h-14 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                            <Sparkles size={24} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold">No AI Summaries Generated Yet</h3>
                            <p className="text-xs opacity-60 max-w-xs mt-1">Select a past meeting from the &quot;Recent Past&quot; tab and trigger the &quot;Analyze&quot; button to get started.</p>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-4">
                          {meetings
                            .filter(m => !!analyses[m.id])
                            .map(m => (
                              <div
                                key={m.id}
                                className={cn(
                                  "p-5 rounded-[22px] border transition-all space-y-3 cursor-pointer hover:shadow-md",
                                  theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-900/30 border-neutral-800"
                                )}
                                onClick={() => setSelectedMeeting(m)}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-500">
                                    <Sparkles size={13} />
                                    Meeting Analysis
                                  </span>
                                  <span className="text-[10px] opacity-50">
                                    {m.start_time && new Date(m.start_time).toLocaleDateString()}
                                  </span>
                                </div>
                                <h3 className="text-sm font-bold truncate">{m.topic}</h3>
                                <p className="text-[11px] opacity-60 line-clamp-3 leading-relaxed whitespace-pre-line">
                                  {analyses[m.id]}
                                </p>
                              </div>
                            ))}
                        </div>
                      )}
                    </>
                  )}

                </motion.div>
              )}
            </AnimatePresence>

            {/* General progress indicators for ongoing analysis / operations */}
            <AnimatePresence>
              {isAnalyzingId && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-6 text-center"
                >
                  <div className={cn(
                    "p-6 rounded-[28px] border shadow-2xl max-w-sm w-full space-y-4",
                    theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-900 border-neutral-800"
                  )}>
                    <RefreshCw size={24} className="text-indigo-500 animate-spin mx-auto" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-extrabold tracking-tight">AI Meeting Review Analysis</h4>
                      <p className="text-[10px] opacity-60">Synchronizing with live Gemini cognitive summaries...</p>
                    </div>

                    <div className="border-t pt-3 border-neutral-200 dark:border-neutral-800 text-left space-y-1.5">
                      {aiAnalysisProgress.map((step, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-[10px] font-semibold text-emerald-500">
                          <Check size={11} className="stroke-[3]" />
                          <span className="truncate">{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </div>

        {/* Right Hand: Ask Zoom AI Assistant Panel */}
        <div className={cn(
          "w-full md:w-[380px] lg:w-[420px] flex flex-col h-full shrink-0",
          theme === 'light' ? "bg-[#fafafc]" : "bg-[#09090b]/40"
        )}>
          {/* Assistant Header */}
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-800/60 flex items-center justify-between bg-black/5 dark:bg-black/20">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-indigo-500" />
              <h3 className="text-xs font-bold">Ask Zoom AI Assistant</h3>
            </div>
            
            <div className="flex gap-1">
              <button 
                title="Clear Chat History"
                onClick={() => setChatMessages([
                  {
                    id: 'welcome',
                    role: 'model',
                    content: "Hello! Chat history cleared. How can I assist you with your Zoom account?"
                  }
                ])}
                className="p-1 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-500"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ scrollbarWidth: 'none' }}>
            {chatMessages.map(msg => (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col max-w-[85%] rounded-[20px] p-3.5 text-xs leading-relaxed transition-all",
                  msg.role === 'user' 
                    ? "bg-blue-600 text-white rounded-tr-none ml-auto"
                    : cn(
                        "rounded-tl-none border shadow-sm",
                        theme === 'light' ? "bg-white border-neutral-200 text-neutral-800" : "bg-neutral-900/60 border-neutral-800 text-neutral-200"
                      )
                )}
              >
                <div className="whitespace-pre-line prose dark:prose-invert">
                  {msg.content}
                </div>

                {/* Grounded Interactive Confirm/Cancel Actions Card inside model responses */}
                {msg.pendingConfirm && (
                  <div className={cn(
                    "mt-4 p-3.5 rounded-xl border flex flex-col gap-2 bg-black/10 text-[11px]",
                    theme === 'light' ? "border-neutral-200" : "border-neutral-700"
                  )}>
                    <div className="flex items-center gap-1.5 font-bold mb-1">
                      <AlertCircle size={13} className="text-yellow-500 shrink-0" />
                      <span>Confirm {msg.pendingConfirm.action === 'create' ? 'Scheduling' : msg.pendingConfirm.action === 'cancel' ? 'Cancellation' : 'Update'}</span>
                    </div>

                    <div className="space-y-1 text-[10.5px] opacity-80 leading-relaxed font-semibold">
                      {msg.pendingConfirm.action === 'create' && (
                        <>
                          <p>• Topic: {msg.pendingConfirm.params.topic}</p>
                          <p>• Time: {new Date(msg.pendingConfirm.params.startTime).toLocaleString()}</p>
                          <p>• Duration: {msg.pendingConfirm.params.duration || 40} mins</p>
                        </>
                      )}
                      {msg.pendingConfirm.action === 'cancel' && (
                        <>
                          <p>• Meeting ID: {msg.pendingConfirm.params.meetingId}</p>
                          <p>• Topic: {msg.pendingConfirm.params.topic || 'Zoom Meeting'}</p>
                        </>
                      )}
                      {msg.pendingConfirm.action === 'update' && (
                        <>
                          <p>• Meeting ID: {msg.pendingConfirm.params.meetingId}</p>
                          <p>• New Topic: {msg.pendingConfirm.params.topic}</p>
                          <p>• New Time: {msg.pendingConfirm.params.startTime && new Date(msg.pendingConfirm.params.startTime).toLocaleString()}</p>
                        </>
                      )}
                    </div>

                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleConfirmAction(msg.id, msg.pendingConfirm!.action, msg.pendingConfirm!.params)}
                        className="flex-1 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-bold transition-all active:scale-95 cursor-pointer"
                      >
                        Confirm Action
                      </button>
                      <button
                        onClick={() => handleCancelConfirmCard(msg.id)}
                        className="flex-1 py-1.5 bg-neutral-500/20 hover:bg-neutral-500/30 text-neutral-400 rounded-lg font-bold transition-all active:scale-95 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isChatLoading && (
              <div className="flex flex-col max-w-[85%] rounded-[20px] rounded-tl-none p-3.5 text-xs leading-relaxed border border-neutral-200 dark:border-neutral-800 bg-neutral-900/10 space-y-2">
                <div className="flex items-center gap-2">
                  <RefreshCw size={12} className="animate-spin text-indigo-500 shrink-0" />
                  <span className="font-bold text-[10px] opacity-60">AI is thinking...</span>
                </div>
                {chatProgressStep && (
                  <p className="text-[10px] text-emerald-500 font-bold animate-pulse">{chatProgressStep}</p>
                )}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick prompt suggestions */}
          <div className="px-4 py-2 border-t border-neutral-200 dark:border-neutral-800/60 flex flex-wrap gap-1.5 bg-black/5 dark:bg-black/20">
            {[
              "Summarize latest meeting",
              "Schedule meeting tomorrow 3 PM",
              "Which meetings last > 1 hour?"
            ].map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendChatMessage(undefined, p)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[10px] font-bold border truncate max-w-[170px] hover:scale-103 transition-all cursor-pointer",
                  theme === 'light' ? "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50" : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800"
                )}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Chat Form Input */}
          <form 
            onSubmit={handleSendChatMessage}
            className="p-3 border-t border-neutral-200 dark:border-neutral-800/60 flex items-center gap-2 bg-black/10 dark:bg-black/30"
          >
            <input
              type="text"
              placeholder="Ask Zoom AI to schedule, cancel or analyze..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className={cn(
                "flex-1 px-3 py-2 rounded-xl text-xs font-medium outline-none border focus:ring-1",
                theme === 'light' 
                  ? "bg-white border-neutral-200 focus:border-neutral-300 focus:ring-neutral-200" 
                  : "bg-neutral-950 border-neutral-800 focus:border-neutral-700 focus:ring-white/5"
              )}
            />
            <button
              type="submit"
              disabled={!chatInput.trim()}
              className={cn(
                "p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-40 disabled:scale-100 flex items-center justify-center cursor-pointer"
              )}
            >
              <Send size={14} />
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
