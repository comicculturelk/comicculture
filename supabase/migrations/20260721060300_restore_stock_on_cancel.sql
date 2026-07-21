-- Auto-restore reserved stock when an order's status is set to 'cancelled'.
-- Without this, cancelling an order would leave inventory permanently
-- short by whatever was reserved at checkout.
-- Run this in the Supabase SQL editor (or via CLI migration).

CREATE OR REPLACE FUNCTION restore_stock_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  item record;
  current_qty int;
  new_qty int;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    FOR item IN
      SELECT product_id, name, size, quantity FROM order_items WHERE order_id = NEW.id
    LOOP
      SELECT (stock->>item.size)::int INTO current_qty
      FROM products
      WHERE id = item.product_id
      FOR UPDATE;

      -- If the product was removed from the catalog since the order was
      -- placed, there's nothing to restore stock on — skip it.
      IF current_qty IS NULL AND NOT EXISTS (SELECT 1 FROM products WHERE id = item.product_id) THEN
        CONTINUE;
      END IF;

      current_qty := COALESCE(current_qty, 0);
      new_qty := current_qty + item.quantity;

      UPDATE products
      SET stock = jsonb_set(stock, ARRAY[item.size], to_jsonb(new_qty))
      WHERE id = item.product_id;

      INSERT INTO inventory_movements (product_id, product_name, size, change_type, quantity_change, resulting_stock, reason)
      VALUES (item.product_id, item.name, item.size, 'cancellation', item.quantity, new_qty, NEW.order_reference);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restore_stock_on_cancel ON orders;

CREATE TRIGGER trg_restore_stock_on_cancel
AFTER UPDATE OF status ON orders
FOR EACH ROW
EXECUTE FUNCTION restore_stock_on_cancel();
