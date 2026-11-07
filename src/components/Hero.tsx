import { useEffect, useState, type CSSProperties } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Pause, Play } from 'lucide-react';
import type { Collection } from '../data/collections';
import { HERO_ROTATION_INTERVAL_MS } from '../config/merchandising';

export default function Hero({ collections, loading = false }: { collections: Collection[]; loading?: boolean }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const reduceMotion = useReducedMotion();
  const slides = collections.filter(c => c.status === 'live' && c.homepageVisible)
    .sort((a, b) => a.homepageOrder - b.homepageOrder || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const active = Math.min(index, Math.max(slides.length - 1, 0));
  const current = slides[active];
  const count = slides.length;
  const desktop = [current?.bannerDesktop, current?.coverImage].find(url => url && !failed.includes(url));
  const mobile = current?.bannerMobile && !failed.includes(current.bannerMobile) ? current.bannerMobile : desktop;
  const move = (next: number) => { setPaused(true); setIndex((next + count) % count); };

  useEffect(() => {
    if (loading || reduceMotion || paused || hovered || count < 2) return;
    const timer = window.setTimeout(() => setIndex((active + 1) % count), HERO_ROTATION_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [active, count, loading, reduceMotion, paused, hovered]);

  return <section id="home" className="banner-hero overflow-hidden border-b border-border" aria-label="Featured collections" aria-roledescription="carousel" aria-busy={loading}
    onPointerEnter={e => { if (e.pointerType === 'mouse') setHovered(true); }} onPointerLeave={() => setHovered(false)}
    onFocusCapture={() => setPaused(true)} onKeyDown={e => { if (count > 1 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); move(active + (e.key === 'ArrowLeft' ? -1 : 1)); } }}>
    {(desktop || mobile) && <picture key={`${current?.id}-${desktop}-${mobile}`} style={{ '--banner-desktop-focus': current?.heroFocusDesktop || '50% 50%', '--banner-mobile-focus': current?.heroFocusMobile || '50% 50%' } as CSSProperties}>
      {mobile && <source media="(max-width: 767px)" srcSet={mobile} />}
      <img src={desktop || mobile || undefined} alt="" fetchPriority="high" decoding="async" onError={e => {
        const url = e.currentTarget.currentSrc;
        setFailed(previous => previous.includes(url) ? previous : [...previous, url]);
      }} />
    </picture>}
    <div className="banner-shade absolute inset-0" style={{ opacity: (current?.bannerOverlay ?? 55) / 100 }} />
    <div className="banner-copy">
      <div className="banner-text-protection max-w-2xl rounded-xl p-4 sm:p-6" aria-live={paused ? 'polite' : 'off'} aria-atomic="true">
        <p className="mb-3 text-sm font-semibold">{current?.tagline || 'Pick your universe'}</p>
        <h1 className="font-display text-white">{current?.name ?? 'Wear your universe.'}</h1>
        <p className="mt-4 text-sm leading-relaxed text-white sm:text-base">{current?.description || 'Fan-inspired designs, made for every day. Find the one that feels like you.'}</p>
        <Link to={current ? `/collections/${current.slug}` : '/shop'} className="btn-primary mt-6 inline-flex min-h-11 items-center gap-2 px-6 py-3 text-sm">
          {current ? 'Explore the collection' : 'Browse all designs'}<ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </div>
      {count > 1 && <div className="banner-text-protection mt-6 flex w-fit max-w-full flex-wrap items-center gap-3 rounded-xl p-2" aria-label="Slideshow controls">
        <button type="button" aria-label="Previous collection" onClick={() => move(active - 1)}><ArrowLeft aria-hidden="true" size={18} /></button>
        <span className="text-sm tabular-nums">{active + 1} / {count}</span>
        <button type="button" aria-label="Next collection" onClick={() => move(active + 1)}><ArrowRight aria-hidden="true" size={18} /></button>
        {!reduceMotion && <button type="button" aria-label={paused ? 'Resume automatic rotation' : 'Pause automatic rotation'} onClick={() => setPaused(p => !p)}>{paused ? <Play aria-hidden="true" size={16} /> : <Pause aria-hidden="true" size={16} />}</button>}
        <div className="flex max-w-full flex-wrap gap-1" aria-label="Choose collection">
          {slides.map((slide, i) => <button type="button" key={slide.id} aria-label={`Show ${slide.name}`} aria-current={i === active ? 'true' : undefined} onClick={() => move(i)}><span className={`h-2 w-2 rounded-full ${i === active ? 'bg-white' : 'bg-white/40'}`} /></button>)}
        </div>
      </div>}
    </div>
  </section>;
}
