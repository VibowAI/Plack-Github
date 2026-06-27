import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Search, ChevronRight, X, Workflow, LayoutGrid, Zap, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ConnectionsViewProps {
  theme: 'light' | 'dark' | 'cosmic';
  gmailAccessToken: string | null;
  gmailEmail: string | null;
  gmailName: string | null;
  onConnectGmail: () => void;
  onDisconnectGmail: () => void;
  onClose: () => void;
  isSidebarOpen?: boolean;
  sidebarWidth?: number;
  isMobile?: boolean;
}

export default function ConnectionsView({
  theme,
  gmailAccessToken,
  gmailEmail,
  gmailName,
  onConnectGmail,
  onDisconnectGmail,
  onClose,
  isSidebarOpen,
  sidebarWidth = 280,
  isMobile
}: ConnectionsViewProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all'|'connected'>('all');

  const apps = [
    {
      id: 'gmail',
      name: 'Gmail',
      description: 'Draft emails, summarize threads, and prepare replies directly from chat.',
      icon: <Mail size={24} className="text-red-500" />,
      color: 'bg-red-500/10 border-red-500/15',
      connected: !!gmailAccessToken,
      comingSoon: false,
      category: 'productivity',
      email: gmailEmail,
      label: 'Google Workspace'
    }
  ];

  const filteredApps = apps.filter(app => {
    if (filter === 'connected' && !app.connected) return false;
    if (search && !app.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={cn(
        "fixed inset-0 flex flex-col font-sans relative z-40 transition-colors duration-300 overflow-x-hidden",
        theme === 'light' ? "bg-[#fcfcfc] text-neutral-800" :
        theme === 'cosmic' ? "bg-[#04020a] text-indigo-50" :
        "bg-[#060606] text-neutral-100"
      )}
      style={{
        paddingLeft: isSidebarOpen && !isMobile ? `${sidebarWidth}px` : '0px'
      }}
    >
      {/* Background Ambience */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        {theme === 'cosmic' && (
          <>
            <div className="absolute top-[10%] left-[20%] w-[30rem] h-[30rem] bg-indigo-500/5 blur-[120px] rounded-full mix-blend-screen" />
            <div className="absolute bottom-[20%] right-[10%] w-[25rem] h-[25rem] bg-rose-500/5 blur-[100px] rounded-full mix-blend-screen" />
          </>
        )}
        {theme === 'dark' && (
           <div className="absolute top-1/4 left-1/4 w-[40vw] h-[40vw] bg-neutral-900/40 blur-[120px] rounded-full" />
        )}
        {theme === 'light' && (
           <div className="absolute top-0 right-0 w-[50vw] h-[50vh] bg-neutral-100/60 blur-[100px] rounded-bl-full" />
        )}
      </div>

      {/* Header */}
      <header className={cn(
        "flex-none h-[80px] px-6 md:px-10 flex items-center justify-between border-b backdrop-blur-md sticky top-0 z-20 transition-colors",
        theme === 'light' ? "border-neutral-200/60 bg-white/70" :
        theme === 'cosmic' ? "border-indigo-500/10 bg-[#09051c]/60" :
        "border-neutral-800/60 bg-[#0a0a0a]/70"
      )}>
        <div className="flex items-center gap-5">
          <button 
            type="button"
            onClick={onClose}
            className={cn(
              "p-2.5 rounded-full cursor-pointer transition-all active:scale-95 flex items-center justify-center",
              theme === 'light' ? "hover:bg-neutral-100 text-neutral-500 bg-white shadow-sm border border-neutral-200" : "hover:bg-white/10 text-neutral-400 bg-neutral-900 shadow-sm border border-neutral-800"
            )}
          >
            <X size={20} />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight leading-none mb-1.5">Connections Hub</h1>
            <p className="text-[13.5px] opacity-60 font-medium">Extend Plack AI with your everyday tools.</p>
          </div>
        </div>
      </header>

      {/* Content Canvas */}
      <div className="flex-1 overflow-y-auto px-6 md:px-10 py-10 w-full" style={{ scrollbarWidth: 'none' }}>
        <div className="max-w-6xl mx-auto space-y-12 pb-24">
          
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className={cn(
              "flex items-center p-1.5 rounded-xl border w-full sm:w-auto shadow-sm",
              theme === 'light' ? "bg-white border-neutral-200/80" : "bg-neutral-900/50 border-neutral-800"
            )}>
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={cn(
                  "px-4 py-1.5 text-[13px] font-bold rounded-lg transition-all cursor-pointer",
                  filter === 'all' 
                    ? (theme === 'light' ? "bg-neutral-100/80 text-neutral-900 shadow-sm" : "bg-neutral-800 text-white") 
                    : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                )}
              >
                All Apps
              </button>
              <button
                type="button"
                onClick={() => setFilter('connected')}
                className={cn(
                  "px-4 py-1.5 text-[13px] font-bold rounded-lg transition-all cursor-pointer",
                  filter === 'connected' 
                    ? (theme === 'light' ? "bg-neutral-100/80 text-neutral-900 shadow-sm" : "bg-neutral-800 text-white") 
                    : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                )}
              >
                Connected
              </button>
            </div>

            <div className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl border w-full sm:w-[320px] shadow-sm transition-all focus-within:ring-2",
              theme === 'light' ? "bg-white border-neutral-200/80 focus-within:border-neutral-300 focus-within:ring-neutral-200" : "bg-neutral-900/50 border-neutral-800 focus-within:border-neutral-700 focus-within:ring-white/10"
            )}>
              <Search size={16} className={theme === 'light' ? "text-neutral-400 shrink-0" : "text-neutral-500 shrink-0"} />
              <input 
                type="text" 
                placeholder="Search tools & integrations..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent border-none outline-none text-[13.5px] w-full font-medium"
              />
            </div>
          </div>

          {/* Apps Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredApps.map((app, idx) => (
              <motion.div
                key={app.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05, duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                className={cn(
                  "group relative overflow-hidden rounded-[28px] border p-[1px] shadow-sm transition-all hover:shadow-md",
                  theme === 'light' ? "bg-white border-neutral-200/60" :
                  theme === 'cosmic' ? "bg-indigo-950/20 border-indigo-500/20" :
                  "bg-neutral-900/30 border-neutral-800/80"
                )}
              >
                <div className={cn(
                  "p-7 h-full flex flex-col rounded-[27px] transition-colors relative z-10",
                  theme === 'light' ? "bg-neutral-50/20 group-hover:bg-neutral-50/60" : "bg-neutral-900/10 group-hover:bg-neutral-900/30"
                )}>
                  {/* Top line */}
                  <div className="flex items-start justify-between mb-6">
                    <div className={cn(
                      "w-14 h-14 rounded-2xl flex items-center justify-center border shadow-sm transform group-hover:scale-[1.03] group-hover:-rotate-[-2deg] transition-transform duration-300",
                      app.color
                    )}>
                      {app.icon}
                    </div>
                    {app.comingSoon ? (
                      <span className={cn(
                        "px-2.5 py-1.5 text-[10.5px] font-bold rounded-full uppercase tracking-wider",
                        theme === 'light' ? "bg-neutral-100 text-neutral-500" : "bg-neutral-800 text-neutral-400"
                      )}>
                        Coming Soon
                      </span>
                    ) : app.connected ? (
                      <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-bold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                        <CheckCircle2 size={14} className="stroke-[2.5px]" />
                        Connected
                      </span>
                    ) : null}
                  </div>

                  {/* Body */}
                  <div className="flex-1 space-y-3">
                    <h3 className="text-xl font-bold tracking-tight">{app.name}</h3>
                    <p className={cn(
                      "text-[13.5px] leading-relaxed",
                      theme === 'light' ? "text-neutral-500 font-medium" : "text-neutral-400"
                    )}>
                      {app.description}
                    </p>
                    
                    {/* Account Info (if connected) */}
                    {app.connected && app.email && (
                      <div className={cn(
                        "mt-5 p-3.5 rounded-xl border flex items-center gap-3",
                        theme === 'light' ? "bg-white border-neutral-200" : "bg-black/20 border-white/5"
                      )}>
                        <div className="w-9 h-9 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center text-[11px] font-bold uppercase shrink-0">
                          {app.email.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={cn(
                            "text-[12.5px] font-bold truncate leading-tight mb-0.5",
                             theme === 'light' ? "text-neutral-900" : "text-neutral-100"
                          )}>
                            {app.email}
                          </p>
                          <p className="text-[11px] font-medium text-emerald-600/80 truncate">Authenticated session active</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer actions */}
                  <div className={cn(
                    "mt-8 pt-5 border-t border-dashed flex justify-end",
                    theme === 'light' ? "border-neutral-200" : "border-neutral-800"
                  )}>
                    {app.comingSoon ? (
                      <button type="button" disabled className="text-[13px] font-bold text-neutral-400 cursor-not-allowed">
                        In Development
                      </button>
                    ) : app.connected ? (
                      <button 
                        type="button"
                        onClick={() => app.id === 'gmail' && onDisconnectGmail()}
                        className="text-[13px] font-bold text-red-500 hover:text-red-600 hover:underline transition-colors active:scale-95 cursor-pointer"
                      >
                        Disconnect Integration
                      </button>
                    ) : (
                      <button 
                        type="button"
                        onClick={() => app.id === 'gmail' && onConnectGmail()}
                        className={cn(
                          "px-5 py-2.5 rounded-xl text-[13.5px] font-bold transition-all flex items-center gap-2 active:scale-95 shadow-sm group-hover:shadow-md cursor-pointer",
                          theme === 'light' ? "bg-neutral-900 text-white hover:bg-neutral-800" : "bg-white text-black hover:bg-neutral-200"
                        )}
                      >
                        Connect {app.name}
                        <ChevronRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

        </div>
      </div>
    </motion.div>
  );
}
