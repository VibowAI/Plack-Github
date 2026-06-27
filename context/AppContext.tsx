'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getChats, createChat as createChatApi, updateChatTitle as updateChatTitleApi, deleteChat as deleteChatApi } from '@/lib/supabase/services';
import { useRouter, usePathname } from 'next/navigation';
import { logger, LogCategory } from '@/lib/logger';

type ThemeMode = 'light' | 'dark' | 'cosmic';
type ThemeSetting = 'light' | 'dark' | 'cosmic' | 'system';
type AccentColor = 'blue' | 'purple' | 'orange' | 'green' | 'red' | 'pink' | 'custom';

interface AppContextType {
  session: any;
  user: any;
  chats: any[];
  setChats: React.Dispatch<React.SetStateAction<any[]>>;
  theme: ThemeMode;
  themeSetting: ThemeSetting;
  accentColor: AccentColor;
  customColor: string;
  setAccentColor: (color: AccentColor, customValue?: string) => Promise<void>;
  sidebarWidth: number;
  isSidebarOpen: boolean;
  isMobile: boolean;
  setThemeSetting: (setting: ThemeSetting) => void;
  setIsSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  onNewChat: () => Promise<void>;
  onSelectChat: (chatId: string) => void;
  onRenameChat: (chatId: string, newTitle: string) => Promise<void>;
  onDeleteChat: (chatId: string) => Promise<void>;
  onTogglePinChat: (chatId: string, isPinned: boolean) => Promise<void>;
  activeChatId: string | null;
  setActiveChatId: React.Dispatch<React.SetStateAction<string | null>>;
  messages: any[];
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
  inputValue: string;
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  attachments: any[];
  setAttachments: React.Dispatch<React.SetStateAction<any[]>>;
  activeStreams: Record<string, any>;
  setActiveStreams: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  isStreaming: boolean;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  refreshChats: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  
  const [session, setSession] = useState<any>(null);
  const [chats, setChats] = useState<any[]>([]);
  const [themeSetting, setThemeSettingState] = useState<ThemeSetting>('system');
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [accentColor, setAccentColorState] = useState<AccentColor>('blue');
  const [customColor, setCustomColor] = useState<string>('#ff007f');
  const [isMounted, setIsMounted] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  // Persistent Chat State
  const [messages, setMessages] = useState<any[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [activeStreams, setActiveStreams] = useState<Record<string, any>>({});
  const [isStreaming, setIsStreaming] = useState(false);

  const supabase = createClient();

  // Auth initialization and Sync metadata
  useEffect(() => {
    // Avoid synchronous cascading render error in linter
    const timer = setTimeout(() => {
      setIsMounted(true);

      // Initial load from local storage
      const savedThemeSetting = (localStorage.getItem('plack-theme-setting') as ThemeSetting) || 'system';
      setThemeSettingState(savedThemeSetting);
      
      if (savedThemeSetting !== 'system') {
        setTheme(savedThemeSetting as ThemeMode);
      } else {
        const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setTheme(dark ? 'dark' : 'light');
      }

      const savedAccent = (localStorage.getItem('plack-accent-color') as AccentColor) || 'blue';
      setAccentColorState(savedAccent);

      const savedCustom = localStorage.getItem('plack-custom-color') || '#ff007f';
      setCustomColor(savedCustom);
    }, 0);

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user?.user_metadata) {
        const meta = session.user.user_metadata;
        if (meta.accent_color) {
          setAccentColorState(meta.accent_color as AccentColor);
          localStorage.setItem('plack-accent-color', meta.accent_color);
        }
        if (meta.custom_color) {
          setCustomColor(meta.custom_color);
          localStorage.setItem('plack-custom-color', meta.custom_color);
        }
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user?.user_metadata) {
        const meta = session.user.user_metadata;
        if (meta.accent_color) {
          setAccentColorState(meta.accent_color as AccentColor);
          localStorage.setItem('plack-accent-color', meta.accent_color);
        }
        if (meta.custom_color) {
          setCustomColor(meta.custom_color);
          localStorage.setItem('plack-custom-color', meta.custom_color);
        }
      }
    });

    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [supabase.auth]);

  const setAccentColor = async (color: AccentColor, customValue?: string) => {
    setAccentColorState(color);
    localStorage.setItem('plack-accent-color', color);
    if (customValue) {
      setCustomColor(customValue);
      localStorage.setItem('plack-custom-color', customValue);
    }

    if (session?.user) {
      try {
        await supabase.auth.updateUser({
          data: {
            accent_color: color,
            custom_color: customValue || customColor
          }
        });
      } catch (err) {
        console.warn("[METADATA UPDATE WARNING]", err);
      }

      // Safe update theme settings in profiles table as well
      try {
        await supabase
          .from('profiles')
          .update({
            theme_setting: themeSetting
          })
          .eq('id', session.user.id);
      } catch (err) {
        // Safe catch
      }
    }
  };

  // Auth Router redirection guards
  useEffect(() => {
    if (session === null) return; // Wait until session loads

    const isGuardedRoute = pathname === '/' || pathname.startsWith('/chat') || pathname.startsWith('/connections');
    
    if (!session) {
      if (isGuardedRoute) {
        console.log('[AUTH ROUTER] Unauthenticated redirect to `/welcome`');
        router.replace('/welcome');
      }
    } else {
      if (pathname === '/welcome') {
        console.log('[AUTH ROUTER] Authenticated redirect to workspace `/`');
        router.replace('/');
      }
    }
  }, [session, pathname, router]);

  // Sync theme with system
  useEffect(() => {
    if (themeSetting !== 'system') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (e: MediaQueryListEvent) => setTheme(e.matches ? 'dark' : 'light');
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, [themeSetting]);

  const setThemeSetting = (setting: ThemeSetting) => {
    setThemeSettingState(setting);
    localStorage.setItem('plack-theme-setting', setting);
    if (setting !== 'system') {
      setTheme(setting as ThemeMode);
    } else {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      setTheme(mediaQuery.matches ? 'dark' : 'light');
    }
  };

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) setIsSidebarOpen(false);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fetch chats
  const refreshChats = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      const data = await getChats(session.user.id);
      setChats(data || []);
    } catch (err) {
      logger.logError(LogCategory.DATABASE, "Failed to fetch chats", err);
    }
  }, [session]);

  useEffect(() => {
    const fetch = async () => {
      if (session?.user?.id) {
        await refreshChats();
      }
    };
    fetch();
  }, [session?.user?.id, refreshChats]);

  // Track active chat from URL
  useEffect(() => {
    const updateActiveChatId = () => {
      const chatMatch = pathname.match(/\/chat\/([^\/]+)/);
      if (chatMatch) {
        const fullId = chatMatch[1];
        const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const match = fullId.match(uuidRegex);
        const resolvedId = match ? match[0] : fullId;
        if (activeChatId !== resolvedId) {
          setActiveChatId(resolvedId);
        }
      } else {
        if (activeChatId !== null) {
          setActiveChatId(null);
        }
      }
    };
    updateActiveChatId();
  }, [pathname, activeChatId]);

  // Actions
  const onNewChat = async () => {
    setMessages([]);
    setInputValue('');
    setAttachments([]);
    setActiveStreams({});
    setIsStreaming(false);
    router.push('/');
  };

  const onSelectChat = (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      const cleanTitle = (chat.title || 'Conversation')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-+|-+$)/g, '');
      const slug = cleanTitle ? `${cleanTitle}-${chat.id}` : chat.id;
      router.push(`/chat/${slug}`);
    } else {
      router.push(`/chat/${chatId}`);
    }
  };

  const onRenameChat = async (chatId: string, newTitle: string) => {
    try {
      await updateChatTitleApi(chatId, newTitle);
      await refreshChats();
    } catch (err) {
      logger.logError(LogCategory.DATABASE, "Failed to rename chat", err);
    }
  };

  const onDeleteChat = async (chatId: string) => {
    try {
      await deleteChatApi(chatId);
      await refreshChats();
      if (activeChatId === chatId) {
        router.push('/');
      }
    } catch (err) {
      logger.logError(LogCategory.DATABASE, "Failed to delete chat", err);
    }
  };

  const onTogglePinChat = async (chatId: string, isPinned: boolean) => {
    try {
      const { error } = await supabase
        .from('chats')
        .update({ is_pinned: isPinned })
        .eq('id', chatId);
      if (error) throw error;
      await refreshChats();
    } catch (err) {
      logger.logError(LogCategory.DATABASE, "Failed to toggle pin", err);
    }
  };

  // Dynamic CSS injector for Custom Accents - only render on client to avoid hydration mismatch
  const getAccentHex = () => {
    if (!isMounted) return '#3b82f6'; // Default blue for SSR
    if (accentColor === 'custom') return customColor;
    const colors: Record<string, string> = {
      blue: '#3b82f6',
      purple: '#a855f7',
      orange: '#f97316',
      green: '#10b981', // emerald Premium Accent
      red: '#ef4444',
      pink: '#ec4899',
    };
    return colors[accentColor] || '#3b82f6';
  };

  const accentHex = getAccentHex();

  return (
    <AppContext.Provider value={{
      session,
      user: session?.user,
      chats,
      setChats,
      theme,
      themeSetting,
      accentColor,
      customColor,
      setAccentColor,
      sidebarWidth,
      isSidebarOpen,
      isMobile,
      setThemeSetting,
      setIsSidebarOpen,
      setSidebarWidth,
      onNewChat,
      onSelectChat,
      onRenameChat,
      onDeleteChat,
      onTogglePinChat,
      activeChatId,
      setActiveChatId,
      messages,
      setMessages,
      inputValue,
      setInputValue,
      attachments,
      setAttachments,
      activeStreams,
      setActiveStreams,
      isStreaming,
      setIsStreaming,
      refreshChats
    }}>
      <style dangerouslySetInnerHTML={{ __html: `
        :root {
          --accent-color: ${accentHex};
          --accent-color-hover: ${accentHex}dd;
        }
        .accent-bg {
          background-color: var(--accent-color) !important;
          color: #ffffff !important;
        }
        .accent-bg-hover:hover {
          background-color: var(--accent-color-hover) !important;
        }
        .accent-text {
          color: var(--accent-color) !important;
        }
        .accent-text-hover:hover {
          color: var(--accent-color) !important;
        }
        .accent-border {
          border-color: var(--accent-color) !important;
        }
        .accent-border-hover:hover {
          border-color: var(--accent-color) !important;
        }
        .accent-ring:focus-within, .accent-ring:focus {
          --tw-ring-color: var(--accent-color) !important;
          border-color: var(--accent-color) !important;
          outline-color: var(--accent-color) !important;
        }
        .accent-bg-15 {
          background-color: color-mix(in srgb, var(--accent-color) 15%, transparent) !important;
        }
        .accent-bg-10 {
          background-color: color-mix(in srgb, var(--accent-color) 10%, transparent) !important;
        }
        ::selection, *::selection {
          background-color: color-mix(in srgb, var(--accent-color) 30%, transparent) !important;
        }
        /* Override focus styles */
        input:focus, textarea:focus {
          border-color: var(--accent-color) !important;
        }
      ` }} />
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
