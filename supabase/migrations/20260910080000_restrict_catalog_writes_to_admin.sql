-- Restrict catalog write access to the single known admin account.
--
-- Problem: the INSERT/UPDATE/DELETE policies on products, product_versions,
-- product_version_sizes, and collections currently allow ANY authenticated
-- Supabase Auth user to write (qual/with_check = true, gated only on the
-- `authenticated` role). Since "Allow new users to sign up" is enabled and
-- the frontend's admin panel is the only thing that signs in, any visitor
-- who registers an account would otherwise get full catalog write access.
--
-- Fix: narrow each existing write policy to the one current admin account
-- (comicculturelk@gmail.com, auth.uid() = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b')
-- using ALTER POLICY, which updates each policy's USING/WITH CHECK
-- expression in place without dropping/recreating it or touching its name,
-- role list, or command type. SELECT policies (anon + authenticated, on all
-- four tables) are untouched, as are grants, RPC permissions, and the
-- signup setting itself.

alter policy "Authenticated users can insert products" on public.products
  with check (auth.uid() = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b');

alter policy "Authenticated users can update product stock" on public.products
  using (auth.uid() = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b')
  with check (auth.uid() = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b');

alter policy "Authenticated users can delete products" on public.products
  using (auth.uid() = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b');

alter policy "Authenticated users can insert product versions" on public.product_versions
  with check (auth.uid() = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b');

alter policy "Authenticated users can update product versions" on public.product_versions
  using (auth.uid() = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b')
  with check (auth.uid() = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b');

alter policy "Authenticated users can delete product versions" on public.product_versions
  using (auth.uid() = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b');

alter policy "Authenticated users can insert product version sizes" on public.product_version_sizes
  with check (auth.uid() = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b');

alter policy "Authenticated users can update product version sizes" on public.product_version_sizes
  using (auth.uid() = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b')
  with check (auth.uid() = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b');

alter policy "Authenticated users can delete product version sizes" on public.product_version_sizes
  using (auth.uid() = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b');

alter policy "Authenticated users can insert collections" on public.collections
  with check (auth.uid() = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b');

alter policy "Authenticated users can update collections" on public.collections
  using (auth.uid() = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b')
  with check (auth.uid() = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b');

alter policy "Authenticated users can delete collections" on public.collections
  using (auth.uid() = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b');

-- Explicitly untouched by this migration:
--   * SELECT policies on all four tables (anon + authenticated stay as-is)
--   * All GRANTs
--   * create_order, get_order_tracking, adjust_stock, restock_product,
--     restore_stock_on_cancel and their permissions
--   * The "Allow new users to sign up" Auth setting
