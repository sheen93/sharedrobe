-- ==============================================================================
-- Migration: Add owner_id to items and configure Row Level Security (RLS)
-- Enables per-user wardrobe segregation and secure storage bucket access.
-- ==============================================================================

-- 1. Ensure owner_id column exists and references auth.users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'items' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE items 
    ADD COLUMN owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
  END IF;
END $$;

-- 2. Ensure is_sharable column exists (default true per PRD)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'items' AND column_name = 'is_sharable'
  ) THEN
    ALTER TABLE items 
    ADD COLUMN is_sharable BOOLEAN DEFAULT true;
  END IF;
END $$;

-- 3. Enable Row Level Security (RLS) on items
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

-- 4. Clean up any existing policies
DROP POLICY IF EXISTS "Public items access" ON items;
DROP POLICY IF EXISTS "Allow authenticated read" ON items;
DROP POLICY IF EXISTS "Users can view their own or shared items" ON items;
DROP POLICY IF EXISTS "Users can insert their own items" ON items;
DROP POLICY IF EXISTS "Users can update their own items" ON items;
DROP POLICY IF EXISTS "Users can delete their own items" ON items;

-- 5. Items Table RLS Policies
-- SELECT: Users can view their own items OR items flagged as sharable
CREATE POLICY "Users can view their own or shared items"
ON items FOR SELECT
USING (auth.uid() = owner_id OR is_sharable = true);

-- INSERT: Authenticated users can insert items owned by their UID
CREATE POLICY "Users can insert their own items"
ON items FOR INSERT
WITH CHECK (auth.uid() = owner_id);

-- UPDATE: Users can only modify their own items
CREATE POLICY "Users can update their own items"
ON items FOR UPDATE
USING (auth.uid() = owner_id);

-- DELETE: Users can only delete their own items
CREATE POLICY "Users can delete their own items"
ON items FOR DELETE
USING (auth.uid() = owner_id);

-- 6. Storage Bucket Configuration for 'wardrobe'
INSERT INTO storage.buckets (id, name, public)
VALUES ('wardrobe', 'wardrobe', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop existing storage policies if already defined
DROP POLICY IF EXISTS "Users can upload images to their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Public read for wardrobe images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own wardrobe images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own wardrobe images" ON storage.objects;

-- Storage: Upload to user-scoped folder (<user_id>/filename)
CREATE POLICY "Users can upload images to their own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'wardrobe' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Storage: Public read for wardrobe images
CREATE POLICY "Public read for wardrobe images"
ON storage.objects FOR SELECT
USING (bucket_id = 'wardrobe');

-- Storage: Manage own images
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
