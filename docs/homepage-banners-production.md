# Direct production release: homepage banners

## Status and authorization
On 7 November 2026 the owner explicitly authorized release without staging or a database backup, accepting the additional risk. The authorization covers the reviewed production migration, a focused 14-file commit, push to main and Vercel release. No staging environments or backups are to be created. The first authenticated upload/save to a real collection remains a separate approval step.

The reviewed migration was applied successfully to production through the connected Supabase migration tool. Its generated history timestamp was aligned to the checked-in version 20261107052205. Read-only checks confirmed all five columns/defaults/constraints and unchanged legacy fingerprints for all three collections. Commit/push and deployment are the next execution steps, subject to passing final checks.

## Completed preflight
- Reviewed root AGENTS.md, prior release documents, final source diff, migration, tests and intended commit scope.
- TypeScript, lint, build, 53 automated tests and seven-width browser suite passed again. Browser coverage includes upload/save/reopen with intercepted backend requests, fallbacks, navigation, autoplay/reduced motion and zero-overlay contrast. Real hosted authenticated persistence remains untested; the owner accepted proceeding without staging.
- Working branch main and origin/main both point to 469d7ecd2ffad49df1af7745813d1b22015d43ec. Recheck before commit; do not force-push.
- Production Supabase: usbcqjefpseferzdcdkm. Preflight confirmed all five new columns and migration history entry were absent. The migration has since been applied and verified. Three existing collection records; no null/negative sort_order. Preflight saw 8 products and 24 orders; ongoing legitimate storefront activity can change those counts.
- Existing collection audit trigger was inspected: it logs authorized admin record edits and has no product/order/stock/payment writes. The migration only alters collections and backfills the new homepage_order column. It does not update existing covers, focal points, names, slugs or statuses. No database permissions or Storage policies are changed.
- GitHub: comicculturelk/comicculture, deployment branch main. Vercel team ComicCulturelk (team_punPRBJiIoCz29R1FCIB4zKN), project comicculture (prj_gFscf7e5TWe9CqYvRSZistKOiqgj), production domain https://comicculture.lk.
- Existing READY production/rollback target: dpl_D4d2aJdyar4DKGU8JnscDumSnLmJ, commit 469d7ecd2ffad49df1af7745813d1b22015d43ec, URL https://comicculture-5hpgh2i9u-comic-culturelk.vercel.app. Record/recheck the currently active deployment immediately before release if another release occurs.

## Backup waiver
Backup availability could not be confirmed during the earlier review. The owner has now explicitly waived both staging and backup requirements. No backup was created and this is no longer a release gate. This waiver does not authorize unrelated production writes or destructive tests.

## Exact applied SQL
File: supabase/migrations/20261107052205_collection_homepage_banners.sql
SHA-256: f01b4d97312c9f9639dcf1ecbde49a47ed83520e6aae3cdfacbe8ba77a30fc94

The exact reviewed SQL below has already been applied successfully to production. Do not execute it again as a release step. Supabase migration history now records version 20261107052205 under collection_homepage_banners.

```sql
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
```

## Completed read-only migration verification
- Check columns/types/defaults/NOT NULLs and the overlay 0..100/order >=0 constraints. Confirm API reads recognize all new columns.
- Confirm original 3 collection IDs, covers, names, slugs, descriptions, statuses, catalog ordering and focal points match the baseline. Compare existing-field fingerprints using `md5((to_jsonb(c) - ARRAY['banner_desktop','banner_mobile','banner_overlay','homepage_visible','homepage_order'])::text)`. Investigate any concurrent real edits rather than overwriting them.
- Expected defaults: both banners null, overlay 55, visible true, homepage_order equals sort_order. Verify public-read/admin-write RLS and bucket settings still hold.
- Recheck counts for protected tables; account for legitimate concurrent sales/admin activity. The migration contains no SQL modifying products, orders, customers, stock or payments.
- Confirm migration history matches; no new source commit/push until verification succeeds.

## Focused commit, push and deployment AFTER verification
Allowlist (14 files):
- server/catalog.ts
- src/components/Hero.tsx
- src/components/admin/AdminCollections.tsx
- src/components/admin/CollectionCoverUpload.tsx
- src/components/admin/HeroFocusPicker.tsx
- src/data/collections.ts
- src/index.css
- src/pages/Home.tsx
- supabase/migrations/20261107052205_collection_homepage_banners.sql
- tests/homepage-banners.test.mjs
- tests/homepage-banners.browser.py
- docs/homepage-banners.md
- docs/homepage-banners-release.md
- docs/homepage-banners-production.md

Exclude .agents/, AGENTS.md, skills-lock.json, all generated artifacts/screenshots/ZIPs, .env files, credentials, dist and node_modules. Do not use git add . . After migration verification, explicitly stage the allowlist, review git diff --cached and its names/stat, rerun any checks justified by new changes, then create one focused commit. Fetch/recheck remote main and handle any drift without force-pushing. Push the reviewed commit to origin/main. Confirm Vercel's production build is READY for that exact new Git SHA and custom domain points to it. If Git integration does not start a deployment, inspect the integration before taking another release action.

## Production smoke checks (no customer orders or destructive tests)
After deployment, verify homepage/collection URLs anonymously at desktop and mobile widths: readable text, cover fallbacks, correct crop and controls, expected live collection links, no overflow, console or image errors. Verify /shop, an existing product URL, cart open/close and /checkout accessibility. Do not submit checkout, upload receipts, reserve stock or create orders. Confirm admin login/MFA page is reachable. Actual sign-in requires the user's normal account flow; never bypass MFA or claim authentication was tested merely because the login page loaded.

## First authenticated banner test: separate approval required
Before ANY real collection change, present the proposed collection ID/name, two image files, focal points, overlay, visibility and order, plus current settings to restore if needed. Ask for explicit approval of those exact writes. Suggested scope after choosing assets: retain the cover, catalog status/order and business metadata; upload desktop/mobile files to unique Storage paths; save only banner settings; reload/reopen and verify anonymous image rendering. State that uploads create Storage objects and a collection save changes the homepage. Do not run remove/delete or restore changes without including them in the approved scope. No collection/assets have yet been selected or altered for this test.

## Vercel rollback (database stays additive)
If checks fail, use Vercel Dashboard > ComicCulturelk > comicculture > Deployments, select the recorded prior READY deployment dpl_D4d2aJdyar4DKGU8JnscDumSnLmJ and use the production rollback action. Verify the intended project/domain and exact target before confirming. The deployment detail link is https://vercel.com/comic-culturelk/comicculture/D4d2aJdyar4DKGU8JnscDumSnLmJ. Rollback is a production action; obtain approval if it has not already been authorized. Keep database columns, saved settings and Storage objects. Do not run a down-migration. Rollback can suspend automatic production assignment; verify auto-assignment and explicitly promote a corrected production deployment when approved. Recheck https://comicculture.lk and core routes afterward.

## Execution checkpoint at commit preparation
Production migration and read-only preservation checks succeeded. Final local checks passed before committing. Push/deployment and live smoke checks are performed after reviewing the exact commit. The final deployment result is recorded in the release response/evidence, rather than asserting a result before the new commit has been deployed. No authenticated collection upload/save is included without separate approval.
