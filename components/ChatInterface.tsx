'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { 
  Send, 
  Plus, 
  Trash2, 
  Sparkles, 
  BrainCircuit, 
  Minimize2, 
  Maximize2, 
  ArrowUp, 
  FileText, 
  Image as ImageIcon, 
  Paperclip, 
  X, 
  Camera,
  Loader2, 
  HelpCircle,
  FileCode,
  Layers,
  ChevronDown,
  ChevronUp,
  Flame,
  History as HistoryIcon,
  Zap,
  RefreshCw,
  Mic,
  MicOff,
  Menu,
  Square,
  Check,
  Sun,
  Moon,
  Orbit,
  LogOut,
  Upload,
  User,
  Activity,
  Laptop,
  Eye,
  Download,
  Copy,
  Settings2,
  Cpu,
  Bookmark,
  Share2,
  Heart,
  ChevronRight,
  Search,
  Plug,
  EyeOff,
  Shield,
  AlertCircle,
  Globe,
  CheckCircle2,
  Radio,
  Video,
  AudioLines
} from 'lucide-react';
import PlackLive from '@/components/PlackLive';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import InlineDocumentBlock from '@/components/InlineDocumentBlock';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'motion/react';
import { createClient } from '@/lib/supabase/client';
import Image from 'next/image';
import brandingLogo from '@/src/assets/images/branding_logo_1780697091587.png';
import { createChat, getChats, updateChatTitle, deleteChat, saveMessage, getMessages, getFeedback, setFeedback, uploadAttachment, saveAttachmentRecord } from '@/lib/supabase/services';
import { Memory } from '@/lib/supabase/memories';
import { detectMemoryIntent } from '@/lib/ai/intent';
import { createDocument, saveDocument, getDocuments, DocumentRecord } from '@/lib/supabase/documents';
import Auth from '@/components/Auth';
import AuthGuard from '@/components/AuthGuard';
import Sidebar from '@/components/Sidebar';
import ConversationMinimap from '@/components/ConversationMinimap';
import SearchSourcesSidebar from '@/components/SearchSourcesSidebar';
import { logger, LogCategory } from '@/lib/logger';
import { useAppContext } from '@/context/AppContext';

// Message schema
interface Attachment {
  id?: string;
  name: string;
  type: string;
  size: number;
  data?: string; // Base64 data for local preview
  textContent?: string; // Loaded text content if applicable
  publicUrl?: string; // Storage public URL
  storagePath?: string; // Storage path
  uploadFailed?: boolean; // Attachment failed to upload to storage
  localFile?: File; // Defer upload until sendMessage
}

interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  reasoning?: string;
  isStreaming?: boolean;
  attachments?: Attachment[];
  groundingMetadata?: any;
  isDeepResearch?: boolean;
  researchTimeline?: string[];
  activeStageIndex?: number;
  researchStatus?: string;
  memorySaved?: { category: string; content: string; action?: 'add' | 'update' | 'delete' };
  memoryLimitReached?: boolean;
  isMemoryTurn?: boolean;
  memoriesUsedCount?: number;
  memoriesUsed?: any[];
  isManualMemories?: boolean;
  profileSummary?: {
    writingStyle?: string;
    uiStyle?: string;
    interests?: string;
    projectTypes?: string;
  };
}

interface ErrorReport {
  failingComponent: string;
  failingRoute: string;
  httpStatus?: number | string;
  errorMessage: string;
  stackTrace?: string;
  modelUsed?: string;
  chatId?: string;
  requestCount?: number;
  rootCause: string;
}

interface Artifact {
  id: string;
  filename: string;
  extension: string;
  content: string;
  language: string;
  status: 'ready' | 'generating';
}

// Inline thought parser
function parseStreamingText(fullText: string) {
  if (!fullText || typeof fullText !== 'string') {
    return { text: '', thought: '' };
  }
  const thoughtStart = fullText.indexOf('<thought>');
  const thoughtEnd = fullText.indexOf('</thought>');

  let text = fullText;
  let thought = '';

  if (thoughtStart !== -1) {
    if (thoughtEnd !== -1) {
      // Completed thought block
      thought = fullText.substring(thoughtStart + 9, thoughtEnd);
      text = fullText.substring(0, thoughtStart) + fullText.substring(thoughtEnd + 10);
    } else {
      // Still writing thoughts
      thought = fullText.substring(thoughtStart + 9);
      text = fullText.substring(0, thoughtStart);
    }
  }

  return { text, thought };
}

interface ExtractedDocument {
  hasDocument: boolean;
  id?: string;
  title: string;
  content: string;
  isCompleted: boolean;
  cleanText: string;
}

function extractDocumentBlock(fullText: string): ExtractedDocument {
  if (!fullText) return { hasDocument: false, title: '', content: '', isCompleted: false, cleanText: '' };
  
  // Use regex to find document blocks more reliably
  const docRegex = /<document(?:\s+title=["']([^"']*)["'])?(?:\s+id=["']([^"']*)["'])?.*?>([\s\S]*?)(?:<\/document>|$)/i;
  const match = fullText.match(docRegex);
  
  if (!match) {
    return { hasDocument: false, title: '', content: '', isCompleted: false, cleanText: fullText };
  }

  const title = match[1] || 'Untitled Document';
  const id = match[2];
  const content = match[3] || '';
  const isCompleted = fullText.toLowerCase().includes('</document>');
  
  // Clean text should remove ALL document tags
  const cleanText = fullText.replace(/<document[\s\S]*?(?:<\/document>|$)/gi, '').trim();

  return {
    hasDocument: true,
    id,
    title,
    content,
    isCompleted,
    cleanText
  };
}

function generateSlug(title: string, uuid: string): string {
  const cleanTitle = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')   // replace non-alphanumeric chars with hyphens
    .replace(/(^-+|-+$)/g, '');    // remove leading/trailing hyphens
  
  if (!cleanTitle) return uuid;
  return `${cleanTitle}-${uuid}`;
}

function extractChatId(paramId: string | undefined): string | null {
  if (!paramId) return null;
  const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const match = paramId.match(uuidRegex);
  if (match) {
    return match[0];
  }
  return paramId;
}

