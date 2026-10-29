-- ==============================================================================
-- Migration: Sprint 5 SOS Events & Item Suggestions (Tables, ENUMs & Anti-Recursion RLS)
-- File: supabase/migrations/20261029000000_sprint5_sos_events.sql
-- Target: Supabase Postgres
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Custom Types & ENUMs
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sos_request_status') THEN
    CREATE TYPE public.sos_request_status AS ENUM (
      'active',
      'fulfilled',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sos_suggestion_status') THEN
    CREATE TYPE public.sos_suggestion_status AS ENUM (
      'suggested',
      'accepted',
      'declined'
    );
  END IF;
END $$;

-- Extend circle_activity_type ENUM to support SOS events and suggestions in Drama Feed
ALTER TYPE public.circle_activity_type ADD VALUE IF NOT EXISTS 'sos_request';
ALTER TYPE public.circle_activity_type ADD VALUE IF NOT EXISTS 'sos_suggestion';

-- ------------------------------------------------------------------------------
-- 2. SOS Requests Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sos_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  circle_id UUID NOT NULL REFERENCES public.circles(id) ON DELETE CASCADE,
  event_description TEXT NOT NULL,
  target_date DATE NOT NULL,
  status public.sos_request_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT sos_requests_description_length_check CHECK (char_length(trim(event_description)) >= 3)
);

