# Admin audit implementation — 25 October 2026

Implemented against `ComicCulture-admin-audit.md` from 25 October. Changes are in the local working tree. No commit, push, or frontend deployment was performed. The database safety migration **has been applied** to the connected ComicCulture Supabase project (`usbcqjefpseferzdcdkm`), version `20261025124030`.

## Findings and resolution

| Audit | Implemented resolution |
|---|---|
| A01: stale stock overwrite | Existing stock is read-only in the product editor and omitted from retained-size payloads. The database also ignores retained stock from old clients. Inventory delta actions remain the place to change stock. New sizes retain opening stock. |
| A02: legacy review access | Removed four fixed-account policies. Published reviews remain publicly readable; private review access follows active admin membership. |
| A03: promo timezone shift | Populate datetime-local from browser-local date parts; retain UTC persistence and label the timezone convention. |
| A04: missing activation | Existing versions now have an Active checkbox, saved through the existing atomic RPC. |
| A05: rejected payment recovery | Require a rejection reason. Add a guarded, audited reopening action for pending rejected bank orders with existing proof. It returns to ordinary verification and never marks payment paid itself. Clear instructions cover contacting the customer and cancellation to release reserved stock. Replacement-proof upload remains a support-policy decision. |
| A06: inconsistent Cancel | Explicitly label existing size/version deletions as immediate and not undone by Cancel. Confirmations repeat this. Guard explicit section navigation, sign-out, Cancel, and browser unload for dirty/busy forms. Block product Save/Cancel while deletion is pending. No staged-delete framework was added. |
| A07: ineffective crop controls | Remove desktop/mobile hero crop panels; retain working Card Focus and preserve existing stored hero crop values. |
| A08: retained stock action quantity | Key the action form by size and action kind, resetting quantity, reason, note, and errors. |
| A09: history races/errors | One active-view fetch, cancelled-result guard, visible error/Retry, stable timestamp/ID order, and one-extra-row pagination. |
| A10: mutable used promos | Database trigger rejects changed used terms, including an edit waiting behind redemption. Usage counts and activation remain supported. Client saves also require usage_count = 0 and a returned ID. |
| A11: legacy COD discrepancy | Explain the recorded-payment filter and dashboard revenue fallback. Historical financial records are unchanged; owner confirmation is required before reconciliation. |
| A12: image/save race | Product/collection uploads and optimization report busy state to the parent. Save/Cancel/navigation are blocked while busy. Shared or possibly referenced storage files are never automatically deleted. |
| A13: cancellation accessibility | Reuse existing useDialog for contained focus, Escape, scroll locking, and return focus. Keep cancellation reason/refund safeguards. |
| A14: fragile review association | Replace free text with a catalog selector, preserving unmatched historical names. No product-ID backfill or review rewrite. |
| A15: receipt preview failures | Expiring cache entries, regeneration on reopening, visible Retry, image-error handling, and confirmation disabled until the preview loads. |
| A16: product-code helper access | Membership check in next_product_code; trusted service-role default usage remains possible. Non-admin clients cannot consume codes. |

## Additional small improvements from the audit

- Product duplication creates inactive versions with zero stock, avoiding accidental purchasable preorder copies.
- The newest available featured product leads the homepage; configured launch remains the fallback. The editor explains how to choose the launch with existing Featured controls.
- Order details expose notification send confirmation without exposing notification tokens. “Send not confirmed” is deliberately not described as failed inbox delivery.
- Order filters use a compact native disclosure with an active indicator and clear action. Closed-order tracking fields are disabled, and shipping prerequisites are stated.
- Missing product search results have one truthful message and Clear search. Empty collection groups are hidden during searches.
- Shared product reads resolve the canonical collection name by relationship, avoiding stale search labels after collection renames.
- Activity summaries lead with available names/SKUs and changed fields, retaining raw recorded data in a disclosure.
- Product optional lore is collapsed; Save/Cancel remain visible on long mobile forms. Form errors receive focus.
- Review/promo toggles have pending guards; direct mutations check a returned ID to avoid reporting zero-row writes as success. Collection deletion does the same.
- Removed proven-unused direct product/version/size write helpers and obsolete comments. Added explicit save payload types. Existing transactions, roles, auth clients, order rules, and stock restoration remain in place.
- Size guide labels state inches and flat garment chest width. Missing dimensions were not invented.

## Database safety and rollout

The migration replaces explicit function definitions rather than editing function text. It changes policies, guards, and functions; it contains no application-data backfill. Before/after counts were identical: 19 orders, 7 products, 58 inventory movements, and 27 admin activity records. Live definitions and privileges were read back after application. New admin RPCs deny anonymous execution and perform membership checks internally.

Frontend changes remain local until a later deployment. The stock guard also protects old browsers. An old client attempting payment rejection without a reason will now receive a validation error rather than silently rejecting without a reason.

Security/performance advisors were checked after migration. Their remaining SECURITY DEFINER notices cover deliberately callable customer functions and membership-guarded admin functions. Private `store_admins` and `order_notification_state` tables intentionally have no client policies. Public-read/admin-manage SELECT overlaps remain intentional. Two low-volume foreign-key index suggestions and two unused-index notices were not used as a reason for unrelated schema changes.

