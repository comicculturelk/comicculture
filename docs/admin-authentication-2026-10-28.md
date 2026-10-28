# ComicCulture individual admin accounts — 28 October 2026

## Status and audit

The approved production rollout is complete: backend migration, invitation function, DNS, verified sending domain, custom SMTP and frontend are active. The existing owner signed in successfully with their own password and authenticator. Team and Account were checked in the authenticated production UI. No teammate invitation or account was created; no real order or customer-data write was made.

### Completed rollout

- Applied `20261028060247_multi_user_admin_onboarding.sql` to the intended Supabase project. This is the recorded server migration version; do not apply it again.
- Deployed `admin-invite` version 1 with JWT verification enabled and `ADMIN_ORIGIN=https://comicculture.lk`. Production-origin OPTIONS returned 204, an untrusted origin 403, and anonymous POST 401 before email sending. Private invitation-table/RPC grants remain closed to anonymous callers.
- Existing owner membership and verified MFA factor were preserved. Public signup and anonymous sign-in are disabled; verified email and MFA remain required. Future passwords require 12 characters; email OTP/link expiry is one hour. Site URL and exact invite/recovery redirects are configured for the canonical production origin.
- With explicit owner approval, moved DNS hosting to Cloudflare Free. All five existing website, MX, SPF and Google verification records were preserved, with three Resend verification records added. All remain DNS-only. Cloudflare and public DNS confirmed active nameservers `ace.ns.cloudflare.com` and `mary.ns.cloudflare.com`. Existing customer mail records were not overwritten. Exact record backup: `docs/dns-migration-2026-10-28.json`.
- Resend verified `auth.comicculture.lk`. A sending-only key restricted to that domain was created; the owner entered its value directly into Supabase. Custom SMTP remained enabled after reload: `smtp.resend.com`, port 465, username `resend`, sender `accounts@auth.comicculture.lk`, sender name ComicCulture. No credential value was logged or written to source.
- The owner approved one password-reset delivery test to their existing account. Supabase returned HTTP 200 and Resend recorded Delivered. No reset link was opened and no password changed. Auth invitation templates use `{{ .ConfirmationURL }}`.
- Frontend release `d16605d4367881d4771bb05fbcfeebbdd9eb2ec0` reached Vercel READY on production and served comicculture.lk. Owner login, Team and Account were verified afterward. A final presentation correction makes the invitation action say **Send invitation**, and the existing-account action **Save access**.
- No paid plan, DNS proxying, DNSSEC change, scheduled monitoring, new team access or order submission was performed.

The architecture already uses Supabase Auth email/password, refreshable browser sessions in a separate `comicculture-admin-auth` namespace, and Supabase per-user TOTP. PostgreSQL `store_admins` is the authoritative active-role allowlist. `is_store_admin`/`is_store_owner` enforce MFA and live membership for operational RPCs and RLS/storage policies. The frontend has no service-role key. `api/page.ts` and `api/sitemap.ts` are public SEO/catalog handlers, not privileged administrative endpoints. Existing privileged operations run through Supabase RPCs/table policies, plus the token-protected notification Edge Function. Checkout retains its separate public session and protected Edge gateway.

Confirmed root cause: the live allowlist has exactly one active verified owner, with one verified factor, and no second member. Team Management previously called `admin_upsert_staff`, which explicitly requires an already-created Supabase Auth user; it never sent invitations. There was no account activation/password setup or password recovery UI. MFA is already independent per account; sharing the owner's password naturally challenges the owner's factor. Do not share that account. SMTP was initially disabled and no sending domain was verified; those delivery blockers were corrected in the approved rollout.

Security gaps found: raw provider login errors were shown, verified email was not required when granting membership, the frontend MFA gate retained its old verified flag during token reassessment, and concurrent team-role changes were not serialized around the last-owner check. There was no Staff role. No active fixed-email bypass or exposed service credential was found in the inspected current auth paths; historical bootstrap migrations contain the original owner's ID and are intentionally not rewritten.

## Implementation

