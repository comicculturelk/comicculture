-- Separate payment state from order workflow state.
-- `status` continues to represent the order workflow only
-- (pending/confirmed/packed/shipped/delivered/cancelled) and is untouched.
-- `payment_status` is new and tracks payment independently:
--   - Cash on Delivery orders start 'pending' (nothing owed until arrival)
--   - Bank Transfer orders start 'awaiting_payment' (must not auto-confirm)
-- Run this in the Supabase SQL editor (or via CLI migration).

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending';

ALTER TABLE orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending', 'awaiting_payment', 'paid', 'failed'));

-- payment_method already exists (added in 20260722070000) as free text.
-- Now that Checkout.tsx always sends one of two known values, constrain it
-- so bad data can't slip in from anywhere else that writes to this table.
ALTER TABLE orders
  ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('COD', 'BANK_TRANSFER'));
