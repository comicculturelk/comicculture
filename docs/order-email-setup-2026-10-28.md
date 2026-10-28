# Customer order email setup - 28 October 2026

## Outcome

Customer confirmations now use `ComicCulture <info@comicculture.lk>`. Replies go to `info@comicculture.lk`. The existing LK Domain MyMail-Lite mailbox works; no new mailbox subscription or paid upgrade was purchased.

## Confirmed cause

The existing storefront already calls `send-order-notification` after successful checkout. That function sends the internal notification and customer confirmation from authoritative database order data, with private notification tokens and per-recipient Resend idempotency keys.

Resend's last recorded customer attempt returned HTTP 403: the configured sender was the `onboarding@resend.dev` testing address. That address is restricted to the account owner's recipient email. At inspection, the notification-state table had no confirmed sends; older orders without notification-state rows cannot be classified from that table alone.

LK Domain's completed MyMail-Lite package contains one 1 GB mailbox, `info@comicculture.lk`. Its dashboard's Portal Login link used a non-resolving placeholder hostname. The owner's welcome instructions supplied the working portal, https://mail.mymailportal.lk/ . Login succeeded and the mailbox received the approved test. That provider hostname resolves through Postale infrastructure; a separate direct Postale subscription is unnecessary.

## Configuration applied

- Added and verified `comicculture.lk` as a Resend sending domain in Tokyo. Sending enabled, Resend receiving left disabled.
- Added its exact DKIM TXT and return-path CNAME records to Cloudflare, plus an initial non-enforcing DMARC record. Existing website records, root MX/SPF, nameservers and admin-auth email records were preserved.
- Published the existing LK mailbox's public DKIM key and documented mail/autoconfig/autodiscover records. Mail records remain DNS-only.
- Reused the existing sending-only order-notification API key, which already permits all verified domains. Its secret value was neither retrieved nor changed.
- Set Supabase `RESEND_FROM_EMAIL=ComicCulture <info@comicculture.lk>` and `RESEND_REPLY_TO_EMAIL=info@comicculture.lk`. Stored digests were verified against the intended non-sensitive values after saving.
- Kept internal notification recipients unchanged. Supabase Auth invitation SMTP and its separate key were untouched.
- The branded `webmail.comicculture.lk` alias was tested but returned a TLS hostname mismatch; its newly added DNS record was rolled back. Use the working provider portal rather than bypassing certificate warnings. Custom branded webmail certificates can be handled by LK support separately.

## Source changes

- `supabase/functions/send-order-notification/index.ts`: optional configured customer reply address, bounded 10-second provider request, payment-aware customer subject/body. Bank transfers pending verification say Order Received and explain receipt review. Already-paid bank transfers retain confirmed wording; COD explains payment on arrival. Removed premature dispatch promises. Pricing, recipients, order creation, stock and token/idempotency mechanisms are preserved.
- `tests/order-notification.test.mjs`: synthetic runtime tests for the real function, including authoritative recipients, sender/reply address, escaping, payment/preorder wording, partial failures, stable retry keys and invalid/replayed-token rejection. No network email or production database access in these tests.
- `package.json`: adds `npm run test:email`.
- This setup report.

The reviewed Edge Function was deployed directly as version 16 with JWT verification enabled. Its live source was retrieved and matched the tested local files. The owner subsequently authorized pushing all reviewed changes to main. No SQL migration is needed. The existing Vercel Git integration builds main when pushed; it does not deploy Supabase functions, so the function was deployed and verified separately as described above.

## Verification

- Two owner-approved, clearly labelled fictional delivery tests from `info@comicculture.lk`: one to the owner Gmail and one to the domain mailbox. Both marked Delivered by Resend; the domain test was also viewed in the actual LK mailbox.
- Received test headers: SPF pass, DKIM pass for comicculture.lk, DMARC pass. This confirms authentication, not a guarantee of inbox placement for every future recipient.
- Deno type check of the function: passed.
- TypeScript check and ESLint: passed.
- Email tests: 5 passed; admin: 23 passed; security: 18 passed; SEO: 5 passed including the production build. Total 51 tests, zero failures.
- Live notification boundary: unauthenticated request 401; missing token 400; random nonexistent order/token 409. No order email sent by those checks.
- Production orders remained 19, with the same latest creation timestamp. No real order, payment, stock mutation, old-order resend or customer notification was triggered during testing.

## Outlook setup

In the Outlook app, add an existing account and choose IMAP/manual setup rather than creating a Microsoft-hosted business mailbox.

| Setting | Value |
| --- | --- |
| Email / username | info@comicculture.lk |
| Incoming server | mail.postale.io |
| Incoming protocol / port | IMAP 993, SSL/TLS |
| Outgoing server | mail.postale.io |
| Outgoing port | SMTP 465, SSL/TLS |
| SMTP authentication | Required, same mailbox username and current password |

The canonical server names above are documented by the underlying provider and avoid relying on a newly provisioned branded hostname certificate. Webmail: https://mail.mymailportal.lk/ . An Outlook app can connect to the existing hosted mailbox; Microsoft-hosted custom-domain Exchange mail would be a separate licensed service and was not configured.

## Remaining limits and follow-up

- The owner should privately change the setup mailbox password shared in chat. A password change must be completed by the owner directly; no replacement password should be posted in chat. Automated order mail uses the separate Resend key, so changing this mailbox password does not break confirmations.
- No real production checkout was submitted merely to test email. The order-to-email path was traced in source and tested with synthetic database responses; delivery was tested separately through Resend with fictional details. The first legitimate future order should be checked in Resend and the existing notification status UI.
- Existing delivery triggering remains browser initiated with bounded retries and idempotency. Closing the browser immediately can interrupt it. A server-side durable dispatch mechanism would be a separate reliability improvement; it was not added as an unrelated queue/schema refactor.
- No historical failed customer email was resent. A deliberate backfill needs a reviewed recipient/order list to avoid stale or duplicate confirmations.
- Resend plan quotas apply across order notifications and Auth emails. Each normal order sends an internal email and a customer email. No paid tier or overage billing was enabled.
- DMARC is initially monitoring-only, without a reporting recipient. Stronger enforcement should follow verification of every legitimate sending service.

References: [LK MyMail](https://www.domains.lk/other-services/mymail/), [provider email-client settings](https://postale.io/client/), [provider DNS guidance](https://postale.io/configure), [Resend verified domains](https://resend.com/docs/dashboard/domains/introduction), [Resend pricing and limits](https://resend.com/pricing), [Microsoft custom-domain email](https://learn.microsoft.com/en-us/microsoft-365/admin/email/change-email-address).


## Push and Vercel review

The release checks were rerun before the authorized push: typecheck, lint, all 51 tests including the production build, and Deno function checking.

The four earlier ERROR deployments on codex/multi-user-admin-auth were preview builds. Their build logs report the missing VITE_TURNSTILE_SITE_KEY. Project environment metadata confirms that this variable targets Production and Development, but not Preview. The previous main deployments are READY. The checkout build guard remains enabled; no test key, private credential or security bypass was introduced to make previews build. Preview checkout requires appropriate widget/hostname and backend origin verification configuration, ideally using an isolated staging backend. That separate configuration remains outstanding.
