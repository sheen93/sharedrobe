-- ==============================================================================
-- Migration: Sprint 2 Item Management (Status, Borrowed By, and Tag Constraints)
-- Migration File: supabase/migrations/20261017000000_sprint2_item_management.sql
-- ==============================================================================

-- 1. Create ENUM: item_status ('Available', 'Lent Out', 'In Laundry')
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'item_status') THEN
    CREATE TYPE public.item_status AS ENUM ('Available', 'Lent Out', 'In Laundry');
  END IF;
END $$;

-- 2. Alter items table: Add status column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'items' 
      AND column_name = 'status'
  ) THEN
    ALTER TABLE public.items 
    ADD COLUMN status public.item_status NOT NULL DEFAULT 'Available';
  END IF;
END $$;

-- 3. Alter items table: Add borrowed_by column (references public.profiles.id, nullable)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'items' 
      AND column_name = 'borrowed_by'
  ) THEN
    ALTER TABLE public.items 
    ADD COLUMN borrowed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Clean up any existing non-conforming tags before applying CHECK constraint
UPDATE public.items
SET tags = ARRAY(
  SELECT unnest(tags)
  INTERSECT
  SELECT unnest(ARRAY['Casual', 'Formal', 'Vintage', 'Streetwear', 'Workwear', 'Athletic', 'Lounge']::text[])
)
WHERE tags IS NOT NULL AND cardinality(tags) > 0;

-- 5. Add Postgres CHECK constraint on tags array
-- Ensures tags array elements strictly match allowed values:
-- 'Casual', 'Formal', 'Vintage', 'Streetwear', 'Workwear', 'Athletic', 'Lounge'
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_tags_allowed_values;

ALTER TABLE public.items
ADD CONSTRAINT items_tags_allowed_values
CHECK (
  tags IS NULL OR tags <@ ARRAY['Casual', 'Formal', 'Vintage', 'Streetwear', 'Workwear', 'Athletic', 'Lounge']::text[]
);

-- 6. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_items_status ON public.items (status);
CREATE INDEX IF NOT EXISTS idx_items_borrowed_by ON public.items (borrowed_by);