CREATE INDEX IF NOT EXISTS idx_sos_requests_circle_id ON public.sos_requests (circle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sos_requests_requester_id ON public.sos_requests (requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sos_requests_status ON public.sos_requests (status);
CREATE INDEX IF NOT EXISTS idx_sos_requests_target_date ON public.sos_requests (target_date);

-- ------------------------------------------------------------------------------
-- 3. SOS Suggestions Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sos_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sos_id UUID NOT NULL REFERENCES public.sos_requests(id) ON DELETE CASCADE,
  suggester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  status public.sos_suggestion_status NOT NULL DEFAULT 'suggested',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT sos_suggestions_unique_sos_item UNIQUE (sos_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_sos_suggestions_sos_id ON public.sos_suggestions (sos_id);
CREATE INDEX IF NOT EXISTS idx_sos_suggestions_suggester_id ON public.sos_suggestions (suggester_id);
CREATE INDEX IF NOT EXISTS idx_sos_suggestions_item_id ON public.sos_suggestions (item_id);
CREATE INDEX IF NOT EXISTS idx_sos_suggestions_status ON public.sos_suggestions (status);

-- ------------------------------------------------------------------------------
-- 4. Extend Circle Activity Table with target_sos_id
-- ------------------------------------------------------------------------------
ALTER TABLE public.circle_activity
ADD COLUMN IF NOT EXISTS target_sos_id UUID REFERENCES public.sos_requests(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_circle_activity_target_sos_id
ON public.circle_activity (target_sos_id);

-- ------------------------------------------------------------------------------
-- 5. Security Definer Helper Functions (Prevents RLS Recursion)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_sos(lookup_sos_id UUID, lookup_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sos_requests sr
    WHERE sr.id = lookup_sos_id
      AND (
        sr.requester_id = lookup_user_id
        OR public.is_circle_member(sr.circle_id, lookup_user_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_sos_requester(lookup_sos_id UUID, lookup_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sos_requests
    WHERE id = lookup_sos_id
      AND requester_id = lookup_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_sos_suggester(lookup_suggestion_id UUID, lookup_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sos_suggestions
    WHERE id = lookup_suggestion_id
      AND suggester_id = lookup_user_id
  );
$$;

-- Update is_item_shared_with_user so items suggested for an active/fulfilled SOS request
-- are also visible to approved members of that circle
CREATE OR REPLACE FUNCTION public.is_item_shared_with_user(lookup_item_id UUID, lookup_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.circle_items ci
    JOIN public.circle_members cm ON cm.circle_id = ci.circle_id
    WHERE ci.item_id = lookup_item_id
      AND cm.user_id = lookup_user_id
      AND cm.status = 'approved'
  )
  OR EXISTS (
    SELECT 1
    FROM public.outfit_items oi
    JOIN public.outfits o ON o.id = oi.outfit_id
    JOIN public.circle_members cm ON cm.circle_id = o.circle_id
    WHERE oi.item_id = lookup_item_id
      AND o.visibility = 'circle_public'
      AND o.circle_id IS NOT NULL
      AND cm.user_id = lookup_user_id
      AND cm.status = 'approved'
  )
  OR EXISTS (
    SELECT 1
    FROM public.sos_suggestions ss
    JOIN public.sos_requests sr ON sr.id = ss.sos_id
    JOIN public.circle_members cm ON cm.circle_id = sr.circle_id
    WHERE ss.item_id = lookup_item_id
      AND cm.user_id = lookup_user_id
      AND cm.status = 'approved'
  );
$$;

-- ------------------------------------------------------------------------------
-- 6. SOS Requests RLS Policies
-- ------------------------------------------------------------------------------
ALTER TABLE public.sos_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sos_requests_select_policy" ON public.sos_requests;
DROP POLICY IF EXISTS "sos_requests_insert_policy" ON public.sos_requests;
DROP POLICY IF EXISTS "sos_requests_update_policy" ON public.sos_requests;
DROP POLICY IF EXISTS "sos_requests_delete_policy" ON public.sos_requests;

-- Approved circle members or requester can view SOS requests in their circles
CREATE POLICY "sos_requests_select_policy"
ON public.sos_requests
FOR SELECT
TO authenticated
USING (
  requester_id = auth.uid()
  OR public.is_circle_member(circle_id, auth.uid())
);

-- Approved circle members can insert an SOS request
CREATE POLICY "sos_requests_insert_policy"
ON public.sos_requests
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = requester_id
  AND public.is_circle_member(circle_id, auth.uid())
);

-- Requester or circle admin can update their SOS request
CREATE POLICY "sos_requests_update_policy"
ON public.sos_requests
FOR UPDATE
TO authenticated
USING (
  auth.uid() = requester_id
  OR public.is_circle_admin(circle_id, auth.uid())
)
WITH CHECK (
  auth.uid() = requester_id
  OR public.is_circle_admin(circle_id, auth.uid())
);

-- Requester or circle admin can delete their SOS request
CREATE POLICY "sos_requests_delete_policy"
ON public.sos_requests
FOR DELETE
TO authenticated
USING (
  auth.uid() = requester_id
  OR public.is_circle_admin(circle_id, auth.uid())
);

-- ------------------------------------------------------------------------------
-- 7. SOS Suggestions RLS Policies
-- ------------------------------------------------------------------------------
ALTER TABLE public.sos_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sos_suggestions_select_policy" ON public.sos_suggestions;
DROP POLICY IF EXISTS "sos_suggestions_insert_policy" ON public.sos_suggestions;
DROP POLICY IF EXISTS "sos_suggestions_update_policy" ON public.sos_suggestions;
DROP POLICY IF EXISTS "sos_suggestions_delete_policy" ON public.sos_suggestions;

-- Circle members who can view the SOS request can view its suggestions
CREATE POLICY "sos_suggestions_select_policy"
ON public.sos_suggestions
FOR SELECT
TO authenticated
USING (
  auth.uid() = suggester_id
  OR public.can_view_sos(sos_id, auth.uid())
);

-- Users can insert suggestions if they own the item_id and belong to the SOS circle
CREATE POLICY "sos_suggestions_insert_policy"
ON public.sos_suggestions
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = suggester_id
  AND public.can_view_sos(sos_id, auth.uid())
  AND public.is_item_owner(item_id, auth.uid())
);

-- Suggester or SOS requester can update suggestion status (e.g. accepted, declined)
CREATE POLICY "sos_suggestions_update_policy"
ON public.sos_suggestions
FOR UPDATE
TO authenticated
USING (
  auth.uid() = suggester_id
  OR public.is_sos_requester(sos_id, auth.uid())
)
WITH CHECK (
  auth.uid() = suggester_id
  OR public.is_sos_requester(sos_id, auth.uid())
);

-- Suggester or SOS requester can delete suggestion
CREATE POLICY "sos_suggestions_delete_policy"
ON public.sos_suggestions
FOR DELETE
TO authenticated
USING (
  auth.uid() = suggester_id
  OR public.is_sos_requester(sos_id, auth.uid())
);
