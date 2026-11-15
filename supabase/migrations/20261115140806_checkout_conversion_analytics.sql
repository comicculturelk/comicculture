BEGIN;

CREATE TABLE public.checkout_conversion_sessions (
  id uuid PRIMARY KEY,
  device text NOT NULL CHECK(device IN ('mobile','desktop','unknown')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checkout_conversion_sessions_date_idx ON public.checkout_conversion_sessions(created_at);
CREATE TABLE public.checkout_conversion_events (
  session_id uuid NOT NULL REFERENCES public.checkout_conversion_sessions(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK(stage IN ('view','cart','checkout','purchase')),
  event_key text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(session_id,stage,event_key)
);
CREATE INDEX checkout_conversion_events_date_idx ON public.checkout_conversion_events(occurred_at);
ALTER TABLE public.checkout_conversion_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_conversion_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checkout_conversion_sessions, public.checkout_conversion_events FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.record_checkout_conversion_event(p_session uuid,p_stage text,p_device text,p_product_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_session IS NULL OR p_stage IS NULL OR p_stage NOT IN ('view','cart','checkout')
     OR p_device IS NULL OR p_device NOT IN ('mobile','desktop','unknown')
     OR (p_stage='checkout' AND p_product_id IS NOT NULL)
     OR (p_stage IN ('view','cart') AND (p_product_id IS NULL OR length(p_product_id) NOT BETWEEN 1 AND 128
       OR NOT EXISTS (SELECT FROM public.products p JOIN public.product_versions v ON v.product_id=p.id AND v.is_active WHERE p.id=p_product_id))) THEN
    RAISE EXCEPTION 'Invalid conversion event' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.checkout_conversion_sessions(id,device) VALUES(p_session,p_device) ON CONFLICT DO NOTHING;
  IF NOT EXISTS (SELECT FROM public.checkout_conversion_sessions s WHERE s.id=p_session AND s.created_at > now()-interval '24 hours') THEN RETURN; END IF;

  INSERT INTO public.checkout_conversion_events(session_id,stage,event_key)
  VALUES(p_session,p_stage,coalesce(p_product_id,'')) ON CONFLICT DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.record_checkout_conversion_event(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_checkout_conversion_event(uuid,text,text,text) TO service_role;

-- This attaches attribution to the first committed checkout result only.
-- The legacy payload and its idempotency hash stay byte-for-byte unchanged.
CREATE FUNCTION public.submit_checkout_with_conversion(p_request_id uuid,p_payload jsonb,p_session uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM set_config('comicculture.conversion_session',coalesce(p_session::text,''),true);
  result:=public.submit_checkout(p_request_id,p_payload);
  PERFORM set_config('comicculture.conversion_session','',true);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_checkout_with_conversion(uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_checkout_with_conversion(uuid,jsonb,uuid) TO service_role;

CREATE FUNCTION public.record_checkout_conversion_purchase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE claimed_session text:=nullif(current_setting('comicculture.conversion_session',true),'');
BEGIN
  IF claimed_session IS NULL THEN RETURN NEW; END IF;
  BEGIN
    INSERT INTO public.checkout_conversion_events(session_id,stage,event_key)
    SELECT s.id,'purchase',encode(sha256(convert_to(NEW.result->>'order_id','UTF8')),'hex')
    FROM public.checkout_conversion_sessions s
    WHERE s.id=claimed_session::uuid AND s.created_at>now()-interval '24 hours'
      AND NEW.result->>'order_id' IS NOT NULL
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Analytics is optional. Preserve the successful order even if capture fails.
    RAISE WARNING 'Checkout conversion attribution failed (SQLSTATE %)',SQLSTATE;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.record_checkout_conversion_purchase() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER checkout_conversion_purchase AFTER UPDATE OF result ON public.checkout_requests
FOR EACH ROW WHEN (OLD.result IS NULL AND NEW.result IS NOT NULL)
EXECUTE FUNCTION public.record_checkout_conversion_purchase();

CREATE FUNCTION public.prune_checkout_conversion()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  DELETE FROM public.checkout_conversion_sessions WHERE created_at<now()-interval '90 days';
$$;
REVOKE ALL ON FUNCTION public.prune_checkout_conversion() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prune_checkout_conversion() TO service_role;

CREATE FUNCTION public.admin_checkout_conversion(p_period text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  zone constant text:='Asia/Colombo';
  local_today date:=(statement_timestamp() AT TIME ZONE zone)::date;
  day_count integer;
  since timestamptz;
  result jsonb;
BEGIN
  IF public.is_store_admin() IS NOT TRUE THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
  day_count:=CASE p_period WHEN 'today' THEN 1 WHEN '7d' THEN 7 WHEN '30d' THEN 30 WHEN '90d' THEN 90 WHEN 'all' THEN 0 END;
  IF day_count IS NULL THEN RAISE EXCEPTION 'Invalid report period' USING ERRCODE='22023'; END IF;
  since:=CASE WHEN day_count=0 THEN statement_timestamp()-interval '90 days'
    ELSE (local_today-day_count+1)::timestamp AT TIME ZONE zone END;

  WITH retained AS MATERIALIZED (
    SELECT s.id,s.device,s.created_at FROM public.checkout_conversion_sessions s
    WHERE s.created_at>=statement_timestamp()-interval '90 days'
      AND s.created_at<statement_timestamp()
  ), views AS (
    SELECT e.session_id,min(e.occurred_at) AS viewed
    FROM public.checkout_conversion_events e JOIN retained s ON s.id=e.session_id WHERE e.stage='view'
    GROUP BY e.session_id HAVING min(e.occurred_at)>=since
  ), carts AS (
    SELECT v.*, (SELECT min(e.occurred_at) FROM public.checkout_conversion_events e
      WHERE e.session_id=v.session_id AND e.stage='cart' AND e.occurred_at>=v.viewed) AS added
    FROM views v
  ), starts AS (
    SELECT c.*, (SELECT min(e.occurred_at) FROM public.checkout_conversion_events e
      WHERE e.session_id=c.session_id AND e.stage='checkout' AND e.occurred_at>=c.added) AS started
    FROM carts c
  ), funnel AS (
    SELECT c.session_id,s.device,c.added,c.started,EXISTS(SELECT FROM public.checkout_conversion_events e
      WHERE e.session_id=c.session_id AND e.stage='purchase' AND e.occurred_at>=c.started) AS purchased
    FROM starts c JOIN retained s ON s.id=c.session_id
  ), devices AS (
    SELECT labels.device,count(f.session_id) AS viewed,count(f.added) AS added,count(f.started) AS started,
      count(*) FILTER(WHERE f.purchased) AS purchased
    FROM (VALUES ('mobile'),('desktop'),('unknown')) labels(device)
    LEFT JOIN funnel f USING(device) GROUP BY labels.device
  ), products AS (
    SELECT e.event_key AS product_id,coalesce(p.name,e.event_key) AS product_name,
      count(*) FILTER (WHERE e.stage='view') AS views,count(*) FILTER (WHERE e.stage='cart') AS adds
    FROM public.checkout_conversion_events e JOIN retained s ON s.id=e.session_id
    LEFT JOIN public.products p ON p.id=e.event_key
    WHERE e.occurred_at>=since AND e.occurred_at<statement_timestamp() AND e.stage IN ('view','cart')
    GROUP BY e.event_key,p.name
    ORDER BY count(*) FILTER (WHERE e.stage='view') DESC,count(*) FILTER (WHERE e.stage='cart') DESC,e.event_key LIMIT 12
  )
  SELECT jsonb_build_object(
    'start', (since AT TIME ZONE zone)::date, 'end',local_today,
    'viewed',count(*),'added',count(added),'started',count(started),'purchased',count(*) FILTER (WHERE purchased),
    'attributed_orders',(SELECT count(*) FROM public.checkout_conversion_events e JOIN retained s ON s.id=e.session_id
      WHERE e.stage='purchase' AND e.occurred_at>=since AND e.occurred_at<statement_timestamp()),
    'devices',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.device) FROM devices d),
    'products',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.views DESC,p.adds DESC,p.product_id) FROM products p),'[]'::jsonb)
  ) INTO result FROM funnel;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_checkout_conversion(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_checkout_conversion(text) TO authenticated;

COMMIT;
