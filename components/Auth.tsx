'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useSpring, useTransform, useMotionValue } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { Loader2, Sparkles, Mail, Lock, User, CheckCircle2, HelpCircle, Info, X, Activity, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

// Static import of custom-generated premium AI background illustration
import bgImage from '@/src/assets/images/auth_image_background.png';
import brandingLogo from '@/src/assets/images/branding_logo_1780697091587.png';

export default function Auth({ onClose }: { onClose?: () => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);
  const [discordLoading, setDiscordLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // States for account provider validation and login safety
  const [detectedProvider, setDetectedProvider] = useState<'google' | 'email' | 'none' | null>(null);
  const [isCheckingProvider, setIsCheckingProvider] = useState(false);

  const supabase = createClient();

  // Mouse Parallax & Tilt Motion
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  const cardRotateX = useSpring(useTransform(mouseY, [0, 1], [4, -4]), { stiffness: 70, damping: 25 });
  const cardRotateY = useSpring(useTransform(mouseX, [0, 1], [-4, 4]), { stiffness: 70, damping: 25 });

  // Custom Background Parallax (Slight contrary translation for a deeper 3D volume)
  const bgTranslateX = useSpring(useTransform(mouseX, [0, 1], [-15, 15]), { stiffness: 40, damping: 22 });
  const bgTranslateY = useSpring(useTransform(mouseY, [0, 1], [-15, 15]), { stiffness: 40, damping: 22 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const { innerWidth, innerHeight } = window;
      mouseX.set(e.clientX / innerWidth);
      mouseY.set(e.clientY / innerHeight);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY]);

  const checkEmailProvider = async (emailToCheck: string) => {
    if (!emailToCheck || !emailToCheck.includes('@')) {
      setDetectedProvider(null);
      return;
    }
    setIsCheckingProvider(true);
    try {
      const res = await fetch('/api/auth-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: emailToCheck }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.exists) {
          if (data.providers?.google && !data.providers?.email) {
            setDetectedProvider('google');
          } else if (data.providers?.email) {
            setDetectedProvider('email');
          } else {
            setDetectedProvider('none');
          }
        } else {
          setDetectedProvider('none');
        }
      }
    } catch (err) {
      console.error('Error checking auth provider state:', err);
    } finally {
      setIsCheckingProvider(false);
    }
  };

  const getFriendlyAuthError = (err: any): string => {
    if (!err) return 'An unexpected authentication error occurred.';
    const msg = err.message || '';
    
    if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials')) {
      return 'Incorrect email or password. Please verify your credentials and try again.';
    }
    if (msg.includes('Email not confirmed') || msg.includes('email_not_confirmed')) {
      return 'This email address has not been confirmed. Please check your inbox for a confirmation link.';
    }
    if (msg.includes('User already exists') || msg.includes('user_already_exists')) {
      return 'An account with this email address already exists. Try logging in instead.';
    }
    if (msg.includes('Password should be')) {
      return 'For security, your password must be at least 6 characters long.';
    }
    if (msg.includes('Rate limit exceeded') || msg.includes('rate_limit')) {
      return 'Too many login attempts. Please wait a few minutes before trying again.';
    }
    if (msg.includes('provider is not enabled')) {
      return 'The requested sign-in method is currently disabled.';
    }
    if (msg.includes('session_not_found') || msg.includes('Session not found')) {
      return 'Your session has expired. Please log in again.';
    }
    
    return msg || 'An error occurred during authentication. Please contact support if the issue persists.';
  };

  const handleGoogleAuth = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(getFriendlyAuthError(err));
      setGoogleLoading(false);
    }
  };

  const handleGitHubAuth = async () => {
    setGithubLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(getFriendlyAuthError(err));
      setGithubLoading(false);
    }
  };

  const handleDiscordAuth = async () => {
    setDiscordLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'discord',
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(getFriendlyAuthError(err));
      setDiscordLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResetSuccess(false);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/`,
      });
      if (error) throw error;
      setResetSuccess(true);
    } catch (err: any) {
      setError(getFriendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        // Enforce provider lock checking
        const res = await fetch('/api/auth-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data.exists && data.providers?.google && !data.providers?.email) {
            setError('This account was created using Google Sign-In. Please sign in with Google.');
            setLoading(false);
            return;
          }
        }

        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
      } else {
        // Sign-up check: verify no google user already exists for this email
        const res = await fetch('/api/auth-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data.exists) {
            if (data.providers?.google) {
              setError('An account with this email already exists using Google Sign-In. Please sign in with Google instead of creating a duplicate.');
              setLoading(false);
              return;
            } else {
              setError('An account with this email address already exists. Try logging in instead.');
              setLoading(false);
              return;
            }
          }
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name }
          }
        });
        if (error) throw error;
        // Also sign in if sign up succeeds without email confirmation constraint
        await supabase.auth.signInWithPassword({ email, password });
      }
    } catch (err: any) {
      setError(getFriendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-[#020204] text-neutral-100 overflow-hidden font-sans select-none">
      
      {/* Optional Close Button for Landing-Page Modal representation */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-6 right-6 p-3 rounded-full bg-white/[0.04] border border-white/[0.08] text-neutral-450 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer z-[60] active:scale-95"
          title="Return to Welcome Screen"
        >
          <X size={18} />
        </button>
      )}

      {/* Background Frame with custom AI illustration and soft parallax */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0">
        <motion.div 
          style={{ x: bgTranslateX, y: bgTranslateY, scale: 1.05 }}
          className="absolute inset-0 w-full h-full"
          initial={{ opacity: 0, scale: 1.08 }}
          animate={{ opacity: 0.9, scale: 1.05 }}
          transition={{ duration: 1.8, ease: 'easeOut' }}
        >
          <Image
            src={bgImage}
            alt="Futuristic AI Atmosphere"
            fill
            priority
            placeholder="blur"
            className="object-cover"
            referrerPolicy="no-referrer"
          />
        </motion.div>
        
        {/* Animated Floating Cloud Layers */}
        <motion.div 
          animate={{ x: [0, 50, 0], y: [0, -30, 0], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-indigo-500/20 blur-[120px] mix-blend-screen"
        />
        <motion.div 
          animate={{ x: [0, -40, 0], y: [0, 40, 0], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-purple-500/20 blur-[150px] mix-blend-screen"
        />
        
        {/* Soft elegant gradient overlays that dynamically shade the illustrations to draw maximum contrast mapping to the Card */}
        <div className="absolute inset-0 bg-neutral-950/35 backdrop-blur-[0.5px]" />
        <div className="absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-t from-[#020204] via-[#020204]/65 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-[40%] bg-gradient-to-b from-[#020204] via-[#020204]/40 to-transparent" />
      </div>

      {/* Main Responsive Layout Wrapper */}
      <div className="relative z-10 w-full h-[100dvh] flex flex-col items-center justify-center overflow-y-auto">
        
        {/* Centered Form Container */}
        <div className="w-full max-w-[500px] flex items-center justify-center p-4 py-8 relative z-30">
        
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          style={{ 
            rotateX: cardRotateX, 
            rotateY: cardRotateY,
            transformStyle: "preserve-3d"
          }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[460px] bg-neutral-950/40 border border-white/[0.08] rounded-[28px] p-6 sm:p-8 md:p-10 shadow-[0_32px_96px_-16px_rgba(0,0,0,0.85),_inset_0_1px_1px_rgba(255,255,255,0.06)] backdrop-blur-3xl relative overflow-hidden"
        >
          {/* Subtle inside ambient top-glow */}
          <div className="absolute -top-[60px] left-[10%] right-[10%] h-[120px] rounded-full bg-indigo-500/10 blur-[30px] pointer-events-none" />

          {/* Clean Meticulous Card Header */}
          <div className="flex flex-col items-center mb-8 relative z-10">
            {/* Elegant Branding Icon */}
            <motion.div 
              className="h-11 w-11 rounded-2xl bg-neutral-900/60 p-1 border border-white/[0.08] shadow-[0_0_24px_rgba(239,68,68,0.25)] flex items-center justify-center mb-4 cursor-pointer"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Image 
                src={brandingLogo} 
                alt="Plack Logo" 
                className="w-10 h-10 object-contain"
                referrerPolicy="no-referrer"
              />
            </motion.div>
            
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white font-sans mt-1 text-center">
              {isForgotPassword ? 'Reset password' : isLogin ? 'Welcome back' : 'Create account'}
            </h1>
            <p className="text-[13px] text-neutral-400 mt-2 font-sans font-light text-center leading-relaxed">
              {isForgotPassword 
                ? 'Type your email below for security recovery.' 
                : isLogin 
                  ? 'Sign in to access your high-fidelity workspace.' 
                  : 'Establish credentials and register your portal.'}
            </p>
          </div>

          <div className="relative z-10">
            {isForgotPassword ? (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-mono uppercase tracking-widest text-neutral-400 font-medium pl-1">Email address</label>
                  <div className="relative">
                    <input
                      type="email"
                      placeholder="name@company.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-white/[0.02] border border-white/[0.08] focus:border-indigo-400/50 rounded-2xl px-4 py-3.5 pl-11 text-[14px] text-white placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-indigo-400/20 transition-all font-sans"
                    />
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
                  </div>
                </div>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.98 }} 
                    animate={{ opacity: 1, scale: 1 }} 
                    className="p-3.5 rounded-2xl bg-red-500/5 border border-red-500/15 text-[12.5px] text-red-400 leading-relaxed font-sans"
                  >
                    <div className="flex gap-2">
                      <HelpCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  </motion.div>
                )}

                {resetSuccess && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.98 }} 
                    animate={{ opacity: 1, scale: 1 }} 
                    className="p-3.5 rounded-2xl bg-emerald-500/5 border border-emerald-500/12 text-[12.5px] text-emerald-400 leading-relaxed font-sans"
                  >
                    <div className="flex gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>Password reset link sent! Check your inbox for security validation.</span>
                    </div>
                  </motion.div>
                )}

                <div className="pt-2">
                  <motion.button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white rounded-2xl px-5 py-3.5 text-[14px] font-semibold flex items-center justify-center gap-2 transition-all shadow-[0_8px_20px_-4px_rgba(99,102,241,0.4)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : 'Send recovery link'}
                  </motion.button>
                </div>

                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPassword(false);
                      setError(null);
                      setResetSuccess(false);
                    }}
                    className="text-[13px] text-neutral-400 hover:text-white font-medium transition-colors cursor-pointer"
                  >
                    Back to login gate
                  </button>
                </div>
              </form>
            ) : (
              <>
                {/* OAuth Provider Buttons with consistent sizing, alignment, loader states, and design language */}
                <div className="flex flex-col gap-3">
                  {/* Google OAuth Option */}
                  <motion.button
                    type="button"
                    onClick={handleGoogleAuth}
                    disabled={googleLoading || githubLoading || discordLoading}
                    className="w-full h-[52px] bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.16] hover:bg-white/[0.05] text-neutral-100 rounded-2xl px-5 text-[14px] font-semibold flex items-center justify-center gap-3 transition-all relative overflow-hidden group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    whileHover={{ scale: 1.015 }}
                    whileTap={{ scale: 0.985 }}
                  >
                    {googleLoading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
                        <span>Authenticating with Google...</span>
                      </div>
                    ) : (
                      <>
                        <svg className="w-4 h-4 shrink-0 transition-transform duration-300 group-hover:scale-105" viewBox="0 0 24 24">
                          <path
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            fill="#4285F4"
                          />
                          <path
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            fill="#34A853"
                          />
                          <path
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            fill="#FBBC05"
                          />
                          <path
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            fill="#EA4335"
                          />
                        </svg>
                        <span>Continue with Google</span>
                      </>
                    )}
                    <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full bg-gradient-to-r from-transparent via-white/[0.03] to-transparent transition-transform duration-1000 ease-in-out" />
                  </motion.button>

                  {/* GitHub OAuth Option */}
                  <motion.button
                    type="button"
                    onClick={handleGitHubAuth}
                    disabled={googleLoading || githubLoading || discordLoading}
                    className="w-full h-[52px] bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.16] hover:bg-white/[0.05] text-neutral-100 rounded-2xl px-5 text-[14px] font-semibold flex items-center justify-center gap-3 transition-all relative overflow-hidden group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    whileHover={{ scale: 1.015 }}
                    whileTap={{ scale: 0.985 }}
                  >
                    {githubLoading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
                        <span>Authenticating with GitHub...</span>
                      </div>
                    ) : (
                      <>
                        <svg className="w-4 h-4 shrink-0 transition-transform duration-300 group-hover:scale-105" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                        </svg>
                        <span>Continue with GitHub</span>
                      </>
                    )}
                    <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full bg-gradient-to-r from-transparent via-white/[0.03] to-transparent transition-transform duration-1000 ease-in-out" />
                  </motion.button>

                  {/* Discord OAuth Option */}
                  <motion.button
                    type="button"
                    onClick={handleDiscordAuth}
                    disabled={googleLoading || githubLoading || discordLoading}
                    className="w-full h-[52px] bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.16] hover:bg-white/[0.05] text-neutral-100 rounded-2xl px-5 text-[14px] font-semibold flex items-center justify-center gap-3 transition-all relative overflow-hidden group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    whileHover={{ scale: 1.015 }}
                    whileTap={{ scale: 0.985 }}
                  >
                    {discordLoading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
                        <span>Authenticating with Discord...</span>
                      </div>
                    ) : (
                      <>
                        <svg className="w-4 h-4 shrink-0 transition-transform duration-300 group-hover:scale-105" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.094 13.094 0 0 1-1.873-.894.077.077 0 0 1-.008-.128c.126-.093.252-.19.372-.287a.075.075 0 0 1 .077-.011c3.92 1.793 8.18 1.793 12.061 0a.073.073 0 0 1 .078.009c.12.099.246.195.373.289a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.156-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.955 2.418-2.156 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.156-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.156 2.418z"/>
                        </svg>
                        <span>Continue with Discord</span>
                      </>
                    )}
                    <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full bg-gradient-to-r from-transparent via-white/[0.03] to-transparent transition-transform duration-1000 ease-in-out" />
                  </motion.button>
                </div>

                {/* Email visual separator */}
                <div className="flex items-center gap-4 my-6">
                  <div className="flex-1 h-[1px] bg-white/[0.06]" />
                  <span className="text-[10px] font-mono tracking-widest text-[#a3a3a3] uppercase">or with email</span>
                  <div className="flex-1 h-[1px] bg-white/[0.06]" />
                </div>

                <form onSubmit={handleAuth} className="space-y-4">
                  <AnimatePresence initial={false} mode="wait">
                    {!isLogin && (
                      <motion.div
                        key="name-input"
                        initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
                        animate={{ opacity: 1, height: 'auto', overflow: 'visible' }}
                        exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                        transition={{ duration: 0.3 }}
                        className="space-y-2"
                      >
                        <label className="text-[11px] font-mono uppercase tracking-widest text-neutral-400 font-medium pl-1">Full Name</label>
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="John Doe"
                            required={!isLogin}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-white/[0.02] border border-white/[0.08] focus:border-indigo-400/50 rounded-2xl px-4 py-3.5 pl-11 text-[14px] text-white placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-indigo-400/20 transition-all font-sans"
                          />
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="space-y-2">
                    <label className="text-[11px] font-mono uppercase tracking-widest text-neutral-400 font-medium pl-1">Email Address</label>
                    <div className="relative">
                      <input
                        type="email"
                        placeholder="name@domain.com"
                        required
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setDetectedProvider(null);
                        }}
                        onBlur={() => checkEmailProvider(email)}
                        className="w-full bg-white/[0.02] border border-white/[0.08] focus:border-indigo-400/50 rounded-2xl px-4 py-3.5 pl-11 text-[14px] text-white placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-indigo-400/20 transition-all font-sans"
                      />
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
                      {isCheckingProvider && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center">
                          <Loader2 className="w-4 h-4 animate-spin text-neutral-500" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Micro-Interaction Alerts & Provider Checks */}
                  <AnimatePresence>
                    {detectedProvider === 'google' && (
                      <motion.div 
                        key="google-detected"
                        initial={{ opacity: 0, scale: 0.95, y: -5 }} 
                        animate={{ opacity: 1, scale: 1, y: 0 }} 
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="p-3.5 rounded-2xl bg-indigo-500/5 border border-indigo-500/15 text-[12px] text-indigo-300 leading-relaxed font-sans"
                      >
                        <div className="flex items-start gap-2.5">
                          <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                          <span>This account was created using Google Sign-In. Please click <strong>Continue with Google</strong> above.</span>
                        </div>
                      </motion.div>
                    )}

                    {detectedProvider === 'email' && (
                      <motion.div 
                        key="email-detected"
                        initial={{ opacity: 0, scale: 0.95, y: -5 }} 
                        animate={{ opacity: 1, scale: 1, y: 0 }} 
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="p-3.5 rounded-2xl bg-neutral-800/30 border border-neutral-700/30 text-[12px] text-neutral-300 leading-relaxed font-sans"
                      >
                        <div className="flex items-start gap-2.5">
                          <CheckCircle2 className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                          <span>Recognized account uses Email & Password.</span>
                        </div>
                      </motion.div>
                    )}

                    {detectedProvider === 'none' && !isLogin && (
                      <motion.div 
                        key="none-detected"
                        initial={{ opacity: 0, scale: 0.95, y: -5 }} 
                        animate={{ opacity: 1, scale: 1, y: 0 }} 
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="p-3.5 rounded-2xl bg-emerald-500/5 border border-emerald-500/15 text-[12px] text-emerald-400 leading-relaxed font-sans"
                      >
                        <div className="flex items-start gap-2.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          <span>Awesome! This email address is available for registration.</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <label className="text-[11px] font-mono uppercase tracking-widest text-neutral-400 font-medium">Password</label>
                      {isLogin && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsForgotPassword(true);
                            setError(null);
                          }}
                          className="text-[11.5px] font-semibold text-neutral-400 hover:text-white transition-colors"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type="password"
                        placeholder="••••••••"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-white/[0.02] border border-white/[0.08] focus:border-indigo-400/50 rounded-2xl px-4 py-3.5 pl-11 text-[14px] text-white placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-indigo-400/20 transition-all font-sans"
                      />
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
                    </div>
                  </div>

                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.98 }} 
                      animate={{ opacity: 1, scale: 1 }} 
                      className="p-3.5 rounded-2xl bg-red-500/5 border border-red-500/15 text-[12.5px] text-red-400 leading-relaxed font-sans"
                    >
                      <div className="flex gap-2">
                        <HelpCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                        <span>{error}</span>
                      </div>
                    </motion.div>
                  )}

                  <div className="pt-2">
                    <motion.button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white rounded-2xl px-5 py-3.5 text-[14px] font-semibold flex items-center justify-center gap-2 transition-all shadow-[0_8px_20px_-4px_rgba(99,102,241,0.4)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : (isLogin ? 'Login' : 'Create Account')}
                    </motion.button>
                  </div>
                </form>

                <div className="mt-8 text-center border-t border-white/[0.05] pt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setIsLogin(!isLogin);
                      setError(null);
                      setDetectedProvider(null);
                    }}
                    className="text-[13px] text-neutral-400 hover:text-white font-medium transition-colors cursor-pointer"
                  >
                    {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Login'}
                  </button>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>

      </div>

    </div>
  );
}
