-- Private storage bucket for Bank Transfer payment receipts.
--
-- Unlike `product-images` (public — the storefront needs to display them),
-- receipts can show bank account details and are NOT made public. Only
-- admins can read them, and only via a signed URL generated server-side
-- (see getSignedUrl in storage.ts) — there is no public/anon select policy.
--
-- Customers upload their own receipt anonymously during checkout, which
-- mirrors the anon-insert-only pattern already used for orders/order_items
-- (20260719110000_create_orders.sql): anon can create, never read.
--
-- Run this in the Supabase SQL editor (or via CLI migration).

insert into storage.buckets (id, name, public)
values ('payment-receipts', 'payment-receipts', false)
on conflict (id) do nothing;

-- Allow anonymous customers to upload their own receipt at checkout.
create policy "Anyone can upload a payment receipt"
on storage.objects for insert
to anon
with check (bucket_id = 'payment-receipts');

-- Only admins can view receipts (no public/anon read policy is added).
create policy "Authenticated users can view payment receipts"
on storage.objects for select
to authenticated
using (bucket_id = 'payment-receipts');

-- Admins can remove a receipt if needed (e.g. bad/duplicate upload).
create policy "Authenticated users can delete payment receipts"
on storage.objects for delete
to authenticated
using (bucket_id = 'payment-receipts');