- Reuse the existing Auth client, storage namespace, owner/admin records, per-user MFA and database authorization. No custom password store, token signing, TOTP, new auth vendor, or unrelated storefront redesign.
- Generic sign-in/recovery messages; email reset links return only to the application's fixed admin recovery path. Existing verified-factor accounts must pass MFA before password reset UI is shown. Invalid/expired links return to sign-in guidance.
- Invite callback uses the SDK-established session, validates the email via Auth, sets the user's chosen password, and consumes the pending invitation using their actual authenticated user ID. Email activation alone never authorizes privileged operations without MFA.
- `admin-invite` is a server-only Supabase Auth Admin invite boundary. It validates the bearer with Auth, checks current owner/MFA through the caller's RPC context, streams at most 2 KB, validates roles/email, prepares a bounded pending invitation, and uses the service key only for Auth's invitation API. The redirect is derived from server `ADMIN_ORIGIN`, never supplied by the caller. No token or invitation URL is returned or logged.
- Pending invitations are RLS-private, owner-controlled, expire after 24 hours, and are consumed once. Auth's own email token expiry can be shorter. Preparation has a 1-minute per-email cooldown and 10 pending/recent invitations per owner per hour; Supabase Auth also applies its email limits. If delivery fails, pending access is not silently enabled; cancel/retry after fixing delivery. Existing verified users use the separate grant-access action.
- Preserve full Owner and operational Admin behavior. New Staff has only read-only inventory and own-account UI. `has_store_permission` centralizes database capabilities; existing RPC/RLS checks delegate through `is_store_admin`. `adminPermissions.ts` centralizes navigation. Staff cannot gain write access by changing URLs or metadata.
- Team mutations serialize through a transaction advisory lock before checking owner membership and the remaining owner count. Existing owner/self-deactivation protections remain. New invitations cannot create owners; a verified existing member can be deliberately promoted by an owner.
- Account settings allow a second authenticator to be enrolled and verified before removing an old one, and support global sign-out. No recovery secrets/codes are logged. Lost-all-factor recovery remains a manual, identity-checked Supabase Auth administrative process; there is no email-only MFA bypass.
- Deactivation is checked from live membership on each protected database operation, including previously issued JWTs. Global sign-out revokes refresh sessions; already-issued access JWTs can remain valid until expiry. Deactivate membership immediately when revocation is security-sensitive.

## Migration and configuration reference

Migration: `supabase/migrations/20261028060247_multi_user_admin_onboarding.sql`.
It preserves existing users, roles and factor records; adds Staff, a private pending-invitation table, invitation lifecycle functions, verified-email membership checks, serialized team mutations, centralized permissions and a read-only inventory RPC. It has already been applied to production with owner approval. The following checklist documents the setup for future environments; do not reapply the live migration. Do not run `db push` without reviewing exactly which migrations would execute.

1. Prepare an isolated Supabase staging project/database with synthetic users. Check existing owner email confirmation and a working MFA backup before any rollout. Keep the current production owner session and Supabase administrative recovery access.
2. In staging Auth settings: disable public user signup, require email confirmation, retain TOTP, set an appropriate password policy (the UI requires 12 characters), retain native password/MFA rate limits, and review session expiry. Do not disable MFA. These production settings were verified/configured during the approved rollout; native hosted rate-limit behavior was not stress-tested.
3. Configure **custom SMTP for Supabase Auth** using a verified sender. The default Supabase email service restricts recipients and is unsuitable for general team invitations. Existing order-notification Resend integration is separate and does not automatically configure Auth email delivery.
4. Set Site URL to the chosen canonical origin. Allow only exact invitation and recovery redirects: `https://comicculture.lk/admin?auth=invite` and `https://comicculture.lk/admin?auth=recovery`. Use separate exact localhost/staging URLs only in staging. Keep invitation/recovery templates using Supabase's confirmation URL so Auth validates the expiring token before redirecting. Set email OTP/token expiry to an hour or less; pending authorization still expires at 24 hours. Do not allow wildcard third-party redirects. Canonical admin links should use comicculture.lk, since the invitation boundary accepts one exact origin.
5. Apply the local migration in staging. Deploy `supabase/functions/admin-invite/{index.ts,handler.ts,deno.json}` to staging with JWT verification enabled. Set server-side `ADMIN_ORIGIN` to the exact staging origin. Standard Supabase URL/anon/service-role environment values are provided by the platform; never copy the service key into Vite or browser configuration. No new Vercel secret is needed.
6. Deploy the frontend to staging with existing public Supabase variables targeting staging. Test the full invitation email, password creation, two independent authenticator enrollments, recovery, replacement and deactivation. Human testers must enter their own passwords/codes; never send them into chat.
7. After explicit production approval, apply the reviewed compatible migration, deploy/configure the invite Edge Function and publish the compatible frontend. Recheck owner access before inviting anyone. The owner-authorized production release is complete; subsequent pushes to main trigger the existing Vercel Git deployment.

Rollback: prefer forward fixes. The additive database objects may stay while rolling back the frontend. Existing owner/admin authorization remains compatible. Do not drop the private table with outstanding invites, remove users, or restore pre-MFA helpers. A full database rollback needs a reviewed restoration of previous function definitions and disposition of Staff memberships; do not blindly narrow the role constraint while Staff rows exist.

## Invite your friend

1. Sign in with your own owner account and authenticator.
2. Open Team; choose **Invite new teammate**.
3. Enter your friend's email, choose **Administrator** for store operations or **Staff / inventory read only**, and click **Send invitation**.
4. Your friend opens their email on a trusted browser, follows the invitation, and sets their own password. They are signed out and then sign in using their own email/password.
5. They select **Set up authenticator**, scan their own QR and verify their own six-digit code. They should keep a secure authenticator backup.
6. Confirm their permitted dashboard works. They never use your password or verification code.
7. If they already have a verified Auth account, use **Update existing verified account** instead. For failed/expired invitations, cancel the pending entry and retry after checking Auth delivery logs; existing users can recover their password. Deactivate access in Team when it is no longer required.

