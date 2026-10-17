-- ==============================================================================
-- Migration: Sprint 3 Circle Engine (Borrow Requests, Activity / Drama Feed & RLS)
-- File: supabase/migrations/20261018000000_sprint3_circles.sql
-- Target: Supabase Postgres
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Custom Types & ENUMs
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'borrow_request_status') THEN
    CREATE TYPE public.borrow_request_status AS ENUM (
      'pending',
      'approved',
      'rejected',
      'returned'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'circle_activity_type') THEN
    CREATE TYPE public.circle_activity_type AS ENUM (
      'shared_item',
      'borrowed_item',
      'public_nudge'
    );
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. Security Definer Helper: Item Ownership Check (Prevents RLS Recursion)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_item_owner(lookup_item_id UUID, lookup_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.items
    WHERE id = lookup_item_id
      AND owner_id = lookup_user_id
  );
$$;

-- ------------------------------------------------------------------------------
-- 3. Borrow Requests Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.borrow_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  circle_id UUID NOT NULL REFERENCES public.circles(id) ON DELETE CASCADE,
  status public.borrow_request_status NOT NULL DEFAULT 'pending',
  duration_intent TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT borrow_requests_duration_not_empty CHECK (length(trim(duration_intent)) > 0)
);

-- Indexes for fast lookup by item, requester, circle, and status
CREATE INDEX IF NOT EXISTS idx_borrow_requests_item_id ON public.borrow_requests (item_id);
CREATE INDEX IF NOT EXISTS idx_borrow_requests_requester_id ON public.borrow_requests (requester_id);
CREATE INDEX IF NOT EXISTS idx_borrow_requests_circle_id ON public.borrow_requests (circle_id);
CREATE INDEX IF NOT EXISTS idx_borrow_requests_status ON public.borrow_requests (status);

-- Prevent duplicate active pending borrow requests by the same user for the same item in a circle
CREATE UNIQUE INDEX IF NOT EXISTS idx_borrow_requests_unique_pending
ON public.borrow_requests (item_id, requester_id, circle_id)
WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.borrow_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "borrow_requests_select_policy" ON public.borrow_requests;
DROP POLICY IF EXISTS "borrow_requests_insert_policy" ON public.borrow_requests;
DROP POLICY IF EXISTS "borrow_requests_update_policy" ON public.borrow_requests;
DROP POLICY IF EXISTS "borrow_requests_delete_policy" ON public.borrow_requests;

-- Borrow requests are viewable by the requester and the item owner
CREATE POLICY "borrow_requests_select_policy"
ON public.borrow_requests
FOR SELECT
TO authenticated
USING (
  auth.uid() = requester_id
  OR public.is_item_owner(item_id, auth.uid())
);

-- Approved circle members can request to borrow items they do not own
CREATE POLICY "borrow_requests_insert_policy"
ON public.borrow_requests
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = requester_id
  AND status = 'pending'
  AND public.is_circle_member(circle_id, auth.uid())
  AND NOT public.is_item_owner(item_id, auth.uid())
);

-- Requester or item owner can update borrow request status (e.g., approve, reject, return)
CREATE POLICY "borrow_requests_update_policy"
ON public.borrow_requests
FOR UPDATE
TO authenticated
USING (
  auth.uid() = requester_id
  OR public.is_item_owner(item_id, auth.uid())
)
WITH CHECK (
  auth.uid() = requester_id
  OR public.is_item_owner(item_id, auth.uid())
);

-- Requester or item owner can delete/cancel a borrow request
CREATE POLICY "borrow_requests_delete_policy"
ON public.borrow_requests
FOR DELETE
TO authenticated
USING (
  auth.uid() = requester_id
  OR public.is_item_owner(item_id, auth.uid())
);

-- ------------------------------------------------------------------------------
-- 4. Circle Activity Table (The Drama Feed)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.circle_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id UUID NOT NULL REFERENCES public.circles(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type public.circle_activity_type NOT NULL,
  target_item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes optimized for chronological circle feed queries
CREATE INDEX IF NOT EXISTS idx_circle_activity_circle_created
ON public.circle_activity (circle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_circle_activity_actor_id
ON public.circle_activity (actor_id);
CREATE INDEX IF NOT EXISTS idx_circle_activity_target_item_id
ON public.circle_activity (target_item_id);

-- Enable RLS
ALTER TABLE public.circle_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "circle_activity_select_policy" ON public.circle_activity;
DROP POLICY IF EXISTS "circle_activity_insert_policy" ON public.circle_activity;
DROP POLICY IF EXISTS "circle_activity_delete_policy" ON public.circle_activity;

-- Standard circle-member visibility for the activity feed
CREATE POLICY "circle_activity_select_policy"
ON public.circle_activity
FOR SELECT
TO authenticated
USING (
  public.is_circle_member(circle_id, auth.uid())
);

-- Approved circle members can log activity events in their circle
CREATE POLICY "circle_activity_insert_policy"
ON public.circle_activity
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_circle_member(circle_id, auth.uid())
  AND (
    auth.uid() = actor_id
    OR (
      action_type = 'borrowed_item'
      AND target_item_id IS NOT NULL
      AND public.is_item_owner(target_item_id, auth.uid())
    )
  )
);

-- Activity creator or circle admin can remove activity entries
CREATE POLICY "circle_activity_delete_policy"
ON public.circle_activity
FOR DELETE
TO authenticated
USING (
  auth.uid() = actor_id
  OR public.is_circle_admin(circle_id, auth.uid())
);
