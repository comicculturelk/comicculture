# Homepage banner release checklist

> **Current release decision (7 November 2026):** The owner explicitly waived staging and database backups and authorized applying the reviewed production migration, committing, pushing main and deploying. Use [homepage-banners-production.md](homepage-banners-production.md) for the active release sequence. The staging gates below are retained as the earlier plan, not a current prerequisite. The reviewed migration has been explicitly approved and applied; its schema/defaults and collection preservation were verified read-only. Earlier staging/backup gates below are historical and do not override the current authorization. The first real collection upload/save needs separate approval.

Prepared 7 November 2026. Release status: local implementation and validation complete; writable hosted integration, production migration and deployment remain gated.

## Staging availability and cost
- Read-only account inspection: ComicCulture organization `jetfdsowwxfcxchkiqlj` is Free. Its only listed project is production `usbcqjefpseferzdcdkm`; no database branches exist. No existing ComicCulture staging environment was found. Docker is not on PATH and this checkout has no Supabase config.toml, so there is no ready local Supabase stack here either. PGlite tests are not equivalent to a full Auth/Storage integration environment.
- An isolated Supabase branch is technically suitable: it has a separate instance and API credentials, starts without application data/storage objects by default, and does not change production unless merged. Do not enable Include data or automatic GitHub/production merging. Check cloned configuration and outbound integrations before testing.
- Hosted branching incurs usage charges. The current official published starting Micro compute rate is $0.01344/hour (about $0.32256 for 24 hours), plus other applicable usage and any required plan costs. This is a published starting rate, not an account-specific quote or spending cap. Branch usage is not covered by Spend Cap; compute credits do not apply. No paid resource was created, no plan was upgraded, and no billing confirmation was submitted.
- A separate Free staging project may be an alternative if the account-wide free-project allowance permits it; quota and exact provisioning cost have not been confirmed. Do not treat it as an already available or guaranteed free resource. A fresh project needs the existing schema, policies, Auth and bucket setup, not only this feature migration.
- An alternative is a developer-provided local Supabase stack on a Docker-capable machine with the established migrations. No Docker or infrastructure installation was attempted.

Official references checked:
- https://supabase.com/docs/guides/deployment/branching
- https://supabase.com/docs/guides/platform/manage-your-usage/branching

## Gate 1: approve and provision isolated staging
- [ ] Choose the intended organization and environment. Obtain an account-specific cost quote and explicit cost approval before any paid branch/project or plan upgrade. Set a budget and a cleanup deadline.
- [ ] Provision a data-less, isolated environment; record its project reference and API URL. Confirm neither equals production before EVERY write. Do not use branch merge as the release mechanism.
- [ ] Verify base migration history and schema, including collections, hero_focus_desktop/mobile, store_admins, authorization/MFA guards, audit triggers, Storage bucket and RLS. Branch schema is reconstructed from migration history; inspect for missing/drifted setup.
- [ ] Keep outbound email, webhooks, payment/checkout functions and integrations isolated or disabled. Do not copy production secrets, customer data, order data, or Storage objects. Use synthetic collections and images.
- [ ] Establish a staging-only confirmed admin account via the existing onboarding process; grant the intended owner/admin role and enroll MFA. Also prepare an authenticated non-admin (and staff if applicable) for negative tests. Never weaken policies to make tests pass.
- [ ] Point a separate frontend process at staging using only its URL and publishable/anon key. Keep the normal local/production configuration intact. Inspect actual browser request hosts to confirm staging before uploads.

## Gate 2: prepare and apply the staging migration
Migration: `supabase/migrations/20261107052205_collection_homepage_banners.sql` (unchanged by release preparation).
- [ ] Review the exact migration and base schema. New columns: banner_desktop, banner_mobile, banner_overlay, homepage_visible, homepage_order. Defaults: null images, 55% overlay, visible true; backfill order from existing sort_order. Reuses existing focal-point strings. No new permissions or storage policy changes.
- [ ] Confirm existing sort_order values are non-null and nonnegative. Record collection count, covers, status, ordering and focal points for before/after comparison.
- [ ] Inspect the migration plan against the explicit STAGING reference. CLI help was checked during preparation: `npx supabase db push --remote=STAGING_PROJECT_REF --dry-run --skip-vault`. This is a template, not a command executed during preparation. Review ALL pending migrations; stop if unrelated migrations appear. Do not blindly use --include-all, --include-seed or --include-roles.
- [ ] Apply only the reviewed migration to the confirmed staging target through the established migration runner, with history recorded. Check the five new columns, defaults, NOT NULLs and range constraints. Verify covers/focal points and existing rows are preserved. Wait for API schema cache refresh before testing saves.

