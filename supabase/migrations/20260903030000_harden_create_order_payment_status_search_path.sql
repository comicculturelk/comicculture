-- Hardens create_order() (see 20260903010000_create_order_server_side_pricing.sql)
-- against two remaining gaps. Behavior otherwise unchanged: server-side
-- product pricing, Rs. 350 delivery fee, stock validation/decrement,
-- inventory_movements logging, order/order_items creation, and the
-- pre-order snapshot all stay exactly as before.
--
-- Fix 1: p_payment_status was accepted directly as a client parameter and
-- inserted as-is. orders.ts happened to compute it correctly before
-- calling the RPC, but nothing stopped a direct RPC call from passing
-- p_payment_status => 'paid' and creating an order that looks pre-paid.
-- Fix: drop the parameter entirely and derive payment_status inside the
-- function from p_payment_method + whether a receipt was provided —
-- mirroring the paymentStatusFor() logic that used to live in orders.ts:
--   COD                        -> 'pending'
--   BANK_TRANSFER + receipt    -> 'awaiting_verification'
--   BANK_TRANSFER, no receipt  -> 'awaiting_payment'
-- The client can no longer request an arbitrary status.
--
-- Fix 2: SECURITY DEFINER functions run with the owner's privileges, so
-- an unqualified/mutable search_path lets a caller shadow objects (e.g. a
-- same-named function or table in a schema earlier in their search_path)
-- and hijack what the function actually executes. Fix: pin
-- `SET search_path = public` on the function.
--
-- Because a parameter is being removed, the function signature changes,
-- so the old overload must be dropped (CREATE OR REPLACE cannot alter a
-- function's parameter list).
--
-- Run this in the Supabase SQL editor (or via CLI migration).

DROP FUNCTION IF EXISTS create_order(text, text, text, text, text, text, text, text, text, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION create_order(
  p_order_reference text,
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
  p_items jsonb -- [{product_id, slug, name, image, size, quantity}, ...]
)
RETURNS TABLE(order_id uuid, subtotal numeric, delivery_fee numeric, total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Keep in sync with STORE_CONFIG.deliveryFee in src/config/store.ts.
  v_delivery_fee CONSTANT numeric := 350;
  v_order_id uuid := gen_random_uuid();
  v_subtotal numeric := 0;
  v_total numeric;
  v_payment_status text;
  item jsonb;
  pid text;
  sz text;
  qty int;
  current_qty int;
  new_qty int;
  item_price numeric;
  item_name text;
  item_is_preorder boolean;
  item_preorder_days int;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

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

  -- Pass 1: validate + decrement stock, look up the authoritative price for
  -- each item, and accumulate the real subtotal. Locks each product row
  -- (FOR UPDATE) exactly as before.
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    pid := item->>'product_id';
    sz := item->>'size';
    qty := (item->>'quantity')::int;

    IF qty IS NULL OR qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for %', pid;
    END IF;

    SELECT (stock->>sz)::int, price, name
    INTO current_qty, item_price, item_name
    FROM products
    WHERE id = pid
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found', pid;
    END IF;

    IF current_qty IS NULL THEN
      RAISE EXCEPTION 'No stock info for % (size %)', pid, sz;
    END IF;

    IF current_qty < qty THEN
      RAISE EXCEPTION 'Sorry, only % left in size % — please update your cart', current_qty, sz;
    END IF;

    new_qty := current_qty - qty;

    UPDATE products
    SET stock = jsonb_set(stock, ARRAY[sz], to_jsonb(new_qty))
    WHERE id = pid;

    INSERT INTO inventory_movements (product_id, product_name, size, change_type, quantity_change, resulting_stock, reason)
    VALUES (pid, item_name, sz, 'sale', -qty, new_qty, p_order_reference);

    v_subtotal := v_subtotal + (item_price * qty);
  END LOOP;

  v_total := v_subtotal + v_delivery_fee;

  INSERT INTO orders (
    id, order_reference, full_name, phone, email,
    address_line1, address_line2, city, district, postal_code,
    subtotal, delivery_fee, total,
    payment_method, payment_status, receipt_url
  ) VALUES (
    v_order_id, p_order_reference, p_full_name, p_phone, p_email,
    p_address_line1, p_address_line2, p_city, p_district, p_postal_code,
    v_subtotal, v_delivery_fee, v_total,
    p_payment_method, v_payment_status, p_receipt_url
  );

  -- Pass 2: insert order_items with the authoritative price + a fresh
  -- pre-order snapshot (products.preorder_days is already guaranteed null
  -- whenever is_preorder is false, via the products table's own CHECK
  -- constraint, so no extra normalization is needed here).
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    pid := item->>'product_id';
    sz := item->>'size';
    qty := (item->>'quantity')::int;

    SELECT price, is_preorder, preorder_days
    INTO item_price, item_is_preorder, item_preorder_days
    FROM products
    WHERE id = pid;

    INSERT INTO order_items (
      order_id, product_id, slug, name, image, price, size, quantity, is_preorder, preorder_days
    ) VALUES (
      v_order_id,
      pid,
      item->>'slug',
      item->>'name',
      item->>'image',
      item_price,
      sz,
      qty,
      item_is_preorder,
      item_preorder_days
    );
  END LOOP;

  RETURN QUERY SELECT v_order_id, v_subtotal, v_delivery_fee, v_total;
END;
$$;

-- Anon needs EXECUTE to place orders from the storefront. This grant does
-- not let anon read/write orders/order_items/products directly — the
-- function body is the only path, and it never accepts client-supplied
-- price or payment-status data.
GRANT EXECUTE ON FUNCTION create_order(text, text, text, text, text, text, text, text, text, text, text, jsonb) TO anon;
