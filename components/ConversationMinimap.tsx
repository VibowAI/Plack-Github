'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronLeft } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
}

interface ConversationMinimapProps {
  messages: Message[];
  theme: 'light' | 'dark' | 'cosmic';
}

export default function ConversationMinimap({ messages, theme }: ConversationMinimapProps) {
  const [activeMessageId, setActiveMessageId] = useState<string>('');
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Extract only user messages
  const userMessages = (messages || []).filter(m => m.role === 'user' && m.content?.trim().length > 0);

  useEffect(() => {
    let rAFId: number;

    const handleScrollAndTrack = () => {
      cancelAnimationFrame(rAFId);
      rAFId = requestAnimationFrame(() => {
        let closestMsgId = '';
        let minDistance = Infinity;
        const targetY = window.innerHeight * 0.35; // focus zone

        messages.forEach((msg) => {
          if (msg.role !== 'user') return;
          const el = document.getElementById(`msg-${msg.id}`);
          if (el) {
            const rect = el.getBoundingClientRect();
            const elementCenter = rect.top + rect.height / 2;
            const dist = Math.abs(elementCenter - targetY);
            if (dist < minDistance) {
              minDistance = dist;
              closestMsgId = msg.id;
            }
          }
        });

        if (closestMsgId && closestMsgId !== activeMessageId) {
          setActiveMessageId(closestMsgId);
        }
      });
    };

    window.addEventListener('scroll', handleScrollAndTrack, { passive: true });
    handleScrollAndTrack();

    return () => {
      window.removeEventListener('scroll', handleScrollAndTrack);
      cancelAnimationFrame(rAFId);
    };
  }, [messages, activeMessageId]);

  if (userMessages.length === 0) return null;

  const handleNavigate = (msgId: string) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  };

  return (
    <div className="fixed right-6 top-1/2 -translate-y-1/2 z-40 hidden xl:flex items-center gap-2 pointer-events-auto">
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className={cn(
          "p-1.5 rounded-full shadow-sm hover:scale-105 transition-transform active:scale-95 border",
          theme === 'light' 
            ? "bg-white border-neutral-200 text-neutral-400 hover:text-neutral-700" 
            : theme === 'cosmic' 
              ? "bg-[#130d2e] border-indigo-500/30 text-indigo-300 hover:text-indigo-100" 
              : "bg-neutral-900 border-neutral-800 text-neutral-500 hover:text-neutral-200"
        )}
      >
        {isCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>

      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0, x: 20, width: 0 }}
            animate={{ opacity: 1, x: 0, width: 'auto' }}
            exit={{ opacity: 0, x: 20, width: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="overflow-hidden"
          >
            <div className={cn(
              "flex flex-col gap-2 p-2 rounded-[20px] max-h-[60vh] overflow-y-auto scrollbar-hide shadow-[0_8px_32px_rgba(0,0,0,0.06)] border backdrop-blur-xl",
              theme === 'light'
                ? "bg-white/80 border-white/60 shadow-black/5"
                : theme === 'cosmic'
                  ? "bg-[#130d2e]/80 border-indigo-500/20 shadow-indigo-500/10"
                  : "bg-neutral-900/80 border-neutral-800/80 shadow-black/40"
            )}
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <AnimatePresence>
                {userMessages.map((msg) => {
                  const isActive = msg.id === activeMessageId;
                  const preview = msg.content?.slice(0, 45).replace(/[#*`_~-]/g, '').trim() + (msg.content?.length > 45 ? '...' : '');

                  return (
                    <motion.button
                      key={msg.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      onClick={() => handleNavigate(msg.id)}
                      className={cn(
                        "text-left px-4 py-3 rounded-2xl transition-all duration-200 cursor-pointer w-[200px] text-[13px] font-medium leading-tight relative overflow-hidden group",
                        isActive
                          ? (theme === 'light' ? "bg-indigo-50 text-indigo-700 shadow-xs ring-1 ring-indigo-100" : "bg-indigo-500/20 text-indigo-100 ring-1 ring-indigo-500/30")
                          : (theme === 'light' ? "bg-neutral-50/80 text-neutral-600 hover:bg-neutral-100" : "bg-white/5 text-neutral-400 hover:bg-white/10")
                      )}
                    >
                      <span className="relative z-10 line-clamp-2">{preview}</span>
                      {isActive && (
                        <motion.div
                          layoutId="active-nav-indicator"
                          className={cn("absolute inset-0 z-0 opacity-10", theme === 'light' ? "bg-indigo-500" : "bg-indigo-400")}
                          initial={false}
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />
                      )}
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
