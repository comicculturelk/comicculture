BEGIN;

-- Private operational records: no customer-facing reads or writes.
CREATE TABLE public.checkout_attempts (
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);
CREATE TABLE public.checkout_receipts (
  path text PRIMARY KEY,
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  order_id uuid REFERENCES public.orders(id)
);
CREATE TABLE public.checkout_requests (
  id uuid PRIMARY KEY,
  payload_hash text NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.checkout_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checkout_attempts, public.checkout_receipts, public.checkout_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checkout_attempts, public.checkout_receipts, public.checkout_requests TO service_role;
CREATE INDEX checkout_receipts_abandoned_idx ON public.checkout_receipts(created_at) WHERE order_id IS NULL;

CREATE FUNCTION public.consume_checkout_attempt(p_key text, p_limit integer)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE current_attempts integer; bucket timestamptz := date_trunc('hour', now());
BEGIN
  IF length(p_key) > 100 OR p_limit NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Invalid rate limit'; END IF;
  INSERT INTO public.checkout_attempts(key, window_start) VALUES (p_key, bucket)
    ON CONFLICT (key, window_start) DO UPDATE SET attempts = checkout_attempts.attempts + 1
    RETURNING attempts INTO current_attempts;
  DELETE FROM public.checkout_attempts WHERE window_start < now() - interval '2 days';
  RETURN current_attempts <= p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_checkout_attempt(text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_checkout_attempt(text,integer) TO service_role;

-- Validate at the database boundary, including internal/direct callers.
-- A trigger preserves every existing checkout overload's transaction/pricing logic.
CREATE FUNCTION public.validate_new_checkout_order()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  NEW.email := lower(nullif(trim(NEW.email), ''));
  IF NEW.email IS NULL OR length(NEW.email) > 254 OR NEW.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'A valid customer email is required';
  END IF;
  IF NEW.payment_method IS NULL OR NEW.payment_method NOT IN ('COD','BANK_TRANSFER') THEN RAISE EXCEPTION 'Invalid payment method'; END IF;
  IF coalesce(length(trim(NEW.full_name)),0) NOT BETWEEN 1 AND 150 OR coalesce(length(trim(NEW.address_line1)),0) NOT BETWEEN 1 AND 300
     OR coalesce(length(trim(NEW.city)),0) NOT BETWEEN 1 AND 100 OR coalesce(length(trim(NEW.district)),0) NOT BETWEEN 1 AND 100
     OR length(coalesce(NEW.address_line2,'')) > 300 OR length(coalesce(NEW.postal_code,'')) > 20
     OR NEW.phone IS NULL OR NEW.phone !~ '^[0-9+[:space:]-]{9,15}$' THEN
    RAISE EXCEPTION 'Invalid customer delivery details';
  END IF;
  IF NEW.payment_method = 'BANK_TRANSFER' AND NOT EXISTS (
    SELECT 1 FROM storage.objects WHERE bucket_id='payment-receipts' AND name=NEW.receipt_url
  ) THEN RAISE EXCEPTION 'Upload a valid payment receipt'; END IF;
  IF NEW.payment_method = 'COD' THEN NEW.receipt_url := NULL; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_new_checkout_order() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER validate_new_checkout_order BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.validate_new_checkout_order();

CREATE FUNCTION public.submit_checkout(p_request_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prior public.checkout_requests%rowtype; response jsonb; entry jsonb; receipt_path text;
BEGIN
  IF p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid checkout'; END IF;
  INSERT INTO public.checkout_requests(id,payload_hash) VALUES(p_request_id,encode(sha256(convert_to(p_payload::text,'UTF8')),'hex')) ON CONFLICT DO NOTHING;
  SELECT * INTO prior FROM public.checkout_requests WHERE id=p_request_id FOR UPDATE;
  IF prior.payload_hash <> encode(sha256(convert_to(p_payload::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'Checkout request already used'; END IF;
  IF prior.result IS NOT NULL THEN RETURN prior.result; END IF;
  IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Invalid cart'; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    IF jsonb_typeof(entry->'quantity') IS DISTINCT FROM 'number' OR (entry->>'quantity') !~ '^[1-9][0-9]{0,2}$' THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
  END LOOP;
  IF length(coalesce(p_payload->>'mobilePhone','')) > 0 AND (p_payload->>'mobilePhone') !~ '^[0-9+[:space:]-]{9,15}$' THEN RAISE EXCEPTION 'Invalid mobile number'; END IF;
  IF length(coalesce(p_payload->>'promoCode','')) > 80 THEN RAISE EXCEPTION 'Invalid promotion'; END IF;
  receipt_path := nullif(p_payload->>'receiptPath','');
  IF p_payload->>'paymentMethod' = 'BANK_TRANSFER' THEN
    PERFORM 1 FROM public.checkout_receipts WHERE path=receipt_path AND request_id=p_request_id AND order_id IS NULL
      AND created_at > now() - interval '24 hours' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payment receipt is missing or expired'; END IF;
  ELSE receipt_path := NULL;
  END IF;
  SELECT to_jsonb(created) INTO response FROM public.create_order_with_notification_token(
    trim(p_payload->>'fullName'), trim(p_payload->>'phone'), nullif(trim(p_payload->>'mobilePhone'),''), p_payload->>'email',
    trim(p_payload->>'addressLine1'), nullif(trim(p_payload->>'addressLine2'),''), trim(p_payload->>'city'), trim(p_payload->>'district'),
    nullif(trim(p_payload->>'postalCode'),''), p_payload->>'paymentMethod', receipt_path, p_payload->'items', p_payload->>'promoCode'
  ) AS created;
  UPDATE public.checkout_requests SET result=response WHERE id=p_request_id;
  IF receipt_path IS NOT NULL THEN UPDATE public.checkout_receipts SET order_id=(response->>'order_id')::uuid WHERE path=receipt_path; END IF;
  RETURN response;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_checkout(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_checkout(uuid,jsonb) TO service_role;

COMMIT;
