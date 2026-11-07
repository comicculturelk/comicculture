BEGIN;
-- Existing public-read/admin-write RLS applies to these columns unchanged.
ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS banner_desktop text,
  ADD COLUMN IF NOT EXISTS banner_mobile text,
  ADD COLUMN IF NOT EXISTS banner_overlay integer NOT NULL DEFAULT 55,
  ADD COLUMN IF NOT EXISTS homepage_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS homepage_order integer;
-- Preserve catalog order for existing records. Reapplying leaves configured orders intact.
UPDATE public.collections SET homepage_order = sort_order WHERE homepage_order IS NULL;
ALTER TABLE public.collections ALTER COLUMN homepage_order SET DEFAULT 0;
ALTER TABLE public.collections ALTER COLUMN homepage_order SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.collections'::regclass AND conname='collections_banner_overlay_range') THEN
    ALTER TABLE public.collections ADD CONSTRAINT collections_banner_overlay_range CHECK (banner_overlay BETWEEN 0 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.collections'::regclass AND conname='collections_homepage_order_range') THEN
    ALTER TABLE public.collections ADD CONSTRAINT collections_homepage_order_range CHECK (homepage_order >= 0);
  END IF;
END $$;
-- Reuse hero_focus_desktop / hero_focus_mobile: normalized CSS percentages,
-- e.g. '50% 30%'. Existing legacy values and cover images remain unchanged.
COMMIT;
