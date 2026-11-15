import { Link, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import SEO from '../components/SEO';
import PolicyContents from '../components/PolicyContents';
import { PRIVACY_SECTIONS, PRIVACY_UPDATED_ON } from '../config/privacy';
import { STORE_CONFIG } from '../config/store';
import { SITE_URL, STATIC_SEO } from '../lib/seo';
import { setConversionEnabled, useConversionChoice } from '../lib/conversion';

export default function Privacy() {
  const choice = useConversionChoice();
  const { hash, key } = useLocation();
  const preferenceRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (hash !== '#analytics-choice') return;
    preferenceRef.current?.scrollIntoView({ block: 'start' });
    preferenceRef.current?.focus({ preventScroll: true });
  }, [hash, key]);
  return (
    <section className="comic-page mx-auto max-w-3xl px-4 pb-16 pt-24 sm:px-6">
      <SEO {...STATIC_SEO['/privacy-policy']} canonical={`${SITE_URL}/privacy-policy`} />
      <Link to="/shop" className="inline-flex min-h-11 items-center text-sm text-muted">← Back to shop</Link>
      <h1 className="mt-4 font-display text-4xl">Privacy policy</h1>
      <p className="mb-6 mt-3 text-sm text-muted">Last updated: {PRIVACY_UPDATED_ON}</p>
      <PolicyContents sections={PRIVACY_SECTIONS} prefix="privacy" />
      <section ref={preferenceRef} id="analytics-choice" tabIndex={-1} aria-labelledby="analytics-choice-title" className="my-5 rounded-xl border border-border bg-surface p-5">
        <h2 id="analytics-choice-title" className="text-lg font-semibold">Checkout analytics preference</h2>
        <p id="analytics-choice-description" className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Optional. Help us understand where shoppers leave checkout. Your choice does not affect shopping or ordering.
          {choice === 'privacy-signal' && ' Analytics is off because your browser sends a privacy signal.'}
          {choice === 'unavailable' && ' Analytics is off because your browser could not store this preference.'}
        </p>
        <label className="mt-3 inline-flex min-h-11 items-center gap-3 text-sm font-medium">
          <input type="checkbox" checked={choice === 'on'} disabled={choice === 'privacy-signal' || choice === 'unavailable'} aria-describedby="analytics-choice-description"
            onChange={(event) => setConversionEnabled(event.target.checked)} className="size-5 accent-primary" />
          Allow checkout analytics
        </label>
      </section>
      <div className="space-y-8 rounded-2xl border border-border bg-surface p-5 sm:p-8">
        {PRIVACY_SECTIONS.map((section, index) => (
          <section key={section.title} id={`privacy-${index}`} className="scroll-mt-24">
            <h2 className="text-lg font-semibold">{section.title}</h2>
            {section.paragraphs.map((paragraph) => <p key={paragraph} className="mt-3 text-sm leading-relaxed text-muted-foreground">{paragraph}</p>)}
          </section>
        ))}
        <div className="border-t border-border pt-5">
          <h2 className="text-lg font-semibold">Contact ComicCulture about privacy</h2>
          <a href={`mailto:${STORE_CONFIG.supportEmail}?subject=Privacy%20request`} className="inline-flex min-h-11 break-all items-center text-sm font-medium text-primary underline underline-offset-4">{STORE_CONFIG.supportEmail}</a>
          <p className="mt-2 text-sm text-muted-foreground">Colombo, Sri Lanka · <a href="https://www.dpa.gov.lk/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Data Protection Authority</a></p>
        </div>
      </div>
    </section>
  );
}
