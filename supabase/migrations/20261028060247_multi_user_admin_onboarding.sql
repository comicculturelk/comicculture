BEGIN;
ALTER TABLE public.store_admins DROP CONSTRAINT store_admins_role_check;
ALTER TABLE public.store_admins ADD CONSTRAINT store_admins_role_check CHECK(role IN ('owner','admin','staff'));
CREATE TABLE public.admin_invitations (
 email text PRIMARY KEY CHECK(email=lower(trim(email)) AND length(email)<=254),
 role text NOT NULL CHECK(role IN ('admin','staff')),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours'
);
ALTER TABLE public.admin_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_invitations FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_store_admin_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT a.role FROM public.store_admins a JOIN auth.users u ON u.id=a.user_id
 WHERE a.user_id=auth.uid() AND a.is_active AND u.email_confirmed_at IS NOT NULL;
$$;
CREATE OR REPLACE FUNCTION public.has_store_permission(p_permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(coalesce(auth.jwt()->>'aal','')='aal2' AND CASE
 WHEN p_permission='team' THEN public.get_store_admin_role()='owner'
 WHEN p_permission='inventory.read' THEN public.get_store_admin_role() IN ('owner','admin','staff')
 WHEN p_permission='operations' THEN public.get_store_admin_role() IN ('owner','admin')
 ELSE false END,false);
$$;
REVOKE ALL ON FUNCTION public.has_store_permission(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_store_permission(text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.is_store_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(public.has_store_permission('operations'),false);
$$;
CREATE OR REPLACE FUNCTION public.staff_inventory() RETURNS TABLE(product text,version text,size text,stock integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT coalesce(public.has_store_permission('inventory.read'),false) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT p.name,v.version_name,s.size,s.stock FROM products p JOIN product_versions v ON v.product_id=p.id JOIN product_version_sizes s ON s.version_id=v.id ORDER BY p.name,v.version_name,s.size;
END; $$;
REVOKE ALL ON FUNCTION public.staff_inventory() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_inventory() TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_upsert_staff(p_email text, p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE target_id uuid; normalized_email text := lower(trim(coalesce(p_email, ''))); prior_role text; active_owners integer;
BEGIN
  PERFORM pg_advisory_xact_lock(72841001);
  IF NOT public.is_store_owner() THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE = '42501'; END IF;
  IF p_role IS NULL OR p_role NOT IN ('owner', 'admin', 'staff') THEN RAISE EXCEPTION 'Invalid admin role'; END IF;
  SELECT id INTO target_id FROM auth.users WHERE lower(email) = normalized_email AND email_confirmed_at IS NOT NULL LIMIT 1;
  IF target_id IS NULL THEN RAISE EXCEPTION 'Invite this user and verify their email first'; END IF;
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
  PERFORM pg_advisory_xact_lock(72841001);
  IF NOT public.is_store_owner() THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE = '42501'; END IF;
  IF p_user_id = auth.uid() AND NOT p_active THEN RAISE EXCEPTION 'You cannot deactivate your own account'; END IF;
  SELECT role, email INTO target_role, target_email FROM public.store_admins WHERE user_id = p_user_id FOR UPDATE;
  IF target_role IS NULL THEN RAISE EXCEPTION 'Admin account not found'; END IF;
  IF target_role = 'owner' AND NOT p_active THEN
    SELECT count(*) INTO owner_count FROM public.store_admins WHERE role = 'owner' AND is_active;
    IF owner_count <= 1 THEN RAISE EXCEPTION 'At least one active owner must remain'; END IF;
  END IF;
  IF NOT p_active THEN DELETE FROM public.admin_invitations WHERE email=lower(target_email); END IF;
  UPDATE public.store_admins SET is_active = p_active WHERE user_id = p_user_id;
  INSERT INTO public.admin_activity_log(actor_id, actor_email, event_type, entity_type, entity_id, before_data, after_data)
  VALUES (auth.uid(), auth.jwt()->>'email', 'staff_access_changed', 'admin', p_user_id::text,
    jsonb_build_object('email', target_email, 'role', target_role, 'is_active', NOT p_active),
    jsonb_build_object('email', target_email, 'role', target_role, 'is_active', p_active));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_staff_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_staff_active(uuid, boolean) TO authenticated, service_role;


CREATE FUNCTION public.admin_prepare_invitation(p_email text,p_role text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE normalized text:=lower(trim(p_email));
BEGIN
 PERFORM pg_advisory_xact_lock(72841001);
 IF NOT public.is_store_owner() THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501'; END IF;
 IF p_role IS NULL OR p_role NOT IN ('admin','staff') OR normalized IS NULL OR length(normalized)>254 OR normalized !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN RAISE EXCEPTION 'Invalid invitation'; END IF;
 IF EXISTS(SELECT 1 FROM store_admins WHERE lower(email)=normalized) THEN RAISE EXCEPTION 'Use existing member controls'; END IF;
 IF EXISTS(SELECT 1 FROM admin_invitations WHERE email=normalized AND created_at>now()-interval '1 minute') OR (SELECT count(*) FROM admin_invitations WHERE created_by=auth.uid() AND created_at>now()-interval '1 hour')>=10 THEN RAISE EXCEPTION 'Please wait before inviting again'; END IF;
 INSERT INTO admin_invitations(email,role,created_by) VALUES(normalized,p_role,auth.uid()) ON CONFLICT(email) DO UPDATE SET role=excluded.role,created_by=excluded.created_by,created_at=now(),expires_at=now()+interval '24 hours';
END; $$;
CREATE FUNCTION public.accept_admin_invitation() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE invite public.admin_invitations; verified_email text;
BEGIN
 PERFORM pg_advisory_xact_lock(72841001);
 SELECT lower(email) INTO verified_email FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL;
 SELECT * INTO invite FROM admin_invitations WHERE email=verified_email AND expires_at>now() FOR UPDATE;
 IF invite.email IS NULL OR NOT EXISTS(SELECT 1 FROM store_admins WHERE user_id=invite.created_by AND role='owner' AND is_active) THEN RAISE EXCEPTION 'Invitation unavailable'; END IF;
 INSERT INTO store_admins(user_id,email,role,created_by) VALUES(auth.uid(),verified_email,invite.role,invite.created_by) ON CONFLICT(user_id) DO NOTHING;
 DELETE FROM admin_invitations WHERE email=verified_email;
 INSERT INTO admin_activity_log(actor_id,event_type,entity_type,entity_id) VALUES(auth.uid(),'staff_invitation_accepted','admin',auth.uid()::text);
END; $$;
CREATE FUNCTION public.admin_cancel_invitation(p_email text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(72841001);
 IF NOT public.is_store_owner() THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501'; END IF;
 DELETE FROM admin_invitations WHERE email=lower(trim(p_email));
END; $$;
CREATE FUNCTION public.admin_list_invitations() RETURNS SETOF public.admin_invitations LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_store_owner() THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT * FROM admin_invitations ORDER BY created_at DESC;
END; $$;
REVOKE ALL ON FUNCTION public.admin_prepare_invitation(text,text),public.accept_admin_invitation(),public.admin_cancel_invitation(text),public.admin_list_invitations() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_prepare_invitation(text,text),public.accept_admin_invitation(),public.admin_cancel_invitation(text),public.admin_list_invitations() TO authenticated;
COMMIT;
