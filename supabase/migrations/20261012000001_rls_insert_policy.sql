-- ==============================================================================
-- Migration: Strict RLS Policies for items table
-- Version: 20261012000001_rls_insert_policy.sql
-- Enforces:
--   1. SELECT USING (auth.uid() = owner_id)
--   2. INSERT WITH CHECK (auth.uid() = owner_id)
--   3. UPDATE / DELETE restricted strictly to owner_id = auth.uid()
-- ==============================================================================

-- 1. Ensure owner_id column exists on items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'items' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE public.items 
    ADD COLUMN owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
  END IF;
END $$;

-- 2. Explicitly Enable Row Level Security (RLS) on items
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

-- 3. Drop all existing policies on items table to eliminate legacy or overly permissive rules
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'items'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.items', pol.policyname);
  END LOOP;
END $$;

-- 4. Create Strict SELECT Policy
-- Authenticated users can ONLY select items that belong to them.
CREATE POLICY "items_select_owner_policy"
ON public.items
FOR SELECT
TO authenticated
USING (auth.uid() = owner_id);

-- 5. Create Strict INSERT Policy
-- Authenticated users can ONLY insert items when owner_id explicitly matches their auth.uid()
CREATE POLICY "items_insert_owner_policy"
ON public.items
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

-- 6. Create Strict UPDATE Policy
-- Users can only modify their own items
CREATE POLICY "items_update_owner_policy"
ON public.items
FOR UPDATE
TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

-- 7. Create Strict DELETE Policy
-- Users can only delete their own items
CREATE POLICY "items_delete_owner_policy"
ON public.items
FOR DELETE
TO authenticated
USING (auth.uid() = owner_id);

-- 8. Storage bucket 'wardrobe' security policies check
INSERT INTO storage.buckets (id, name, public)
VALUES ('wardrobe', 'wardrobe', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Users can upload images to their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Public read for wardrobe images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own wardrobe images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own wardrobe images" ON storage.objects;

-- Allow authenticated users to upload to <auth.uid()>/filename
CREATE POLICY "Users can upload images to their own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'wardrobe' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Public read for images in wardrobe bucket
CREATE POLICY "Public read for wardrobe images"
ON storage.objects FOR SELECT
USING (bucket_id = 'wardrobe');

-- Manage own images
CREATE POLICY "Users can update their own wardrobe images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'wardrobe' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own wardrobe images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'wardrobe' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);
