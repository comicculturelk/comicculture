-- Admin stock management: allow authenticated users to update products.stock
-- Run this in the Supabase SQL editor (or via CLI migration).
-- Anon (storefront) keeps read-only access to products, unchanged.
-- Only the anon-inaccessible `authenticated` role (your admin account) can write.

create policy "Authenticated users can update product stock"
  on products for update
  to authenticated
  using (true)
  with check (true);
