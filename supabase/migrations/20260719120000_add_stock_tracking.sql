-- Stock tracking for ComicCulture products
-- Run this in the Supabase SQL editor (or via CLI migration).

-- 1. Add per-size stock column (jsonb map, e.g. {"S": 20, "M": 15, ...})
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Backfill existing rows: 20 units per size currently listed on the product
UPDATE products
SET stock = (SELECT jsonb_object_agg(s, 20) FROM unnest(sizes) AS s)
WHERE stock = '{}'::jsonb;

-- 3. Atomic stock validation + decrement, called from the client at checkout
--    time via supabase.rpc(). SECURITY DEFINER lets the anon role run this
--    even though anon has no direct UPDATE policy on products — the function
--    is the only path anon has to modify stock, and only in valid decrements.
CREATE OR REPLACE FUNCTION decrement_stock_for_order(items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  item jsonb;
  current_qty int;
  pid text;
  sz text;
  qty int;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(items)
  LOOP
    pid := item->>'product_id';
    sz := item->>'size';
    qty := (item->>'quantity')::int;

    SELECT (stock->>sz)::int INTO current_qty
    FROM products
    WHERE id = pid
    FOR UPDATE;

    IF current_qty IS NULL THEN
      RAISE EXCEPTION 'No stock info for % (size %)', pid, sz;
    END IF;

    IF current_qty < qty THEN
      RAISE EXCEPTION 'Sorry, only % left in size % — please update your cart', current_qty, sz;
    END IF;

    UPDATE products
    SET stock = jsonb_set(stock, ARRAY[sz], to_jsonb(current_qty - qty))
    WHERE id = pid;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION decrement_stock_for_order(jsonb) TO anon;
