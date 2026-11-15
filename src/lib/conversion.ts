import { supabase } from './supabase';

export const CONVERSION_CHOICE_KEY = 'comicculture-conversion-choice';
const SESSION_KEY = 'comicculture-conversion-session';
const SESSION_DURATION = 24 * 60 * 60 * 1000;
const ADMIN_SESSION_KEY = 'comicculture-admin-auth';
type Stage = 'view' | 'cart' | 'checkout';
interface Visit { id: string; expires: number }
let pending = Promise.resolve();
const attempted = new Set<string>();
let attemptedSession: string | undefined;

export function hasPrivacySignal(): boolean {
  const browser = navigator as Navigator & { globalPrivacyControl?: boolean };
  return browser.globalPrivacyControl === true || browser.doNotTrack === '1' || browser.doNotTrack === 'yes';
}

export function conversionEnabled(): boolean {
  try { return !hasPrivacySignal() && localStorage.getItem(CONVERSION_CHOICE_KEY) === 'on'; }
  catch { return false; }
}

export function setConversionEnabled(enabled: boolean): boolean {
  try {
    localStorage.setItem(CONVERSION_CHOICE_KEY, enabled && !hasPrivacySignal() ? 'on' : 'off');
    if (!conversionEnabled()) localStorage.removeItem(SESSION_KEY);
  } catch { return false; }
  return conversionEnabled();
}

function visit(create: boolean): Visit | undefined {
  try {
    if (!conversionEnabled() || location.pathname.startsWith('/admin') || localStorage.getItem(ADMIN_SESSION_KEY)) return;
    const previous = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Visit | null;
    const now = Date.now();
    if (previous && typeof previous.id === 'string' && previous.expires > now && previous.expires <= now + SESSION_DURATION) return previous;
    if (previous) localStorage.removeItem(SESSION_KEY);
    if (!create) return;
    const current = { id: crypto.randomUUID(), expires: now + SESSION_DURATION };
    localStorage.setItem(SESSION_KEY, JSON.stringify(current));
    return current;
  } catch { return; }
}

/** A checkout may use a pre-existing opt-in visit. Submission never creates one. */
export const getConversionSession = () => visit(false)?.id;

export function trackConversion(stage: Stage, productId?: string): void {
  const current = visit(true);
  if (!current) return;
  if (attemptedSession !== current.id) {
    attempted.clear();
    attemptedSession = current.id;
  }
  const event = stage + ':' + (productId ?? '');
  if (attempted.size >= 120 || attempted.has(event)) return;
  attempted.add(event);
  // Preserve event order within a tab without delaying clicks or checkout.
  pending = pending.then(async () => {
    if (getConversionSession() !== current.id) return;
    const device = typeof matchMedia !== 'function' ? 'unknown'
      : matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop';
    const { error } = await supabase.functions.invoke('checkout', {
      body: { action: 'analytics', input: { sessionId: current.id, stage, device, ...(productId ? { productId } : {}) } },
      signal: AbortSignal.timeout(3000),
    });
    if (error && attemptedSession === current.id) attempted.delete(event);
  }).catch(() => {
    if (attemptedSession === current.id) attempted.delete(event);
  });
}
