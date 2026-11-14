import { supabase } from '../lib/supabase';

export async function fetchDeliveryFee(signal: AbortSignal): Promise<number> {
  const { data, error } = await supabase.from('delivery_settings')
    .select('delivery_fee').abortSignal(signal).single();
  const fee: unknown = data?.delivery_fee;
  if (error || typeof fee !== 'number' || !Number.isFinite(fee) || fee < 0) {
    throw new Error('Delivery fee is unavailable.');
  }
  return fee;
}
