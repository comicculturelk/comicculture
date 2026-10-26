# Security hardening — implementation and activation

Implemented and activated in production on 26 October 2026. Source files and activation migrations are preserved in this repository.

## What changed

- Local Vite listens on loopback and no longer allows arbitrary hostnames. Vite/plugin dependencies are patched, the Supabase SDK is pinned, and the vulnerable PostCSS parser is overridden with its patched compatible API. npm and Deno lockfiles record dependency resolutions.
- One Supabase Edge Function, `checkout`, gates orders and receipt uploads with Turnstile Siteverify. It checks success, action, and the exact configured frontend hostname. It also limits requests using HMAC-hashed client addresses and shared database counters. Tracking and promotion previews use this same boundary with independent limits.
- Receipt requests have an actual streamed-body limit, allowed signatures/formats, and bounded dimensions. These checks are not a full image re-encoder or antivirus scanner. The server chooses the path and registers it to a checkout request; the database checks that ownership and the stored object before accepting bank transfer proof.
- An idempotent database wrapper returns the existing order for an identical checkout retry, without decrementing inventory or consuming a promotion twice. A changed payload cannot reuse a completed request ID. The existing pricing, discount, stock, notification-token, and payment transaction remains authoritative.
- A BEFORE INSERT trigger restores email validation and normalization, rejects null/unknown payment methods, bounds delivery details, and requires a real bank-transfer receipt. It does not rewrite historical orders. Bank transfers still await manual verification.
- Admin sign-in now has authenticator enrollment/challenge UI. Activation makes the existing database membership helpers require `aal2`, protecting RPCs, table policies, and storage policies. Membership is still checked against active database records.
- Unnecessary whole-table privileges are revoked. New catalog uploads have a 10 MB bucket limit and an explicit image MIME allowlist (including existing GIF/SVG support).
- A conservative CSP permits existing styles/fonts/images and Turnstile while restricting script sources, forms, framing, base URLs, and embedded objects. Local production preview reads the same headers from vercel.json.

No new Redis instance, queue, authentication service, payment implementation, or separate Worker is introduced.

## Production activation completed

- Managed widget **ComicCulture checkout** was created in the ComicCulture Cloudflare account. Production hostname verification accepts only `comicculture.lk` and `www.comicculture.lk`; localhost is excluded from the production gateway.
- The private Turnstile key is in Supabase secrets. Only its public sitekey is in the frontend/Vercel environment. Temporary local secret copies and the isolated probe were removed.
- Compatible migrations `20261026114608_security_checkout_boundary.sql` and `20261026114635_security_admin_and_uploads.sql` were applied before releasing the new storefront.
- Checkout gateway version 2 and the notification function with its pinned SDK (version 12) are deployed with JWT verification retained.
- The compatible storefront was deployed to production through Vercel from reviewed source files, without a Git commit or push. Final deployment: `dpl_FPFoTPYiJAUixHwoFNB7egVfoQn1` (READY, production domains assigned). Vercel performed the configured gateway preflight before building.
- The owner enrolled and verified their own authenticator. An aggregate database check confirmed one verified active-admin factor; no QR, setup key, or code was collected.
- Final migration `20261026120954_security_activate_boundary.sql` was then applied. Read-only checks confirm direct anonymous order/promo calls, direct authenticated tracking calls, and the unrestricted receipt policy are disabled. Admin membership requires `aal2`. The production admin dashboard still opens after reload.
- Real Cloudflare verification was tested in an isolated local harness using the actual handler and mocked database calls: first use succeeded, replay was rejected, and zero production orders or customer notifications were created. Production gateway checks confirmed allowed-origin preflight, rejected untrusted/local origins, rejected invalid tokens, and safe empty tracking/promo responses.

The production application is deployed; these source changes are included in the security-hardening release commit. Do not reapply the activation migrations or reopen anonymous APIs. Keep an authenticator backup and Supabase account access for recovery.

