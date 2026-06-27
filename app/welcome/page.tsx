'use client';

import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowRight, MessageSquare, Search, FileText, Brain, Sparkles, Check } from 'lucide-react';
import brandingLogo from '@/src/assets/images/branding_logo_1780697091587.png';

export default function WelcomePage() {
  const router = useRouter();

  const handleStart = () => {
    router.push('/');
  };

  return (
    <div className="relative min-h-screen bg-[#020204] text-neutral-100 font-sans overflow-x-hidden selection:bg-indigo-500/30 selection:text-white">
      
      {/* Background radial glow accents */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-indigo-500/[0.03] blur-[150px]" />
        <div className="absolute top-[30%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-rose-500/[0.02] blur-[130px]" />
        <div className="absolute bottom-[-10%] left-[20%] w-[55vw] h-[55vw] rounded-full bg-purple-500/[0.03] blur-[150px]" />
        
        {/* Subtle grid pattern background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      {/* Navigation Bar */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-6 h-20 flex items-center justify-between border-b border-white/[0.04]">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-neutral-900/80 p-0.5 border border-white/[0.08] shadow-[0_0_15px_rgba(239,68,68,0.15)] flex items-center justify-center">
            <Image 
              src={brandingLogo} 
              alt="Plack Logo" 
              className="w-8 h-8 object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <span className="text-lg font-bold tracking-tight text-white font-display">Plack AI</span>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleStart}
            className="text-[13px] font-semibold text-neutral-400 hover:text-white transition-colors cursor-pointer px-4 py-2"
          >
            Sign In
          </button>
          <button
            onClick={handleStart}
            className="text-[13px] font-semibold bg-white text-neutral-950 px-5 h-9 rounded-lg hover:bg-neutral-200 transition-all cursor-pointer shadow-md inline-flex items-center gap-1.5"
          >
            Get Started
            <ArrowRight size={13} />
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-16 pb-20 md:pt-24 md:pb-32 flex flex-col items-center justify-center text-center">
        
        {/* Release Pill Tag */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/20 bg-indigo-500/5 text-indigo-300 text-xs font-mono font-bold tracking-widest uppercase mb-8 backdrop-blur-sm shadow-sm"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Plack Intelligent Workspace 1.0</span>
        </motion.div>

        {/* Huge Slogan */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.15 }}
          className="text-[2.5rem] sm:text-[3.5rem] md:text-[4.75rem] font-bold tracking-tight text-white leading-[1.1] max-w-4xl font-display mb-8"
        >
          Intellect without borders. <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-300 to-pink-400">
            Workspace with absolute style.
          </span>
        </motion.h1>

        {/* Slogan Description */}
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
          className="text-neutral-400 text-base sm:text-lg md:text-[20px] leading-relaxed max-w-2xl font-light mb-12"
        >
          A minimal workspace forged for deep analysis, rich semantic research, and premium real-time interactions. Designed for the hyper-focused.
        </motion.p>

        {/* Apple-style Animated Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.45 }}
          className="relative group cursor-pointer w-full max-w-xl"
          onClick={handleStart}
        >
          <div className="absolute -inset-0.5 rounded-[2.5rem] bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-20 blur-xl group-hover:opacity-40 transition-opacity duration-700" />
          
          <div className="relative flex items-center justify-between gap-4 sm:gap-8 pl-6 sm:pl-10 pr-2.5 py-2.5 rounded-[2.2rem] bg-[#0c0c0e]/80 border border-white/[0.08] backdrop-blur-3xl shadow-2xl hover:bg-white/[0.04] transition-all duration-500">
            <div className="flex flex-col items-start overflow-hidden">
               <motion.div 
                 className="flex items-center gap-2 mb-1"
                 initial={{ x: -5, opacity: 0 }}
                 animate={{ x: 0, opacity: 1 }}
                 transition={{ duration: 0.8, delay: 0.65 }}
               >
                 <span className="text-[1.25rem] sm:text-[1.6rem] font-bold tracking-tight text-white leading-none">
                   Plack AI is cool.
                 </span>
                 <Sparkles size={16} className="text-indigo-400 animate-pulse" />
               </motion.div>
               <span className="text-[10px] sm:text-[11px] text-neutral-400 font-semibold tracking-[0.1em] uppercase opacity-70">
                 Explore the new intel interface
               </span>
            </div>
            
            <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-white text-black flex items-center justify-center group-hover:scale-105 group-active:scale-[0.96] transition-all duration-500 shadow-[0_0_25px_rgba(255,255,255,0.4)]">
              <ArrowRight size={26} className="group-hover:translate-x-1 transition-transform duration-500 ease-in-out" />
            </div>
          </div>
          
          <div className="mt-4 text-[11px] text-neutral-500 font-mono tracking-widest uppercase opacity-40">
            SECURE ACCESS PROTOCOLS ENABLED
          </div>
        </motion.div>

        {/* Decorative High-Fidelity UI Illustration Board */}
        <motion.div
          initial={{ opacity: 0, y: 35, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.6 }}
          className="w-full max-w-5xl mt-20 relative px-2"
        >
          {/* Neon Purple/Rose glow backdrop behind mock device */}
          <div className="absolute inset-10 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 rounded-[32px] blur-[80px] pointer-events-none z-0" />
          
          <div className="relative border border-white/[0.08] bg-neutral-950/60 rounded-[24px] p-4 sm:p-6 shadow-2xl backdrop-blur-xl flex flex-col h-[340px] sm:h-[480px]">
            {/* Top Bar Header controls */}
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4 mb-4">
              <div className="flex gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500/40" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/40" />
                <span className="w-3 h-3 rounded-full bg-green-500/40" />
              </div>
              <div className="px-4 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[10px] text-neutral-400 font-mono tracking-wider">
                plack.ai/workspace-v1
              </div>
              <div className="w-12 h-2 bg-transparent" />
            </div>

            {/* Dashboard Inner Representation */}
            <div className="flex flex-1 gap-4 overflow-hidden text-left font-sans">
              
              {/* Sidebar Representation */}
              <div className="hidden sm:flex flex-col w-[180px] border-r border-white/[0.04] pr-4 gap-4">
                <div className="w-full h-8 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center px-2 gap-2 text-[10.5px] font-bold text-neutral-300">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  Workspace Ready
                </div>
                <div className="flex flex-col gap-2 mt-2">
                  <span className="h-6 rounded-md bg-white/[0.02]" />
                  <span className="h-6 rounded-md bg-white/[0.01]" />
                  <span className="h-6 rounded-md bg-white/[0.01]" />
                  <span className="h-6 rounded-md bg-white/[0.01]" />
                </div>
              </div>

              {/* Chat View Representation */}
              <div className="flex-1 flex flex-col justify-between p-2">
                <div className="flex flex-col gap-4 overflow-hidden">
                  <div className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-[10px] uppercase font-bold">AI</span>
                    <div className="flex-1 space-y-2 max-w-sm">
                      <div className="h-3.5 rounded bg-white/[0.06]" />
                      <div className="h-3.5 rounded bg-white/[0.06] w-[85%]" />
                      <div className="h-3.5 rounded bg-white/[0.06] w-[60%]" />
                    </div>
                  </div>
                  <div className="flex gap-3 justify-end">
                    <div className="space-y-1 max-w-[200px] text-right">
                      <div className="h-3.5 rounded bg-indigo-500/20 w-40" />
                    </div>
                    <span className="w-6 h-6 rounded-full bg-neutral-800 text-neutral-400 flex items-center justify-center text-[10px] uppercase font-bold">ME</span>
                  </div>
                </div>

                {/* Input box */}
                <div className="h-12 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center px-4 justify-between mt-auto">
                  <span className="text-[11.5px] text-neutral-500">Ask Plack AI anything or search sources...</span>
                  <div className="h-6 w-12 rounded-lg bg-indigo-600 flex items-center justify-center">
                    <ArrowRight size={12} className="text-white" />
                  </div>
                </div>
              </div>

            </div>
          </div>
        </motion.div>
      </section>

      {/* Features Grid Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-20 border-t border-white/[0.04] bg-[#030306]/70">
        
        <div className="text-center mb-16">
          <h2 className="text-[13px] font-mono tracking-widest text-indigo-400 uppercase font-bold mb-3">Capabilities Panel</h2>
          <h2 className="text-3xl md:text-4xl font-semibold text-white tracking-tight font-display">
            Engineered with absolute precision.
          </h2>
          <p className="text-neutral-500 text-[14.5px] max-w-lg mx-auto mt-3 font-light leading-relaxed">
            Plack implements and exposes real core features with no artificial embellishments or simulated stats.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          
          {/* Card 1: AI Chat */}
          <div className="relative border border-white/[0.06] bg-neutral-950/40 rounded-2xl p-6 flex flex-col gap-4 group transition-colors hover:bg-neutral-950 hover:border-white/[0.12] overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <MessageSquare size={18} />
            </div>
            <h3 className="text-lg font-semibold text-white tracking-tight mt-2">AI Chat Dialogues</h3>
            <p className="text-[13px] text-neutral-500 leading-relaxed font-light">
              High-speed multimodal interactions supporting detailed discussions across diverse domains with active intelligence.
            </p>
          </div>

          {/* Card 2: Web Search */}
          <div className="relative border border-white/[0.06] bg-neutral-950/40 rounded-2xl p-6 flex flex-col gap-4 group transition-colors hover:bg-neutral-950 hover:border-white/[0.12] overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
              <Search size={18} />
            </div>
            <h3 className="text-lg font-semibold text-white tracking-tight mt-2">Web Search Grounding</h3>
            <p className="text-[13px] text-neutral-500 leading-relaxed font-light">
              Retrieve real-time search context from current events and facts. Automatically returns citations and source references.
            </p>
          </div>

          {/* Card 3: File Analysis */}
          <div className="relative border border-white/[0.06] bg-neutral-950/40 rounded-2xl p-6 flex flex-col gap-4 group transition-colors hover:bg-neutral-950 hover:border-white/[0.12] overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
              <FileText size={18} />
            </div>
            <h3 className="text-lg font-semibold text-white tracking-tight mt-2">File Analysis</h3>
            <p className="text-[13px] text-neutral-500 leading-relaxed font-light">
              Securely attach multiple files and extract core semantic insights or search and map logical structures directly.
            </p>
          </div>

          {/* Card 4: Smart Conversations */}
          <div className="relative border border-white/[0.06] bg-neutral-950/40 rounded-2xl p-6 flex flex-col gap-4 group transition-colors hover:bg-neutral-950 hover:border-white/[0.12] overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Brain size={18} />
            </div>
            <h3 className="text-lg font-semibold text-white tracking-tight mt-2">Semantic Memory</h3>
            <p className="text-[13px] text-neutral-500 leading-relaxed font-light">
              Effortlessly tracks and categorizes history while preserving clean local session memory of your logical processes.
            </p>
          </div>

        </div>

      </section>

      {/* Trust & Ethics Section */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 py-20 text-center flex flex-col items-center">
        <h2 className="text-3xl font-semibold text-white tracking-tight font-display mb-6">Designed with Absolute Focus.</h2>
        <p className="text-neutral-400 text-[14.5px] leading-relaxed max-w-xl font-light mb-10">
          No credit cards required to explore. Fully integrates your sessions with private encryption standards. Simple, transparent, high-performance workspace for the forward-thinking.
        </p>
        <div className="flex gap-8 items-center text-[13px] text-neutral-500 font-mono">
          <div className="flex items-center gap-1.5">
            <Check size={14} className="text-indigo-400" />
            <span>Encrypted Connections</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Check size={14} className="text-indigo-400" />
            <span>Zero Marketing Spam</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-7xl mx-auto px-6 py-10 border-t border-white/[0.04] text-neutral-500 text-xs flex flex-col sm:flex-row items-center justify-between gap-4 bg-transparent">
        <div>
          © 2026 Plack AI Technologies. All rights reserved. Built with extreme attention to detail.
        </div>
        <div className="flex items-center gap-6 font-semibold">
          <a href="/privacypolicy" className="hover:text-white transition-colors">Privacy Policy</a>
          <a href="/termsofservice" className="hover:text-white transition-colors">Terms of Service</a>
        </div>
      </footer>

    </div>
  );
}
