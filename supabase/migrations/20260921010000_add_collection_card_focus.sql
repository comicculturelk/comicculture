-- Adds an optional per-collection focal position for the "Choose Your
-- World" collection cards (src/components/Collections.tsx), used to control
-- object-position on the fixed aspect-[3/4] card image instead of relying
-- on a single centered crop.
--
-- A single value (not a desktop/mobile pair like hero_focus_*) is
-- sufficient here: unlike the full-viewport Hero, the card is always
-- rendered at the same aspect-[3/4] ratio regardless of viewport width, so
-- there is only one crop to pick.
--
-- Nullable, additive, no backfill: existing rows fall back to a centered
-- default in application code. No RLS change needed — plain column on
-- `collections`, covered by the existing collections policies (public
-- read, admin-only write).

alter table collections
  add column card_focus text;
