import { ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { setConversionEnabled, useConversionChoice } from '../lib/conversion';

const choiceButton = 'min-h-11 rounded-lg border border-foreground/25 bg-surface px-2 py-2 text-sm font-semibold leading-tight text-foreground transition-colors hover:border-foreground hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:px-4';

export default function PrivacyConsentBanner({ placement = 'inline' }: { placement?: 'inline' | 'bottom' }) {
  const choice = useConversionChoice();
  if (choice !== 'unset') return null;

  const choose = (enabled: boolean) => {
    setConversionEnabled(enabled);
    document.getElementById('main-content')?.focus({ preventScroll: true });
  };

  return (
    <div className={placement === 'bottom'
      ? 'pointer-events-none sticky bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-[max(1rem,env(safe-area-inset-bottom))]'
      : 'mb-6'}>
      <section
        aria-labelledby="privacy-consent-title"
        aria-describedby="privacy-consent-description"
        className="pointer-events-auto mx-auto flex w-full max-w-4xl flex-col gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left shadow-soft sm:px-5 md:flex-row md:items-center md:gap-6"
      >
        <div className="min-w-0 flex-1">
          <h2 id="privacy-consent-title" className="flex items-center gap-2 text-base font-semibold leading-tight text-foreground">
            <ShieldCheck aria-hidden="true" className="size-5 shrink-0 text-primary" />
            Your privacy, your choice
          </h2>
          <p id="privacy-consent-description" className="mt-1.5 text-sm leading-snug text-muted-foreground">
            Essential browser storage keeps your cart working. With your permission, we use shopping analytics to improve checkout.{' '}
            <Link to="/privacy-policy" className="font-medium text-primary underline underline-offset-2 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Privacy policy</Link>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 md:w-[19rem] md:shrink-0">
          <button type="button" className={choiceButton} onClick={() => choose(false)}>Only necessary</button>
          <button type="button" className={choiceButton} onClick={() => choose(true)}>Allow analytics</button>
        </div>
      </section>
    </div>
  );
}
