-- Optional payment method on orders, surfaced in the admin notification email.
-- Nullable since the current checkout flow doesn't collect it yet — safe to
-- add now so the field is ready whenever a payment method selector is added
-- to Checkout.tsx.
-- Run this in the Supabase SQL editor (or via CLI migration).

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method text;
