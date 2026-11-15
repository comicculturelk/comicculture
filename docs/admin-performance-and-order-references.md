# Admin performance and numeric order references

Prepared 15 November 2026 for local review.

## Engineering assessment

The previous dashboard made three requests for an all-time summary, six recent orders with customer names, and hydrated public catalog records. It had no date range, comparable trend, edition or size ranking, slow-stock analysis, payment triage, or actionable inventory navigation. The bestseller grouped by mutable order-item name. The old revenue predicate also counted delivered COD regardless of a failed or refunded payment status.

The redesigned dashboard uses one read-only aggregate RPC per range or refresh. Owner and admin access still requires an active, confirmed account with MFA. The payload contains no customer contacts. It includes period metrics and comparisons, revenue and order trends, top ten designs with expandable ranking, edition and size demand, slow-moving stock, live stock alerts, current order and payment states, and recent references. Management links go to the existing Orders and Inventory screens. The staff landing page and existing admin landing routes retain their behavior.

## Reporting definitions

| Metric | Calculation |
| --- | --- |
| Period | Business dates in Asia/Colombo. Ranges include today up to the request time and the preceding 6, 29, or 89 calendar dates. Comparisons use the preceding equal-length period through the same local clock time on its final date. All time starts at the first recorded order and has no comparison. |
| Orders placed | Count of orders created during the period, including cancelled, failed, and refunded orders. |
| Collected revenue | Saved order totals for non-cancelled orders with paid status, plus legacy delivered COD with pending payment status. This excludes failed, refunded, other unpaid, and cancelled orders. Saved totals are after checkout discounts and include shipping. The dashboard discloses collected shipping and discount components. |
| Average order value | Collected revenue divided by collected order count, rounded to two decimals. Shows a dash if there are no qualifying orders. |
| Units and merchandise value | Quantity and saved unit price × quantity from eligible item snapshots. Cancelled, failed, and refunded orders are excluded. Pending COD and bank transfers count as order demand. Item sales value is before discounts and excludes shipping. The schema stores discounts on the order without line-level allocation. |
| Design, edition and size ranking | Designs are grouped by saved product ID. Name and image come from the latest qualifying snapshot, with an image fallback to the catalog. Editions are grouped by stable version IDs through the saved size ID, with current edition names. Sizes use the order-item label and combine display aliases such as XXL and 2XL. Older orders reflect the available historical snapshots and catalog mapping. |
| Orders awaiting action | Selected-period orders currently pending, confirmed, or packed, excluding refunded orders. The pending 48h+ count uses elapsed time since placement. Pending rejected transfers still need an operational decision and appear in the Failed payment count. |
| Bank verification | Selected-period bank transfers with pending order status and awaiting-verification payment status. The payment breakdown shows all six recorded payment states. |
| Low and zero demand | Uses currently active editions with configured sizes. A design uses all eligible orders for that product, including historical sales of an edition that has since been retired. A variant uses only its own edition-size ID. Zero units is zero demand. Positive demand up to the larger of 1 or the floor of observed calendar days divided by 30 is low demand. The observed window starts at the later of the range start or listing date. All time starts the observation window at listing. Low and zero demand rows under 14 days since listing appear under New listings. Listing age uses the earliest configured active size for a design and the latest of product, version, and size creation for a size. Lists show up to ten results per group, ordered by available stock first. |
| Inventory | Current authoritative edition-size stock across active editions for every range. Out means 0. Low means 1 through the shared inventory threshold of 3. The inventory panel shows the ten lowest sizes and the total number of affected designs. |

The chart fills gaps with zeroes and supports revenue and orders placed. Today uses hours, 7 and 30 days use calendar days, 90 days uses Monday-start weeks, and All time adapts from weeks to months, quarters, or years. The first and last buckets can be partial.

Revenue uses the order date and the latest payment state. Historical periods can change as orders are paid, delivered, cancelled, or refunded. Delivered legacy COD is a proxy for collection under the store's workflow. The data does not provide complete receipt dates, a partial refund ledger, historical collection membership, listing publication and reactivation dates, or stock availability over time. A slow-stock result identifies observed demand and current stock. It cannot determine whether stockouts limited earlier sales. Historical collection sales, profit, conversion, and acquisition metrics are omitted. If cash-date reconciliation or collection history becomes necessary, record payment events and collection IDs prospectively at the existing checkout and admin boundaries.

The bounded ranges use indexed order timestamps and existing order-item join indexes. The All time option aggregates retained history and returns bounded rankings. Check the All time execution plan in staging if order volume is materially larger than the isolated 20,000-order fixture.

## Order reference and tracking security

