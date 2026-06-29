-- Supabase Real-time Chat AI Database Schema (Bulletproof Re-runnable Script)

-- 1. Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  theme_setting text DEFAULT 'system',
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Chats
CREATE TABLE IF NOT EXISTS public.chats (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  is_pinned boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

-- 3. Messages
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'model')),
  content text NOT NULL,
  reasoning text,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 4. Usage Logs
CREATE TABLE IF NOT EXISTS public.usage_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  model text,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

-- 5. Message Feedback
CREATE TABLE IF NOT EXISTS public.message_feedback (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feedback_type text NOT NULL CHECK (feedback_type IN ('like', 'dislike')),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id),
  UNIQUE (message_id, user_id)
);
ALTER TABLE public.message_feedback ENABLE ROW LEVEL SECURITY;

-- 6. Web Search Usage
CREATE TABLE IF NOT EXISTS public.web_search_usage (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  search_count integer DEFAULT 1 NOT NULL,
  window_start timestamptz DEFAULT date_trunc('hour', now()) NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public.web_search_usage ENABLE ROW LEVEL SECURITY;

-- 7. Search History
CREATE TABLE IF NOT EXISTS public.search_history (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  query text NOT NULL,
  sources jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;

-- 8. Message Attachments
CREATE TABLE IF NOT EXISTS public.message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size bigint NOT NULL,
  storage_path text NOT NULL,
  public_url text,
  created_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

-- 8. Policies
-- Profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Chats
DROP POLICY IF EXISTS "Users can view own chats" ON public.chats;
CREATE POLICY "Users can view own chats" ON public.chats FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own chats" ON public.chats;
CREATE POLICY "Users can insert own chats" ON public.chats FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own chats" ON public.chats;
CREATE POLICY "Users can update own chats" ON public.chats FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own chats" ON public.chats;
CREATE POLICY "Users can delete own chats" ON public.chats FOR DELETE USING (auth.uid() = user_id);

-- Messages
DROP POLICY IF EXISTS "Users can view messages in own chats" ON public.messages;
CREATE POLICY "Users can view messages in own chats" ON public.messages FOR SELECT USING (EXISTS (SELECT 1 FROM public.chats WHERE chats.id = messages.chat_id AND chats.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can insert messages in own chats" ON public.messages;
CREATE POLICY "Users can insert messages in own chats" ON public.messages FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.chats WHERE chats.id = messages.chat_id AND chats.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can delete messages in own chats" ON public.messages;
CREATE POLICY "Users can delete messages in own chats" ON public.messages FOR DELETE USING (EXISTS (SELECT 1 FROM public.chats WHERE chats.id = messages.chat_id AND chats.user_id = auth.uid()));

-- Feedback
DROP POLICY IF EXISTS "Users can insert own feedback" ON public.message_feedback;
CREATE POLICY "Users can insert own feedback" ON public.message_feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own feedback" ON public.message_feedback;
CREATE POLICY "Users can update own feedback" ON public.message_feedback FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own feedback" ON public.message_feedback;
CREATE POLICY "Users can delete own feedback" ON public.message_feedback FOR DELETE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view own feedback" ON public.message_feedback;
CREATE POLICY "Users can view own feedback" ON public.message_feedback FOR SELECT USING (auth.uid() = user_id);

-- Search
DROP POLICY IF EXISTS "Users can insert own web search usage" ON public.web_search_usage;
CREATE POLICY "Users can insert own web search usage" ON public.web_search_usage FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view own web search usage" ON public.web_search_usage;
CREATE POLICY "Users can view own web search usage" ON public.web_search_usage FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own search history" ON public.search_history;
CREATE POLICY "Users can insert own search history" ON public.search_history FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view own search history" ON public.search_history;
CREATE POLICY "Users can view own search history" ON public.search_history FOR SELECT USING (auth.uid() = user_id);

-- Message Attachments Policies
DROP POLICY IF EXISTS "Users can view own message attachments" ON public.message_attachments;
CREATE POLICY "Users can view own message attachments" ON public.message_attachments FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own message attachments" ON public.message_attachments;
CREATE POLICY "Users can insert own message attachments" ON public.message_attachments FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own message attachments" ON public.message_attachments;
CREATE POLICY "Users can delete own message attachments" ON public.message_attachments FOR DELETE USING (auth.uid() = user_id);


-- 9. Functions
CREATE OR REPLACE FUNCTION public.check_web_search_usage(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
  v_allowed boolean;
  v_remaining integer;
BEGIN
  -- Count searches in the last 24 hours
  SELECT count(*) INTO v_count FROM public.web_search_usage
  WHERE user_id = p_user_id AND created_at > now() - interval '24 hours';
  
  IF v_count >= 5 THEN
    v_allowed := false;
    v_remaining := 0;
  ELSE
    v_allowed := true;
    v_remaining := 5 - v_count - 1;
    INSERT INTO public.web_search_usage (user_id) VALUES (p_user_id);
  END IF;

  RETURN json_build_object('allowed', v_allowed, 'remaining', v_remaining);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_web_search_usage(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
  v_remaining integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.web_search_usage
  WHERE user_id = p_user_id AND created_at > now() - interval '24 hours';
  
  v_remaining := GREATEST(0, 5 - v_count);
  RETURN json_build_object('remaining', v_remaining);
END;
$$;


-- 10. Document Workspaces (ChatGPT Canvas / Claude Artifacts Inspired)
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chat_id uuid REFERENCES public.chats(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  version_snapshots jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Document Workspaces Policies
DROP POLICY IF EXISTS "Users can view own documents" ON public.documents;
CREATE POLICY "Users can view own documents" ON public.documents FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own documents" ON public.documents;
CREATE POLICY "Users can insert own documents" ON public.documents FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own documents" ON public.documents;
CREATE POLICY "Users can update own documents" ON public.documents FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own documents" ON public.documents;
CREATE POLICY "Users can delete own documents" ON public.documents FOR DELETE USING (auth.uid() = user_id);


-- 11. Document Versions
CREATE TABLE IF NOT EXISTS public.document_versions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  content text NOT NULL,
  title text NOT NULL,
  version int NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own document versions" ON public.document_versions;
CREATE POLICY "Users can view own document versions" ON public.document_versions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND d.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can insert own document versions" ON public.document_versions;
CREATE POLICY "Users can insert own document versions" ON public.document_versions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND d.user_id = auth.uid())
);


-- 12. Document Comments
CREATE TABLE IF NOT EXISTS public.document_comments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  selection_start int,
  selection_end int,
  selection_text text,
  comment text NOT NULL,
  author text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public.document_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own document comments" ON public.document_comments;
CREATE POLICY "Users can view own document comments" ON public.document_comments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND d.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can insert own document comments" ON public.document_comments;
CREATE POLICY "Users can insert own document comments" ON public.document_comments FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND d.user_id = auth.uid())
);

-- 13. Memories
CREATE TABLE IF NOT EXISTS public.memories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text NOT NULL,
  content text NOT NULL,
  size_bytes bigint DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS memories_user_id_idx ON public.memories (user_id);

DROP POLICY IF EXISTS "Users can view own memories" ON public.memories;
CREATE POLICY "Users can view own memories" ON public.memories FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own memories" ON public.memories;
CREATE POLICY "Users can insert own memories" ON public.memories FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own memories" ON public.memories;
CREATE POLICY "Users can update own memories" ON public.memories FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own memories" ON public.memories;
CREATE POLICY "Users can delete own memories" ON public.memories FOR DELETE USING (auth.uid() = user_id);


-- 14. Connections (Zoom, etc.)
CREATE TABLE IF NOT EXISTS public.connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider text NOT NULL,
  account_email text,
  access_token text NOT NULL, -- Encrypted
  refresh_token text, -- Encrypted
  expires_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id, provider)
);
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own connections" ON public.connections;
CREATE POLICY "Users can view own connections" ON public.connections FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own connections" ON public.connections;
CREATE POLICY "Users can insert own connections" ON public.connections FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own connections" ON public.connections;
CREATE POLICY "Users can update own connections" ON public.connections FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own connections" ON public.connections;
CREATE POLICY "Users can delete own connections" ON public.connections FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trigger_update_connections_updated_at ON public.connections;
CREATE TRIGGER trigger_update_connections_updated_at
  BEFORE UPDATE ON public.connections
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_connections_user_id ON public.connections(user_id);


-- ZOOM 3.0 PERSISTENT TABLES
-- Stores persistent data for Zoom meetings, recordings, and AI-generated reports

-- Zoom Connections
CREATE TABLE IF NOT EXISTS public.zoom_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  zoom_account_id text,
  email text,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  scopes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id)
);
ALTER TABLE public.zoom_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own zoom_connections" ON public.zoom_connections;
CREATE POLICY "Users can view own zoom_connections" ON public.zoom_connections FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own zoom_connections" ON public.zoom_connections;
CREATE POLICY "Users can insert own zoom_connections" ON public.zoom_connections FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own zoom_connections" ON public.zoom_connections;
CREATE POLICY "Users can update own zoom_connections" ON public.zoom_connections FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own zoom_connections" ON public.zoom_connections;
CREATE POLICY "Users can delete own zoom_connections" ON public.zoom_connections FOR DELETE USING (auth.uid() = user_id);