## Advisor review

Remaining no-policy RLS notices concern intentionally private tables. Authenticated SECURITY DEFINER notices concern existing admin APIs that check live membership; the shared membership guard now also requires MFA. They must not be made public or removed merely to silence the advisor. Supabase leaked-password detection remains disabled because it requires a paid plan; no subscription was purchased. See [Supabase password-security guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Operational bounds

The gateway currently allows, per managed-proxy client address per hour: six receipt attempts, ten order attempts, and sixty attempts each for tracking and promotions. Raw IPs are not stored in the application tables. Successfully verified receipt/order traffic also has a 500/hour global ceiling per action. Limits are defined once in the gateway; database counters are atomic and stale windows are pruned. Verify client-address forwarding on the deployed Supabase gateway; do not front this handler with an untrusted proxy without configuring source-address handling. As with any public endpoint, these controls mitigate abuse rather than guarantee immunity to distributed attacks.

Receipts are accepted up to 5 MB, 10,000 pixels per edge and 20 million pixels total. Upload records are bound to a random checkout request ID. An unused receipt expires for checkout after 24 hours. After a successful, verified upload, bounded cleanup removes up to ten registered receipts older than 14 days that have no order association. Cleanup never selects historical receipts outside the new registry, and attached order receipts are retained. Cleanup failure cannot make an otherwise successful upload fail. This is traffic-driven maintenance, not a new scheduled service.

The public catalog bucket permits JPEG, PNG, WebP, GIF, SVG and AVIF up to 10 MB. This changes future uploads, not existing objects. Only active, MFA-verified admins can upload after activation.

Idempotency records are private and retain a request hash plus the minimal checkout response/token; they do not duplicate customer addresses or the entire submitted payload. Browser session storage preserves the request ID across ordinary retry/reload; it is cleared only after successful confirmation. When browser storage is blocked, in-memory protection still covers retries in the same checkout instance.

## Validation completed

- TypeScript app/server/gateway checks and ESLint passed.
- Production build and all five existing SEO tests passed with emitted JavaScript.
- All 14 existing admin tests passed.
- All 18 new security tests passed, including actual PostgreSQL migrations and checkout transactions in isolated PGlite, idempotent stock behavior, validation rollback, receipt association, permission revocation, MFA membership, request limits, invalid token/action/hostname handling, bounded input, and synthetic image upload/retention.
- Deno checked both Edge Function entrypoints with their pinned dependencies.
- npm audit and npm audit --omit=dev report zero known vulnerabilities after dependency updates.
- The Vercel release guard was exercised with the missing widget configuration: it blocked the release as expected before writing/publishing a build.
- Browser: product rendering and local size/cart/checkout navigation checked. With no widget configured, checkout correctly remains disabled and displays an availability message. Production preview rendered product text/images/fonts with CSP and no browser errors observed. No order was submitted.

Real-provider verification, owner MFA enrollment, production migrations/release and read-only authenticated dashboard checks are complete. A production order, receipt upload, or email was deliberately not submitted. Small-mobile viewport emulation did not change the measured browser viewport, so no new 320px visual-test claim is made. The widget uses Cloudflare compact mode when its rendered container is narrower than the documented 300px flexible minimum. No claim is made that these controls eliminate every possible security risk.

Supabase leaked-password detection remains a paid-plan-only option. No subscription was purchased or changed. Authenticator enforcement and unique passwords provide independent protection; enable the leaked-password feature if a future plan includes it.

## Final live smoke check

After activation, the production product page, size selection, cart and checkout rendered correctly. Turnstile showed Success, and the admin dashboard loaded after refresh. Tracking and promotion probes for intentionally nonexistent values returned 200/null; a deliberately invalid order verification returned 403. The storefront returned its enforced CSP. No application errors were observed; Cloudflare's challenge iframe emitted two obfuscated console messages during verification but then completed successfully. The test cart was cleared; no order or receipt was submitted.
