BEGIN;

CREATE TABLE public.delivery_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  delivery_fee numeric NOT NULL CHECK (
    delivery_fee BETWEEN 0 AND 99999999.99 AND delivery_fee = round(delivery_fee, 2)
  )
);

-- Preserve the effective customer-facing charge on rollout.
INSERT INTO public.delivery_settings (delivery_fee) VALUES (350);
ALTER TABLE public.delivery_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.delivery_settings TO anon, authenticated;
GRANT UPDATE (delivery_fee) ON public.delivery_settings TO authenticated;

CREATE POLICY "Public delivery fee" ON public.delivery_settings
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Administrators update delivery fee" ON public.delivery_settings
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_store_admin()))
  WITH CHECK ((SELECT public.is_store_admin()));

CREATE TRIGGER admin_audit_delivery_settings AFTER UPDATE ON public.delivery_settings
  FOR EACH ROW WHEN (OLD.delivery_fee IS DISTINCT FROM NEW.delivery_fee)
  EXECUTE FUNCTION public.log_admin_record_change();

-- Replace only the pricing input in the existing internal order transaction.
-- CREATE OR REPLACE preserves its existing restricted EXECUTE grants.
CREATE OR REPLACE FUNCTION public.create_order(
  p_full_name text,
  p_phone text,
  p_email text,
  p_address_line1 text,
  p_address_line2 text,
  p_city text,
  p_district text,
  p_postal_code text,
  p_payment_method text,
  p_receipt_url text,
  p_items jsonb
)
RETURNS TABLE(order_id uuid, order_reference text, subtotal numeric, delivery_fee numeric, total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_delivery_fee numeric;
  v_order_id uuid := gen_random_uuid();
  v_order_reference text;
  v_subtotal numeric := 0;
  v_total numeric;
  v_payment_status text;
  item jsonb;
  vsid uuid;
  qty int;
  current_qty int;
  new_qty int;
  item_price numeric;
  item_name text;
  item_is_preorder boolean;
  item_is_active boolean;
  item_preorder_days int;
  item_sku text;
  item_slug text;
  item_image text;
  derived_product_id text;
  derived_size text;
BEGIN
  IF p_payment_method NOT IN ('COD', 'BANK_TRANSFER') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

  SELECT settings.delivery_fee INTO STRICT v_delivery_fee
    FROM public.delivery_settings AS settings WHERE settings.id = 1;

  v_order_reference := 'CC-' || to_char(nextval('order_reference_seq'), 'FM0000000');

  IF p_payment_method = 'BANK_TRANSFER' THEN
    IF p_receipt_url IS NOT NULL AND length(trim(p_receipt_url)) > 0 THEN
      v_payment_status := 'awaiting_verification';
    ELSE
      v_payment_status := 'awaiting_payment';
    END IF;
  ELSE
    v_payment_status := 'pending';
  END IF;

  -- Lock both the inventory row and its version so an admin cannot deactivate
  -- an edition midway through checkout. Any failure rolls back all stock moves.
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) AS entries(value)
  LOOP
    vsid := (item->>'version_size_id')::uuid;
    qty := (item->>'quantity')::int;

    IF qty IS NULL OR qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for version size %', vsid;
    END IF;

    SELECT pvs.stock, pvs.price, p.name, pv.product_id, pvs.size, pv.is_active
    INTO current_qty, item_price, item_name, derived_product_id, derived_size, item_is_active
    FROM public.product_version_sizes AS pvs
    JOIN public.product_versions AS pv ON pv.id = pvs.version_id
    JOIN public.products AS p ON p.id = pv.product_id
    WHERE pvs.id = vsid
    FOR UPDATE OF pvs, pv;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product version size % not found', vsid;
    END IF;
    IF item_is_active IS NULL THEN
      RAISE EXCEPTION 'Product edition is unavailable';
    END IF;
    IF NOT item_is_active THEN
      RAISE EXCEPTION 'This product edition is no longer available';
    END IF;
    IF current_qty < qty THEN
      RAISE EXCEPTION 'Sorry, only % left in size % — please update your cart', current_qty, derived_size;
    END IF;

    new_qty := current_qty - qty;
    UPDATE public.product_version_sizes SET stock = new_qty WHERE id = vsid;
    INSERT INTO public.inventory_movements (
      product_id, version_size_id, product_name, size, change_type,
      quantity_change, resulting_stock, reason
    ) VALUES (
      derived_product_id, vsid, item_name, derived_size, 'sale', -qty,
      new_qty, v_order_reference
    );
    v_subtotal := v_subtotal + (item_price * qty);
  END LOOP;

  v_total := v_subtotal + v_delivery_fee;
  INSERT INTO public.orders (
    id, order_reference, full_name, phone, email, address_line1,
    address_line2, city, district, postal_code, subtotal, delivery_fee,
    total, payment_method, payment_status, receipt_url
  ) VALUES (
    v_order_id, v_order_reference, p_full_name, p_phone, p_email,
    p_address_line1, p_address_line2, p_city, p_district, p_postal_code,
    v_subtotal, v_delivery_fee, v_total, p_payment_method,
    v_payment_status, p_receipt_url
  );

  FOR item IN SELECT value FROM jsonb_array_elements(p_items) AS entries(value)
  LOOP
    vsid := (item->>'version_size_id')::uuid;
    qty := (item->>'quantity')::int;
    SELECT pvs.price, pv.is_preorder, pv.preorder_days, pv.product_id,
           pvs.size, pvs.sku, p.slug, p.name,
           coalesce(nullif(pv.images[1], ''), nullif(p.images[1], ''), nullif(p.image, ''), '')
    INTO item_price, item_is_preorder, item_preorder_days, derived_product_id,
         derived_size, item_sku, item_slug, item_name, item_image
    FROM public.product_version_sizes AS pvs
    JOIN public.product_versions AS pv ON pv.id = pvs.version_id
    JOIN public.products AS p ON p.id = pv.product_id
    WHERE pvs.id = vsid;

    INSERT INTO public.order_items (
      order_id, product_id, version_size_id, slug, name, image, sku,
      price, size, quantity, is_preorder, preorder_days
    ) VALUES (
      v_order_id, derived_product_id, vsid, item_slug, item_name,
      item_image, item_sku, item_price, derived_size, qty,
      item_is_preorder, item_preorder_days
    );
  END LOOP;

  RETURN QUERY SELECT v_order_id, v_order_reference, v_subtotal, v_delivery_fee, v_total;
