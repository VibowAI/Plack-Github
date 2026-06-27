'use client';

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { 
  X, 
  ExternalLink, 
  Link2, 
  Copy, 
  Globe, 
  Search, 
  BrainCircuit, 
  Paperclip, 
  MessageSquare, 
  History, 
  Sparkles, 
  FileText 
} from 'lucide-react';

export interface SourceItem {
  type: 'memory' | 'userSelectedMemories' | 'search' | 'deepResearch' | 'chatHistory' | 'files' | 'documents';
  title: string;
  details: string[];
  count: number;
  extraData?: any; // legacy Web chunks
}

interface SearchSourcesSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  sources: SourceItem[] | any[];
  theme: 'light' | 'dark' | 'cosmic';
  isMobile: boolean;
  width?: number;
}

export default function SearchSourcesSidebar({ isOpen, onClose, sources, theme, isMobile, width = 380 }: SearchSourcesSidebarProps) {
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Resilient normalization that supports both old web search chunks and the new category structure
  const normalizedSources = React.useMemo<SourceItem[]>(() => {
    if (!sources || sources.length === 0) return [];

    // If first item is structured, it is already in the new format
    if (sources[0]?.type) {
      return sources as SourceItem[];
    }

    // Otherwise format legacy grounding chunks list as a "Web Search" type source
    const webDetails = sources.map((source: any) => {
      const webInfo = source.web || source.retrievedContext;
      return webInfo?.uri || webInfo?.title || 'Web Search chunk';
    }).filter(Boolean);

    return [
      {
        type: 'search',
        title: 'Web Search',
        count: webDetails.length,
        details: webDetails,
        extraData: sources
      }
    ];
  }, [sources]);

  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'memory':
      case 'userSelectedMemories':
        return <BrainCircuit size={16} className="text-pink-500" />;
      case 'files':
        return <Paperclip size={16} className="text-amber-500" />;
      case 'chatHistory':
        return <History size={16} className="text-emerald-500" />;
      case 'deepResearch':
        return <Sparkles size={16} className="text-purple-500" />;
      case 'documents':
        return <FileText size={16} className="text-indigo-500" />;
      case 'search':
      default:
        return <Globe size={16} className="text-blue-500" />;
    }
  };

  const getCategoryStyles = (type: string) => {
    switch (type) {
      case 'memory':
      case 'userSelectedMemories':
        return {
          badge: "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20",
          card: "bg-pink-500/5 border-pink-500/10 hover:border-pink-500/30"
        };
      case 'files':
        return {
          badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
          card: "bg-amber-500/5 border-amber-500/10 hover:border-amber-500/30"
        };
      case 'chatHistory':
        return {
          badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
          card: "bg-emerald-500/5 border-emerald-500/10 hover:border-emerald-500/30"
        };
      case 'deepResearch':
        return {
          badge: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
          card: "bg-purple-500/5 border-purple-500/10 hover:border-purple-500/30"
        };
      case 'documents':
        return {
          badge: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
          card: "bg-indigo-500/5 border-indigo-500/10 hover:border-indigo-500/30"
        };
      case 'search':
      default:
        return {
          badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
          card: "bg-blue-500/5 border-blue-500/10 hover:border-blue-500/30"
        };
    }
  };

  const SidebarContent = (
    <div className="h-full flex flex-col">
      <div className={cn(
        "flex items-center justify-between px-5 pt-6 pb-4 border-b shrink-0",
        theme === 'light' ? "border-neutral-100" : (theme === 'cosmic' ? "border-indigo-500/10" : "border-neutral-800/50")
      )}>
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "p-2 rounded-xl flex items-center justify-center transition-all duration-300 shadow-sm", 
            theme === 'light' ? "bg-indigo-50 text-indigo-600" : "bg-indigo-500/10 text-indigo-400"
          )}>
            <Search size={16} className="stroke-[2.2px]" />
          </div>
          <div className="flex flex-col">
            <h2 className={cn("font-bold text-[13.5px] leading-tight", theme === 'light' ? "text-neutral-900" : "text-neutral-50")}>
              {isMobile ? "Sources" : "Response Sources"}
            </h2>
            {!isMobile && <span className="text-[10px] uppercase font-bold tracking-widest opacity-40 mt-0.5">Reference List</span>}
          </div>
        </div>
        <button
          onClick={onClose}
          className={cn(
            "p-2 rounded-xl transition-all duration-200 cursor-pointer group active:scale-90",
            theme === 'light' ? "hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600" : "hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300"
          )}
        >
          <X size={18} className="stroke-[2.5px]" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin">
        {normalizedSources && normalizedSources.length > 0 ? (
          normalizedSources.map((source: SourceItem, sIdx: number) => {
            const styles = getCategoryStyles(source.type);
            return (
              <div
                key={`source-card-${source.type}-${sIdx}`}
                className={cn(
                  "flex flex-col gap-4 p-4 rounded-[22px] border transition-all duration-300 group/source hover:shadow-md",
                  styles.card,
                  theme === 'light' 
                    ? "bg-white/50 border-neutral-100/80" 
                    : (theme === 'cosmic' ? "bg-indigo-950/20 border-indigo-500/10" : "bg-neutral-900/40 border-neutral-800/50")
                )}
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold">
                    {getSourceIcon(source.type)}
                    <span className={cn("text-xs tracking-tight", theme === 'light' ? "text-neutral-900" : "text-neutral-100")}>
                      {source.title}
                    </span>
                  </div>
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider font-mono", styles.badge)}>
                    Count • {source.count}
                  </span>
                </div>

                {/* Details list */}
                <div className="space-y-1.5">
                  {source.details.map((detail, dIdx) => {
                    // Check if it's a URL in a search category
                    const isUrl = source.type === 'search' && (detail.startsWith('http://') || detail.startsWith('https://'));
                    let domain = detail;
                    if (isUrl) {
                      try {
                        domain = new URL(detail).hostname.replace('www.', '');
                      } catch(_) {}
                    }

                    return (
                      <div 
                        key={`detail-${sIdx}-${dIdx}`} 
                        className={cn(
                          "text-[12.5px] leading-relaxed flex items-start gap-1.5",
                          theme === 'light' ? "text-neutral-600" : "text-neutral-300"
                        )}
                      >
                        <span className="text-[11px] select-none text-indigo-400 shrink-0 mt-0.5">•</span>
                        {isUrl ? (
                          <div className="flex flex-col gap-1 w-full min-w-0">
                            <a 
                              href={detail} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className={cn(
                                "font-bold text-[12.5px] inline-flex items-center gap-1 hover:underline truncate w-full",
                                theme === 'light' ? "text-indigo-600" : "text-indigo-400"
                              )}
                            >
                              {domain} <ExternalLink size={10} className="shrink-0" />
                            </a>
                            {source.extraData?.[dIdx]?.web?.title && (
                              <span className="text-[11.5px] opacity-70 truncate font-medium">
                                {source.extraData[dIdx].web.title}
                              </span>
                            )}
                            {source.extraData?.[dIdx]?.web?.snippet && (
                              <p className="text-[11.5px] opacity-65 leading-normal line-clamp-2 italic pt-0.5">
                                &quot;{source.extraData[dIdx].web.snippet}&quot;
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="break-words w-full">{detail}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center animate-fade-in">
             <div className={cn(
               "w-12 h-12 rounded-full flex items-center justify-center mb-4 opacity-40",
               theme === 'light' ? "bg-neutral-100" : "bg-neutral-800"
             )}>
                <Search size={20} className="text-neutral-400" />
             </div>
             <p className={cn("text-[13px] font-medium leading-relaxed max-w-[200px]", theme === 'light' ? "text-neutral-500" : "text-neutral-400")}>
               No sources were used for this response.
             </p>
          </div>
        )}
        {/* Bottom Safe area padding for mobile */}
        {isMobile && <div className="h-10 pb-safe" />}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Implementation (Bottom Sheet) */}
      <AnimatePresence>
        {isMobile && isOpen && (
          <div 
            key="search-sources-sidebar-root-mobile" 
            className="pointer-events-auto z-30 h-full"
          >
            <motion.div
              key="sources-mobile-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/60 backdrop-blur-md z-[200]"
            />
            <motion.div
              key="sources-mobile-sheet"
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.5 }}
              onDragEnd={(event, info) => {
                if (info.offset.y > 100 || info.velocity.y > 500) {
                  onClose();
                }
              }}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              className={cn(
                "fixed bottom-0 left-0 right-0 z-[201] rounded-t-[32px] max-h-[85vh] h-[85vh] overflow-hidden flex flex-col border-t",
                theme === 'light' ? "bg-white/95 border-neutral-200 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] backdrop-blur-xl" : "bg-neutral-900/95 border-neutral-800 shadow-2xl shadow-black backdrop-blur-xl"
              )}
            >
              <div className="flex justify-center p-3 shrink-0 cursor-grab active:cursor-grabbing">
                <div className={cn("w-12 h-1.5 rounded-full", theme === 'light' ? "bg-neutral-200" : "bg-neutral-700")} />
              </div>
              {SidebarContent}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* Desktop Implementation (Floating Sidebar) */}
      {!isMobile && (
        <div
          className={cn(
            "fixed top-4 bottom-4 right-4 z-45 overflow-hidden transition-all duration-300 rounded-[28px] border shadow-2xl select-none",
            isOpen ? "translate-x-0 opacity-100" : "translate-x-[450px] opacity-0 pointer-events-none",
            theme === 'light' 
              ? "bg-white/95 border-neutral-200/60 shadow-[0_8px_32px_rgba(0,0,0,0.06)] backdrop-blur-3xl" 
              : (theme === 'cosmic' 
                  ? "bg-[#090616]/95 border-indigo-500/10 shadow-[0_12px_40px_rgba(0,0,0,0.3)] backdrop-blur-3xl" 
                  : "bg-neutral-950/95 border-neutral-800/60 shadow-[0_12px_40px_rgba(0,0,0,0.3)] backdrop-blur-3xl")
          )}
          style={{ width }}
        >
          <div className="h-full flex flex-col">
            {SidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