Future orders use a 12-character string of decimal digits. Leading zeroes are valid. PostgreSQL generates a random UUID v4 using its strong random source, takes its first 48 random bits, and rejects the small biased tail before mapping uniformly into 1 trillion values. No input, timestamp, or sequence is used. The existing non-deferrable unique constraint covers every stored reference. Checkout retries a maximum of eight times on that exact constraint. A failed attempt rolls back its stock changes and inventory movements before the next draw. Exhaustion aborts the checkout transaction. Existing checkout IDs, responses, receipts, quotes, promotions, and notification tokens use their existing transaction paths. [PostgreSQL UUID v4 implementation](https://doxygen.postgresql.org/uuid_8c_source.html#l00553)

Tracking still requires the full reference and matching checkout email or main phone. The Edge Function preserves 60 attempts per client per fixed hour. The numeric format has a separate 20-attempt hourly budget shared across all clients for each normalized contact. Older sequential and other short references retain their existing shared 12-attempt contact budget. Valid UUID v4 references retain per-client limiting and contact verification. The budgets use HMAC keys derived from the server-held secret with no raw contact or IP keys in the rate-limit table. A wrong contact and an unknown reference give the same lookup response. A rate-limit response depends on the counters and takes place before the lookup.

Twelve digits give about 39.86 bits of entropy, compared with 122 random bits for UUID v4. Knowing one valid contact gives at most 20 numeric guesses in one hourly window for that contact, or a probability of approximately 20 in 1 trillion for a particular order under uniform generation. Someone who knows both verified tracking inputs can use both independent budgets. Someone who knows an email or phone can also deliberately exhaust that contact's numeric budget until the next hourly window. A separate legacy bucket limits cross-format disruption, and customers who supplied both contacts can try the other one. Retain generic failures and monitor aggregate 429 rates after an approved release. Independently verify that the hosted gateway supplies a trusted client address. Consider proof of contact ownership if targeted guessing or deliberate contact-budget exhaustion becomes a recurring support issue.

All existing reference strings and saved idempotency results remain usable. The checkout response, confirmation page, packing slips, order email templates, recent orders, admin search, inventory history, and WhatsApp message display or use the stored reference directly. Tracking stays a text field and accepts older references. The email function needs no source or deployment change for this release.

## Release sequence after approval

Use Supabase CLI 3.1.0. Set `$targetRef` to the reviewed project reference after approval, `$repo` to the reviewed source checkout, and `$releaseDir` to a new scratch directory with a `supabase/migrations` folder. Use the scratch directory for database commands and the source checkout for the Edge Function deployment. The production migration ledger uses different historical versions from some repository filenames, including `20261011133014` and `20261011160246`.

1. **Preflight.** Run `npx --yes supabase@3.1.0 migration fetch --workdir $releaseDir "--remote=$targetRef"` to populate the scratch migration directory from the target's recorded history. Check it with `migration list --workdir $releaseDir "--remote=$targetRef"`. Confirm the fetched versions match the remote ledger, including `20261112113607` and `20261114065745`. Confirm both release versions are absent and the UUID allocator and `orders_order_reference_key` constraint match the numeric migration's guards. Record the existing checkout, allocator, and frontend versions for rollback.
2. **Apply analytics only.** Copy `20261115075632_admin_performance_dashboard.sql` from the source migrations into the scratch migrations. Run `npx --yes supabase@3.1.0 db push --workdir $releaseDir --skip-vault --dry-run "--remote=$targetRef"`. Proceed only if it lists that single file. Rerun the command without `--dry-run`, then verify the ledger and check that both analytics RPCs are available and that the numeric allocator is still absent. The index build uses a regular `CREATE INDEX`, which holds a lock that blocks order writes during the build. Apply it during a quiet period. [PostgreSQL index locking](https://www.postgresql.org/docs/17/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY)
3. **Deploy the checkout Edge Function.** From the reviewed source checkout run `npx --yes supabase@3.1.0 functions deploy checkout --use-api "--remote=$targetRef"`. The existing function has JWT verification enabled. Preserve that setting, its allowed origins, Turnstile configuration and secrets. Check the expected CORS response to `OPTIONS` and function health. The live notification function treats references as text and needs no redeployment. The database still emits UUID references at this point.
4. **Deploy the frontend.** Release the reviewed commit through the existing Git-to-Vercel production workflow. Confirm the READY version serves the intended domain. Check the dashboard with an existing MFA-verified admin session and verify that a staff session cannot use the dashboard. Confirm the checkout and tracking UI are available before proceeding.
5. **Activate numeric references.** Add `20261115075636_numeric_order_references.sql` to the scratch migrations, keeping the applied analytics file. Repeat the dry run and proceed only if it lists the numeric migration alone. Rerun without `--dry-run`, then confirm that the ledger has both versions, `order_reference` is still unique text, and existing reference formats remain in place. Observe aggregate checkout, tracking, and notification logs. If a customer order arrives naturally, confirm its reference format and downstream processing through read-only inspection. The rollout smoke checks do not create an order or trigger test emails.

For frontend rollback, restore the recorded Vercel build and keep the compatible checkout gateway. If allocation must be rolled back, apply a forward migration restoring the prior UUID allocator. Keep the tracking rules for already-issued numeric references and preserve all orders and idempotency results. [Supabase migration workflow](https://supabase.com/docs/guides/deployment/database-migrations)

## Local verification

If the optional local-only preview launcher is available in your checkout, run `node tests/preview-admin-dashboard.mjs` from the repository root, then visit `http://127.0.0.1:5188/__dashboard_preview`. The launcher exports fixture data through the analytics SQL in an in-memory test database. A separate loopback-only Vite server serves the fixture and a simulated MFA session. Open the preview link again if the synthetic session expires. Stop the server with `Ctrl+C`.

If the regular local server uses the production Supabase project before the analytics migration is released, the dashboard displays its load error. Use the preview on port 5188 for local review.

- TypeScript, ESLint, and a fresh production build passed. The full regression run passed all 73 Node tests with no skips or failures. It included 61 admin, security, analytics and homepage tests, five notification tests, six SEO tests, and one native PostgreSQL race test. The earlier diagnostic total of 65 excluded SEO and the race test. The previous full total of 72 predates the rollout compatibility test.
- The rollout compatibility test applied analytics first and verified that existing function definitions and grants, the legacy summary, and UUID checkout remained compatible. It then applied the numeric migration and compared the saved order, item, checkout request, notification, movement, and inventory rows on either side of activation.
- A separate Supabase CLI 3.1.0 rehearsal used a disposable PostgreSQL 18.6 instance and a synthetic ledger with the 16 production version numbers. Each dry run selected exactly one migration. Both real files applied and recorded their versions. The legacy and new analytics RPCs coexisted, an intermediate checkout received a UUID, and activation generated a 12-digit reference. The rehearsal used synthetic orders and did not contact hosted services.
- PostgreSQL analytics tests with an empty store, targeted scenario fixtures, 20,000 additional orders with items, MFA and role checks, every period, current/prior cutoff, historic snapshots, and active inventory.
- Checkout/security tests with all three reference formats, leading zeros, duplicate and exhausted candidate draws, quote/receipt/promotions, previous and new idempotency results, and stock and inventory movement rollback.
- Native PostgreSQL 18.6 test with two simultaneous checkouts and independent inventory rows. The second connection was observed waiting on the first transaction's unique index entry, retried, and saved a different reference with the expected price, stock, and inventory movement.
- Playwright Edge against a separate local Vite instance with a synthetic Supabase URL and intercepted auth, gateway and management requests. Dashboard response fixtures were exported by the isolated analytics RPC. Screenshots use synthetic data. The dashboard was tested at 390px, 768px, and 1440px. Checkout confirmation, tracking, admin search, WhatsApp link, print layout, history, and email HTML were exercised with synthetic orders. Live hosted delivery, mail clients, physical printers, and production-scale latency are outside this validation.
- A browser smoke check against the fresh production build returned HTTP 404 for both preview routes and required normal admin sign-in. All 44 generated JavaScript bundles were checked for preview routes and synthetic session markers.

To reproduce the browser fixtures in PowerShell from the repository root:

```powershell
$env:COMICCULTURE_DASHBOARD_FIXTURE = Join-Path $env:TEMP 'comicculture-dashboard-analytics.json'
$env:COMICCULTURE_REFERENCE_FIXTURE = Join-Path $env:TEMP 'comicculture-order-references.json'
$env:COMICCULTURE_EMAIL_FIXTURE = Join-Path $env:TEMP 'comicculture-order-emails.json'
node --test tests/admin-dashboard.test.mjs tests/security.test.mjs
npm run test:email

$env:VITE_SUPABASE_URL = 'https://delivery-test.supabase.co'
$env:VITE_SUPABASE_ANON_KEY = 'synthetic-anon-key'
$env:VITE_TURNSTILE_SITE_KEY = 'synthetic-site-key'
npm run dev -- --host 127.0.0.1 --port 5187 --strictPort
```

In a second PowerShell window set the same three fixture variables. Optionally set `COMICCULTURE_DASHBOARD_SCREENSHOTS` to a screenshot output directory, then run `python tests/delivery-settings.browser.py` with Python Playwright and Microsoft Edge available.

For the native race test, set `COMICCULTURE_POSTGRES_BIN` to the bin directory containing `initdb`, `pg_ctl`, and `postgres`. Install the optional Node driver in a temporary directory, for example `npm install --prefix $testRuntime pg@8.16.3`, and set `COMICCULTURE_POSTGRES_DRIVER` to that directory. From the repository root run `node --test tests/order-reference-concurrency.test.mjs`. The test boots a fresh, isolated loopback cluster on port 55498.

## Changed files

- `src/components/admin/AdminDashboard.tsx`
- `src/components/admin/AdminOrders.tsx`
- `src/lib/admin.ts`
- `src/pages/Admin.tsx`
- `src/pages/TrackOrder.tsx`
- `supabase/functions/checkout/handler.ts`
- `supabase/migrations/20261115075632_admin_performance_dashboard.sql`
- `supabase/migrations/20261115075636_numeric_order_references.sql`
- `tests/admin-dashboard.test.mjs`
- `tests/delivery-settings.browser.py`
- `tests/fixtures/admin-dashboard.sql`
- `tests/fixtures/admin-dashboard-preview.sql`
- `tests/order-reference-concurrency.test.mjs`
- `tests/security.test.mjs`
- `docs/admin-performance-and-order-references.md`
