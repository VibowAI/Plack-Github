'use client';

import React from 'react';
import { FileText, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useAppContext } from '@/context/AppContext';

export default function TermsOfServicePage() {
  const { theme } = useAppContext();

  return (
    <div className={cn(
      "min-h-screen font-sans transition-colors duration-300 flex flex-col",
      theme === 'light' ? "bg-[#fcfcfc] text-neutral-900" :
      theme === 'cosmic' ? "bg-[#04020a] text-indigo-50" :
      "bg-[#060606] text-white"
    )}>
      {/* Header */}
      <header className={cn(
        "h-20 px-6 md:px-10 flex items-center justify-between border-b backdrop-blur-md sticky top-0 z-20",
        theme === 'light' ? "border-neutral-200/60 bg-white/70" :
        theme === 'cosmic' ? "border-indigo-500/10 bg-[#09051c]/60" :
        "border-neutral-800/60 bg-[#0a0a0a]/70"
      )}>
        <div className="flex items-center gap-4">
          <Link 
            href="/"
            className={cn(
              "p-2 rounded-full transition-all active:scale-95 flex items-center justify-center",
              theme === 'light' ? "hover:bg-neutral-100 text-neutral-500" : "hover:bg-white/10 text-neutral-400"
            )}
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <FileText size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Terms of Service</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-3xl mx-auto px-6 py-12 md:py-20 w-full">
        <div className="space-y-10">
          <p className="text-[16px] leading-relaxed text-neutral-500 dark:text-neutral-400 font-medium italic text-center border-b pb-10 border-neutral-200 dark:border-neutral-800">
            &quot;Plack AI provides cutting-edge intelligence services subject to our terms, designed to empower your productivity while maintaining a secure and professional environment.&quot;
          </p>
          
          <div className="space-y-8">
            <section className="space-y-4">
              <h2 className="text-lg font-bold uppercase tracking-wider text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs">1</span>
                Service Utilization
              </h2>
              <p className={cn("text-[15px] leading-relaxed ml-10", theme === 'light' ? "text-neutral-600 font-medium" : "text-neutral-400")}>
                Users agree to utilize Plack AI services for lawful purposes only and in compliance with all applicable local, state, and international regulations. Unauthorized use or interference with platform services is strictly prohibited.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-lg font-bold uppercase tracking-wider text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs">2</span>
                Intellectual Property
              </h2>
              <p className={cn("text-[15px] leading-relaxed ml-10", theme === 'light' ? "text-neutral-600 font-medium" : "text-neutral-400")}>
                All platform architecture, design elements, and intellectual property remain the exclusive property of Plack AI and its parent entities. You are granted a limited, non-exclusive license to use the services as intended.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-lg font-bold uppercase tracking-wider text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs">3</span>
                Limitation of Liability
              </h2>
              <p className={cn("text-[15px] leading-relaxed ml-10", theme === 'light' ? "text-neutral-600 font-medium" : "text-neutral-400")}>
                Plack AI shall not be held liable for any indirect, incidental, or consequential damages resulting from the use or inability to use our platform services. Our services are provided &quot;as is&quot; without warranties of any kind.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-lg font-bold uppercase tracking-wider text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs">4</span>
                Account Responsibility
              </h2>
              <p className={cn("text-[15px] leading-relaxed ml-10", theme === 'light' ? "text-neutral-600 font-medium" : "text-neutral-400")}>
                You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. Plack AI reserves the right to terminate accounts that violate these terms.
              </p>
            </section>
          </div>

          <div className="pt-20 text-center">
            <Link 
              href="/"
              className={cn(
                "inline-flex items-center justify-center px-10 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95 shadow-lg",
                theme === 'light' ? "bg-neutral-900 text-white hover:bg-neutral-800 shadow-neutral-200" : "bg-white text-black hover:bg-neutral-200 shadow-black/20"
              )}
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </main>

      {/* Footer Meta */}
      <footer className={cn(
        "py-10 text-center border-t",
        theme === 'light' ? "border-neutral-100 text-neutral-400" : "border-neutral-900 text-neutral-600"
      )}>
        <p className="text-xs font-medium uppercase tracking-[0.2em]">Latest Update: June 2026</p>
      </footer>
    </div>
  );
}
