# Order status emails

## What changed

The database queues one customer status message per order and status when a genuine transition commits. The trigger runs on status changes and does not scan or resend historical orders. The existing checkout purchase confirmation and admin audit remain in place. For COD, the original confirmation covers the Confirmed stage. Bank-transfer checkout sends an order and receipt acknowledgement. A successful verification queues the separate Confirmed email. Packed, Shipped, Delivered, and Cancelled are independent updates. A cancellation reports a completed refund only when the order has a refunded payment state. It does not email internal cancellation notes or refund references.

Orders → View Details → Customer status emails shows Pending, Sent, Failed and Skipped. Sent means Resend accepted the request. If a provider delivery or bounce webhook is added later, keep delivery and acceptance as separate states. The retry button queues another attempt and writes an admin audit event. It does not call the provider from the browser.

The worker waits at least 45 seconds before dispatch, uses short PostgreSQL claims with two-minute leases and rechecks status immediately before sending. Later transitions supersede pending and failed messages. A transition can still commit after the final check or after Resend has accepted an email. The worker releases its database locks before the provider call. Transient failures back off for up to five attempts. A still-current failed email can be retried by an authorized admin using its original provider key. Retries stop 23 hours after first claim to stay inside Resend's 24-hour idempotency window. A crash after acceptance is safe to retry within that window. After it closes, use Resend's history to investigate before deciding how to contact the customer. The immutable retry payload is cleared when sent, skipped, or past the safe window. [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys)

The worker escapes stored strings and only includes courier links with a valid HTTPS URL, public-looking hostname, and no embedded credentials or explicit port. The store tracking link is included even when a courier link is unavailable. The worker uses existing Resend credentials and a separate scheduler secret. The public checkout gateway, order-notification token flow, admin MFA and permissions keep their existing checks.

## Dependencies and migration order

- `20261115140801_order_status_email_outbox.sql` depends on the existing Orders, Admin Activity Log, admin authorization, and status transition migrations. It adds one table, trigger, and restricted RPCs. It does not rewrite existing orders or notification history.
- The scheduler SQL is a separate operator action so a deployment can finish and verify the worker before recurring email dispatch begins.

## Local verification

Use only disposable fixtures and mock the email provider. The repository's normal local frontend may point at production. Override the environment before starting Vite.

```powershell
$env:VITE_SUPABASE_URL = 'https://delivery-test.supabase.co'
$env:VITE_SUPABASE_ANON_KEY = 'synthetic-anon-key'
$env:VITE_TURNSTILE_SITE_KEY = 'synthetic-site-key'
$env:VERCEL = '0'
$qa = Join-Path $env:TEMP ('comicculture-features-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $qa | Out-Null
$env:COMICCULTURE_DASHBOARD_FIXTURE = Join-Path $qa 'dashboard.json'
$env:COMICCULTURE_REFERENCE_FIXTURE = Join-Path $qa 'references.json'
$env:COMICCULTURE_EMAIL_FIXTURE = Join-Path $qa 'emails.json'
$env:COMICCULTURE_FEATURE_SCREENSHOTS = Join-Path $qa 'screenshots'
node --test tests/admin-dashboard.test.mjs tests/security.test.mjs tests/order-status-email.test.mjs
node --test tests/order-notification.test.mjs
npm run dev -- --host 127.0.0.1 --port 5187 --strictPort
```

Run `python tests/delivery-settings.browser.py` in a second terminal with the same fixture and screenshot variables, Python Playwright and Microsoft Edge. The test intercepts project traffic and uses the isolated SQL output. It exercises product and cart interactions, checkout, admin roles, Dashboard reporting filters, the status UI and authorized retries. Screenshots use synthetic data. The native PostgreSQL concurrency suite in the existing release runbook additionally exercises two outbox workers using PostgreSQL row locks. For Edge type checking run `npx --yes deno check --no-lock` separately for the worker, checkout and original confirmation entrypoints with their function-specific Deno config where applicable.

## Production rollout after approval

1. Check the production branch and migration history against the reviewed release. Use the established scratch-directory and exact-file dry-run procedure for Supabase. Apply each approved additive migration before exposing its corresponding feature. Do not run any other pending migration.
2. Deploy the revised `send-order-notification` function before starting dispatch so that bank receipts and verification updates have distinct purposes. Deploy `order-status-email-worker` with its own 32–256 character random `ORDER_STATUS_WORKER_SECRET`. It uses `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and an existing monitored `RESEND_REPLY_TO_EMAIL` or `ADMIN_NOTIFICATION_EMAIL`. Keep the JWT settings of existing functions. The new worker endpoint uses its own scheduler secret for authentication. Deploy only that worker with `--no-verify-jwt` for the Vault-backed Cron request.
3. Keep dispatch disabled during worker verification. The secret-authenticated `x-worker-operation: check` probe verifies database access without claiming queued messages. For one controlled Resend check, configure `ORDER_STATUS_VERIFICATION_RECIPIENT` with an approved address and invoke `x-worker-operation: verify-resend`. The endpoint ignores any supplied recipient and uses a fixed provider idempotency key. Unset the recipient secret after acceptance and verify the test operation is disabled.
4. Enable Supabase Cron, pg_net and Vault for the order worker. In Vault store the official HTTPS worker URL under `order_status_worker_url` and an identical worker secret under `order_status_worker_secret`. Review queued counts and mark any pre-activation pending entries skipped before starting dispatch. Run `supabase/ops/schedule-order-status-emails.sql` only after verification. The scheduled request resolves both values from Vault. Check Cron run records and HTTP responses. An unscheduled worker leaves status updates and existing confirmations available.
5. Check reporting and Orders with an authorized owner/admin at AAL2, verify staff access remains restricted, confirm the jobs are enabled, and inspect natural checkout and status traffic. Run synthetic customer and email scenarios in staging when available. For rollback, pause the dispatch cron job if reverting the status email worker. Keep existing orders and notification records. Restore the old confirmation function only after pausing dispatch to avoid duplicate bank updates.

The worker schedules require project configuration at release.
