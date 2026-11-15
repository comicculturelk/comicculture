BEGIN;

CREATE TABLE public.order_status_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_status text NOT NULL CHECK (order_status IN ('confirmed','packed','shipped','delivered','cancelled')),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sent','failed','skipped')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT (now() + interval '45 seconds'),
  first_attempt_at timestamptz,
  sent_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_id uuid,
  lease_until timestamptz,
  payload jsonb,
  UNIQUE (order_id, order_status)
);
ALTER TABLE public.order_status_email_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_status_email_outbox FROM PUBLIC, anon, authenticated, service_role;
CREATE INDEX order_status_email_ready_idx ON public.order_status_email_outbox (available_at, created_at) WHERE state='pending';

CREATE FUNCTION public.enqueue_order_status_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE skip_reason text;
BEGIN
  -- The status RPC and its audit still commit atomically. No network call occurs here.
  UPDATE public.order_status_email_outbox
  SET state='skipped', reason='superseded', lease_id=NULL, lease_until=NULL, payload=NULL
  WHERE order_id=NEW.id AND state IN ('pending','failed')
    AND (lease_until IS NULL OR lease_until <= now());

  IF NEW.status NOT IN ('confirmed','packed','shipped','delivered','cancelled') THEN RETURN NEW; END IF;
  skip_reason := CASE
    WHEN nullif(btrim(NEW.email),'') IS NULL THEN 'missing_email'
    WHEN NEW.status='confirmed' AND NEW.payment_method='COD' THEN 'covered_by_confirmation'
  END;
  INSERT INTO public.order_status_email_outbox(order_id, order_status, state, reason)
  VALUES (NEW.id, NEW.status, CASE WHEN skip_reason IS NULL THEN 'pending' ELSE 'skipped' END, skip_reason)
  ON CONFLICT (order_id,order_status) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_order_status_email() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER orders_queue_status_email AFTER UPDATE OF status ON public.orders
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.enqueue_order_status_email();

CREATE FUNCTION public.claim_order_status_email()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.order_status_email_outbox%ROWTYPE; o public.orders%ROWTYPE;
BEGIN
  -- Claims are short transactions. A crashed worker loses its lease; a new
  -- worker reuses the original payload and Resend idempotency key.
  SELECT n.* INTO job FROM public.order_status_email_outbox n
  WHERE n.state='pending' AND n.available_at <= now()
    AND (n.lease_until IS NULL OR n.lease_until <= now())
  ORDER BY n.available_at,n.created_at,n.id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO o FROM public.orders WHERE id=job.order_id;
  IF o.status IS DISTINCT FROM job.order_status OR nullif(btrim(o.email),'') IS NULL THEN
    UPDATE public.order_status_email_outbox
    SET state='skipped', reason=CASE WHEN o.status IS DISTINCT FROM job.order_status THEN 'superseded' ELSE 'missing_email' END,
      lease_id=NULL, lease_until=NULL, payload=NULL WHERE id=job.id;
    RETURN jsonb_build_object('skipped',true);
  END IF;
  IF job.first_attempt_at <= now() - interval '23 hours' OR job.attempts >= 5 THEN
    UPDATE public.order_status_email_outbox SET state='failed',
      reason=CASE WHEN job.first_attempt_at <= now() - interval '23 hours' THEN 'safety_window' ELSE 'retry_exhausted' END,
      lease_id=NULL, lease_until=NULL,
      payload=CASE WHEN job.first_attempt_at <= now() - interval '23 hours' THEN NULL ELSE job.payload END
    WHERE id=job.id;
    RETURN jsonb_build_object('skipped',true);
  END IF;
  UPDATE public.order_status_email_outbox
  SET attempts=attempts+1, first_attempt_at=coalesce(first_attempt_at,now()),
    lease_id=gen_random_uuid(), lease_until=now() + interval '2 minutes',
    payload=coalesce(payload,jsonb_build_object(
      'email', btrim(o.email), 'reference', o.order_reference, 'status', o.status,
      'paymentMethod', o.payment_method, 'paymentStatus', o.payment_status,
      'courier', o.courier_name, 'trackingNumber', o.tracking_number, 'trackingUrl', o.tracking_url
    ))
  WHERE id=job.id RETURNING * INTO job;
  RETURN jsonb_build_object('id',job.id,'lease',job.lease_id,'payload',job.payload);
END;
$$;