-- Zoom Meetings
CREATE TABLE IF NOT EXISTS public.zoom_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  zoom_meeting_id text NOT NULL,
  topic text NOT NULL,
  description text,
  start_time timestamptz,
  end_time timestamptz,
  timezone text,
  duration integer,
  join_url text,
  start_url text,
  meeting_password text,
  host_email text,
  meeting_status text,
  participant_count integer DEFAULT 0,
  calendar_event_id text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  last_synced_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id, zoom_meeting_id)
);
ALTER TABLE public.zoom_meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own zoom_meetings" ON public.zoom_meetings;
CREATE POLICY "Users can view own zoom_meetings" ON public.zoom_meetings FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own zoom_meetings" ON public.zoom_meetings;
CREATE POLICY "Users can insert own zoom_meetings" ON public.zoom_meetings FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own zoom_meetings" ON public.zoom_meetings;
CREATE POLICY "Users can update own zoom_meetings" ON public.zoom_meetings FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own zoom_meetings" ON public.zoom_meetings;
CREATE POLICY "Users can delete own zoom_meetings" ON public.zoom_meetings FOR DELETE USING (auth.uid() = user_id);

-- Zoom Recordings
CREATE TABLE IF NOT EXISTS public.zoom_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  zoom_meeting_id text NOT NULL,
  recording_id text,
  recording_type text,
  recording_url text,
  transcript_available boolean DEFAULT false,
  duration integer,
  file_size bigint,
  created_at timestamptz DEFAULT now() NOT NULL,
  last_synced_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id, zoom_meeting_id, recording_id)
);
ALTER TABLE public.zoom_recordings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own zoom_recordings" ON public.zoom_recordings;
CREATE POLICY "Users can view own zoom_recordings" ON public.zoom_recordings FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own zoom_recordings" ON public.zoom_recordings;
CREATE POLICY "Users can insert own zoom_recordings" ON public.zoom_recordings FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own zoom_recordings" ON public.zoom_recordings;
CREATE POLICY "Users can update own zoom_recordings" ON public.zoom_recordings FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own zoom_recordings" ON public.zoom_recordings;
CREATE POLICY "Users can delete own zoom_recordings" ON public.zoom_recordings FOR DELETE USING (auth.uid() = user_id);

