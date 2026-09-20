-- Adds optional per-collection hero image focal positions, used to control
-- object-position on the responsive hero (src/components/Hero.tsx) instead
-- of relying on a single centered crop. Nullable, additive, no backfill:
-- existing rows fall back to a centered default in application code.
-- No RLS change needed — these are plain columns on `collections`, covered
-- by the existing collections policies (public read, admin-only write).

alter table collections
  add column hero_focus_desktop text,
  add column hero_focus_mobile text;
