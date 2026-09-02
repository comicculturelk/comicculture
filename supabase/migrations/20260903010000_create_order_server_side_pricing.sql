-- Fix: checkout previously trusted client-supplied subtotal, delivery_fee,
-- total, and per-item price — a customer could call supabase.from('orders')
-- .insert(...) (or order_items) directly with fabricated numbers and have
-- them stored as the real order amount, since the anon insert policies on
-- orders/order_items (see 20260719110000_create_orders.sql) only check
-- `with check (true)`.
--
-- Fix: replace decrement_stock_for_order (which only validated/decremented
-- stock) with create_order, a single SECURITY DEFINER RPC that performs the
-- entire order write inside the database:
--   - validates + decrements stock (same logic/logging as before)
--   - computes subtotal itself from products.price (never a client value)
--   - uses a fixed server-side delivery fee (keep in sync with
--     STORE_CONFIG.deliveryFee in src/config/store.ts — currently 350)
--   - computes total = subtotal + delivery_fee
--   - inserts the orders row and all order_items rows itself, using only
--     the prices/subtotal/delivery_fee/total it just computed
--   - snapshots each item's pre-order status from products (same rule as
--     the old derivePreorderSnapshot() helper: preorder_days is null
--     unless is_preorder is true)
--
-- The client can still supply customer/shipping details, payment method,
-- and which product/size/quantity to order — none of that is financial
-- data. It can no longer influence price, subtotal, delivery fee, or total
-- at all: those fields aren't even accepted as parameters.
--
-- Run this in the Supabase SQL editor (or via CLI migration).

DROP FUNCTION IF EXISTS decrement_stock_for_order(jsonb, text);

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
  p_payment_status text,
  p_receipt_url text,
  p_items jsonb -- [{product_id, slug, name, image, size, quantity}, ...]
)
RETURNS TABLE(order_id uuid, subtotal numeric, delivery_fee numeric, total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  -- Keep in sync with STORE_CONFIG.deliveryFee in src/config/store.ts.
  v_delivery_fee CONSTANT numeric := 350;
  v_order_id uuid := gen_random_uuid();
  v_subtotal numeric := 0;
  v_total numeric;
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

  -- Pass 1: validate + decrement stock, look up the authoritative price for
  -- each item, and accumulate the real subtotal. Locks each product row
  -- (FOR UPDATE) exactly as decrement_stock_for_order did.
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
    p_payment_method, p_payment_status, p_receipt_url
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

-- Anon needs EXECUTE to place orders from the storefront, same as the
-- decrement_stock_for_order function it replaces. This grant does not let
-- anon read/write orders/order_items/products directly — the function body
-- is the only path, and it never accepts client-supplied price data.
GRANT EXECUTE ON FUNCTION create_order(text, text, text, text, text, text, text, text, text, text, text, text, jsonb) TO anon;
