-- Bank Transfer payment verification: receipt storage + a new payment_status
-- value so a submitted receipt is distinguishable from "not yet paid".
-- `status` (the order workflow) is completely untouched by this migration.
-- Run this in the Supabase SQL editor (or via CLI migration).

-- `receipt_url` stores the storage OBJECT PATH within the private
-- `payment-receipts` bucket (created in the next migration) — not a public
-- URL, since that bucket has no public read policy. Admins resolve it to a
-- viewable URL on demand via a signed URL (see getSignedUrl in storage.ts).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_url text;

-- Widen the existing check constraint (added in 20260725010000) to allow
-- 'awaiting_verification': set once a Bank Transfer customer has uploaded a
-- receipt, cleared to 'paid' or 'failed' by an admin action.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending', 'awaiting_payment', 'awaiting_verification', 'paid', 'failed'));

-- No new RLS policy is needed for the confirm/reject admin actions in
-- Admin.tsx — the existing "Authenticated users can update order status"
-- policy from 20260719130000_admin_orders_rls.sql already covers updates
-- to any column, including payment_status.
