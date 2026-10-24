# ComicCulture architecture review

Reviewed: 15 October 2026.

## Assessment and scope

The current React, TypeScript, Vite, and Supabase stack is suitable for this store. A developer can expand it, but several boundaries and reliability mechanisms should be improved before adding substantial features. A framework rewrite or microservices are not justified by the code reviewed.

This is a local source and configuration review of routing, catalog access, cart, checkout, admin workflows, notification delivery, migrations, and developer setup. It does not certify production database policies, deployed migration state, hosting configuration, or browser behavior. No application code or production data was changed.

## Existing strengths

- Strict TypeScript and React Hooks lint rules are enabled.
- Pages, reusable components, hooks, database access, and infrastructure files already have recognizable locations.
- Checkout calculates prices and updates stock on the server. The latest base checkout migration locks inventory rows and performs order creation in a transaction.
- Product edits have a transactional `save_admin_product` RPC, rather than depending entirely on a series of browser writes.
- Database migrations contain authorization policies, explicit function grants, order snapshots, inventory history, and admin activity tracking.
- Storefront and admin authentication use separate storage namespaces. The admin browser client uses the public key; its name does not imply service-role privileges.
- Most page components are loaded lazily. Orders and inventory history already use pagination.

## Findings in priority order

### 1. P1: Retrying checkout can create a second order

Evidence: `src/data/orders.ts:71`, `src/pages/Checkout.tsx:204`, `supabase/migrations/20261011030000_secure_order_notifications.sql:19`, and `supabase/migrations/20261011153729_audit_catalog_order_integrity.sql:36`.

The client sends no stable checkout request ID, and the database creates a fresh order ID for each invocation. If the database commits an order but the response is lost, the customer sees an error and can retry. A retry can create another order and decrement stock again. Disabling the submit button does not address this failure case.

Recommendation: create and persist a checkout attempt key, enforce uniqueness in the database, and return the original result when the same attempt is retried. Bind the key to a request fingerprint and design guest result recovery so possession of an arbitrary identifier cannot reveal another customer's information. A deliberately changed or completed cart should start a new attempt.

### 2. P1: Order notifications depend on the customer's browser

Evidence: `src/data/orders.ts:112`, `src/data/notifications.ts:13`, and `supabase/functions/send-order-notification/index.ts`.

After an order is saved, the browser starts an unawaited notification call and makes up to three attempts. The database records notification state, and the function uses locks and provider idempotency keys, which are useful safeguards. However, there is no durable dispatcher in this repository to recover pending work if the browser closes, loses connectivity, or exhausts its retries. A function crash can leave a two-minute lock, outlasting the browser's retry window.

Recommendation: record pending notification work in the same database transaction as the order and have a server worker dispatch it with retries, backoff, delivery status, and operational visibility. Retain the existing provider idempotency safeguards and account for separate admin/customer outcomes.

### 3. P2: Delivery fee has two independently maintained definitions

Evidence: `src/config/store.ts:1`, `src/pages/Checkout.tsx:86`, and `supabase/migrations/20261011153729_audit_catalog_order_integrity.sql:35`.

The frontend says to change delivery fees in `STORE_CONFIG`, while checkout SQL independently fixes the fee at 350. Changing the frontend constant can make the amount displayed before submission differ from the amount saved by the server.

Recommendation: store the authoritative delivery policy on the server and expose a quote/configuration response for checkout display. Continue snapshotting the actual fee on each order. Client values must never authorize the charged amount.

### 4. P2: Schema changes are not checked against database calls

Evidence: `src/lib/supabase.ts:12`, `src/lib/supabaseAdmin.ts:40`, `src/data/products.ts:249`, and `src/data/orders.ts:6`.

Both clients are created without generated database types. Row interfaces and RPC response assertions are maintained manually. A concrete drift example already exists: the database and AdminOrders support `refunded`, but the exported `PaymentStatus` union omits it. Assertions such as `as unknown as ProductRow[]` allow compile checks to pass without proving the query response matches the model.

Recommendation: generate and commit database types, parameterize both clients with `Database`, and derive table/RPC contracts from those types. Keep explicit mapping into frontend domain models where useful. Validate external JSON at runtime where static types cannot establish its shape.

Official reference: https://supabase.com/docs/guides/api/rest/generating-types

### 5. P2: Catalog loading repeats full queries and will not scale predictably

Evidence: `src/hooks/useProducts.ts:16`, `src/data/products.ts:239`, `src/components/CartDrawer.tsx:24`, `src/pages/Shop.tsx:17`, and `api/sitemap.ts:51`.

Each `useProducts` instance independently fetches all product fields, nested versions, and sizes. The hook is used by the global cart and several pages, so requests and snapshots are duplicated. Filtering and sorting happen after fetching the catalog. Neither catalog loading nor sitemap generation pages through all database results; a catalog exceeding the configured API row limit can be incomplete.

Recommendation: introduce shared query caching and explicit invalidation, separate list/detail/admin queries, and move catalog filtering and pagination to the query layer. Fetch cart details by the IDs actually in the cart. Paginate sitemap generation. Specify stable ordering with a unique tie breaker.

Official reference: https://supabase.com/docs/reference/javascript/range

### 6. P2: Public catalog and admin write APIs share the same modules

Evidence: `src/data/products.ts:1`, `src/data/collections.ts:1`, `src/components/admin/AdminOrders.tsx:185`, and `src/pages/Checkout.tsx:181`.

