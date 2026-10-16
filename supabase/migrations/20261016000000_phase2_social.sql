-- ==============================================================================
-- Migration: Phase 2 Social Engine (Profiles, Friendships, Circles & Sharing)
-- File: supabase/migrations/20261016000000_phase2_social.sql
-- Target: Supabase Postgres
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Custom Types & ENUMs
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'friendship_status') THEN
    CREATE TYPE public.friendship_status AS ENUM ('pending', 'accepted');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'circle_role') THEN
    CREATE TYPE public.circle_role AS ENUM ('admin', 'member');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'circle_member_status') THEN
    CREATE TYPE public.circle_member_status AS ENUM ('pending', 'approved');
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. Profiles Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Search and lookup indexes
CREATE INDEX IF NOT EXISTS idx_profiles_email_lower ON public.profiles (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_profiles_full_name_lower ON public.profiles (LOWER(full_name));

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop legacy/existing policies
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;

-- Authenticated users can view profiles (to search friends and view circle members)
CREATE POLICY "profiles_select_policy"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Authenticated users can only insert their own profile
CREATE POLICY "profiles_insert_policy"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Authenticated users can only update their own profile
CREATE POLICY "profiles_update_policy"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- ------------------------------------------------------------------------------
-- 3. Trigger & Function: Auto-create Profile on auth.users Signup
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  extracted_name TEXT;
BEGIN
  extracted_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (id, full_name, email, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(extracted_name, 'Drobe Member'),
    NEW.email,
    COALESCE(NEW.created_at, timezone('utc'::text, now())),
    timezone('utc'::text, now())
  )
  ON CONFLICT (id) DO UPDATE
  SET
    full_name = CASE 
      WHEN public.profiles.full_name = '' OR public.profiles.full_name IS NULL 
      THEN EXCLUDED.full_name 
      ELSE public.profiles.full_name 
    END,
    email = EXCLUDED.email,
    updated_at = timezone('utc'::text, now());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 4. Friendships Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.friendship_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT friendships_no_self_friending CHECK (requester_id <> addressee_id)
);

