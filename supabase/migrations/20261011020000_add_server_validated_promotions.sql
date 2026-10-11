begin;

create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(trim(code)) and code ~ '^[A-Z0-9_-]{3,32}$'),
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(10,2) not null check (discount_value > 0),
  minimum_subtotal numeric(10,2) not null default 0 check (minimum_subtotal >= 0),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  usage_count integer not null default 0 check (usage_count >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (discount_type <> 'percent' or discount_value <= 100),
  check (expires_at is null or starts_at is null or expires_at > starts_at)
);

create table public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references public.promo_codes(id),
  order_id uuid not null unique references public.orders(id),
  discount_amount numeric(10,2) not null check (discount_amount > 0),
  created_at timestamptz not null default now()
);

alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;

create policy "ComicCulture admin manages promo codes"
  on public.promo_codes for all to authenticated
  using ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid)
  with check ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);
create policy "ComicCulture admin reads promo redemptions"
  on public.promo_redemptions for select to authenticated
  using ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);

alter table public.orders
  add column promo_code text,
  add column discount_amount numeric(10,2) not null default 0 check (discount_amount >= 0);

create or replace function public.preview_promo_code(p_code text, p_subtotal numeric)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  promo public.promo_codes%rowtype;
begin
  if p_subtotal is null or p_subtotal <= 0 or p_subtotal > 100000000 then return null; end if;
  select * into promo from public.promo_codes
  where code = upper(trim(coalesce(p_code, '')))
  limit 1;
  if not found or not promo.is_active
     or (promo.starts_at is not null and promo.starts_at > now())
     or (promo.expires_at is not null and promo.expires_at <= now())
     or (promo.max_redemptions is not null and promo.usage_count >= promo.max_redemptions)
     or p_subtotal < promo.minimum_subtotal then
    return null;
  end if;
  if promo.discount_type = 'percent' then
    return least(p_subtotal, floor(p_subtotal * promo.discount_value / 100));
  end if;
  return least(p_subtotal, promo.discount_value);
end;
$function$;

revoke all on function public.preview_promo_code(text, numeric) from public, authenticated;
grant execute on function public.preview_promo_code(text, numeric) to anon, service_role;

-- This overload is the only one that accepts a promotion code. It delegates
-- the normal stock, pricing, payment, and email validation to the existing
-- checkout RPC, then atomically reserves redemption capacity and applies the
-- discount. Any validation error rolls the entire transaction back.
create function public.create_order(
  p_full_name text,
  p_phone text,
  p_mobile_phone text,
  p_email text,
  p_address_line1 text,
  p_address_line2 text,
  p_city text,
  p_district text,
  p_postal_code text,
  p_payment_method text,
  p_receipt_url text,
  p_items jsonb,
  p_promo_code text
)
returns table(order_id uuid, order_reference text, subtotal numeric, delivery_fee numeric, total numeric, discount_amount numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  created_order record;
  promo public.promo_codes%rowtype;
  normalized_code text := nullif(upper(trim(coalesce(p_promo_code, ''))), '');
  calculated_discount numeric(10,2) := 0;
begin
  if normalized_code is not null then
    select * into promo from public.promo_codes where code = normalized_code for update;
    if not found or not promo.is_active
       or (promo.starts_at is not null and promo.starts_at > now())
       or (promo.expires_at is not null and promo.expires_at <= now())
       or (promo.max_redemptions is not null and promo.usage_count >= promo.max_redemptions) then
      raise exception 'Promo code is invalid or unavailable';
    end if;
  end if;

  select * into created_order
  from public.create_order(
    p_full_name, p_phone, p_mobile_phone, p_email, p_address_line1,
    p_address_line2, p_city, p_district, p_postal_code,
    p_payment_method, p_receipt_url, p_items
  );

  if normalized_code is not null then
    if created_order.subtotal < promo.minimum_subtotal then
      raise exception 'Order does not meet the promo minimum';
    end if;
    if promo.discount_type = 'percent' then
      calculated_discount := least(created_order.subtotal, floor(created_order.subtotal * promo.discount_value / 100));
    else
      calculated_discount := least(created_order.subtotal, promo.discount_value);
    end if;
    update public.orders
    set promo_code = promo.code,
        discount_amount = calculated_discount,
        total = total - calculated_discount
    where id = created_order.order_id;
    insert into public.promo_redemptions(promo_code_id, order_id, discount_amount)
    values (promo.id, created_order.order_id, calculated_discount);
    update public.promo_codes set usage_count = usage_count + 1 where id = promo.id;
  end if;

  return query select
    created_order.order_id,
    created_order.order_reference,
    created_order.subtotal,
    created_order.delivery_fee,
    created_order.total - calculated_discount,
    calculated_discount;
end;
$function$;

revoke all on function public.create_order(text, text, text, text, text, text, text, text, text, text, text, jsonb, text) from public, authenticated;
grant execute on function public.create_order(text, text, text, text, text, text, text, text, text, text, text, jsonb, text) to anon, service_role;

commit;
