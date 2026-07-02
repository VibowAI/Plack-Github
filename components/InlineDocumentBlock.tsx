'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { 
  FileText, Copy, Edit3, Check, Sparkles, Send, X, RotateCcw, RotateCw,
  CheckCircle2, Trash2, StopCircle, 
  ChevronDown, Save, Trash, Info, ChevronLeft
} from 'lucide-react';
import { cn, copyToClipboard } from '@/lib/utils';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import { debounce } from 'lodash';
import { saveDocument, DocumentRecord, getDocumentById } from '@/lib/supabase/documents';

interface InlineDocumentBlockProps {
  id?: string;
  userId?: string;
  title: string;
  content: string;
  theme: 'light' | 'dark' | 'cosmic';
  isStreaming?: boolean;
  isActiveEditor?: boolean;
  onEditorOpen?: (isOpen: boolean) => void;
  width?: number;
}

// --- Uncontrolled Editor Component ---

const UncontrolledEditor = ({ initialHtml, onChange, editorRef, className, theme }: any) => {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const refToUse = editorRef || localRef;

  return (
    <textarea
      ref={refToUse}
      value={initialHtml}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        className,
        "resize-none focus:outline-none focus:ring-0 border-none bg-transparent w-full min-h-[500px] sm:min-h-[700px] focus:ring-transparent focus:border-transparent outline-none focus:ring-offset-0 select-text cursor-text",
        theme === 'light' ? "text-neutral-700 placeholder-neutral-400" : "text-neutral-300 placeholder-neutral-600"
      )}
      placeholder="Start typing your elegant document body..."
    />
  );
};

