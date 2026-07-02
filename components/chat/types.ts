export interface Attachment {
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

export interface Message {
  id: string;
  chat_id?: string;
  role: 'user' | 'model' | 'system';
  content: string;
  created_at?: string;
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

export interface Chat {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
  is_pinned?: boolean;
}