Leaked-password protection remains disabled in Supabase Auth. This is an account setting, not fixed by this migration. Enable it when available under the project plan and verify owner recovery: [Supabase guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). [Advisor interpretation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Validation actually performed

| Check | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run build` | Passed |
| `npm run test:admin` | 14 passed, 0 failed |
| `git diff --check` | Passed |
| `npm audit --omit=dev --json` | 0 production vulnerabilities |

The added tests use Node's test runner and a pinned development-only PGlite PostgreSQL engine. They run the actual new migration against a reduced synthetic schema, plus existing order-transition/stock-restoration functions. Coverage includes public/private reviews, active/deactivated/non-admin/fixed-account access, stale stock preservation, new opening stock, version activation/name swaps, transaction rollback, code access, used promo terms, local timestamp round trips, payment recovery/verification guards, cancellation restoring stock exactly once, refund prerequisites, and notification token privacy. The engine is not shipped in the storefront bundle.

The stale-stock test simulates a sale before saving an older stock value. It is not a multi-session load test. Full hosted Supabase integration, real email delivery, actual receipt/upload operations, and real write flows were deliberately not exercised against customer data. Five existing development-tool vulnerability advisories were not addressed by a broad build-tool upgrade.

## Browser verification

Used a separate authenticated tab at `http://127.0.0.1:5174/admin`; the user's original tab and sign-in were preserved. Checked rendered views at 320 × 740, 390 × 844, 768 × 1024, and desktop 1440 × 900. These are browser viewport tests, not physical-device tests. Viewport override was reset afterward.

| View | Inspected/exercised safely |
|---|---|
| Products | Product search and absent search; existing Iron Man editor; read-only stock and Active control; collapsed lore; sticky Save/Cancel visible at 390px. No Save or duplicate. |
| Collections | Existing editor at 320px; only Card Focus remains; Cancel without edits. No upload or Save. |
| Inventory | Restock → Adjust resets typed quantity to empty; tablet layout at 768px; no stock save. |
| Orders | Mobile/desktop cards and filter presentation; order details and notification read; courier prerequisite hint; cancellation focus, Escape, scroll locking and focus return to the status selector. No confirmation or shipment/payment write. |
| History | Inventory/admin view switching; summaries; Next reaches page 2; narrow layout at 320px. No activity records changed. |
| Promos | Empty state, form at 320px, local-time labels. No live promo exists; dates/term locking tested in isolated PostgreSQL. |
| Reviews | Catalog selector with all seven products at 390px; form layout. No publish/edit save. |
| Dashboard/Team | Rendered mobile overview and team controls; no grant/deactivate action. |
| Storefront | Desktop homepage, launch, product cards, canonical collection labels still load after shared read changes. |

No page-level horizontal overflow was observed in the sampled layouts. The native dirty-form confirmation could not be reliably accepted/dismissed through the automation, so its stay/discard branches are not claimed as browser-verified. Explicit admin navigation and unload listeners were code-reviewed; browser Back/Forward within the SPA is not guarded by a custom router blocker.

No console errors were observed during the final admin checks. Visiting the storefront after admin emitted the existing multiple-GoTrue-client warning; separate admin/storefront clients are intentional and use different auth storage settings.

Visual evidence: [mobile product editor](C:/Users/fairo/.codex/visualizations/2026/10/24/01a16c0a-470a-77d2-82fe-0f4fa7613fea/admin-audit-2026-10-25/implemented-product-editor-390.png).

## Remaining owner decisions and optional follow-ups

- Confirm collection of cash for the three historical delivered COD orders before any reconciliation.
- Supply confirmed measurements for the six active versions without guides. No product facts or dimensions were fabricated.
- Confirm how replacement bank-transfer proof should be accepted, and how returns/exchanges/COD remittance should be handled. Existing-proof reassessment is implemented; arbitrary status editing is not.
- Enable leaked-password protection if supported; verify recovery and consider built-in MFA. No account access or credentials were changed.
- Shared-image cleanup should be a deliberate reference-aware maintenance task. No speculative deletion of storage objects.
- Durable review product IDs, SKU-preflight batching, inventory-history edition/actor enrichment, low-stock deep links, broader field-by-field validation, CSS consolidation, a full draft-publishing system, campaign photo/copy controls, server notification retries, exports, and bulk fulfillment remain optional follow-ups. They were not prerequisites to fix the sixteen findings and would expand this small safety patch.

## Files

Modified: `package.json`, `package-lock.json`, `src/components/Hero.tsx`, `src/pages/Admin.tsx`, `src/components/admin/{AdminCollections,AdminDashboard,AdminHistory,AdminInventory,AdminOrders,AdminProducts,AdminPromos,AdminReviews,CollectionCoverUpload,ImageManager,ProductForm}.tsx`, `src/data/{collections,inventory,products}.ts`.

Added: `src/hooks/useAdminForm.ts`, `src/lib/adminDate.ts`, `supabase/migrations/20261025124030_admin_audit_safety_fixes.sql`, `tests/admin-date.test.mjs`, `tests/admin-database.test.mjs`, `tests/fixtures/admin.sql`, and this report. No source files removed. All complete updated sources are preserved directly in the repository.
