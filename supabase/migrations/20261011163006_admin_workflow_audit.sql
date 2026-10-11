BEGIN;

-- Role membership is stored server-side; no client can grant itself access.
CREATE TABLE public.store_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'admin')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.store_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_admins FROM PUBLIC, anon, authenticated;

INSERT INTO public.store_admins(user_id, email, role)
SELECT id, email, 'owner' FROM auth.users
WHERE id = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid
ON CONFLICT (user_id) DO UPDATE SET role = 'owner', is_active = true;

CREATE OR REPLACE FUNCTION public.is_store_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.store_admins
    WHERE user_id = auth.uid() AND is_active
  );
$$;
REVOKE ALL ON FUNCTION public.is_store_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_store_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_store_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.store_admins
    WHERE user_id = auth.uid() AND is_active AND role = 'owner'
  );
$$;
REVOKE ALL ON FUNCTION public.is_store_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_store_owner() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_store_admin_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT role FROM public.store_admins
  WHERE user_id = auth.uid() AND is_active
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_store_admin_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_admin_role() TO authenticated, service_role;

CREATE TABLE public.admin_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_activity_log_created_at_idx ON public.admin_activity_log(created_at DESC, id DESC);
ALTER TABLE public.admin_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Store admins read activity log" ON public.admin_activity_log
  FOR SELECT TO authenticated USING ((SELECT public.is_store_admin()));
