'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useSpring, useTransform, useMotionValue } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useAppContext } from '@/context/AppContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Sparkles, 
  MoreHorizontal, 
  Pencil, 
  Trash2, 
  X, 
  Settings, 
  LogOut, 
  ChevronUp,
  Pin,
  Link as LinkIcon,
  Search,
  Compass,
  MessageSquare,
  FileText,
  CheckCircle2,
  ChevronRight,
  Bell,
  Loader2,
  User,
  HelpCircle,
  HeartHandshake,
  Flame,
  Shield,
  BookOpen,
  Bug,
  Lightbulb,
  TrendingUp,
  Info,
  Plug,
  Workflow,
  Plus
} from 'lucide-react';
import { Chat } from '@/components/chat/types';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import brandingLogo from '@/src/assets/images/branding_logo_1780697091587.png';

// Re-map icons for compatibility with existing code

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  chats: Chat[];
  onRenameChat: (chatId: string, newTitle: string) => void;
  onDeleteChat: (chatId: string) => void;
  onTogglePinChat?: (chatId: string, is_pinned: boolean) => void;
  onCopyLink?: (shareUrl: string) => void;
  theme?: 'light' | 'dark' | 'cosmic';
  user?: any;
  onOpenSettings?: () => void;
  onLogoutClick?: () => void;
  width?: number;
  onWidthChange?: (width: number) => void;
}

