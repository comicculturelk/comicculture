begin;

-- Only the checkout caller receives this one-time token. The token and lock
-- state live in a table with RLS enabled and no client-facing policies.
create table public.order_notification_state (
  order_id uuid primary key references public.orders(id) on delete cascade,
  notification_token uuid not null default gen_random_uuid(),
  lock_id uuid,
  locked_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.order_notification_state enable row level security;
revoke all on public.order_notification_state from anon, authenticated;

-- Do not expose the underlying create_order overloads directly. This wrapper
-- is the sole guest checkout entry point and returns a bearer token only to
-- the caller that created the order.
create function public.create_order_with_notification_token(
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
returns table(order_id uuid, order_reference text, subtotal numeric, delivery_fee numeric, total numeric, discount_amount numeric, notification_token uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  created_order record;
  token uuid;
begin
  select * into created_order from public.create_order(
    p_full_name, p_phone, p_mobile_phone, p_email, p_address_line1,
    p_address_line2, p_city, p_district, p_postal_code,
    p_payment_method, p_receipt_url, p_items, p_promo_code
  );
  insert into public.order_notification_state as notification_state(order_id)
  values (created_order.order_id)
  returning notification_state.notification_token into token;
  return query select created_order.order_id, created_order.order_reference,
    created_order.subtotal, created_order.delivery_fee, created_order.total,
    created_order.discount_amount, token;
end;
$function$;

revoke all on function public.create_order(text, text, text, text, text, text, text, text, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.create_order(text, text, text, text, text, text, text, text, text, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.create_order(text, text, text, text, text, text, text, text, text, text, text, jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.create_order_with_notification_token(text, text, text, text, text, text, text, text, text, text, text, jsonb, text) from public, authenticated;
grant execute on function public.create_order_with_notification_token(text, text, text, text, text, text, text, text, text, text, text, jsonb, text) to anon, service_role;

create function public.claim_order_notification(p_order_id uuid, p_notification_token uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  claimed_lock uuid;
begin
  update public.order_notification_state state
  set lock_id = gen_random_uuid(), locked_at = now()
  where state.order_id = p_order_id
    and state.notification_token = p_notification_token
    and state.sent_at is null
    and (state.locked_at is null or state.locked_at < now() - interval '2 minutes')
  returning state.lock_id into claimed_lock;
  return claimed_lock;
end;
$function$;

create function public.complete_order_notification(p_order_id uuid, p_lock_id uuid, p_success boolean)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.order_notification_state
  set sent_at = case when p_success then now() else sent_at end,
      lock_id = null,
      locked_at = null
  where order_id = p_order_id and lock_id = p_lock_id;
$function$;

revoke all on function public.claim_order_notification(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_order_notification(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_order_notification(uuid, uuid) to service_role;
grant execute on function public.complete_order_notification(uuid, uuid, boolean) to service_role;

commit;