GRANT SELECT ON public.admin_activity_log TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.admin_activity_log FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_staff()
RETURNS TABLE(user_id uuid, email text, role text, is_active boolean, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_store_owner() THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT a.user_id, a.email, a.role, a.is_active, a.created_at
  FROM public.store_admins a ORDER BY a.role, a.email;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_staff() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_upsert_staff(p_email text, p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE target_id uuid; normalized_email text := lower(trim(coalesce(p_email, ''))); prior_role text; active_owners integer;
BEGIN
  IF NOT public.is_store_owner() THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE = '42501'; END IF;
  IF p_role NOT IN ('owner', 'admin') THEN RAISE EXCEPTION 'Invalid admin role'; END IF;
  SELECT id INTO target_id FROM auth.users WHERE lower(email) = normalized_email LIMIT 1;
  IF target_id IS NULL THEN RAISE EXCEPTION 'Create this user in Supabase Auth first'; END IF;
  SELECT role INTO prior_role FROM public.store_admins WHERE user_id = target_id;
  IF target_id = auth.uid() AND p_role <> 'owner' THEN RAISE EXCEPTION 'You cannot remove your own owner role'; END IF;
  IF prior_role = 'owner' AND p_role <> 'owner' THEN
    SELECT count(*) INTO active_owners FROM public.store_admins WHERE role = 'owner' AND is_active;
    IF active_owners <= 1 THEN RAISE EXCEPTION 'At least one active owner must remain'; END IF;
  END IF;
  INSERT INTO public.store_admins(user_id, email, role, is_active, created_by)
  VALUES (target_id, normalized_email, p_role, true, auth.uid())
  ON CONFLICT (user_id) DO UPDATE SET email = excluded.email, role = excluded.role, is_active = true;
  INSERT INTO public.admin_activity_log(actor_id, actor_email, event_type, entity_type, entity_id, after_data)
  VALUES (auth.uid(), auth.jwt()->>'email', 'staff_access_granted', 'admin', target_id::text,
    jsonb_build_object('email', normalized_email, 'role', p_role));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_upsert_staff(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_staff(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_staff_active(p_user_id uuid, p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE target_role text; target_email text; owner_count integer;
BEGIN
  IF NOT public.is_store_owner() THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE = '42501'; END IF;
  IF p_user_id = auth.uid() AND NOT p_active THEN RAISE EXCEPTION 'You cannot deactivate your own account'; END IF;
  SELECT role, email INTO target_role, target_email FROM public.store_admins WHERE user_id = p_user_id FOR UPDATE;
  IF target_role IS NULL THEN RAISE EXCEPTION 'Admin account not found'; END IF;
  IF target_role = 'owner' AND NOT p_active THEN
    SELECT count(*) INTO owner_count FROM public.store_admins WHERE role = 'owner' AND is_active;
    IF owner_count <= 1 THEN RAISE EXCEPTION 'At least one active owner must remain'; END IF;
  END IF;
  UPDATE public.store_admins SET is_active = p_active WHERE user_id = p_user_id;
  INSERT INTO public.admin_activity_log(actor_id, actor_email, event_type, entity_type, entity_id, before_data, after_data)
  VALUES (auth.uid(), auth.jwt()->>'email', 'staff_access_changed', 'admin', p_user_id::text,
    jsonb_build_object('email', target_email, 'role', target_role, 'is_active', NOT p_active),
    jsonb_build_object('email', target_email, 'role', target_role, 'is_active', p_active));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_staff_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_staff_active(uuid, boolean) TO authenticated, service_role;

-- Replace the single-user policies with an explicit active-admin allowlist.
DROP POLICY IF EXISTS "Authenticated users can insert products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can update product stock" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can delete products" ON public.products;
CREATE POLICY "Store admins manage products" ON public.products FOR ALL TO authenticated
  USING ((SELECT public.is_store_admin())) WITH CHECK ((SELECT public.is_store_admin()));

DROP POLICY IF EXISTS "Authenticated users can insert product versions" ON public.product_versions;
DROP POLICY IF EXISTS "Authenticated users can update product versions" ON public.product_versions;
DROP POLICY IF EXISTS "Authenticated users can delete product versions" ON public.product_versions;
CREATE POLICY "Store admins manage product versions" ON public.product_versions FOR ALL TO authenticated
  USING ((SELECT public.is_store_admin())) WITH CHECK ((SELECT public.is_store_admin()));

DROP POLICY IF EXISTS "Authenticated users can insert product version sizes" ON public.product_version_sizes;
DROP POLICY IF EXISTS "Authenticated users can update product version sizes" ON public.product_version_sizes;
DROP POLICY IF EXISTS "Authenticated users can delete product version sizes" ON public.product_version_sizes;
CREATE POLICY "Store admins manage product version sizes" ON public.product_version_sizes FOR ALL TO authenticated
  USING ((SELECT public.is_store_admin())) WITH CHECK ((SELECT public.is_store_admin()));

DROP POLICY IF EXISTS "Authenticated users can insert collections" ON public.collections;
DROP POLICY IF EXISTS "Authenticated users can update collections" ON public.collections;
DROP POLICY IF EXISTS "Authenticated users can delete collections" ON public.collections;
CREATE POLICY "Store admins manage collections" ON public.collections FOR ALL TO authenticated
  USING ((SELECT public.is_store_admin())) WITH CHECK ((SELECT public.is_store_admin()));

DROP POLICY IF EXISTS "Authenticated users can view orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can update order status" ON public.orders;
CREATE POLICY "Store admins view orders" ON public.orders FOR SELECT TO authenticated
  USING ((SELECT public.is_store_admin()));
REVOKE UPDATE ON public.orders FROM authenticated;
REVOKE UPDATE(status, payment_status, courier_name, tracking_number, tracking_url) ON public.orders FROM authenticated;

DROP POLICY IF EXISTS "Authenticated users can view order items" ON public.order_items;
CREATE POLICY "Store admins view order items" ON public.order_items FOR SELECT TO authenticated
  USING ((SELECT public.is_store_admin()));

DROP POLICY IF EXISTS "Authenticated users can view inventory movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Admin can add inventory movements" ON public.inventory_movements;
CREATE POLICY "Store admins view inventory movements" ON public.inventory_movements FOR SELECT TO authenticated
  USING ((SELECT public.is_store_admin()));
CREATE POLICY "Store admins add inventory movements" ON public.inventory_movements FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_store_admin()));

DROP POLICY IF EXISTS "ComicCulture admin manages promo codes" ON public.promo_codes;
CREATE POLICY "Store admins manage promo codes" ON public.promo_codes FOR ALL TO authenticated
  USING ((SELECT public.is_store_admin())) WITH CHECK ((SELECT public.is_store_admin()));
DROP POLICY IF EXISTS "ComicCulture admin reads promo redemptions" ON public.promo_redemptions;
CREATE POLICY "Store admins read promo redemptions" ON public.promo_redemptions FOR SELECT TO authenticated
  USING ((SELECT public.is_store_admin()));

DROP POLICY IF EXISTS "ComicCulture admin manages customer reviews" ON public.customer_reviews;
CREATE POLICY "Store admins manage customer reviews" ON public.customer_reviews FOR ALL TO authenticated
  USING ((SELECT public.is_store_admin())) WITH CHECK ((SELECT public.is_store_admin()));
ALTER TABLE public.customer_reviews ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP POLICY IF EXISTS "ComicCulture admin can view payment receipts" ON storage.objects;
DROP POLICY IF EXISTS "ComicCulture admin can delete payment receipts" ON storage.objects;
DROP POLICY IF EXISTS "ComicCulture admin can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "ComicCulture admin can update product images" ON storage.objects;
DROP POLICY IF EXISTS "ComicCulture admin can delete product images" ON storage.objects;
CREATE POLICY "Store admins can view payment receipts" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-receipts' AND (SELECT public.is_store_admin()));
CREATE POLICY "Store admins can delete payment receipts" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'payment-receipts' AND (SELECT public.is_store_admin()));
CREATE POLICY "Store admins can upload product images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND (SELECT public.is_store_admin()));
CREATE POLICY "Store admins can update product images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND (SELECT public.is_store_admin()))
  WITH CHECK (bucket_id = 'product-images' AND (SELECT public.is_store_admin()));
CREATE POLICY "Store admins can delete product images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND (SELECT public.is_store_admin()));

-- Existing product-save transaction remains intact; only its allowlist check changes.
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.save_admin_product(boolean,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure)
  INTO definition;
  definition := replace(definition,
    $old_guard$IF auth.uid() IS DISTINCT FROM 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid THEN$old_guard$,
    $new_guard$IF NOT public.is_store_admin() THEN$new_guard$);
  IF position('IF NOT public.is_store_admin() THEN' in definition) = 0 THEN
    RAISE EXCEPTION 'Could not update save_admin_product authorization guard';
  END IF;
  EXECUTE definition;
END;
$$;

-- Keep the current owner/admin records as the same permission tier in app UI.
-- Order changes are constrained and logged by these transactional RPCs.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending', 'awaiting_payment', 'awaiting_verification', 'paid', 'failed', 'refunded'));
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_reference text;

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
  IF p_next_status = 'shipped' AND (NULLIF(trim(o.courier_name), '') IS NULL OR NULLIF(trim(o.tracking_number), '') IS NULL) THEN
    RAISE EXCEPTION 'Save a courier and tracking number before shipping';
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
REVOKE ALL ON FUNCTION public.admin_transition_order(uuid,text,text,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_transition_order(uuid,text,text,boolean,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_verify_order_payment(p_order_id uuid, p_outcome text, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE o public.orders%rowtype; next_status text;
BEGIN
  IF NOT public.is_store_admin() THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501'; END IF;
  IF p_outcome NOT IN ('paid','failed') THEN RAISE EXCEPTION 'Invalid payment outcome'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.payment_method <> 'BANK_TRANSFER' OR o.payment_status <> 'awaiting_verification' OR o.status <> 'pending' THEN
    RAISE EXCEPTION 'This order is not awaiting payment verification';
  END IF;
  next_status := CASE WHEN p_outcome = 'paid' THEN 'confirmed' ELSE o.status END;
  UPDATE public.orders SET payment_status = p_outcome, status = next_status WHERE id = p_order_id;
  INSERT INTO public.admin_activity_log(actor_id, actor_email, event_type, entity_type, entity_id, before_data, after_data, note)
  VALUES (auth.uid(), auth.jwt()->>'email', 'order_payment_verified', 'order', p_order_id::text,
    jsonb_build_object('payment_status', o.payment_status, 'status', o.status),
    jsonb_build_object('payment_status', p_outcome, 'status', next_status), p_note);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_verify_order_payment(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_verify_order_payment(uuid,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_save_order_tracking(
  p_order_id uuid, p_courier_name text, p_tracking_number text, p_tracking_url text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE o public.orders%rowtype; clean_url text := NULLIF(trim(p_tracking_url), '');
BEGIN
  IF NOT public.is_store_admin() THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501'; END IF;
  IF clean_url IS NOT NULL AND clean_url !~ '^https://' THEN RAISE EXCEPTION 'Tracking link must use HTTPS'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status IN ('delivered','cancelled') THEN RAISE EXCEPTION 'Tracking details cannot be changed for a closed order'; END IF;
  UPDATE public.orders SET courier_name = NULLIF(trim(p_courier_name), ''),
    tracking_number = NULLIF(trim(p_tracking_number), ''), tracking_url = clean_url WHERE id = p_order_id;
  INSERT INTO public.admin_activity_log(actor_id, actor_email, event_type, entity_type, entity_id, before_data, after_data)
  VALUES (auth.uid(), auth.jwt()->>'email', 'order_tracking_updated', 'order', p_order_id::text,
    jsonb_build_object('courier_name', o.courier_name, 'tracking_number', o.tracking_number, 'tracking_url', o.tracking_url),
    jsonb_build_object('courier_name', p_courier_name, 'tracking_number', p_tracking_number, 'tracking_url', clean_url));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_save_order_tracking(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_order_tracking(uuid,text,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_dashboard_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_store_admin() THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501'; END IF;
  SELECT jsonb_build_object(
    'total_orders', count(*),
    'orders_today', count(*) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Colombo')::date = (now() AT TIME ZONE 'Asia/Colombo')::date),
    'pending_orders', count(*) FILTER (WHERE status = 'pending'),
    'completed_orders', count(*) FILTER (WHERE status = 'delivered'),
    'collected_revenue', coalesce(sum(total) FILTER (WHERE (payment_status = 'paid' AND status <> 'cancelled') OR (payment_method = 'COD' AND status = 'delivered')), 0),
    'collected_order_count', count(*) FILTER (WHERE (payment_status = 'paid' AND status <> 'cancelled') OR (payment_method = 'COD' AND status = 'delivered')),
    'best_seller', (SELECT jsonb_build_object('name', oi.name, 'quantity', sum(oi.quantity))
      FROM public.order_items oi JOIN public.orders so ON so.id = oi.order_id
      WHERE so.status <> 'cancelled' AND so.payment_status NOT IN ('failed','refunded')
      GROUP BY oi.name ORDER BY sum(oi.quantity) DESC, oi.name LIMIT 1),
    'net_items_ordered', coalesce((SELECT sum(oi.quantity) FROM public.order_items oi
      JOIN public.orders so ON so.id = oi.order_id WHERE so.status <> 'cancelled'
      AND so.payment_status NOT IN ('failed','refunded')), 0)
  ) INTO result FROM public.orders;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_dashboard_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_summary() TO authenticated, service_role;

-- Capture future catalog, promotion, and review edits without backfilling or
-- touching existing rows. Inventory has its own movement ledger already.
CREATE OR REPLACE FUNCTION public.log_admin_record_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE old_row jsonb; new_row jsonb; record_id text;
BEGIN
  IF NOT public.is_store_admin() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP <> 'INSERT' THEN old_row := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN new_row := to_jsonb(NEW); END IF;
  record_id := coalesce(new_row->>'id', old_row->>'id', 'unknown');
  INSERT INTO public.admin_activity_log(actor_id, actor_email, event_type, entity_type, entity_id, before_data, after_data)
  VALUES (auth.uid(), auth.jwt()->>'email', lower(TG_OP) || '_record', TG_TABLE_NAME, record_id, old_row, new_row);
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.log_admin_record_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER admin_audit_products AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_record_change();
CREATE TRIGGER admin_audit_product_versions AFTER INSERT OR UPDATE OR DELETE ON public.product_versions
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_record_change();
CREATE TRIGGER admin_audit_product_version_sizes AFTER INSERT OR UPDATE OR DELETE ON public.product_version_sizes
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_record_change();
CREATE TRIGGER admin_audit_collections AFTER INSERT OR UPDATE OR DELETE ON public.collections
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_record_change();
CREATE TRIGGER admin_audit_promo_codes AFTER INSERT OR UPDATE OR DELETE ON public.promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_record_change();
CREATE TRIGGER admin_audit_customer_reviews AFTER INSERT OR UPDATE OR DELETE ON public.customer_reviews
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_record_change();

COMMIT;
