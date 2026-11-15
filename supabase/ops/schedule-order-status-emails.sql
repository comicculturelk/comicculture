-- Run separately after the additive migration and worker deployment.
-- Enable Supabase Cron, pg_net and Vault first. Save the HTTPS function URL
-- and matching worker secret in Vault using the names below.
BEGIN;
DO $$
BEGIN
  IF (SELECT count(*) FROM vault.decrypted_secrets
      WHERE name='order_status_worker_url' AND decrypted_secret ~ '^https://[a-z]{20}\.supabase\.co/functions/v1/order-status-email-worker$') <> 1
     OR (SELECT count(*) FROM vault.decrypted_secrets
      WHERE name='order_status_worker_secret' AND length(decrypted_secret) BETWEEN 32 AND 256) <> 1 THEN
    RAISE EXCEPTION 'Configure the order status worker URL and secret in Vault';
  END IF;
END;
$$;

SELECT cron.schedule('order-status-email-dispatch', '* * * * *', $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='order_status_worker_url'),
    headers := jsonb_build_object('Content-Type','application/json',
      'x-worker-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='order_status_worker_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$job$);

SELECT cron.schedule('order-status-email-payload-cleanup', '17 * * * *',
  'SELECT public.clear_expired_order_status_email_payloads();');
COMMIT;