## Gate 3: real Auth + Storage + database integration (still required)
Run against staging only; preserve HTTP status/results as release evidence without credentials.
- [ ] Sign in with the staging admin and complete MFA. Create a synthetic live collection with a distinct cover and two banner files. Upload desktop and mobile images via the real Admin interface. Verify Storage requests use the admin JWT, unique paths and no overwrite, and return successful URLs.
- [ ] Set desktop focus to 25% / 30%, mobile to 75% / 60%, overlay to 0%, order to 3, homepage visible true. Save; reload the browser and reopen the editor. Independently read the collection from staging and verify both URLs and all settings persisted.
- [ ] Open an anonymous browser: read the collection and both public Storage URLs. Check the correct image at widths 320, 375, 390, 430, 768, 1024 and 1440. Check matching focal points and text/controls over light artwork. The fixed text backing must remain present even at 0% overlay; the selected whole-image overlay must remain 0%.
- [ ] Replace/remove a desktop/mobile banner, save and cancel separate edits, and verify the saved cover and other referenced images remain readable. Mobile falls back to desktop, desktop falls back to cover, missing/broken images fall back gracefully. Image removal intentionally does not delete Storage objects.
- [ ] Exercise two or more live slides: ascending homepage order, hidden exclusion, soon exclusion, correct CTA route, keyboard previous/next, pagination, pause/resume, hover pause, reduced motion, and single-slide control hiding.
- [ ] In staging, attempt collection insert/update and Storage upload as anonymous and authenticated non-admin users. Assert DENIED and verify no rows/objects changed. Anonymous updates may return zero affected rows rather than a permission exception; do not treat that as successful mutation. Confirm staff cannot manage banners and MFA-less admins cannot bypass the guard.
- [ ] Upload an unsupported/oversized file; simulate a failed upload/save and confirm actionable errors, no stuck busy state and no broken saved image. Verify normal covers and card focus still work.
- [ ] Smoke-test staging products, cart, checkout validation, order/payment state guards and inventory workflows using synthetic test data and isolated side effects only.
- [ ] Review and sign off on evidence. Do not mark hosted persistence verified based solely on mocked browser requests or PGlite tests.

## Gate 4: approved production migration and deployment
- [ ] Obtain explicit approval for production schema changes. Take/verify a recoverable database backup using the established procedure. Recheck production migration history and dry-run plan; stop on drift or unrelated pending changes.
- [ ] Apply only the reviewed additive migration to production before the frontend release, with migration history recorded. Verify all five columns/constraints and unchanged collection count/covers/focal points. Read-only checks should confirm the public API recognizes the columns. Never publish a service-role key.
- [ ] Obtain separate deployment approval. Deploy the reviewed build. No commit, push, deployment or migration was performed during this preparation.
- [ ] Existing live collections will initially be homepage-visible and use their covers. Any desired production banner uploads/visibility changes are production writes and require authorization.

## Gate 5: post-deployment and rollback
- [ ] In an anonymous browser, verify homepage images, mobile/desktop crop, contrast, order, hidden/soon exclusion, no horizontal overflow and no console/network errors; check collection CTA, product routes, cart, checkout entry and order tracking entry without placing a live order.
- [ ] Verify authorized production admin reads; perform a production upload/save smoke test only if explicitly approved. Check RLS/Storage remain enabled and public users have no write policy. Monitor frontend errors, failed Storage requests and collection API errors.
- [ ] If release checks fail, roll back the frontend to its prior deployment (approval required). Leave the additive database columns and stored files intact; avoid destructive down-migrations and Storage cleanup. Keep an affected banner out of rotation only with authorized production-data changes. Diagnose before retrying.
- [ ] Remove any paid test environment after evidence is saved and cleanup is authorized; recheck billing so forgotten resources do not accumulate charges. Do not merge a test branch into production.

## Contrast safeguard and local evidence
The existing text backing is strengthened to 65% black using the shared `.banner-text-protection` CSS class. White text over a white image then has approximately 7:1 contrast even when the configured full-image overlay is zero. This class is used on hero copy, slideshow controls and admin preview text; no image analysis, dependency, changed overlay values or schema changes are needed. Existing typography, CTA colors, layout and crop logic are preserved.

Local checks: TypeScript, lint, production build, 53 automated tests, and the browser suite. The browser suite covers real components with intercepted backend requests, seven viewport widths, light-background contrast, unchanged selected overlays at 0/15/55/100%, uploads/save/reopen, fallback chain, navigation and reduced motion. Logs/screenshots are included in the delivery archive. Authenticated hosted tests remain pending Gate 3.

Files changed in this release-preparation pass:
- src/components/Hero.tsx
- src/components/admin/HeroFocusPicker.tsx
- src/index.css
- tests/homepage-banners.browser.py
- docs/homepage-banners.md
Created:
- docs/homepage-banners-release.md
- artifacts/homepage-banners-release/ (logs and complete-file delivery ZIP)
Updated generated screenshots/logs under artifacts/homepage-banners/ by browser verification. No source files deleted; migration unchanged. Earlier feature and skills files already in the working tree are preserved.