END;
$function$;

-- Qualify the stored total so the existing promo path can price and confirm an order.
create or replace function public.create_order(
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
    update public.orders as placed
    set promo_code = promo.code,
        discount_amount = calculated_discount,
        total = placed.total - calculated_discount
    where placed.id = created_order.order_id;
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

CREATE OR REPLACE FUNCTION public.submit_checkout(p_request_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prior public.checkout_requests%rowtype; response jsonb; entry jsonb; receipt_path text;
  request_hash text; quoted_fee numeric; quoted_total numeric; current_fee numeric;
BEGIN
  IF p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid checkout'; END IF;
  -- Confirmation values do not identify an order. Preserve existing request hashes
  -- and recover an already committed order even if a retry fetched a newer quote.
  request_hash := encode(sha256(convert_to((p_payload - 'expectedDeliveryFee' - 'expectedTotal')::text,'UTF8')),'hex');
  INSERT INTO public.checkout_requests(id,payload_hash) VALUES(p_request_id,request_hash) ON CONFLICT DO NOTHING;
  SELECT * INTO prior FROM public.checkout_requests WHERE id=p_request_id FOR UPDATE;
  IF prior.payload_hash <> request_hash THEN RAISE EXCEPTION 'Checkout request already used'; END IF;
  IF prior.result IS NOT NULL THEN RETURN prior.result; END IF;
  IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Invalid cart'; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    IF jsonb_typeof(entry->'quantity') IS DISTINCT FROM 'number' OR (entry->>'quantity') !~ '^[1-9][0-9]{0,2}$' THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
  END LOOP;
  IF length(coalesce(p_payload->>'mobilePhone','')) > 0 AND (p_payload->>'mobilePhone') !~ '^[0-9+[:space:]-]{9,15}$' THEN RAISE EXCEPTION 'Invalid mobile number'; END IF;
  IF length(coalesce(p_payload->>'promoCode','')) > 80 THEN RAISE EXCEPTION 'Invalid promotion'; END IF;
  IF p_payload ? 'expectedDeliveryFee' OR p_payload ? 'expectedTotal' THEN
    IF jsonb_typeof(p_payload->'expectedDeliveryFee') IS DISTINCT FROM 'number'
       OR jsonb_typeof(p_payload->'expectedTotal') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Invalid checkout quote';
    END IF;
    quoted_fee := (p_payload->>'expectedDeliveryFee')::numeric;
    quoted_total := (p_payload->>'expectedTotal')::numeric;
  ELSE
    -- Old storefront bundles displayed this amount. They can continue placing
    -- orders during rollout only while that published fee is still current.
    quoted_fee := 350;
  END IF;

  -- Hold the current fee through pricing and commit. Other checkouts can share
  -- this lock, while an admin update waits until the order transaction ends.
  SELECT settings.delivery_fee INTO STRICT current_fee
    FROM public.delivery_settings AS settings WHERE settings.id = 1 FOR SHARE;
  IF quoted_fee IS DISTINCT FROM current_fee THEN
    RAISE EXCEPTION USING ERRCODE = 'CC001', MESSAGE = 'Delivery fee changed';
  END IF;

  receipt_path := nullif(p_payload->>'receiptPath','');
  IF p_payload->>'paymentMethod' = 'BANK_TRANSFER' THEN
    PERFORM 1 FROM public.checkout_receipts WHERE path=receipt_path AND request_id=p_request_id AND order_id IS NULL
      AND created_at > now() - interval '24 hours' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payment receipt is missing or expired'; END IF;
  ELSE receipt_path := NULL;
  END IF;
  SELECT to_jsonb(created) INTO response FROM public.create_order_with_notification_token(
    trim(p_payload->>'fullName'), trim(p_payload->>'phone'), nullif(trim(p_payload->>'mobilePhone'),''), p_payload->>'email',
    trim(p_payload->>'addressLine1'), nullif(trim(p_payload->>'addressLine2'),''), trim(p_payload->>'city'), trim(p_payload->>'district'),
    nullif(trim(p_payload->>'postalCode'),''), p_payload->>'paymentMethod', receipt_path, p_payload->'items', p_payload->>'promoCode'
  ) AS created;
  -- Ignore binary floating-point noise from the storefront calculation.
  -- A material mismatch rolls back the order, promo usage, stock, and request.
  IF quoted_total IS NOT NULL AND abs(quoted_total - (response->>'total')::numeric) > 0.0000001 THEN
    RAISE EXCEPTION USING ERRCODE = 'CC002', MESSAGE = 'Order total changed';
  END IF;
  UPDATE public.checkout_requests SET result=response WHERE id=p_request_id;
  IF receipt_path IS NOT NULL THEN UPDATE public.checkout_receipts SET order_id=(response->>'order_id')::uuid WHERE path=receipt_path; END IF;
  RETURN response;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_checkout(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_checkout(uuid,jsonb) TO service_role;

COMMIT;
