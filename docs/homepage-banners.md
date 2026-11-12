# Homepage collection banners

## Use in Admin
Open Admin > Collections, then create or edit a collection. Existing cover image and Card Focus controls still manage the collection cards.

Under **Homepage Banner**:
1. Upload a landscape desktop image (suggested 1600 x 760) and optionally a portrait mobile image (suggested 780 x 1280). JPG, PNG, WebP and AVIF are accepted, up to 10 MB. Existing client optimization resizes/compresses JPEG/PNG files before upload.
2. Drag each preview or use its horizontal/vertical sliders. Reset to center restores 50% / 50%. The same CSS object-position percentages drive the actual hero. Preview shapes represent 1440 x 680 and 390 x 640; other viewport shapes crop differently.
3. Set overlay strength (0–100%). Preview the crop, overlay, and approximate CTA placement for each device. The storefront uses a solid brand-red CTA and a compact dark control group for readability at any overlay strength. Check real artwork at all widths.
4. Enable Show on homepage and choose a nonnegative slide order; smaller orders appear first. Only live collections appear. Other collection/catalog ordering stays independent.
5. Save Changes. Upload success alone does not save the collection. Wait for the collection saved message. Reopen to verify persistence.

Mobile uses its own image at widths below 768px. The fallback order is desktop, then collection cover, then the branded background. A mobile-only banner can also serve as the desktop fallback when no desktop image or cover is available. Failed image URLs are excluded and the next fallback is used. Responsive picture sources load only the chosen image for each viewport. Collection names and copy are available to assistive technology and become visible when artwork is unavailable.

A single slide hides navigation. With multiple slides, previous/next wrap, the counter shows the current position and eligible slide count, and rotation runs every six seconds. Mouse hover pauses temporarily. Focusing the CTA or either navigation button, or manually changing slides, pauses rotation until explicitly resumed. Reduced motion disables autoplay and the image fade.

Replacement/removal stages a new URL or clears the field; it never deletes Storage objects. This prevents breaking another record, a cancelled edit, or a shared cover. Unsaved/cancelled uploads can leave unused objects: any later storage cleanup must independently verify all references. No automated cleanup is installed.

## Data and security
New fields on public.collections: banner_desktop, banner_mobile, banner_overlay, homepage_visible, homepage_order. Reuses existing hero_focus_desktop and hero_focus_mobile fields as normalized CSS percentage pairs (e.g. `25% 60%`); existing legacy values remain readable. Covers, card focus, collection metadata, products and orders are preserved.

Existing public collection reads and authenticated store-admin collection/Storage writes remain authoritative. The same isolated supabaseAdmin client and product-images bucket are used with unique upload names and upsert disabled. No service-role key, table, RLS policy, storage policy, or permission change is introduced.

## Release steps (require explicit approval)
1. Review supabase/migrations/20261107052205_collection_homepage_banners.sql and take the normal database backup/snapshot.
2. Apply this migration to an isolated staging database first through the established Supabase migration workflow. It is transactional and repeatable. It preserves existing covers/focus settings, sets homepage visibility true, overlay 55%, and initializes homepage order from catalog order. No new Storage configuration is needed.
3. Sign into staging with a real authorized admin. Upload both real banner images, set both focal points, save/reopen, verify anonymous reads, and confirm non-admin writes remain denied. Verify readable crops at all target widths, then smoke-test collection links, products, cart and checkout using staging test data.
4. With approval, apply the reviewed migration to production before releasing the frontend. New banner writes require the columns to exist; the public mapping tolerates missing fields for reads before migration. Refresh the Supabase API schema cache only if it has not refreshed automatically (Dashboard/API settings or the established schema reload procedure).
5. Deploy only with explicit approval. Configure the real banners in Admin. Existing live collections initially use their cover images; disable Show on homepage where desired.

No migration, production upload, live-data write, commit, push or deployment was performed for this implementation.

## Local verification
- npm run typecheck
- npm run lint
- npm run build
- node --test tests/*.test.mjs (includes isolated PGlite/PostgreSQL migration repeatability, saved settings, defaults and invalid value checks)
- python tests/homepage-banners.browser.py (requires Python Playwright and Microsoft Edge at the Windows path in the script, plus local Vite at localhost:5173)

The browser test intercepts Supabase requests and uses synthetic images; it never sends uploads or collection changes to production. It tests the real homepage and mounts the real collection editor in an in-memory document for upload/save interactions. This does not replace staging verification of real authentication, Storage policies and network persistence. Screenshots use synthetic images to measure layout; approval of crops/contrast with actual campaign artwork remains a staging check.

## Changed files
Modified:
- server/catalog.ts
- src/components/Hero.tsx
- src/components/admin/AdminCollections.tsx
- src/components/admin/CollectionCoverUpload.tsx
- src/components/admin/HeroFocusPicker.tsx
- src/data/collections.ts
- src/index.css
- src/pages/Home.tsx
Created:
- supabase/migrations/20261107052205_collection_homepage_banners.sql
- tests/homepage-banners.test.mjs
- tests/homepage-banners.browser.py
- docs/homepage-banners.md
- artifacts/homepage-banners/ (validation logs, seven viewport screenshots, admin screenshot and delivery ZIP)
Deleted source files: none. Removed obsolete collection-deck CSS and the old product card hero markup/logic.

Existing untracked skills, AGENTS.md and skills-lock.json predate this feature and are not part of the delivery ZIP.

## Release readiness
See [homepage-banners-release.md](homepage-banners-release.md) for current staging options, approval gates, authenticated integration test cases, and the rollout/rollback checklist.
