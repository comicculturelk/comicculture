# Delivery settings

After rollout, open **Admin → Settings**, enter the delivery fee in LKR, and select **Save Changes**. Owners and admins need a verified MFA session. The amount can be zero for free delivery or up to Rs. 99,999,999.99, with at most two decimal places. Changes apply to new orders and appear in the existing admin history. Historical orders keep their saved subtotal, delivery fee, discounts, and total.

## Checkout behavior

The storefront reads the singleton delivery setting through the public Supabase client. Checkout needs a successful read to display a total and accept an order. The checkout gateway passes the displayed fee and total to the existing database transaction as confirmation values. Postgres locks the fee row against concurrent edits and calculates the amount from the current fee, catalog prices, and eligible promotion. A mismatch rejects the transaction and leaves its stock, promotion, receipt association, and idempotency records unchanged. A retry of an already committed request returns the original result.

When the delivery fee changes during checkout, the customer sees the updated amount and submits again. A bank transfer requires a receipt for the displayed total. If an uploaded receipt is cleared after a price change and the customer already transferred money, the checkout directs them to contact the store before paying again. Product metadata uses the public fee when it can be fetched and follows the existing SEO page cache.

## Release sequence

1. Apply the reviewed [SQL migration](../supabase/migrations/20261112113607_centralize_delivery_fee.sql) after production authorization. It seeds the existing Rs. 350 fee, limits public access to reads, and grants authenticated users update access to the fee column subject to the existing owner/admin MFA policy.
2. Release the updated Supabase `checkout` Edge Function so it can translate pricing conflicts into actionable responses.
3. Release the storefront and admin frontend. Verify the seeded fee and both checkout displays before changing the setting. Old frontend bundles can submit without the new quote fields only while the fee matches their published Rs. 350 amount.

The feature was implemented locally. The live fee and production order records were untouched.

## Local browser test

Run a second Vite instance with the synthetic configuration below, then run `python tests/delivery-settings.browser.py` from the repository root. The test uses Python Playwright and Microsoft Edge. Its routes intercept the synthetic backend and all test order and admin requests.

```powershell
$env:VITE_SUPABASE_URL = 'https://delivery-test.supabase.co'
$env:VITE_SUPABASE_ANON_KEY = 'synthetic-public-key'
$env:VITE_TURNSTILE_SITE_KEY = 'synthetic-turnstile-site-key'
npm run dev -- --port 5187 --strictPort
```
