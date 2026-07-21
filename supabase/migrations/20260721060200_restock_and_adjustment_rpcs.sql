-- Admin-only inventory write paths: restock and manual adjustment.
-- Both are SECURITY DEFINER (like decrement_stock_for_order) so they can
-- update products.stock despite anon/authenticated having no direct write
-- policy for arbitrary values, and both are EXECUTE-granted to
-- `authenticated` only — never `anon` — since these are admin actions.
-- Run this in the Supabase SQL editor (or via CLI migration).

CREATE OR REPLACE FUNCTION restock_product(
  p_product_id text,
  p_size text,
  p_quantity int,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_qty int;
  new_qty int;
  pname text;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Restock quantity must be positive';
  END IF;

  SELECT (stock->>p_size)::int, name INTO current_qty, pname
  FROM products
  WHERE id = p_product_id
  FOR UPDATE;

  IF pname IS NULL THEN
    RAISE EXCEPTION 'Product % not found', p_product_id;
  END IF;

  current_qty := COALESCE(current_qty, 0);
  new_qty := current_qty + p_quantity;

  UPDATE products
  SET stock = jsonb_set(stock, ARRAY[p_size], to_jsonb(new_qty))
  WHERE id = p_product_id;

  INSERT INTO inventory_movements (product_id, product_name, size, change_type, quantity_change, resulting_stock, note)
  VALUES (p_product_id, pname, p_size, 'restock', p_quantity, new_qty, p_note);
END;
$$;

GRANT EXECUTE ON FUNCTION restock_product(text, text, int, text) TO authenticated;


CREATE OR REPLACE FUNCTION adjust_stock(
  p_product_id text,
  p_size text,
  p_quantity_change int,
  p_reason text,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_qty int;
  new_qty int;
  pname text;
BEGIN
  IF p_quantity_change = 0 THEN
    RAISE EXCEPTION 'Adjustment quantity cannot be zero';
  END IF;

  IF p_reason NOT IN ('damaged', 'missing', 'giveaway', 'correction', 'other') THEN
    RAISE EXCEPTION 'Invalid adjustment reason: %', p_reason;
  END IF;

  SELECT (stock->>p_size)::int, name INTO current_qty, pname
  FROM products
  WHERE id = p_product_id
  FOR UPDATE;

  IF pname IS NULL THEN
    RAISE EXCEPTION 'Product % not found', p_product_id;
  END IF;

  current_qty := COALESCE(current_qty, 0);
  -- Clamp at 0: an adjustment can reduce stock but never below zero.
  new_qty := GREATEST(0, current_qty + p_quantity_change);

  UPDATE products
  SET stock = jsonb_set(stock, ARRAY[p_size], to_jsonb(new_qty))
  WHERE id = p_product_id;

  INSERT INTO inventory_movements (product_id, product_name, size, change_type, quantity_change, resulting_stock, reason, note)
  VALUES (p_product_id, pname, p_size, 'adjustment', new_qty - current_qty, new_qty, p_reason, p_note);
END;
$$;

GRANT EXECUTE ON FUNCTION adjust_stock(text, text, int, text, text) TO authenticated;