Products and collections combine public reads, admin writes, types, transformations, display formatting, and image operations. Several components also issue database calls directly. This makes dependencies harder to reason about and creates multiple conventions for implementing a new feature. Importing pure catalog helpers also reaches modules that import the admin client.

Recommendation: separate public repositories, admin repositories, domain models, and pure helpers. Move direct component database calls behind feature APIs/hooks. Enforce the dependency direction: components -> feature hooks/services -> repository/client. Keep authorization enforced in the database.

### 7. P2: Large feature files make changes difficult to isolate

Evidence: `src/components/admin/ProductForm.tsx` (1,695 lines), `src/data/products.ts` (943), `src/pages/Product.tsx` (910), `src/pages/Checkout.tsx` (830), and `src/components/admin/AdminOrders.tsx` (624).

ProductForm already contains smaller local components, but also contains draft types, transformations, validation, stock adjustments, upload coordination, deletion operations, and submission orchestration. File size itself is not a defect; the number of responsibilities is the maintenance concern.

Recommendation: extract product draft state and validation into a dedicated hook/model, then move version cards, size editors, and size guides into focused components. Similarly separate checkout state/validation, receipt upload, payment selection, and summary rendering. Preserve transactional save behavior during extraction.

### 8. P2: Exported legacy write helpers offer competing mutation paths

Evidence: `src/data/products.ts:330`, `:574`, `:586`, `:677`, `:771`, and `src/data/inventory.ts:90`.

The module still exports standalone creation/update helpers alongside the transactional product-save API. Several have no callers in the current source. In particular, `updateProductStock` directly overwrites stock without using the adjustment/restock RPC that records movement reason and quantity. Admin audit triggers are a separate log and do not replace the inventory movement ledger.

Recommendation: remove unused mutation APIs or clearly restrict their purpose. Route stock changes through a single audited inventory service, backed by database enforcement. Give future developers one supported way to perform each business operation.

### 9. P2: Regression checks and reproducible setup are incomplete

Evidence: `package.json:6`, `tsconfig.app.json`, `tsconfig.api.json`, `supabase/functions/send-order-notification/deno.json`, and `README.md:25`.

The normal typecheck covers only `src`; the production build does not establish type safety for API and Deno functions. No tracked automated tests, CI workflow, or Supabase local configuration were found. Setup instructions point directly at the configured hosted database, with no documented fresh local database workflow. This makes safe developer onboarding and migration validation harder.

Recommendation: add one documented check command covering browser, Node API, Vite configuration, and Deno code; run it in CI. Add focused behavior tests for checkout retries, stock contention, cancellation/restock, promo limits, admin authorization, and transactional product saves. Document local database initialization, migration replay, minimal seed data, and separate development/staging/production environments. Use complete explicit function definitions in future migrations rather than editing function source using string replacement, as done in the admin workflow migration.

### 10. P2: Runtime failure recovery and visibility are limited

Evidence: `src/App.tsx:34`, `src/main.tsx`, `src/data/orders.ts:109`, and `src/data/notifications.ts:21`.

Routes use Suspense, but there is no application error boundary for render failures or rejected lazy imports. Most operational errors are only written to browser/function console logs. A passing build cannot establish that a failed checkout or pending notification will be noticed operationally.

Recommendation: add route/application error boundaries with recovery actions, structured server logs with correlation IDs, and monitoring for checkout failures and old pending notifications. Keep customer details and bearer tokens out of telemetry.

## Suggested organization

This can be introduced feature by feature without changing frameworks:

```text
src/
  app/                    # router, layouts, providers, error boundaries
  features/
    catalog/              # models, pure helpers, repository, hooks, components
    cart/                 # cart model/state, persistence, components
    checkout/             # draft validation, quote/order API, receipt handling
    orders/               # tracking and order domain models
    admin/
      products/           # editor state, validation, sections, admin repository
      orders/
      inventory/
      collections/
      team/
  shared/
    ui/                   # genuinely shared presentation components
    lib/                  # generic utilities
  infrastructure/
    supabase/             # typed clients and generated database types
api/                      # Node server endpoints
supabase/
  migrations/             # authoritative schema and business transactions
  functions/              # Deno functions and notification dispatcher
docs/                     # architecture, development, operations
```

Database rows should be translated at repository boundaries. Feature models should not depend on React Context types: for example, `CreateOrderInput` can accept a small order-line contract instead of importing the cart provider's full `CartItem`. Remove unused subtotal/deliveryFee/total inputs from that API, since they are not sent to the server. Use one canonical payment-status definition.

## Recommended sequence

1. Establish behavior checks for critical transactions and document environment setup.
2. Add checkout idempotency, durable notifications, and server-backed delivery quotes.
3. Introduce generated database contracts and remove competing write paths.
4. Extract catalog/admin repositories and shared catalog queries with pagination.
5. Split large feature components incrementally, preserving behavior.
6. Add error recovery/monitoring and update developer documentation as boundaries settle.

Avoid reorganizing the entire tree in one commit. Each step should have a focused, reviewable diff.

## Verification performed

- `npm run typecheck`: passed.
- `npm run lint`: passed with no reported diagnostics.
- `npm run build`: passed. The initial sandbox attempt could not start esbuild (`spawn EPERM`); the permitted retry succeeded.
- Additional TypeScript checks for `tsconfig.api.json` and `tsconfig.node.json`: passed.
- No automated behavior tests were present to run. Browser flows, migration replay, Deno compilation, live RLS, and production delivery were not verified.

Passing these checks confirms the current source compiles and meets the configured lint rules. The reliability findings above are inferred from the reviewed control flow and migration definitions, not reproduced against production.