## Recovery procedure

With a working factor: Account > Add replacement authenticator > scan/verify replacement > remove the old factor. Keep at least one verified factor. Signing out all sessions does not change a role.

With every factor lost: identity-check the person outside email alone, deactivate their membership first (for an owner, arrange another trusted owner and preserve last-owner protections), revoke Auth sessions through Supabase, and use Supabase's supported factor recovery administration. Restore membership only after verified email/password and a new verified factor are confirmed. Keep MFA enforcement enabled throughout. The application deliberately has no owner-operated "remove someone else's MFA" shortcut. If the sole owner loses all factors, use the secured Supabase account and a reviewed recovery procedure; do not remove database MFA enforcement to regain access.

## Verification and limitations

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test:admin`: 23 passed, including an SDK-level callback/session isolation regression.
- `npm run test:security`: 18 passed.
- `npm run test:seo`: production build and 5 tests passed. Total 46 automated tests.
- New tests execute the migration in isolated PGlite and use synthetic requests with mocked Auth/email. They cover existing owner preservation, independent member activation, mandatory MFA claims, uninvited access, metadata manipulation, Staff limits, null roles, self-demotion prevention, deactivation with old claims, expired/cancelled invitations, anonymous denials, authenticated invitation endpoint checks and fixed redirects. They do NOT claim to cryptographically test actual TOTP/password/email expiry on hosted Auth.
- Existing inventory/catalog/order transaction tests and checkout/SEO regressions pass. No real order, stock mutation, customer receipt or notification was created.
- Browser: local admin login rendered at desktop (1280 × 720) and mobile (375 × 812); mobile document width matched the viewport. Empty-email recovery showed guidance without sending. The owner subsequently entered their own production credentials/MFA, and authenticated Team and Account rendered successfully. Team invitation mode permits Administrator/Staff, and Account keeps the last verified factor protected. No factor was enrolled or removed during inspection.
- Production storefront smoke check: product size selection and add-to-cart worked; checkout showed the selected item and correct subtotal/delivery/total. Public nonexistent tracking/promo probes returned no result safely. The temporary cart item was removed. No checkout submission or inventory mutation occurred.
- Initial build caught file-encoding errors introduced during local editing; files were normalized and the subsequent production build passed.
- Hosted SMTP delivery, signup-disable settings, password policy and exact redirects were verified/configured. A real second-user invitation, password activation, second independent authenticator, hosted expired-session handling and lost-factor recovery remain unexercised end to end. No friend email was supplied, so no invitation was sent. Automated synthetic tests cover the authorization paths but do not replace these human onboarding checks. Native rate limits were not stress-tested.
- Existing SPA session storage remains browser-managed; CSP and server-side membership/MFA checks are retained. No claim of HttpOnly session storage is made.
- Live Supabase advisor notices concern intentionally private no-policy RLS tables, existing membership-guarded SECURITY DEFINER functions, and disabled paid leaked-password detection. No plan upgrade was made. Review warnings contextually rather than weakening policies to silence them.

References: [Supabase invitations](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail), [password recovery](https://supabase.com/docs/guides/auth/passwords), [TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp), [SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp), [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits), [security advisors](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Files

Modified: src/pages/Admin.tsx; src/data/admin.ts; src/lib/supabase.ts; src/components/admin/AdminMfaGate.tsx; src/components/admin/AdminTeam.tsx; tsconfig.node.json.
Added: src/lib/adminPermissions.ts; src/components/admin/AdminAccount.tsx; src/components/admin/AdminPassword.tsx; src/components/admin/StaffInventory.tsx; supabase/functions/admin-invite/index.ts; supabase/functions/admin-invite/handler.ts; supabase/functions/admin-invite/deno.json; supabase/migrations/20261028060247_multi_user_admin_onboarding.sql; tests/admin-auth.test.mjs; docs/dns-migration-2026-10-28.json; this report.
Deleted: none. No dependency changes. Complete source files remain in the local working tree and the accompanying source ZIP, excluding environment files and credentials.

### Final-release callback correction

The public storefront client previously used SDK defaults that detect authentication URL fragments. Because the admin page is lazy-loaded, this client could consume an invitation before the admin client initialized. Public shopping now explicitly disables URL-session detection, session persistence and token refresh. The separate admin client still handles authentication normally. A synthetic SDK runtime test verifies no callback consumption, stored-auth-session access or network call occurs in the public client.

### SMTP activation

Resend key ComicCulture Supabase Auth was created with sending-only permission restricted to auth.comicculture.lk. The owner transferred it directly into Supabase SMTP because the browser redacts credentials. After reloading, custom SMTP is confirmed enabled with smtp.resend.com, port 465, ComicCulture sender name, and a stored hidden password. No key value is in source, chat output or local files. The owner approved one password-reset delivery test. Supabase accepted it (HTTP 200) and Resend recorded Delivered. No password was changed, no reset link was opened, and no teammate account was created.
