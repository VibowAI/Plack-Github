'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Video, X, Clock, Sparkles, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ZoomMeeting {
  id: string;
  topic: string;
  start_time: string;
  join_url: string;
}

export default function ZoomNotification({ theme }: { theme: 'light' | 'dark' | 'cosmic' }) {
  const [upcoming, setUpcoming] = useState<ZoomMeeting | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    const fetchUpcoming = async () => {
      try {
        const res = await fetch('/api/zoom/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'list' })
        });
        const data = await res.json();
        if (data.success && data.meetings && data.meetings.length > 0) {
          const next = data.meetings.sort((a: any, b: any) => 
            new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
          )[0];
          
          if (next && !dismissed.includes(next.id)) {
            const diff = new Date(next.start_time).getTime() - Date.now();
            const mins = Math.floor(diff / (1000 * 60));
            
            // Show if starting in less than 30 minutes and not started yet
            if (mins > -10 && mins <= 30) {
              setUpcoming(next);
              setTimeLeft(mins);
            } else {
              setUpcoming(null);
            }
          }
        }
      } catch (e) {
        console.error('Failed to fetch upcoming meeting for notification', e);
      }
    };

    fetchUpcoming();
    const interval = setInterval(fetchUpcoming, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [dismissed]);

  if (!upcoming) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className={cn(
          "fixed bottom-6 right-6 z-[100] w-[340px] p-5 rounded-[28px] border shadow-2xl overflow-hidden",
          theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-900 border-neutral-800"
        )}
      >
        {/* Progress Background */}
        <div className="absolute top-0 left-0 w-full h-1 bg-neutral-100 dark:bg-neutral-800">
          <motion.div 
            className="h-full bg-blue-500" 
            initial={{ width: "100%" }}
            animate={{ width: "0%" }}
            transition={{ duration: 60, ease: "linear" }}
          />
        </div>

        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Video size={20} className="text-white" />
            </div>
            <div>
              <h4 className="text-[13.5px] font-bold tracking-tight">Zoom Meeting</h4>
              <p className="text-[11px] opacity-50 font-bold uppercase tracking-wider">
                {timeLeft <= 0 ? 'Live Now' : `Starting in ${timeLeft} min`}
              </p>
            </div>
          </div>
          <button 
            onClick={() => setDismissed([...dismissed, upcoming.id])}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X size={14} className="opacity-40" />
          </button>
        </div>

        <div className="mb-5">
          <p className="text-[14px] font-bold truncate leading-tight">{upcoming.topic}</p>
          <div className="flex items-center gap-1.5 mt-1 opacity-50 text-[11px] font-medium">
            <Clock size={12} />
            {new Date(upcoming.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <a 
            href={upcoming.join_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-[12px] font-bold hover:bg-blue-500 transition-all active:scale-95 cursor-pointer"
          >
            Join
          </a>
          <button 
            className={cn(
              "flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold border transition-all active:scale-95 cursor-pointer",
              theme === 'light' ? "border-neutral-200 hover:bg-neutral-50" : "border-neutral-800 hover:bg-neutral-800"
            )}
          >
            <Sparkles size={13} className="text-amber-500" />
            Ask AI
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