-- Zoom AI Reports
CREATE TABLE IF NOT EXISTS public.zoom_ai_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  meeting_id text NOT NULL, -- zoom_meeting_id
  executive_summary text,
  key_decisions jsonb DEFAULT '[]'::jsonb,
  action_items jsonb DEFAULT '[]'::jsonb,
  participants jsonb DEFAULT '[]'::jsonb,
  topics jsonb DEFAULT '[]'::jsonb,
  risks jsonb DEFAULT '[]'::jsonb,
  follow_ups jsonb DEFAULT '[]'::jsonb,
  generated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id, meeting_id)
);
ALTER TABLE public.zoom_ai_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own zoom_ai_reports" ON public.zoom_ai_reports;
CREATE POLICY "Users can view own zoom_ai_reports" ON public.zoom_ai_reports FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own zoom_ai_reports" ON public.zoom_ai_reports;
CREATE POLICY "Users can insert own zoom_ai_reports" ON public.zoom_ai_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own zoom_ai_reports" ON public.zoom_ai_reports;
CREATE POLICY "Users can update own zoom_ai_reports" ON public.zoom_ai_reports FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own zoom_ai_reports" ON public.zoom_ai_reports;
CREATE POLICY "Users can delete own zoom_ai_reports" ON public.zoom_ai_reports FOR DELETE USING (auth.uid() = user_id);

