-- Harden order reference generation: move it from the client
-- (`CC-${Date.now().toString().slice(-6)}` in Checkout.tsx, the last 6
-- digits of a millisecond timestamp) to the database, using a sequence.
--
-- Why this closes the bug: Date.now()'s last 6 digits repeat every
-- ~16.7 minutes, so two customers checking out within that window could
-- be assigned the exact same order_reference, tripping the UNIQUE
-- constraint on orders.order_reference for the second one. A Postgres
-- SEQUENCE's nextval() is atomic and safe under concurrency by
-- construction — two simultaneous callers can never receive the same
-- value — so this eliminates the collision class entirely rather than
-- just making it less likely.
--
-- Format: 'CC-' || the sequence value zero-padded to 7 digits, e.g.
-- 'CC-0000001', 'CC-0000042', ... The previous client-generated format
-- was always exactly 'CC-' + 6 digits. Deliberately using 7 digits (not
-- 6) here means the new format can never collide with any existing
-- order_reference already stored, at any sequence value, by
-- construction — as text, 'CC-0000001' and any 6-digit legacy value
-- have different lengths and can never be equal. This makes the choice
-- of starting value a non-issue rather than something to inspect
-- production data for: correctness doesn't depend on it. The sequence
-- still starts at its default (1) since there's nothing to avoid.
--
-- No changes to the `orders` table or its existing UNIQUE constraint on
-- order_reference, and no existing rows are modified — this only changes
-- how future references are generated.

BEGIN;

CREATE SEQUENCE order_reference_seq;

-- Defensive/explicit, matching this project's existing style of never
-- relying on implicit default grants: nextval() is called from inside
-- create_order() below, a SECURITY DEFINER function, so it always runs
-- as the function's owner (who owns the sequence it just created) —
-- anon/authenticated never need, and never get, direct privileges here.
REVOKE ALL ON SEQUENCE order_reference_seq FROM PUBLIC;

-- Signature changes (drops p_order_reference), so the old function must
-- be dropped before recreating it — CREATE OR REPLACE cannot change a
-- function's parameter list.
DROP FUNCTION public.create_order(text, text, text, text, text, text, text, text, text, text, text, jsonb);

-- create_order: identical in every respect to the previous definition
-- (stock locking, server-derived pricing, payment_status derivation,
-- validation, two-pass item processing) except: (1) no longer accepts
-- p_order_reference from the client — it is generated internally from
-- order_reference_seq instead, and (2) the generated reference is
-- returned to the caller alongside the existing result columns, since
-- the client can no longer generate it up front.
CREATE FUNCTION public.create_order(
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
  -- Keep in sync with STORE_CONFIG.deliveryFee in src/config/store.ts.
  v_delivery_fee CONSTANT numeric := 350;
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
  item_preorder_days int;
  -- Authoritative, server-derived values — never taken from the client.
  derived_product_id text;
  derived_size text;
BEGIN
  IF p_payment_method NOT IN ('COD', 'BANK_TRANSFER') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

  -- Server-generated, monotonically increasing, collision-proof order
  -- reference — see migration header comment for the format/uniqueness
  -- reasoning. nextval() is not rolled back even if this transaction
  -- later aborts (standard, expected sequence behavior); that only ever
  -- produces a harmless gap in the sequence, never a duplicate.
  v_order_reference := 'CC-' || to_char(nextval('order_reference_seq'), 'FM0000000');

  -- Derive payment_status server-side — never accepted from the client.
  IF p_payment_method = 'BANK_TRANSFER' THEN
    IF p_receipt_url IS NOT NULL AND length(trim(p_receipt_url)) > 0 THEN
      v_payment_status := 'awaiting_verification';
    ELSE
      v_payment_status := 'awaiting_payment';
    END IF;
  ELSE
    v_payment_status := 'pending';
  END IF;

  -- Pass 1: validate + decrement stock on product_version_sizes, look up the
  -- authoritative price/product_id/size for each item, and accumulate the
  -- real subtotal.
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    vsid := (item->>'version_size_id')::uuid;
    qty := (item->>'quantity')::int;

    IF qty IS NULL OR qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for version_size %', vsid;
    END IF;

    SELECT pvs.stock, pvs.price, p.name, pv.product_id, pvs.size
    INTO current_qty, item_price, item_name, derived_product_id, derived_size
    FROM product_version_sizes pvs
    JOIN product_versions pv ON pv.id = pvs.version_id
    JOIN products p ON p.id = pv.product_id
    WHERE pvs.id = vsid
    FOR UPDATE OF pvs;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product version size % not found', vsid;
    END IF;

    IF current_qty < qty THEN
      RAISE EXCEPTION 'Sorry, only % left in size % — please update your cart', current_qty, derived_size;
    END IF;

    new_qty := current_qty - qty;

    UPDATE product_version_sizes SET stock = new_qty WHERE id = vsid;

    INSERT INTO inventory_movements (product_id, version_size_id, product_name, size, change_type, quantity_change, resulting_stock, reason)
    VALUES (derived_product_id, vsid, item_name, derived_size, 'sale', -qty, new_qty, v_order_reference);

    v_subtotal := v_subtotal + (item_price * qty);
  END LOOP;

  v_total := v_subtotal + v_delivery_fee;

  INSERT INTO orders (
    id, order_reference, full_name, phone, email,
    address_line1, address_line2, city, district, postal_code,
    subtotal, delivery_fee, total,
    payment_method, payment_status, receipt_url
  ) VALUES (
    v_order_id, v_order_reference, p_full_name, p_phone, p_email,
    p_address_line1, p_address_line2, p_city, p_district, p_postal_code,
    v_subtotal, v_delivery_fee, v_total,
    p_payment_method, v_payment_status, p_receipt_url
  );

  -- Pass 2: insert order_items with the authoritative price + a fresh
  -- pre-order snapshot, and the same server-derived product_id/size as
  -- pass 1 (re-derived rather than reused from a variable, in case a
  -- future edit reorders these loops — cheap and keeps the two passes
  -- independently correct).
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    vsid := (item->>'version_size_id')::uuid;
    qty := (item->>'quantity')::int;

    SELECT pvs.price, pv.is_preorder, pv.preorder_days, pv.product_id, pvs.size
    INTO item_price, item_is_preorder, item_preorder_days, derived_product_id, derived_size
    FROM product_version_sizes pvs
    JOIN product_versions pv ON pv.id = pvs.version_id
    WHERE pvs.id = vsid;

    INSERT INTO order_items (
      order_id, product_id, version_size_id, slug, name, image, price, size, quantity, is_preorder, preorder_days
    ) VALUES (
      v_order_id,
      derived_product_id,
      vsid,
      item->>'slug',
      item->>'name',
      item->>'image',
      item_price,
      derived_size,
      qty,
      item_is_preorder,
      item_preorder_days
    );
  END LOOP;

  RETURN QUERY SELECT v_order_id, v_order_reference, v_subtotal, v_delivery_fee, v_total;
END;
$function$;

-- Explicit, deterministic EXECUTE grants for the checkout RPC: unauthenticated
-- storefront customers (anon) and the service role only. Never PUBLIC, never
-- authenticated-by-default — stated explicitly rather than relied upon
-- implicitly via CREATE OR REPLACE preserving whatever grants happened to
-- already be there. (Signature is now 11 params, down from 12 —
-- p_order_reference removed.)
REVOKE ALL ON FUNCTION public.create_order(text, text, text, text, text, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(text, text, text, text, text, text, text, text, text, text, jsonb) TO anon, service_role;

COMMIT;
