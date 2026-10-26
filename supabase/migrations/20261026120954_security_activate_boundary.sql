-- Activate only after the checkout gateway, secrets and compatible frontend
-- have been verified. Earlier migrations intentionally preserve the old UI.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.create_order_with_notification_token(text,text,text,text,text,text,text,text,text,text,text,jsonb,text) FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "Customers can upload payment receipts" ON storage.objects;
REVOKE EXECUTE ON FUNCTION public.get_order_tracking(text,text,text), public.preview_promo_code(text,numeric) FROM PUBLIC, anon, authenticated;

-- Membership remains live database state; user-editable metadata is never trusted.
CREATE OR REPLACE FUNCTION public.is_store_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(auth.jwt()->>'aal','') = 'aal2' AND EXISTS (
    SELECT 1 FROM public.store_admins WHERE user_id=auth.uid() AND is_active
  );
$$;
CREATE OR REPLACE FUNCTION public.is_store_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_store_admin() AND EXISTS (
    SELECT 1 FROM public.store_admins WHERE user_id=auth.uid() AND is_active AND role='owner'
  );
$$;
REVOKE ALL ON FUNCTION public.is_store_admin(), public.is_store_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_store_admin(), public.is_store_owner() TO authenticated, service_role;
COMMIT;
