-- Run separately after the conversion migration with Supabase Cron enabled.
SELECT cron.schedule('checkout-conversion-retention', '23 * * * *',
  'SELECT public.prune_checkout_conversion();');
