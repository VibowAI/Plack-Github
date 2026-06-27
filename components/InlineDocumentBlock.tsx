import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileText, Copy, Edit3, Check, Sparkles, Send, X, RotateCcw,
  CheckCircle2, Trash2, StopCircle, 
  ChevronDown, Save, Trash, Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import { diffArrays, diffWordsWithSpace } from 'diff';
import { debounce } from 'lodash';
import { saveDocument, DocumentRecord, getDocumentById } from '@/lib/supabase/documents';

interface InlineDocumentBlockProps {
  id?: string;
  userId?: string;
  title: string;
  content: string;
  theme: 'light' | 'dark' | 'cosmic';
  isStreaming?: boolean;
}

type HunkStatus = 'pending' | 'accepted' | 'rejected';

type DiffHunk = {
  id: string;
  type: 'unchanged' | 'change';
  status?: HunkStatus;
  oldText?: string;
  newText?: string;
  text?: string;
};

// --- Helper: Diff Logic ---

function computeDiffHunks(oldText: string, newText: string): DiffHunk[] {
  const oldParas = oldText.split(/(?:\r?\n){2,}/);
  const newParas = newText.split(/(?:\r?\n){2,}/);

  const rawDiff = diffArrays(oldParas, newParas);
  
  let hunks: DiffHunk[] = [];
  let pendingOld: string[] = [];
  let pendingNew: string[] = [];

  const flushPending = () => {
      if (pendingOld.length > 0 || pendingNew.length > 0) {
          hunks.push({
              id: Math.random().toString(),
              type: 'change',
              status: 'pending',
              oldText: pendingOld.join('\n\n'),
              newText: pendingNew.join('\n\n')
          });
          pendingOld = [];
          pendingNew = [];
      }
  };

  for (const d of rawDiff) {
      if (d.removed) {
          pendingOld.push(...d.value);
      } else if (d.added) {
          pendingNew.push(...d.value);
      } else {
          flushPending();
          hunks.push({
              id: Math.random().toString(),
              type: 'unchanged',
              text: d.value.join('\n\n')
          });
      }
  }
  flushPending();
  return hunks;
}

const renderHunkText = (hunk: DiffHunk): string => {
  if (hunk.type === 'unchanged') return hunk.text || "";
  if (hunk.status === 'accepted') return hunk.newText || "";
  if (hunk.status === 'rejected') return hunk.oldText || "";
  
  const parts = diffWordsWithSpace(hunk.oldText || "", hunk.newText || "");
  return parts.map(p => {
     if (p.added) return `<ins>${p.value}</ins>`;
     if (p.removed) return `<del>${p.value}</del>`;
     return p.value;
  }).join('');
};

// --- Uncontrolled Editor Component ---

const UncontrolledEditor = ({ initialHtml, onChange, editorRef, className }: any) => {
  const localRef = useRef<HTMLDivElement>(null);
  const refToUse = editorRef || localRef;
  const [initial] = useState(initialHtml); // Capture once on mount

  return (
    <div 
      ref={refToUse} 
      contentEditable={true} 
      suppressContentEditableWarning={true}
      onInput={(e: any) => onChange(e.currentTarget.innerText)}
      className={className} 
      dangerouslySetInnerHTML={{ __html: initial }}
    />
  );
};

// --- Main Component ---

