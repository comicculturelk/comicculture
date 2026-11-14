import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

export class CheckoutPricingError extends Error {
  constructor(readonly code: 'delivery_fee_changed' | 'order_total_changed') {
    super('Checkout pricing changed.');
  }
}

const REQUEST_KEY = 'comicculture-checkout-request';
export function getCheckoutRequestId(): string {
  const id = crypto.randomUUID();
  try {
    const stored = sessionStorage.getItem(REQUEST_KEY);
    if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stored)) return stored;
    sessionStorage.setItem(REQUEST_KEY, id);
  } catch { /* An in-memory request ID still protects retries when storage is blocked. */ }
  return id;
}
export function completeCheckout(): void {
  try { sessionStorage.removeItem(REQUEST_KEY); } catch { /* Storage may be disabled. */ }
}

export async function checkoutRequest<T>(action: 'order' | 'track' | 'promo', input: unknown, security?: { requestId: string; token: string }): Promise<T> {
  const { data, error } = await supabase.functions.invoke('checkout', { body: { action, input, ...security } });
  if (action === 'order' && error instanceof FunctionsHttpError && error.context.status === 409) {
    const body: unknown = await error.context.json().catch(() => null);
    if (body && typeof body === 'object' && 'code' in body &&
        (body.code === 'delivery_fee_changed' || body.code === 'order_total_changed')) {
      throw new CheckoutPricingError(body.code);
    }
  }
  if (error) throw new Error('Unable to process your request. Please try again.');
  return data as T;
}

export async function uploadCheckoutReceipt(file: File, requestId: string, token: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('checkout', {
    body: file,
    headers: { 'Content-Type': file.type, 'x-checkout-id': requestId, 'x-turnstile-token': token },
  });
  if (error || typeof data?.path !== 'string') throw new Error('Unable to upload receipt. Please try again.');
  return data.path;
}