-- Trigger for zoom_connections updated_at
DROP TRIGGER IF EXISTS trigger_update_zoom_connections_updated_at ON public.zoom_connections;
CREATE TRIGGER trigger_update_zoom_connections_updated_at
  BEFORE UPDATE ON public.zoom_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Trigger for zoom_meetings updated_at
DROP TRIGGER IF EXISTS trigger_update_zoom_meetings_updated_at ON public.zoom_meetings;
CREATE TRIGGER trigger_update_zoom_meetings_updated_at
  BEFORE UPDATE ON public.zoom_meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Indexes Optimization
CREATE INDEX IF NOT EXISTS idx_zoom_connections_user_id ON public.zoom_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_zoom_meetings_user_id ON public.zoom_meetings(user_id);
CREATE INDEX IF NOT EXISTS idx_zoom_meetings_zoom_meeting_id ON public.zoom_meetings(zoom_meeting_id);
CREATE INDEX IF NOT EXISTS idx_zoom_recordings_user_id ON public.zoom_recordings(user_id);
CREATE INDEX IF NOT EXISTS idx_zoom_recordings_zoom_meeting_id ON public.zoom_recordings(zoom_meeting_id);
CREATE INDEX IF NOT EXISTS idx_zoom_ai_reports_user_id ON public.zoom_ai_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_zoom_ai_reports_meeting_id ON public.zoom_ai_reports(meeting_id);


-- 15. Zoom Pending Actions (Confirmations)
CREATE TABLE IF NOT EXISTS public.zoom_pending_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chat_id uuid REFERENCES public.chats(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE,
  action_type text NOT NULL, -- e.g., 'create_meeting'
  payload jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending', -- pending, accepted, rejected, failed, expired
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  completed_at timestamptz
);
ALTER TABLE public.zoom_pending_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own zoom_pending_actions" ON public.zoom_pending_actions;
CREATE POLICY "Users can view own zoom_pending_actions" ON public.zoom_pending_actions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own zoom_pending_actions" ON public.zoom_pending_actions;
CREATE POLICY "Users can insert own zoom_pending_actions" ON public.zoom_pending_actions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own zoom_pending_actions" ON public.zoom_pending_actions;
CREATE POLICY "Users can update own zoom_pending_actions" ON public.zoom_pending_actions FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own zoom_pending_actions" ON public.zoom_pending_actions;
CREATE POLICY "Users can delete own zoom_pending_actions" ON public.zoom_pending_actions FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_zoom_pending_actions_user_id ON public.zoom_pending_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_zoom_pending_actions_chat_id ON public.zoom_pending_actions(chat_id);
CREATE INDEX IF NOT EXISTS idx_zoom_pending_actions_message_id ON public.zoom_pending_actions(message_id);

DROP TRIGGER IF EXISTS trigger_update_zoom_pending_actions_updated_at ON public.zoom_pending_actions;
CREATE TRIGGER trigger_update_zoom_pending_actions_updated_at
  BEFORE UPDATE ON public.zoom_pending_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();