export default function InlineDocumentBlock({ id: docIdProp, userId, title, content: initialContent, theme, isStreaming }: InlineDocumentBlockProps) {
  const renderCountRef = useRef(0);
  useEffect(() => {
    renderCountRef.current += 1;
    console.log('[RENDER COUNT]', renderCountRef.current);
  });

  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const [checkpoints, setCheckpoints] = useState<string[]>([initialContent]);
  const [currentCheckpointIndex, setCurrentCheckpointIndex] = useState(0);
  
  const [originalDocument, setOriginalDocument] = useState<string>(initialContent);
  const [draftDocument, setDraftDocument] = useState<string | null>(null);
  const [activeDocument, setActiveDocument] = useState<string>(initialContent);
  const [revisionPending, setRevisionPending] = useState<boolean>(false);
  const [diffHunks, setDiffHunks] = useState<DiffHunk[] | null>(null);
  
  const [validationState, setValidationState] = useState<{ isValid: boolean; message: string | null } | null>(null);

  const [editedTitle, setEditedTitle] = useState(title);
  const [docChangePrompt, setDocChangePrompt] = useState("");
  const [isRevisionStreaming, setIsRevisionStreaming] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // Auto-Save State
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [lastSavedContent, setLastSavedContent] = useState(initialContent);
  const [lastSavedTitle, setLastSavedTitle] = useState(title);
  const [internalDocId, setInternalDocId] = useState<string | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Derive actual doc ID
  const actualDocId = docIdProp || internalDocId;

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
  }, [docIdProp, isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // --- Handlers: Document Actions ---

  const handleCopy = () => {
    navigator.clipboard.writeText(activeDocument);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
      } else if (accumulated === combinedOld) {
        isValid = false;
        reason = "Draft matches original content exactly";
      }

      if (!isValid) {
        setValidationState({ isValid: false, message: reason });
        setDraftDocument(null);
        setRevisionPending(false);
      } else {
        setValidationState({ isValid: true, message: null });
        setRevisionPending(true);
        const hunks = computeDiffHunks(combinedOld, accumulated);
        setDiffHunks(hunks);
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

  const handleApplyChangesToDocument = (finalHunks: DiffHunk[]) => {
      const finalText = finalHunks.map(h => {
         if (h.type === 'unchanged') return h.text;
         if (h.status === 'accepted') return h.newText;
         if (h.status === 'rejected') return h.oldText;
         return h.oldText;
      }).join('\n\n');

      let newTitle = editedTitle;
      let newBody = finalText;
      const titleMatch = finalText.match(/^# ([^\n]+)\n+([\s\S]*)$/);
      if (titleMatch) {
          newTitle = titleMatch[1].trim();
          newBody = titleMatch[2].trim();
      }

      setActiveDocument(newBody);
      setEditedTitle(newTitle);
      
      const newCheckpoints = [...checkpoints.slice(0, currentCheckpointIndex + 1), newBody];
      setCheckpoints(newCheckpoints);
      setCurrentCheckpointIndex(newCheckpoints.length - 1);
      
      setDraftDocument(null);
      setDiffHunks(null);
      setRevisionPending(false);
      setValidationState(null);
  };

  const handleAcceptAll = () => {
    if (!diffHunks) return;
    const resolvedHunks = diffHunks.map(h => h.type === 'change' ? { ...h, status: 'accepted' as HunkStatus } : h);
    handleApplyChangesToDocument(resolvedHunks);
  };

  const handleRejectAll = () => {
    setDraftDocument(null);
    setDiffHunks(null);
    setRevisionPending(false);
    setValidationState(null);
  };

  const handleHunkAction = (id: string, action: 'accepted' | 'rejected') => {
      if (!diffHunks) return;
      const nextHunks = diffHunks.map(h => h.id === id ? { ...h, status: action } : h);
      setDiffHunks(nextHunks);
      
      const stillPending = nextHunks.some(h => h.type === 'change' && h.status === 'pending');
      if (!stillPending) {
         handleApplyChangesToDocument(nextHunks);
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
    <div 
      className={cn(
        "flex flex-col border rounded-[32px] overflow-hidden shadow-2xl my-10 transition-all duration-700 w-full relative select-text",
        theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-950/90 border-neutral-800/80"
      )}
    >
      {/* Header with Save Status */}
      <div className={cn(
        "flex items-center justify-between px-6 py-4 shrink-0 border-b transition-colors backdrop-blur-md sticky top-0 z-[60]",
        theme === 'light' ? "bg-white/90 border-neutral-100" : "bg-neutral-900/90 border-neutral-800/60"
      )}>
        <div className="flex items-center gap-3 overflow-hidden">
          <div className={cn(
            "p-2 rounded-xl shrink-0 transition-all",
            theme === 'light' ? "bg-indigo-50 text-indigo-600 shadow-sm" : "bg-indigo-500/10 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.1)]"
          )}>
            <FileText size={18} />
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
              {saveStatus === 'saved' && <span className="flex items-center gap-1 text-emerald-500"><Check size={10} /> Saved to Database</span>}
              {saveStatus === 'failed' && <span className="flex items-center gap-1 text-rose-500">Auto-save failed</span>}
              {saveStatus === 'idle' && <span>Version {currentCheckpointIndex + 1}</span>}
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
          
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm active:scale-95",
                theme === 'light' 
                  ? "bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-500/20" 
                  : "bg-indigo-500 text-white hover:bg-indigo-600 shadow-lg shadow-indigo-500/10"
              )}
            >
              <Edit3 size={15} />
              Edit
            </button>
          ) : (
            <button
              onClick={handleStopEditing}
              className={cn(
                "p-2 rounded-xl transition-all cursor-pointer hover:bg-rose-500/10 text-neutral-500 hover:text-rose-500",
                theme === 'light' ? "hover:bg-neutral-100" : "hover:bg-neutral-800"
              )}
              title="Close Editor"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div 
        ref={scrollContainerRef}
        className={cn(
          "flex-1 overflow-y-auto px-10 py-12 scroll-smooth select-text relative min-h-[600px] max-h-[900px]",
          theme === 'light' ? "bg-white" : "bg-transparent"
        )}
      >
        <div className="max-w-[800px] mx-auto">
          {isRevisionStreaming && draftDocument ? (
            <div className="prose prose-neutral dark:prose-invert max-w-none font-sans pt-2 pb-6">
              <div className="flex items-center gap-3 mb-10 p-4 bg-indigo-500/5 border border-dashed border-indigo-500/20 rounded-[24px] animate-pulse">
                 <Sparkles size={18} className="text-indigo-500" />
                 <span className="text-[11px] font-black text-indigo-500 uppercase tracking-widest">AI Drafting in Progress...</span>
              </div>
              <MarkdownRenderer content={draftDocument} theme={theme} />
            </div>
          ) : diffHunks !== null ? (
            <div className="flex flex-col gap-12 pt-2 pb-32">
              {diffHunks.map(hunk => {
                const isPending = hunk.type === 'change' && hunk.status === 'pending';
                return (
                  <div key={hunk.id} className="relative group/hunk">
                    {isPending && (
                       <div className="hidden lg:flex absolute -left-20 top-0 flex-col gap-2 opacity-0 group-hover/hunk:opacity-100 transition-all duration-500 transform translate-x-4 group-hover/hunk:translate-x-0">
                         <button onClick={() => handleHunkAction(hunk.id, 'accepted')} className="p-3 rounded-2xl border border-emerald-500/30 bg-emerald-50 text-emerald-600 shadow-lg hover:scale-110 active:scale-95 transition-all"><Check size={20} /></button>
                         <button onClick={() => handleHunkAction(hunk.id, 'rejected')} className="p-3 rounded-2xl border border-rose-500/30 bg-rose-50 text-rose-600 shadow-lg hover:scale-110 active:scale-95 transition-all"><X size={20} /></button>
                       </div>
                    )}
                    <div className={cn("font-sans transition-all duration-500", isPending && (theme === 'light' ? "bg-indigo-50/30 p-8 -mx-8 rounded-[32px] border border-indigo-100/50 shadow-inner" : "bg-indigo-950/10 p-8 -mx-8 rounded-[32px] border border-indigo-500/10 shadow-inner"))}>
                       <MarkdownRenderer content={renderHunkText(hunk)} theme={theme} />
                       {isPending && (
                         <div className="lg:hidden flex gap-4 mt-8 pt-8 border-t border-indigo-200/50">
                            <button onClick={() => handleHunkAction(hunk.id, 'accepted')} className="flex items-center justify-center gap-2 text-[12px] font-black uppercase px-6 py-4 bg-emerald-500 text-white rounded-2xl flex-1 shadow-lg shadow-emerald-500/30"><Check size={18}/> Accept</button>
                            <button onClick={() => handleHunkAction(hunk.id, 'rejected')} className="flex items-center justify-center gap-2 text-[12px] font-black uppercase px-6 py-4 bg-neutral-200 text-neutral-900 rounded-2xl flex-1 active:scale-95"><Trash2 size={18}/> Reject</button>
                         </div>
                       )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : isEditing ? (
            <div className="space-y-8 pb-32">
              <input 
                type="text" 
                value={editedTitle} 
                onChange={(e) => setEditedTitle(e.target.value)} 
                className={cn("w-full text-5xl font-black tracking-tighter px-0 bg-transparent border-none outline-none focus:ring-0 placeholder:opacity-20", theme === 'light' ? "text-neutral-900" : "text-white")} 
                placeholder="Document Title" 
              />
              <UncontrolledEditor
                editorRef={editorRef} 
                initialHtml={activeDocument}
                onChange={setActiveDocument}
                className={cn(
                  "w-full min-h-[700px] font-mono text-[17px] leading-[1.8] px-0 py-4 bg-transparent border-none outline-none focus:ring-0 whitespace-pre-wrap transition-opacity duration-300", 
                  theme === 'light' ? "text-neutral-700" : "text-neutral-300"
                )} 
              />
            </div>
          ) : (
            <div className="prose prose-neutral dark:prose-invert max-w-none font-sans pt-2 pb-24">
              <h1 className={cn("text-5xl font-black tracking-tighter mb-10 mt-0", theme === 'light' ? "text-neutral-900" : "text-white")}>{editedTitle}</h1>
              {activeDocument ? <MarkdownRenderer content={activeDocument} theme={theme} /> : <div className="text-center py-40 opacity-10 font-black uppercase tracking-[1em]">Empty document</div>}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Sticky Composer: Ask Changes */}
      <AnimatePresence>
        {isEditing && (
          <motion.div initial={{ y: 200 }} animate={{ y: 0 }} exit={{ y: 200 }} className={cn("sticky bottom-0 left-0 right-0 z-[110] px-10 py-8 border-t backdrop-blur-3xl", theme === 'light' ? "bg-white/98 border-neutral-100 shadow-[0_-20px_50px_rgba(0,0,0,0.05)]" : "bg-neutral-900/98 border-neutral-800 shadow-[0_-20px_50px_rgba(0,0,0,0.3)]")}>
            <div className="max-w-[800px] mx-auto flex flex-col gap-6">
              {revisionPending && diffHunks && (
                <div className="flex items-center justify-between animate-in slide-in-from-bottom-2 duration-500">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-ping" />
                    <span className="text-[11px] font-black uppercase tracking-[0.2em] opacity-60">Pending Document Revision</span>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={handleAcceptAll} className="px-6 py-2 bg-indigo-600 text-white rounded-full text-[11px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-2xl active:scale-95 transition-all">Accept All</button>
                    <button onClick={handleRejectAll} className="px-6 py-2 bg-neutral-200 dark:bg-neutral-800 rounded-full text-[11px] font-black uppercase tracking-widest hover:bg-neutral-300 dark:hover:bg-neutral-700 active:scale-95 transition-all">Reject</button>
                  </div>
                </div>
              )}

              <form onSubmit={handleAskChanges} className="relative">
                <input type="text" value={docChangePrompt} onChange={(e) => setDocChangePrompt(e.target.value)} placeholder="Ask changes..." disabled={isRevisionStreaming} className={cn("w-full pl-8 pr-24 py-5 rounded-[24px] border-2 text-[16px] font-bold outline-none transition-all duration-500", theme === 'light' ? "bg-neutral-50 border-neutral-100 focus:border-indigo-500 focus:bg-white text-neutral-900" : "bg-neutral-800 border-neutral-800 focus:border-indigo-500 focus:bg-neutral-900 text-white")} />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {isRevisionStreaming ? (
                    <button type="button" onClick={handleStopStreaming} className="flex items-center gap-2 px-6 py-2.5 rounded-[18px] bg-rose-600 text-white text-[12px] font-black uppercase tracking-widest shadow-xl shadow-rose-500/30 active:scale-90 transition-all"><StopCircle size={15} /> Stop</button>
                  ) : (
                    <button type="submit" disabled={!docChangePrompt.trim()} className={cn("flex items-center gap-2 px-6 py-2.5 rounded-[18px] text-[12px] font-black uppercase tracking-widest transition-all", docChangePrompt.trim() ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-xl active:scale-95" : "bg-neutral-200 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed")}>
                      <Send size={15} /> Send
                    </button>
                  )}
                </div>
              </form>
              
              {validationState && !validationState.isValid && (
                <div className="px-6 py-4 bg-rose-500/5 border border-rose-500/10 rounded-[20px] flex items-center gap-4 animate-in fade-in duration-500">
                  <Info size={20} className="text-rose-500 shrink-0" />
                  <span className="text-[13px] font-bold text-rose-600/80">{validationState.message}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