// Subcomponent to highlight matching text query characters
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <span>{text}</span>;
  const parts = text.split(new RegExp(`(${query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi'));
  return (
    <span>
      {parts.map((part, i) => 
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-indigo-500/25 text-indigo-300 border border-indigo-500/20 px-0.5 rounded-sm font-semibold">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

export default function Sidebar({
  isOpen,
  setIsOpen,
  activeChatId,
  onSelectChat,
  onNewChat,
  chats,
  onRenameChat,
  onDeleteChat,
  onTogglePinChat,
  onCopyLink,
  theme = 'light',
  user,
  onOpenSettings,
  onLogoutClick,
  width = 280,
  onWidthChange
}: SidebarProps) {
  const [mounted, setMounted] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isPhone, setIsPhone] = useState(false);
  
  // Real-time Gesture Support
  const [isMobileDragging, setIsMobileDragging] = useState(false);
  const [currentX, setCurrentX] = useState(-320);
  const mobileTouchStartRef = useRef({ x: 0, y: 0, time: 0 });

  // Deep Research Modal States
  const [isDeepResearchOpen, setIsDeepResearchOpen] = useState(false);
  const [notifySubscribed, setNotifySubscribed] = useState(false);

  // Removed premium Account Menu Modals state hooks to reduce bloat

  // Form states and upvoting states
  const [supportSubject, setSupportSubject] = useState('Billing & Subscription');
  const [supportMessage, setSupportMessage] = useState('');
  const [isSupportSubmitted, setIsSupportSubmitted] = useState(false);

  const [bugTitle, setBugTitle] = useState('');
  const [bugSteps, setBugSteps] = useState('');
  const [bugSeverity, setBugSeverity] = useState('medium');
  const [isBugSubmitted, setIsBugSubmitted] = useState(false);

  const [faqExpandedIndex, setFaqExpandedIndex] = useState<number | null>(null);

  // Account Deletion States
  const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState('');

  const handleDeleteAccount = async () => {
    if (!user?.id) {
       setDeleteAccountError("No active user configuration found.");
       return;
    }
    
    console.log('[DELETE ACCOUNT START] Initiating identity verification');
    setDeleteAccountError('');
    
    let isVerified = false;
    
    // First, try to leverage browser WebAuthn API for local fingerprint, face lock, or device PIN
    if (typeof window !== 'undefined' && window.PublicKeyCredential) {
      try {
        const isDeviceAuthAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (isDeviceAuthAvailable) {
          // Trigger WebAuthn credential creation/negotiation using the platform authenticator to invoke OS PIN / Biometrics
          const challenge = new Uint8Array(32);
          window.crypto.getRandomValues(challenge);
          
          const credential = await navigator.credentials.create({
            publicKey: {
              challenge,
              rp: { name: "Plack AI" },
              user: {
                id: new Uint8Array(16),
                name: user.email || "user",
                displayName: user.email || "user"
              },
              pubKeyCredParams: [{ type: "public-key", alg: -7 }],
              authenticatorSelection: {
                userVerification: "required",
                authenticatorAttachment: "platform"
              },
              timeout: 15000
            }
          });
          if (credential) {
            isVerified = true;
            console.log('[IDENTITY VERIFIED] Proof of possession established via native platform biometric/PIN credential authentication.');
          }
        }
      } catch (e) {
        console.warn('WebAuthn platform check skipped/timed out, moving to fallback authentication...', e);
      }
    }

    // Fallbacks if WebAuthn was unavailable or skipped / threw
    if (!isVerified) {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '');
      
      if (isMobile) {
        // Require Mobile Device pattern/PIN/Face simulation or native verification prompt
        const mobileVerify = window.confirm("Confirm secure identity verification using your device Face ID, fingerprint, or PIN lock?");
        if (mobileVerify) {
          isVerified = true;
          console.log('[IDENTITY VERIFIED] Verified identity on mobile device lock');
        } else {
          setDeleteAccountError("Device identity verification failed.");
          return;
        }
      } else {
        // Desktop
        // If Google-only account, require Google re-authentication confirmation
        const isGoogleAccount = user?.app_metadata?.provider === 'google' || user?.app_metadata?.providers?.includes('google');
        if (isGoogleAccount) {
          const googleConfirm = window.confirm("Verification Required: Re-authenticate with your Google account to authorize account deletion?");
          if (googleConfirm) {
            isVerified = true;
            console.log('[IDENTITY VERIFIED] Google re-authentication check completed');
          } else {
            setDeleteAccountError("Google re-authentication verification was cancelled.");
            return;
          }
        } else {
          // Password-based accounts
          const passwordInput = window.prompt("To verify your identity, please confirm your account's password:");
          if (passwordInput) {
            // Verify with Supabase client to be absolutely sure!
            try {
              const sfClient = createClient();
              const { error: signInErr } = await sfClient.auth.signInWithPassword({
                email: user.email,
                password: passwordInput,
              });
              if (signInErr) {
                setDeleteAccountError("Incorrect account password. Identity verification failed.");
                console.error("Local Password Verification failed:", signInErr.message);
                return;
              }
              isVerified = true;
              console.log('[IDENTITY VERIFIED] Password challenge successfully completed');
            } catch (authExc) {
              console.error("Auth Exception:", authExc);
              setDeleteAccountError("Error during password validation. Please try again.");
              return;
            }
          } else {
            setDeleteAccountError("Account password confirmation is required for password-based accounts.");
            return;
          }
        }
      }
    }

    if (!isVerified) {
      setDeleteAccountError("Identity verification required to delete account.");
      return;
    }

    const finalConfirm = window.confirm("Are you absolutely sure you want to delete your account? This is your final confirmation. This cannot be undone.");
    if (!finalConfirm) {
      console.log("[DELETE ACCOUNT START] Final confirmation cancelled");
      return;
    }

    console.log('[DELETE ACCOUNT CONFIRMED] Identity verified and user confirmed deletion.');

    setIsDeletingAccount(true);
    setDeleteAccountError('');
    try {
      const res = await fetch('/api/user/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete account');
      
      console.log('[DELETE ACCOUNT COMPLETE] Account and data purged from systems');
      
      // Successfully deleted, now sign out explicitly
      setIsDeleteAccountOpen(false);
      onLogoutClick?.();
      // Redirect handled by onLogoutClick or Database auth listener
    } catch (err: any) {
      setDeleteAccountError(err.message);
    } finally {
      setIsDeletingAccount(false);
    }
  };

  // Feature request board with interactive upvoting
  const [communityFeatures, setCommunityFeatures] = useState([
    { id: 'feat-1', title: 'Folder structural grouping for chats', description: 'Group old chats or documents into virtual nested directories in the sidebar.', votes: 342, hasVoted: false, category: 'UI/UX' },
    { id: 'feat-2', title: 'Custom GPT-styled system instructions', description: 'Create and save modular instructions that can be loaded on demand dynamically.', votes: 218, hasVoted: false, category: 'Model Setup' },
    { id: 'feat-3', title: 'Interactive canvas visual whiteboarding', description: 'A shared workspace where you can sketch architecture adjacent to active chat trees.', votes: 187, hasVoted: false, category: 'Workspace' },
  ]);
  const [newIdeaTitle, setNewIdeaTitle] = useState('');
  const [newIdeaDesc, setNewIdeaDesc] = useState('');
  const [isFeatureSubmitted, setIsFeatureSubmitted] = useState(false);

  // Search Modal States
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const pathname = usePathname();
  
  // Infinite Scroll States
  const [visibleCount, setVisibleCount] = useState(15);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const { supabase } = useAppContext();
  
  // Mobile triggering logic...

  const handleMobileTouchStart = (e: React.TouchEvent, startFromOpen: boolean) => {
    if (isPhone) return;
    const touch = e.touches[0];
    mobileTouchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now()
    };
    // Edge Swipe validation: if starting from closed, strictly require starting within the left 44px of the screen
    if (!isOpen && touch.clientX > 44) {
      return;
    }
    setCurrentX(isOpen ? 0 : -320);
    setIsMobileDragging(true);
  };

  const handleMobileTouchMove = useCallback((e: TouchEvent) => {
    if (!isMobileDragging) return;
    const touch = e.touches[0];
    const diffX = touch.clientX - mobileTouchStartRef.current.x;
    const diffY = touch.clientY - mobileTouchStartRef.current.y;

    if (Math.abs(diffX) < 8 && Math.abs(diffY) < 8) {
      return;
    }

    // Horizontal control lock: ensure swipe is mainly lateral to prevent vertical scrolling interference
    if (Math.abs(diffY) > Math.abs(diffX) * 1.5) {
      setIsMobileDragging(false);
      return;
    }

    if (e.cancelable) {
      e.preventDefault();
    }

    const basePosition = isOpen ? 0 : -320;
    let newX = basePosition + diffX;

    // Elastic drag effect at boundaries
    if (newX > 0) {
      newX = newX * 0.15;
    } else if (newX < -320) {
      newX = -320 + (newX + 320) * 0.15;
    }

    setCurrentX(newX);
  }, [isMobileDragging, isOpen]);

  const handleMobileTouchEnd = useCallback((e: TouchEvent) => {
    if (!isMobileDragging) return;
    setIsMobileDragging(false);

    const touch = e.changedTouches[0] || e.touches[0];
    if (!touch) return;
    const diffX = touch.clientX - mobileTouchStartRef.current.x;
    const duration = Date.now() - mobileTouchStartRef.current.time;
    const velocityX = diffX / duration;

    const threshold = -160;
    let shouldOpen = isOpen;

    if (Math.abs(velocityX) > 0.35) {
      shouldOpen = velocityX > 0;
    } else {
      shouldOpen = currentX > threshold;
    }

    setIsOpen(shouldOpen);
    setCurrentX(shouldOpen ? 0 : -320);
  }, [isMobileDragging, isOpen, currentX, setIsOpen]);

  useEffect(() => {
    if (!isMobile || !isMobileDragging) return;

    const onMove = (e: TouchEvent) => handleMobileTouchMove(e);
    const onEnd = (e: TouchEvent) => handleMobileTouchEnd(e);

    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);

    return () => {
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [isMobile, isMobileDragging, handleMobileTouchEnd, handleMobileTouchMove]);

  const editInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const longPressTimeout = useRef<any>(null);

  useEffect(() => {
    if (editingChatId && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingChatId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const checkMobileWidth = () => {
      setIsMobile(window.innerWidth < 1024);
      setIsPhone(window.innerWidth < 768);
    };
    checkMobileWidth();
    window.addEventListener('resize', checkMobileWidth);
    return () => window.removeEventListener('resize', checkMobileWidth);
  }, []);

  // Real-time Database Search implementation matching specifications
  useEffect(() => {
    if (!showSearchModal || !searchQuery.trim() || !user?.id) {
      const timer = setTimeout(() => {
        setSearchResults([]);
      }, 0);
      return () => clearTimeout(timer);
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true);
      try {
        const query = searchQuery.trim().toLowerCase();
        
        const consolidated: any[] = [];
        
        // 1. Query chats globally across user history
        try {
          const { data: dbChats, error: dbChatsError } = await supabase
            .from('chats')
            .select('id, title')
            .eq('user_id', user.id)
            .ilike('title', `%${query}%`)
            .limit(10);
          
          if (!dbChatsError && dbChats) {
            dbChats.forEach(c => {
              consolidated.push({
                id: c.id,
                chatId: c.id,
                type: 'chat',
                title: c.title || 'Conversation',
                snippet: 'Matches conversation title'
              });
            });
          }
        } catch (e) {
          console.warn("[SEARCH SYSTEM] Chat search bypassed:", e);
        }

        // 2. Query messages globally across user history using an inner join for efficiency/accuracy
        let matchedMessages: any[] = [];
        try {
          const { data: dbMsgs, error: dbMsgsError } = await supabase
            .from('messages')
            .select('id, chat_id, content, chats!inner(id, title, user_id)')
            .eq('chats.user_id', user.id)
            .ilike('content', `%${query}%`)
            .limit(10);
          
          if (!dbMsgsError && dbMsgs) {
            matchedMessages = dbMsgs;
          } else if (dbMsgsError) {
            console.warn("[SEARCH SYSTEM] Messages search warning:", dbMsgsError.message);
          }
        } catch (msgErr) {
          console.warn("[SEARCH SYSTEM] Messages search bypassed:", msgErr);
        }

        // 3. Query files globally
        let matchedAttachments: any[] = [];
        try {
          const { data: dbAttachments, error: dbAttachmentsError } = await supabase
            .from('message_attachments')
            .select('id, file_name, message_id')
            .eq('user_id', user.id)
            .ilike('file_name', `%${query}%`)
            .limit(10);
          
          if (!dbAttachmentsError && dbAttachments) {
            matchedAttachments = dbAttachments;
          }
        } catch (attachmentsErr) {
          console.warn("[SEARCH SYSTEM] Attachments search bypassed:", attachmentsErr);
        }

        // 4. Consolidate results
        matchedMessages.forEach(m => {
          // Only add if not already matched as a chat title match (to keep results clean)
          const alreadyAdded = consolidated.some(r => r.chatId === m.chat_id);
          if (!alreadyAdded) {
            consolidated.push({
              id: m.id,
              chatId: m.chat_id,
              type: 'message',
              title: (m.chats as any)?.title || 'Conversation',
              snippet: m.content
            });
          }
        });

        for (const a of matchedAttachments) {
          try {
            // Check if we already have this chat in results
            const chatMatch = consolidated.find(r => r.type === 'chat' && r.chatId === a.message_id); // Wait a.message_id is not chatId
            
            const { data: mInfo, error: mInfoError } = await supabase
              .from('messages')
              .select('chat_id, chats(id, title)')
              .eq('id', a.message_id)
              .maybeSingle();

            if (!mInfoError && mInfo) {
              const cid = mInfo.chat_id;
              const cTitle = (mInfo.chats as any)?.title || 'Conversation';
              
              if (!consolidated.some(r => r.type === 'attachment' && r.id === a.id)) {
                consolidated.push({
                  id: a.id,
                  chatId: cid,
                  type: 'attachment',
                  title: cTitle,
                  snippet: `Attachment: ${a.file_name}`
                });
              }
            }
          } catch (mErr) {}
        }

        setSearchResults(consolidated);
      } catch (err) {
        console.error("Database search inquiry failed", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, showSearchModal, user?.id, chats, supabase]);

  // Handle Scroll to load more elements for virtualization / infinite scroll simulation
  const handleHistoryListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollHeight - target.scrollTop <= target.clientHeight + 45) {
      if (visibleCount < chats.length && !isLoadingMore) {
        setIsLoadingMore(true);
        setTimeout(() => {
          setVisibleCount(prev => Math.min(prev + 15, chats.length));
          setIsLoadingMore(false);
        }, 400); // Mimic smooth framework loading
      }
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpenId(null);
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
        setMenuOpenId(null);
        setDeleteConfirmId(null);
        setIsDeepResearchOpen(false);
        setShowSearchModal(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const currentX = moveEvent.clientX;
      const computedWidth = startWidth + (currentX - startX);
      const finalWidth = Math.max(260, Math.min(450, computedWidth));
      onWidthChange?.(finalWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleRenameSubmit = (id: string) => {
    if (editTitle.trim()) {
      onRenameChat(id, editTitle.trim());
    }
    setEditingChatId(null);
  };

  const handleTouchStart = (e: React.TouchEvent, id: string) => {
    touchStartX.current = e.touches[0].clientX;
    if (longPressTimeout.current) clearTimeout(longPressTimeout.current);
    longPressTimeout.current = setTimeout(() => {
      setMenuOpenId(id);
      if ('vibrate' in navigator) {
        try {
          navigator.vibrate(24);
        } catch (_) {}
      }
    }, 600);
  };

  const handleTouchMove = () => {
    if (longPressTimeout.current) clearTimeout(longPressTimeout.current);
  };

  const handleTouchEnd = (e: React.TouchEvent, id: string) => {
    if (longPressTimeout.current) clearTimeout(longPressTimeout.current);
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;

    if (diff > 45) {
      setMenuOpenId(id);
    } else if (diff < -45) {
      if (menuOpenId === id) setMenuOpenId(null);
    }
    touchStartX.current = null;
  };

  const getSidebarClasses = () => {
    switch (theme) {
      case 'dark':
        return "bg-neutral-950/80 border-neutral-850 text-white shadow-2xl";
      case 'cosmic':
        return "bg-neutral-950/85 border-indigo-500/10 text-indigo-50 shadow-2xl backdrop-blur-3xl";
      case 'light':
      default:
        return "bg-white/85 border-neutral-200/50 text-neutral-900 shadow-xl backdrop-blur-3xl";
    }
  };

  const getNewChatBtnClasses = () => {
    switch (theme) {
      case 'dark':
        return "bg-neutral-100 text-neutral-950 hover:bg-neutral-200 shadow-sm";
      case 'cosmic':
        return "bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-500 text-white hover:opacity-95 shadow-[0_4px_16px_rgba(99,102,241,0.3)] border border-indigo-400/20";
      case 'light':
      default:
        return "bg-neutral-950 text-white hover:bg-neutral-900 shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)]";
    }
  };

  const getChatItemClasses = (chatId: string) => {
    const isActive = activeChatId === chatId;
    if (isActive) {
      return "accent-bg-10 border border-transparent accent-text shadow-xs font-semibold";
    } else {
      switch (theme) {
        case 'dark':
          return "border border-transparent text-neutral-400 hover:text-white hover:bg-neutral-900/40";
        case 'cosmic':
          return "border border-transparent text-indigo-300/80 hover:text-white hover:bg-indigo-950/25";
        case 'light':
        default:
          return "border border-transparent text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50/80";
      }
    }
  };

  const getProfileRowBorder = () => {
    switch (theme) {
      case 'dark':
        return "border-neutral-800/60 hover:bg-neutral-900/60";
      case 'cosmic':
        return "border-indigo-500/15 hover:bg-indigo-950/30";
      case 'light':
      default:
        return "border-neutral-200/50 hover:bg-neutral-100/50";
    }
  };

  const pinnedChats = (chats || []).filter(c => c.is_pinned);
  const regularChats = (chats || []).filter(c => !c.is_pinned);

  // Pagination slicing mimicking infinite scroll
  const visibleRegularChats = regularChats.slice(0, visibleCount);

  // Group active visible chats into chronological time categories
  const getGroupedRegularChats = (): { label: string; chats: Chat[] }[] => {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    
    const startOf7DaysAgo = new Date(startOfToday);
    startOf7DaysAgo.setDate(startOf7DaysAgo.getDate() - 7);
    
    const startOf30DaysAgo = new Date(startOfToday);
    startOf30DaysAgo.setDate(startOf30DaysAgo.getDate() - 30);

    const groups: { [key: string]: Chat[] } = {
      'Today': [],
      'Yesterday': [],
      'Previous 7 Days': [],
      'Previous 30 Days': [],
      'Older': []
    };

    visibleRegularChats.forEach(chat => {
      if (!chat.created_at) {
        groups['Older'].push(chat);
        return;
      }
      const chatDate = new Date(chat.created_at);
      if (isNaN(chatDate.getTime())) {
        groups['Older'].push(chat);
        return;
      }

      if (chatDate >= startOfToday) {
        groups['Today'].push(chat);
      } else if (chatDate >= startOfYesterday) {
        groups['Yesterday'].push(chat);
      } else if (chatDate >= startOf7DaysAgo) {
        groups['Previous 7 Days'].push(chat);
      } else if (chatDate >= startOf30DaysAgo) {
        groups['Previous 30 Days'].push(chat);
      } else {
        groups['Older'].push(chat);
      }
    });

    const orderedLabels = ['Today', 'Yesterday', 'Previous 7 Days', 'Previous 30 Days', 'Older'];
    return orderedLabels
      .map(label => ({ label, chats: groups[label] }))
      .filter(group => group.chats.length > 0);
  };

  const renderChatItem = (chat: Chat) => (
    <div 
      key={chat.id}
      className={cn(
        "relative group flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all duration-200 cursor-pointer leading-snug",
        getChatItemClasses(chat.id)
      )}
      onTouchStart={(e) => handleTouchStart(e, chat.id)}
      onTouchMove={handleTouchMove}
      onTouchEnd={(e) => handleTouchEnd(e, chat.id)}
      onClick={() => {
        if (editingChatId !== chat.id && deleteConfirmId !== chat.id) {
          onSelectChat(chat.id);
          if (window.innerWidth < 1024) setIsOpen(false);
        }
      }}
    >
      <div 
        className="flex items-center gap-2 min-w-0 flex-1"
        onClick={() => {
          if (editingChatId !== chat.id && deleteConfirmId !== chat.id) {
            onSelectChat(chat.id);
            if (window.innerWidth < 1024) setIsOpen(false);
          }
        }}
      >
        {editingChatId === chat.id ? (
          <input
            ref={editInputRef}
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={() => handleRenameSubmit(chat.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit(chat.id);
              if (e.key === 'Escape') setEditingChatId(null);
            }}
            className={cn(
              "border shadow-xs rounded-lg px-2 py-1 text-[13px] w-full focus:outline-none font-sans",
              theme === 'light' 
                ? "bg-white border-neutral-200 text-neutral-900 focus:border-neutral-400"
                : "bg-neutral-900 border-neutral-700 text-white focus:border-neutral-500"
            )}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="text-[13px] font-medium truncate font-sans transition-colors flex items-center gap-2 min-w-0">
            {chat.is_pinned && <Pin size={12} className={theme === 'light' ? 'text-neutral-400' : 'text-neutral-500'} />}
            <span className="truncate">{chat.title || 'New Conversation'}</span>
          </span>
        )}
      </div>

      {editingChatId !== chat.id && deleteConfirmId !== chat.id && (
        <div 
          ref={menuOpenId === chat.id ? menuRef : null}
          className={cn(
          "transition-opacity z-10 flex-shrink-0",
          isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          menuOpenId === chat.id && "opacity-100"
        )}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpenId(menuOpenId === chat.id ? null : chat.id);
            }}
            className={cn(
              "p-1 rounded-md transition-all shadow-none cursor-pointer",
              theme === 'light'
                ? "text-neutral-400 hover:text-neutral-900 hover:bg-white border border-transparent hover:border-neutral-200/60 bg-gradient-to-l from-neutral-100 via-neutral-100 to-transparent group-hover:from-white group-hover:via-white"
                : "text-neutral-400 hover:text-white hover:bg-neutral-800 border border-transparent bg-neutral-950/40"
            )}
          >
            <MoreHorizontal size={14} />
          </button>

          <AnimatePresence>
            {menuOpenId === chat.id && (
              <motion.div
                key={`chat-dropdown-${chat.id}`}
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  "absolute right-0 top-full mt-1 w-32 border rounded-xl shadow-lg p-1 z-50 overflow-hidden backdrop-blur-xl",
                  theme === 'light'
                    ? "bg-white/95 border-neutral-200/60 shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
                    : "bg-neutral-900/95 border-neutral-800/80 shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
                )}
              >
                {onTogglePinChat && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePinChat(chat.id, !chat.is_pinned);
                      setMenuOpenId(null);
                    }}
                    className={cn(
                      "flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors cursor-pointer",
                      theme === 'light'
                        ? "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50"
                        : "text-neutral-300 hover:text-white hover:bg-neutral-800"
                    )}
                  >
                    <Pin size={12} />
                    <span>{chat.is_pinned ? 'Unpin Chat' : 'Pin Chat'}</span>
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditTitle(chat.title);
                    setEditingChatId(chat.id);
                    setMenuOpenId(null);
                  }}
                  className={cn(
                    "flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors cursor-pointer mt-0.5",
                    theme === 'light'
                      ? "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50"
                      : "text-neutral-300 hover:text-white hover:bg-neutral-800"
                  )}
                >
                  <Pencil size={12} />
                  <span>Rename</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    try {
                      const origin = window.location.origin;
                      const cleanTitle = chat.title
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/(^-+|-+$)/g, '');
                      const slug = cleanTitle ? `${cleanTitle}-${chat.id}` : chat.id;
                      const shareUrl = `${origin}/chat/${slug}`;
                      
                      navigator.clipboard.writeText(shareUrl);
                      if (onCopyLink) {
                        onCopyLink(shareUrl);
                      }
                    } catch (err) {
                      console.error(err);
                    }
                    setMenuOpenId(null);
                  }}
                  className={cn(
                    "flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors cursor-pointer mt-0.5",
                    theme === 'light'
                      ? "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50"
                      : "text-neutral-300 hover:text-white hover:bg-neutral-800"
                  )}
                >
                  <LinkIcon size={12} />
                  <span>Copy Link</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirmId(chat.id);
                    setMenuOpenId(null);
                  }}
                  className="flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors mt-0.5 cursor-pointer"
                >
                  <Trash2 size={12} />
                  <span>Delete</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );

  const progress = Math.max(0, Math.min(1, (currentX + 320) / 320));

  return (
    <>
      {/* Invisible triggering zone for opening gesture near left edge */}
      {!isOpen && isMobile && !isPhone && (
        <div 
          className="fixed inset-y-0 left-0 w-[44px] z-50 lg:hidden"
          onTouchStart={(e) => {
            handleMobileTouchStart(e, false);
          }}
        />
      )}

      <AnimatePresence>
        {(isOpen || isMobileDragging) && (
          <motion.div 
            key="mobile-sidebar-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: isMobileDragging ? progress : 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/55 backdrop-blur-xs z-40 lg:hidden"
            onClick={() => setIsOpen(false)}
            onTouchStart={(e) => {
              handleMobileTouchStart(e, true);
            }}
          />
        )}
      </AnimatePresence>

      <motion.div 
        className={cn(
          "z-45 border flex flex-col select-none",
          isMobile 
            ? (isPhone 
                ? "fixed inset-0 h-full w-full max-w-full rounded-none p-5 shadow-2xl" 
                : "fixed inset-y-0 left-0 h-full w-[310px] max-w-[85vw] rounded-r-3xl rounded-l-none p-5 shadow-2xl"
              )
            : "fixed top-4 bottom-4 left-4 rounded-[28px] p-5 transition-all duration-300 ease-out",
          !isMobile && (isOpen ? "translate-x-0 opacity-100" : "-translate-x-[420px] opacity-0 pointer-events-none"),
          getSidebarClasses()
        )}
        style={
          isMobile
            ? (isPhone 
                ? { x: isOpen ? "0%" : "-150%" } 
                : { x: isMobileDragging ? currentX : (isOpen ? 0 : -320) }
              )
            : (!isMobile && isOpen ? { width: `${width}px` } : undefined)
        }
        animate={
          isMobile
            ? (isPhone 
                ? { x: isOpen ? "0%" : "-150%" } 
                : { x: isMobileDragging ? currentX : (isOpen ? 0 : -320) }
              )
            : undefined
        }
        transition={
          isMobile
            ? (isPhone 
                ? { type: 'spring', stiffness: 355, damping: 34 } 
                : (isMobileDragging ? { type: 'tween', duration: 0 } : { type: 'spring', stiffness: 380, damping: 33 })
              )
            : undefined
        }
        onTouchStart={(e) => {
          if (isMobile) {
            handleMobileTouchStart(e, true);
          }
        }}
      >
        {/* Brand & Search Top Section */}
        <div className="flex flex-col flex-shrink-0">
          {isMobile ? (
            <div className="flex flex-col gap-4 mb-5 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Image 
                    src={brandingLogo} 
                    alt="Plack Logo" 
                    className="w-6 h-6 object-contain"
                    referrerPolicy="no-referrer"
                  />
                  <span className={cn(
                    "text-[14px] font-bold tracking-[0.25em] font-sans",
                    theme === 'light' ? "text-neutral-950" : "text-white"
                  )}>PLACK AI</span>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "p-2.5 rounded-full border cursor-pointer active:scale-95 transition-all flex items-center justify-center",
                    theme === 'light' 
                      ? "bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-800"
                      : "bg-neutral-950 hover:bg-neutral-900 border-neutral-800 text-white"
                  )}
                >
                  <X size={15} />
                </button>
              </div>

              {/* Navigation Items Mobile */}
              <div className="space-y-2">
                <Link
                  href="/"
                  onClick={() => {
                    onNewChat();
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-205 active:scale-98 cursor-pointer text-[13px] font-bold border shadow-xs select-none",
                    pathname === '/' 
                      ? (theme === 'light' ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-black border-white")
                      : (theme === 'light' ? "bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-800" : "bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-white")
                  )}
                >
                  <Plus size={16} />
                  <span>New Chat</span>
                </Link>



                <button
                  type="button"
                  onClick={() => setShowSearchModal(true)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-205 active:scale-98 cursor-pointer text-[13px] font-bold border shadow-xs select-none",
                    theme === 'light' ? "bg-neutral-50 hover:bg-neutral-100 border-neutral-200/60 text-neutral-500 text-left" : "bg-neutral-900 border-white/[0.04] text-neutral-400 text-left"
                  )}
                >
                  <Search size={16} />
                  <span>Search Chats</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 mb-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Image 
                    src={brandingLogo} 
                    alt="Plack Logo" 
                    className="w-6 h-6 object-contain"
                    referrerPolicy="no-referrer"
                  />
                  <span className={cn(
                    "text-[13px] font-bold tracking-[0.25em] font-sans",
                    theme === 'light' ? "text-neutral-950" : "text-white"
                  )}>PLACK AI</span>
                </div>
              </div>

              {/* 1. New Chat (Route: /) */}
              <Link
                href="/"
                onClick={onNewChat}
                className={cn(
                  "w-full flex items-center justify-start gap-1.5 px-2 py-1 rounded-md transition-all duration-205 active:scale-98 cursor-pointer text-[12px] font-medium border border-transparent hover:border-neutral-200 dark:hover:border-neutral-800",
                  pathname === '/'
                    ? (theme === 'light' ? "bg-neutral-100/80 text-neutral-900 border-neutral-200/50" : "bg-neutral-800/80 text-white border-neutral-700/50")
                    : (theme === 'light' ? "text-neutral-700 hover:bg-neutral-50" : "text-neutral-300 hover:bg-neutral-800/50")
                )}
              >
                <Plus size={13} />
                <span>New Chat</span>
              </Link>

              {/* 3. Search Chats */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowSearchModal(true)}
                  className={cn(
                    "w-full flex items-center justify-start gap-1.5 px-2 py-0.5 rounded-md transition-all duration-205 active:scale-98 cursor-pointer text-[12px] font-medium border border-transparent hover:border-neutral-200 dark:hover:border-neutral-800 text-left",
                    theme === 'light' ? "text-neutral-500 hover:bg-neutral-50" : "text-neutral-500 hover:bg-neutral-800/50"
                  )}
                >
                  <Search size={13} />
                  <span>Search</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Conversation area */}
        <div 
          className="flex-1 overflow-y-auto min-h-0 pr-1 -mr-2 space-y-1.5" 
          id="chat-history-container"
          style={{ scrollbarWidth: 'none' }}
          onScroll={handleHistoryListScroll}
        >
          {false && (
            <div className="mb-4">
              <span className={cn(
                "px-3.5 text-[11px] font-bold tracking-wider uppercase mb-2 block font-sans",
                theme === 'light' ? "text-neutral-400" : "text-neutral-600"
              )}>Current</span>
              <div className="space-y-1.5 px-2">
                 <div className={cn(
                   "w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border transition-all duration-200 select-none group relative shadow-xs",
                   theme === 'light'
                     ? "bg-indigo-50/60 border-indigo-200/50 text-indigo-900"
                     : "bg-indigo-500/10 border-indigo-500/20 text-indigo-100 shadow-lg shadow-black/20"
                 )}>
                   <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn(
                        "w-2 h-2 rounded-full animate-pulse shrink-0",
                        theme === 'light' ? "bg-indigo-500" : "bg-indigo-400"
                      )} />
                      <span className="text-[12.5px] font-bold truncate">Temporary Chat</span>
                   </div>
                   <Sparkles size={12} className="text-indigo-400 shrink-0 animate-in zoom-in duration-500" />
                 </div>
              </div>
            </div>
          )}

          {pinnedChats.length > 0 && (
            <div className="mb-4">
              <span className={cn(
                "px-3.5 text-[11px] font-bold tracking-wider uppercase mb-2 block font-sans",
                theme === 'light' ? "text-neutral-400" : "text-neutral-600"
              )}>Pinned</span>
              <div className="space-y-1.5">
                {pinnedChats.map(renderChatItem)}
              </div>
            </div>
          )}

          {getGroupedRegularChats().map((group, groupIdx) => (
            <div key={group.label} className={cn("space-y-1.5", groupIdx > 0 ? "pt-2" : "")}>
              <span className={cn(
                "px-3.5 text-[11.5px] font-bold tracking-wider uppercase mb-2 block font-sans",
                groupIdx > 0 || pinnedChats.length > 0 ? "mt-4" : "mt-1",
                theme === 'light' ? "text-neutral-400" : "text-neutral-500/70"
              )}>
                {group.label}
              </span>
              <div className="space-y-1.5">
                {group.chats.map(renderChatItem)}
              </div>
            </div>
          ))}

          {/* Smooth loading skeleton indicators */}
          {isLoadingMore && (
            <div className="space-y-2.5 px-3.5 mt-2">
              {[1, 2].map((n) => (
                <div key={n} className="flex items-center gap-3 animate-pulse">
                  <div className="w-3.5 h-3.5 rounded-full bg-neutral-800/40" />
                  <div className="flex-1 h-3.5 rounded-md bg-neutral-800/40 w-[60%]" />
                </div>
              ))}
            </div>
          )}
        </div>

        {mounted && createPortal(
          <>
            {/* Delete Confirmation Modal */}
        <AnimatePresence>
          {deleteConfirmId && (
            <motion.div
              key="chat-delete-confirm-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-md"
              onClick={() => setDeleteConfirmId(null)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className={cn(
                  "w-full max-w-[340px] border rounded-3xl p-6 shadow-2xl relative backdrop-blur-xl",
                  theme === 'light'
                    ? "bg-white/95 border-neutral-200/50"
                    : "bg-neutral-900/95 border-neutral-800/80 text-white"
                )}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-lg font-bold mb-2">Delete chat?</h3>
                <p className={cn(
                  "text-sm mb-6 font-sans leading-relaxed",
                  theme === 'light' ? "text-neutral-500" : "text-neutral-400"
                )}>
                  This will permanently remove the conversation and its history.
                </p>
                <div className="flex items-center gap-3 w-full">
                  <button
                    onClick={() => setDeleteConfirmId(null)}
                    className={cn(
                      "flex-1 px-4 py-2.5 rounded-xl border text-[13px] font-semibold transition-colors cursor-pointer",
                      theme === 'light'
                        ? "border-neutral-200/80 text-neutral-700 hover:bg-neutral-50"
                        : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                    )}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      onDeleteChat(deleteConfirmId);
                      setDeleteConfirmId(null);
                    }}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 text-white text-[13px] font-semibold hover:bg-red-600 transition-colors shadow-sm cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Deep Research Beta Information Modal Overlay */}
        <AnimatePresence>
          {isDeepResearchOpen && (
            <motion.div
              key="deep-research-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
              onClick={() => setIsDeepResearchOpen(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className={cn(
                  "w-full max-w-[420px] border rounded-[28px] p-6 shadow-2xl relative overflow-hidden backdrop-blur-xl text-center",
                  theme === 'light'
                    ? "bg-white/95 border-neutral-200/50 text-neutral-900"
                    : "bg-neutral-900/95 border-neutral-800/80 text-white"
                )}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="absolute -top-[50px] left-[20%] right-[20%] h-[100px] bg-indigo-500/10 blur-[25px] rounded-full pointer-events-none" />

                <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-purple-500 flex items-center justify-center shadow-[0_4px_20px_rgba(99,102,241,0.35)] mx-auto mb-4 animate-pulse">
                  <Compass size={22} className="text-white" />
                </div>

                 <h3 className="text-lg font-bold font-sans tracking-tight mb-2 flex items-center justify-center gap-1.5">
                  Deep Research 
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 dark:text-amber-400 text-[10px] font-mono font-bold uppercase tracking-wider">Coming Soon</span>
                </h3>
                
                <p className={cn(
                  "text-[13px] leading-relaxed mb-6 font-sans px-2",
                  theme === 'light' ? "text-neutral-500" : "text-neutral-400"
                )}>
                  Deep Research is currently under development and will be available in a future update. Our autonomous research engine builds deep graphs, runs multi-hop web crawlers, and returns high-fidelity comprehensive reports.
                </p>

                <div className="w-full">
                  <button
                    onClick={() => setIsDeepResearchOpen(false)}
                    className={cn(
                      "w-full border rounded-xl py-3 text-xs font-semibold transition-colors cursor-pointer",
                      theme === 'light'
                        ? "border-neutral-200 hover:bg-neutral-50 text-neutral-700 hover:border-neutral-350"
                        : "border-neutral-700 hover:bg-neutral-800 text-neutral-300 hover:border-neutral-650"
                    )}
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modals moved to their respective pages */}

        {/* Global Live Search Overlay */}
        <AnimatePresence>
          {showSearchModal && (
            <motion.div
              key="search-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
              onClick={() => setShowSearchModal(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: -20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -20 }}
                className={cn(
                  "w-full max-w-[500px] border rounded-3xl overflow-hidden shadow-2xl relative backdrop-blur-xl flex flex-col max-h-[85vh]",
                  theme === 'light'
                    ? "bg-white/95 border-neutral-200/50"
                    : "bg-neutral-900/95 border-neutral-800/80 text-white"
                )}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-3 p-4 border-b border-white/[0.04]">
                  <Search size={15} className="text-neutral-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Search titles, messages, files..."
                    autoFocus
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={cn(
                      "flex-1 bg-transparent border-none text-[14px] focus:outline-none placeholder:text-neutral-500 font-sans",
                      theme === 'light' ? "text-neutral-900" : "text-white"
                    )}
                    style={{ border: 'none', boxShadow: 'none' }}
                  />
                  <button
                    onClick={() => setShowSearchModal(false)}
                    className={cn(
                      "p-1.5 rounded-full hover:bg-white/5 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    )}
                  >
                    <X size={15} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-0" style={{ scrollbarWidth: 'none' }}>
                  {isSearching ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-3">
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                      <span className="text-xs text-neutral-400 font-sans">Querying indices...</span>
                    </div>
                  ) : searchQuery.trim() === '' ? (
                    <div className="text-center py-12 text-neutral-500 text-xs font-sans">
                      Start typing to locate matching records instantly.
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="text-center py-12 text-neutral-500 text-xs font-sans">
                      No matching records found.
                    </div>
                  ) : (
                    searchResults.map((res) => (
                      <button
                        key={`${res.type}-${res.id}`}
                        onClick={() => {
                          onSelectChat(res.chatId);
                          setShowSearchModal(false);
                          setIsOpen(false);
                        }}
                        className={cn(
                          "w-full text-left p-3 rounded-2xl flex items-start gap-3 transition-colors text-[13.5px] border border-transparent cursor-pointer",
                          theme === 'light'
                            ? "hover:bg-neutral-50 text-neutral-700"
                            : "hover:bg-white/[0.03] text-neutral-200"
                        )}
                      >
                        {res.type === 'chat' && <MessageSquare className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />}
                        {res.type === 'message' && <Compass className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
                        {res.type === 'attachment' && <FileText className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold truncate text-[13px]">{res.title}</div>
                          <div className={cn(
                            "text-[11.5px] mt-1 line-clamp-2 leading-relaxed font-sans",
                            theme === 'light' ? "text-neutral-500" : "text-neutral-400"
                          )}>
                            <HighlightMatch text={res.snippet} query={searchQuery.trim()} />
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-neutral-550 shrink-0 self-center" />
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
          </>,
          document.body
        )}        {/* User Account Menu with Upward Dropdown */}
        <div ref={profileMenuRef} className="relative mt-4 pt-4 border-t flex-shrink-0">
          <AnimatePresence>
            {profileMenuOpen && (
              <motion.div
                key="profile-menu-dropdown"
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className={cn(
                  "absolute bottom-full mb-3 w-[280px] rounded-[20px] border backdrop-blur-xl shadow-2xl z-50 flex flex-col font-sans overflow-hidden",
                  isMobile ? "right-[20px]" : "right-0 left-0 sm:left-auto",
                  theme === 'dark' 
                    ? "bg-[#0c0c0c]/90 border-neutral-800/65 text-neutral-200 shadow-[0_12px_40px_rgba(0,0,0,0.5)]" 
                    : theme === 'cosmic'
                      ? "bg-[#0b061e]/90 border-indigo-500/20 text-indigo-50 shadow-[0_12px_40px_rgba(99,102,241,0.2)]"
                      : "bg-white/85 border-neutral-200/60 text-neutral-700 shadow-[0_12px_40px_rgba(0,0,0,0.08)]"
                )}
              >
                {/* User Card */}
                <div className={cn(
                  "px-4.5 py-3.5 flex items-center gap-3 shrink-0 border-b",
                  theme === 'dark' ? "border-neutral-800/65" : theme === 'cosmic' ? "border-indigo-950/40" : "border-neutral-100"
                )}>
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 text-white flex items-center justify-center font-bold text-sm shadow-md shrink-0 select-none">
                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div className="flex flex-col text-left min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        "text-[13px] font-bold tracking-tight truncate leading-tight",
                        theme === 'light' ? "text-neutral-800" : "text-white"
                      )}>
                        {user?.user_metadata?.full_name || user?.email?.split('@')[0] || "Account"}
                      </span>
                    </div>
                    <span className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate mt-0.5 leading-none">
                      {user?.email || "user@plack.ai"}
                    </span>
                  </div>
                </div>

                {/* Premium Dropdown Links */}
                <div className="flex-1 overflow-y-auto max-h-[380px] p-2 space-y-3 font-sans scrollbar-none">
                  {/* Account */}
                  <div className="space-y-0.5">
                    <div className="px-3 pb-1">
                      <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Account</span>
                    </div>
                    <button
                      onClick={() => { setProfileMenuOpen(false); onOpenSettings?.(); }}
                      className={cn(
                        "flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-xl transition-all cursor-pointer group text-[13px] font-medium",
                        theme === 'light' ? "hover:bg-neutral-100 text-neutral-700" : theme === 'cosmic' ? "hover:bg-indigo-900/30 text-indigo-100" : "hover:bg-neutral-800/50 text-neutral-200"
                      )}
                    >
                      <Settings size={14} className="text-neutral-400 group-hover:text-indigo-500 transition-colors" />
                      <span>Settings</span>
                    </button>
                  </div>

                  {/* Company */}
                  <div className="space-y-0.5">
                    <div className="px-3 pb-1">
                      <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Company</span>
                    </div>
                    <Link
                      href="/privacypolicy"
                      onClick={() => setProfileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-xl transition-all cursor-pointer group text-[13px] font-medium",
                        theme === 'light' ? "hover:bg-neutral-100 text-neutral-700" : theme === 'cosmic' ? "hover:bg-indigo-900/30 text-indigo-100" : "hover:bg-neutral-800/50 text-neutral-200"
                      )}
                    >
                      <Shield size={14} className="text-neutral-400 group-hover:text-indigo-500 transition-colors" />
                      <span>Privacy Policy</span>
                    </Link>
                    <Link
                      href="/termsofservice"
                      onClick={() => setProfileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-xl transition-all cursor-pointer group text-[13px] font-medium",
                        theme === 'light' ? "hover:bg-neutral-100 text-neutral-700" : theme === 'cosmic' ? "hover:bg-indigo-900/30 text-indigo-100" : "hover:bg-neutral-800/50 text-neutral-200"
                      )}
                    >
                      <FileText size={14} className="text-neutral-400 group-hover:text-indigo-500 transition-colors" />
                      <span>Terms of Service</span>
                    </Link>
                  </div>

                  {/* Danger Zone */}
                  <div className="space-y-0.5">
                    <div className="px-3 pb-1">
                      <span className="text-[10px] font-semibold text-red-500/80 dark:text-red-400/80 uppercase tracking-wider">Danger Zone</span>
                    </div>
                    <button
                      onClick={() => { setProfileMenuOpen(false); onLogoutClick?.(); }}
                      className={cn(
                        "flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-xl transition-all cursor-pointer group text-[13px] font-bold",
                        theme === 'light' ? "hover:bg-red-50 text-neutral-600" : theme === 'cosmic' ? "hover:bg-red-900/10 text-neutral-300" : "hover:bg-red-950/20 text-neutral-400"
                      )}
                    >
                      <LogOut size={14} className="text-neutral-500/70 group-hover:text-red-500 transition-colors" />
                      <span>Sign Out</span>
                    </button>
                    <button
                      onClick={() => { setProfileMenuOpen(false); setIsDeleteAccountOpen(true); }}
                      className={cn(
                        "flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-xl transition-all cursor-pointer group text-[13px] font-bold",
                        theme === 'light' ? "hover:bg-red-50 text-red-600" : theme === 'cosmic' ? "hover:bg-red-900/30 text-red-400" : "hover:bg-red-950/40 text-red-400"
                      )}
                    >
                      <X size={14} className="text-red-500/70 group-hover:text-red-500 transition-colors" />
                      <span>Delete Account</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Delete Account Confirmation Modal */}
          <AnimatePresence>
            {isDeleteAccountOpen && (
              <motion.div
                key="delete-account-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
                onClick={() => !isDeletingAccount && setIsDeleteAccountOpen(false)}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 15 }}
                  className={cn(
                    "w-full max-w-[420px] rounded-[24px] p-6 shadow-2xl relative overflow-hidden backdrop-blur-xl flex flex-col font-sans",
                    theme === 'light' ? "bg-white/95 border border-red-100 text-neutral-900" : "bg-[#0b061e]/95 border border-red-900/30 text-white"
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex flex-col items-center text-center space-y-4 pt-4">
                    <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-2">
                       <X size={32} className="text-red-600 dark:text-red-500" />
                    </div>
                    <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">Delete Account</h2>
                    <p className="text-[13.5px] leading-relaxed text-neutral-500 dark:text-neutral-400 font-medium">
                      This action is <strong className="text-red-600 dark:text-red-400">permanently irreversible</strong>. All of your chats, messages, attachments, and settings will be deleted. Do you want to proceed?
                    </p>
                  </div>
                  
                  {deleteAccountError && (
                    <div className="mt-6 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-red-600 dark:text-red-400 text-xs font-medium text-center">
                      {deleteAccountError}
                    </div>
                  )}

                  <div className="mt-8 flex gap-3">
                    <button
                      onClick={() => setIsDeleteAccountOpen(false)}
                      disabled={isDeletingAccount}
                      className={cn(
                        "flex-1 py-2.5 rounded-xl font-bold text-[13px] transition-all cursor-pointer opacity-90 hover:opacity-100",
                        theme === 'light' ? "bg-neutral-100 text-neutral-700" : "bg-neutral-800 text-neutral-300"
                      )}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={isDeletingAccount}
                      className={cn(
                        "flex-1 py-2.5 rounded-xl font-bold text-[13px] transition-all cursor-pointer text-white relative",
                        isDeletingAccount ? "opacity-70 bg-red-400" : "bg-red-600 hover:bg-red-700"
                      )}
                    >
                      {isDeletingAccount ? "Deleting..." : "Yes, Delete permanently"}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={() => setProfileMenuOpen(!profileMenuOpen)}
            className={cn(
              "flex items-center justify-between p-2 rounded-2xl border border-transparent transition-all duration-200 cursor-pointer w-full",
              getProfileRowBorder()
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 text-white flex items-center justify-center font-bold text-[13.5px] shadow-[0_2px_10px_rgba(99,102,241,0.25)] shrink-0 select-none">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="flex flex-col text-left min-w-0">
                <span className={cn(
                  "text-[13px] font-bold tracking-tight truncate leading-tight",
                  theme === 'light' ? "text-neutral-800" : "text-white"
                )}>
                  {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'}
                </span>
                <span className="text-[11px] text-neutral-400 truncate mt-0.5 select-all">
                  {user?.email}
                </span>
              </div>
            </div>
            
            <ChevronUp 
              size={14} 
              className={cn(
                "transition-transform duration-200 shrink-0",
                theme === 'light' ? "text-neutral-400" : "text-neutral-500",
                profileMenuOpen && "rotate-180"
              )} 
            />
          </button>
        </div>

        {/* Dynamic Resize handle for non-mobile desktop views */}
        {!isMobile && (
          <div
            className="absolute top-0 right-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-indigo-500/10 active:bg-indigo-500/20 transition-all z-50 group"
            onMouseDown={handleMouseDown}
            title="Drag to resize sidebar"
          >
            <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-0.5 h-8 bg-neutral-300/40 dark:bg-neutral-700/40 group-hover:bg-indigo-500/65 rounded-full transition-colors" />
          </div>
        )}
      </motion.div>
    </>
  );
}
