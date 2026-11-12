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
  const count = slides.length;
  const active = Math.min(index, Math.max(count - 1, 0));
  const current = slides[active];
  const desktop = [current?.bannerDesktop, current?.coverImage].find(
    (url): url is string => !!url && !failed.includes(url),
  );
  const mobile = current?.bannerMobile && !failed.includes(current.bannerMobile) ? current.bannerMobile : desktop;
  const hasArtwork = Boolean(desktop || mobile);
  const pause = () => setPaused(true);
  const move = (next: number) => {
    pause();
    setIndex((next + count) % count);
  };

  useEffect(() => {
    if (loading || reduceMotion || paused || hovered || count < 2) return;
    const timer = window.setTimeout(() => setIndex((active + 1) % count), HERO_ROTATION_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [active, count, loading, reduceMotion, paused, hovered]);

  return <section
    id="home"
    className="banner-hero overflow-hidden border-b border-border"
    aria-label="Featured collections"
    aria-roledescription="carousel"
    aria-busy={loading}
    onPointerEnter={e => { if (e.pointerType === 'mouse') setHovered(true); }}
    onPointerLeave={() => setHovered(false)}
    onKeyDown={e => {
      if (count > 1 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        move(active + (e.key === 'ArrowLeft' ? -1 : 1));
      }
    }}
  >
    {hasArtwork && <picture
      key={`${current?.id}-${desktop}-${mobile}`}
      style={{
        '--banner-desktop-focus': current?.heroFocusDesktop || '50% 50%',
        '--banner-mobile-focus': current?.heroFocusMobile || '50% 50%',
      } as CSSProperties}
    >
      {mobile && <source media="(max-width: 767px)" srcSet={mobile} />}
      <img
        src={desktop || mobile}
        alt=""
        fetchPriority="high"
        decoding="async"
        onError={e => {
          const { currentSrc, src } = e.currentTarget;
          const url = currentSrc && currentSrc !== src ? mobile : desktop || mobile;
          if (url) setFailed(previous => previous.includes(url) ? previous : [...previous, url]);
        }}
      />
    </picture>}
    <div className="banner-shade absolute inset-0" style={{ opacity: (current?.bannerOverlay ?? 55) / 100 }} />
    <div className="banner-foreground">
      <div className={hasArtwork ? 'sr-only' : 'mb-5 max-w-xl break-words'} aria-live={paused || reduceMotion ? 'polite' : 'off'} aria-atomic="true">
        <h1 className="font-display text-4xl sm:text-6xl">{current?.name ?? 'Wear your universe.'}</h1>
        {current?.tagline && <p className="mt-2 font-semibold">{current.tagline}</p>}
        <p className="mt-2 text-sm sm:text-base">{current?.description || 'Fan-inspired designs, made for every day. Find the one that feels like you.'}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-5">
        <Link
          to={current ? `/collections/${current.slug}` : '/shop'}
          className="btn-primary inline-flex items-center gap-2"
          aria-label={current ? `Explore the collection: ${current.name}` : undefined}
          onFocus={pause}
        >
          {current ? 'Explore the collection' : 'Browse all designs'}<ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
        </Link>
        {count > 1 && <div
          className="flex w-fit max-w-full flex-wrap items-center gap-2 rounded-full bg-foreground p-1 text-white"
          role="group"
          aria-label="Slideshow controls"
        >
          <button type="button" aria-label="Previous collection" onFocus={pause} onClick={() => move(active - 1)}>
            <ArrowLeft aria-hidden="true" size={18} />
          </button>
          <span className="whitespace-nowrap px-1 text-sm tabular-nums">{active + 1} / {count}</span>
          <button type="button" aria-label="Next collection" onFocus={pause} onClick={() => move(active + 1)}>
            <ArrowRight aria-hidden="true" size={18} />
          </button>
          {!reduceMotion && <button
            type="button"
            aria-label={paused ? 'Resume automatic rotation' : 'Pause automatic rotation'}
            onClick={() => setPaused(p => !p)}
          >
            {paused ? <Play aria-hidden="true" size={16} /> : <Pause aria-hidden="true" size={16} />}
          </button>}
        </div>}
      </div>
    </div>
  </section>;
}