// --- Simple Error Boundary for Editor Content ---
class EditorErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("[EDITOR RENDER ERROR]", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center gap-4">
          <div className="p-4 bg-rose-500/20 text-rose-500 rounded-full">
             <Info size={32} />
          </div>
          <h3 className="text-xl font-bold">Something went wrong in the editor</h3>
          <p className="text-sm opacity-60 max-w-sm">{this.state.error?.message || "Unknown rendering error"}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Main Component ---

export default function InlineDocumentBlock({ id: docIdProp, userId, title, content: initialContent, theme, isStreaming, isActiveEditor, onEditorOpen, width }: InlineDocumentBlockProps) {
  const renderCountRef = useRef(0);
  useEffect(() => {
    renderCountRef.current += 1;
    console.log('[RENDER COUNT]', renderCountRef.current);
  });

  const [isEditingState, setIsEditingState] = useState(false);
  const isEditing = isActiveEditor !== undefined ? isActiveEditor : isEditingState;

  useEffect(() => {
    if (isEditing) {
      console.log("[EDITOR STATE] isEditing is TRUE", { isActiveEditor, isEditingState, docIdProp });
    }
  }, [isEditing, isActiveEditor, isEditingState, docIdProp]);

  const setIsEditing = (val: boolean) => {
    setIsEditingState(val);
    if (onEditorOpen) onEditorOpen(val);
  };
  const [copied, setCopied] = useState(false);
  
  const [checkpoints, setCheckpoints] = useState<string[]>([initialContent]);
  const [currentCheckpointIndex, setCurrentCheckpointIndex] = useState(0);
  
  const [originalDocument, setOriginalDocument] = useState<string>(initialContent);
  const [draftDocument, setDraftDocument] = useState<string | null>(null);
  const [activeDocument, setActiveDocument] = useState<string>(initialContent);
  
  const [validationState, setValidationState] = useState<{ isValid: boolean; message: string | null } | null>(null);

  const [editedTitle, setEditedTitle] = useState(title);
  const [docChangePrompt, setDocChangePrompt] = useState("");
  const [isRevisionStreaming, setIsRevisionStreaming] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [mounted, setMounted] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const fetchDocumentWithRetry = async () => {
    if (!docIdProp) return;
    setLoadError(null);
    setIsRetrying(true);
    console.log("[DOCUMENT FOUND] Attempting to load document content for ID:", docIdProp);
    try {
      const doc = await getDocumentById(docIdProp);
      if (doc) {
        setActiveDocument(doc.content);
        setEditedTitle(doc.title);
        console.log("[DOCUMENT CONTENT LOADED] Document content loaded successfully via fetch/retry. Length:", doc.content?.length);
      } else {
        throw new Error("Document not found in database.");
      }
    } catch (e: any) {
      console.error("[EDITOR RENDER FAILED] Failed to fetch document content:", e);
      setLoadError(e?.message || "Database connection error");
    } finally {
      setIsRetrying(false);
    }
  };

  useEffect(() => {
    if (isEditing && !activeDocument && activeDocument !== "") {
      if (docIdProp) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchDocumentWithRetry();
      } else {
        setActiveDocument("");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, activeDocument, docIdProp]);

  // Device detection & Mount diagnostics
  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 0);
    console.log("[EDITOR COMPONENT MOUNT]", { 
      docIdProp, 
      title, 
      hasInitialContent: !!initialContent, 
      contentLength: initialContent?.length || 0 
    });

    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', checkMobile);
    };
  }, [docIdProp, initialContent, title]);

  const handleDocumentTap = () => {
    if (isMobile && !isFullscreen) {
      setIsFullscreen(true);
    }
  };

  // Auto-Save State
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [lastSavedContent, setLastSavedContent] = useState(initialContent);
  const [lastSavedTitle, setLastSavedTitle] = useState(title);
  const [internalDocId, setInternalDocId] = useState<string | null>(null);

  const editorRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Derive actual doc ID
  const actualDocId = docIdProp || internalDocId;

  // Diagnostics for sub-components mounting
  const headerMountedRef = useRef(false);
  const composerMountedRef = useRef(false);
  const bodyEditorMountedRef = useRef(false);

  useEffect(() => {
    if (isEditing) {
      if (!headerMountedRef.current) {
        console.log("[TOOLBAR MOUNTED] Header/Toolbar component mounted successfully. Component: InlineDocumentBlock (Header)");
        headerMountedRef.current = true;
      }
      if (!composerMountedRef.current) {
        console.log("[ASK CHANGES COMPOSER MOUNTED] Ask Changes composer mounted successfully. Component: InlineDocumentBlock (Form)");
        composerMountedRef.current = true;
      }
      if (editorRef.current && !bodyEditorMountedRef.current) {
        console.log("[BODY EDITOR MOUNTED] Body editor textarea mounted successfully. Component: InlineDocumentBlock (textarea)");
        bodyEditorMountedRef.current = true;
      }
    } else {
      headerMountedRef.current = false;
      composerMountedRef.current = false;
      bodyEditorMountedRef.current = false;
    }
  }, [isEditing]);

  // Editor specific session logs
  useEffect(() => {
    if (isEditing) {
      console.log("[EDITOR COMPONENT MOUNTED] Fullscreen editor portal mounted. Document ID:", actualDocId);
      console.log("[FULLSCREEN OVERLAY OPEN] Fullscreen overlay is open.");
      console.log("[EDITOR READY] Fullscreen editor ready for interaction.");
      console.log("[EDITOR OPEN]", { docIdProp, actualDocId, title: editedTitle });
      console.log("[EDITOR DOCUMENT LOADED]", { docIdProp, actualDocId });
      console.log("[EDITOR CONTENT LENGTH]", activeDocument?.length || 0);
      
      if (!activeDocument && activeDocument !== "") {
        console.error("[EDITOR RENDER FAILED] activeDocument is missing or undefined", { docIdProp, actualDocId });
      }

      return () => {
        console.log("[FULLSCREEN OVERLAY CLOSED] Fullscreen overlay is closed.");
      };
    }
  }, [isEditing, actualDocId, activeDocument, docIdProp, editedTitle]);

  const [prevInitialContent, setPrevInitialContent] = useState(initialContent);

  // Sync if prop content changes (upstream updates)
  if (initialContent !== prevInitialContent) {
    setPrevInitialContent(initialContent);
    if (!isEditing) {
      setCheckpoints([initialContent]);
      setCurrentCheckpointIndex(0);
      setActiveDocument(initialContent);
      setOriginalDocument(initialContent);
      setLastSavedContent(initialContent);
    }
  }

  // Handle FETCH LATEST on mount
  useEffect(() => {
    if (docIdProp) {
      const fetchLatest = async () => {
        try {
          const doc = await getDocumentById(docIdProp);
          // Only update if document version has changed and we're not currently editing
          if (doc && !isEditing) {
             setActiveDocument(prev => prev !== doc.content ? doc.content : prev);
             setEditedTitle(prev => prev !== doc.title ? doc.title : prev);
          }
        } catch (e) {
          console.error("Failed to fetch latest doc version", e);
        }
      };
      fetchLatest();
    }
  }, [docIdProp, isEditing]);

  // --- Auto-Save Logic ---

  const saveToSupabase = async (titleToSave: string, contentToSave: string, uid: string, did: string | null) => {
    if (titleToSave === lastSavedTitle && contentToSave === lastSavedContent && did) return;
    
    setSaveStatus('saving');
    try {
      const docRecord: DocumentRecord = {
        id: did || crypto.randomUUID(),
        user_id: uid,
        title: titleToSave,
        content: contentToSave,
        metadata: { version: currentCheckpointIndex + 1 },
        version_snapshots: checkpoints.map((c, i) => ({
           version: i + 1,
           title: titleToSave,
           content: c,
           timestamp: new Date().toISOString()
        }))
      };

      const result = await saveDocument(docRecord);
      if (result) {
        setInternalDocId(result.id);
        setLastSavedContent(contentToSave);
        setLastSavedTitle(titleToSave);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    } catch (err) {
      console.error('[AUTO-SAVE FAILED]', err);
      setSaveStatus('failed');
    }
  };

  const saveRef = useRef(saveToSupabase);
  
  useEffect(() => {
    saveRef.current = saveToSupabase;
  });

  const debouncedSaveRef = useRef<any>(null);

  useEffect(() => {
    debouncedSaveRef.current = debounce((titleToSave: string, contentToSave: string, uid: string, did: string | null) => {
      saveRef.current(titleToSave, contentToSave, uid, did);
    }, 2000);
    return () => {
      if (debouncedSaveRef.current) debouncedSaveRef.current.cancel();
    };
  }, []);

  useEffect(() => {
    if (isEditing && userId && debouncedSaveRef.current) {
      debouncedSaveRef.current(editedTitle, activeDocument, userId, actualDocId);
    }
  }, [activeDocument, editedTitle, isEditing, userId, actualDocId]);

  // Debounced checkpoint generator for manual typing undo/redo
  const debouncedCheckpointRef = useRef<any>(null);

  useEffect(() => {
    debouncedCheckpointRef.current = debounce((content: string) => {
      setCheckpoints(prev => {
        if (prev[currentCheckpointIndex] === content) return prev;
        const nextCheckpoints = [...prev.slice(0, currentCheckpointIndex + 1), content];
        setCurrentCheckpointIndex(nextCheckpoints.length - 1);
        return nextCheckpoints;
      });
    }, 1500);

    return () => {
      if (debouncedCheckpointRef.current) debouncedCheckpointRef.current.cancel();
    };
  }, [currentCheckpointIndex]);

  useEffect(() => {
    if (isEditing && debouncedCheckpointRef.current) {
      debouncedCheckpointRef.current(activeDocument);
    }
  }, [activeDocument, isEditing]);

  // --- Handlers: Document Actions ---

  const handleCopy = async () => {
    await copyToClipboard(activeDocument);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const updateCheckpoints = (newBody: string) => {
      const newCheckpoints = [...checkpoints.slice(0, currentCheckpointIndex + 1), newBody];
      setCheckpoints(newCheckpoints);
      setCurrentCheckpointIndex(newCheckpoints.length - 1);
  };

  const handleAskChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docChangePrompt.trim()) return;

    console.log('[ASK CHANGES START]', { prompt: docChangePrompt });

    setOriginalDocument(activeDocument);
    setDraftDocument("");
    setRevisionPending(true);
    setIsRevisionStreaming(true);
    setValidationState(null);
    setDiffHunks(null);
    
    let accumulated = "";
    let fetchFailed = false;
    let fetchErrorMsg = "";

    const ctrl = new AbortController();
    setAbortController(ctrl);

    const combinedOld = `# ${editedTitle}\n\n${activeDocument}`.trim();

    try {
      console.log('[STREAMING ACTIVE]');
      const response = await fetch('/api/document/revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: docChangePrompt,
          currentContent: combinedOld,
          documentTitle: editedTitle
        }),
        signal: ctrl.signal
      });

      if (!response.ok) {
        fetchFailed = true;
        fetchErrorMsg = `HTTP status ${response.status}`;
        throw new Error(`Failed to fetch revision: status ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        fetchFailed = true;
        fetchErrorMsg = "Fails to retrieve body response reader";
        throw new Error("No response reader");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        accumulated += chunk;
        setDraftDocument(accumulated); 
      }

    } catch (err: any) {
      if (err.name === 'AbortError') {
         console.log('[STREAMING CANCELLED]', { reason: 'User aborted' });
         console.log('[PARTIAL DRAFT SAVED]', { length: accumulated.length });
      } else {
        console.error('Revision error:', err);
        fetchFailed = true;
        if (!fetchErrorMsg) fetchErrorMsg = err?.message || "Unknown retrieval error";
      }
    } finally {
      setIsRevisionStreaming(false);
      setAbortController(null);

      // Validate Draft
      let isValid = true;
      let reason = "";

      if (fetchFailed) {
        isValid = false;
        reason = `Network or API failure: ${fetchErrorMsg}`;
      } else if (!accumulated) {
        isValid = false;
        reason = "AI returned empty output";
      } else if (accumulated.trim() === "") {
        isValid = false;
        reason = "AI returned blank spaces";
      }

      if (!isValid) {
        setValidationState({ isValid: false, message: reason });
      } else {
        setValidationState({ isValid: true, message: null });
        
        // Parse Title and Body
        let newTitle = editedTitle;
        let newBody = accumulated;
        const titleMatch = accumulated.match(/^# ([^\n]+)\n+([\s\S]*)$/);
        if (titleMatch) {
            newTitle = titleMatch[1].trim();
            newBody = titleMatch[2].trim();
        }

        setActiveDocument(newBody);
        setEditedTitle(newTitle);
        updateCheckpoints(newBody);
      }

      setDocChangePrompt("");
    }
  };

  const handleStopStreaming = () => {
    console.log('[STOP CLICKED]');
    if (abortController) {
      abortController.abort();
    }
  };

  const handleStopEditing = () => {
    const latestSaved = checkpoints[currentCheckpointIndex];
    setActiveDocument(latestSaved);
    setDraftDocument(null);
    setDiffHunks(null);
    setRevisionPending(false);
    setValidationState(null);
    setIsEditing(false);
  };

  // --- Render ---

  return (
    <>
      {/* INLINE PREVIEW (Always visible in chat flow) */}
      <div 
        onClick={() => { 
          if (isMobile) {
            console.log("[MOBILE EDIT CLICK] Inline document block clicked on mobile device.");
            if (activeDocument !== undefined && activeDocument !== null) {
              console.log("[DOCUMENT FOUND] Document exists with ID:", actualDocId);
              console.log("[DOCUMENT CONTENT LOADED] Document content loaded successfully. Length:", activeDocument.length);
            } else {
              console.error("[EDITOR RENDER FAILED] Document content is undefined or null on tap inside InlineDocumentBlock.");
            }
            setIsEditing(true); 
          }
        }}
        className={cn(
          "flex flex-col border transition-all duration-300 w-full relative select-text rounded-2xl shadow-sm my-4 overflow-hidden",
          theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-900 border-neutral-800/80",
          isMobile ? "cursor-pointer active:scale-[0.99] origin-center" : ""
        )}
      >
        <div className={cn(
          "flex items-center justify-between px-4 py-3 shrink-0 border-b transition-colors",
          theme === 'light' ? "bg-neutral-50/50 border-neutral-100" : "bg-neutral-950/50 border-neutral-800/60"
        )}>
          <div className="flex items-center gap-2">
            <FileText size={16} className={theme === 'light' ? "text-indigo-600" : "text-indigo-400"} />
            <span className={cn(
              "font-sans font-extrabold text-[13px] tracking-tight truncate",
              theme === 'light' ? "text-neutral-900" : "text-neutral-100"
            )}>
              {editedTitle || "Untitled Document"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className={cn("p-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1", theme === 'light' ? "hover:bg-neutral-200 text-neutral-600" : "hover:bg-neutral-800 text-neutral-300")}
              title="Copy Content"
            >
              {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              <span className="text-[11px] font-bold">Copy</span>
            </button>
            <button
              onClick={() => {
                console.log("[MOBILE EDIT CLICK] Edit button pressed. Doc ID:", actualDocId, "Title:", editedTitle);
                if (activeDocument !== undefined && activeDocument !== null) {
                  console.log("[DOCUMENT FOUND] Document exists with ID:", actualDocId);
                  console.log("[DOCUMENT CONTENT LOADED] Document content loaded successfully. Length:", activeDocument.length);
                } else {
                  console.error("[EDITOR RENDER FAILED] Document content is undefined or null inside InlineDocumentBlock.");
                }
                setIsEditing(true);
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer",
                theme === 'light' 
                  ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100" 
                  : "bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30"
              )}
            >
              <Edit3 size={14} />
              <span>Edit</span>
            </button>
          </div>
        </div>
        <div className="px-5 py-4 max-h-[400px] overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
           <MarkdownRenderer content={activeDocument} theme={theme} />
        </div>
      </div>

      {/* EDITOR SIDEBAR / FULLSCREEN (Conditionally rendered via Portal for best z-index isolation) */}
      {mounted && typeof document !== 'undefined' && createPortal(
        <AnimatePresence mode="wait">
          {isEditing && (
            <>
              {/* Backdrop for Editor (Mobile Only) */}
              {isMobile && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={handleStopEditing}
                  className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[99998]"
                />
              )}
              
              <motion.div 
                key={`editor-sidebar-${actualDocId}`}
                initial={isMobile ? { y: '100%' } : { x: '100%' }}
                animate={isMobile ? { y: 0 } : { x: 0 }}
                exit={isMobile ? { y: '100%' } : { x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                onUpdate={(latest) => {
                  if (latest.x === 0 || latest.y === 0) {
                    console.log("[EDITOR READY] Animation complete, sidebar is visible.", { isMobile, width: width || 380 });
                  }
                }}
                className={cn(
                  "flex flex-col select-text fixed overflow-hidden",
                  isMobile 
                    ? "border-none shadow-2xl bg-white dark:bg-neutral-950" 
                    : "right-0 top-0 bottom-0 border-l z-[100] shadow-none rounded-none",
                  theme === 'light' 
                    ? "bg-white border-neutral-200" 
                    : (theme === 'cosmic' 
                        ? "bg-[#06030f] border-indigo-500/10" 
                        : "bg-neutral-950 border-neutral-800")
                )}
                style={isMobile ? {
                  position: 'fixed',
                  inset: 0,
                  width: '100vw',
                  height: '100dvh',
                  zIndex: 99999,
                  overflow: 'hidden',
                  paddingTop: 'env(safe-area-inset-top)',
                  paddingBottom: 'env(safe-area-inset-bottom)'
                } : { width: width || 380, minWidth: 320, maxWidth: 420 }}
              >
                {/* Header with Save Status */}
                <div className={cn(
                  "flex items-center justify-between px-6 py-4 shrink-0 border-b backdrop-blur-md sticky top-0 z-[60]",
                  theme === 'light' ? "bg-white/90 border-neutral-100" : "bg-neutral-900/90 border-neutral-800/60",
                  isMobile && "pt-safe"
                )}>
                  {isMobile ? (
                    <div className="flex items-center gap-3 w-full justify-between select-none">
                      <button 
                        onClick={handleStopEditing}
                        className={cn(
                          "flex items-center gap-1 py-2 px-1 -ml-1 rounded-full transition-all cursor-pointer font-bold text-[14px]",
                          theme === 'light' ? "text-indigo-600 hover:text-indigo-800" : "text-indigo-400 hover:text-indigo-300"
                        )}
                      >
                        <ChevronLeft size={20} />
                        <span>Back</span>
                      </button>
                      <span className={cn(
                        "font-sans font-extrabold text-[15px] tracking-tight truncate flex-1 text-center px-4",
                        theme === 'light' ? "text-neutral-900" : "text-neutral-100"
                      )}>
                        {editedTitle || "Untitled Document"}
                      </span>
                      <div className="w-16 shrink-0 flex justify-end">
                        <span className="text-[10px] font-bold opacity-40 uppercase tracking-widest text-right">
                          {saveStatus === 'saving' && "..."}
                          {saveStatus === 'saved' && "Saved"}
                          {saveStatus === 'failed' && "Err"}
                          {saveStatus === 'idle' && `v${currentCheckpointIndex + 1}`}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 overflow-hidden">
                        <button 
                          onClick={handleStopEditing}
                          className={cn(
                            "p-2 rounded-full transition-all cursor-pointer",
                            theme === 'light' ? "hover:bg-neutral-100 text-neutral-500" : "hover:bg-neutral-800 text-neutral-400"
                          )}
                        >
                          <X size={20} />
                        </button>
                        <div className={cn(
                          "p-2 rounded-xl shrink-0",
                          theme === 'light' ? "bg-indigo-50 text-indigo-600 shadow-sm" : "bg-indigo-500/10 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.1)]"
                        )}>
                          <FileText size={20} />
                        </div>
                        <div className="flex flex-col overflow-hidden">
                          <span className={cn(
                            "font-sans font-extrabold text-[15px] tracking-tight truncate",
                            theme === 'light' ? "text-neutral-900" : "text-neutral-100"
                          )}>
                            {editedTitle || "Untitled Document"}
                          </span>
                          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest opacity-40">
                            {saveStatus === 'saving' && <span className="flex items-center gap-1"><Sparkles size={10} className="animate-spin" /> Saving...</span>}
                            {saveStatus === 'saved' && <span className="flex items-center gap-1 text-emerald-500"><Check size={10} /> Saved to Supabase</span>}
                            {saveStatus === 'failed' && <span className="flex items-center gap-1 text-rose-500">Failed</span>}
                            {saveStatus === 'idle' && <span>v{currentCheckpointIndex + 1}</span>}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={handleCopy}
                          className={cn("p-2 rounded-xl transition-all cursor-pointer hover:scale-105 active:scale-95", theme === 'light' ? "hover:bg-neutral-100 text-neutral-500" : "hover:bg-neutral-800 text-neutral-400")}
                          title="Copy Content"
                        >
                          {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Main Content Area */}
                <EditorErrorBoundary>
                  <div 
                    ref={scrollContainerRef}
                    onClick={handleDocumentTap}
                    className="flex-1 overflow-y-auto px-6 sm:px-12 py-8 sm:py-12 scroll-smooth select-text relative"
                  >
                    {(() => {
                      console.log("[EDITOR CONTENT RENDER] Checking state before render", { hasActiveDoc: !!activeDocument, isStreaming: isRevisionStreaming, loadError });
                      return null;
                    })()}
                    <div className="max-w-[800px] mx-auto">
                      {!activeDocument && activeDocument !== "" && !loadError ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3">
                          <Sparkles className="animate-spin text-indigo-500" size={32} />
                          <span className="text-sm opacity-50">Loading document...</span>
                        </div>
                      ) : loadError ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-4">
                          <div className="p-3 bg-rose-500/10 text-rose-500 rounded-full">
                            <Info size={32} />
                          </div>
                          <h3 className="text-lg font-bold">Unable to load document</h3>
                          <p className="text-sm opacity-60 max-w-xs">{loadError}</p>
                          <button 
                            onClick={fetchDocumentWithRetry}
                            disabled={isRetrying}
                            className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 active:scale-95 transition-all shadow-md disabled:opacity-50"
                          >
                            {isRetrying ? "Retrying..." : "Retry"}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-6 sm:space-y-8 pb-32">
                          <input 
                            type="text" 
                            value={editedTitle} 
                            onChange={(e) => setEditedTitle(e.target.value)} 
                            className={cn("w-full text-3xl sm:text-5xl font-black tracking-tighter px-0 bg-transparent border-none outline-none focus:ring-0 placeholder:opacity-20", theme === 'light' ? "text-neutral-900" : "text-white")} 
                            placeholder="Document Title" 
                            disabled={isRevisionStreaming}
                          />
                          <textarea
                            ref={editorRef as any}
                            value={isRevisionStreaming && draftDocument ? draftDocument : activeDocument}
                            onChange={(e) => setActiveDocument(e.target.value)}
                            placeholder="Start typing your elegant document body..."
                            disabled={isRevisionStreaming}
                            className={cn(
                              "w-full min-h-[500px] sm:min-h-[700px] font-mono text-[15px] sm:text-[17px] leading-[1.6] sm:leading-[1.8] px-0 py-2 sm:py-4 bg-transparent border-none outline-none focus:ring-0 whitespace-pre-wrap transition-opacity duration-300 resize-none focus:ring-transparent focus:border-transparent focus:ring-offset-0 select-text cursor-text", 
                              theme === 'light' ? "text-neutral-700 placeholder-neutral-400" : "text-neutral-300 placeholder-neutral-600",
                              isRevisionStreaming && "opacity-50 cursor-not-allowed"
                            )} 
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </EditorErrorBoundary>

                {/* Bottom Sticky Composer: Ask Changes */}
                <div 
                  className={cn(
                    "sticky bottom-0 left-0 right-0 z-[110] px-4 sm:px-10 py-6 sm:py-8 border-t backdrop-blur-3xl", 
                    theme === 'light' ? "bg-white/98 border-neutral-100 shadow-[0_-20px_50px_rgba(0,0,0,0.05)]" : "bg-neutral-900/98 border-neutral-800 shadow-[0_-20px_50px_rgba(0,0,0,0.3)]"
                  )}
                >
                  <div className="max-w-[800px] mx-auto flex flex-col gap-4 sm:gap-6">
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => {
                          if (currentCheckpointIndex > 0) {
                            const prevIdx = currentCheckpointIndex - 1;
                            setCurrentCheckpointIndex(prevIdx);
                            setActiveDocument(checkpoints[prevIdx]);
                          }
                        }}
                        disabled={currentCheckpointIndex === 0}
                        className={cn(
                          "p-3 rounded-2xl transition-all active:scale-90 shrink-0 cursor-pointer",
                          theme === 'light' ? "bg-neutral-100 text-neutral-600" : "bg-neutral-800 text-neutral-400",
                          currentCheckpointIndex === 0 && "opacity-30 cursor-not-allowed"
                        )}
                        title="Undo"
                      >
                        <RotateCcw size={18} />
                      </button>
                      <button 
                        onClick={() => {
                          if (currentCheckpointIndex < checkpoints.length - 1) {
                            const nextIdx = currentCheckpointIndex + 1;
                            setCurrentCheckpointIndex(nextIdx);
                            setActiveDocument(checkpoints[nextIdx]);
                          }
                        }}
                        disabled={currentCheckpointIndex === checkpoints.length - 1}
                        className={cn(
                          "p-3 rounded-2xl transition-all active:scale-90 shrink-0 cursor-pointer",
                          theme === 'light' ? "bg-neutral-100 text-neutral-600" : "bg-neutral-800 text-neutral-400",
                          currentCheckpointIndex === checkpoints.length - 1 && "opacity-30 cursor-not-allowed"
                        )}
                        title="Redo"
                      >
                        <RotateCw size={18} />
                      </button>
                      <form onSubmit={handleAskChanges} className="relative flex-1">
                        <input 
                          type="text" 
                          value={docChangePrompt} 
                          onChange={(e) => setDocChangePrompt(e.target.value)} 
                          placeholder="Ask changes..." 
                          disabled={isRevisionStreaming} 
                          className={cn(
                            "w-full pl-6 sm:pl-8 pr-20 sm:pr-24 py-4 sm:py-5 rounded-2xl sm:rounded-[24px] border-2 text-[14px] sm:text-[16px] font-bold outline-none transition-all duration-500", 
                            theme === 'light' ? "bg-neutral-50 border-neutral-100 focus:border-indigo-500 focus:bg-white text-neutral-900" : "bg-neutral-800 border-neutral-800 focus:border-indigo-500 focus:bg-neutral-900 text-white"
                          )} 
                        />
                        <div className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2">
                          {isRevisionStreaming ? (
                            <button type="button" onClick={handleStopStreaming} className="flex items-center gap-1 sm:gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-[14px] sm:rounded-[18px] bg-rose-600 text-white text-[10px] sm:text-[12px] font-black uppercase tracking-widest shadow-xl active:scale-90 transition-all cursor-pointer"><StopCircle size={14} /> Stop</button>
                          ) : (
                            <button type="submit" disabled={!docChangePrompt.trim()} className={cn("flex items-center gap-1 sm:gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-[14px] sm:rounded-[18px] text-[10px] sm:text-[12px] font-black uppercase tracking-widest transition-all cursor-pointer", docChangePrompt.trim() ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-xl active:scale-95" : "bg-neutral-200 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed")}>
                              <Send size={14} /> Send
                            </button>
                          )}
                        </div>
                      </form>
                    </div>
                    
                    {validationState && !validationState.isValid && (
                      <div className="px-4 sm:px-6 py-3 sm:py-4 bg-rose-500/5 border border-rose-500/10 rounded-[16px] sm:rounded-[20px] flex items-center gap-3 sm:gap-4 animate-in fade-in duration-500">
                        <Info size={18} className="text-rose-500 shrink-0" />
                        <span className="text-[12px] sm:text-[13px] font-bold text-rose-600/80">{validationState.message}</span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
