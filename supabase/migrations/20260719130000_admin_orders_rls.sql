-- Admin access to orders via Supabase Auth
-- Run this in the Supabase SQL editor (or via CLI migration).
-- Anon role keeps write-only (insert) access from the storefront checkout,
-- unchanged from the original orders migration. This adds read/update
-- access for any authenticated user (i.e. the admin account you create
-- manually in Supabase Dashboard -> Authentication -> Users).

create policy "Authenticated users can view orders"
  on orders for select
  to authenticated
  using (true);

create policy "Authenticated users can update order status"
  on orders for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can view order items"
  on order_items for select
  to authenticated
  using (true);