-- Unique friendship regardless of who initiated (requester_id, addressee_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_friendships_canonical_pair
ON public.friendships (
  LEAST(requester_id, addressee_id),
  GREATEST(requester_id, addressee_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_requester ON public.friendships (requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON public.friendships (addressee_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON public.friendships (status);

-- Enable RLS
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "friendships_select_policy" ON public.friendships;
DROP POLICY IF EXISTS "friendships_insert_policy" ON public.friendships;
DROP POLICY IF EXISTS "friendships_update_policy" ON public.friendships;
DROP POLICY IF EXISTS "friendships_delete_policy" ON public.friendships;

-- Users can view friendships where they are either the requester or addressee
CREATE POLICY "friendships_select_policy"
ON public.friendships
FOR SELECT
TO authenticated
USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Authenticated users can only send friend requests where they are the requester and status is pending
CREATE POLICY "friendships_insert_policy"
ON public.friendships
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = requester_id
  AND status = 'pending'
);

-- Either participant can update (e.g. addressee accepts, or either blocks/updates)
CREATE POLICY "friendships_update_policy"
ON public.friendships
FOR UPDATE
TO authenticated
USING (auth.uid() = requester_id OR auth.uid() = addressee_id)
WITH CHECK (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Either user can unfriend or cancel a request
CREATE POLICY "friendships_delete_policy"
ON public.friendships
FOR DELETE
TO authenticated
USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- ------------------------------------------------------------------------------
-- 5. Circles Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.circles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_circles_name_lower ON public.circles (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_circles_created_by ON public.circles (created_by);

ALTER TABLE public.circles ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 6. Circle Members Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.circle_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id UUID NOT NULL REFERENCES public.circles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.circle_role NOT NULL DEFAULT 'member',
  status public.circle_member_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT circle_members_unique_circle_user UNIQUE (circle_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_circle_members_circle_id ON public.circle_members (circle_id);
CREATE INDEX IF NOT EXISTS idx_circle_members_user_id ON public.circle_members (user_id);
CREATE INDEX IF NOT EXISTS idx_circle_members_status ON public.circle_members (status);

ALTER TABLE public.circle_members ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 7. Security Definer Helper Functions (Prevents RLS Recursion)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_circle_admin(lookup_circle_id UUID, lookup_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.circle_members
    WHERE circle_id = lookup_circle_id
      AND user_id = lookup_user_id
      AND role = 'admin'
      AND status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_circle_member(lookup_circle_id UUID, lookup_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.circle_members
    WHERE circle_id = lookup_circle_id
      AND user_id = lookup_user_id
      AND status = 'approved'
  );
$$;

-- ------------------------------------------------------------------------------
-- 8. Trigger: Automatically make Circle Creator an Approved Admin
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_circle_creator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.circle_members (circle_id, user_id, role, status)
  VALUES (NEW.id, NEW.created_by, 'admin', 'approved')
  ON CONFLICT (circle_id, user_id) DO UPDATE
  SET role = 'admin', status = 'approved';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_circle_created_add_admin ON public.circles;

CREATE TRIGGER on_circle_created_add_admin
AFTER INSERT ON public.circles
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_circle_creator();

-- ------------------------------------------------------------------------------
-- 9. Circles RLS Policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "circles_select_policy" ON public.circles;
DROP POLICY IF EXISTS "circles_insert_policy" ON public.circles;
DROP POLICY IF EXISTS "circles_update_policy" ON public.circles;
DROP POLICY IF EXISTS "circles_delete_policy" ON public.circles;

-- Authenticated users can view circles (enables community discovery & search)
CREATE POLICY "circles_select_policy"
ON public.circles
FOR SELECT
TO authenticated
USING (true);

-- Authenticated users can create a circle where created_by matches their auth.uid()
CREATE POLICY "circles_insert_policy"
ON public.circles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

-- Only approved circle admins can update circle details
CREATE POLICY "circles_update_policy"
ON public.circles
FOR UPDATE
TO authenticated
USING (public.is_circle_admin(id, auth.uid()))
WITH CHECK (public.is_circle_admin(id, auth.uid()));

-- Only approved circle admins can delete circle
CREATE POLICY "circles_delete_policy"
ON public.circles
FOR DELETE
TO authenticated
USING (public.is_circle_admin(id, auth.uid()));

-- ------------------------------------------------------------------------------
-- 10. Circle Members RLS Policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "circle_members_select_policy" ON public.circle_members;
DROP POLICY IF EXISTS "circle_members_insert_policy" ON public.circle_members;
DROP POLICY IF EXISTS "circle_members_update_policy" ON public.circle_members;
DROP POLICY IF EXISTS "circle_members_delete_policy" ON public.circle_members;

-- Users can view approved members in circles, or view their own record, or admins view all
CREATE POLICY "circle_members_select_policy"
ON public.circle_members
FOR SELECT
TO authenticated
USING (
  status = 'approved'
  OR user_id = auth.uid()
  OR public.is_circle_admin(circle_id, auth.uid())
);

-- Users can request to join (status pending, role member), or admins can invite/add
CREATE POLICY "circle_members_insert_policy"
ON public.circle_members
FOR INSERT
TO authenticated
WITH CHECK (
  (user_id = auth.uid() AND status = 'pending' AND role = 'member')
  OR public.is_circle_admin(circle_id, auth.uid())
);

-- Admins can approve/update roles, or invited users can accept their membership
CREATE POLICY "circle_members_update_policy"
ON public.circle_members
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_circle_admin(circle_id, auth.uid())
)
WITH CHECK (
  user_id = auth.uid()
  OR public.is_circle_admin(circle_id, auth.uid())
);

-- Users can leave / cancel request, or admins can remove members
CREATE POLICY "circle_members_delete_policy"
ON public.circle_members
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_circle_admin(circle_id, auth.uid())
);

-- ------------------------------------------------------------------------------
-- 11. Circle Items Junction Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.circle_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id UUID NOT NULL REFERENCES public.circles(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT circle_items_unique_circle_item UNIQUE (circle_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_circle_items_circle_id ON public.circle_items (circle_id);
CREATE INDEX IF NOT EXISTS idx_circle_items_item_id ON public.circle_items (item_id);
CREATE INDEX IF NOT EXISTS idx_circle_items_shared_by ON public.circle_items (shared_by);

ALTER TABLE public.circle_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "circle_items_select_policy" ON public.circle_items;
DROP POLICY IF EXISTS "circle_items_insert_policy" ON public.circle_items;
DROP POLICY IF EXISTS "circle_items_delete_policy" ON public.circle_items;

-- Approved circle members can view items shared to their circles
CREATE POLICY "circle_items_select_policy"
ON public.circle_items
FOR SELECT
TO authenticated
USING (public.is_circle_member(circle_id, auth.uid()));

-- Approved circle members who own the item can share it to the circle
CREATE POLICY "circle_items_insert_policy"
ON public.circle_items
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = shared_by
  AND public.is_circle_member(circle_id, auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.id = item_id AND i.owner_id = auth.uid()
  )
);

-- User who shared, item owner, or circle admin can unshare/remove item
CREATE POLICY "circle_items_delete_policy"
ON public.circle_items
FOR DELETE
TO authenticated
USING (
  auth.uid() = shared_by
  OR public.is_circle_admin(circle_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.id = item_id AND i.owner_id = auth.uid()
  )
);

-- ------------------------------------------------------------------------------
-- 12. Update Main Items Table RLS (Owner OR Shared in Mutual Circle)
-- ------------------------------------------------------------------------------
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
  );
$$;

-- Drop existing SELECT policy on items and replace with circle-aware policy
DROP POLICY IF EXISTS "items_select_owner_policy" ON public.items;
DROP POLICY IF EXISTS "items_select_owner_or_circle_policy" ON public.items;

CREATE POLICY "items_select_owner_or_circle_policy"
ON public.items
FOR SELECT
TO authenticated
USING (
  auth.uid() = owner_id
  OR public.is_item_shared_with_user(id, auth.uid())
);

-- ------------------------------------------------------------------------------
-- 13. Backfill Existing auth.users into public.profiles
-- ------------------------------------------------------------------------------
INSERT INTO public.profiles (id, full_name, email, created_at, updated_at)
SELECT
  u.id,
  COALESCE(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(u.email, '@', 1),
    'Drobe Member'
  ) AS full_name,
  COALESCE(u.email, '') AS email,
  COALESCE(u.created_at, timezone('utc'::text, now())) AS created_at,
  timezone('utc'::text, now()) AS updated_at
FROM auth.users u
ON CONFLICT (id) DO UPDATE
SET
  full_name = CASE
    WHEN public.profiles.full_name = '' OR public.profiles.full_name IS NULL
    THEN EXCLUDED.full_name
    ELSE public.profiles.full_name
  END,
  email = EXCLUDED.email,
  updated_at = timezone('utc'::text, now());
