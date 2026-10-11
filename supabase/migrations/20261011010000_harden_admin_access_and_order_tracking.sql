-- Restrict customer and operational data to the designated store administrator.
-- Public catalog reads and guest checkout/order tracking remain available.

begin;

alter policy "Authenticated users can insert products" on public.products
  with check ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);
alter policy "Authenticated users can update product stock" on public.products
  using ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid)
  with check ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);
alter policy "Authenticated users can delete products" on public.products
  using ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);

alter policy "Authenticated users can insert product versions" on public.product_versions
  with check ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);
alter policy "Authenticated users can update product versions" on public.product_versions
  using ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid)
  with check ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);
alter policy "Authenticated users can delete product versions" on public.product_versions
  using ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);

alter policy "Authenticated users can insert product version sizes" on public.product_version_sizes
  with check ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);
alter policy "Authenticated users can update product version sizes" on public.product_version_sizes
  using ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid)
  with check ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);
alter policy "Authenticated users can delete product version sizes" on public.product_version_sizes
  using ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);

alter policy "Authenticated users can insert collections" on public.collections
  with check ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);
alter policy "Authenticated users can update collections" on public.collections
  using ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid)
  with check ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);
alter policy "Authenticated users can delete collections" on public.collections
  using ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);

alter policy "Authenticated users can view orders" on public.orders
  using ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);

alter policy "Authenticated users can update order status" on public.orders
  using ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid)
  with check ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);

alter policy "Authenticated users can view order items" on public.order_items
  using ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);

alter policy "Authenticated users can view inventory movements" on public.inventory_movements
  using ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);

-- An RPC executing with caller privileges is safer than exposing a
-- SECURITY DEFINER inventory mutation. RLS below still limits these writes
-- to the existing single-admin identity.
alter function public.adjust_stock(uuid, integer, text, text) security invoker;
alter function public.restock_product(uuid, integer, text) security invoker;

drop policy if exists "Admin can add inventory movements" on public.inventory_movements;
create policy "Admin can add inventory movements"
  on public.inventory_movements for insert to authenticated
  with check ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);

-- Keep stock mutations available only through guarded admin RPCs. The
-- existing table policies already restrict direct size-row writes to this ID.

-- Stop authenticated users from invoking customer-only or legacy checkout
-- RPCs. Guest checkout and guest tracking intentionally remain callable by
-- anon. The old 11-argument implementation is an internal helper used by the
-- validated 12-argument wrapper and must not be directly exposed.
revoke execute on function public.create_order(text, text, text, text, text, text, text, text, text, text, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function public.create_order(text, text, text, text, text, text, text, text, text, text, text, jsonb)
  from authenticated;
revoke execute on function public.get_order_tracking(text, text, text) from authenticated;

-- Shipment tracking supplied by the store admin. Keep status/payment changes
-- and these fields as the only mutable order columns available to the client.
alter table public.orders
  add column if not exists courier_name text,
  add column if not exists tracking_number text,
  add column if not exists tracking_url text;

alter table public.orders
  drop constraint if exists orders_tracking_url_https_check;
alter table public.orders
  add constraint orders_tracking_url_https_check
  check (tracking_url is null or tracking_url ~ '^https://');

create or replace function public.get_order_tracking(
  p_order_reference text,
  p_email text default null::text,
  p_phone text default null::text
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders%rowtype;
  v_items json;
begin
  if p_email is null and p_phone is null then
    return null;
  end if;

  select * into v_order
  from public.orders
  where order_reference = p_order_reference
    and (
      (p_email is not null and email is not null and lower(trim(email)) = lower(trim(p_email)))
      or (p_phone is not null and trim(phone) = trim(p_phone))
    )
  limit 1;

  if not found then return null; end if;

  select json_agg(json_build_object(
    'name', name, 'size', size, 'quantity', quantity, 'price', price,
    'is_preorder', is_preorder, 'preorder_days', preorder_days
  ) order by name)
  into v_items
  from public.order_items
  where order_id = v_order.id;

  return json_build_object(
    'order_reference', v_order.order_reference,
    'status', v_order.status,
    'created_at', v_order.created_at,
    'subtotal', v_order.subtotal,
    'delivery_fee', v_order.delivery_fee,
    'total', v_order.total,
    'courier_name', v_order.courier_name,
    'tracking_number', v_order.tracking_number,
    'tracking_url', v_order.tracking_url,
    'items', coalesce(v_items, '[]'::json)
  );
end;
$function$;

revoke all on function public.get_order_tracking(text, text, text) from public, authenticated;
grant execute on function public.get_order_tracking(text, text, text) to anon, service_role;

revoke update on public.orders from authenticated;
grant update (status, payment_status, courier_name, tracking_number, tracking_url)
  on public.orders to authenticated;

-- The storage policy names differed between the checked-in migrations and
-- the live project. Drop both known broad variants before adding restricted
-- replacements so permissive policies cannot OR around the admin check.
drop policy if exists "Authenticated users can view payment receipts" on storage.objects;
drop policy if exists "Allow authenticated users to view payment receipts" on storage.objects;
drop policy if exists "Authenticated users can delete payment receipts" on storage.objects;
drop policy if exists "Allow authenticated users to delete payment receipts" on storage.objects;
drop policy if exists "Anyone can upload a payment receipt" on storage.objects;
drop policy if exists "Allow receipt uploads" on storage.objects;
create policy "ComicCulture admin can view payment receipts"
  on storage.objects for select to authenticated
  using (bucket_id = 'payment-receipts' and (select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);
create policy "ComicCulture admin can delete payment receipts"
  on storage.objects for delete to authenticated
  using (bucket_id = 'payment-receipts' and (select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);
create policy "Customers can upload payment receipts"
  on storage.objects for insert to anon
  with check (bucket_id = 'payment-receipts');

drop policy if exists "Authenticated users can upload product images" on storage.objects;
drop policy if exists "Authenticated users can update product images" on storage.objects;
drop policy if exists "Authenticated users can delete product images" on storage.objects;
create policy "ComicCulture admin can upload product images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);
create policy "ComicCulture admin can update product images"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid)
  with check (bucket_id = 'product-images' and (select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);
create policy "ComicCulture admin can delete product images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);

-- Bound anonymous receipt uploads at the storage layer, not only in the UI.
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'payment-receipts';

create index if not exists order_items_product_id_idx on public.order_items(product_id);

commit;
