-- ============================================================================
-- PLACK AI DOCUMENT WORKSPACE - SUPABASE SQL SCHEMA MIGRATION
-- Production-Ready, Re-runnable, Safe for Existing Data
-- Target Database: PostgreSQL / Supabase
-- ============================================================================

-- 1. UTILITY TRIGGERS & FUNCTIONS
-- Create a generic handle_updated_at function if it does not yet exist
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. CREATE / MIGRATE DOCUMENTS TABLE
-- Supports ChatGPT-style Canvas, Claude Artifacts, Document preview cards, and fullscreen mobile document viewing
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id uuid REFERENCES public.chats(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  document_type text DEFAULT 'document',
  metadata jsonb DEFAULT '{}'::jsonb,
  version_snapshots jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Ensure schema compatibility and fix existing PGRST204/PGRST205 issues
-- Handled by safely adding columns with ALTER TABLE ... ADD COLUMN IF NOT EXISTS
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS document_type text DEFAULT 'document';
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS version_snapshots jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS chat_id uuid;

-- Safely add/refresh foreign keys if necessary
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'documents_chat_id_fkey' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.documents 
    ADD CONSTRAINT documents_chat_id_fkey 
    FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE;
  END IF;
END $$;


-- 3. CREATE / MIGRATE DOCUMENT VERSIONS TABLE
-- Backs rich redo, undo, version history, and restore capacities
CREATE TABLE IF NOT EXISTS public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  content text NOT NULL,
  title text NOT NULL DEFAULT '',
  version integer DEFAULT 1 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Explicitly verify column consistency for document_versions
ALTER TABLE public.document_versions ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';
ALTER TABLE public.document_versions ADD COLUMN IF NOT EXISTS version integer DEFAULT 1 NOT NULL;


-- 4. CREATE / MIGRATE DOCUMENT COMMENTS TABLE
-- Prepared for full social collaboration, selection-anchored text commenting, and annotation
CREATE TABLE IF NOT EXISTS public.document_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  selection_start integer,
  selection_end integer,
  selection_text text,
  comment text NOT NULL,
  author text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Ensure user_id, selection, and author columns exist
ALTER TABLE public.document_comments ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.document_comments ADD COLUMN IF NOT EXISTS selection_start integer;
ALTER TABLE public.document_comments ADD COLUMN IF NOT EXISTS selection_end integer;
ALTER TABLE public.document_comments ADD COLUMN IF NOT EXISTS selection_text text;
ALTER TABLE public.document_comments ADD COLUMN IF NOT EXISTS author text;


-- 5. AUTOMATED UPDATE TRIGGERS
-- Safely bind the updated_at modifier to public.documents
DROP TRIGGER IF EXISTS trigger_update_documents_updated_at ON public.documents;
CREATE TRIGGER trigger_update_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();


-- 6. INDEXES OPTIMIZATION
-- Speeds up queries involving specific users, chats, active document references and timelines
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_chat_id ON public.documents(chat_id);
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON public.documents(updated_at);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON public.documents(created_at);

CREATE INDEX IF NOT EXISTS idx_document_versions_document_id ON public.document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_document_versions_created_at ON public.document_versions(created_at);

CREATE INDEX IF NOT EXISTS idx_document_comments_document_id ON public.document_comments(document_id);
CREATE INDEX IF NOT EXISTS idx_document_comments_user_id ON public.document_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_document_comments_created_at ON public.document_comments(created_at);


-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- Ensure that users are fully encapsulated and can ONLY view/edit/delete their own resources
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_comments ENABLE ROW LEVEL SECURITY;

-- documents table policies
DROP POLICY IF EXISTS "Users can view own documents" ON public.documents;
CREATE POLICY "Users can view own documents" ON public.documents 
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own documents" ON public.documents;
CREATE POLICY "Users can insert own documents" ON public.documents 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own documents" ON public.documents;
CREATE POLICY "Users can update own documents" ON public.documents 
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own documents" ON public.documents;
CREATE POLICY "Users can delete own documents" ON public.documents 
  FOR DELETE USING (auth.uid() = user_id);

-- document_versions table policies
DROP POLICY IF EXISTS "Users can view own document versions" ON public.document_versions;
CREATE POLICY "Users can view own document versions" ON public.document_versions 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.documents d 
      WHERE d.id = document_id AND d.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own document versions" ON public.document_versions;
CREATE POLICY "Users can insert own document versions" ON public.document_versions 
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents d 
      WHERE d.id = document_id AND d.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own document versions" ON public.document_versions;
CREATE POLICY "Users can update own document versions" ON public.document_versions 
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.documents d 
      WHERE d.id = document_id AND d.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own document versions" ON public.document_versions;
CREATE POLICY "Users can delete own document versions" ON public.document_versions 
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.documents d 
      WHERE d.id = document_id AND d.user_id = auth.uid()
    )
  );

-- document_comments table policies
DROP POLICY IF EXISTS "Users can view own document comments" ON public.document_comments;
CREATE POLICY "Users can view own document comments" ON public.document_comments 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.documents d 
      WHERE d.id = document_id AND d.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own document comments" ON public.document_comments;
CREATE POLICY "Users can insert own document comments" ON public.document_comments 
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents d 
      WHERE d.id = document_id AND d.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own document comments" ON public.document_comments;
CREATE POLICY "Users can update own document comments" ON public.document_comments 
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.documents d 
      WHERE d.id = document_id AND d.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own document comments" ON public.document_comments;
CREATE POLICY "Users can delete own document comments" ON public.document_comments 
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.documents d 
      WHERE d.id = document_id AND d.user_id = auth.uid()
    )
  );


-- 8. CLINICAL HEALTH DIAGNOSTICS FUNCTION
-- Designed to help developers instantly read database status from applications
CREATE OR REPLACE FUNCTION public.document_system_diagnostics()
RETURNS TABLE (
  documents_exists boolean,
  document_versions_exists boolean,
  metadata_exists boolean,
  version_snapshots_exists boolean,
  rls_enabled boolean
) AS $$
DECLARE
  v_docs_exists boolean;
  v_vers_exists boolean;
  v_meta_exists boolean;
  v_snapshots_exists boolean;
  v_rls_enabled boolean;
BEGIN
  -- Check if documents table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'documents'
  ) INTO v_docs_exists;

  -- Check if document_versions table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'document_versions'
  ) INTO v_vers_exists;

  -- Check if metadata column exists in documents table
  IF v_docs_exists THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'metadata'
    ) INTO v_meta_exists;
    
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'version_snapshots'
    ) INTO v_snapshots_exists;

    SELECT rowsecurity FROM pg_tables 
    WHERE schemaname = 'public' AND tablename = 'documents'
    INTO v_rls_enabled;
  ELSE
    v_meta_exists := false;
    v_snapshots_exists := false;
    v_rls_enabled := false;
  END IF;

  RETURN QUERY SELECT 
    v_docs_exists, 
    v_vers_exists, 
    v_meta_exists, 
    v_snapshots_exists, 
    v_rls_enabled;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 9. CREATE / MIGRATE CONNECTIONS TABLE
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


-- 10. ZOOM 3.0 PERSISTENT TABLES
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


-- 11. RELOAD SCHEMA CACHE
-- Forces PostgREST to instantly reload definitions and resolves stale cache issues (PGRST205 / PGRST204)
NOTIFY pgrst, 'reload schema';

