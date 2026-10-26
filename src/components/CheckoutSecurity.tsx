import { useEffect, useRef, useState } from 'react';

interface Turnstile {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
}
declare global { interface Window { turnstile?: Turnstile } }

let scriptReady: Promise<void> | undefined;
function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  return scriptReady ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { scriptReady = undefined; script.remove(); reject(new Error('Security check unavailable')); };
    document.head.appendChild(script);
  });
}

export default function CheckoutSecurity({ attempt, onToken }: { attempt: number; onToken: (token: string | null) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  useEffect(() => {
    let cancelled = false;
    let widgetId: string | undefined;
    onToken(null);
    setFailed(false);
    if (!sitekey) { setFailed(true); return; }
    loadTurnstile().then(() => {
      if (cancelled || !element.current || !window.turnstile) return;
      widgetId = window.turnstile.render(element.current, {
        sitekey, action: 'checkout', size: element.current.clientWidth < 300 ? 'compact' : 'flexible',
        callback: (token: string) => { if (!cancelled) { onToken(token); setFailed(false); } },
        'expired-callback': () => { if (!cancelled) onToken(null); },
        'error-callback': () => { if (!cancelled) { onToken(null); setFailed(true); } },
      });
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; if (widgetId) window.turnstile?.remove(widgetId); };
  }, [attempt, onToken, sitekey]);
  return <div className="my-4 space-y-2">
    <div ref={element} />
    {failed && <p role="alert" className="text-sm text-primary">Security check unavailable. Refresh the page and try again.</p>}
  </div>;
}
