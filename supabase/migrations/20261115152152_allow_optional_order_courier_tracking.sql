BEGIN;

-- Keep courier details optional when transitioning a packed order to shipped.
CREATE OR REPLACE FUNCTION public.admin_transition_order(
  p_order_id uuid, p_next_status text, p_note text DEFAULT NULL,
  p_refund_confirmed boolean DEFAULT false, p_refund_reference text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE o public.orders%rowtype; next_payment text;
BEGIN
  IF NOT public.is_store_admin() THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF p_next_status NOT IN ('pending','confirmed','packed','shipped','delivered','cancelled') THEN RAISE EXCEPTION 'Invalid order status'; END IF;
  IF p_next_status = o.status THEN RETURN; END IF;
  IF NOT ((o.status = 'pending' AND p_next_status IN ('confirmed','cancelled'))
       OR (o.status = 'confirmed' AND p_next_status IN ('packed','cancelled'))
       OR (o.status = 'packed' AND p_next_status IN ('shipped','cancelled'))
       OR (o.status = 'shipped' AND p_next_status = 'delivered')) THEN
    RAISE EXCEPTION 'Order cannot move from % to %', o.status, p_next_status;
  END IF;
  IF p_next_status = 'confirmed' AND o.payment_method = 'BANK_TRANSFER' AND o.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'Verify bank transfer payment before confirming this order';
  END IF;
  IF p_next_status = 'cancelled' AND NULLIF(trim(p_note), '') IS NULL THEN
    RAISE EXCEPTION 'Add a cancellation reason';
  END IF;
  next_payment := o.payment_status;
  IF p_next_status = 'cancelled' AND o.payment_status = 'paid' THEN
    IF NOT p_refund_confirmed OR NULLIF(trim(p_refund_reference), '') IS NULL THEN
      RAISE EXCEPTION 'Record the completed refund and its reference before cancelling a paid order';
    END IF;
    next_payment := 'refunded';
  ELSIF p_next_status = 'delivered' AND o.payment_method = 'COD' THEN
    next_payment := 'paid';
  END IF;
  UPDATE public.orders SET status = p_next_status, payment_status = next_payment,
    refund_reference = CASE WHEN next_payment = 'refunded' THEN NULLIF(trim(p_refund_reference), '') ELSE refund_reference END
  WHERE id = p_order_id;
  INSERT INTO public.admin_activity_log(actor_id, actor_email, event_type, entity_type, entity_id, before_data, after_data, note)
  VALUES (auth.uid(), auth.jwt()->>'email', 'order_status_changed', 'order', p_order_id::text,
    jsonb_build_object('status', o.status, 'payment_status', o.payment_status),
    jsonb_build_object('status', p_next_status, 'payment_status', next_payment, 'refund_reference', p_refund_reference), p_note);
END;
$$;

COMMIT;
