-- Guest order tracking lookup.
-- Orders/order_items have no SELECT policy for anon (write-only from the
-- storefront, by design — see 20260719110000_create_orders.sql). Rather than
-- opening a broad SELECT policy, this adds a single narrow SECURITY DEFINER
-- function that returns an order only when BOTH the order_reference AND a
-- matching email or phone are supplied. Anon never gets table-level read
-- access; this RPC is the only lookup path, same pattern as
-- decrement_stock_for_order.
-- Run this in the Supabase SQL editor (or via CLI migration).

CREATE OR REPLACE FUNCTION get_order_tracking(
  p_order_reference text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_items json;
BEGIN
  -- Require at least one contact detail — never allow a reference-only lookup.
  IF p_email IS NULL AND p_phone IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_order
  FROM orders
  WHERE order_reference = p_order_reference
    AND (
      (p_email IS NOT NULL AND email IS NOT NULL AND lower(trim(email)) = lower(trim(p_email)))
      OR
      (p_phone IS NOT NULL AND trim(phone) = trim(p_phone))
    )
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT json_agg(
    json_build_object(
      'name', name,
      'size', size,
      'quantity', quantity,
      'price', price
    )
    ORDER BY name
  )
  INTO v_items
  FROM order_items
  WHERE order_id = v_order.id;

  RETURN json_build_object(
    'order_reference', v_order.order_reference,
    'status', v_order.status,
    'created_at', v_order.created_at,
    'subtotal', v_order.subtotal,
    'delivery_fee', v_order.delivery_fee,
    'total', v_order.total,
    'items', COALESCE(v_items, '[]'::json)
  );
END;
$$;

-- Anon needs EXECUTE to call this from the storefront tracking page.
-- The function itself enforces the match — this grant does not expose
-- the orders/order_items tables directly.
GRANT EXECUTE ON FUNCTION get_order_tracking(text, text, text) TO anon;
