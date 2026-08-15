-- Extends get_order_tracking (see 20260722080000_create_order_tracking_rpc.sql)
-- to include each item's pre-order snapshot (is_preorder, preorder_days),
-- so the public Track Order page can show pre-order info without ever
-- reading the current products table. Same function signature, same
-- SECURITY DEFINER / anon EXECUTE grant — only the returned item JSON
-- shape changes.

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
      'price', price,
      'is_preorder', is_preorder,
      'preorder_days', preorder_days
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

-- Grant unchanged (function signature is the same) — repeated here only
-- for clarity/idempotency, not because it needs to change.
GRANT EXECUTE ON FUNCTION get_order_tracking(text, text, text) TO anon;
