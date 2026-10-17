-- ==============================================================================
-- Migration: Sprint 4 Lookbook Builder (Outfits, Outfit Items, Yay/Nay Votes & RLS)
-- File: supabase/migrations/20261019000000_sprint4_lookbooks.sql
-- Target: Supabase Postgres
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Custom Types & ENUMs
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outfit_visibility') THEN
    CREATE TYPE public.outfit_visibility AS ENUM (
      'private',
      'circle_public'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outfit_vote_type') THEN
    CREATE TYPE public.outfit_vote_type AS ENUM (
      'yay',
      'nay'
    );
  END IF;
END $$;

-- Extend circle_activity_type ENUM to support shared lookbook cards in the Drama Feed
ALTER TYPE public.circle_activity_type ADD VALUE IF NOT EXISTS 'shared_outfit';

-- ------------------------------------------------------------------------------
-- 2. Outfits Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outfits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  circle_id UUID REFERENCES public.circles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  visibility public.outfit_visibility NOT NULL DEFAULT 'private',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT outfits_title_length_check CHECK (char_length(trim(title)) BETWEEN 1 AND 80),
  CONSTRAINT outfits_circle_public_requires_circle CHECK (
    visibility = 'private' OR circle_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_outfits_creator_id ON public.outfits (creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outfits_circle_id ON public.outfits (circle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outfits_visibility ON public.outfits (visibility);

-- ------------------------------------------------------------------------------
-- 3. Outfit Items Junction Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outfit_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outfit_id UUID NOT NULL REFERENCES public.outfits(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT outfit_items_unique_outfit_item UNIQUE (outfit_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_outfit_items_outfit_id ON public.outfit_items (outfit_id);
CREATE INDEX IF NOT EXISTS idx_outfit_items_item_id ON public.outfit_items (item_id);

-- ------------------------------------------------------------------------------
-- 4. Outfit Votes Table (Yay / Nay Polling)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outfit_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outfit_id UUID NOT NULL REFERENCES public.outfits(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vote public.outfit_vote_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT outfit_votes_unique_outfit_voter UNIQUE (outfit_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_outfit_votes_outfit_id ON public.outfit_votes (outfit_id);
CREATE INDEX IF NOT EXISTS idx_outfit_votes_voter_id ON public.outfit_votes (voter_id);

-- ------------------------------------------------------------------------------
-- 5. Extend Circle Activity Table with target_outfit_id
-- ------------------------------------------------------------------------------
ALTER TABLE public.circle_activity
ADD COLUMN IF NOT EXISTS target_outfit_id UUID REFERENCES public.outfits(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_circle_activity_target_outfit_id
ON public.circle_activity (target_outfit_id);

-- ------------------------------------------------------------------------------
-- 6. Security Definer Helper Functions (Prevents RLS Recursion)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_outfit_creator(lookup_outfit_id UUID, lookup_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.outfits
    WHERE id = lookup_outfit_id
      AND creator_id = lookup_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_outfit(lookup_outfit_id UUID, lookup_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.outfits o
    WHERE o.id = lookup_outfit_id
      AND (
        o.creator_id = lookup_user_id
        OR (
          o.visibility = 'circle_public'
          AND o.circle_id IS NOT NULL
          AND public.is_circle_member(o.circle_id, lookup_user_id)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_vote_on_outfit(lookup_outfit_id UUID, lookup_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.outfits o
    WHERE o.id = lookup_outfit_id
      AND o.visibility = 'circle_public'
      AND o.circle_id IS NOT NULL
      AND public.is_circle_member(o.circle_id, lookup_user_id)
  );
$$;

-- Update is_item_shared_with_user so items included in a circle_public outfit
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
  );
$$;

-- ------------------------------------------------------------------------------
-- 7. Outfits RLS Policies
-- ------------------------------------------------------------------------------
ALTER TABLE public.outfits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "outfits_select_policy" ON public.outfits;
DROP POLICY IF EXISTS "outfits_insert_policy" ON public.outfits;
DROP POLICY IF EXISTS "outfits_update_policy" ON public.outfits;
DROP POLICY IF EXISTS "outfits_delete_policy" ON public.outfits;

-- Outfits are viewable if creator_id = auth.uid() OR
-- (visibility = 'circle_public' AND user is an approved member of circle_id)
CREATE POLICY "outfits_select_policy"
ON public.outfits
FOR SELECT
TO authenticated
USING (
  auth.uid() = creator_id
  OR (
    visibility = 'circle_public'
    AND circle_id IS NOT NULL
    AND public.is_circle_member(circle_id, auth.uid())
  )
);

-- Authenticated users can create outfits they own (if linked to a circle, must be an approved member)
CREATE POLICY "outfits_insert_policy"
ON public.outfits
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = creator_id
  AND (
    circle_id IS NULL
    OR public.is_circle_member(circle_id, auth.uid())
  )
);

-- Creators can update their own outfits (e.g. toggle visibility or title)
CREATE POLICY "outfits_update_policy"
ON public.outfits
FOR UPDATE
TO authenticated
USING (auth.uid() = creator_id)
WITH CHECK (
  auth.uid() = creator_id
  AND (
    circle_id IS NULL
    OR public.is_circle_member(circle_id, auth.uid())
  )
);

-- Creators can delete their own outfits
CREATE POLICY "outfits_delete_policy"
ON public.outfits
FOR DELETE
TO authenticated
USING (auth.uid() = creator_id);

-- ------------------------------------------------------------------------------
-- 8. Outfit Items RLS Policies
-- ------------------------------------------------------------------------------
ALTER TABLE public.outfit_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "outfit_items_select_policy" ON public.outfit_items;
DROP POLICY IF EXISTS "outfit_items_insert_policy" ON public.outfit_items;
DROP POLICY IF EXISTS "outfit_items_delete_policy" ON public.outfit_items;

-- Outfit items are viewable whenever the parent outfit is viewable by the user
CREATE POLICY "outfit_items_select_policy"
ON public.outfit_items
FOR SELECT
TO authenticated
USING (
  public.can_view_outfit(outfit_id, auth.uid())
);

-- Outfit creator can add items they own or items shared with them in a circle
CREATE POLICY "outfit_items_insert_policy"
ON public.outfit_items
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_outfit_creator(outfit_id, auth.uid())
  AND (
    public.is_item_owner(item_id, auth.uid())
    OR public.is_item_shared_with_user(item_id, auth.uid())
  )
);

-- Outfit creator can remove items from their outfit
CREATE POLICY "outfit_items_delete_policy"
ON public.outfit_items
FOR DELETE
TO authenticated
USING (
  public.is_outfit_creator(outfit_id, auth.uid())
);

-- ------------------------------------------------------------------------------
-- 9. Outfit Votes RLS Policies
-- ------------------------------------------------------------------------------
ALTER TABLE public.outfit_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "outfit_votes_select_policy" ON public.outfit_votes;
DROP POLICY IF EXISTS "outfit_votes_insert_policy" ON public.outfit_votes;
DROP POLICY IF EXISTS "outfit_votes_update_policy" ON public.outfit_votes;
DROP POLICY IF EXISTS "outfit_votes_delete_policy" ON public.outfit_votes;

-- Votes are viewable by circle members (and the outfit creator)
CREATE POLICY "outfit_votes_select_policy"
ON public.outfit_votes
FOR SELECT
TO authenticated
USING (
  public.can_view_outfit(outfit_id, auth.uid())
);

-- Approved circle members can cast a vote on circle_public outfits
CREATE POLICY "outfit_votes_insert_policy"
ON public.outfit_votes
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = voter_id
  AND public.can_vote_on_outfit(outfit_id, auth.uid())
);

-- Voters can change their own vote (yay <-> nay) on circle_public outfits
CREATE POLICY "outfit_votes_update_policy"
ON public.outfit_votes
FOR UPDATE
TO authenticated
USING (
  auth.uid() = voter_id
  AND public.can_vote_on_outfit(outfit_id, auth.uid())
)
WITH CHECK (
  auth.uid() = voter_id
  AND public.can_vote_on_outfit(outfit_id, auth.uid())
);

-- Voters can remove their own vote (or outfit creator when managing outfit)
CREATE POLICY "outfit_votes_delete_policy"
ON public.outfit_votes
FOR DELETE
TO authenticated
USING (
  auth.uid() = voter_id
  OR public.is_outfit_creator(outfit_id, auth.uid())
);
