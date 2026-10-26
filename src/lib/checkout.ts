import { supabase } from './supabase';

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