-- Recheck immediately before contacting the provider. A subsequent committed
-- status cannot retract a message already accepted by the provider.
CREATE FUNCTION public.check_order_status_email_claim(p_id uuid, p_lease uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_job public.order_status_email_outbox%ROWTYPE;
BEGIN
  SELECT n.* INTO current_job FROM public.order_status_email_outbox n
  WHERE n.id=p_id AND n.lease_id=p_lease AND n.state='pending' AND n.lease_until > now() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id=current_job.order_id
    AND o.status=current_job.order_status AND btrim(o.email)=current_job.payload->>'email') THEN
    UPDATE public.order_status_email_outbox SET state='skipped',reason='superseded',
      lease_id=NULL,lease_until=NULL,payload=NULL WHERE id=p_id;
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

CREATE FUNCTION public.finish_order_status_email(p_id uuid,p_lease uuid,p_outcome text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('sent','temporary','permanent') THEN RAISE EXCEPTION 'Invalid email outcome'; END IF;
  UPDATE public.order_status_email_outbox
  SET state=CASE WHEN p_outcome='sent' THEN 'sent' WHEN p_outcome='temporary' AND attempts<5 THEN 'pending' ELSE 'failed' END,
    sent_at=CASE WHEN p_outcome='sent' THEN now() END,
    reason=CASE WHEN p_outcome='permanent' THEN 'provider_rejected'
      WHEN p_outcome='temporary' AND attempts>=5 THEN 'retry_exhausted' END,
    available_at=now()+make_interval(mins => (1 << least(attempts,5))),
    lease_id=NULL, lease_until=NULL, payload=CASE WHEN p_outcome='sent' THEN NULL ELSE payload END
  WHERE id=p_id AND lease_id=p_lease AND state='pending';
END;
$$;
REVOKE ALL ON FUNCTION public.claim_order_status_email(), public.check_order_status_email_claim(uuid,uuid), public.finish_order_status_email(uuid,uuid,text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_order_status_email(), public.check_order_status_email_claim(uuid,uuid), public.finish_order_status_email(uuid,uuid,text)
TO service_role;

CREATE FUNCTION public.admin_order_status_emails(p_order_ids uuid[])
RETURNS TABLE(id uuid,order_id uuid,order_status text,state text,reason text,sent_at timestamptz,retryable boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF public.is_store_admin() IS NOT TRUE THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
  IF cardinality(p_order_ids)>100 THEN RAISE EXCEPTION 'Too many orders' USING ERRCODE='22023'; END IF;
  RETURN QUERY SELECT n.id,n.order_id,n.order_status,n.state,n.reason,n.sent_at,
    coalesce(n.state='failed' AND n.first_attempt_at > now()-interval '23 hours'
      AND n.order_status=o.status AND btrim(o.email)=n.payload->>'email',false)
  FROM public.order_status_email_outbox n JOIN public.orders o ON o.id=n.order_id
  WHERE n.order_id=ANY(p_order_ids) ORDER BY n.created_at DESC,n.id;
END;
$$;

CREATE FUNCTION public.admin_retry_order_status_email(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE parent_id uuid;
BEGIN
  IF public.is_store_admin() IS NOT TRUE THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
  UPDATE public.order_status_email_outbox n SET state='pending',reason=NULL,attempts=0,available_at=now()
  FROM public.orders o WHERE o.id=n.order_id AND n.id=p_id AND n.state='failed'
    AND n.first_attempt_at > now()-interval '23 hours' AND n.order_status=o.status AND btrim(o.email)=n.payload->>'email'
  RETURNING n.order_id INTO parent_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'This email is no longer eligible for retry' USING ERRCODE='22023'; END IF;
  INSERT INTO public.admin_activity_log(actor_id,actor_email,event_type,entity_type,entity_id,after_data)
  VALUES (auth.uid(),auth.jwt()->>'email','order_status_email_retried','order',parent_id::text,jsonb_build_object('notification_id',p_id));
END;
$$;

CREATE FUNCTION public.clear_expired_order_status_email_payloads()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  UPDATE public.order_status_email_outbox SET payload=NULL,reason='safety_window'
  WHERE state='failed' AND first_attempt_at <= now()-interval '23 hours' AND payload IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.clear_expired_order_status_email_payloads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_expired_order_status_email_payloads() TO service_role;
REVOKE ALL ON FUNCTION public.admin_order_status_emails(uuid[]), public.admin_retry_order_status_email(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_order_status_emails(uuid[]), public.admin_retry_order_status_email(uuid) TO authenticated;

COMMIT;
