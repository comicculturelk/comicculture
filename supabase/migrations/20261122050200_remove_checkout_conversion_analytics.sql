BEGIN;

SET LOCAL lock_timeout = '5s';

-- Approve and apply only after the checkout gateway stops using conversion RPCs.
DO $$
DECLARE
  retention_job_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RETURN;
  END IF;

  FOR retention_job_id IN
    SELECT jobid FROM cron.job WHERE jobname = 'checkout-conversion-retention'
  LOOP
    IF cron.unschedule(retention_job_id) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Could not unschedule checkout-conversion-retention job %', retention_job_id;
    END IF;
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS checkout_conversion_purchase ON public.checkout_requests;
DROP FUNCTION IF EXISTS public.record_checkout_conversion_purchase();
DROP FUNCTION IF EXISTS public.submit_checkout_with_conversion(uuid, jsonb, uuid);
DROP FUNCTION IF EXISTS public.record_checkout_conversion_event(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.admin_checkout_conversion(text);
DROP FUNCTION IF EXISTS public.prune_checkout_conversion();

-- Default RESTRICT protects any unexpected external database dependencies.
DROP TABLE IF EXISTS public.checkout_conversion_events;
DROP TABLE IF EXISTS public.checkout_conversion_sessions;

-- Remove only the bucket keys emitted by the retired analytics route.
DELETE FROM public.checkout_attempts
WHERE key = 'analytics:global' OR key ~ '^analytics:[0-9a-f]{64}$';

COMMIT;
