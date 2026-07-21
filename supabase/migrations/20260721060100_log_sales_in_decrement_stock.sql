-- Make checkout stock decrements write to inventory_movements
-- Run this in the Supabase SQL editor (or via CLI migration).

-- Signature changes (adds order_reference), so drop the old version first
-- rather than CREATE OR REPLACE, which would otherwise leave both versions
-- overloaded side by side.
DROP FUNCTION IF EXISTS decrement_stock_for_order(jsonb);

CREATE OR REPLACE FUNCTION decrement_stock_for_order(items jsonb, order_reference text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  item jsonb;
  current_qty int;
  new_qty int;
  pid text;
  sz text;
  qty int;
  pname text;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(items)
  LOOP
    pid := item->>'product_id';
    sz := item->>'size';
    qty := (item->>'quantity')::int;

    SELECT (stock->>sz)::int, name INTO current_qty, pname
    FROM products
    WHERE id = pid
    FOR UPDATE;

    IF pname IS NULL THEN
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
    VALUES (pid, pname, sz, 'sale', -qty, new_qty, order_reference);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION decrement_stock_for_order(jsonb, text) TO anon;