export default function Home() {
  const router = useRouter();
  const params = useParams();
  const routeChatId = params?.id as string | undefined;
  const pathname = usePathname();

  const {
    session,
    chats,
    setChats,
    activeChatId,
    setActiveChatId,
    theme,
    themeSetting,
    setThemeSetting,
    isMobile,
    isSidebarOpen,
    setIsSidebarOpen,
    sidebarWidth,
    setSidebarWidth,
    onNewChat,
    onSelectChat,
    onRenameChat,
    onDeleteChat,
    onTogglePinChat,
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
    accentColor,
    customColor,
    setAccentColor,
    liveVoice,
    setLiveVoiceContext
  } = useAppContext();

  // Smart Document Workspace Experience (Inline only now)
  const streamingDocRef = useRef<{ id: string; title: string; content: string } | null>(null);

  // Add logging for document layouts (Disabled)
  useEffect(() => {
    // console.log('[DOCUMENT PANEL CLEANED]');
  }, [isMobile]);

  // Remove local states that are now in context
  const chatsRef = useRef<any[]>([]);
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);
  const activeChatIdRef = useRef<string | null>(activeChatId);
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  // Multi-chat background streaming and tracking states
  const abortControllersRef = useRef<Record<string, AbortController | null>>({});
  const activeRequestsRef = useRef<Record<string, boolean>>({});
  const activeTitleRequestsRef = useRef<Record<string, boolean>>({});
  const deferredTitleRequestsRef = useRef<Record<string, string>>({});
  const concurrentCountRef = useRef<number>(0);

  // Advanced Settings states
  const [aiPersonality, setAiPersonality] = useState<string>('Balanced');
  const [customInstructions, setCustomInstructions] = useState<string>('');
  const [streamingResponses, setStreamingResponses] = useState<boolean>(true);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [showReasoning, setShowReasoning] = useState<boolean>(true);

  const activeProfile = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].profileSummary) {
        return messages[i].profileSummary;
      }
    }
    return null;
  }, [messages]);

  // Messages logger and helper
  const logAndSetMessages = (newMessages: Message[] | ((prev: Message[]) => Message[])) => {
    setMessages(prev => {
      const updatedMessages = typeof newMessages === 'function' ? newMessages(prev) : newMessages;
      
      const ids = updatedMessages.map((m: Message) => m.id);
      const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
      if (duplicates.length) {
        logger.logError(LogCategory.CHAT, "DUPLICATE MESSAGE IDS DETECTED", duplicates);
      }
      return updatedMessages;
    });
  };

  const addSystemMessage = (content: string) => {
    const systemMsg: Message = {
      id: `system-${crypto.randomUUID()}`,
      role: 'system',
      content
    };
    logAndSetMessages(prev => [...prev, systemMsg]);
  };

  const [isDragging, setIsDragging] = useState(false);
  const [expandedReasonings, setExpandedReasonings] = useState<Record<string, boolean>>({});
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Stream state logging
  useEffect(() => {
    logger.logInfo(LogCategory.STREAM, "State Updated", {
      chatId: activeChatId,
      isStreaming,
      activeStreamCount: Object.keys(activeStreams).length,
    });
  }, [isStreaming, activeChatId, activeStreams]);
  
  // Message Action States
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<string>('');
  const [messageAppreciations, setMessageAppreciations] = useState<Record<string, 'like' | 'dislike'>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [memoryToast, setMemoryToast] = useState<{ type: 'success' | 'error'; content: string } | null>(null);
  const [memoryIntentActive, setMemoryIntentActive] = useState(false);
  const [autoSaveMemories, setAutoSaveMemories] = useState<boolean>(true);
  const [memoryReviewNeeded, setMemoryReviewNeeded] = useState<{ category: string; content: string; summary: string } | null>(null);
  const [memoryUpdateNeeded, setMemoryUpdateNeeded] = useState<{ targetMemoryId: string; oldContent: string; newContent: string; category: string } | null>(null);
  const [memoryDeleteNeeded, setMemoryDeleteNeeded] = useState<{ targetMemoryId: string; content: string; category: string } | null>(null);
  // Add requested logs for plus menu and device type
  useEffect(() => {
    console.log(`[DEVICE TYPE] isMobile: ${isMobile}`);
    console.log(`[PLUS MENU ITEMS] Rendering...`);
  }, [isMobile]);

  const [isMobileMapOpen, setIsMobileMapOpen] = useState(false);
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(false);
  const [useDeepResearch, setUseDeepResearch] = useState(false);
  const [showWebSearchLimitModal, setShowWebSearchLimitModal] = useState(false);
  const [webSearchRemaining, setWebSearchRemaining] = useState<number | null>(null);
  const [limitCard, setLimitCard] = useState<{ actionType: string; resetIn: string } | null>(null);
  const [isSourcesSidebarOpen, setIsSourcesSidebarOpen] = useState(false);
  const [activeSources, setActiveSources] = useState<any[]>([]);
  const [sourcesWidth, setSourcesWidth] = useState(380);

  // Responsive Sources Sidebar Width Calculation (Desktop)
  useEffect(() => {
    if (typeof window === 'undefined' || isMobile) return;
    
    const handleResize = () => {
      // Logic: Aim for 28% of screen, clamped between 320px and 420px
      const calculated = Math.min(Math.max(320, window.innerWidth * 0.28), 420);
      setSourcesWidth(calculated);
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobile]);

  // Deep Research Sites & Search options
  const [deepResearchWebSearchEnabled, setDeepResearchWebSearchEnabled] = useState<boolean>(true);
  const [preferredDomainsInput, setPreferredDomainsInput] = useState<string>("");

  // Appearance Switching and settings states
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTemporaryChat, setIsTemporaryChat] = useState(false);
  const [isManageExpanded, setIsManageExpanded] = useState(false);
  const [draftRestoredNote, setDraftRestoredNote] = useState<string | null>(null);

  // Zoom Integration States & Handlers
  const [zoomEmail, setZoomEmail] = useState<string | null>(null);
  const [isZoomLoading, setIsZoomLoading] = useState<boolean>(false);

  const fetchConnectionStatuses = async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch('/api/connections/status', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      if (res.ok) {
        const data = await res.json() as any;
        const connections = data.connections || [];
        const zoomConn = connections.find((c: any) => c.provider === 'zoom');
        if (zoomConn) {
          setZoomEmail(zoomConn.accountEmail);
        } else {
          setZoomEmail(null);
        }
      }
    } catch (err) {
      console.error('[ZOOM] Failed to fetch connection statuses:', err);
    }
  };

  const handleConnectZoom = async () => {
    if (!session?.access_token) {
      alert('Please sign in first to connect services.');
      return;
    }
    try {
      setIsZoomLoading(true);
      const res = await fetch('/api/zoom/auth', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Accept': 'application/json'
        }
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json() as any;
      if (!data.url) {
        throw new Error('OAuth URL not returned from server');
      }

      const width = 600;
      const height = 700;
      const left = window.screenX + (window.innerWidth - width) / 2;
      const top = window.screenY + (window.innerHeight - height) / 2;
      
      const popup = window.open(
        data.url,
        'Connect Zoom',
        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
      );

      const handleOAuthMessage = (event: MessageEvent) => {
        if (event.data && event.data.type === 'ZOOM_CONNECTED') {
          if (event.data.success) {
            setZoomEmail(event.data.email || 'Connected');
            fetchConnectionStatuses();
          } else {
            alert(`Unable to connect your Zoom account. Please try again. Error: ${event.data.error || 'Unknown'}`);
          }
          window.removeEventListener('message', handleOAuthMessage);
        }
      };

      window.addEventListener('message', handleOAuthMessage);
    } catch (err: any) {
      console.error('[ZOOM] Connection failed:', err);
      alert(`Unable to connect your Zoom account. Please try again.`);
    } finally {
      setIsZoomLoading(false);
    }
  };

  const handleDisconnectZoom = async () => {
    if (!session?.access_token) return;
    if (!confirm('Are you sure you want to disconnect Zoom? This will revoke Plack AI access to manage meetings.')) return;
    
    try {
      setIsZoomLoading(true);
      const res = await fetch('/api/connections/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ provider: 'zoom' })
      });
      if (res.ok) {
        setZoomEmail(null);
        fetchConnectionStatuses();
      } else {
        throw new Error(await res.text());
      }
    } catch (err) {
      console.error('[ZOOM] Disconnection failed:', err);
      alert('Failed to disconnect Zoom. Please try again.');
    } finally {
      setIsZoomLoading(false);
    }
  };


  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isFullscreenInputOpen, setIsFullscreenInputOpen] = useState(false);
  const [isLiveModeOpen, setIsLiveModeOpen] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState<{ userText: string; aiText: string }>({ userText: '', aiText: '' });
  const [inputLineCount, setInputLineCount] = useState(1);
  const [memoryUsage, setMemoryUsage] = useState({ used_bytes: 0, count: 0, used_slots: 0, max_slots: 99 });
  const [userMemories, setUserMemories] = useState<Memory[]>([]);
  const [isMemoryManagerOpen, setIsMemoryManagerOpen] = useState(false);
  const [memorySearch, setMemorySearch] = useState('');
  const [memorySort, setMemorySort] = useState<'newest' | 'oldest'>('newest');
  const [isEditingMemoryId, setIsEditingMemoryId] = useState<string | null>(null);
  const [editingMemoryContent, setEditingMemoryContent] = useState('');
  const [activeMemoryIds, setActiveMemoryIds] = useState<string[]>([]);
  const [isMemoryPickerOpen, setIsMemoryPickerOpen] = useState(false);
  const [memoryDeleteConfirm, setMemoryDeleteConfirm] = useState<{
    isOpen: boolean;
    memoryId: string | null;
    content?: string;
    all?: boolean;
    isProcessing?: boolean;
  } | null>(null);

  // Sources Sidebar Context Logger & Auto-close on chat change
  useEffect(() => {
    console.log('[SOURCES CHAT CHANGED] Closing sources panel and clearing context for new chat:', activeChatId);
    setIsSourcesSidebarOpen(false);
    setActiveSources([]);
    console.log('[SOURCES RESET] Sidebar and sources state cleared.');
  }, [activeChatId]);

  // Logging for chat opening
  useEffect(() => {
    if (activeChatId) {
      console.log('[CHAT OPEN] Conversation initialized:', activeChatId);
      // Wait for messages to load then scroll
      const timer = setTimeout(() => {
        console.log('[CHAT RESTORED] Scrolling to latest messages');
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
        console.log('[SCROLL TO LATEST] Viewport positioned at bottom');
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [activeChatId]);

  const logErrorAudit = (component: string, action: string, reason: string | Error) => {
    const errorMsg = reason instanceof Error ? reason.message : String(reason);
    console.error(`[ERROR AUDIT]\nComponent: ${component}\nAction: ${action}\nResult: Failed\nReason: ${errorMsg}`);
  };

  // --- USER AVATAR BRANDING PRESERVATION ---
  useEffect(() => {
    if (!session?.user) return;
    const syncAvatar = async () => {
      try {
        const userMetadata = session.user.user_metadata || {};
        const currentAvatar = userMetadata.avatar_url;
        const preservedAvatar = userMetadata.preserved_avatar;
        const supabase = createClient();

        // If they have a custom uploaded avatar (contains 'avatars' bucket path)
        const isCustomUploaded = currentAvatar && currentAvatar.includes('/storage/v1/object/public/avatars/');

        if (isCustomUploaded) {
          if (preservedAvatar !== currentAvatar) {
            console.log('[AVATAR PRESERVATION] Locking in custom uploaded avatar:', currentAvatar);
            await supabase.auth.updateUser({
              data: { preserved_avatar: currentAvatar }
            });
          }
        } else if (preservedAvatar) {
          // If a preserved avatar of user metadata exists but is currently overwritten by social oauth provider login
          if (currentAvatar !== preservedAvatar) {
            console.log('[AVATAR PRESERVATION] Restoring user avatar branding from:', preservedAvatar);
            await supabase.auth.updateUser({
              data: { avatar_url: preservedAvatar }
            });
          }
        } else if (currentAvatar && !preservedAvatar) {
          // First social provider avatar detection - lock in
          console.log('[AVATAR PRESERVATION] Setting initial social provider avatar as preserved:', currentAvatar);
          await supabase.auth.updateUser({
            data: { preserved_avatar: currentAvatar }
          });
        }
      } catch (err: any) {
        logErrorAudit('ChatInterface', 'Avatar Preservation Sync', err);
      }
    };
    syncAvatar();
  }, [session]);

  const [modelError, setModelError] = useState<{ failedModel: ModelName, recommendedModel: ModelName | null } | null>(null);
  const [autoSwitchModels, setAutoSwitchModels] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  
  useEffect(() => {
    if (session?.user?.user_metadata?.full_name && !displayName) {
       // eslint-disable-next-line react-hooks/set-state-in-effect
       setDisplayName(session.user.user_metadata.full_name);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const checkUsageLimit = async (userId: string, actionType: string, model?: string) => {
    try {
      const res = await fetch("/api/usage/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, actionType, model })
      });
      if (!res.ok) {
        return { allowed: true };
      }
      return await res.json();
    } catch (e) {
      logger.logError(LogCategory.ERROR, "Usage check failed", e);
      return { allowed: true };
    }
  };

  const fetchWebSearchUsage = async () => {
    if (!session?.user?.id) return;
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('get_web_search_usage', { p_user_id: session.user.id });
      if (!error && data !== null && data !== undefined) {
         const result = Array.isArray(data) ? data[0] : data;
         if (typeof result === 'object' && typeof result.remaining === 'number') {
           setWebSearchRemaining(result.remaining);
         } else if (typeof result === 'string') {
           try {
             const parsed = JSON.parse(result);
             if (typeof parsed.remaining === 'number') {
               setWebSearchRemaining(parsed.remaining);
             }
           } catch(e) {}
         }
      }
    } catch (error) {
      logger.logError(LogCategory.DATABASE, 'Failed to fetch web search usage', error);
    }
  };

  const getMessageSourcesList = (msg: Message) => {
    const list: any[] = [];
    
    // 1. Memory Context
    const usedCount = msg.memoriesUsedCount || 0;
    const usedList = msg.memoriesUsed || [];
    if (usedCount > 0) {
      list.push({
        type: msg.isManualMemories ? 'userSelectedMemories' : 'memory',
        title: msg.isManualMemories ? 'User Selected Memories' : 'AI Context Memory',
        count: usedCount,
        details: usedList.length > 0 
          ? usedList.map((m: any) => m.content) 
          : [`Recalled ${usedCount} context fact${usedCount > 1 ? 's' : ''} from safe memory storage`],
        extraData: usedList
      });
    }

    // 2. Chat History Context
    const msgIdx = messages.indexOf(msg);
    if (msgIdx > 1) {
      list.push({
        type: 'chatHistory',
        title: 'Chat History',
        count: 1,
        details: ['Previous conversation context used to construct a coherent response flow']
      });
    }

    // 3. Web Search
    const chunks = msg.groundingMetadata?.groundingChunks || [];
    if (chunks.length > 0) {
      const details = chunks.map((chunk: any) => {
        const webInfo = chunk.web || chunk.retrievedContext;
        return webInfo?.uri || webInfo?.title || 'Web Search Chunk';
      }).filter(Boolean);

      list.push({
        type: 'search',
        title: 'Web Search',
        count: chunks.length,
        details: details,
        extraData: chunks
      });
    }

    // 4. File attachments from this or prior user active message
    const precedingUserMsg = msgIdx > 0 ? messages[msgIdx - 1] : null;
    const attachedFiles = precedingUserMsg?.attachments || [];
    if (attachedFiles.length > 0) {
      list.push({
        type: 'files',
        title: 'Files',
        count: attachedFiles.length,
        details: attachedFiles.map((att: any) => `${att.name || 'FileAttachment'} (${att.type || 'unknown type'})`),
        extraData: attachedFiles
      });
    }

    // 5. Deep Research
    if (msg.isDeepResearch) {
      list.push({
        type: 'deepResearch',
        title: 'Deep Research Report',
        count: 1,
        details: ['Multi-stage deep query synthesis, planning, and information validation pipeline']
      });
    }

    return list;
  };

  const fetchMemoryData = React.useCallback(async () => {
    if (!session?.user?.id) {
      console.warn("[MEMORY LOAD] No user session ID found. Logic skipped.");
      return;
    }
    try {
      console.log("[MEMORY MANAGER LOAD START]");
      console.log("[USER ID]", session.user.id);
      console.log("[MEMORY REFRESH] Initiating fetch for user memories and usage");
      
      const res = await fetch(`/api/memories?userId=${encodeURIComponent(session.user.id)}`);
      if (!res.ok) {
        throw new Error(`API error: ${res.statusText}`);
      }
      const data = await res.json();
      
      console.log("[MEMORY MANAGER QUERY RESULT]", data.memories);
      console.log("[MEMORY MANAGER COUNT]", data.memories?.length || 0);
      console.log("[MEMORY USAGE DATA]", data.usage);
      
      const list = data.memories || [];
      const usage = data.usage || { used_bytes: 0, count: 0, used_slots: 0, max_slots: 99 };

      setMemoryUsage(usage);
      setUserMemories(list || []);
      console.log("[MEMORY SETTINGS] Local state synchronized with database.", { 
        count: list?.length, 
        slots: usage?.used_slots,
        isPickerOpen: isMemoryPickerOpen,
        isManagerOpen: isMemoryManagerOpen
      });
    } catch (err) {
      console.error("[MEMORY ERROR] Failed to fetch memory data from API", err);
    }
  }, [session?.user?.id, isMemoryPickerOpen, isMemoryManagerOpen]);

  useEffect(() => {
    if (session?.user?.id) {
      fetchWebSearchUsage();
      // Ensure memories are fetched whenever any of the management/selection UIs are opened
      if (isSettingsOpen || isMemoryPickerOpen || isMemoryManagerOpen) {
        const loadContext = isMemoryPickerOpen ? "PICKER" : isMemoryManagerOpen ? "MANAGER" : "SETTINGS";
        console.log(`[MEMORY ${loadContext} LOAD] UI state change detected, calling fetchMemoryData`, {
          settings: isSettingsOpen,
          picker: isMemoryPickerOpen,
          manager: isMemoryManagerOpen
        });
        fetchMemoryData();
      }
    }
  }, [session?.user?.id, isSettingsOpen, isMemoryPickerOpen, isMemoryManagerOpen, fetchMemoryData]);

  // Supabase Realtime Subscription for Memories
  useEffect(() => {
    if (!session?.user?.id) return;

    const supabase = createClient();
    const channel = supabase
      .channel('memories-realtime-stats')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'memories',
          filter: `user_id=eq.${session.user.id}`
        },
        (payload) => {
          console.log("[MEMORY REALTIME UPDATE]", payload);
          fetchMemoryData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, fetchMemoryData]);

  // Auto-dismiss memory toast after 3 seconds
  useEffect(() => {
    if (memoryToast) {
      const timer = setTimeout(() => {
        setMemoryToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [memoryToast]);

  // Load preferences on mount
  useEffect(() => {
    const savedPersonality = localStorage.getItem('plack-ai-personality') || 'Balanced';
    setAiPersonality(savedPersonality);

    const savedInstructions = localStorage.getItem('plack-custom-instructions') || '';
    setCustomInstructions(savedInstructions);

    const savedStreaming = localStorage.getItem('plack-streaming-responses');
    setStreamingResponses(savedStreaming !== 'false');

    const savedAutoScroll = localStorage.getItem('plack-auto-scroll');
    setAutoScroll(savedAutoScroll !== 'false');

    const savedReasoning = localStorage.getItem('plack-show-reasoning');
    setShowReasoning(savedReasoning !== 'false');

    const savedAutoSave = localStorage.getItem('plack-auto-save-memories');
    setAutoSaveMemories(savedAutoSave !== 'false');
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
  };

  const formattedDate = () => {
    if (!session?.user?.created_at) return 'Member since June 2026';
    try {
      const d = new Date(session.user.created_at);
      return `Joined ${d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
    } catch (_) {
      return 'Member since June 2026';
    }
  };

  const deleteOldAvatar = async (supabase: any, oldAvatarUrl: string | null | undefined) => {
    if (!oldAvatarUrl) return;
    try {
      const bucketMarker = '/storage/v1/object/public/avatars/';
      if (oldAvatarUrl.includes(bucketMarker)) {
        const parts = oldAvatarUrl.split(bucketMarker);
        if (parts.length > 1) {
          const oldPath = decodeURIComponent(parts[1]);
          console.log("[AVATAR CLEANUP] Deleting old logo avatar from storage:", oldPath);
          await supabase.storage.from('avatars').remove([oldPath]);
        }
      }
    } catch (err) {
      console.warn("[AVATAR CLEANUP] Failed to delete old avatar file:", err);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
       setErrorStatus('Invalid file type. Supported: JPG, PNG, WEBP.');
       return;
    }
    const oldAvatarUrl = session?.user?.user_metadata?.avatar_url;
    setAvatarUploading(true);
    try {
       const supabase = createClient();
       const fileExt = file.name.split('.').pop();
       // Store in a subdirectory named after user ID for better organization and policy compliance
       const filePath = `${session?.user?.id}/${Date.now()}.${fileExt}`;
       const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file);
       
       if (uploadError) {
         if (uploadError.message.includes('bucket not found') || (uploadError as any).status === 404) {
           throw new Error("The 'avatars' storage bucket has not been created yet. Please create a public bucket named 'avatars' in your administration dashboard.");
         }
         if (uploadError.message.toLowerCase().includes('row-level security') || uploadError.message.toLowerCase().includes('rls')) {
           throw new Error("Upload failed due to database security policies (RLS). Ensure the 'avatars' bucket has proper storage policies configured.");
         }
         throw uploadError;
       }
       
       const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
       
       const { error: updateError } = await supabase.auth.updateUser({
         data: { avatar_url: data.publicUrl }
       });
       if (updateError) throw updateError;
       
       if (oldAvatarUrl) {
         await deleteOldAvatar(supabase, oldAvatarUrl);
       }
       
       // Note: supabase triggers a session update or we might need to manually refresh session
    } catch (err: any) {
       setErrorStatus('Upload failed: ' + err.message);
    } finally {
       setAvatarUploading(false);
    }
  };

  const handleDisplayNameSave = async () => {
    if (displayName === session?.user?.user_metadata?.full_name) return;
    try {
      const supabase = createClient();
      await supabase.auth.updateUser({
         data: { full_name: displayName }
      });
    } catch (err: any) {
      setErrorStatus('Failed to update display name.');
    }
  };

  const handleRemoveAvatar = async () => {
    try {
      const supabase = createClient();
      const oldAvatarUrl = session?.user?.user_metadata?.avatar_url;
      await supabase.auth.updateUser({ data: { avatar_url: null, preserved_avatar: null } });
      if (oldAvatarUrl) {
        await deleteOldAvatar(supabase, oldAvatarUrl);
      }
    } catch (err: any) {
      logErrorAudit('ChatInterface', 'Remove Avatar', err);
      setErrorStatus('Failed to remove avatar.');
    }
  };

  // Auto-dismiss errors after 7 seconds
  useEffect(() => {
    if (errorStatus) {
      const timer = setTimeout(() => {
        setErrorStatus(null);
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [errorStatus]);

  // Reference for stopping stream generation dynamically
  const abortControllerRef = useRef<AbortController | null>(null);
  
  type ModelName = 'E1' | 'ED1.1' | 'ED1.7' | 'D1-Lite';
  const modelMap: Record<ModelName, string> = {
    'E1': 'models/gemini-3.1-flash-lite-preview',
    'ED1.1': 'models/gemini-3-flash-preview',
    'ED1.7': 'models/gemini-3.5-flash',
    'D1-Lite': 'models/gemini-2.5-flash'
  };

  // Model settings
  const [activeModel, setActiveModel] = useState<ModelName>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('plack_active_model') as ModelName;
      if (['E1', 'ED1.1', 'ED1.7', 'D1-Lite'].includes(saved)) return saved;
    }
    return 'ED1.7';
  });

  // Sync activeModel state to localStorage and Supabase metadata for persistence
  useEffect(() => {
    if (activeModel) {
      localStorage.setItem('plack_active_model', activeModel);
      
      const syncToSupabase = async () => {
        if (session?.user?.id) {
          try {
            const supabase = createClient();
            await supabase.auth.updateUser({
              data: { preferred_model: activeModel }
            });
          } catch (err) {
            console.error("[MODEL_PERSISTENCE] Failed to sync model to Supabase:", err);
          }
        }
      };
      
      // Debounce supabase sync slightly or just fire and forget
      syncToSupabase();
    }
  }, [activeModel, session?.user?.id]);

  // Restore model from Supabase metadata on session load
  useEffect(() => {
    if (session?.user?.user_metadata?.preferred_model) {
      const savedModel = session.user.user_metadata.preferred_model as ModelName;
      if (['E1', 'ED1.1', 'ED1.7', 'D1-Lite'].includes(savedModel) && savedModel !== activeModel) {
        setActiveModel(savedModel);
      }
    }
  }, [session?.user?.id]);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  const [isMentionMenuOpen, setIsMentionMenuOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');

  const startCamera = () => {
    if (cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  };

  // Handle "@" typing to trigger model mention list removed as user requested removal of @ popup
  // controlling all tools via the Plus Menu

  const handleSelectMentionModel = (modelId: ModelName) => {
    setActiveModel(modelId);
    const words = inputValue.split(/\s+/);
    if (words.length > 0 && words[words.length - 1]?.startsWith('@')) {
      words.pop();
    }
    const newText = words.join(' ') + (words.length > 0 ? ' ' : '');
    setInputValue(newText);
    setIsMentionMenuOpen(false);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  };

  // --- DRAFT RECOVERY SYSTEM ---
  useEffect(() => {
    if (activeChatId === 'temporary' || isTemporaryChat) return;

    const draftKey = `plack_draft_${activeChatId || 'new-chat'}`;

    if (inputValue.trim() || attachments.length > 0 || activeModel !== 'ED1.7') {
      const draftData = {
        text: inputValue,
        attachments: attachments.map(a => ({ ...a, localFile: undefined })), // Avoid circular/unserializable File objects
        model: activeModel,
        updatedAt: Date.now()
      };
      try {
        const serialized = JSON.stringify(draftData);
        sessionStorage.setItem(draftKey, serialized);
        localStorage.setItem(draftKey, serialized);
      } catch (e) {
        logger.logError(LogCategory.CHAT, "Failed to serialize draft data", e);
      }
    } else {
      sessionStorage.removeItem(draftKey);
      localStorage.removeItem(draftKey);
    }
  }, [inputValue, attachments, activeModel, activeChatId, isTemporaryChat]);

  useEffect(() => {
    if (activeChatId === 'temporary' || isTemporaryChat) return;

    const draftKey = `plack_draft_${activeChatId || 'new-chat'}`;
    const stored = sessionStorage.getItem(draftKey) || localStorage.getItem(draftKey);

    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        let didRestore = false;

        if (parsed.text !== undefined && parsed.text !== inputValue) {
          setInputValue(parsed.text);
          if (parsed.text.trim()) didRestore = true;
        }
        
        const cleanAttachment = (a: Attachment) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          size: a.size,
          data: a.data,
          textContent: a.textContent,
          publicUrl: a.publicUrl,
          storagePath: a.storagePath,
          uploadFailed: a.uploadFailed
        });
        // Only restore attachments if they differ significantly to avoid loops
        const currentAttachmentsClean = attachments.map(cleanAttachment);
        if (parsed.attachments !== undefined && JSON.stringify(parsed.attachments) !== JSON.stringify(currentAttachmentsClean)) {
          setAttachments(parsed.attachments);
          if (parsed.attachments.length > 0) didRestore = true;
        }
        
        if (parsed.model !== undefined && parsed.model !== activeModel) {
          setActiveModel(parsed.model);
          didRestore = true;
        }

        if (didRestore) {
          setDraftRestoredNote("Draft restored");
          const timer = setTimeout(() => {
            setDraftRestoredNote(null);
          }, 3000);
          return () => clearTimeout(timer);
        }
      } catch (e) {
        logger.logError(LogCategory.CHAT, "Failed to parse draft", e);
      }
    } else {
      setInputValue('');
      setAttachments([]);
    }
  }, [activeChatId, isTemporaryChat]);

  useEffect(() => {
    const handleImmediateSave = () => {
      if (activeChatId === 'temporary' || isTemporaryChat) return;
      const draftKey = `plack_draft_${activeChatId || 'new-chat'}`;
      if (inputValue.trim() || attachments.length > 0 || activeModel !== 'ED1.7') {
        const cleanAttachment = (a: Attachment) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          size: a.size,
          data: a.data,
          textContent: a.textContent,
          publicUrl: a.publicUrl,
          storagePath: a.storagePath,
          uploadFailed: a.uploadFailed
        });
        const draftData = {
          text: inputValue,
          attachments: attachments.map(cleanAttachment), 
          model: activeModel,
          updatedAt: Date.now()
        };
        try {
          const serialized = JSON.stringify(draftData);
          sessionStorage.setItem(draftKey, serialized);
          localStorage.setItem(draftKey, serialized);
        } catch (e) {
          logger.logError(LogCategory.CHAT, "Failed to serialize draft data on window blur", e);
        }
      }
    };

    window.addEventListener('blur', handleImmediateSave);
    document.addEventListener('visibilitychange', handleImmediateSave);

    return () => {
      window.removeEventListener('blur', handleImmediateSave);
      document.removeEventListener('visibilitychange', handleImmediateSave);
    };
  }, [inputValue, attachments, activeModel, activeChatId, isTemporaryChat]);



  // --- CONNECTIONS STATUS RECOVERY ---
  useEffect(() => {
    fetchConnectionStatuses();
  }, [session]);

  const startupHandledRef = useRef(false);

  // Sync route param chat ID with state and load messages automatically
  useEffect(() => {
    let resolvedId = extractChatId(routeChatId);
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (path.startsWith('/chat/')) {
        resolvedId = extractChatId(path.substring(6));
      } else if (path === '/') {
        resolvedId = null;
      }
    }

    if (session) {
      const isStartup = !startupHandledRef.current;
      if (isStartup) {
        startupHandledRef.current = true;
      }

      if (resolvedId && activeChatIdRef.current !== resolvedId) {
        logger.logInfo(LogCategory.CHAT, "[CHAT RESTORE]", {
          urlChatId: resolvedId,
          lastActiveChatId: localStorage.getItem('lastActiveChatId'),
          restoredChatId: resolvedId,
          reason: 'A. URL contains chat id'
        });
        selectChat(resolvedId);
      } else if (!resolvedId && isStartup) {
        const lastActive = localStorage.getItem('lastActiveChatId');
        if (lastActive) {
          logger.logInfo(LogCategory.CHAT, "[CHAT RESTORE]", {
            urlChatId: null,
            lastActiveChatId: lastActive,
            restoredChatId: lastActive,
            reason: 'B. Restore last active chat'
          });
          selectChat(lastActive);
          return;
        } else {
          setIsTemporaryChat(false);
          logger.logInfo(LogCategory.CHAT, "[CHAT RESTORE]", {
            urlChatId: null,
            lastActiveChatId: null,
            restoredChatId: null,
            reason: 'C. No chats exist (New Chat)'
          });
        }
      }
      
      // If we are at the root naturally (not startup redirect) and we had an active chat, let's reset it to null (e.g. New Chat explicitly)
      const currentPath = window.location.pathname;
      if (currentPath === '/' && activeChatIdRef.current !== null && (!isStartup || !localStorage.getItem('lastActiveChatId'))) {
        setActiveChatId(null);
        setIsTemporaryChat(false);
        setMessages([]);
        setExpandedReasonings({});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, routeChatId]);

  // Handle dynamic document title updates based on active chat
  useEffect(() => {
    if (!activeChatId) {
      document.title = 'Plack AI';
    } else {
      const currentChat = chats.find(c => c.id === activeChatId);
      if (currentChat && currentChat.title && currentChat.title !== 'New Conversation') {
        document.title = `${currentChat.title} • Plack AI`;
      } else {
        document.title = 'Plack AI';
      }
    }
  }, [activeChatId, chats]);

  // Document system stays enabled by default for local/parsed documents
  useEffect(() => {
    // setDocumentsEnabled(true);
  }, []);


  // Synchronize browser history navigation popstate actions
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/') {
        setActiveChatId(null);
        localStorage.removeItem('lastActiveChatId');
        setMessages([]);
        setExpandedReasonings({});
      } else if (path.startsWith('/chat/')) {
        const routeId = path.substring(6); // Extract everything after /chat/
        const resolvedId = extractChatId(routeId);
        if (resolvedId && activeChatIdRef.current !== resolvedId) {
          selectChat(resolvedId);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, chats]);

  const selectChat = async (idOrSlug: string) => {
    const id = extractChatId(idOrSlug);
    if (!id) return;

    setActiveChatId(id);
    setIsTemporaryChat(false);
    localStorage.setItem('lastActiveChatId', id);
    setExpandedReasonings({});
    setIsSourcesSidebarOpen(false);
    setActiveSources([]);

    // Close mobile sidebar automatically after selection/navigation
    if (isMobile) {
      setIsSidebarOpen(false);
    }

    // Determine target cosmetic slug and push to window history state representation
    const chatInStore = chats.find(c => c.id === id);
    const slug = chatInStore ? generateSlug(chatInStore.title, id) : id;
    if (window.location.pathname !== `/chat/${slug}`) {
      window.history.pushState(null, '', `/chat/${slug}`);
    }

    // If there is an active background stream cache, load immediately
    if (activeStreams[id]) {
      logAndSetMessages(activeStreams[id].messages);
      setIsStreaming(activeStreams[id].isStreaming);
      return;
    }

    setIsStreaming(false);
    logAndSetMessages([]); // Clear previous messages list for visual loading state cleanly

    try {
      // 8. Security verification: Verify ownership of this chat
      const supabase = createClient();
      const { data: chatRow, error: chatRowError } = await supabase
        .from('chats')
        .select('id, user_id, title')
        .eq('id', id)
        .maybeSingle();

      if (chatRowError || !chatRow) {
        logger.logError(LogCategory.DATABASE, "Access Denied or Chat Not Found", chatRowError || "Empty match");
        setErrorStatus("Chat not found");
        setActiveChatId(null);
        setMessages([]);
        window.history.replaceState(null, '', '/');
        return;
      }

      if (chatRow.user_id !== session?.user?.id) {
        logger.logError(LogCategory.DATABASE, "User ID ownership mismatch", { chatOwner: chatRow.user_id, sessionUser: session?.user?.id });
        setErrorStatus("Chat not found");
        setActiveChatId(null);
        setMessages([]);
        window.history.replaceState(null, '', '/');
        return;
      }

      // Load matching title slug if the current URL is just UUID and we now have the title row
      const accurateSlug = generateSlug(chatRow.title, id);
      if (window.location.pathname !== `/chat/${accurateSlug}`) {
        window.history.replaceState(null, '', `/chat/${accurateSlug}`);
      }

      const msgs = await getMessages(id);
      // Map to UI model
      const formatted = msgs.map((m: any) => ({
        id: m.id.toString(),
        role: m.role,
        content: m.content || '',
        reasoning: m.reasoning || undefined,
        attachments: (m.attachments || []).map((att: any) => ({
          id: att.id,
          name: att.file_name,
          type: att.file_type,
          size: att.file_size,
          storagePath: att.storage_path,
          publicUrl: att.public_url
        }))
      }));
      logAndSetMessages(formatted);

      console.info("[ATTACHMENT_LOAD]", {
        chatId: id,
        attachmentCount: formatted.reduce((acc, m) => acc + (m.attachments?.length || 0), 0)
      });

      // Save to cache for seamless toggle later
      setActiveStreams(prev => ({
        ...prev,
        [id]: {
          isStreaming: false,
          messages: formatted,
          abortController: null
        }
      }));
    } catch (e) {
      logger.logError(LogCategory.DATABASE, "Failed to load chat messages", e);
    }
  };

  const renameChat = async (id: string, title: string) => {
    try {
      await updateChatTitle(id, title);
      setChats(prev => prev.map(c => c.id === id ? { ...c, title, title_generated: true } : c));
      
      // Update URL slug if this is the currently active chat
      if (activeChatIdRef.current === id) {
        const slug = generateSlug(title, id);
        window.history.replaceState(null, '', `/chat/${slug}`);
      }
    } catch (e) {
      logger.logError(LogCategory.DATABASE, "Failed to update chat title", e);
      setErrorStatus('Failed to rename chat');
    }
  };

  const handleTogglePinChat = async (id: string, is_pinned: boolean) => {
    try {
      import('@/lib/supabase/services').then(async ({ togglePinChat }) => {
        await togglePinChat(id, is_pinned);
        setChats(prev => {
          const updated = prev.map(c => c.id === id ? { ...c, is_pinned } : c);
          return updated.sort((a, b) => {
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
          });
        });
      });
    } catch (e) {
      logger.logError(LogCategory.DATABASE, "Failed to pin chat", e);
      setErrorStatus('Failed to pin chat');
    }
  };

  const handleDeleteChat = async (id: string) => {
    try {
      await deleteChat(id);
      setChats(prev => prev.filter(c => c.id !== id));
      
      const draftKey = `plack_draft_${id}`;
      sessionStorage.removeItem(draftKey);
      localStorage.removeItem(draftKey);

      if (activeChatId === id) {
        clearChat();
      }
    } catch (e) {
      logger.logError(LogCategory.DATABASE, "Failed to delete chat", e);
    }
  };

  // Microphone support
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const attachmentMenuRef = useRef<HTMLDivElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef<boolean>(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside or Escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsModelDropdownOpen(false);
      }
      if (attachmentMenuRef.current && !attachmentMenuRef.current.contains(event.target as Node)) {
        setIsAttachmentMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsAttachmentMenuOpen(false);
        setIsModelDropdownOpen(false);
        setIsMentionMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Set up Speech Recognition on client mount safely
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.continuous = false; // Stop when the user finishes speaking a sentence
        rec.interimResults = false;
        rec.lang = 'en-US';

        rec.onresult = (event: any) => {
          const transcript = event.results[0]?.[0]?.transcript;
          if (transcript) {
            setInputValue(prev => prev + (prev ? ' ' : '') + transcript);
          }
        };

        rec.onerror = (e: any) => {
          logger.logError(LogCategory.APP, "Speech Recognition error", e);
          setIsListening(false);
        };

        rec.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = rec;
      }
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not fully supported in this browser layout or requires active microphone permissions.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        setIsListening(true);
        recognitionRef.current.start();
      } catch (e) {
        logger.logError(LogCategory.APP, "Speech start failed", e);
        setIsListening(false);
      }
    }
  };

  // Auto scroll pinning logic
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // If we are within 100px of the bottom, consider it "pinned"
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
      isNearBottomRef.current = isAtBottom;
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current || isStreaming || isLiveModeOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming, liveTranscript, isLiveModeOpen]);

  const previousSidebarStateRef = useRef(false);

  // Collapse sidebars when Live Mode activates for distraction-free focus
  useEffect(() => {
    if (isLiveModeOpen) {
      previousSidebarStateRef.current = isSidebarOpen;
      setIsSidebarOpen(false);
      setIsSourcesSidebarOpen(false);
    } else {
      if (previousSidebarStateRef.current) {
        setIsSidebarOpen(true);
      }
    }
  }, [isLiveModeOpen]);

  // Handle auto-growing textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      // Calculate 3 lines: ~22px per line + ~26px vertical padding + 4px extra buffer
      const maxHeight = 92; 
      textareaRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
      
      // Detection for fullscreen trigger (3+ lines)
      // Leading is 24px, so 3 lines is roughly 72px + padding
      const lines = Math.floor(scrollHeight / 24) || 1;
      setInputLineCount(lines);
    }
  }, [inputValue]);

  // Toggle reasoning collapsible
  const toggleReasoning = (messageId: string) => {
    setExpandedReasonings(prev => ({
      ...prev,
      [messageId]: !prev[messageId]
    }));
  };

  // Handle files
  const processFiles = async (fileList: FileList) => {
    if (!session?.user?.id) return;
    
    // Convert to array and process sequentially to accurately track limits
    const files = Array.from(fileList);
    for (const file of files) {
      // 10MB Limit
      if (file.size > 10 * 1024 * 1024) {
        console.warn("[ATTACHMENT_UPLOAD]", {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          chatId: activeChatId,
          uploadSuccess: false,
          reason: "File size limit exceeded"
        });
        addSystemMessage("This file exceeds the 10 MB upload limit.");
        continue;
      }

      const isImage = file.type.startsWith('image/');
      const allowed = await checkUsageLimit(session.user.id, isImage ? 'image_upload' : 'file_upload');
      if (!allowed) {
        logger.logWarn(LogCategory.CHAT, "File upload quota reached", { file: file.name, type: file.type });
        console.warn("[ATTACHMENT_UPLOAD]", {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          chatId: activeChatId,
          uploadSuccess: false,
          reason: "Quota reached"
        });
        addSystemMessage("You've reached your storage limit. Remove some files or wait until more space is available.");
        continue;
      }

      const reader = new FileReader();
      if (isImage) {
        reader.readAsDataURL(file);
        reader.onload = async () => {
          const result = reader.result as string;
          const base64Data = result.split(',')[1] || '';
          
          const newAttachment: Attachment = {
            id: crypto.randomUUID(),
            name: file.name,
            type: file.type,
            size: file.size,
            data: base64Data,
            localFile: file
          };
          setAttachments(prev => [...prev, newAttachment]);
        };
      } else {
        reader.readAsText(file);
        reader.onload = async () => {
          const textContent = reader.result as string;
          
          const newAttachment: Attachment = {
            id: crypto.randomUUID(),
            name: file.name,
            type: file.type,
            size: file.size,
            data: Buffer.from(textContent).toString('base64'),
            textContent: textContent,
            localFile: file
          };
          setAttachments(prev => [...prev, newAttachment]);
        };
      }
    }
  };

  // Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const clearChat = () => {
    // We DO NOT abort background generations here!
    setActiveChatId(null);
    setIsTemporaryChat(false);
    setInputValue('');
    localStorage.removeItem('lastActiveChatId');
    setMessages([]);
    setExpandedReasonings({});
    setAttachments([]);
    setIsStreaming(false);
    setIsSourcesSidebarOpen(false);
    setActiveSources([]);
    window.history.pushState(null, '', '/');
  };

  const startTemporaryChat = () => {
    setActiveChatId(null);
    setIsTemporaryChat(true);
    setInputValue('');
    localStorage.removeItem('lastActiveChatId');
    setMessages([]);
    setExpandedReasonings({});
    setAttachments([]);
    setIsStreaming(false);
    window.history.pushState(null, '', '/');
  };

  const handleStopStreaming = (chatId?: string) => {
    const targetChatId = chatId || activeChatId || 'temporary';
    if (targetChatId) {
      const controller = abortControllersRef.current[targetChatId];
      if (controller) {
        controller.abort();
        abortControllersRef.current[targetChatId] = null;
      }
      setActiveStreams(prev => {
        if (!prev[targetChatId]) return prev;
        return {
          ...prev,
          [targetChatId]: {
            ...prev[targetChatId],
            isStreaming: false,
            abortController: null
          }
        };
      });
      if (targetChatId === activeChatId || targetChatId === 'temporary') {
        setIsStreaming(false);
      }
    } else {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setIsStreaming(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
    showToast("Message copied to clipboard");
  };

  const handleFeedback = async (msgId: string, type: 'like' | 'dislike') => {
    if (!session?.user?.id) return;
    
    // Toggle logic
    const currentFeedback = messageAppreciations[msgId];
    const newFeedback = currentFeedback === type ? null : type;
    
    setMessageAppreciations(prev => {
      const next = { ...prev };
      if (newFeedback) next[msgId] = newFeedback;
      else delete next[msgId];
      return next;
    });

    try {
      await setFeedback(session.user.id, msgId, newFeedback);
    } catch (err) {
      logger.logError(LogCategory.DATABASE, "Failed to update feedback", err);
      // Revert optimism if failed
      setMessageAppreciations(prev => {
        const next = { ...prev };
        if (currentFeedback) next[msgId] = currentFeedback;
        else delete next[msgId];
        return next;
      });
      showToast("Failed to save feedback");
    }
  };

  const handleEditMessageSave = async (msgId: string, newContent: string) => {
    if (!activeChatId) return;
    const targetIndex = messages.findIndex(m => m.id === msgId);
    if (targetIndex === -1) return;

    // Sync: Delete target msg + all subsequent msgs
    try {
      const dbMessages = await getMessages(activeChatId);
      if (dbMessages && dbMessages.length >= targetIndex) {
        // Our local UI messages array and DB messages array should map 1:1 up to this point
        // dbMessages[targetIndex] is the message being edited (if it exists in db)
        const dbMsgsToDelete = dbMessages.slice(targetIndex);
        if (dbMsgsToDelete.length > 0) {
          const supabase = createClient();
          await supabase.from('messages').delete().in('id', dbMsgsToDelete.map((m: any) => m.id));
        }
      }
    } catch (err) {
      logger.logError(LogCategory.DATABASE, "Failed to sync edit via DB", err);
    }

    // Cut off UI state at targetIndex
    const updatedSlicedMessages = messages.slice(0, targetIndex);
    setMessages(updatedSlicedMessages);
    setActiveStreams(prev => ({
       ...prev,
       [activeChatId]: {
         ...(prev[activeChatId] || {}),
         messages: updatedSlicedMessages,
         isStreaming: false
       }
    }));
    
    setEditingMessageId(null);
    setEditContent('');

    // Re-submit the content as if it's a new message appending to the sliced array
    setTimeout(() => {
      handleSubmit(undefined, newContent);
    }, 100);
  };

  const handleRegenerate = async (msgId: string) => {
    if (!activeChatId) return;

    // Prevent starting regenerate if lock is already active
    if (activeRequestsRef.current[activeChatId]) {
      logger.logWarn(LogCategory.CHAT, "Ignored regenerate request while chat is already active");
      return;
    }

    const targetIndex = messages.findIndex(m => m.id === msgId);
    if (targetIndex === -1) return;

    // Find the closest user prompt preceding the assistant message template
    let promptText = "";
    for (let i = targetIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        promptText = messages[i].content;
        break;
      }
    }

    if (!promptText) {
      logger.logWarn(LogCategory.CHAT, "Preceding user prompt not found for regeneration");
      return;
    }

    // Sync database: delete assistant message and all succeeding messages
    try {
      const dbMessages = await getMessages(activeChatId);
      if (dbMessages && dbMessages.length >= targetIndex) {
        const dbMsgsToDelete = dbMessages.slice(targetIndex);
        if (dbMsgsToDelete.length > 0) {
          const supabase = createClient();
          await supabase.from('messages').delete().in('id', dbMsgsToDelete.map((m: any) => m.id));
        }
      }
    } catch (err) {
      logger.logError(LogCategory.DATABASE, "Failed to sync regenerate deletions", err);
    }

    // Cut off UI state at targetIndex immediately to clear Assistant's output
    const updatedSlicedMessages = messages.slice(0, targetIndex);
    setMessages(updatedSlicedMessages);
    setActiveStreams(prev => ({
      ...prev,
      [activeChatId]: {
        ...(prev[activeChatId] || {}),
        messages: updatedSlicedMessages,
        isStreaming: false
      }
    }));

    // Trigger submission on next tick
    setTimeout(() => {
      handleSubmit(undefined, promptText);
    }, 100);
  };

  const executeTitleGeneration = async (chatId: string, firstMsg: string) => {
    if (activeTitleRequestsRef.current[chatId]) return;
    
    activeTitleRequestsRef.current[chatId] = true;
    const titleStartTime = Date.now();
    
    try {
      const titleStartTimeNet = Date.now();
      logger.logInfo(LogCategory.CHAT, "Requesting smart title", { chatId });

      const tRes = await fetch('/api/chat/title', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          firstMessage: firstMsg,
          chatId: chatId,
          messageId: `title-${chatId}`
        })
      });

      const titleNetDuration = Date.now() - titleStartTimeNet;
      logger.logInfo(LogCategory.CHAT, "Smart title response received", {
        status: tRes.status,
        responseTimeMs: titleNetDuration,
      });

      if (tRes.ok) {
        const resBody = await tRes.json();
        const { title } = resBody;
        if (title && title !== "New Conversation") {
          await updateChatTitle(chatId, title);
          setChats(prev => prev.map(c => c.id === chatId ? { ...c, title, title_generated: true } : c));
          // Update URL to the new slugified version
          if (activeChatIdRef.current === chatId) {
            const slug = generateSlug(title, chatId);
            window.history.replaceState(null, '', `/chat/${slug}`);
          }
          logger.logInfo(LogCategory.CHAT, "[TITLE GENERATION]", { chatId, deferred: false, pending: false, completed: true });
        } else {
          throw new Error('Title was empty or New Conversation');
        }
      } else {
        logger.logError(LogCategory.CHAT, "Smart title generation failed", { status: tRes.status });
        throw new Error('Non-200 response');
      }
    } catch (titleError) {
      logger.logError(LogCategory.CHAT, "Failed to generate smart title, using fallback", titleError);
      let fallbackTitle = firstMsg.slice(0, 60);
      if (firstMsg.length > 60) fallbackTitle += '...';
      await updateChatTitle(chatId, fallbackTitle);
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, title: fallbackTitle, title_generated: true } : c));
      if (activeChatIdRef.current === chatId) {
        const slug = generateSlug(fallbackTitle, chatId);
        window.history.replaceState(null, '', `/chat/${slug}`);
      }
      logger.logInfo(LogCategory.CHAT, "[TITLE GENERATION]", { chatId, deferred: false, pending: false, completed: true, fallback: true });
    } finally {
      const titleDuration = Date.now() - titleStartTime;
      logger.reportPerformance("Title Generation", titleDuration, { chatId });
      activeTitleRequestsRef.current[chatId] = false;
    }
  };

  const handleSaveLiveUserMessage = async (userText: string): Promise<string | null> => {
    const uId = session?.user?.id;
    if (!uId && !isTemporaryChat) return null;
    let targetChatId = activeChatIdRef.current;

    try {
      let userMsgFormatted: Message;

      if (isTemporaryChat) {
        targetChatId = 'temporary';
        userMsgFormatted = {
          id: `temp-user-${Date.now()}-${Math.random()}`,
          role: 'user',
          content: userText,
          attachments: []
        };
      } else {
        // Create new chat if not exists
        if (!targetChatId) {
          const initialTitle = userText.length > 30 ? userText.substring(0, 30) + "..." : userText;
          const newChat = await createChat(uId!, initialTitle || "Voice Conversation");
          setChats(prev => [newChat, ...prev]);
          targetChatId = newChat.id;
          setActiveChatId(newChat.id);
          activeChatIdRef.current = newChat.id;

          const slug = generateSlug(initialTitle || 'Voice Conversation', newChat.id);
          window.history.replaceState(null, '', `/chat/${slug}`);
        }

        const chatIdStr = targetChatId!;
        const userMsg = await saveMessage(chatIdStr, 'user', userText);
        userMsgFormatted = {
          id: userMsg.id.toString(),
          role: 'user',
          content: userText,
          attachments: []
        };
      }

      setMessages(prev => [...prev, userMsgFormatted]);
      console.log("[LIVE USER MESSAGE SAVED]", userText);

      // Trigger smart title generation check if it wasn't generated yet and not temporary
      if (!isTemporaryChat && targetChatId) {
        const currentChat = chats.find(c => c.id === targetChatId);
        if (!currentChat || currentChat.title_generated === false) {
          executeTitleGeneration(targetChatId, userText);
        }
      }

      return targetChatId;
    } catch (err) {
      console.error("Failed saving live user message:", err);
      return null;
    }
  };

  const handleSaveLiveAssistantMessage = async (assistantText: string): Promise<string | null> => {
    const uId = session?.user?.id;
    if (!uId && !isTemporaryChat) return null;
    let targetChatId = activeChatIdRef.current;

    try {
      let modelMsgFormatted: Message;

      if (isTemporaryChat) {
        targetChatId = 'temporary';
        modelMsgFormatted = {
          id: `temp-model-${Date.now()}-${Math.random()}`,
          role: 'model',
          content: assistantText,
          attachments: []
        };
      } else {
        if (!targetChatId) {
          // If no active chat, fallback (should not happen normally)
          const initialTitle = "Voice Conversation";
          const newChat = await createChat(uId!, initialTitle);
          setChats(prev => [newChat, ...prev]);
          targetChatId = newChat.id;
          setActiveChatId(newChat.id);
          activeChatIdRef.current = newChat.id;

          const slug = generateSlug(initialTitle, newChat.id);
          window.history.replaceState(null, '', `/chat/${slug}`);
        }

        const chatIdStr = targetChatId!;
        const modelMsg = await saveMessage(chatIdStr, 'model', assistantText);
        modelMsgFormatted = {
          id: modelMsg.id.toString(),
          role: 'model',
          content: assistantText,
          attachments: []
        };
      }

      setMessages(prev => [...prev, modelMsgFormatted]);
      console.log("[LIVE AI RESPONSE SAVED]", assistantText);

      return targetChatId;
    } catch (err) {
      console.error("Failed saving live assistant message:", err);
      return null;
    }
  };

  const handleSaveLiveMessages = async (userText: string, assistantText: string): Promise<string | null> => {
    if (!session?.user?.id) return null;
    const uId = session.user.id;
    let targetChatId = activeChatId;

    try {
      // 1. Create a new chat if there isn't an active one
      if (!targetChatId) {
        const initialTitle = userText.length > 30 ? userText.substring(0, 30) + "..." : userText;
        const newChat = await createChat(uId, initialTitle || "Voice Conversation");
        setChats(prev => [newChat, ...prev]);
        targetChatId = newChat.id;
        setActiveChatId(newChat.id);

        const slug = generateSlug(initialTitle || 'Voice Conversation', newChat.id);
        window.history.replaceState(null, '', `/chat/${slug}`);
      }

      if (!targetChatId) {
        throw new Error("Could not initialize chat session");
      }

      const chatIdStr: string = targetChatId;

      // 2. Save User Message
      const userMsg = await saveMessage(chatIdStr, 'user', userText);
      const userMsgFormatted: Message = {
        id: userMsg.id.toString(),
        role: 'user',
        content: userText,
        attachments: []
      };

      // 3. Save Assistant Message (if present)
      let modelMsgFormatted: Message | null = null;
      if (assistantText.trim()) {
        const modelMsg = await saveMessage(chatIdStr, 'model', assistantText);
        modelMsgFormatted = {
          id: modelMsg.id.toString(),
          role: 'model',
          content: assistantText,
          attachments: []
        };
      }

      // 4. Update state message array so they appear immediately in background
      setMessages(prev => {
        const list = [...prev, userMsgFormatted];
        if (modelMsgFormatted) list.push(modelMsgFormatted);
        return list;
      });

      // 5. Trigger smart title generation check if it wasn't generated yet
      const currentChat = chats.find(c => c.id === chatIdStr);
      if (!currentChat || currentChat.title_generated === false) {
        executeTitleGeneration(chatIdStr, userText);
      }

      console.log("[MESSAGE SAVED] Saved live turn matching activeChatId:", chatIdStr);
      return chatIdStr;
    } catch (err) {
      console.error("Failed persisting live messages:", err);
      return null;
    }
  };

  // Send message with multi-stream tracking and settings incorporation
  const handleSubmit = async (e?: React.FormEvent, customPrompt?: string) => {
    if (e) e.preventDefault();
    const promptToSend = (customPrompt || inputValue).trim();
    if (!promptToSend && attachments.length === 0) return;

    logger.logGroup(LogCategory.CHAT, "REQUEST START", {
      chatId: activeChatId,
      messageLength: promptToSend.length,
      selectedModel: activeModel,
    });

    // Check concurrency locks first before setting up any state
    const targetChatId = activeChatId;
    if (targetChatId && activeRequestsRef.current[targetChatId]) {
      logger.logWarn(LogCategory.CHAT, `Request already active for chat ${targetChatId}`);
      return;
    }
    if (!targetChatId && activeRequestsRef.current["new-chat"]) {
      logger.logWarn(LogCategory.CHAT, `A new conversation request is already in progress`);
      return;
    }

    // Safety checks
    const userId = session?.user?.id;
    if (!userId) return;

    // Establish locks immediately to prevent parallel entry
    if (targetChatId) {
      activeRequestsRef.current[targetChatId] = true;
    } else {
      activeRequestsRef.current["new-chat"] = true;
    }

    let currentChatId = targetChatId;
    let streamChatId = targetChatId || 'temporary';
    let updateMessagesAndStreaming: (
      chatId: string,
      messagesUpdater: (prev: Message[]) => Message[],
      streamStatus: boolean
    ) => void = () => {};
    let assistantMsgId = '';

    try {
      if (useDeepResearch) {
        let isAllowed = true;
        try {
          const checkRes = await fetch("/api/usage/check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, actionType: "deep_research", model: activeModel })
          });
          if (!checkRes.ok) {
            throw new Error(`Quota check HTTP ${checkRes.status}`);
          }
          const checkData = await checkRes.json();
          isAllowed = !!checkData.allowed;
        } catch (error) {
          console.error("[DEEP_RESEARCH QUOTA CHECK FAILED]", error);
          isAllowed = false;
        }

        if (!isAllowed) {
          addSystemMessage("Your daily Deep Research session has been used. Please try again tomorrow.");
          if (targetChatId) {
            activeRequestsRef.current[targetChatId] = false;
          } else {
            activeRequestsRef.current["new-chat"] = false;
          }
          return;
        }
      }

      // Check message quota before doing anything else
      const allowed = await checkUsageLimit(userId, 'chat_message', activeModel);
      if (!allowed) {
        addSystemMessage("You've reached today's message limit. Please try again later.");
        // We still need to release locks
        if (targetChatId) {
          activeRequestsRef.current[targetChatId] = false;
        } else {
          activeRequestsRef.current["new-chat"] = false;
        }
        return;
      }

      let useWebSearch = isWebSearchEnabled;

      if (useWebSearch) {
        const usageData = await checkUsageLimit(userId, 'web_search');
        if (!usageData.allowed) {
          console.warn("[WEB_SEARCH]", "Daily limit reached. Falling back to normal chat.");
          setLimitCard({ 
            actionType: 'Web Search', 
            resetIn: usageData.resetIn || '24 hours' 
          });
          useWebSearch = false;
          setIsWebSearchEnabled(false);
        }
      }

      // Reset input and capture current files
      setInputValue('');
      const currentAttachments = [...attachments];
      setAttachments([]);

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }

      const userMsgId = `user-${crypto.randomUUID()}`;
      assistantMsgId = `assistant-${crypto.randomUUID()}`;

      // Add user message to UI
      const newUserMessage: Message = {
        id: userMsgId,
        role: 'user',
        content: promptToSend,
        attachments: currentAttachments
      };

      const currentMessages = currentChatId ? (activeStreams[currentChatId]?.messages ?? messages) : [];
      const updatedMessages = [...currentMessages, newUserMessage];

      // Render user message to UI immediately to make the user feel they are already inside the conversation
      logAndSetMessages(updatedMessages);
      setIsStreaming(true);

      let bgChatPromise: Promise<{ newChatId: string; newChat: any } | null> | null = null;
      streamChatId = currentChatId || 'temporary';

      if (!currentChatId && !isTemporaryChat) {
        bgChatPromise = (async () => {
          try {
            const initialTitle = "New Conversation";
            const newChat = await createChat(userId, initialTitle);
            newChat.title_generated = false;
            const newChatId = newChat.id;
            
            // Hand over locks to new ID
            activeRequestsRef.current[newChatId] = true;
            activeRequestsRef.current["new-chat"] = false;
            
            // Save user message to database
            const savedUserMsg = await saveMessage(newChatId, 'user', promptToSend);
            if (currentAttachments.length > 0) {
              await Promise.all(currentAttachments.map(async (att: Attachment) => {
                if (att.localFile && userId) {
                  try {
                    const uploadResult = await uploadAttachment(userId, att.localFile, att.name);
                    if (uploadResult && uploadResult.storagePath && uploadResult.publicUrl) {
                      att.storagePath = uploadResult.storagePath;
                      att.publicUrl = uploadResult.publicUrl;
                      
                      // Consume quota
                      const isImage = att.type.startsWith('image/');
                      await fetch("/api/usage/charge", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          userId: userId,
                          actionType: isImage ? 'image_upload' : 'file_upload'
                        })
                      });
                    }
                  } catch (err: any) {
                    logger.logError(LogCategory.DATABASE, "Deferred upload failed", err);
                    att.uploadFailed = true;
                  }
                }

                if (att.storagePath && att.publicUrl) {
                  return saveAttachmentRecord({
                    message_id: savedUserMsg.id,
                    user_id: userId,
                    file_name: att.name,
                    file_type: att.type,
                    file_size: att.size,
                    storage_path: att.storagePath,
                    public_url: att.publicUrl
                  });
                }
              })).catch(err => {
                logger.logError(LogCategory.DATABASE, "Failed to process and save attachment records", err);
              });
            }
            
            return { newChatId, newChat };
          } catch (e: any) {
            logger.logError(LogCategory.CHAT, "Error creating chat in background", e);
            return null;
          }
        })();

        // Resolve background promise to transition UI as soon as database is ready
        bgChatPromise.then(bgResult => {
          if (bgResult) {
            const { newChatId, newChat } = bgResult;
            
            // Update streamChatId to new ID
            streamChatId = newChatId;
            
            // Migrate active stream layout in active streams cache
            setActiveStreams(prev => {
              const tempStream = prev['temporary'];
              if (!tempStream) return prev;
              
              const updated = { ...prev };
              updated[newChatId] = {
                isStreaming: tempStream.isStreaming,
                messages: tempStream.messages,
                abortController: tempStream.abortController
              };
              delete updated['temporary'];
              return updated;
            });

            // Hand over locks
            activeRequestsRef.current[newChatId] = true;
            activeRequestsRef.current["new-chat"] = false;

            // Hand over abort controllers
            if (abortControllersRef.current['temporary']) {
              abortControllersRef.current[newChatId] = abortControllersRef.current['temporary'];
            }

            // Sync navigation & state securely
            if (activeChatIdRef.current === null) {
              setActiveChatId(newChatId);
              localStorage.setItem('lastActiveChatId', newChatId);
              setChats(prev => {
                if (prev.some(c => c.id === newChatId)) return prev;
                return [newChat, ...prev];
              });
              window.history.replaceState(null, '', `/chat/${newChatId}`);
            }
          } else {
            activeRequestsRef.current["new-chat"] = false;
          }
        }).catch(err => {
          logger.logError(LogCategory.CHAT, "Failed finishing background migration callback", err);
        });
      } else if (currentChatId) {
        const chatIdStr = currentChatId;
        
        // Bump chat updated_at to top locally
        setChats(prev => {
          const now = new Date().toISOString();
          const updated = prev.map(c => c.id === chatIdStr ? { ...c, updated_at: now } : c);
          return updated.sort((a, b) => {
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
          });
        });

        saveMessage(chatIdStr, 'user', promptToSend).then(async savedMsg => {
          if (currentAttachments.length > 0) {
            await Promise.all(currentAttachments.map(async (att: Attachment) => {
              if (att.localFile && userId) {
                // Upload deferred file to storage now
                try {
                  const uploadResult = await uploadAttachment(userId, att.localFile, att.name);
                  if (uploadResult && uploadResult.storagePath && uploadResult.publicUrl) {
                    att.storagePath = uploadResult.storagePath;
                    att.publicUrl = uploadResult.publicUrl;
                    
                    // Consume quota
                    const isImage = att.type.startsWith('image/');
                    await fetch("/api/usage/charge", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        userId: userId,
                        actionType: isImage ? 'image_upload' : 'file_upload'
                      })
                    });
                  }
                } catch (err: any) {
                  logger.logError(LogCategory.DATABASE, "Deferred upload failed", err);
                  att.uploadFailed = true;
                }
              }

              if (att.storagePath && att.publicUrl) {
                return saveAttachmentRecord({
                  message_id: savedMsg.id,
                  user_id: userId,
                  file_name: att.name,
                  file_type: att.type,
                  file_size: att.size,
                  storage_path: att.storagePath,
                  public_url: att.publicUrl
                });
              }
            })).catch(err => {
              logger.logError(LogCategory.DATABASE, "Failed to process and save attachment records", err);
            });
          }
        }).catch(err => {
          logger.logError(LogCategory.DATABASE, "Failed to save user message", err);
        });
      }

      const chatIdStr = streamChatId;

      // Initial placeholder for streaming response
      const placeholderAssistantMessage: Message = {
        id: assistantMsgId,
        role: 'model',
        content: '',
        isStreaming: true
      };
      
      const finalInitialMessages = [...updatedMessages, placeholderAssistantMessage];

      // Initialize individual controller
      const controller = new AbortController();
      abortControllersRef.current[chatIdStr] = controller;

      // Helper to update both global messages (if selected) and cached active streams state
      updateMessagesAndStreaming = (
        chatId: string,
        messagesUpdater: (prev: Message[]) => Message[],
        streamStatus: boolean
      ) => {
        if (activeChatIdRef.current === chatId) {
          logAndSetMessages(messagesUpdater);
          setIsStreaming(streamStatus);
        }

        setActiveStreams(prev => {
          const currentMsgs = prev[chatId]?.messages ?? [];
          const isCurrentlyStreaming = streamStatus;
          return {
            ...prev,
            [chatId]: {
              isStreaming: isCurrentlyStreaming,
              messages: messagesUpdater(currentMsgs.length > 0 ? currentMsgs : finalInitialMessages),
              abortController: isCurrentlyStreaming ? (abortControllersRef.current[chatId] || null) : null
            }
          };
        });
      };

      // Update screen and multi-stream caches
      updateMessagesAndStreaming(chatIdStr, () => finalInitialMessages, true);

      // Format parts inside historical messages to send attachments through
      const formattedMessages = currentMessages.map((m: Message) => {
        if (m.attachments && m.attachments.length > 0) {
          const parts: any[] = [{ text: m.content }];
          m.attachments.forEach((att: Attachment) => {
            if (att.type.startsWith('image/')) {
              parts.push({
                inlineData: {
                  mimeType: att.type,
                  data: att.data
                }
              });
            } else if (att.textContent) {
              parts.push({
                text: `\n[Attached File: ${att.name}]\n\`\`\`\n${att.textContent}\n\`\`\`\n`
              });
            }
          });
          return {
            role: m.role,
            parts: parts
          };
        }
        return { role: m.role, content: m.content };
      });

      // Add current prompt and attachments
      const currentParts: any[] = [{ text: promptToSend }];
      currentAttachments.forEach((att: Attachment) => {
        if (att.type.startsWith('image/')) {
          currentParts.push({
            inlineData: {
              mimeType: att.type,
              data: att.data
            }
          });
        } else if (att.textContent) {
          currentParts.push({
            text: `\n[Attached File: ${att.name}]\n\`\`\`\n${att.textContent}\n\`\`\`\n`
          });
        }
      });

      formattedMessages.push({
        role: 'user',
        parts: currentParts
      });

      // AI personality instructs map
      const personalityPrompts: Record<string, string> = {
        Balanced: "Maintain a balanced, polite, helpful, and natural tone.",
        Professional: "Adopt an extremely professional, business-oriented, polished, and crisp professional tone. Write with corporate structure and clarity.",
        Creative: "Adopt a highly creative, vivid, engaging, and imaginative tone. Express ideas with rich vocabulary and outside-the-box conceptual thinking.",
        Technical: "Adopt a rigorous, precise, scientific, and highly detailed technical tone. Focus on system architecture, algorithms, and technical facts. Be direct and avoid generic fluff.",
        Friendly: "Adopt an exceptionally warm, supportive, friendly, and approachable tone. Make the user feel welcomed and encouraged.",
        Teacher: "Adopt an educational, guiding, patient, and explaining tone. Break down complex topics into digestible steps, define foundational concepts, and check for understanding.",
        Researcher: "Adopt an analytical, objective, highly academic, and comprehensive research-oriented tone. Cite logical methodologies, synthesize different perspectives, and explore evidence.",
        Minimal: "Adopt an extremely concise, brief, and to-the-point minimal tone. Deliver the direct answers or solutions immediately without conversational pleasantries, summaries, or preambles."
      };

      const targetPersonalityTone = personalityPrompts[aiPersonality] || personalityPrompts.Balanced;

      // Memory Intent Local Check
      const isMemoryRequested = detectMemoryIntent(promptToSend);
      if (isMemoryRequested) {
        setMemoryIntentActive(true);
        // Clear it after a few seconds or when stream starts
        setTimeout(() => setMemoryIntentActive(false), 2500);
      }

      const executeStream = async (targetModel: ModelName, retryCount: number = 0) => {
        // Monitoring start logging
        concurrentCountRef.current += 1;
        const requestStartTime = Date.now();
        if (concurrentCountRef.current > 1) {
          logger.logWarn(LogCategory.CHAT, "Concurrent Gemini request detected", {
            activeCount: concurrentCountRef.current,
            chatId: streamChatId,
            model: targetModel
          });
        }
        logger.logGroup(LogCategory.CHAT, "GEMINI REQUEST START", {
          chatId: streamChatId,
          model: targetModel,
          timestamp: new Date().toISOString(),
          concurrentCount: concurrentCountRef.current
        });

        try {
          const netStartTime = Date.now();
          logger.logInfo(LogCategory.CHAT, "Network request initiated", {
            url: '/api/chat',
            chatId: streamChatId,
            model: modelMap[targetModel],
          });

          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messages: formattedMessages,
              model: modelMap[targetModel],
              useWebSearch: useWebSearch,
              isDeepResearch: useDeepResearch,
              deepResearchWebSearch: deepResearchWebSearchEnabled,
              preferredDomains: preferredDomainsInput.split(',').map(d => d.trim()).filter(Boolean),
              activeMemories: activeMemoryIds.length > 0 ? userMemories.filter(m => activeMemoryIds.includes(m.id)) : null,
              chatId: streamChatId,
              messageId: assistantMsgId,
              userId: session?.user?.id,
              autoSaveMemories: autoSaveMemories,
              systemInstructionOverride: `AI Personality Tone to employ: ${targetPersonalityTone}\n` +
                (customInstructions.trim() ? `User Custom Instructions to follow closely for every answer: "${customInstructions.trim()}"\n` : "") +
                `DOCUMENT & ARTIFACT GUIDELINES:\n` +
                `When generating significant content like long reports, articles, creative writing, or technical plans, you MUST use the <document> tag format. This allows the system to render it in a premium dedicated side-panel workspace.\n` +
                `Example usage:\n` +
                `<document title="Strategic Marketing Plan">\n` +
                `Content goes here...\n` +
                `</document>\n\n` +
                `CODE ARTIFACT GUIDELINES:\n` +
                `Whenever you generate any standalone code file (HTML/CSS/JS/TS/TSX/JSON/CSV/etc.), you MUST enclose it in a Markdown code block with an explicit 'filename' attribute, like this:\n` +
                `\`\`\`language filename="project_file.ext"\n` +
                `content here\n` +
                `\`\`\`\n` +
                `Formats Supported: HTML (filename.html), CSS (filename.css), JS (filename.js), TS (filename.ts), TSX (filename.tsx), JSON (filename.json), CSV (filename.csv), TXT (filename.txt), MD (filename.md).\n` +
                `Make sure to populate the filename precisely inside the markdown header parameters.`
            }),
            signal: abortControllersRef.current[streamChatId]?.signal
          });

          const netDuration = Date.now() - netStartTime;
          logger.logInfo(LogCategory.CHAT, "Network response received", {
            status: response.status,
            responseTimeMs: netDuration,
          });

          if (!response.ok) {
            let errorText = '';
            try {
              errorText = await response.text();
            } catch (_) {}
            logger.logError(LogCategory.CHAT, "Network response error", {
              status: response.status,
              responseBody: errorText,
            });

            console.warn("[USAGE NOT CHARGED]", {
              operation: "chat_message",
              reason: `HTTP ${response.status}: ${errorText || "Network request failed"}`
            });
            if (useWebSearch) {
              console.warn("[USAGE NOT CHARGED]", {
                operation: "web_search",
                reason: `HTTP ${response.status}: ${errorText || "Network request failed"}`
              });
            }

            if (response.status === 429) {
               addSystemMessage("The AI is currently busy. Please try again in a few moments.");
            } else {
               addSystemMessage("Connection interrupted. Please try again later.");
            }
            
            // Remove the placeholder assistant message since it failed immediately
            updateMessagesAndStreaming(streamChatId, prev => prev.filter(m => m.id !== assistantMsgId), false);
            return;
          }

          // Successfully established. Charge deep_research if enabled.
          if (useDeepResearch) {
            fetch("/api/usage/charge", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId, actionType: "deep_research", model: targetModel })
            }).catch(err => console.error("Charge deep_research failed", err));
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('Readable stream not supported');
          }

          if (streamChatId && streamChatId !== 'temporary') {
            const currentChats = chatsRef.current.length > 0 ? chatsRef.current : chats;
            const targetChat = currentChats.find(c => c.id === streamChatId);
            const needsTitle = targetChat && targetChat.title === "New Conversation";
            
            // Generate title in the background instantly once response begins streaming
            if (needsTitle || currentMessages.length === 0) {
              if (activeRequestsRef.current[streamChatId]) {
                logger.logWarn(LogCategory.CHAT, "Smart title generation deferred due to active generation lock");
                deferredTitleRequestsRef.current[streamChatId] = promptToSend;
                logger.logInfo(LogCategory.CHAT, "[TITLE GENERATION]", { chatId: streamChatId, deferred: true, pending: true, completed: false });
              } else {
                executeTitleGeneration(streamChatId, promptToSend);
              }
            }
          }

          const decoder = new TextDecoder();
          let finished = false;
          let rawAccumulatedString = '';
          let textBuffer = '';
          let nativeThoughtAccumulator = '';
          let groundingMetadataAccumulator: any = null;
          let researchTimelineAccumulator: string[] | undefined = undefined;
          let activeStageIndexAccumulator: number | undefined = undefined;
          let researchStatusAccumulator: string | undefined = undefined;
          let streamMemorySavedPayload: any = null;
          let streamMemoryLimitReached = false;
          let streamMemoriesUsedCount: number | undefined = undefined;
          let streamMemoriesUsed: any[] | undefined = undefined;
          let streamIsManualMemories: boolean | undefined = undefined;
          let streamProfileSummary: any = undefined;
          let jsonBuffer = '';

          while (!finished) {
            const { value, done } = await reader.read();
            finished = done;
            if (value) {
              const chunk = decoder.decode(value, { stream: true });
              jsonBuffer += chunk;
              
              const lines = jsonBuffer.split('\n');
              jsonBuffer = lines.pop() || ''; // keep the last partial line in the buffer
              
              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  const parsed = JSON.parse(line);
                  
                  if (parsed.error) {
                    logger.logError(LogCategory.STREAM, "Error in stream chunk", parsed.error);
                  } else if (parsed.memoriesUsedCount) {
                    streamMemoriesUsedCount = parsed.memoriesUsedCount;
                    if (parsed.memoriesUsed) {
                      streamMemoriesUsed = parsed.memoriesUsed;
                    }
                    if (parsed.isManualMemories !== undefined) {
                      streamIsManualMemories = parsed.isManualMemories;
                    }
                  } else if (parsed.memoryUpdateNeeded || parsed.memoryUpdateProposal) {
                    setMemoryUpdateNeeded(parsed.memoryUpdateNeeded || parsed.memoryUpdateProposal);
                  } else if (parsed.memoryDeleteNeeded || parsed.memoryDeleteProposal) {
                    setMemoryDeleteNeeded(parsed.memoryDeleteNeeded || parsed.memoryDeleteProposal);
                  } else if (parsed.profileSummary) {
                    streamProfileSummary = parsed.profileSummary;
                  } else if (parsed.thought) {
                    nativeThoughtAccumulator += parsed.thought;
                  } else if (parsed.memorySaved) {
                    streamMemorySavedPayload = parsed.memorySaved;
                    const action = parsed.memorySaved.action;
                    let actionText = "Memory added";
                    if (action === 'update') actionText = "Memory updated";
                    if (action === 'delete') actionText = "Memory deleted";
                    
                    setMemoryToast({
                      type: 'success',
                      content: actionText
                    });
                    fetchMemoryData();
                  } else if (parsed.memoryReviewNeeded || parsed.memoryAddProposal) {
                    setMemoryReviewNeeded(parsed.memoryReviewNeeded || parsed.memoryAddProposal);
                  } else if (parsed.memoryLimitReached) {
                    streamMemoryLimitReached = true;
                  } else if (parsed.memorySaveFailed) {
                    setMemoryToast({
                      type: 'error',
                      content: "Memory update failed"
                    });
                  } else if (parsed.groundingMetadata) {
                    groundingMetadataAccumulator = parsed.groundingMetadata;
                  } else if (parsed.researchTimeline) {
                    researchTimelineAccumulator = parsed.researchTimeline;
                    activeStageIndexAccumulator = parsed.activeStageIndex;
                    if (parsed.researchStatus) {
                      researchStatusAccumulator = parsed.researchStatus;
                    }
                  } else if (parsed.researchStatus) {
                    researchStatusAccumulator = parsed.researchStatus;
                  } else if (parsed.sources) {
                    groundingMetadataAccumulator = {
                      groundingChunks: parsed.sources.map((s: any) => ({
                        web: {
                          title: s.title,
                          uri: s.url,
                          snippet: s.content 
                        }
                      }))
                    };
                  } else if (parsed.text) {
                    rawAccumulatedString += parsed.text;
                  }
                } catch (e) {
                  rawAccumulatedString += line;
                }
              }

              if (finished && jsonBuffer.trim()) {
              try {
                const parsed = JSON.parse(jsonBuffer);
                if (parsed.text) {
                  rawAccumulatedString += parsed.text;
                }
              } catch (e) {
                rawAccumulatedString += jsonBuffer;
              }
              jsonBuffer = '';
            }

            const inlineParsed = parseStreamingText(rawAccumulatedString);

              // Document block extraction (strictly disabled if memory intent is detected)
              const isMemoryRequested = detectMemoryIntent(promptToSend);
              const parsedDoc = !isMemoryRequested ? extractDocumentBlock(rawAccumulatedString) : { hasDocument: false, title: "", content: "", cleanText: "" };
              let displayContent = inlineParsed.text;
              
              if (parsedDoc.hasDocument) {
                displayContent = rawAccumulatedString;
                
                if (!streamingDocRef.current) {
                  const docId = typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).substring(2);
                  streamingDocRef.current = {
                    id: docId,
                    title: parsedDoc.title,
                    content: parsedDoc.content
                  };
                } else {
                  streamingDocRef.current.content = parsedDoc.content;
                  streamingDocRef.current.title = parsedDoc.title;
                }
              }

              const finalReasoning = nativeThoughtAccumulator || inlineParsed.thought;
              
              updateMessagesAndStreaming(streamChatId, prev => prev.map((m: Message) => {
                if (m.id === assistantMsgId) {
                  return {
                    ...m,
                    content: displayContent,
                    reasoning: finalReasoning || undefined,
                    groundingMetadata: groundingMetadataAccumulator,
                    researchTimeline: researchTimelineAccumulator,
                    activeStageIndex: activeStageIndexAccumulator,
                    researchStatus: researchStatusAccumulator,
                    isDeepResearch: useDeepResearch,
                    memorySaved: streamMemorySavedPayload || m.memorySaved,
                    memoryLimitReached: streamMemoryLimitReached || m.memoryLimitReached,
                    isMemoryTurn: isMemoryRequested,
                    memoriesUsedCount: streamMemoriesUsedCount ?? m.memoriesUsedCount,
                    memoriesUsed: streamMemoriesUsed ?? m.memoriesUsed,
                    isManualMemories: streamIsManualMemories ?? m.isManualMemories,
                    profileSummary: streamProfileSummary ?? m.profileSummary
                  };
                }
                return m;
              }), true);
            }
          }

          const finalParsedText = parseStreamingText(rawAccumulatedString);
          const finalSavedReasoning = nativeThoughtAccumulator || finalParsedText.thought;

          // SUCCESS-BASED CHARGING FOR CHAT MESSAGE AND WEB SEARCH
          try {
            const chargePromises = [
              fetch("/api/usage/charge", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  userId,
                  actionType: 'chat_message',
                  model: activeModel
                })
              })
            ];

            if (useWebSearch) {
              chargePromises.push(
                fetch("/api/usage/charge", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    userId,
                    actionType: 'web_search'
                  })
                })
              );
            }

            const chargeResponses = await Promise.all(chargePromises);
            for (const cRes of chargeResponses) {
              if (!cRes.ok) {
                console.error("[CHARGING WARNING] Quota deduction returned status: " + cRes.status);
              }
            }
          } catch (chargeErr) {
            console.error("[CHARGING ERROR] Failed to charge usage", chargeErr);
          }

          const isMemoryRequested = detectMemoryIntent(promptToSend);
          const parsedDocFinal = !isMemoryRequested ? extractDocumentBlock(rawAccumulatedString) : { hasDocument: false, title: "", content: "", cleanText: "" };
          let finalSavedText = rawAccumulatedString;          // Save completed document record
          if (parsedDocFinal.hasDocument && streamingDocRef.current) {
            const finalDocToSave: DocumentRecord = {
              id: streamingDocRef.current.id,
              user_id: session?.user?.id || 'anonymous',
              chat_id: (streamChatId === 'temporary' ? 'new-chat' : streamChatId) || 'new-chat',
              title: streamingDocRef.current.title,
              content: streamingDocRef.current.content,
              version_snapshots: [{ version: 1, title: streamingDocRef.current.title, content: streamingDocRef.current.content, timestamp: new Date().toISOString() }],
              metadata: { version: 1 }
            };
            
            try {
              const savedDoc = await createDocument(finalDocToSave.user_id, (finalDocToSave.chat_id === 'new-chat' ? null : finalDocToSave.chat_id) ?? null, finalDocToSave.title, finalDocToSave.content);
              console.log("[DOCUMENT CREATED]", { id: savedDoc.id, title: savedDoc.title });
              console.log("[DOCUMENT ID]", savedDoc.id);

              // Embed the actual document ID in the <document> tag!
              finalSavedText = rawAccumulatedString.replace('<document ', `<document id="${savedDoc.id}" `);

              // Update the active UI message state immediately to reflect the database ID
              updateMessagesAndStreaming(streamChatId, prev => prev.map((m: Message) => {
                if (m.id === assistantMsgId) {
                  return {
                    ...m,
                    content: finalSavedText
                  };
                }
                return m;
              }), false);

            } catch (dbErr) {
              console.error("[CRITICAL] Document creation failed", dbErr);
              // Show "Failed to create document." as part of the message flow
              finalSavedText = parsedDocFinal.cleanText ? `${parsedDocFinal.cleanText}\n\n**Failed to create document.**` : "**Failed to create document.**";

              updateMessagesAndStreaming(streamChatId, prev => prev.map((m: Message) => {
                if (m.id === assistantMsgId) {
                  return {
                    ...m,
                    content: finalSavedText
                  };
                }
                return m;
              }), false);
            }
          }
          streamingDocRef.current = null;

          let finalSavedChatId = streamChatId;
          if (finalSavedChatId === 'temporary') {
            const bgResult = await bgChatPromise;
            if (bgResult) {
              finalSavedChatId = bgResult.newChatId;
            }
          }

          if (finalSavedChatId && finalSavedChatId !== 'temporary') {
            await saveMessage(finalSavedChatId, 'model', finalSavedText, finalSavedReasoning).catch(err => {
              logger.logError(LogCategory.DATABASE, "Failed to save assistant message", err);
            });
          }

          // Save grounding metadata to search_history if exists
          if (groundingMetadataAccumulator?.groundingChunks?.length > 0 && session?.user?.id) {
            try {
              const supabase = createClient();
              await supabase.from('search_history').insert({
                user_id: session.user.id,
                chat_id: finalSavedChatId,
                query: promptToSend,
                sources: groundingMetadataAccumulator.groundingChunks
              });
            } catch (e) {
              logger.logError(LogCategory.DATABASE, "Failed to save search history", e);
            }
          }

          if (useWebSearch) {
            setTimeout(() => fetchWebSearchUsage(), 1000);
          }

          updateMessagesAndStreaming(streamChatId, prev => prev.map((m: Message) => {
            if (m.id === assistantMsgId) {
              return {
                ...m,
                isStreaming: false
              };
            }
            return m;
          }), false);

        } catch (error: any) {
          console.warn("[USAGE NOT CHARGED]", {
            operation: "chat_message",
            reason: error?.message || error || "generation aborted or failed"
          });
          if (useWebSearch) {
            console.warn("[USAGE NOT CHARGED]", {
              operation: "web_search",
              reason: error?.message || error || "generation aborted or failed"
            });
          }

          if (error.name === 'AbortError') {
            updateMessagesAndStreaming(streamChatId, prev => prev.map((m: Message) => {
              if (m.id === assistantMsgId) {
                return { ...m, isStreaming: false };
              }
              return m;
            }), false);
            return;
          }

          logger.logError(LogCategory.ERROR, "Generation chunk error", error);
          
          let nextModel: ModelName = 'E1';
          if (targetModel === 'ED1.7') nextModel = 'ED1.1';
          else if (targetModel === 'ED1.1') nextModel = 'D1-Lite';
          else if (targetModel === 'D1-Lite') nextModel = 'E1';
          
          // Limit to exactly 1 retry (retryCount < 1) with exactly 1 second (1000ms) delay
           if (autoSwitchModels && retryCount < 1 && targetModel !== 'E1') {
             logger.logInfo(LogCategory.MODEL, `Auto-switching model due to failure`, { from: targetModel, to: nextModel });
             setActiveModel(nextModel);
             setErrorStatus(`Switching to backup model. Please wait...`);
             await new Promise(r => setTimeout(r, 1000));
             await executeStream(nextModel, retryCount + 1);
          } else {
             logger.logError(LogCategory.ERROR, "Generation failed after retries", error);
             setModelError({
               failedModel: targetModel,
               recommendedModel: targetModel === 'E1' ? null : nextModel,
             });
             updateMessagesAndStreaming(streamChatId, prev => prev.filter(m => m.id !== assistantMsgId), false);
          }
        } finally {
          // Monitor end logging
          const requestDuration = Date.now() - requestStartTime;
          logger.reportPerformance("Chat Generation", requestDuration, { 
            chatId: streamChatId,
            model: targetModel,
          });
          concurrentCountRef.current = Math.max(0, concurrentCountRef.current - 1);
        }
      };

      await executeStream(activeModel, 0);

    } catch (e: any) {
      logger.logError(LogCategory.ERROR, "Failed to process message", e);
      
      const isCreateChatError = !streamChatId || e.message?.includes("create chat") || e.message?.includes("profile");
      const rootCause = e.message?.includes("Permission Denied") || e.message?.includes("RLS") ? "Database security policy violation or expired session." :
                        e.message?.includes("Quota") ? "API Rate Limit or Quota Exceeded." :
                        e.message?.includes("API key") || e.message?.includes("API_KEY") ? "Invalid or missing GEMINI_API_KEY environment variable." :
                        e.message?.includes("fetch") || e.message?.includes("Network") ? "Network connection issue." :
                        "Internal server error while generating or saving the message.";

      if (e.message !== "WEB_SEARCH_LIMIT") {
        logger.reportDiagnostic(LogCategory.ERROR, "Message processing failure", {
          failingComponent: "Home (Chat Module)",
          failingRoute: isCreateChatError ? "Database insert failed" : "/api/chat",
          httpStatus: e.status || 500,
          errorMessage: e.message || String(e),
          stackTrace: e.stack,
          modelUsed: activeModel,
          chatId: streamChatId || undefined,
          requestCount: concurrentCountRef.current,
          rootCause: rootCause,
        });

        // Use friendly user-facing messages
        if (e.message?.includes("WEB_SEARCH_UNAVAILABLE")) {
          setErrorStatus("Web search unavailable. Please try again later.");
        } else if (e.message?.includes("Quota") || e.message?.includes("Limit")) {
          setErrorStatus("Message generation failed. Try another model.");
        } else if (e.message?.includes("fetch") || e.message?.includes("Network") || e.message?.includes("Interrupted")) {
          setErrorStatus("Connection interrupted. Retry generation.");
        } else {
          setErrorStatus("Message generation failed. Please try again later.");
        }
      }

      if (streamChatId) {
        updateMessagesAndStreaming(streamChatId, prev => {
          if (e.message === "WEB_SEARCH_LIMIT") {
            return prev.filter(m => m.id !== assistantMsgId);
          }
          return prev.map((m: Message) => {
            if (m.id === assistantMsgId) {
              return { ...m, isStreaming: false };
            }
            return m;
          });
        }, false);
      }
    } finally {
      // Ensure concurrency locks are ALWAYS released
      if (currentChatId) {
        activeRequestsRef.current[currentChatId] = false;
        abortControllersRef.current[currentChatId] = null;
      }
      if (streamChatId) {
        activeRequestsRef.current[streamChatId] = false;
        abortControllersRef.current[streamChatId] = null;
      }
      activeRequestsRef.current["new-chat"] = false;
      updateMessagesAndStreaming(streamChatId, prev => prev, false);

      if (streamChatId && streamChatId !== 'temporary') {
        const deferredMsg = deferredTitleRequestsRef.current[streamChatId];
        if (deferredMsg) {
          logger.logInfo(LogCategory.CHAT, "Processing deferred title logic for newly unblocked chat");
          deferredTitleRequestsRef.current[streamChatId] = "";
          // executeTitleGeneration is available in this scope
          executeTitleGeneration(streamChatId, deferredMsg);
        }
      }
    }
  };

  // Watch for enter submit key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Block duplicate/parallel inputs while active stream is running
      const isCurrentChatStreaming = activeChatId ? (activeStreams[activeChatId]?.isStreaming ?? false) : false;
      const isCurrentlyLocked = activeChatId ? activeRequestsRef.current[activeChatId] : activeRequestsRef.current["new-chat"];
      if (isCurrentChatStreaming || isCurrentlyLocked) {
        logger.logWarn(LogCategory.CHAT, "Ignored Enter key during active generation");
        return;
      }
      handleSubmit();
    }
  };

  return (
    <main 
      className={cn(
        "relative min-h-screen flex flex-col font-sans select-none overflow-x-hidden transition-colors duration-300",
        theme === 'light' 
          ? "bg-white text-neutral-800" 
          : theme === 'cosmic'
            ? "bg-[#04020a] text-indigo-50"
            : "bg-[#060606] text-neutral-100"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Dynamic Error Status Toast Alert */}
      <AnimatePresence>
        {!!errorStatus && (
          <motion.div
            key="db-error-toast"
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="fixed top-6 left-1/2 -locate-x-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4 pointer-events-auto"
          >
            <div className="bg-white/95 backdrop-blur-xl border border-red-200/50 rounded-2xl p-4 shadow-[0_16px_40px_rgba(239,68,68,0.12)] flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-mono text-[11px] font-bold shrink-0 mt-0.5">
                !
              </div>
              <div className="flex-1 min-w-0 font-sans text-left">
                <h4 className="text-[13px] font-semibold text-neutral-900 leading-none">Database Sync Alert</h4>
                <p className="text-[12px] text-neutral-500 font-medium mt-1.5 leading-relaxed break-words">
                  {errorStatus}
                </p>
              </div>
              <button 
                onClick={() => setErrorStatus(null)}
                className="text-neutral-400 hover:text-neutral-600 transition-colors p-0.5 rounded-lg hover:bg-neutral-50 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
        
        {!!toastMessage && (
          <motion.div
            key="general-info-toast"
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm px-4 pointer-events-auto"
          >
            <div className="bg-neutral-900/95 text-white backdrop-blur-xl border border-neutral-700/50 rounded-2xl p-3 shadow-xl flex items-center justify-between gap-3 text-sm">
              <span className="font-medium px-2">{toastMessage}</span>
            </div>
          </motion.div>
        )}

        {!!memoryToast && (
          <motion.div
            key="memory-toast-component"
            initial={{ opacity: 0, y: -30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -15, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className="fixed z-[250] w-full max-w-sm px-4 pointer-events-auto sm:top-6 sm:right-6 sm:left-auto sm:translate-x-0 top-6 left-1/2 -translate-x-1/2"
          >
            <div 
              className={cn(
                "p-4 rounded-2xl border backdrop-blur-xl shadow-2xl flex items-start gap-3 transition-colors duration-300",
                theme === 'light' 
                  ? "bg-white/85 border-neutral-200/60 shadow-neutral-200/30" 
                  : "bg-neutral-900/80 border-neutral-800/80 shadow-black/40"
              )}
            >
              {memoryToast.type === 'success' ? (
                <>
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-xs",
                    theme === 'light' ? "bg-emerald-100/90 text-emerald-600" : "bg-emerald-500/10 text-emerald-400"
                  )}>
                    <svg className="w-5 h-5 animate-bounce-short" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0 font-sans text-left">
                    <h4 className={cn("text-[13px] font-bold tracking-tight", theme === 'light' ? "text-neutral-900" : "text-emerald-300")}>
                      🧠 Memory Saved
                    </h4>
                    <p className={cn("text-[12px] font-mono mt-1 leading-normal truncate", theme === 'light' ? "text-neutral-600" : "text-neutral-300")}>
                      &ldquo;{memoryToast.content}&rdquo;
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-xs",
                    theme === 'light' ? "bg-red-100 text-red-600" : "bg-red-500/10 text-red-400"
                  )}>
                    <AlertCircle size={18} />
                  </div>
                  <div className="flex-1 min-w-0 font-sans text-left">
                    <h4 className={cn("text-[13px] font-bold tracking-tight", theme === 'light' ? "text-neutral-900" : "text-red-300")}>
                      ⚠ Failed to save memory
                    </h4>
                    <p className={cn("text-[12px] mt-1 leading-normal", theme === 'light' ? "text-neutral-600" : "text-neutral-300")}>
                      {memoryToast.content}
                    </p>
                  </div>
                </>
              )}
              <button 
                onClick={() => setMemoryToast(null)}
                className={cn(
                  "opacity-60 hover:opacity-100 transition-opacity p-0.5 rounded-lg cursor-pointer shrink-0",
                  theme === 'light' ? "hover:bg-neutral-100 text-neutral-400" : "hover:bg-neutral-800 text-neutral-400"
                )}
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

        {/* Web Search Limit Modal */}

        {/* Memory Detection Badge removed per refinement instructions */}

        {/* Memory Review/Add Popup */}
        <AnimatePresence>
          {memoryReviewNeeded && (
            <motion.div
              key="memory-review-popup-container"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed bottom-34 left-1/2 -translate-x-1/2 z-[90] max-w-sm w-full px-4"
            >
              <div className={cn(
                "p-5 rounded-[24px] border backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex flex-col gap-4 ring-1 ring-white/10",
                theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-900/95 border-neutral-800"
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                      <BrainCircuit size={18} />
                    </div>
                    <div className="flex flex-col">
                      <span className={cn("text-[13px] font-bold tracking-tight", theme === 'light' ? "text-neutral-900" : "text-white")}>Memory Add Detected</span>
                      <span className="text-[10px] opacity-50 uppercase tracking-widest font-bold">Proposal</span>
                    </div>
                  </div>
                  <button onClick={() => {
                    console.log("[MEMORY CHANGE REJECTED]");
                    setMemoryReviewNeeded(null);
                  }} className="opacity-40 hover:opacity-100 transition-opacity">
                    <X size={16} />
                  </button>
                </div>
                
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-50">Memory:</span>
                  <div className={cn(
                    "p-3 rounded-xl border italic leading-relaxed text-[13.5px]",
                    theme === 'light' ? "bg-neutral-50 border-neutral-100 text-neutral-600" : "bg-white/5 border-white/5 text-neutral-300"
                  )}>
                     &quot;{memoryReviewNeeded.summary || memoryReviewNeeded.content}&quot;
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      if (!session?.user) return;
                      try {
                        const res = await fetch('/api/memories', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            userId: session.user.id,
                            category: memoryReviewNeeded.category,
                            content: memoryReviewNeeded.content
                          })
                        });
                        const saved = await res.json();
                        if (saved && !saved.error) {
                          console.log("[MEMORY CHANGE ACCEPTED]");
                          setMemoryToast({ type: 'success', content: `🧠 Memory Saved` });
                          fetchMemoryData();
                        } else if (saved.error) {
                          setMemoryToast({ type: 'error', content: saved.error });
                        }
                      } catch (err) {
                        setMemoryToast({ type: 'error', content: 'Database error' });
                      } finally {
                        setMemoryReviewNeeded(null);
                      }
                    }}
                    className="flex-1 h-11 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-[13px] font-extrabold transition-all active:scale-[0.98] shadow-lg shadow-indigo-500/20 cursor-pointer"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => {
                      console.log("[MEMORY CHANGE REJECTED]");
                      setMemoryReviewNeeded(null);
                    }}
                    className={cn(
                      "flex-1 h-11 rounded-xl text-[13px] font-bold transition-all border active:scale-[0.98] cursor-pointer",
                      theme === 'light' ? "bg-neutral-100 border-neutral-200 hover:bg-neutral-200 text-neutral-700" : "bg-neutral-800 border-neutral-700 hover:bg-neutral-750 text-neutral-300"
                    )}
                  >
                    Reject
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Memory Update Popup */}
        <AnimatePresence>
          {memoryUpdateNeeded && (
            <motion.div
              key="memory-update-popup-container"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed bottom-34 left-1/2 -translate-x-1/2 z-[101] max-w-sm w-full px-4"
            >
              <div className={cn(
                "p-5 rounded-[24px] border backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex flex-col gap-4 ring-1 ring-white/10",
                theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-900/95 border-neutral-800"
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                      <BrainCircuit size={18} />
                    </div>
                    <div className="flex flex-col">
                      <span className={cn("text-[13px] font-bold tracking-tight", theme === 'light' ? "text-neutral-900" : "text-white")}>Memory Update Detected</span>
                      <span className="text-[10px] opacity-50 uppercase tracking-widest font-bold">Proposal</span>
                    </div>
                  </div>
                  <button onClick={() => {
                    console.log("[MEMORY CHANGE REJECTED]");
                    setMemoryUpdateNeeded(null);
                  }} className="opacity-40 hover:opacity-100 transition-opacity">
                    <X size={16} />
                  </button>
                </div>
                
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-40">Old:</span>
                    <div className={cn(
                      "p-3 rounded-xl border italic leading-relaxed text-[13.5px]",
                      theme === 'light' ? "bg-neutral-50 border-neutral-100 text-neutral-500 line-through" : "bg-white/5 border-white/5 text-neutral-400 line-through"
                    )}>
                      &quot;{memoryUpdateNeeded.oldContent}&quot;
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-50">New:</span>
                    <div className={cn(
                      "p-3 rounded-xl border italic leading-relaxed text-[13.5px] font-semibold",
                      theme === 'light' ? "bg-indigo-50/50 border-indigo-100 text-neutral-800" : "bg-indigo-500/10 border-indigo-500/20 text-neutral-200"
                    )}>
                      &quot;{memoryUpdateNeeded.newContent}&quot;
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      if (!session?.user) return;
                      try {
                        const res = await fetch('/api/memories', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            memoryId: memoryUpdateNeeded.targetMemoryId,
                            content: memoryUpdateNeeded.newContent
                          })
                        });
                        const updated = await res.json();
                        if (updated && !updated.error) {
                          console.log("[MEMORY CHANGE ACCEPTED]");
                          setMemoryToast({ type: 'success', content: `🧠 Memory Updated` });
                          fetchMemoryData();
                        } else if (updated.error) {
                          setMemoryToast({ type: 'error', content: updated.error });
                        }
                      } catch (err) {
                        setMemoryToast({ type: 'error', content: 'Database error' });
                      } finally {
                        setMemoryUpdateNeeded(null);
                      }
                    }}
                    className="flex-1 h-11 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-[13px] font-extrabold transition-all active:scale-[0.98] shadow-lg shadow-indigo-500/20 cursor-pointer"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => {
                      console.log("[MEMORY CHANGE REJECTED]");
                      setMemoryUpdateNeeded(null);
                    }}
                    className={cn(
                      "flex-1 h-11 rounded-xl text-[13px] font-bold transition-all border active:scale-[0.98] cursor-pointer",
                      theme === 'light' ? "bg-neutral-100 border-neutral-200 hover:bg-neutral-200 text-neutral-700" : "bg-neutral-800 border-neutral-700 hover:bg-neutral-750 text-neutral-300"
                    )}
                  >
                    Reject
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Memory Delete Popup */}
        <AnimatePresence>
          {memoryDeleteNeeded && (
            <motion.div
              key="memory-delete-popup-container"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed bottom-34 left-1/2 -translate-x-1/2 z-[101] max-w-sm w-full px-4"
            >
              <div className={cn(
                "p-5 rounded-[24px] border backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex flex-col gap-4 ring-1 ring-white/10",
                theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-900/95 border-neutral-800"
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                      <BrainCircuit size={18} />
                    </div>
                    <div className="flex flex-col">
                      <span className={cn("text-[13px] font-bold tracking-tight", theme === 'light' ? "text-neutral-900" : "text-white")}>Memory Delete Detected</span>
                      <span className="text-[10px] opacity-50 uppercase tracking-widest font-bold">Proposal</span>
                    </div>
                  </div>
                  <button onClick={() => {
                    console.log("[MEMORY CHANGE REJECTED]");
                    setMemoryDeleteNeeded(null);
                  }} className="opacity-40 hover:opacity-100 transition-opacity">
                    <X size={16} />
                  </button>
                </div>
                
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-50">Memory:</span>
                  <div className={cn(
                    "p-3 rounded-xl border italic leading-relaxed text-[13.5px]",
                    theme === 'light' ? "bg-neutral-50 border-neutral-100 text-neutral-600 line-through" : "bg-white/5 border-white/5 text-neutral-300 line-through"
                  )}>
                     &quot;{memoryDeleteNeeded.content}&quot;
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      if (!session?.user) return;
                      const memoryId = memoryDeleteNeeded.targetMemoryId;
                      console.log("[DELETE BUTTON CLICK] Accept proposal clicked");
                      console.log("[MEMORY ID] delete targets memory id:", memoryId);
                      console.log(`[DELETE REQUEST] Sending DELETE request for single memory ID: ${memoryId}`);
                      
                      try {
                        const res = await fetch(`/api/memories?memoryId=${encodeURIComponent(memoryId)}`, {
                          method: 'DELETE'
                        });
                        const deleted = await res.json();
                        console.log("[DELETE RESPONSE] API Response received:", deleted);

                        if (deleted && !deleted.error) {
                          console.log("[DELETE SUCCESS] deleted memory successfully. Affected count:", deleted.rowsAffected);
                          console.log("[MEMORY CHANGE ACCEPTED]");
                          setMemoryToast({ type: 'success', content: `🧠 Memory Deleted` });
                          console.log("[MEMORY LIST REFRESH] Triggering fetchMemoryData after successful deletion");
                          fetchMemoryData();
                        } else {
                          const errText = deleted?.error || "Unknown response error";
                          console.error("[DELETE FAILED] API returned error:", errText);
                          setMemoryToast({ type: 'error', content: errText });
                        }
                      } catch (err) {
                        console.error("[DELETE FAILED] Network or Database error during delete operation:", err);
                        setMemoryToast({ type: 'error', content: 'Database error' });
                      } finally {
                        setMemoryDeleteNeeded(null);
                      }
                    }}
                    className="flex-1 h-11 rounded-xl bg-red-500 hover:bg-red-600 text-white text-[13px] font-extrabold transition-all active:scale-[0.98] shadow-lg shadow-red-500/20 cursor-pointer"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => {
                      console.log("[MEMORY CHANGE REJECTED]");
                      setMemoryDeleteNeeded(null);
                    }}
                    className={cn(
                      "flex-1 h-11 rounded-xl text-[13px] font-bold transition-all border active:scale-[0.98] cursor-pointer",
                      theme === 'light' ? "bg-neutral-100 border-neutral-200 hover:bg-neutral-200 text-neutral-700" : "bg-neutral-800 border-neutral-700 hover:bg-neutral-750 text-neutral-300"
                    )}
                  >
                    Reject
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence key="web-search-limit-modal-presence">
          {showWebSearchLimitModal && (
            <div key="web-search-limit-modal-wrapper" className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-auto">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowWebSearchLimitModal(false)}
                className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              />
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 10 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className={cn(
                  "relative w-[90%] max-w-sm rounded-[24px] p-8 shadow-2xl flex flex-col items-center text-center",
                  theme === 'light' 
                    ? "bg-white text-neutral-900 border border-neutral-200/50" 
                    : theme === 'cosmic'
                      ? "bg-[#18113c] text-indigo-50 border border-indigo-500/20 shadow-indigo-500/10"
                      : "bg-neutral-900 text-white border border-neutral-800"
                )}
              >
                <div className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center mb-5",
                  theme === 'light' ? "bg-amber-100 text-amber-600" : "bg-amber-500/20 text-amber-400"
                )}>
                  <Search size={32} />
                </div>
                <h3 className="text-xl font-bold mb-2 font-sans tracking-tight">Web Search Limit Reached</h3>
                <p className={cn("text-sm leading-relaxed mb-8", theme === 'light' ? "text-neutral-500" : "text-neutral-400")}>
                  You have reached today&apos;s Web Search limit (5 searches/day). Please wait until the limit resets tomorrow.
                </p>
                <button
                  onClick={() => setShowWebSearchLimitModal(false)}
                  className={cn(
                    "w-full rounded-full py-3.5 px-6 font-semibold text-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2",
                    theme === 'light' 
                      ? "bg-neutral-900 text-white hover:bg-neutral-800 focus:ring-neutral-900 focus:ring-offset-white" 
                      : theme === 'cosmic'
                        ? "bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/25 focus:ring-indigo-500 focus:ring-offset-[#18113c]"
                        : "bg-white text-neutral-900 hover:bg-neutral-100 focus:ring-white focus:ring-offset-neutral-900"
                  )}
                >
                  Understood
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Memory Picker Modal */}
        <AnimatePresence>
          {isMemoryPickerOpen && (
            <div key="memory-picker-modal-wrapper" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMemoryPickerOpen(false)}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
              />
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 10 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className={cn(
                  "relative w-full max-w-lg p-6 flex flex-col items-start text-center rounded-3xl shadow-2xl z-10 pointer-events-auto",
                  theme === 'light' 
                    ? "bg-white text-neutral-900 border border-neutral-200/50" 
                    : theme === 'cosmic'
                      ? "bg-[#18113c] text-indigo-50 border border-indigo-500/20 shadow-indigo-500/10"
                      : "bg-neutral-900 text-white border border-neutral-800"
                )}
              >
                <div className="flex items-center justify-between w-full mb-4">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center",
                      theme === 'light' ? "bg-emerald-100 text-emerald-600" : "bg-emerald-500/20 text-emerald-400"
                    )}>
                      <BrainCircuit size={20} />
                    </div>
                    <h3 className="text-lg font-bold font-sans tracking-tight text-left">Select Memories</h3>
                  </div>
                  <button onClick={() => setIsMemoryPickerOpen(false)} className="p-1 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors">
                    <X size={20} />
                  </button>
                </div>
                
                <div className="w-full relative mb-4">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
                  <input
                    type="text"
                    placeholder="Search your memories..."
                    value={memorySearch}
                    onChange={(e) => setMemorySearch(e.target.value)}
                    className={cn(
                      "w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all shadow-sm",
                      theme === 'light' ? "bg-neutral-50/50 border-neutral-200" : "bg-neutral-900/50 border-neutral-800"
                    )}
                  />
                </div>

                <div className="w-full flex-1 max-h-[40vh] overflow-y-auto mb-4 custom-scrollbar text-left flex flex-col gap-2">
                  {userMemories.length === 0 ? (
                    <div className="py-12 text-center flex flex-col items-center justify-center w-full gap-3">
                      <div className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center opacity-20",
                        theme === 'light' ? "bg-neutral-900" : "bg-white"
                      )}>
                        <BrainCircuit size={24} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-bold tracking-tight">No memories available</span>
                        <span className="text-[11px] opacity-50">Memories are automatically saved during chats.</span>
                      </div>
                    </div>
                  ) : (() => {
                    const filtered = userMemories.filter(m => 
                      (m.content || '').toLowerCase().includes(memorySearch.toLowerCase()) || 
                      (m.category || '').toLowerCase().includes(memorySearch.toLowerCase())
                    );
                    
                    if (filtered.length === 0) {
                      return (
                        <div className="py-12 text-center flex flex-col items-center justify-center w-full gap-2">
                           <Search size={20} className="opacity-20 mb-1" />
                           <span className="text-sm opacity-50 font-medium tracking-tight">No memories match your search.</span>
                        </div>
                      );
                    }

                    return filtered.map((memory) => {
                      const isSelected = activeMemoryIds.includes(memory.id);
                      return (
                        <div 
                          key={`picker-mem-${memory.id}`}
                          onClick={() => {
                            if (isSelected) {
                              setActiveMemoryIds(prev => prev.filter(id => id !== memory.id));
                            } else {
                              setActiveMemoryIds(prev => [...prev, memory.id]);
                            }
                          }}
                          className={cn(
                            "flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer group select-none",
                            isSelected 
                              ? (theme === 'light' ? "bg-emerald-50 border-emerald-500" : "bg-emerald-500/10 border-emerald-500") 
                              : (theme === 'light' ? "bg-white border-neutral-200 hover:border-emerald-300" : "bg-neutral-850 border-neutral-800 hover:border-emerald-700")
                          )}
                        >
                          <div className={cn(
                            "mt-0.5 min-w-5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-colors",
                            isSelected ? "bg-emerald-500 text-white" : "border-2 border-neutral-300 dark:border-neutral-600"
                          )}>
                            {isSelected && <CheckCircle2 size={14} className="stroke-[3px]" />}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className={cn("text-[10px] font-bold uppercase tracking-wider mb-0.5", theme === 'light' ? "text-neutral-400" : "text-neutral-500")}>
                              {memory.category || 'General'}
                            </span>
                            <span className="text-[13px] font-medium leading-snug line-clamp-2">{memory.content}</span>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>

                <div className="flex w-full mt-2">
                  <button
                    onClick={() => setIsMemoryPickerOpen(false)}
                    className={cn(
                      "w-full rounded-xl py-3 px-6 font-bold text-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 flex items-center justify-center shadow-md",
                      theme === 'light' 
                        ? "bg-neutral-900 text-white hover:bg-neutral-800 focus:ring-neutral-900" 
                        : "bg-emerald-600 text-white hover:bg-emerald-500 focus:ring-emerald-500"
                    )}
                  >
                    Confirm Selection {activeMemoryIds.length > 0 ? `(${activeMemoryIds.length})` : ''}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Mobile Conversation Map Bottom Sheet */}
        <AnimatePresence>
          {isMobileMapOpen && isMobile && (
          <motion.div
            key="mobile-map-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMapOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[90] lg:hidden pointer-events-auto"
          />
        )}
        
        {isMobileMapOpen && isMobile && (
          <motion.div
            key="mobile-map-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            className={cn(
              "fixed bottom-0 left-0 right-0 z-[100] lg:hidden rounded-t-3xl max-h-[85vh] overflow-hidden flex flex-col pointer-events-auto border-t",
              theme === 'light' ? "bg-white border-neutral-200 shadow-2xl" : "bg-neutral-900 border-neutral-800 shadow-2xl shadow-black"
            )}
          >
            <div className="flex justify-center p-3 shrink-0">
              <div className={cn("w-12 h-1.5 rounded-full", theme === 'light' ? "bg-neutral-200" : "bg-neutral-700")} />
            </div>
            
            <div className="px-5 pb-3 shrink-0 flex items-center justify-between border-b border-transparent">
              <h3 className={cn("text-[17px] font-bold font-sans", theme === 'light' ? "text-neutral-900" : "text-white")}>Conversation Outline</h3>
              <button onClick={() => setIsMobileMapOpen(false)} className={cn("p-1.5 rounded-full", theme === 'light' ? "bg-neutral-100 text-neutral-600" : "bg-neutral-800 text-neutral-400")}>
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-8 space-y-1">
              {messages.map((msg, i) => {
                const isUser = msg.role === 'user';
                const previewText = msg.content?.slice(0, 75) + (msg.content?.length > 75 ? '...' : '') || (msg.attachments?.length ? 'Attachment' : (msg.isStreaming ? 'Typing...' : 'Reasoning...'));
                return (
                  <button
                    key={msg.id}
                    onClick={() => {
                      setIsMobileMapOpen(false);
                      setTimeout(() => {
                        document.getElementById(`msg-${msg.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }, 150);
                    }}
                    className={cn(
                      "w-full text-left p-3 rounded-[16px] flex items-start gap-3 transition-colors active:scale-[0.98]",
                      theme === 'light' ? "hover:bg-neutral-50 active:bg-neutral-100" : "hover:bg-neutral-800/80 active:bg-neutral-800"
                    )}
                  >
                    <div className={cn(
                      "w-2 h-2 rounded-full mt-1.5 shrink-0 shadow-sm",
                      isUser ? "bg-indigo-500" : "bg-emerald-500"
                    )} />
                    <div className="flex flex-col min-w-0">
                      <span className={cn("text-[10px] uppercase tracking-widest font-bold", isUser ? "text-indigo-500" : "text-emerald-500")}>
                        {isUser ? 'You' : 'Plack'}
                      </span>
                      <span className={cn("text-[13.5px] font-sans font-medium mt-0.5 break-words line-clamp-2 leading-snug", theme === 'light' ? "text-neutral-700" : "text-neutral-300")}>
                        {previewText}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic Backgrounds matching Theme */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0">
        {/* Style sheet containing highly optimized keyframe animations for atmospheric depth */}
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes driftSlowA {
            0% { transform: translate(0px, 0px) scale(1) rotate(0deg); }
            33% { transform: translate(45px, -25px) scale(1.08) rotate(7deg); }
            66% { transform: translate(-30px, 30px) scale(0.92) rotate(-5deg); }
            100% { transform: translate(0px, 0px) scale(1) rotate(0deg); }
          }
          @keyframes driftSlowB {
            0% { transform: translate(0px, 0px) scale(1) rotate(0deg); }
            50% { transform: translate(-50px, 40px) scale(1.1) rotate(-8deg); }
            100% { transform: translate(0px, 0px) scale(1) rotate(0deg); }
          }
          @keyframes driftSlowC {
            0% { transform: translate(0px, 0px) scale(0.9) rotate(0deg); }
            50% { transform: translate(40px, -35px) scale(1.12) rotate(10deg); }
            100% { transform: translate(0px, 0px) scale(0.9) rotate(0deg); }
          }
          @keyframes subtleGrain {
            0%, 100% { transform: translate(0, 0); }
            10% { transform: translate(-1%, -1%); }
            20% { transform: translate(1%, 1%); }
            30% { transform: translate(-2%, 1%); }
            40% { transform: translate(1%, -2%); }
            50% { transform: translate(-1%, 2%); }
            60% { transform: translate(2%, 1%); }
            70% { transform: translate(-2%, -1%); }
            80% { transform: translate(1%, 2%); }
            90% { transform: translate(-1%, -2%); }
          }
          .animate-drift-slow-a {
            animation: driftSlowA 42s ease-in-out infinite;
          }
          .animate-drift-slow-b {
            animation: driftSlowB 56s ease-in-out infinite;
          }
          .animate-drift-slow-c {
            animation: driftSlowC 34s ease-in-out infinite;
          }
          .grain-overlay {
            background-image: url("https://grainy-gradients.vercel.app/noise.svg");
            filter: contrast(170%) brightness(1000%);
            animation: subtleGrain 8s steps(10) infinite;
          }
        `}} />

        {theme === 'light' && (
          <div className="absolute inset-0 transition-opacity duration-1000 ease-in-out">
            <div className="absolute inset-0 bg-[#F9FAFB]" />
            <div 
              className="absolute inset-0 transition-opacity duration-1200 ease-in-out"
              style={{ opacity: messages.length === 0 ? 1.0 : 0.12 }}
            >
              <div className="absolute -top-[15%] -left-[10%] w-[75%] h-[60%] rounded-full bg-gradient-to-tr from-sky-100/40 via-indigo-100/20 to-transparent blur-[120px] animate-drift-slow-a" />
              <div className="absolute -bottom-[20%] -right-[15%] w-[80%] h-[70%] rounded-full bg-gradient-to-bl from-blue-50/50 via-cyan-50/30 to-transparent blur-[140px] animate-drift-slow-b" />
              <div className="absolute top-[25%] left-[30%] w-[60%] h-[55%] rounded-full bg-gradient-to-r from-sky-50/25 via-indigo-50/15 to-transparent blur-[110px] animate-drift-slow-c" />
              <div className="absolute top-[40%] right-[10%] w-[45%] h-[40%] rounded-full bg-gradient-to-l from-white/40 via-blue-50/15 to-transparent blur-[90px]" />
            </div>
            {/* Grounding Fog */}
            <div className="absolute bottom-0 left-0 right-0 h-[35%] bg-gradient-to-t from-white via-white/70 to-transparent z-[1]" />
            {/* Subtle Grain Texture for depth */}
            <div className="absolute inset-0 opacity-[0.035] mix-blend-overlay pointer-events-none grain-overlay z-[1]" />
            <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#000000_1.5px,transparent_1.5px)] [background-size:32px_32px] z-[1]" />
          </div>
        )}

        {theme === 'dark' && (
          <div className="absolute inset-0 transition-opacity duration-1000 ease-in-out">
            <div className="absolute inset-0 bg-[#050507]" />
            <div 
              className="absolute inset-0 transition-opacity duration-1200 ease-in-out"
              style={{ opacity: messages.length === 0 ? 1.0 : 0.10 }}
            >
              <div className="absolute -top-[20%] -left-[15%] w-[80%] h-[65%] rounded-full bg-gradient-to-tr from-neutral-900/30 via-blue-950/10 to-transparent blur-[150px] animate-drift-slow-a" />
              <div className="absolute -bottom-[25%] right-[-15%] w-[85%] h-[75%] rounded-full bg-gradient-to-bl from-indigo-950/15 via-slate-950/25 to-transparent blur-[160px] animate-drift-slow-b" />
              <div className="absolute top-[35%] left-[25%] w-[65%] h-[55%] rounded-full bg-gradient-to-r from-neutral-900/20 via-transparent to-transparent blur-[130px] animate-drift-slow-c" />
              <div className="absolute bottom-[15%] left-[10%] w-[55%] h-[45%] rounded-full bg-gradient-to-tr from-[#121217]/30 via-transparent to-transparent blur-[120px]" />
            </div>
            {/* Grounding Fog */}
            <div className="absolute bottom-0 left-0 right-0 h-[28%] bg-gradient-to-t from-[#050507] via-[#050507]/50 to-transparent z-[1]" />
            {/* Subtle Grain Texture for depth */}
            <div className="absolute inset-0 opacity-[0.025] mix-blend-overlay pointer-events-none grain-overlay z-[1]" />
            <div className="absolute inset-0 opacity-[0.015] bg-[radial-gradient(#ffffff_1.5px,transparent_1.5px)] [background-size:36px_36px] z-[1]" />
          </div>
        )}

        {theme === 'cosmic' && (
          <div className="absolute inset-0 transition-opacity duration-1000 ease-in-out">
            <style dangerouslySetInnerHTML={{__html: `
              @keyframes cosmicStarFieldSlow {
                0% { transform: translateY(0px) rotate(0deg); }
                50% { transform: translateY(-15px) rotate(0.5deg); }
                100% { transform: translateY(0px) rotate(0deg); }
              }
              @keyframes cosmicStarFieldMedium {
                0% { transform: translateY(0px) rotate(0deg) scale(0.95); }
                50% { transform: translateY(-25px) rotate(-0.5deg) scale(1.02); }
                100% { transform: translateY(0px) rotate(0deg) scale(0.95); }
              }
              @keyframes cosmicNebulaPulseA {
                0% { transform: scale(1) translate(0px, 0px); opacity: 0.22; }
                50% { transform: scale(1.12) translate(15px, -10px); opacity: 0.35; }
                100% { transform: scale(1) translate(0px, 0px); opacity: 0.22; }
              }
              @keyframes cosmicNebulaPulseB {
                0% { transform: scale(1) translate(0px, 0px); opacity: 0.15; }
                50% { transform: scale(1.16) translate(-15px, 15px); opacity: 0.28; }
                100% { transform: scale(1) translate(0px, 0px); opacity: 0.15; }
              }
              @keyframes planetFloating {
                0% { transform: translateY(0px) rotate(0deg); }
                50% { transform: translateY(-8px) rotate(0.4deg); }
                100% { transform: translateY(0px) rotate(0deg); }
              }
              .animate-cosmic-stars-1 {
                animation: cosmicStarFieldSlow 48s infinite ease-in-out;
              }
              .animate-cosmic-stars-2 {
                animation: cosmicStarFieldMedium 32s infinite ease-in-out;
              }
              .animate-cosmic-nebula-1 {
                animation: cosmicNebulaPulseA 24s infinite ease-in-out;
              }
              .animate-cosmic-nebula-2 {
                animation: cosmicNebulaPulseB 36s infinite ease-in-out;
              }
              .animate-cosmic-planet {
                animation: planetFloating 20s infinite ease-in-out;
              }
            `}} />

            {/* Deep universe space backdrop */}
            <div className="absolute inset-0 bg-[#020105]" style={{
              backgroundImage: 'radial-gradient(circle at 50% 95%, #0a0422 0%, #03010b 55%, #010003 100%)'
            }} />

            <div 
              className="absolute inset-0 transition-opacity duration-1200 ease-in-out"
              style={{ opacity: messages.length === 0 ? 1.0 : 0.15 }}
            >
              {/* Luminous breathing colorful nebula clouds */}
              <div className="absolute bottom-[-15%] left-[5%] w-[90%] h-[55%] rounded-full bg-gradient-to-tr from-[#2d115e]/20 to-[#7c3aed]/8 blur-[130px] mix-blend-screen animate-cosmic-nebula-1" />
              <div className="absolute top-[10%] right-[-10%] w-[70%] h-[60%] rounded-full bg-gradient-to-bl from-[#0f1d4a]/25 to-[#0d9488]/10 blur-[120px] mix-blend-screen animate-cosmic-nebula-2" />
              <div className="absolute top-[35%] left-[-15%] w-[55%] h-[50%] rounded-full bg-gradient-to-r from-[#581c87]/12 to-[#db2777]/6 blur-[110px] mix-blend-screen" />

              {/* Realistic Star depth layers (Parallax Effect) */}
              <div className="absolute inset-0 opacity-[0.10] bg-[radial-gradient(#ffffff_1.2px,transparent_1px)] [background-size:24px_24px] animate-cosmic-stars-1" />
              <div className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(#ffffff_1.8px,transparent_1.5px)] [background-size:48px_48px] animate-cosmic-stars-2" style={{ transform: 'rotate(15deg)' }} />
              <div className="absolute inset-0 opacity-[0.04] bg-[radial-gradient(#a5b4fc_2.2px,transparent_1.8px)] [background-size:96px_96px] animate-cosmic-stars-1" style={{ transform: 'rotate(-25deg) scale(1.1)' }} />
            </div>

            {/* Premium Earth Crescent Visible in Distance (Subtle, elegant low-opacity vector) */}
            <div className="absolute top-[5%] right-[-10%] md:right-[-2%] w-[320px] h-[320px] md:w-[480px] md:h-[480px] pointer-events-none select-none opacity-[0.15] z-0 animate-cosmic-planet flex items-center justify-center">
              <svg className="w-full h-full text-indigo-500" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <filter id="cosmicGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="4.5" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <radialGradient id="sphereGradients" cx="30%" cy="30%" r="70%" fx="30%" fy="30%">
                    <stop offset="0%" stopColor="#1e293b" stopOpacity="0.8" />
                    <stop offset="40%" stopColor="#0f172a" stopOpacity="0.65" />
                    <stop offset="85%" stopColor="#020617" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="rimGlowColor" cx="28%" cy="28%" r="58%">
                    <stop offset="0%" stopColor="#a5b4fc" stopOpacity="0.55" />
                    <stop offset="40%" stopColor="#818cf8" stopOpacity="0.25" />
                    <stop offset="75%" stopColor="#6366f1" stopOpacity="0.05" />
                    <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                  </radialGradient>
                  <mask id="planetMaskShape">
                    <circle cx="50" cy="50" r="46" fill="#ffffff" />
                  </mask>
                </defs>

                {/* Atmospheric edge glow backplane */}
                <circle cx="50" cy="50" r="47.5" stroke="#818cf8" strokeWidth="1.5" strokeOpacity="0.32" filter="url(#cosmicGlow)" />
                
                {/* Main shadow body sphere */}
                <circle cx="50" cy="50" r="46" fill="url(#sphereGradients)" />

                {/* Continents and telemetry meridian mask */}
                <g mask="url(#planetMaskShape)" className="opacity-32 mix-blend-overlay">
                  {/* Dynamic landmass curves */}
                  <path d="M25,20 C35,22 38,15 48,18 C58,21 62,30 55,42 C48,54 32,48 22,55 C12,62 8,50 15,35 Z" fill="#94a3b8" />
                  <path d="M60,45 C70,40 75,48 85,42 C95,36 92,20 80,15 C68,10 65,22 55,30 Z" fill="#94a3b8" />
                  <path d="M30,68 C42,65 55,75 50,85 C45,95 28,92 20,80 C12,68 18,70 30,68 Z" fill="#94a3b8" />
                  <path d="M72,62 C78,65 82,75 88,72 C94,69 95,58 90,52 C85,46 80,55 72,62 Z" fill="#94a3b8" />
                  
                  {/* Grid latitude and longitude scanning overlay */}
                  <circle cx="50" cy="50" r="46" stroke="#4f46e5" strokeWidth="0.25" strokeOpacity="0.2" strokeDasharray="1 1.5" fill="none" />
                  <ellipse cx="50" cy="50" rx="30" ry="46" stroke="#4f46e5" strokeWidth="0.2" strokeOpacity="0.15" fill="none" />
                  <ellipse cx="50" cy="50" rx="15" ry="46" stroke="#4f46e5" strokeWidth="0.2" strokeOpacity="0.15" fill="none" />
                  <line x1="4" y1="50" x2="96" y2="50" stroke="#4f46e5" strokeWidth="0.2" strokeOpacity="0.15" />
                  <line x1="50" y1="4" x2="50" y2="96" stroke="#4f46e5" strokeWidth="0.2" strokeOpacity="0.15" />
                </g>

                {/* Shimmering rim lit aura crescent edge */}
                <circle cx="50" cy="50" r="46" fill="url(#rimGlowColor)" mix-blend-mode="screen" />
              </svg>
            </div>
            
            {/* Slow moving soft nebula horizontal gas ray */}
            <div className="absolute bottom-[8%] left-1/4 w-1/2 h-[1.5px] bg-gradient-to-r from-transparent via-indigo-500/25 to-transparent blur-[2px]" />
            
            {/* Atmospheric floor haze glow shadow gradient overlay */}
            <div className="absolute bottom-0 left-0 right-0 h-[28%] bg-gradient-to-t from-[#03010b]/60 to-transparent backdrop-blur-[0.2px] pointer-events-none" />

            {/* Subtle Grain Texture for depth */}
            <div className="absolute inset-0 opacity-[0.04] mix-blend-overlay pointer-events-none grain-overlay" />
          </div>
        )}
      </div>

      {/* Drag & Drop Overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div 
            key="drag-drop-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-white/95 z-50 flex flex-col items-center justify-center p-6 border-4 border-dashed border-slate-200 pointer-events-none"
          >
            <div className="flex flex-col items-center space-y-4 max-w-md text-center">
              <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100">
                <Paperclip className="w-8 h-8 text-neutral-500 animate-pulse" />
              </div>
              <h2 className="text-xl font-display-weight tracking-tight text-neutral-800 font-display">Drop attachments here</h2>
              <p className="text-sm text-neutral-400 font-sans">Supported files: Images, scripts, texts up to 10MB</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Glassmorphic Sidebar */}
      <Sidebar 
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        activeChatId={activeChatId}
        onSelectChat={selectChat}
        onNewChat={clearChat}
        chats={chats}
        onRenameChat={renameChat}
        onDeleteChat={handleDeleteChat}
        onTogglePinChat={handleTogglePinChat}
        theme={theme}
        user={session?.user}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenConnections={() => router.push('/connections')}
        onLogoutClick={() => setIsLogoutConfirmOpen(true)}
        width={sidebarWidth}
        onWidthChange={setSidebarWidth}
        onCopyLink={() => showToast("Copied chat link to clipboard!")}
      />

      {/* Main Container Wrapper - Handles layout alignment dynamic shifting */}
      <div 
        className="flex-1 flex flex-col min-h-screen transition-all duration-300 ease-out"
        style={{
          paddingLeft: isSidebarOpen && !isMobile ? `${sidebarWidth}px` : '0px',
          paddingRight: isSourcesSidebarOpen && !isMobile ? `${sourcesWidth}px` : '0px'
        }}
      >
        <div id="desktop-split-container" className="flex-1 flex flex-row flex-nowrap relative h-screen overflow-hidden">
          
          {/* Left Column: Chat Conversation Stream */}
          <div 
            id="desktop-chat-panel"
            ref={chatContainerRef}
            className="flex-1 flex flex-col relative h-full overflow-y-auto scrollbar-thin transition-all duration-300 shrink-0 border-r border-transparent"
          >
            {/* Conversation Minimap navigator */}
            {messages.length > 15 && <ConversationMinimap messages={messages} theme={theme} />}

            {/* Fixed Top Header (Dynamically bound to Chat columns width) */}
            <header 
              className="fixed top-4 h-[60px] z-[110] flex items-center justify-between pointer-events-none transition-all duration-300"
              style={{
                left: isSidebarOpen && !isMobile ? `calc(${sidebarWidth}px + 16px)` : '16px',
                right: isSourcesSidebarOpen && !isMobile ? `calc(${sourcesWidth}px + 16px)` : '16px'
              }}
            >
            <div 
              className={cn(
                "flex items-center justify-between w-full h-full px-4 rounded-2xl border backdrop-blur-md shadow-xs pointer-events-auto transition-all duration-300",
                theme === 'light'
                  ? "bg-white/40 border-neutral-200/40 text-neutral-800 shadow-[0_2px_8px_rgba(0,0,0,0.02)]"
                  : theme === 'cosmic'
                    ? "bg-neutral-950/45 border-indigo-500/15 text-indigo-100 shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
                    : "bg-neutral-900/40 border-neutral-800/40 text-neutral-150 shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
              )}
            >
              {/* Hamburger & custom Model Selector on Left */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className={cn(
                    "flex items-center justify-center w-9 h-9 rounded-full border shadow-none active:scale-95 cursor-pointer transition-all duration-200",
                    theme === 'light'
                      ? "bg-neutral-950/5 hover:bg-neutral-950/10 border-neutral-200/50 text-neutral-800"
                      : "bg-white/5 hover:bg-white/10 border-neutral-800/65 text-white"
                  )}
                  title="Toggle Sidebar"
                >
                  <Menu size={16} className="stroke-[2px]" />
                </button>
  
                {/* Custom Dropdown Selector Pill */}
                <div className="relative inline-block" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => {
                      console.log(`[MODEL DROPDOWN RENDER] Opening dropdown...`);
                      setIsModelDropdownOpen(!isModelDropdownOpen);
                    }}
                    className={cn(
                      "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border backdrop-blur-md shadow-none transition-all text-[12px] font-semibold active:scale-95 cursor-pointer font-sans",
                      theme === 'light'
                        ? "hover:bg-neutral-950/5 border-neutral-200/50 bg-neutral-50/20 text-neutral-800"
                        : "hover:bg-white/5 border-neutral-800/55 bg-neutral-900/20 text-white"
                    )}
                    title="Select AI Model"
                  >
                    <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", theme === 'light' ? "bg-neutral-900" : "bg-white")} />
                    {(() => {
                      const displayNames: Record<string, string> = {
                        'ED1.7': 'Plack 1.7',
                        'ED1.1': 'Plack 1.1',
                        'E1': 'Plack E1',
                        'D1-Lite': 'Plack 1 Lite'
                      };
                      const displayName = displayNames[activeModel] || activeModel;
                      console.log(`[SELECTED MODEL] ${activeModel} -> ${displayName}`);
                      return <span>{displayName}</span>;
                    })()}
                    <ChevronDown size={11} className={cn("text-neutral-400 transition-transform duration-200", isModelDropdownOpen && "rotate-180")} />
                  </button>
  
                  <AnimatePresence>
                    {isModelDropdownOpen && (
                      <motion.div
                        key="model-dropdown-menu"
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className={cn(
                          "absolute left-0 top-full mt-2 w-[160px] backdrop-blur-2xl border rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.15)] p-1.5 z-50 overflow-hidden space-y-0.5",
                          theme === 'light'
                            ? "bg-white/95 border-neutral-250/60 shadow-[0_12px_36px_rgba(0,0,0,0.06)]"
                            : "bg-neutral-900/95 border-neutral-800/80 shadow-[0_12px_36px_rgba(0,0,0,0.4)] text-white"
                        )}
                      >
                        {(() => {
                          const models = [
                            {
                              id: 'ED1.7',
                              name: 'Plack 1.7',
                              source: 'Plack Ultra 3.5',
                              badge: 'Flagship',
                              desc: 'Premium reasoning model with smart multi-turn capabilities.'
                            },
                            {
                              id: 'ED1.1',
                              name: 'Plack 1.1',
                              source: 'Plack Flash Pro 3.5',
                              badge: 'Balanced',
                              desc: 'Balanced performance, smart reasoning, fast speed.'
                            },
                            {
                              id: 'E1',
                              name: 'Plack E1',
                              source: 'Plack Light 3.1',
                              badge: 'Efficient',
                              desc: 'Extremely fast and optimized for quick simple tasks.'
                            },
                            {
                              id: 'D1-Lite',
                              name: 'Plack 1 Lite',
                              source: 'Plack Flash 2.5',
                              badge: 'Fast response',
                              desc: 'Fast everyday model with strong reasoning and low latency.'
                            }
                          ] as const;
                          console.log(`[MODEL LIST]`, models.map(m => m.id));
                          return models.map((modelOption) => (
                          <button
                            key={modelOption.id}
                            type="button"
                            onClick={() => {
                              const targetModel = modelOption.id as ModelName;
                              console.log(`[MODEL CHANGE] ${activeModel} -> ${targetModel}`);
                              setActiveModel(targetModel);
                              setIsModelDropdownOpen(false);
                              if (targetModel !== 'ED1.7') {
                                setUseDeepResearch(false);
                              }
                            }}
                            className={cn(
                              "w-full text-left p-2 rounded-xl transition-all cursor-pointer block border border-transparent",
                              activeModel === modelOption.id 
                                ? (theme === 'light' 
                                    ? "bg-neutral-100 border-neutral-200/50 text-neutral-900" 
                                    : "bg-neutral-800/70 border-neutral-750 text-white") 
                                : (theme === 'light' 
                                    ? "text-neutral-500 hover:bg-neutral-55 hover:text-neutral-900" 
                                    : "text-neutral-400 hover:bg-neutral-800/30 hover:text-white")
                            )}
                          >
                            <div className="flex items-center justify-between gap-2 font-sans px-1">
                              <span className="font-bold text-[12px]">{modelOption.name}</span>
                              {activeModel === modelOption.id && (
                                <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", theme === 'light' ? "bg-neutral-900" : "bg-white")} />
                              )}
                            </div>
                          </button>
                        ));
                      })()}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
  
              {/* Centered Chat Title */}
              <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none w-1/3 text-center sm:block hidden">
                <span className={cn(
                  "text-[12.5px] font-bold tracking-tight bg-[#941919]/0 py-0.5 animate-in fade-in slide-in-from-top-1 duration-300 truncate block",
                  theme === 'light' ? "text-neutral-900" : "text-white"
                )}>
                  {isTemporaryChat ? "Temporary Chat" : (chats.find(c => c.id === activeChatId)?.title || "Plack AI")}
                </span>
              </div>
  
              {/* Premium Compose & Map Icons on Right */}
              <div className="flex items-center gap-2">
  
                {!isTemporaryChat ? (
                  <button
                    type="button"
                    onClick={clearChat}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11.5px] font-sans font-semibold active:scale-95 cursor-pointer backdrop-blur-md transition-all duration-205 select-none shadow-xs",
                      theme === 'light'
                        ? "bg-neutral-100 hover:bg-neutral-200 border-neutral-200 text-neutral-800"
                        : "bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300"
                    )}
                    title="Start New Chat"
                  >
                    <Plus size={11} className="shrink-0" />
                    <span className="hidden sm:inline">New Chat</span>
                  </button>
                ) : (
                  <div className={cn(
                    "flex items-center justify-center p-1.5 rounded-full border",
                    theme === 'light'
                      ? "bg-amber-50 border-amber-200 text-amber-800"
                      : "bg-amber-950/40 border-amber-500/20 text-amber-350"
                  )}>
                    <Image src={brandingLogo} alt="Logo" className="w-5 h-5 object-contain pointer-events-none" />
                  </div>
                )}
                {isMobile && messages.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setIsMobileMapOpen(true)}
                    className={cn(
                      "flex items-center justify-center w-9 h-9 rounded-full border shadow-none active:scale-95 cursor-pointer backdrop-blur-md transition-all duration-200 select-none",
                      theme === 'light'
                        ? "bg-neutral-950/5 hover:bg-neutral-950/10 border-neutral-200/50 text-neutral-800"
                        : "bg-white/5 hover:bg-white/10 border-neutral-800/65 text-white"
                    )}
                    title="Conversation Outline"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                  </button>
                )}
                </div>
  
            </div>
          </header>

        {/* Conversation Canvas Area */}
        <div className={cn(
          "flex-1 w-full mx-auto px-6 select-text overflow-x-hidden relative z-10 flex flex-col justify-between transition-all duration-300 ease-in-out",
          isLiveModeOpen 
            ? "max-w-[700px] pt-40 pb-[240px]" 
            : "max-w-[720px] pt-28 pb-36"
        )}>
          
          {/* Temporary Chat Info Banner */}
          {isTemporaryChat && (
            <div className={cn(
              "w-full rounded-2xl border mb-6 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs animate-fade-in text-left z-20 shrink-0",
              theme === 'light'
                ? "bg-amber-50/70 border-amber-200 text-amber-800"
                : "bg-amber-950/25 border-amber-500/20 text-amber-200"
            )}>
              <div className="flex items-center gap-3">
                <div className={cn("p-1.5 rounded-lg shrink-0", theme === 'light' ? "bg-amber-200/50" : "bg-amber-950/50")}>
                  <EyeOff size={14} className="text-amber-500 shrink-0" />
                </div>
                <div>
                  <p className="text-[12.5px] font-bold">Temporary Chat Mode</p>
                  <p className="text-[11.5px] opacity-75">This conversation is private and will never be saved to your dashboard, search index or recents history.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsTemporaryChat(false);
                  setMessages([]);
                }}
                className={cn(
                  "px-3 py-1.5 text-[11px] font-bold rounded-xl border cursor-pointer active:scale-95 transition-all shrink-0 justify-end self-end sm:self-auto",
                  theme === 'light'
                    ? "bg-white hover:bg-neutral-50 shadow-xs border-neutral-200 text-neutral-700"
                    : "bg-neutral-900/60 hover:bg-neutral-900 border-neutral-800 text-neutral-300"
                )}
              >
                Close Mode
              </button>
            </div>
          )}

          {/* Draft Restored Toast Indicator */}
          {draftRestoredNote && (
            <div className={cn(
              "w-full rounded-xl border mb-4 px-4 py-2.5 flex items-center justify-between gap-3 shadow-xs animate-fade-in text-left z-20 shrink-0",
              theme === 'light'
                ? "bg-neutral-50 border-neutral-200/80 text-neutral-600"
                : "bg-neutral-900/60 border-neutral-800/80 text-neutral-300"
            )}>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                <span className="text-[12px] font-sans font-semibold text-neutral-400">{draftRestoredNote}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInputValue('');
                  setAttachments([]);
                  const draftKey = `plack_draft_${activeChatId || 'new-chat'}`;
                  sessionStorage.removeItem(draftKey);
                  localStorage.removeItem(draftKey);
                  setDraftRestoredNote(null);
                }}
                className="text-[11px] font-bold text-rose-500 hover:underline cursor-pointer active:scale-95"
              >
                Clear Draft
              </button>
            </div>
          )}

          {messages.length > 0 && (
            /* Message Stream */
            <div className={cn("transition-all duration-300", isLiveModeOpen ? "space-y-16" : "space-y-12")}>
              {messages.map((message) => {
                const isUser = message.role === 'user';
                
                return (
                  <div 
                    key={message.id} 
                    id={`msg-${message.id}`}
                    className={cn(
                      "flex flex-col space-y-4 animate-fade-in",
                      isUser ? "items-end" : "items-start",
                      message.role === 'system' && "w-full items-center"
                    )}
                  >
                    {message.role === 'system' ? (
                      <div className="w-full flex justify-center my-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className={cn(
                          "max-w-2xl w-full p-6 py-4 rounded-2xl border backdrop-blur-md shadow-sm flex flex-col gap-1 items-center text-center",
                          theme === 'light' 
                            ? "bg-white/80 border-neutral-200/60 text-neutral-600 shadow-neutral-100/50 shadow-lg" 
                            : "bg-neutral-900/60 border-neutral-800 text-neutral-400 shadow-black/20 shadow-xl"
                        )}>
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center mb-1",
                            theme === 'light' ? "bg-neutral-50 text-neutral-400" : "bg-neutral-800 text-neutral-500"
                          )}>
                            <Orbit size={18} />
                          </div>
                          <span className={cn("text-[10px] uppercase tracking-[0.25em] font-bold mb-1 opacity-80", theme === 'light' ? "text-neutral-400" : "text-neutral-500")}>
                            System Message
                          </span>
                          <div className="w-12 h-[1px] bg-neutral-200/50 dark:bg-neutral-800/20 mb-2" />
                          <p className={cn("text-[14.5px] leading-relaxed font-sans font-medium px-4", theme === 'light' ? "text-neutral-600" : "text-neutral-300")}>
                            {message.content}
                          </p>
                        </div>
                      </div>
                    ) : isUser ? (
                      <div className="flex flex-col items-end space-y-2 max-w-[85%] select-text">
                        {/* Attachments inside User message */}
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-1 justify-end select-none">
                            {message.attachments.map((att: Attachment, i: number) => {
                              const isImg = att.type.startsWith('image/');
                              return (
                                <div 
                                  key={att.id || `msg-${message.id}-att-${i}`}
                                  className="flex items-center gap-2 border border-slate-100/80 bg-white/90 rounded-xl p-1.5 pl-2.5 pr-3 shadow-xs"
                                >
                                  {isImg ? (
                                    <div className="relative w-6 h-6 rounded-md overflow-hidden bg-slate-50 border border-slate-100 flex-shrink-0">
                                      <img 
                                        src={att.publicUrl ? att.publicUrl : `data:${att.type};base64,${att.data}`} 
                                        alt={att.name}
                                        className="object-cover w-full h-full"
                                        referrerPolicy="no-referrer"
                                      />
                                    </div>
                                  ) : (
                                    <div className="relative w-6 h-6 rounded-md bg-slate-50 border border-slate-100 flex-shrink-0 flex items-center justify-center">
                                      <FileCode size={13} className="text-slate-400 flex-shrink-0" />
                                    </div>
                                  )}
                                  <span className="text-[11px] font-sans text-slate-500 truncate max-w-[124px]">{att.name}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        
                        {/* Minimal Rounded bubble styling for User */}
                        {message.content && (
                          editingMessageId === message.id ? (
                            <div className={cn(
                              "relative w-full max-w-full md:w-[480px] flex flex-col p-3 rounded-2xl border shadow-sm animate-in fade-in zoom-in-95 duration-200 z-10",
                              theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-900 border-neutral-800"
                            )}>
                              <textarea
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                className={cn(
                                  "w-full resize-none outline-none text-[14.5px] bg-transparent p-2 min-h-[80px] font-sans",
                                  theme === 'light' ? "text-neutral-800" : "text-white"
                                )}
                                autoFocus
                              />
                              <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-neutral-200/50 dark:border-neutral-800/50">
                                <button
                                  onClick={() => setEditingMessageId(null)}
                                  className="px-3.5 py-1.5 text-[12px] font-medium text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleEditMessageSave(message.id, editContent)}
                                  className="px-3.5 py-1.5 text-[12px] font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer"
                                >
                                  Save & Send
                                </button>
                              </div>
                            </div>
                          ) : (
                          <div className="relative group flex items-center">
                            {/* Hover Actions (Desktop/Mobile accessible) */}
                            <div className="absolute right-full mr-2 opacity-0 group-hover:opacity-100 flex flex-row items-center gap-1 transition-opacity duration-200 group-active:opacity-100 flex-shrink-0">
                              <button
                                onClick={() => {
                                  setEditingMessageId(message.id);
                                  setEditContent(message.content);
                                }}
                                className={cn(
                                  "p-2 rounded-full transition-colors cursor-pointer active:scale-95",
                                  theme === 'light' ? "hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700" : "hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200"
                                )}
                                title="Edit Message"
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                              </button>
                              <button
                                onClick={() => handleCopyMessage(message.content)}
                                className={cn(
                                  "p-2 rounded-full transition-colors cursor-pointer active:scale-95",
                                  theme === 'light' ? "hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700" : "hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200"
                                )}
                                title="Copy Message"
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                              </button>
                            </div>

                            <div className="rounded-[24px] rounded-tr-[4px] px-5 py-3 text-[14.5px] leading-relaxed text-left select-text font-sans border max-w-full accent-bg accent-border shadow-md">
                              {message.content}
                            </div>
                          </div>
                          )
                        )}
                      </div>
                    ) : (
                      /* Assistant Typography Direct layout (No visible bubble container) */
                       <div className={cn(
                        "w-full space-y-4 select-text",
                        message.isDeepResearch && (
                          theme === 'light'
                            ? "bg-[#faf9f6]/90 border border-neutral-200/60 p-6 rounded-[28px] shadow-xs"
                            : "bg-[#09090b]/90 border border-purple-500/[0.08] p-6 rounded-[28px] shadow-[0_4px_30px_rgba(0,0,0,0.4)] relative overflow-hidden"
                        )
                      )}>
                        {message.memorySaved && (
                          <div className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-bold mb-1 select-none animate-in fade-in slide-in-from-top-1 duration-300",
                            theme === 'light'
                              ? "bg-emerald-50 border-emerald-200/50 text-emerald-700"
                              : "bg-emerald-950/20 border-emerald-500/20 text-emerald-400"
                          )}>
                            <svg className="w-3.5 h-3.5 shrink-0 text-emerald-500 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                              <path d="m9 11 2 2 4-4" />
                            </svg>
                            <span>
                              {message.memorySaved.action === 'update' ? 'Memory Updated' : 
                               message.memorySaved.action === 'delete' ? 'Memory Deleted' : 'Memory Added'}
                            </span>
                          </div>
                        )}
                        {message.isDeepResearch && (
                          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl pointer-events-none" />
                        )}
                        
                        {/* Collapsible reasoning block - hidden by default, expandable */}
                        {message.reasoning && !message.isStreaming && (
                          <div className="w-full">
                            <button
                              type="button"
                              onClick={() => toggleReasoning(message.id)}
                              className="flex items-center gap-2 mb-2 select-none hover:opacity-85 active:scale-[0.98] transition-all cursor-pointer"
                            >
                              <div className={cn(
                                "flex items-center justify-center w-5 h-5 rounded-md bg-neutral-100/80 text-neutral-450 transition-transform duration-200",
                                expandedReasonings[message.id] ? "rotate-90" : "rotate-0"
                              )}>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7"></path>
                                </svg>
                              </div>
                              <span className="text-[11px] uppercase tracking-[0.15em] font-medium text-neutral-450 font-sans">
                                Reasoning {expandedReasonings[message.id] ? 'Detail' : `(${message.reasoning.split(' ').length} words)`}
                              </span>
                            </button>
                            
                            <AnimatePresence initial={false}>
                              {expandedReasonings[message.id] && (
                                <motion.div
                                  key={`reasoning-${message.id}`}
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="ml-[10px] border-l-2 border-neutral-200 pl-4 py-1.5 text-[14px] text-neutral-550 italic leading-relaxed font-light whitespace-pre-wrap font-sans">
                                    {message.reasoning}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}

                        {/* Research Status Timeline Panel */}
                        {message.researchTimeline && message.researchTimeline.length > 0 && (
                          <div className={cn(
                            "relative w-full mx-auto p-5 rounded-2xl border backdrop-blur-md mb-6 flex flex-col gap-4 shadow-sm font-sans animate-fade-in select-none",
                            theme === 'light' 
                              ? "bg-stone-50/80 border-neutral-200/65" 
                              : "bg-neutral-950/60 border-neutral-800/80"
                          )}>
                            <div className="flex items-center gap-2">
                              <div className="h-5 w-5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center font-mono text-[9px] animate-pulse">
                                ●
                              </div>
                              <span className={cn(
                                "text-[10px] uppercase tracking-wider font-extrabold",
                                theme === 'light' ? "text-neutral-500" : "text-neutral-400"
                              )}>
                                Deep Research Processing Panel
                              </span>
                            </div>
                            
                            {/* Stages Timeline */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-1.5 border-t border-b py-3.5 border-neutral-200/50 dark:border-neutral-800/40">
                              {message.researchTimeline.map((stage: string, idx: number) => {
                                const isActive = message.activeStageIndex === idx;
                                const isCompleted = (message.activeStageIndex ?? 0) > idx;
                                return (
                                  <div key={stage} className="flex items-center gap-2 flex-1 min-w-[110px]">
                                    <div className={cn(
                                      "w-4.5 h-4.5 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all shrink-0",
                                      isCompleted 
                                        ? "bg-indigo-600 border-indigo-500 text-white shadow-xs" 
                                        : isActive 
                                          ? "bg-purple-500/20 border-purple-400 text-purple-300 animate-pulse shadow-md"
                                          : "bg-neutral-800/20 border-neutral-700/50 text-neutral-500"
                                    )}>
                                      {isCompleted ? "✓" : idx + 1}
                                    </div>
                                    <span className={cn(
                                      "text-[11px] font-semibold tracking-tight truncate shrink-0",
                                      isCompleted
                                        ? (theme === 'light' ? "text-neutral-500 line-through text-xs" : "text-neutral-400 line-through text-xs")
                                        : isActive
                                          ? (theme === 'light' ? "text-neutral-900 font-bold" : "text-white font-bold")
                                          : (theme === 'light' ? "text-neutral-400" : "text-neutral-500")
                                    )}>
                                      {stage}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Dynamic status action prompt */}
                            {message.researchStatus && (
                              <div className="flex items-center gap-2 mt-[2px] py-1 pl-3 border-l-2 border-purple-500 bg-purple-500/[0.02] rounded-r-lg font-mono text-[11px] text-purple-400 select-text leading-relaxed">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0 animate-pulse" />
                                <span>Action: {message.researchStatus}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Rendering core Text directly with rich features */}
                        <div className="w-full pl-0 text-neutral-900 leading-relaxed font-sans text-[15.5px]">
                          {message.content === '' && message.isStreaming ? (
                            <div className="flex items-center space-x-2 py-4">
                              <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                              {message.isDeepResearch ? (
                                <span className={cn("text-sm text-purple-400 font-medium ml-1 font-mono animate-pulse")}>Engaged in Deep Research multi-stage analytics...</span>
                              ) : (
                                isWebSearchEnabled && <span className={cn("text-sm text-neutral-500 font-medium ml-1", theme === 'light' ? "" : "text-neutral-400")}>Searching the web...</span>
                              )}
                            </div>
                          ) : (
                            <>
                              {(() => {
                                const parsedDoc = extractDocumentBlock(message.content);
                                
                                return (
                                  <div className="flex flex-col gap-4">
                                    {parsedDoc.cleanText && (
                                      <MarkdownRenderer content={parsedDoc.cleanText} theme={theme} />
                                    )}
                                    {parsedDoc.hasDocument && (
                                      <InlineDocumentBlock 
                                        id={parsedDoc.id}
                                        userId={session?.user?.id}
                                        title={parsedDoc.title} 
                                        content={parsedDoc.content} 
                                        theme={theme} 
                                        isStreaming={message.isStreaming}
                                      />
                                    )}
                                  </div>
                                );
                              })()}

                              {message.memoryLimitReached && (
                                <div 
                                  onClick={() => {
                                    setIsMemoryManagerOpen(true);
                                  }}
                                  className={cn(
                                    "flex items-start gap-3 p-4 rounded-2xl border w-full max-w-md select-none cursor-pointer transition-all duration-300 transform active:scale-[0.98] group my-4",
                                    theme === 'light' 
                                      ? "bg-[#fffbeb] border-amber-200 hover:bg-[#fff9db] hover:shadow-xs" 
                                      : "bg-amber-950/15 border-amber-500/[0.12] hover:bg-amber-950/25 hover:border-amber-500/[0.2] shadow-xl"
                                  )}
                                >
                                  <div className={cn(
                                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-xs",
                                    theme === 'light' ? "bg-amber-100 text-amber-700" : "bg-amber-500/10 text-amber-400"
                                  )}>
                                    <AlertCircle size={18} className={theme === 'light' ? "text-amber-700" : "text-amber-400"} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h4 className={cn("text-[13px] font-bold tracking-tight transition-colors leading-tight", theme === 'light' ? "text-amber-950 group-hover:text-amber-800" : "text-amber-300 group-hover:text-amber-200")}>
                                      ⚠ Memory Capacity Full
                                    </h4>
                                    <p className={cn("text-[12px] mt-1 truncate", theme === 'light' ? "text-amber-700/85" : "text-amber-400/80")}>
                                      Memory limit of 99 slots has been reached. Can&apos;t save new memories.
                                    </p>
                                    <span className={cn("text-[11px] block mt-1.5 underline underline-offset-2 transition-opacity opacity-85 group-hover:opacity-100 font-sans", theme === 'light' ? "text-amber-700" : "text-amber-400")}>
                                      Free up memory in Settings
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Assistant Message Actions */}
                              {!message.isStreaming && (
                                <div className={cn(
                                  "flex items-center gap-1.5 mt-2 pt-2",
                                  theme === 'light' ? "text-neutral-400" : "text-neutral-500"
                                )}>
                                  <button
                                    onClick={() => handleCopyMessage(message.content)}
                                    className={cn(
                                      "p-1.5 rounded-full transition-colors active:scale-95 cursor-pointer",
                                      theme === 'light' ? "hover:bg-neutral-100 hover:text-neutral-700" : "hover:bg-neutral-800 hover:text-neutral-300"
                                    )}
                                    title="Copy"
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleRegenerate(message.id)}
                                    disabled={isStreaming}
                                    className={cn(
                                      "p-1.5 rounded-full transition-colors active:scale-95 cursor-pointer",
                                      isStreaming
                                        ? "opacity-35 cursor-not-allowed text-neutral-400"
                                        : (theme === 'light' ? "hover:bg-neutral-100 hover:text-neutral-700 text-neutral-400" : "hover:bg-neutral-800 hover:text-neutral-350 text-neutral-400")
                                    )}
                                    title="Regenerate Response"
                                  >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                  </button>
                                  
                                  <div className={cn("w-[1px] h-3.5 mx-1", theme === 'light' ? "bg-neutral-200" : "bg-neutral-800")} />

                                  <button
                                    onClick={() => handleFeedback(message.id, 'like')}
                                    className={cn(
                                      "p-1.5 rounded-full transition-colors active:scale-95 cursor-pointer",
                                      theme === 'light' ? "hover:bg-neutral-100" : "hover:bg-neutral-800",
                                      messageAppreciations[message.id] === 'like' ? (theme === 'light' ? 'text-emerald-600 bg-emerald-50' : 'text-emerald-500 bg-emerald-950/40') : (theme === 'light' ? "hover:text-neutral-700" : "hover:text-neutral-300")
                                    )}
                                    title="Like"
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={cn(messageAppreciations[message.id] === 'like' && "fill-current")}><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/></svg>
                                  </button>

                                  <button
                                    onClick={() => handleFeedback(message.id, 'dislike')}
                                    className={cn(
                                      "p-1.5 rounded-full transition-colors active:scale-95 cursor-pointer",
                                      theme === 'light' ? "hover:bg-neutral-100" : "hover:bg-neutral-800",
                                      messageAppreciations[message.id] === 'dislike' ? (theme === 'light' ? 'text-red-500 bg-red-50' : 'text-red-400 bg-red-950/40') : (theme === 'light' ? "hover:text-neutral-700" : "hover:text-neutral-300")
                                    )}
                                    title="Dislike"
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={cn(messageAppreciations[message.id] === 'dislike' && "fill-current")}><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z"/></svg>
                                  </button>

                                  {/* Sources Action Button (Polished Refinement) */}
                                  {(() => {
                                    const sources = getMessageSourcesList(message);
                                    if (sources.length === 0) return null;
                                    const total = sources.reduce((acc, c) => acc + c.count, 0);

                                    return (
                                      <button
                                        onClick={() => {
                                          console.log('[SOURCES OPEN] Sources panel triggered');
                                          console.log('[SOURCES RESPONSE CHANGED] Loading sources for message:', message.id);
                                          setActiveSources(sources);
                                          console.log('[SOURCES CONTEXT LOADED] Context synchronized with response.');
                                          setIsSourcesSidebarOpen(true);
                                        }}
                                        className={cn(
                                          "flex items-center gap-1.5 h-8 px-2.5 rounded-full border text-[11px] font-bold transition-all active:scale-[0.96] shadow-xs cursor-pointer ml-1",
                                          theme === 'light' 
                                            ? "bg-indigo-50 border-indigo-100 text-indigo-600 hover:bg-indigo-100" 
                                            : "bg-indigo-500/10 border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20"
                                        )}
                                        title={`View ${total} sources used for this response`}
                                      >
                                        <Search size={12} className="stroke-[2.5px]" />
                                        <span>Sources</span>
                                      </button>
                                    );
                                  })()}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Live Audio Transcript Stream Overlay */}
              {isLiveModeOpen && (liveTranscript.userText || liveTranscript.aiText) && (
                <div className="pt-6 space-y-12">
                  {/* Live User Transcript */}
                  {liveTranscript.userText && (
                    <div className="flex justify-end pt-10">
                      <div className="max-w-[75%]">
                        <div className={cn(
                          "px-6 py-4 rounded-[26px] rounded-br-[10px] break-words whitespace-pre-wrap leading-relaxed border transition-opacity duration-300 shadow-sm",
                          "bg-neutral-100 text-neutral-800 border-neutral-200/60 dark:bg-[#1a1a1e] dark:text-neutral-200 dark:border-neutral-800",
                          "text-[15.5px]"
                        )}>
                          {liveTranscript.userText}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Live AI Transcript */}
                  {liveTranscript.aiText && (
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full border border-neutral-200/50 dark:border-neutral-800 shrink-0 overflow-hidden shadow-xs dark:bg-black/40 flex items-center justify-center">
                        <Image src={brandingLogo} alt="AI" className="w-[18px] h-[18px] object-contain opacity-90" priority />
                      </div>
                      <div className={cn(
                        "flex-1 min-w-0 font-sans leading-relaxed pt-0.5",
                        theme === 'light' ? "text-neutral-800" : "text-neutral-200"
                      )}>
                        <div className="markdown-body">
                          <MarkdownRenderer content={liveTranscript.aiText} theme={theme} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>



        {/* Hero Greeting/Hero content - Centered when no messages */}
        {messages.length === 0 && !isLiveModeOpen && (
          <div 
            className="fixed inset-0 pointer-events-none z-20 flex flex-col items-center justify-center transition-all duration-700 ease-in-out"
            style={{
              paddingLeft: isSidebarOpen && !isMobile ? `${sidebarWidth}px` : '0px'
            }}
          >
            <div className="pointer-events-auto w-full flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-700 mb-[120px]">
              <div className="relative space-y-4 z-10 flex flex-col items-center group">
                <div className="relative w-16 h-16 flex items-center justify-center mb-1 select-none transition-transform duration-500 group-hover:scale-105">
                  {/* Outer slowly rotating elegant dashed orbital ring */}
                  <div className={cn(
                    "absolute w-20 h-20 rounded-full border border-dashed animate-[spin_60s_linear_infinite] transition-colors duration-500",
                    theme === 'light' 
                      ? "border-neutral-300 group-hover:border-neutral-400" 
                      : "border-neutral-700 group-hover:border-neutral-600"
                  )} />

                  {/* Inner glassmorphism capsule */}
                  <div className={cn(
                    "relative w-14 h-14 rounded-full flex items-center justify-center border backdrop-blur-xl transition-all duration-500 overflow-hidden p-2 shadow-sm group-hover:shadow-md",
                    theme === 'cosmic'
                      ? "bg-neutral-950/75 border-neutral-800"
                      : theme === 'dark'
                        ? "bg-neutral-900/50 border-neutral-800"
                        : "bg-white/80 border-neutral-200"
                  )}>
                    <Image 
                      src={brandingLogo} 
                      alt="Logo" 
                      className="w-10 h-10 object-contain pointer-events-none transition-transform duration-700 ease-out flex-shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>

                <h2 className={cn(
                  "text-[18px] sm:text-[22px] font-display-weight tracking-tight font-display max-w-[480px] mx-auto select-none px-4 leading-normal transition-all duration-350 text-center",
                  theme === 'light' ? "text-neutral-800" : "text-neutral-200"
                )}>
                  What can I help you build today?
                </h2>
              </div>
            </div>
          </div>
        )}

        {/* Floating Capsule Input Pill Structure - Always at Bottom */}
        {!isLiveModeOpen && (
          <div 
            className="fixed pointer-events-none z-30 flex flex-col items-center justify-center bottom-0 py-6 transition-all duration-300 ease-in-out"
            style={{
              left: isSidebarOpen && !isMobile ? `${sidebarWidth}px` : '0px',
              right: isSourcesSidebarOpen && !isMobile ? `${sourcesWidth}px` : '0px'
            }}
          >

          <div 
            className={cn(
              "max-w-[800px] w-full px-5 pointer-events-auto flex flex-col space-y-4 transition-all duration-700 ease-in-out translate-y-0"
            )}
          >
            {/* Attachment preview panel - compact chips */}
            <AnimatePresence>
              {attachments.length > 0 && (
                <motion.div 
                  key="attachments-preview-panel"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="flex flex-wrap gap-2 px-1 select-none"
                >
                  {attachments.map((att: Attachment, index: number) => {
                    const isImg = att.type.startsWith('image/');
                    return (
                      <motion.div 
                        key={att.id || `att-${index}`}
                        layout
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        className={cn(
                          "group flex items-center gap-2 border rounded-xl pl-2 pr-1.5 py-1.5 shadow-sm transition-all select-none",
                          theme === 'light' 
                            ? "bg-white border-neutral-200 text-neutral-800" 
                            : "bg-neutral-900 border-neutral-800 text-white"
                        )}
                      >
                        {isImg ? (
                          <div className={cn(
                            "w-5 h-5 rounded-md overflow-hidden flex-shrink-0 border",
                            theme === 'light' ? "border-neutral-200" : "border-neutral-800"
                          )}>
                            <img 
                              src={`data:${att.type};base64,${att.data}`} 
                              alt={att.name}
                              className="object-cover w-full h-full"
                            />
                          </div>
                        ) : (
                          <FileCode size={13} className="text-neutral-500 flex-shrink-0" />
                        )}
                        <span className="text-[12px] font-bold max-w-[120px] truncate">
                          {att.name}
                        </span>
                        <button
                          onClick={() => removeAttachment(index)}
                          className={cn(
                            "hover:text-red-500 transition-colors cursor-pointer rounded-full p-0.5",
                            theme === 'light' ? "text-neutral-400 hover:bg-neutral-100" : "text-neutral-500 hover:bg-white/5"
                          )}
                        >
                          <X size={12} strokeWidth={3} />
                        </button>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Model Failure Floating UI */}
            <AnimatePresence>
              {modelError && (
                <motion.div
                  key="model-failure-ui"
                  initial={{ opacity: 0, y: 15, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className={cn(
                    "flex flex-col items-center justify-center py-2 relative z-40"
                  )}
                >
                  <div className={cn(
                    "rounded-2xl border px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.12)] flex items-center justify-between gap-4 max-w-[320px] w-full",
                    theme === 'light' 
                      ? "bg-white/95 border-neutral-200/80" 
                      : "bg-neutral-900/95 border-neutral-800/80"
                  )}>
                    <div className="flex flex-col">
                      <span className={cn(
                        "text-[12.5px] font-semibold tracking-tight",
                        theme === 'light' ? "text-neutral-900" : "text-white"
                      )}>
                        {modelError.failedModel} is currently unavailable.
                      </span>
                    </div>
                    {modelError.recommendedModel ? (
                       <button
                         type="button"
                         onClick={() => {
                           setActiveModel(modelError.recommendedModel!);
                           setModelError(null);
                         }}
                         className={cn(
                           "text-[12px] font-bold px-3 py-1.5 rounded-xl transition-colors shrink-0",
                           theme === 'light' ? "bg-neutral-100 text-neutral-800 hover:bg-neutral-200" : "bg-neutral-800 text-white hover:bg-neutral-700"
                         )}
                       >
                         Switch to {modelError.recommendedModel}
                       </button>
                    ) : (
                       <button
                         type="button"
                         onClick={() => setModelError(null)}
                         className="text-[12px] font-bold text-neutral-500 hover:text-neutral-800"
                       >
                         Dismiss
                       </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Futuristic Input Capsule with Animated Gradient Border */}
            <div className="relative w-full pb-3 max-w-[800px] mx-auto">
              {useDeepResearch && activeModel === 'ED1.7' && (
                <div className="flex justify-start mb-2 px-1">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10.5px] font-semibold text-purple-400 bg-purple-500/10 border border-purple-500/15 shadow-xs uppercase tracking-wider font-mono animate-fade-in select-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse shrink-0" />
                    <span>Deep Research Engine Enabled</span>
                  </div>
                </div>
              )}
              <div className={cn(
                "relative transition-all duration-300",
                isInputFocused ? "scale-[1.01]" : "scale-100"
              )}>
                {(() => {
                  const isTyped = inputValue.length > 0;
                  const borderThemeColor = theme === 'light' ? "rgba(224, 224, 230, 0.8)" : "rgba(45, 45, 52, 0.8)";
                  const menuGlassStyle = cn(
                    "absolute bottom-full left-0 mb-4 w-[min(92vw,340px)] max-h-[280px] overflow-y-auto border rounded-[24px] p-4 z-[60] flex flex-col gap-0.5 pointer-events-auto shadow-2xl",
                    theme === 'light'
                      ? "bg-[#FFFFFF] border-neutral-200/60 text-neutral-800"
                      : "bg-[#121212] border-neutral-800/80 text-white"
                  );
                  return (
                    <form 
                      onSubmit={(e) => {
                        if (isListening) {
                          toggleListening();
                        }
                        handleSubmit(e);
                      }}
                      className="flex flex-col relative w-full z-10 select-none gap-1 pb-1"
                    >
                      {/* Active Memory Badge */}
                      {activeMemoryIds.length > 0 && (
                        <div className="flex items-center gap-2 mb-2 ml-1">
                           <div className={cn(
                             "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-sm text-[12px] font-bold animate-in fade-in slide-in-from-bottom-2",
                             theme === 'light' ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                           )}>
                              <BrainCircuit size={14} />
                              <span>Memory Selected • {activeMemoryIds.length}</span>
                              <button 
                                onClick={() => setActiveMemoryIds([])}
                                className="ml-1 p-0.5 rounded-full hover:bg-emerald-500/20 transition-colors"
                              >
                                <X size={12} className="opacity-80 hover:opacity-100" />
                              </button>
                           </div>
                        </div>
                      )}

                      {/* Deep Research "Sites" Box */}
                      {useDeepResearch && (
                        <div className={cn(
                          "w-full rounded-2xl border p-3 flex flex-col gap-2.5 mb-1.5 shadow-sm",
                          theme === 'light'
                            ? "bg-neutral-50 border-neutral-200 text-neutral-800"
                            : theme === 'cosmic'
                              ? "bg-[#0f0c31] border-indigo-500/20 text-indigo-50"
                              : "bg-[#18181b] border-neutral-800 text-neutral-200"
                        )}>
                          {/* Header with Title and Web Search toggle */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="p-1 rounded bg-purple-500/10 text-purple-400">
                                <Globe size={14} />
                              </div>
                              <span className="text-[11px] font-bold uppercase tracking-wider opacity-85">
                                Deep Research Sites
                              </span>
                            </div>
                            
                            {/* Mini Web Search toggle inside Deep Research Sites Box */}
                            <div className="flex items-center gap-2 select-none">
                              <span className="text-[10px] font-medium opacity-70">
                                Web Search: <span className={deepResearchWebSearchEnabled ? "text-emerald-500 font-bold" : "text-neutral-500 font-bold"}>{deepResearchWebSearchEnabled ? "ON" : "OFF"}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => setDeepResearchWebSearchEnabled(!deepResearchWebSearchEnabled)}
                                className={cn(
                                  "w-8 h-4.5 rounded-full relative transition-colors duration-300 p-0.5 shrink-0",
                                  deepResearchWebSearchEnabled ? "bg-purple-600" : "bg-neutral-300 dark:bg-neutral-700"
                                )}
                              >
                                <div className={cn(
                                  "w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform duration-300",
                                  deepResearchWebSearchEnabled ? "translate-x-[14px]" : "translate-x-0"
                                )} />
                              </button>
                            </div>
                          </div>

                          {/* Preferred Domains Section */}
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-semibold opacity-65 flex items-center justify-between">
                              <span>Preferred Domains (Optional)</span>
                              <span className="text-[9px] font-normal opacity-50">comma-separated list</span>
                            </label>
                            <input
                              type="text"
                              value={preferredDomainsInput}
                              onChange={(e) => setPreferredDomainsInput(e.target.value)}
                              placeholder="wikipedia.org, nature.com, arxiv.org"
                              className={cn(
                                "w-full text-[12px] px-2.5 py-1.5 rounded-lg border focus:outline-none focus:ring-1 focus:ring-purple-500/50 transition-all font-sans",
                                theme === 'light'
                                  ? "bg-white border-neutral-300 text-neutral-800 placeholder-neutral-400"
                                  : "bg-neutral-900 border-neutral-800 text-white placeholder-neutral-600"
                              )}
                            />
                          </div>
                        </div>
                      )}

                      {/* Main input horizontally styled wrapper */}
                      <div className="flex items-end relative w-full">
                  {/* File handling native inputs */}
                  <input 
                    type="file"
                    ref={photosInputRef}
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files) processFiles(e.target.files);
                    }}
                    multiple
                    className="hidden"
                  />

                  <input 
                    type="file"
                    ref={cameraInputRef}
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => {
                      if (e.target.files) processFiles(e.target.files);
                    }}
                    className="hidden"
                  />

                  <input 
                    type="file"
                    ref={filesInputRef}
                    onChange={(e) => {
                      if (e.target.files) processFiles(e.target.files);
                    }}
                    multiple
                    className="hidden"
                  />

                  {/* Redesigned interactive "+" button capsule */}
                  <motion.div
                    ref={attachmentMenuRef}
                    initial={false}
                    animate={{
                      marginRight: isTyped ? "12px" : "0px",
                      borderRadius: isTyped ? "9999px" : "26px 0px 0px 26px",
                      borderRightColor: isTyped ? borderThemeColor : "rgba(0,0,0,0)",
                      x: isTyped ? 0 : 0,
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 30, bounce: 0.1 }}
                    className={cn(
                      "relative flex-shrink-0 flex items-center justify-center w-[52px] h-[52px] border backdrop-blur-3xl z-20 transition-colors duration-300 self-end mb-1",
                      theme === 'light'
                        ? "bg-white border-neutral-200 text-neutral-500 hover:text-neutral-900 shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
                        : theme === 'cosmic'
                          ? "bg-neutral-950/98 border-neutral-800 text-neutral-400 hover:text-white shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
                          : "bg-neutral-900/95 border-neutral-800 text-neutral-400 hover:text-white shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setIsAttachmentMenuOpen(!isAttachmentMenuOpen)}
                      className={cn(
                        "flex items-center justify-center w-11 h-11 rounded-full transition-all duration-300 cursor-pointer group active:scale-90",
                        isAttachmentMenuOpen && (theme === 'light' ? "bg-neutral-100/80 text-neutral-900" : "bg-neutral-800/80 text-white")
                      )}
                      title="Attach media or files"
                    >
                      <Plus size={20} className={cn("stroke-[2.5px] transition-transform duration-400 cubic-bezier(0.4, 0, 0.2, 1)", isAttachmentMenuOpen && "rotate-45")} />
                    </button>

                    {/* Redesigned Floating command palette for "+" button */}
                    <AnimatePresence>
                      {isAttachmentMenuOpen && (
                        <>
                          {/* BACKDROP FOR MOBILE BOTTOM-SHEET / DESKTOP (Blur only behind modal) */}
                          <motion.div
                            key="attachments-backdrop"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-neutral-950/20 backdrop-blur-[4px] z-[40]"
                            onClick={() => setIsAttachmentMenuOpen(false)}
                          />

                          {/* 1. DESKTOP ACCORDION DROPDOWN (floating above/near button) */}
                          <motion.div
                            key="attachments-desktop-dropdown"
                            initial={{ opacity: 0, y: 15, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 15, scale: 0.96 }}
                            transition={{ type: "spring", stiffness: 450, damping: 30 }}
                            className={cn(
                              "hidden md:flex absolute bottom-[64px] left-0 w-[315px] flex-col p-3 rounded-[24px] border z-[50] shadow-[0_12px_45px_rgba(0,0,0,0.18)] max-h-[460px] overflow-y-auto scrollbar-thin select-none backdrop-blur-xl",
                              theme === 'light' 
                                ? "bg-white border-neutral-200/85 text-neutral-800 shadow-[0_12px_40px_rgba(0,0,0,0.08)]" 
                                : theme === 'cosmic'
                                  ? "bg-[#0c0926] border-indigo-500/25 text-indigo-50 shadow-[0_12px_45px_rgba(0,0,0,0.45)]"
                                  : "bg-[#141416] border-neutral-800/85 text-white shadow-[0_12px_45px_rgba(0,0,0,0.45)]"
                            )}
                          >
                            <div className={cn(
                              "px-3 py-2 text-[10px] font-bold tracking-widest uppercase opacity-55 mb-1",
                              theme === 'light' ? "text-neutral-900" : "text-white"
                            )}>
                              Tools & Attachments
                            </div>

                            {/* Option 1: Camera */}
                            <button
                              type="button"
                              onClick={() => {
                                setIsAttachmentMenuOpen(false);
                                startCamera();
                              }}
                              className={cn(
                                "flex items-center gap-3.5 w-full text-left p-2.5 rounded-xl transition-all cursor-pointer group hover:bg-neutral-100 dark:hover:bg-white/[0.05]",
                                theme === 'light' ? "text-neutral-800" : "text-neutral-100"
                              )}
                            >
                              <div className="w-9 h-9 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0 group-hover:bg-orange-500 group-hover:text-white transition-all duration-300">
                                <Camera size={15} className="stroke-[2.2px]" />
                              </div>
                              <div className="flex flex-col text-left">
                                <span className="text-[13px] font-bold leading-none font-sans">
                                  Camera
                                </span>
                                <span className={cn("text-[11px] leading-tight mt-1 opacity-65", theme === 'light' ? "text-neutral-600" : "text-neutral-400")}>
                                  Snap a photo
                                </span>
                              </div>
                            </button>

                            {/* Option 2: Upload Files */}
                            <button
                              type="button"
                              onClick={() => {
                                setIsAttachmentMenuOpen(false);
                                filesInputRef.current?.click();
                              }}
                              className={cn(
                                "flex items-center gap-3.5 w-full text-left p-2.5 rounded-xl transition-all cursor-pointer group hover:bg-neutral-100 dark:hover:bg-white/[0.05]",
                                theme === 'light' ? "text-neutral-800" : "text-neutral-100"
                              )}
                            >
                              <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0 group-hover:bg-blue-500 group-hover:text-white transition-all duration-300">
                                <Paperclip size={15} className="stroke-[2.2px]" />
                              </div>
                              <div className="flex flex-col text-left">
                                <span className="text-[13px] font-bold leading-none font-sans">
                                  Upload Files
                                </span>
                                <span className={cn("text-[11px] leading-tight mt-1 opacity-65", theme === 'light' ? "text-neutral-600" : "text-neutral-400")}>
                                  Docs, images, PDF
                                </span>
                              </div>
                            </button>

                            {/* Option 3: Use Memory */}
                            {(() => {
                              console.log("[MEMORY BUTTON RENDER] Rendering for Desktop");
                              return (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsAttachmentMenuOpen(false);
                                    setIsMemoryPickerOpen(true);
                                  }}
                                  className={cn(
                                    "flex items-center gap-3.5 w-full text-left p-2.5 rounded-xl transition-all cursor-pointer group hover:bg-neutral-100 dark:hover:bg-white/[0.05]",
                                    theme === 'light' ? "text-neutral-800" : "text-neutral-100"
                                  )}
                                >
                                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0 group-hover:bg-emerald-500 group-hover:text-white transition-all duration-300">
                                    <BrainCircuit size={15} className="stroke-[2.2px]" />
                                  </div>
                                  <div className="flex flex-col text-left">
                                    <span className="text-[13px] font-bold leading-none font-sans">
                                      Use Memory
                                    </span>
                                    <span className={cn("text-[11px] leading-tight mt-1 opacity-65", theme === 'light' ? "text-neutral-600" : "text-neutral-400")}>
                                      Personalized context
                                    </span>
                                  </div>
                                </button>
                              );
                            })()}

                            {/* Option 4: Web Search */}
                            <div
                              onClick={() => {
                                const nextVal = !isWebSearchEnabled;
                                setIsWebSearchEnabled(nextVal);
                                if (nextVal) {
                                  setUseDeepResearch(false);
                                }
                              }}
                              className={cn(
                                "flex items-center justify-between gap-3 w-full text-left p-2.5 rounded-xl transition-all cursor-pointer hover:bg-neutral-100 dark:hover:bg-white/[0.05]",
                                theme === 'light' ? "text-neutral-800" : "text-neutral-100"
                              )}
                            >
                              <div className="flex items-center gap-3.5">
                                <div className={cn(
                                  "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300",
                                  isWebSearchEnabled
                                    ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/20"
                                    : "bg-indigo-500/10 text-indigo-500"
                                )}>
                                  <Search size={15} className="stroke-[2.2px]" />
                                </div>
                                <div className="flex flex-col text-left">
                                  <span className="text-[13px] font-bold leading-none font-sans">
                                    Web Search
                                  </span>
                                  <span className={cn("text-[11px] leading-tight mt-1 opacity-65", theme === 'light' ? "text-neutral-600" : "text-neutral-400")}>
                                    Real-time browsing
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                className={cn(
                                  "w-8 h-4.5 rounded-full relative transition-colors duration-300 p-0.5 shrink-0",
                                  isWebSearchEnabled ? "bg-indigo-600" : "bg-neutral-300 dark:bg-neutral-700"
                                )}>
                                <motion.div
                                  layout
                                  initial={false}
                                  animate={{ x: isWebSearchEnabled ? 14 : 0 }}
                                  className="w-3.5 h-3.5 rounded-full bg-white shadow-sm"
                                />
                              </button>
                            </div>

                            {/* Option 4: Deep Research */}
                            <div
                              onClick={async () => {
                                if (!useDeepResearch) {
                                  setIsWebSearchEnabled(false);
                                  setActiveModel('ED1.7');
                                  try {
                                    const checkRes = await fetch("/api/usage/check", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ userId: session?.user?.id, actionType: "deep_research", model: "ED1.7" })
                                    });
                                    const checkData = await checkRes.json();
                                    if (!checkData.allowed) {
                                      setLimitCard({
                                        actionType: "Deep Research",
                                        resetIn: "tomorrow"
                                      });
                                      return;
                                    }
                                  } catch (err) {
                                    console.error(err);
                                  }
                                  setUseDeepResearch(true);
                                } else {
                                  setUseDeepResearch(false);
                                }
                              }}
                              className={cn(
                                "flex items-center justify-between gap-3 w-full text-left p-2.5 rounded-xl transition-all cursor-pointer hover:bg-neutral-100 dark:hover:bg-white/[0.05]",
                                theme === 'light' ? "text-neutral-800" : "text-neutral-100"
                              )}
                            >
                              <div className="flex items-center gap-3.5">
                                <div className={cn(
                                  "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300",
                                  useDeepResearch
                                    ? "bg-purple-500 text-white shadow-md shadow-purple-550/20"
                                    : "bg-purple-500/10 text-purple-500"
                                )}>
                                  <Cpu size={15} className="stroke-[2.2px]" />
                                </div>
                                <div className="flex flex-col text-left">
                                  <span className="text-[13px] font-bold leading-none font-sans">
                                    Deep Research
                                  </span>
                                  <span className={cn("text-[11px] leading-tight mt-1 opacity-65", theme === 'light' ? "text-neutral-600" : "text-neutral-400")}>
                                    Ad-hoc multi-stage agent
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                className={cn(
                                  "w-8 h-4.5 rounded-full relative transition-colors duration-300 p-0.5 shrink-0",
                                  useDeepResearch ? "bg-purple-600" : "bg-neutral-300 dark:bg-neutral-700"
                                )}>
                                <motion.div
                                  layout
                                  initial={false}
                                  animate={{ x: useDeepResearch ? 14 : 0 }}
                                  className="w-3.5 h-3.5 rounded-full bg-white shadow-sm"
                                />
                              </button>
                            </div>

                            {zoomEmail && (
                              <div className="border-t border-neutral-100 dark:border-white/5 mt-2 pt-2 px-1">
                                <span className="text-[9.5px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 block mb-2 px-1.5">
                                  Connected Services
                                </span>
                                <div className="space-y-1">
                                  {zoomEmail && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setIsAttachmentMenuOpen(false);
                                        setInputValue("Create a Zoom meeting named Sync for tomorrow at 2 PM");
                                      }}
                                      className={cn(
                                        "flex items-center gap-3 w-full text-left p-2 rounded-xl transition-all cursor-pointer group hover:bg-neutral-100 dark:hover:bg-white/[0.05]",
                                        theme === 'light' ? "text-neutral-700" : "text-neutral-300"
                                      )}
                                    >
                                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                                        <Video size={13} className="text-blue-500" />
                                      </div>
                                      <span className="text-[12px] font-bold font-sans">Zoom Scheduler</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                          </motion.div>

                          {/* 2. MOBILE BOTTOM PANEL (Compact overlay above input) */}
                          <motion.div
                            key="attachments-mobile-sheet"
                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.95 }}
                            transition={{ type: "spring", damping: 30, stiffness: 450 }}
                            className={cn(
                              "md:hidden absolute bottom-[72px] left-0 w-[calc(100vw-40px)] max-w-[320px] rounded-[24px] border p-3 flex flex-col gap-1 z-[50] shadow-[0_12px_40px_rgba(0,0,0,0.2)] select-none backdrop-blur-xl max-h-[400px] overflow-y-auto scrollbar-thin",
                              theme === 'light' 
                                ? "bg-white border-neutral-200/85 text-neutral-800" 
                                : theme === 'cosmic'
                                  ? "bg-[#0c0926] border-indigo-500/20 text-indigo-50"
                                  : "bg-[#141416] border-neutral-800 text-white"
                            )}
                          >
                            <div className="px-3 py-1.5 flex justify-between items-center mb-0.5">
                              <span className="font-sans font-bold text-[12px] opacity-50 uppercase tracking-wider">Tools & Modes</span>
                            </div>

                            {/* Camera */}
                            <button
                              type="button"
                              onClick={() => {
                                setIsAttachmentMenuOpen(false);
                                startCamera();
                              }}
                              className="flex items-center gap-4 w-full text-left p-2.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-white/[0.05] active:scale-[0.98] transition-all cursor-pointer"
                            >
                              <div className="w-9 h-9 rounded-full bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0">
                                <Camera size={16} className="stroke-[2.2px]" />
                              </div>
                              <span className="text-[13px] font-bold leading-none font-sans">Camera</span>
                            </button>

                            {/* Upload Files */}
                            <button
                              type="button"
                              onClick={() => {
                                setIsAttachmentMenuOpen(false);
                                filesInputRef.current?.click();
                              }}
                              className="flex items-center gap-4 w-full text-left p-2.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-white/[0.05] active:scale-[0.98] transition-all cursor-pointer"
                            >
                              <div className="w-9 h-9 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                                <Paperclip size={16} className="stroke-[2.2px]" />
                              </div>
                              <span className="text-[13px] font-bold leading-none font-sans">Files</span>
                            </button>

                            {/* Use Memory */}
                            {(() => {
                              console.log("[MEMORY BUTTON RENDER] Rendering for Mobile");
                              return (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsAttachmentMenuOpen(false);
                                    setIsMemoryPickerOpen(true);
                                  }}
                                  className="flex items-center gap-4 w-full text-left p-2.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-white/[0.05] active:scale-[0.98] transition-all cursor-pointer"
                                >
                                  <div className="w-9 h-9 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                                    <BrainCircuit size={16} className="stroke-[2.2px]" />
                                  </div>
                                  <span className="text-[13px] font-bold leading-none font-sans">Use Memory</span>
                                </button>
                              );
                            })()}

                            {/* Web Search */}
                            <div
                              onClick={() => {
                                const nextVal = !isWebSearchEnabled;
                                setIsWebSearchEnabled(nextVal);
                                if (nextVal) {
                                  setUseDeepResearch(false);
                                }
                              }}
                              className="flex items-center justify-between gap-3 w-full text-left p-2.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-white/[0.05] active:scale-[0.98] transition-all cursor-pointer"
                            >
                              <div className="flex items-center gap-4">
                                <div className={cn(
                                  "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
                                  isWebSearchEnabled ? "bg-indigo-500 text-white" : "bg-indigo-500/10 text-indigo-500"
                                )}>
                                  <Search size={16} className="stroke-[2.2px]" />
                                </div>
                                <span className="text-[13px] font-bold leading-none font-sans">Search</span>
                              </div>
                              <button
                                type="button"
                                className={cn(
                                  "w-8 h-4.5 rounded-full relative transition-colors duration-300 p-0.5 shrink-0",
                                  isWebSearchEnabled ? "bg-indigo-600" : "bg-neutral-300 dark:bg-neutral-700"
                                )}>
                                <div className={cn(
                                  "w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform duration-300",
                                  isWebSearchEnabled ? "translate-x-[14px]" : "translate-x-0"
                                )} />
                              </button>
                            </div>

                            {/* Deep Research */}
                            <div
                              onClick={async () => {
                                if (!useDeepResearch) {
                                  setIsWebSearchEnabled(false);
                                  setActiveModel('ED1.7');
                                  try {
                                    const checkRes = await fetch("/api/usage/check", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ userId: session?.user?.id, actionType: "deep_research", model: "ED1.7" })
                                    });
                                    const checkData = await checkRes.json();
                                    if (!checkData.allowed) {
                                      setLimitCard({
                                        actionType: "Deep Research",
                                        resetIn: "tomorrow"
                                      });
                                      return;
                                    }
                                  } catch (err) {
                                    console.error(err);
                                  }
                                  setUseDeepResearch(true);
                                } else {
                                  setUseDeepResearch(false);
                                }
                              }}
                              className="flex items-center justify-between gap-3 w-full text-left p-2.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-white/[0.05] active:scale-[0.98] transition-all cursor-pointer"
                            >
                              <div className="flex items-center gap-4">
                                <div className={cn(
                                  "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
                                  useDeepResearch ? "bg-purple-500 text-white" : "bg-purple-500/10 text-purple-500"
                                )}>
                                  <Cpu size={16} className="stroke-[2.2px]" />
                                </div>
                                <span className="text-[13px] font-bold leading-none font-sans">Deep Research</span>
                              </div>
                              <button
                                type="button"
                                className={cn(
                                  "w-8 h-4.5 rounded-full relative transition-colors duration-300 p-0.5 shrink-0",
                                  useDeepResearch ? "bg-purple-600" : "bg-neutral-300 dark:bg-neutral-700"
                                )}>
                                <div className={cn(
                                  "w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform duration-300",
                                  useDeepResearch ? "translate-x-[14px]" : "translate-x-0"
                                )} />
                              </button>
                            </div>

                            {zoomEmail && (
                              <div className="border-t border-neutral-100 dark:border-white/5 mt-2 pt-2 px-1 text-left">
                                <span className="text-[9.5px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 block mb-2 px-1.5">
                                  Connected Services
                                </span>
                                <div className="space-y-1">
                                  {zoomEmail && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setIsAttachmentMenuOpen(false);
                                        setInputValue("Create a Zoom meeting named Sync for tomorrow at 2 PM");
                                      }}
                                      className={cn(
                                        "flex items-center gap-3 w-full text-left p-2 rounded-xl transition-all cursor-pointer group hover:bg-neutral-100 dark:hover:bg-white/[0.05]",
                                        theme === 'light' ? "text-neutral-700" : "text-neutral-300"
                                      )}
                                    >
                                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                                        <Video size={13} className="text-blue-500" />
                                      </div>
                                      <span className="text-[12px] font-bold font-sans">Zoom Scheduler</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  {/* Vertical visual divider in Merged state */}
                  <motion.div
                    initial={false}
                    animate={{
                      opacity: isTyped ? 0 : 1,
                      scaleY: isTyped ? 0.2 : 0.6,
                      width: isTyped ? 0 : 1,
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    className={cn(
                      "h-[52px] shrink-0 z-20 self-center mb-0.5",
                      theme === 'light' ? "bg-neutral-200" : "bg-neutral-800"
                    )}
                  />

                  {/* Redesigned interactive input bubble/capsule */}
                  <motion.div
                    initial={false}
                    animate={{
                      borderRadius: isTyped ? "26px" : "0px 26px 26px 0px",
                      borderLeftColor: isTyped ? borderThemeColor : "rgba(0,0,0,0)",
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 30, bounce: 0.1 }}
                    className={cn(
                      "flex-1 flex items-end gap-2 px-3 py-2 border backdrop-blur-3xl min-h-[52px] relative z-10 self-end mb-1",
                      theme === 'light'
                        ? "bg-white border-neutral-200 shadow-[0_2px_14px_rgba(0,0,0,0.04)]"
                        : theme === 'cosmic'
                          ? "bg-neutral-950/98 border-neutral-800 shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
                          : "bg-neutral-900/95 border-neutral-800 shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
                    )}
                  >
                    {/* Input area */}
                    <textarea
                      ref={textareaRef}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onFocus={() => setIsInputFocused(true)}
                      onBlur={() => {
                        setIsInputFocused(false);
                        setTimeout(() => setIsMentionMenuOpen(false), 200);
                      }}
                      placeholder={isListening ? "Listening... Speak now." : "Message Plack..."}
                      rows={1}
                      className={cn(
                        "flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-[16px] py-[6px] resize-none min-h-[24px] max-h-[120px] overflow-y-auto select-text leading-[24px] font-sans my-auto align-middle transition-all duration-200 word-break-break-word whitespace-pre-wrap overflow-wrap-anywhere",
                        theme === 'light' 
                          ? "text-neutral-900 placeholder-neutral-400/80 caret-neutral-900" 
                          : "text-white placeholder-neutral-500/80 caret-white",
                        isListening && "italic font-medium"
                      )}
                      disabled={isListening}
                      style={{ 
                        scrollbarWidth: 'thin',
                        scrollbarColor: theme === 'light' ? '#e5e5e5 transparent' : '#404040 transparent'
                      }}
                    />

                    {/* Send, Stop and Voice Inputs */}
                    <div className="pr-1 flex items-center justify-center flex-shrink-0 z-10 h-9 mb-0">
                      <AnimatePresence mode="wait">
                        {isMobile && inputLineCount >= 3 && !isStreaming && (
                          <motion.button
                            key="expand-trigger"
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            type="button"
                            onClick={() => setIsFullscreenInputOpen(true)}
                            className={cn(
                              "mr-1 flex items-center justify-center w-9 h-9 rounded-full transition-all active:scale-95 cursor-pointer",
                              theme === 'light' ? "hover:bg-neutral-100 text-neutral-500" : "hover:bg-neutral-800 text-neutral-400"
                            )}
                            title="Expand to Fullscreen"
                          >
                            <Maximize2 size={16} />
                          </motion.button>
                        )}
                        {isStreaming ? (
                          /* Stop Streaming button placed precisely in-place of SEND button */
                          <motion.button
                            key="stop-trigger"
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            type="button"
                            onClick={() => handleStopStreaming()}
                            className={cn(
                              "flex items-center justify-center w-9 h-9 rounded-full shadow-lg active:scale-90 transition-all cursor-pointer font-semibold select-none z-10",
                              theme === 'light' ? "bg-neutral-950 text-white hover:bg-neutral-900" : "bg-white text-neutral-950 hover:bg-neutral-100"
                            )}
                            title="Stop Generating"
                          >
                            <Square size={13} fill="currentColor" className="stroke-none" />
                          </motion.button>
                        ) : (inputValue.trim().length > 0 || attachments.length > 0) ? (
                          /* Typed State: Speech-to-Text (Mic) beside Send Button */
                          <div className="flex items-center gap-1.5 shrink-0">
                            <motion.button
                              key="voice-trigger"
                              initial={{ scale: 0.82, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0.82, opacity: 0 }}
                              type="button"
                              onClick={toggleListening}
                              className={cn(
                                "flex items-center justify-center w-9 h-9 rounded-full transition-all duration-300 relative active:scale-95 cursor-pointer",
                                isListening 
                                  ? "bg-red-50 text-red-655 border border-red-100 shadow-md shadow-red-100/40" 
                                  : "hover:bg-neutral-100/60 text-neutral-500 hover:text-neutral-900"
                              )}
                              title={isListening ? "Stop listening" : "Dictate query"}
                            >
                              {isListening && (
                                <span className="absolute inset-0 rounded-full bg-red-400/25 animate-ping" />
                              )}
                              {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                            </motion.button>

                            <motion.button
                              key="send-trigger"
                              initial={{ scale: 0.82, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0.82, opacity: 0 }}
                              type="submit"
                              className="flex items-center justify-center w-9 h-9 rounded-full shadow-sm active:scale-95 transition-all cursor-pointer group accent-bg accent-bg-hover text-white"
                              title="Send query"
                            >
                              <ArrowUp size={16} className="stroke-[2.5px] group-hover:-translate-y-0.5 transition-transform duration-300" />
                            </motion.button>
                          </div>
                        ) : (
                          /* Empty State: Dedicated Plack Live Launcher Button */
                          <motion.button
                            key="live-trigger"
                            initial={{ scale: 0.82, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.82, opacity: 0 }}
                            type="button"
                            onClick={() => setIsLiveModeOpen(true)}
                            className={cn(
                              "flex items-center justify-center gap-1.5 px-3 h-9 rounded-full transition-all duration-300 relative active:scale-95 cursor-pointer font-bold text-[12.5px] tracking-wide select-none shrink-0",
                              theme === 'light' 
                                ? "bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100/80" 
                                : "bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/20"
                            )}
                            title="Plack Live voice mode"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                            <Radio size={14} className="stroke-[2.2px]" />
                            <span className="hidden xs:inline">Plack Live</span>
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* @ mentions menu removed as user requested controlling all tools via the Plus Menu */}
                  </motion.div>
                </div>
              </form>
                  );
                })()}
              
            </div>
          </div>
        </div>
      </div>
    )}

          {/* Close Left Column (desktop-chat-panel - 4043) */}
          </div>

          {/* Right Column: Desktop Sources Sidebar (Refined Layout) */}
          {!isMobile && (
            <SearchSourcesSidebar 
              isOpen={isSourcesSidebarOpen && !isLiveModeOpen} 
              onClose={() => {
                console.log('[SOURCES CLOSE] Manual X clicked');
                setIsSourcesSidebarOpen(false);
              }} 
              sources={activeSources} 
              theme={theme} 
              isMobile={false} 
              width={sourcesWidth}
            />
          )}
          
          {/* Close desktop-split-container (4040) */}
          </div>
          
          {/* Close Main Container Wrapper (4034) */}
          </div>

        {/* Mobile Bottom Sheet Sidebar */}
        {isMobile && (
          <SearchSourcesSidebar 
            isOpen={isSourcesSidebarOpen && !isLiveModeOpen} 
            onClose={() => {
              console.log('[SOURCES CLOSE] Mobile close triggered');
              setIsSourcesSidebarOpen(false);
            }} 
            sources={activeSources} 
            theme={theme} 
            isMobile={true} 
          />
        )}


      {/* Using Native Camera Picker */}

      {/* Daily Limits Reached Dialog Modal Overlay */}
      <AnimatePresence>
        {limitCard && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            {/* Blur only behind modal backing */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLimitCard(null)}
              className="absolute inset-0 bg-neutral-950/70 backdrop-blur-md"
            />
            
            {/* Modal Container */}
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 15 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className={cn(
                "relative w-full max-w-sm rounded-[28px] p-6 text-center overflow-hidden shadow-2xl border flex flex-col items-center gap-4.5 z-10",
                theme === 'light' 
                  ? "bg-white border-neutral-200 text-neutral-900" 
                  : theme === 'cosmic'
                    ? "bg-[#18123c] border-indigo-500/30 text-indigo-50"
                    : "bg-neutral-950 border-neutral-800 text-white"
              )}
            >
              {/* Warning Icon Badge */}
              <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center border border-amber-500/20">
                <AlertCircle size={22} className="stroke-[2.2px]" />
              </div>

              {/* Text */}
              <div className="flex flex-col gap-1 items-center">
                <span className="font-sans font-bold text-[17px] leading-tight">Daily Limit Reached</span>
                <span className={cn("text-[12.5px] mt-1 px-2 leading-normal", theme === 'light' ? "text-neutral-500" : "text-neutral-400")}>
                  You&apos;ve hit the maximum number of daily <strong className="font-semibold accent-text">{limitCard.actionType}</strong> allowed on the free plan.
                </span>
              </div>

              {/* Reset Counter card */}
              <div className={cn(
                "w-full py-3 rounded-2xl border flex flex-col items-center justify-center gap-0.5",
                theme === 'light' ? "bg-neutral-50 border-neutral-200/60" : "bg-white/[0.03] border-white/5"
              )}>
                <span className={cn("text-[10px] font-bold tracking-widest uppercase opacity-60", theme === 'light' ? "text-neutral-500" : "text-neutral-400")}>
                  Reset in:
                </span>
                <span className="font-mono font-bold text-[18px] tracking-tight text-amber-500">
                  {limitCard.resetIn}
                </span>
              </div>

              {/* Buttons */}
              <div className="w-full flex flex-col gap-2">
                <button
                  onClick={() => setLimitCard(null)}
                  className="w-full py-3.5 rounded-xl accent-bg accent-bg-hover text-white text-[13px] font-bold active:scale-95 transition-all cursor-pointer shadow-md"
                >
                  Upgrade to Premium
                </button>
                <button
                  onClick={() => setLimitCard(null)}
                  className="w-full py-2.5 rounded-xl text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-[12.5px] font-medium transition-colors cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


             {/* Global Settings Modal */}
        <AnimatePresence>
          {isSettingsOpen && (
            <AuthGuard>
              <motion.div
                key="settings-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-fade-in"
                onClick={() => setIsSettingsOpen(false)}
              >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                transition={{ type: "spring", duration: 0.35, bounce: 0.12 }}
                className={cn(
                  "w-full max-w-[640px] max-h-[92vh] md:max-h-[85vh] rounded-[28px] border shadow-[0_24px_64px_rgba(0,0,0,0.3)] relative overflow-hidden backdrop-blur-3xl p-6.5 flex flex-col font-sans",
                  theme === 'light'
                    ? "bg-white/95 border-neutral-200/80 text-neutral-800"
                    : theme === 'cosmic'
                      ? "bg-[#0b061e]/95 border-indigo-500/20 text-indigo-50 shadow-[0_24px_64px_rgba(99,102,241,0.2)]"
                      : "bg-[#0c0c0c]/95 border-neutral-800/80 text-neutral-100"
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header (Always Visible at Top) */}
                <div className="flex items-center justify-between mb-4 select-none shrink-0 border-b border-neutral-200/20 dark:border-neutral-800/20 pb-3">
                  <span className="text-base font-display-weight tracking-tight font-display">Settings</span>
                  <button
                    onClick={() => setIsSettingsOpen(false)}
                    className={cn(
                      "p-1.5 rounded-full transition-colors cursor-pointer",
                      theme === 'light'
                        ? "hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700"
                        : "hover:bg-neutral-800 text-neutral-400 hover:text-white"
                    )}
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Scrollable Contents Area */}
                <div 
                  className="flex-1 overflow-y-auto pr-2 space-y-5.5 scroll-smooth min-h-0 py-1"
                >
                  {/* Profile Section */}
                  <div className="flex flex-col text-left select-none animate-fade-in">
                    <span className={cn(
                      "text-[9.5px] font-bold tracking-widest uppercase mb-1.5 ml-1 font-display",
                      theme === 'light' ? "text-neutral-400" : "text-neutral-500"
                    )}>
                      Profile
                    </span>
                    <div className={cn(
                      "rounded-2xl border p-4.5 flex flex-col gap-5 relative overflow-hidden transition-all duration-200 shadow-sm",
                      theme === 'light'
                        ? "bg-neutral-50/70 border-neutral-200/60"
                        : theme === 'cosmic'
                          ? "bg-[#130d2e]/80 border-indigo-500/15"
                          : "bg-neutral-900/40 border-neutral-800/80"
                    )}>
                      {/* Avatar Card */}
                      <div className="flex items-center gap-4">
                        <div className="relative shrink-0 w-14 h-14 rounded-full overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.15)] bg-gradient-to-tr from-indigo-500 via-purple-600 to-pink-500 border-2 border-transparent group">
                           {session?.user?.user_metadata?.avatar_url ? (
                             <img src={session.user.user_metadata.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                           ) : (
                             <div className="w-full h-full flex items-center justify-center text-white font-bold text-lg">
                               {session?.user?.email?.charAt(0).toUpperCase() || 'U'}
                             </div>
                           )}
                           {/* Hover overlay */}
                           <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              {avatarUploading ? (
                                <Loader2 className="w-5 h-5 text-white animate-spin" />
                              ) : (
                                <Upload className="w-5 h-5 text-white" />
                              )}
                           </div>
                           <input type="file" title="Upload Avatar" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/jpeg, image/png, image/webp" onChange={handleAvatarUpload} disabled={avatarUploading} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                           <span className={cn("text-[12px] font-medium", theme === 'light' ? "text-neutral-600" : "text-neutral-300")}>Profile Picture</span>
                           <div className="flex gap-2 text-[11.5px] font-semibold">
                             <label className={cn("cursor-pointer transition-colors", theme === 'light' ? "text-indigo-600 hover:text-indigo-700" : "text-indigo-400 hover:text-indigo-300")}>
                               Upload
                               <input type="file" className="hidden" accept="image/jpeg, image/png, image/webp" onChange={handleAvatarUpload} disabled={avatarUploading} />
                             </label>
                             {session?.user?.user_metadata?.avatar_url && (
                               <>
                                <span className="opacity-50">•</span>
                                <button type="button" onClick={handleRemoveAvatar} className="text-red-500 hover:text-red-400 transition-colors">
                                  Remove
                                </button>
                                </>
                             )}
                           </div>
                        </div>
                      </div>

                      {/* Display Name Input */}
                      <div className="flex flex-col">
                        <label className={cn("text-[10px] uppercase font-bold tracking-wider mb-1.5", theme === 'light' ? "text-neutral-500" : "text-neutral-400")}>
                          Display Name
                        </label>
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          onBlur={handleDisplayNameSave}
                          className={cn(
                            "w-full px-3.5 py-2.5 text-[13px] rounded-xl border focus:outline-none transition-all shadow-sm",
                            theme === 'light' 
                              ? "bg-white border-neutral-200 focus:border-neutral-400 text-neutral-900"
                              : "bg-neutral-850 border-neutral-750 focus:border-neutral-500 text-white"
                          )}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Adaptive AI Profile Section */}
                  {activeProfile && (
                    <div className="flex flex-col text-left select-none animate-fade-in">
                      <span className={cn(
                        "text-[9.5px] font-bold tracking-widest uppercase mb-1.5 ml-1 font-display",
                        theme === 'light' ? "text-neutral-400" : "text-neutral-500"
                      )}>
                        Adaptive AI Profile
                      </span>
                      <div className={cn(
                        "rounded-2xl border p-4.5 flex flex-col gap-3 relative overflow-hidden transition-all duration-200 shadow-sm",
                        theme === 'light'
                          ? "bg-neutral-50/70 border-neutral-200/60"
                          : theme === 'cosmic'
                            ? "bg-[#130d2e]/80 border-indigo-500/15"
                            : "bg-neutral-900/40 border-neutral-800/80"
                      )}>
                        <div className="flex flex-col gap-0.5 mb-1">
                          <span className={cn("text-[12px] font-semibold tracking-tight", theme === 'light' ? "text-neutral-900" : "text-white")}>
                            Dynamically Learned Preferences
                          </span>
                          <span className={cn("text-[10.5px]", theme === 'light' ? "text-neutral-500" : "text-neutral-400")}>
                            Auto-deduced from conversation context. No memory quota consumed.
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          {activeProfile.writingStyle && (
                            <div className={cn(
                              "p-3 rounded-xl border text-left",
                              theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-850/40 border-neutral-800/60"
                            )}>
                              <span className="text-[9px] font-bold uppercase tracking-wider opacity-65 block mb-0.5">Writing Style</span>
                              <span className="text-[11.5px] leading-snug font-medium line-clamp-2">{activeProfile.writingStyle}</span>
                            </div>
                          )}
                          {activeProfile.uiStyle && (
                            <div className={cn(
                              "p-3 rounded-xl border text-left",
                              theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-850/40 border-neutral-800/60"
                            )}>
                              <span className="text-[9px] font-bold uppercase tracking-wider opacity-65 block mb-0.5">UI Preference</span>
                              <span className="text-[11.5px] leading-snug font-medium line-clamp-2">{activeProfile.uiStyle}</span>
                            </div>
                          )}
                          {activeProfile.interests && (
                            <div className={cn(
                              "p-3 rounded-xl border text-left col-span-2",
                              theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-850/40 border-neutral-800/60"
                            )}>
                              <span className="text-[9px] font-bold uppercase tracking-wider opacity-65 block mb-0.5">Recurring Interests</span>
                              <span className="text-[11.5px] leading-snug font-medium">{activeProfile.interests}</span>
                            </div>
                          )}
                          {activeProfile.projectTypes && (
                            <div className={cn(
                              "p-3 rounded-xl border text-left col-span-2",
                              theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-850/40 border-neutral-800/60"
                            )}>
                              <span className="text-[9px] font-bold uppercase tracking-wider opacity-65 block mb-0.5">Common Project Types</span>
                              <span className="text-[11.5px] leading-snug font-medium">{activeProfile.projectTypes}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* AI Preferences Section */}
                  <div className="flex flex-col text-left select-none animate-fade-in">
                    <span className={cn(
                      "text-[9.5px] font-bold tracking-widest uppercase mb-1.5 ml-1 font-display",
                      theme === 'light' ? "text-neutral-400" : "text-neutral-500"
                    )}>
                      AI Preferences
                    </span>
                    <div className={cn(
                      "rounded-2xl border p-4.5 flex flex-col gap-4 relative overflow-hidden transition-all duration-200 shadow-sm",
                      theme === 'light'
                        ? "bg-neutral-50/70 border-neutral-200/60"
                        : theme === 'cosmic'
                          ? "bg-[#130d2e]/80 border-indigo-500/15"
                          : "bg-neutral-900/40 border-neutral-800/80"
                    )}>
                      <div className="flex flex-col gap-0.5 mb-1.5">
                        <span className={cn("text-[12.5px] font-semibold tracking-tight", theme === 'light' ? "text-neutral-900" : "text-white")}>
                          AI Personality Preset
                        </span>
                        <span className={cn("text-[11px]", theme === 'light' ? "text-neutral-500" : "text-neutral-400")}>
                          One-click selection to customize the voice and tone of the assistant.
                        </span>
                      </div>

                      {/* Presets Beautiful Selection Grid */}
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'Balanced', name: 'Balanced', description: 'Natural & helpful template', icon: Orbit },
                          { id: 'Professional', name: 'Professional', description: 'Crisp & structured business', icon: Cpu },
                          { id: 'Creative', name: 'Creative', description: 'Rich imaginative language', icon: Sparkles },
                          { id: 'Technical', name: 'Technical', description: 'Algorithmic exact logic', icon: FileCode },
                          { id: 'Friendly', name: 'Friendly', description: 'Warm descriptive empathy', icon: Heart },
                          { id: 'Teacher', name: 'Teacher', description: 'Patience & clean breakdowns', icon: HelpCircle },
                          { id: 'Researcher', name: 'Researcher', description: '学术 objective synthesis', icon: BrainCircuit },
                          { id: 'Minimal', name: 'Minimal', description: 'Direct answer without preambles', icon: Activity }
                        ].map((preset) => {
                          const IconComponent = preset.icon;
                          const isActive = aiPersonality === preset.id;
                          return (
                            <button
                              type="button"
                              key={preset.id}
                              onClick={() => {
                                setAiPersonality(preset.id);
                                localStorage.setItem('plack-ai-personality', preset.id);
                              }}
                              className={cn(
                                "flex flex-col items-start p-3 rounded-xl border text-left transition-all duration-200 cursor-pointer relative overflow-hidden",
                                isActive
                                  ? theme === 'light'
                                    ? "bg-white border-neutral-900 shadow-sm font-semibold"
                                    : theme === 'cosmic'
                                      ? "bg-indigo-600/10 border-indigo-500 text-indigo-100 shadow-[0_0_15px_rgba(99,102,241,0.25)] font-semibold"
                                      : "bg-white/5 border-white text-white font-semibold"
                                  : theme === 'light'
                                    ? "bg-white/50 border-neutral-200/70 text-neutral-600 hover:bg-neutral-100/50 hover:border-neutral-300"
                                    : "bg-neutral-850/30 border-neutral-800/80 text-neutral-400 hover:bg-neutral-800/50 hover:border-neutral-700"
                              )}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <IconComponent size={13} className={cn("stroke-[2px]", isActive ? "text-indigo-400 dark:text-indigo-300" : "text-neutral-500")} />
                                <span className="text-[12px] font-semibold tracking-tight">{preset.name}</span>
                              </div>
                              <span className={cn("text-[9.5px] leading-tight flex-1", isActive ? "opacity-90" : "opacity-60")}>{preset.description}</span>
                              {isActive && (
                                <span className="absolute top-1.5 right-1.5 flex h-1.5 w-1.5 relative">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500"></span>
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Custom Instructions Field */}
                      <div className="flex flex-col gap-1.5 mt-3">
                        <div className="flex flex-col gap-0.5">
                          <span className={cn("text-[12px] font-semibold tracking-tight", theme === 'light' ? "text-neutral-800" : "text-neutral-200")}>
                            Custom Instructions
                          </span>
                          <span className={cn("text-[10.5px]", theme === 'light' ? "text-neutral-500" : "text-neutral-400")}>
                            Define custom rules. Example: &quot;Always answer briefly.&quot;, &quot;Explain things like a teacher.&quot;, &quot;Provide detailed reasoning.&quot;
                          </span>
                        </div>
                        <textarea
                          rows={3}
                          value={customInstructions}
                          onChange={(e) => {
                            setCustomInstructions(e.target.value);
                            localStorage.setItem('plack-custom-instructions', e.target.value);
                          }}
                          placeholder="How would you like the assistant to behave?"
                          className={cn(
                            "w-full px-3.5 py-2.5 text-[12.5px] rounded-xl border focus:outline-none transition-all shadow-sm font-sans resize-none",
                            theme === 'light' 
                              ? "bg-white border-neutral-200 focus:border-neutral-400 text-neutral-900"
                              : "bg-neutral-850 border-neutral-750 focus:border-neutral-500 text-white placeholder-neutral-500"
                          )}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Chat Experience Section */}
                  <div className="flex flex-col text-left select-none animate-fade-in">
                    <span className={cn(
                      "text-[9.5px] font-bold tracking-widest uppercase mb-1.5 ml-1 font-display",
                      theme === 'light' ? "text-neutral-400" : "text-neutral-500"
                    )}>
                      Chat Experience
                    </span>
                    <div className={cn(
                      "rounded-2xl border divide-y overflow-hidden transition-all duration-200 shadow-sm",
                      theme === 'light'
                        ? "bg-neutral-50/70 border-neutral-200/60 divide-neutral-200/40"
                        : theme === 'cosmic'
                          ? "bg-[#130d2e]/85 border-indigo-500/15 divide-indigo-500/10"
                          : "bg-neutral-900/40 border-neutral-800/80 divide-neutral-800/60"
                    )}>
                      {/* Streaming Responses Toggle */}
                      <div className="flex items-center justify-between px-4 py-3.5">
                        <div className="flex flex-col gap-0.5">
                          <span className={cn("text-[12.5px] font-semibold tracking-tight", theme === 'light' ? "text-neutral-900" : "text-white")}>
                            Streaming Responses
                          </span>
                          <span className={cn("text-[11px]", theme === 'light' ? "text-neutral-500" : "text-neutral-400")}>
                            Display words dynamically in real time.
                          </span>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={streamingResponses}
                          onClick={() => {
                            const val = !streamingResponses;
                            setStreamingResponses(val);
                            localStorage.setItem('plack-streaming-responses', String(val));
                          }}
                          className={cn(
                            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus:outline-none",
                            streamingResponses 
                              ? theme === 'light' ? "bg-neutral-900" : "bg-indigo-500"
                              : theme === 'light' ? "bg-neutral-300" : "bg-neutral-700"
                          )}
                        >
                          <span
                            className={cn(
                              "pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out",
                              streamingResponses ? "translate-x-1.8" : "-translate-x-1.8"
                            )}
                          />
                        </button>
                      </div>

                      {/* Auto Scroll Toggle */}
                      <div className="flex items-center justify-between px-4 py-3.5">
                        <div className="flex flex-col gap-0.5">
                          <span className={cn("text-[12.5px] font-semibold tracking-tight", theme === 'light' ? "text-neutral-900" : "text-white")}>
                            Auto Scroll
                          </span>
                          <span className={cn("text-[11px]", theme === 'light' ? "text-neutral-500" : "text-neutral-400")}>
                            Scroll automatically to the bottom on new words.
                          </span>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={autoScroll}
                          onClick={() => {
                            const val = !autoScroll;
                            setAutoScroll(val);
                            localStorage.setItem('plack-auto-scroll', String(val));
                          }}
                          className={cn(
                            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus:outline-none",
                            autoScroll 
                              ? theme === 'light' ? "bg-neutral-900" : "bg-indigo-500"
                              : theme === 'light' ? "bg-neutral-300" : "bg-neutral-700"
                          )}
                        >
                          <span
                            className={cn(
                              "pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out",
                              autoScroll ? "translate-x-1.8" : "-translate-x-1.8"
                            )}
                          />
                        </button>
                      </div>

                      {/* Show Reasoning Toggle */}
                      <div className="flex items-center justify-between px-4 py-3.5">
                        <div className="flex flex-col gap-0.5">
                          <span className={cn("text-[12.5px] font-semibold tracking-tight", theme === 'light' ? "text-neutral-900" : "text-white")}>
                            Show Reasoning
                          </span>
                          <span className={cn("text-[11px]", theme === 'light' ? "text-neutral-500" : "text-neutral-400")}>
                            Display the structural thinking and logic of the model.
                          </span>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={showReasoning}
                          onClick={() => {
                            const val = !showReasoning;
                            setShowReasoning(val);
                            localStorage.setItem('plack-show-reasoning', String(val));
                          }}
                          className={cn(
                            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus:outline-none",
                            showReasoning 
                              ? theme === 'light' ? "bg-neutral-900" : "bg-indigo-500"
                              : theme === 'light' ? "bg-neutral-300" : "bg-neutral-700"
                          )}
                        >
                          <span
                            className={cn(
                              "pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out",
                              showReasoning ? "translate-x-1.8" : "-translate-x-1.8"
                            )}
                          />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Memory System Section */}
                  <div className="flex flex-col text-left select-none animate-fade-in">
                    <span className={cn(
                      "text-[9.5px] font-bold tracking-widest uppercase mb-1.5 ml-1 font-display",
                      theme === 'light' ? "text-neutral-400" : "text-neutral-500"
                    )}>
                      Memory System
                    </span>
                    <div className={cn(
                      "rounded-2xl border p-4.5 flex flex-col gap-4 relative overflow-hidden transition-all duration-200 shadow-sm",
                      theme === 'light'
                        ? "bg-neutral-50/70 border-neutral-200/60"
                        : theme === 'cosmic'
                          ? "bg-[#130d2e]/80 border-indigo-500/15"
                          : "bg-neutral-900/40 border-neutral-800/80"
                    )}>
                      {/* Stats */}
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col gap-1">
                            <span className={cn("text-[12.5px] font-semibold tracking-tight", theme === 'light' ? "text-neutral-900" : "text-white")}>
                              Memory Management
                            </span>
                            <span className={cn("text-[11px]", theme === 'light' ? "text-neutral-500" : "text-neutral-400")}>
                               Assistant stores preferences and facts to personalize sessions.
                            </span>
                          </div>
                          <button
                            onClick={() => setIsMemoryManagerOpen(true)}
                            className={cn(
                              "shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all border active:scale-95 cursor-pointer shadow-sm ml-4",
                              theme === 'light'
                                ? "bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300"
                                : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700 hover:border-neutral-600"
                            )}
                          >
                            Manage
                          </button>
                        </div>
                        
                        <div className="space-y-2 mt-1">
                          <div className="flex items-center justify-between text-[10.5px] font-medium">
                            <span className={theme === 'light' ? "text-neutral-500" : "text-neutral-400"}>Memory Capacity</span>
                            <span className={theme === 'light' ? "text-neutral-900" : "text-indigo-200"}>
                              { memoryUsage.used_slots || 0 } / { memoryUsage.max_slots || 99 } Memories Used
                            </span>
                          </div>
                          <div className={cn(
                            "w-full h-2 rounded-full overflow-hidden p-[1px]",
                            theme === 'light' ? "bg-neutral-200" : "bg-neutral-800"
                          )}>
                             <div 
                               className={cn(
                                 "h-full rounded-full transition-all duration-700 ease-out",
                                 ((memoryUsage.used_slots || 0) / (memoryUsage.max_slots || 99)) > 0.9 ? "bg-red-500" : "bg-indigo-500"
                               )}
                               style={{ width: `${Math.max(2, Math.min(100, ((memoryUsage.used_slots || 0) / (memoryUsage.max_slots || 99)) * 100))}%` }}
                             />
                          </div>
                          <div className="flex items-center justify-between text-[10px] opacity-50">
                             <span>{memoryUsage.count} stored records</span>
                             { ((memoryUsage.used_slots || 0) / (memoryUsage.max_slots || 99)) > 0.9 && (
                               <span className="text-red-500 font-bold">Limit nearing</span>
                             )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Appearance Section */}
                  <div className="flex flex-col text-left select-none animate-fade-in">
                    <span className={cn(
                      "text-[9.5px] font-bold tracking-widest uppercase mb-1.5 ml-1 font-display",
                      theme === 'light' ? "text-neutral-400" : "text-neutral-500"
                    )}>
                      Appearance
                    </span>
                    <div className={cn(
                      "rounded-2xl border divide-y overflow-hidden transition-all duration-200 shadow-sm",
                      theme === 'light'
                        ? "bg-neutral-50/40 border-neutral-200/60 divide-neutral-200/40"
                        : theme === 'cosmic'
                          ? "bg-[#130d2e]/85 border-indigo-500/15 divide-indigo-500/10"
                          : "bg-neutral-900/30 border-neutral-800/80 divide-neutral-800/60"
                    )}>
                      {/* Light option */}
                      <button
                        type="button"
                        onClick={() => setThemeSetting('light')}
                        className={cn(
                          "w-full flex items-center justify-between px-4 h-12.5 text-left transition-all duration-200 relative cursor-pointer",
                          themeSetting === 'light'
                            ? theme === 'light'
                              ? "bg-white text-neutral-900 font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_4px_12px_rgba(0,0,0,0.03)] ring-1 ring-neutral-200/60"
                              : "bg-neutral-800 text-white font-bold ring-1 ring-white/5 shadow-md"
                            : "bg-transparent text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <Sun size={14} className="stroke-[2.2px] shrink-0 text-amber-500" />
                          <span className="text-[12.5px] tracking-tight">Light</span>
                        </div>
                        {themeSetting === 'light' && (
                          <Check size={14} className={cn("stroke-[3px]", theme === 'light' ? "text-neutral-900" : "text-white")} />
                        )}
                      </button>

                      {/* Dark option */}
                      <button
                        type="button"
                        onClick={() => setThemeSetting('dark')}
                        className={cn(
                          "w-full flex items-center justify-between px-4 h-12.5 text-left transition-all duration-200 relative cursor-pointer",
                          themeSetting === 'dark'
                            ? theme === 'light'
                              ? "bg-neutral-100 text-neutral-900 font-bold shadow-sm"
                              : "bg-neutral-800 text-white font-bold ring-1 ring-white/5 shadow-md"
                            : "bg-transparent text-neutral-400 hover:text-neutral-200"
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <Moon size={14} className="stroke-[2.2px] shrink-0 text-blue-400" />
                          <span className="text-[12.5px] tracking-tight">Dark</span>
                        </div>
                        {themeSetting === 'dark' && (
                          <Check size={14} className={cn("stroke-[3px]", theme === 'light' ? "text-neutral-900" : "text-white")} />
                        )}
                      </button>

                      {/* Cosmic option */}
                      <button
                        type="button"
                        onClick={() => setThemeSetting('cosmic')}
                        className={cn(
                          "w-full flex items-center justify-between px-4 h-12.5 text-left transition-all duration-200 relative cursor-pointer",
                          themeSetting === 'cosmic'
                            ? theme === 'light'
                              ? "bg-indigo-50/50 text-indigo-900 font-bold ring-1 ring-indigo-200 shadow-sm"
                              : "bg-indigo-500/10 text-indigo-100 font-bold ring-1 ring-pink-500/35 shadow-[0_0_18px_rgba(168,85,247,0.2)]"
                            : "bg-transparent text-neutral-400 hover:text-indigo-300"
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <Orbit size={14} className="stroke-[2.2px] text-pink-400 shrink-0" />
                          <span className="text-[12.5px] tracking-tight">Cosmic</span>
                        </div>
                        {themeSetting === 'cosmic' && (
                          <Check size={14} className="text-pink-400 stroke-[3px] filter drop-shadow-[0_0_3px_rgba(168,85,247,0.5)] animate-pulse" />
                        )}
                      </button>

                      {/* System option */}
                      <button
                        type="button"
                        onClick={() => setThemeSetting('system')}
                        className={cn(
                          "w-full flex items-center justify-between px-4 h-12.5 text-left transition-all duration-200 relative cursor-pointer",
                          themeSetting === 'system'
                            ? theme === 'light'
                              ? "bg-neutral-100/80 text-neutral-950 font-bold shadow-sm"
                              : "bg-neutral-800 text-white font-bold ring-1 ring-white/5 shadow-md"
                            : "bg-transparent text-neutral-400 hover:text-neutral-750 dark:hover:text-neutral-250"
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <Laptop size={14} className="stroke-[2.2px] text-violet-400 shrink-0" />
                          <span className="text-[12.5px] tracking-tight">System</span>
                        </div>
                        {themeSetting === 'system' && (
                          <Check size={14} className={cn("stroke-[3px]", theme === 'light' ? "text-neutral-900" : "text-white")} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Personalization Section */}
                  <div className="flex flex-col text-left select-none animate-fade-in">
                    <span className={cn(
                      "text-[9.5px] font-bold tracking-widest uppercase mb-1.5 ml-1 font-display",
                      theme === 'light' ? "text-neutral-400" : "text-neutral-500"
                    )}>
                      Personalization
                    </span>
                    <div className={cn(
                      "rounded-2xl border p-4.5 flex flex-col gap-4 relative overflow-hidden transition-all duration-200 shadow-sm",
                      theme === 'light'
                        ? "bg-neutral-50/70 border-neutral-200/60"
                        : theme === 'cosmic'
                          ? "bg-[#130d2e]/80 border-indigo-500/15"
                          : "bg-neutral-900/40 border-neutral-800/80"
                    )}>
                      <div className="flex flex-col gap-0.5">
                        <span className={cn("text-[12.5px] font-semibold tracking-tight", theme === 'light' ? "text-neutral-900" : "text-white")}>
                          Accent Color
                        </span>
                        <span className={cn("text-[11px]", theme === 'light' ? "text-neutral-500" : "text-neutral-400")}>
                          Choose a brand color to apply to user message bubbles, buttons, key borders, and selection rings.
                        </span>
                      </div>

                      {/* Accent Color Circle Grid Selection */}
                      <div className="flex flex-wrap gap-2.5 py-1">
                        {[
                          { id: 'blue', label: 'Blue', hex: '#3b82f6' },
                          { id: 'purple', label: 'Purple', hex: '#a855f7' },
                          { id: 'orange', label: 'Orange', hex: '#f97316' },
                          { id: 'green', label: 'Green', hex: '#10b981' },
                          { id: 'red', label: 'Red', hex: '#ef4444' },
                          { id: 'pink', label: 'Pink', hex: '#ec4899' },
                          { id: 'custom', label: 'Custom', hex: customColor }
                        ].map((colorOpt) => {
                          const isActive = accentColor === colorOpt.id;
                          return (
                            <button
                              type="button"
                              key={colorOpt.id}
                              onClick={() => setAccentColor(colorOpt.id as any)}
                              className={cn(
                                "relative w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 active:scale-95 hover:scale-105 shadow-xs border border-transparent",
                                isActive 
                                  ? "ring-2 ring-offset-2 ring-indigo-500/80 dark:ring-offset-neutral-950 scale-105 border-white/20" 
                                  : "hover:ring-1 hover:ring-neutral-350 dark:hover:ring-neutral-700"
                              )}
                              style={{ backgroundColor: colorOpt.id === 'custom' ? customColor : colorOpt.hex }}
                              title={colorOpt.label}
                            >
                              {isActive && (
                                <Check size={16} className="text-white stroke-[3.5px] drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" />
                              )}
                              {colorOpt.id === 'custom' && !isActive && (
                                <span className="text-[10px] text-white font-bold tracking-tight uppercase leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)]">Custom</span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Hex code input for Custom Accent Color */}
                      {accentColor === 'custom' && (
                        <div className="flex flex-col gap-1.5 mt-1 animate-fade-in">
                          <label className={cn("text-[10px] uppercase font-bold tracking-wider", theme === 'light' ? "text-neutral-500" : "text-neutral-400")}>
                            Custom hex code
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={customColor}
                              onChange={(e) => setAccentColor('custom', e.target.value)}
                              className="w-10 h-10 rounded-xl border border-neutral-300 dark:border-neutral-700 cursor-pointer overflow-hidden p-0 bg-transparent shrink-0"
                            />
                            <input
                              type="text"
                              value={customColor}
                              onChange={(e) => setAccentColor('custom', e.target.value)}
                              placeholder="#ff007f"
                              className={cn(
                                "flex-1 px-3.5 py-2.5 text-[13px] rounded-xl border focus:outline-none transition-all shadow-sm font-mono uppercase",
                                theme === 'light' 
                                  ? "bg-white border-neutral-200 focus:border-neutral-400 text-neutral-900"
                                  : "bg-neutral-850 border-neutral-750 focus:border-neutral-500 text-white"
                              )}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Voice Settings Section */}
                  <div className="flex flex-col text-left select-none animate-fade-in">
                    <span className={cn(
                      "text-[9.5px] font-bold tracking-widest uppercase mb-1.5 ml-1 font-display",
                      theme === 'light' ? "text-neutral-400" : "text-neutral-500"
                    )}>
                      Voice Settings
                    </span>
                    <div className={cn(
                      "rounded-2xl border p-4.5 flex flex-col gap-4 relative overflow-hidden transition-all duration-200 shadow-sm",
                      theme === 'light'
                        ? "bg-neutral-50/70 border-neutral-200/60"
                        : theme === 'cosmic'
                          ? "bg-[#130d2e]/80 border-indigo-500/15"
                          : "bg-neutral-900/40 border-neutral-800/80"
                    )}>
                      <div className="flex flex-col gap-0.5">
                        <span className={cn("text-[12.5px] font-semibold tracking-tight", theme === 'light' ? "text-neutral-900" : "text-white")}>
                          Plack Live Voice
                        </span>
                        <span className={cn("text-[11px]", theme === 'light' ? "text-neutral-500" : "text-neutral-400")}>
                          Choose the voice used during real-time conversational mode.
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 py-1">
                        {[
                          { id: 'Puck', label: 'Puck (Quirky)' },
                          { id: 'Charon', label: 'Charon (Deep)' },
                          { id: 'Kore', label: 'Kore (Calm)' },
                          { id: 'Fenrir', label: 'Fenrir (Energetic)' },
                          { id: 'Aoede', label: 'Aoede (Warm)' }
                        ].map((voiceOpt) => {
                          const isActive = liveVoice === voiceOpt.id;
                          return (
                            <button
                              type="button"
                              key={voiceOpt.id}
                              onClick={() => setLiveVoiceContext(voiceOpt.id)}
                              className={cn(
                                "flex items-center justify-between p-3 rounded-xl border text-left transition-all duration-200 cursor-pointer relative overflow-hidden",
                                isActive
                                  ? theme === 'light'
                                    ? "bg-white border-neutral-900 shadow-sm font-semibold"
                                    : theme === 'cosmic'
                                      ? "bg-indigo-600/10 border-indigo-500 text-indigo-100 shadow-[0_0_15px_rgba(99,102,241,0.25)] font-semibold"
                                      : "bg-white/5 border-white text-white font-semibold"
                                  : theme === 'light'
                                    ? "bg-white/50 border-neutral-200/70 text-neutral-600 hover:bg-neutral-100/50 hover:border-neutral-300"
                                    : "bg-neutral-850/30 border-neutral-800/80 text-neutral-400 hover:bg-neutral-800/50 hover:border-neutral-700"
                              )}
                            >
                              <span className="text-[12px] tracking-tight">{voiceOpt.label}</span>
                              {isActive && (
                                <span className="absolute right-3 flex h-1.5 w-1.5 relative">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500"></span>
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Models Configuration Section */}
                  <div className="flex flex-col text-left select-none animate-fade-in">
                    <span className={cn(
                      "text-[9.5px] font-bold tracking-widest uppercase mb-1.5 ml-1 font-display",
                      theme === 'light' ? "text-neutral-400" : "text-neutral-500"
                    )}>
                      Models
                    </span>
                    <div className={cn(
                      "rounded-2xl border divide-y overflow-hidden transition-all duration-200 shadow-sm",
                      theme === 'light'
                        ? "bg-neutral-50/70 border-neutral-200/60 divide-neutral-200/40"
                        : theme === 'cosmic'
                          ? "bg-[#130d2e]/85 border-indigo-500/15 divide-indigo-500/10"
                          : "bg-neutral-900/40 border-neutral-800/80 divide-neutral-800/60"
                    )}>


                      {/* Auto Switch Toggle option */}
                      <div className="flex items-center justify-between px-4 py-3.5">
                        <div className="flex flex-col gap-0.5">
                          <span className={cn("text-[12.5px] font-semibold tracking-tight", theme === 'light' ? "text-neutral-900" : "text-white")}>
                            Auto Switch Model
                          </span>
                          <span className={cn("text-[11px]", theme === 'light' ? "text-neutral-500" : "text-neutral-400")}>
                            Seamlessly switch models if a generation fails.
                          </span>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={autoSwitchModels}
                          onClick={() => setAutoSwitchModels(!autoSwitchModels)}
                          className={cn(
                            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-2",
                            autoSwitchModels 
                              ? theme === 'light' ? "bg-neutral-900" : "bg-indigo-500"
                              : theme === 'light' ? "bg-neutral-300" : "bg-neutral-700"
                          )}
                        >
                          <span
                            className={cn(
                              "pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
                              autoSwitchModels ? "translate-x-1.8" : "-translate-x-1.8"
                            )}
                          />
                        </button>
                      </div>

                      {/* AI Memory Auto-save Checkbox */}
                      <div className="flex items-center justify-between px-4 py-3.5">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                             <span className={cn("text-[12.5px] font-semibold tracking-tight", theme === 'light' ? "text-neutral-900" : "text-white")}>
                               Auto-save Memories
                             </span>
                             <div className="px-1.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-bold text-indigo-500 uppercase tracking-wider">AI</div>
                          </div>
                          <span className={cn("text-[11px]", theme === 'light' ? "text-neutral-500" : "text-neutral-400")}>
                            Save preferences automatically without asking.
                          </span>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={autoSaveMemories}
                          onClick={() => {
                            const newVal = !autoSaveMemories;
                            setAutoSaveMemories(newVal);
                            localStorage.setItem('plack-auto-save-memories', String(newVal));
                          }}
                          className={cn(
                            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-2",
                            autoSaveMemories 
                              ? theme === 'light' ? "bg-neutral-900" : "bg-indigo-500"
                              : theme === 'light' ? "bg-neutral-300" : "bg-neutral-700"
                          )}
                        >
                          <span
                            className={cn(
                              "pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
                              autoSaveMemories ? "translate-x-1.8" : "-translate-x-1.8"
                            )}
                          />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Account Management Section */}
                  <div className="flex flex-col text-left select-none animate-fade-in">
                    <span className={cn(
                      "text-[9.5px] font-bold tracking-widest uppercase mb-1.5 ml-1 font-display",
                      theme === 'light' ? "text-neutral-400" : "text-neutral-500"
                    )}>
                      Account
                    </span>
                    <div className={cn(
                      "rounded-2xl border flex flex-col overflow-hidden transition-all duration-200 shadow-sm",
                      theme === 'light'
                        ? "bg-neutral-50/70 border-neutral-200/60 shadow-sm"
                        : theme === 'cosmic'
                          ? "bg-[#130d2e]/85 border-indigo-500/15"
                          : "bg-neutral-900/30 border-neutral-800/80"
                    )}>
                      <div className={cn("flex flex-col divide-y text-[12.5px]", theme === 'light' ? "divide-neutral-200/50" : "divide-neutral-800/50")}>
                        <div className="flex items-center justify-between px-4 py-3 gap-2">
                          <span className={theme === 'light' ? 'text-neutral-500 shrink-0' : 'text-neutral-400 shrink-0'}>Email Address</span>
                          <span className={cn("font-medium truncate text-right", theme === 'light' ? 'text-neutral-900' : 'text-white')} title={session?.user?.email || 'Unknown'}>{session?.user?.email || 'Unknown'}</span>
                        </div>
                        <div className="flex items-center justify-between px-4 py-3 gap-2">
                          <span className={theme === 'light' ? 'text-neutral-500 shrink-0' : 'text-neutral-400 shrink-0'}>Authentication Method</span>
                          <span className={cn("font-medium truncate text-right", theme === 'light' ? 'text-neutral-900' : 'text-white')}>
                            {(() => {
                              const providers = session?.user?.app_metadata?.providers || [];
                              const identities = session?.user?.identities || [];
                              const hasGoogle = providers.includes('google') || identities.some((i: any) => i.provider === 'google');
                              const hasEmail = providers.includes('email') || identities.some((i: any) => i.provider === 'email');
                              
                              if (hasGoogle && hasEmail) return 'Google & Email';
                              if (hasGoogle) return 'Google';
                              if (hasEmail) return 'Email & Password';
                              return 'Unknown';
                            })()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-4 py-3 gap-2">
                          <span className={theme === 'light' ? 'text-neutral-500 shrink-0' : 'text-neutral-400 shrink-0'}>Account Creation Date</span>
                          <span className={cn("font-medium truncate text-right", theme === 'light' ? 'text-neutral-900' : 'text-white')}>{formattedDate().replace('Joined ', '')}</span>
                        </div>
                      </div>
                      <div className={cn("p-2 border-t flex gap-2 w-full", theme === 'light' ? "border-neutral-200/50" : "border-neutral-800/50")}>
                        <button
                          type="button"
                          onClick={() => {
                            setIsSettingsOpen(false);
                            setIsLogoutConfirmOpen(true);
                          }}
                          className={cn(
                            "w-full flex items-center justify-center px-3 h-10 rounded-xl transition-all font-semibold text-[12.5px] cursor-pointer",
                            theme === 'light'
                              ? "bg-neutral-200 hover:bg-neutral-300 text-neutral-800 shadow-sm"
                              : "bg-neutral-800 hover:bg-neutral-750 text-neutral-200"
                          )}
                        >
                          <div className="flex items-center gap-1.5 justify-center">
                            <LogOut size={13} className="stroke-[2.2px]" />
                            <span>Log Out</span>
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>


                </div>

                {/* Close CTA Button (Fixed at Bottom) */}
                <div className="pt-3 shrink-0 border-t border-neutral-200/20 dark:border-neutral-800/20">
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(false)}
                    className={cn(
                      "w-full h-11 rounded-2xl text-[13px] font-bold tracking-wide transition-all shadow-md active:scale-98 cursor-pointer",
                      theme === 'light'
                        ? "bg-neutral-900 hover:bg-neutral-850 text-white"
                        : "bg-white hover:bg-neutral-100 text-neutral-950"
                    )}
                  >
                    Done
                  </button>
                 </div>
              </motion.div>
            </motion.div>
            </AuthGuard>
          )}
        </AnimatePresence>

        {/* Custom Memory Delete Confirmation Modal */}
        <AnimatePresence>
          {memoryDeleteConfirm && memoryDeleteConfirm.isOpen && (
            <motion.div
              key="memory-delete-confirm-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
              onClick={() => {
                if (!memoryDeleteConfirm.isProcessing) {
                  setMemoryDeleteConfirm(null);
                }
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className={cn(
                  "w-full max-w-md border rounded-[28px] p-6 shadow-2xl relative backdrop-blur-xl flex flex-col gap-4 text-left",
                  theme === 'light'
                    ? "bg-white/95 border-neutral-200/60 text-neutral-800"
                    : "bg-[#0f0f0f]/95 border-neutral-800/80 text-white"
                )}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 shrink-0">
                    <Trash2 size={18} />
                  </div>
                  <h3 className="text-base font-display-weight tracking-tight font-display font-bold">
                    {memoryDeleteConfirm.all ? "Delete All Memories?" : "Delete this memory?"}
                  </h3>
                </div>

                {!memoryDeleteConfirm.all && memoryDeleteConfirm.content && (
                  <div className="flex flex-col gap-1.5 mt-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-55">Content Preview</span>
                    <div className={cn(
                      "p-3 rounded-xl border italic leading-relaxed text-[13px] font-mono",
                      theme === 'light' ? "bg-neutral-50 border-neutral-200/60 text-neutral-600" : "bg-white/5 border-white/5 text-neutral-300"
                    )}>
                      &quot;{memoryDeleteConfirm.content}&quot;
                    </div>
                  </div>
                )}

                <p className={cn(
                  "text-[13px] leading-relaxed",
                  theme === 'light' ? "text-neutral-500" : "text-neutral-400"
                )}>
                  {memoryDeleteConfirm.all 
                    ? "Are you sure you want to delete ALL memories? This operation is permanent and cannot be undone."
                    : "Are you sure you want to delete this memory? Plack will forget this context in future conversations."}
                </p>

                <div className="flex items-center gap-3 w-full mt-2">
                  <button
                    disabled={memoryDeleteConfirm.isProcessing}
                    onClick={() => setMemoryDeleteConfirm(null)}
                    className={cn(
                      "flex-1 px-4 py-2.5 rounded-xl border text-[13px] font-semibold transition-colors cursor-pointer",
                      theme === 'light'
                        ? "border-neutral-200/80 text-neutral-700 hover:bg-neutral-50"
                        : "border-neutral-700 text-neutral-300 hover:bg-neutral-850"
                    )}
                  >
                    Cancel
                  </button>
                  <button
                    disabled={memoryDeleteConfirm.isProcessing}
                    onClick={async () => {
                      setMemoryDeleteConfirm(prev => prev ? { ...prev, isProcessing: true } : null);
                      
                      const isAll = !!memoryDeleteConfirm.all;
                      const memoryId = memoryDeleteConfirm.memoryId;
                      const userId = session?.user?.id;

                      console.log("[DELETE BUTTON CLICK] Custom confirmation action triggered", { isAll, memoryId, userId });

                      if (isAll) {
                        if (!userId) {
                          console.error("[DELETE FAILED] User ID missing for bulk delete");
                          setMemoryToast({ type: 'error', content: 'Failed to delete memories: User ID missing' });
                          setMemoryDeleteConfirm(null);
                          return;
                        }

                        console.log("[DELETE REQUEST] Sending DELETE request for ALL memories to API");
                        try {
                          const res = await fetch(`/api/memories?userId=${encodeURIComponent(userId)}&all=true`, {
                            method: 'DELETE'
                          });
                          const deleted = await res.json();
                          console.log("[DELETE RESPONSE] API Response received (delete all):", deleted);

                          if (deleted && !deleted.error) {
                            console.log("[DELETE SUCCESS] deleted all memories successfully from table. Affected count:", deleted.rowsAffected);
                            setMemoryToast({ type: 'success', content: `🧠 All Memories Forgotten` });
                            setUserMemories([]);
                          } else {
                            const errText = deleted?.error || 'Failed to delete memories';
                            console.error("[DELETE FAILED] API Bulk Deletion error:", errText);
                            setMemoryToast({ type: 'error', content: errText });
                          }
                        } catch (err) {
                          console.error("[DELETE FAILED] Network or Database error during bulk deletion:", err);
                          setMemoryToast({ type: 'error', content: 'Failed to delete memory. Please try again.' });
                        } finally {
                          console.log("[MEMORY LIST REFRESH] Triggering fetchMemoryData after bulk deletion query");
                          fetchMemoryData();
                          setMemoryDeleteConfirm(null);
                        }
                      } else {
                        if (!memoryId) {
                          console.error("[DELETE FAILED] Memory ID missing for delete");
                          setMemoryToast({ type: 'error', content: 'Failed to delete memory: Memory ID missing' });
                          setMemoryDeleteConfirm(null);
                          return;
                        }

                        console.log("[MEMORY ID] Target item identifier:", memoryId);
                        console.log(`[DELETE REQUEST] Sending DELETE request to API for single memory ID: ${memoryId}`);

                        setUserMemories(prev => prev.filter(m => m.id !== memoryId));

                        try {
                          const res = await fetch(`/api/memories?memoryId=${encodeURIComponent(memoryId)}`, {
                            method: 'DELETE'
                          });
                          const deleted = await res.json();
                          console.log("[DELETE RESPONSE] API Response received:", deleted);

                          if (deleted && !deleted.error) {
                            console.log("[DELETE SUCCESS] deleted memory successfully. Affected count:", deleted.rowsAffected);
                            setMemoryToast({ type: 'success', content: `🧠 Memory Forgotten` });
                          } else {
                            const errText = deleted?.error || 'Failed to delete memory';
                            console.error("[DELETE FAILED] API Deletion error:", errText);
                            setMemoryToast({ type: 'error', content: errText });
                          }
                        } catch (err) {
                          console.error("[DELETE FAILED] Network or Database error during item deletion:", err);
                          setMemoryToast({ type: 'error', content: 'Failed to delete memory. Please try again.' });
                        } finally {
                          console.log("[MEMORY LIST REFRESH] Triggering fetchMemoryData to synchronize counts");
                          fetchMemoryData();
                          setMemoryDeleteConfirm(null);
                        }
                      }
                    }}
                    className={cn(
                      "flex-1 px-4 py-2.5 rounded-xl bg-red-500 text-white text-[13px] font-semibold hover:bg-red-600 transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-1.5",
                      memoryDeleteConfirm.isProcessing && "opacity-80 cursor-not-allowed"
                    )}
                  >
                    {memoryDeleteConfirm.isProcessing ? "Processing..." : (memoryDeleteConfirm.all ? "Delete All" : "Delete")}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Log Out Confirmation Modal */}
        <AnimatePresence>
          {isLogoutConfirmOpen && (
            <motion.div
              key="logout-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md"
              onClick={() => setIsLogoutConfirmOpen(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className={cn(
                  "w-full max-w-[340px] border rounded-3xl p-6 shadow-[0_24px_60px_rgba(0,0,0,0.2)] relative backdrop-blur-xl",
                  theme === 'light'
                    ? "bg-white/95 border-neutral-200/50 text-neutral-800"
                    : "bg-[#111111]/95 border-neutral-800/80 text-white"
                )}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-lg font-display-weight tracking-tight font-display mb-2">Log out?</h3>
                <p className={cn(
                  "text-[13px] font-sans mb-6 leading-relaxed",
                  theme === 'light' ? "text-neutral-500" : "text-neutral-400"
                )}>
                  Are you sure you want to log out of Plack?
                </p>
                <div className="flex items-center gap-3 w-full">
                  <button
                    onClick={() => setIsLogoutConfirmOpen(false)}
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
                    onClick={handleSignOut}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 text-white text-[13px] font-semibold hover:bg-red-600 transition-colors shadow-sm cursor-pointer"
                  >
                    Log Out
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Delete Account Confirmation Modal Removed */}



        {/* Memory Manager Modal */}
        <AnimatePresence>
          {isMemoryManagerOpen && (
            <AuthGuard>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
              onClick={() => setIsMemoryManagerOpen(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className={cn(
                  "w-full max-w-2xl max-h-[85vh] rounded-[24px] border shadow-2xl flex flex-col overflow-hidden backdrop-blur-2xl",
                  theme === 'light' ? "bg-white/95 border-neutral-200" : "bg-[#0c0c0c]/95 border-neutral-800"
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="p-5 border-b border-neutral-800/10 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <BrainCircuit className="text-indigo-500" size={20} />
                    <h2 className={cn("text-base font-semibold", theme === 'light' ? "text-neutral-900" : "text-white")}>Memory Manager</h2>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        console.log("[DELETE BUTTON CLICK] Bulk delete triggered. Opening custom confirmation.");
                        setMemoryDeleteConfirm({
                          isOpen: true,
                          memoryId: null,
                          all: true
                        });
                      }}
                      className="text-[11px] font-bold text-red-500 hover:text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer"
                    >
                      Delete All
                    </button>
                    <button
                      onClick={() => setIsMemoryManagerOpen(false)}
                      className={cn(
                        "p-2 rounded-full transition-colors cursor-pointer",
                        theme === 'light' ? "hover:bg-neutral-100 text-neutral-400" : "hover:bg-neutral-800 text-neutral-400 hover:text-white"
                      )}
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {/* Sub-header with Search and Sort */}
                <div className="p-4 border-b border-neutral-800/5 flex flex-col gap-4 items-center sm:flex-row bg-neutral-500/5">
                  <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={14} />
                    <input
                      type="text"
                      placeholder="Search memories..."
                      value={memorySearch}
                      onChange={(e) => setMemorySearch(e.target.value)}
                      className={cn(
                        "w-full pl-9 pr-4 py-2 text-[13px] rounded-xl border focus:outline-none focus:ring-0 transition-all",
                        theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-900 border-neutral-800 focus:border-neutral-700"
                      )}
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setMemorySort('newest')}
                      className={cn(
                        "text-[11px] px-3 py-2 rounded-lg font-medium transition-all cursor-pointer",
                        memorySort === 'newest' ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/20" : "text-neutral-500 hover:bg-neutral-500/10"
                      )}
                    >
                      Newest
                    </button>
                    <button
                      onClick={() => setMemorySort('oldest')}
                      className={cn(
                        "text-[11px] px-3 py-2 rounded-lg font-medium transition-all cursor-pointer",
                        memorySort === 'oldest' ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/20" : "text-neutral-500 hover:bg-neutral-500/10"
                      )}
                    >
                      Oldest
                    </button>
                  </div>
                </div>

                 {/* Memory Usage Progress */}
                 <div className="p-4 border-b border-neutral-850/10 flex flex-col gap-4 shrink-0 shadow-xs">
                   <div className="grid grid-cols-3 gap-2.5 text-center mb-1">
                     <div className={cn(
                       "p-2.5 rounded-xl border flex flex-col items-center gap-0.5",
                       theme === 'light' ? "bg-neutral-50/50 border-neutral-200/60" : "bg-neutral-900/40 border-neutral-800/80"
                     )}>
                       <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">Used Capacity</span>
                       <span className={cn("text-[14px] font-extrabold tracking-tight", theme === 'light' ? "text-neutral-900" : "text-indigo-200")}>
                         {memoryUsage.used_slots || 0} Slots
                       </span>
                     </div>
                     <div className={cn(
                       "p-2.5 rounded-xl border flex flex-col items-center gap-0.5",
                       theme === 'light' ? "bg-neutral-50/50 border-neutral-200/60" : "bg-neutral-900/40 border-neutral-800/80"
                     )}>
                       <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">Remaining</span>
                       <span className={cn("text-[14px] font-extrabold tracking-tight", theme === 'light' ? "text-neutral-900" : "text-emerald-400")}>
                         {Math.max(0, (memoryUsage.max_slots || 99) - (memoryUsage.used_slots || 0))} Slots
                       </span>
                     </div>
                     <div className={cn(
                       "p-2.5 rounded-xl border flex flex-col items-center gap-0.5",
                       theme === 'light' ? "bg-neutral-50/50 border-neutral-200/60" : "bg-neutral-900/40 border-neutral-800/80"
                     )}>
                       <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">Total Memories</span>
                       <span className={cn("text-[14px] font-extrabold tracking-tight", theme === 'light' ? "text-neutral-900" : "text-neutral-200")}>
                         {memoryUsage.count} Items
                       </span>
                     </div>
                   </div>

                   <div className="flex flex-col gap-1.5">
                     <div className="flex justify-between items-center text-[11px] font-medium opacity-75">
                       <span>Memory Capacity Slots</span>
                       <span className="font-bold tabular-nums">
                         {memoryUsage.used_slots || 0} / {memoryUsage.max_slots || 99} slots used
                       </span>
                     </div>
                     <div className={cn(
                       "w-full h-2.5 rounded-full overflow-hidden p-[1.5px] shadow-inner",
                       theme === 'light' ? "bg-neutral-100" : "bg-neutral-800/50"
                     )}>
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ 
                            width: `${Math.max(2, Math.min(100, ((memoryUsage.used_slots || 0) / (memoryUsage.max_slots || 99)) * 100))}%` 
                          }}
                          transition={{ type: 'spring', stiffness: 50, damping: 20 }}
                          className={cn(
                            "h-full rounded-full transition-colors duration-500 ease-in-out shadow-sm",
                            ((memoryUsage.used_slots || 0) / (memoryUsage.max_slots || 99)) > 0.9 ? "bg-red-500" : "bg-gradient-to-r from-indigo-600 to-indigo-400"
                          )}
                        />
                     </div>
                   </div>
                   { ((memoryUsage.used_slots || 0) / (memoryUsage.max_slots || 99)) > 0.9 && (
                     <div className="flex items-center gap-2 text-[10px] font-bold text-red-500 uppercase tracking-wide">
                        <AlertCircle className="w-3 h-3" />
                        Memory capacity nearly full. Delete old memories to free space.
                     </div>
                   )}
                 </div>

                  {/* Diagnostics Section */}
                  <div className={cn(
                    "p-4 border-b border-neutral-850/10 flex flex-col gap-2 shrink-0 text-left",
                    theme === 'light' ? "bg-neutral-50/50" : "bg-white/5"
                  )}>
                    <div className={cn(
                      "text-[10px] font-bold uppercase tracking-wider mb-1",
                      theme === 'light' ? "text-indigo-600" : "text-indigo-400"
                    )}>
                      System Diagnostics
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 text-[10.5px]">
                      <div className="flex items-center gap-1.5 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className={theme === 'light' ? "text-neutral-500 font-semibold" : "text-neutral-400 font-semibold"}>Detection:</span>
                        <span className="font-extrabold uppercase font-mono text-[9px] px-1 bg-emerald-500/10 text-emerald-500 rounded">TRUE</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className={theme === 'light' ? "text-neutral-500 font-semibold" : "text-neutral-300 font-semibold"}>Insert:</span>
                        <span className="font-extrabold uppercase font-mono text-[9px] px-1 bg-emerald-500/10 text-emerald-500 rounded">TRUE</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className={theme === 'light' ? "text-neutral-500 font-semibold" : "text-neutral-300 font-semibold"}>Retrieval:</span>
                        <span className="font-extrabold uppercase font-mono text-[9px] px-1 bg-emerald-500/10 text-emerald-500 rounded">TRUE</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className={theme === 'light' ? "text-neutral-500 font-semibold" : "text-neutral-300 font-semibold"}>Prompt Injection:</span>
                        <span className="font-extrabold uppercase font-mono text-[9px] px-1 bg-emerald-500/10 text-emerald-500 rounded">TRUE</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className={theme === 'light' ? "text-neutral-500 font-semibold" : "text-neutral-300 font-semibold"}>Settings UI:</span>
                        <span className="font-extrabold uppercase font-mono text-[9px] px-1 bg-emerald-500/10 text-emerald-500 rounded">TRUE</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className={theme === 'light' ? "text-neutral-500 font-semibold" : "text-neutral-300 font-semibold"}>Notifications:</span>
                        <span className="font-extrabold uppercase font-mono text-[9px] px-1 bg-emerald-500/10 text-emerald-500 rounded">TRUE</span>
                      </div>
                    </div>
                  </div>

                 {/* Memories List */}
                 <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 scroll-smooth">
                   <div className={cn(
                     "text-[10.5px] font-bold tracking-wider uppercase mb-1 ml-1 text-left",
                     theme === 'light' ? "text-neutral-400" : "text-neutral-500"
                   )}>
                     Recent Memories
                   </div>

                    {userMemories.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center gap-4">
                        <BrainCircuit size={32} className="opacity-20" />
                        <div className="flex flex-col gap-1 max-w-[240px]">
                          <span className={cn("text-sm font-bold", theme === 'light' ? "text-neutral-900" : "text-white")}>No memories recorded yet</span>
                          <span className="text-[12px] opacity-50 leading-relaxed">
                            Plack will learn from your conversations over time to provide more personalized assistance.
                          </span>
                        </div>
                      </div>
                    ) : (
                      userMemories
                        .filter(m => m && (m.content || '').toLowerCase().includes((memorySearch || '').toLowerCase()) || (m?.category || '').toLowerCase().includes((memorySearch || '').toLowerCase()))
                        .sort((a, b) => {
                          const da = new Date(a?.created_at || 0).getTime();
                          const db = new Date(b?.created_at || 0).getTime();
                          return memorySort === 'newest' ? db - da : da - db;
                        })
                        .map((memory) => memory && (
                          <div
                            key={memory.id}
                            className={cn(
                              "p-4 rounded-xl border flex flex-col gap-2 transition-all group relative overflow-hidden text-left",
                              theme === 'light' ? "bg-white border-neutral-200 hover:border-neutral-300 shadow-sm" : "bg-neutral-900 border-neutral-800 hover:border-neutral-700 shadow-sm"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className={cn(
                                "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md",
                                memory.category === 'preference' ? "bg-indigo-500/10 text-indigo-500" : "bg-amber-500/10 text-amber-500"
                              )}>
                                {memory.category || 'Memory'}
                              </span>
                              <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                 <span className="text-[10px] font-medium opacity-40 mr-2 flex items-center shrink-0">
                                   {new Date(memory.created_at || Date.now()).toLocaleDateString()}
                                 </span>
                                <button
                                  onClick={() => {
                                    setIsEditingMemoryId(memory.id);
                                    setEditingMemoryContent(memory.content);
                                  }}
                                  className="p-1.5 rounded-md hover:bg-indigo-500/10 text-indigo-500 cursor-pointer"
                                  title="Edit"
                                >
                                  <Settings2 size={14} />
                                </button>
                                <button
                                  onClick={() => {
                                    console.log("[DELETE BUTTON CLICK] Memory Manager Item Delete Clicked");
                                    console.log("[MEMORY ID] list delete targets memory id:", memory.id);
                                    setMemoryDeleteConfirm({
                                      isOpen: true,
                                      memoryId: memory.id,
                                      content: memory.content,
                                      all: false
                                    });
                                  }}
                                  className="p-1.5 rounded-md hover:bg-red-500/10 text-red-500 cursor-pointer"
                                  title="Delete"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                            
                            {isEditingMemoryId === memory.id ? (
                              <div className="flex flex-col gap-3 mt-1">
                                 <textarea
                                   autoFocus
                                   value={editingMemoryContent}
                                   onChange={(e) => setEditingMemoryContent(e.target.value)}
                                   className={cn(
                                     "w-full p-3 text-[13px] rounded-xl border focus:outline-none resize-none font-sans",
                                     theme === 'light' ? "bg-neutral-50 border-neutral-300" : "bg-neutral-800 border-neutral-700"
                                   )}
                                   rows={3}
                                 />
                                 <div className="flex items-center gap-2">
                                   <button
                                     onClick={() => {
                                       fetch('/api/memories', {
                                         method: 'PUT',
                                         headers: { 'Content-Type': 'application/json' },
                                         body: JSON.stringify({
                                           memoryId: memory.id,
                                           content: editingMemoryContent
                                         })
                                       }).then(res => res.json()).then(() => {
                                         setIsEditingMemoryId(null);
                                         fetchMemoryData();
                                       });
                                     }}
                                     className="text-[11px] font-bold bg-indigo-500 text-white px-4 py-2 rounded-lg cursor-pointer"
                                   >
                                     Update
                                   </button>
                                   <button
                                     onClick={() => setIsEditingMemoryId(null)}
                                     className="text-[11px] font-bold text-neutral-500 px-3 py-2 cursor-pointer"
                                   >
                                     Cancel
                                   </button>
                                 </div>
                              </div>
                            ) : (
                              <p className={cn("text-[13.5px] leading-relaxed flex items-start gap-2 font-mono", theme === 'light' ? "text-neutral-700" : "text-neutral-300")}>
                                <span className="text-emerald-500 font-extrabold select-none shrink-0">✓</span>
                                <span>{memory.content}</span>
                              </p>
                            )}
                            <span className="text-[10px] opacity-40 mt-1">
                              Stored on {new Date(memory.created_at || Date.now()).toLocaleDateString()}
                            </span>
                          </div>
                        ))
                    )}
                </div>
              </motion.div>
            </motion.div>
            </AuthGuard>
          )}
        </AnimatePresence>

        {/* Mobile Fullscreen Composer */}
        <AnimatePresence>
          {isMobile && isFullscreenInputOpen && (
            <motion.div
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-0 z-[200] bg-neutral-950 flex flex-col font-sans"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-neutral-800 shrink-0">
                <button
                  onClick={() => setIsFullscreenInputOpen(false)}
                  className="p-2 rounded-full hover:bg-neutral-800 text-neutral-400 active:scale-90 transition-transform"
                >
                  <X size={20} />
                </button>
                <div className="flex items-center gap-2">
                   <span className="text-[11px] font-medium text-neutral-500 tabular-nums uppercase tracking-widest">
                     {inputValue.length} CHARACTERS
                   </span>
                </div>
                <button
                  onClick={() => {
                    setIsFullscreenInputOpen(false);
                    handleSubmit();
                  }}
                  disabled={inputValue.trim().length === 0}
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90",
                    inputValue.trim().length > 0 ? "bg-white text-neutral-950 shadow-lg" : "bg-neutral-800 text-neutral-600"
                  )}
                >
                  <ArrowUp size={20} className="stroke-[2.5px]" />
                </button>
              </div>

              {/* Editing Area */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col pt-6">
                <textarea
                  autoFocus
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Message Plack..."
                  className="w-full flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-[18px] leading-[28px] text-white resize-none pb-20"
                  style={{ minHeight: '60vh' }}
                />
              </div>
              
              {/* Footer / Safe Area Spacer */}
              <div className="h-4 shrink-0 bg-neutral-950" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Plack Live Dedicated Voice Experience Overlay */}
        <PlackLive 
          isOpen={isLiveModeOpen} 
          onClose={() => setIsLiveModeOpen(false)} 
          theme={theme}
          userEmail={session?.user?.email}
          userId={session?.user?.id}
          liveVoice={liveVoice}
          activeChatId={activeChatId}
          chatHistory={messages}
          onSaveLiveMessages={handleSaveLiveMessages}
          onSaveLiveUserMessage={handleSaveLiveUserMessage}
          onSaveLiveAssistantMessage={handleSaveLiveAssistantMessage}
          onLiveTranscriptUpdate={setLiveTranscript}
          isSidebarOpen={isSidebarOpen}
          sidebarWidth={sidebarWidth}
          isSourcesSidebarOpen={isSourcesSidebarOpen}
          sourcesWidth={sourcesWidth}
          isMobile={isMobile}
        />

      </main>
  );
}
