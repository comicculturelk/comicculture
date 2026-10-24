import { useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowRight, ShoppingBag } from 'lucide-react';
import type { Collection } from '../data/collections';

interface HeroProps {
  collections: Collection[];
  loading?: boolean;
}

interface Slide {
  key: string;
  label: string;
  headline: string;
  subline: string;
  image: string | null;
  focusDesktop: string;
  focusMobile: string;
  ctaLabel: string;
  ctaHref: string;
}

const DEFAULT_HERO_FOCUS = '50% center';

const FALLBACK_SLIDE: Slide = {
  key: 'fallback',
  label: 'ComicCulture',
  headline: 'Wear your universe',
  subline: 'Wearable art for fans, in limited runs.',
  image: null,
  focusDesktop: DEFAULT_HERO_FOCUS,
  focusMobile: DEFAULT_HERO_FOCUS,
  ctaLabel: 'Shop All',
  ctaHref: '/shop',
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

export default function Hero({ collections, loading = false }: HeroProps) {
  const reduceMotion = useReducedMotion();
  const slides: Slide[] = useMemo(() => {
    const live = collections.filter((collection) => collection.status === 'live' && collection.coverImage);
    if (live.length === 0) return [FALLBACK_SLIDE];
    return live.map((collection) => ({
      key: collection.id,
      label: collection.tagline || 'Now Live',
      headline: collection.name,
      subline: collection.description ? truncate(collection.description, 90) : 'Shop the latest drop.',
      image: collection.coverImage,
      focusDesktop: collection.heroFocusDesktop || DEFAULT_HERO_FOCUS,
      focusMobile: collection.heroFocusMobile || DEFAULT_HERO_FOCUS,
      ctaLabel: 'Shop Collection',
      ctaHref: `/collections/${collection.slug}`,
    }));
  }, [collections]);

  const [index, setIndex] = useState(0);
  const current = slides[index] ?? FALLBACK_SLIDE;
  const multiSlide = slides.length > 1;

  const moveSlide = (direction: -1 | 1) => {
    setIndex((currentIndex) => (currentIndex + direction + slides.length) % slides.length);
  };

  return (
    <section id="home" className="comic-page home-hero relative min-h-[min(760px,100svh)] overflow-hidden border-b-4 border-foreground bg-background pt-24 lg:min-h-[min(820px,100svh)] lg:pt-20">

      <div className="absolute inset-0 bg-gradient-to-br from-surface via-background to-[#f0f2f5] lg:left-[40%]" aria-hidden="true">
        {loading && !current.image && (
          <div className="absolute inset-y-12 right-6 hidden w-[58%] overflow-hidden rounded-3xl bg-gradient-to-br from-slate-100 via-white to-slate-200 motion-safe:animate-pulse lg:block">
            <div className="absolute bottom-8 right-8 h-2/3 w-1/3 rounded-t-full bg-slate-200/70" />
            <div className="absolute bottom-0 left-8 h-1/2 w-1/3 rounded-t-full bg-slate-100" />
          </div>
        )}
        <AnimatePresence mode="wait">
          {current.image && (
            <motion.img
              key={current.key}
              src={current.image}
              alt={`${current.headline} collection campaign`}
              {...{ fetchpriority: 'high' }}
              className="h-full w-full object-cover object-[var(--hero-focus-mobile)] lg:object-[var(--hero-focus-desktop)]"
              style={{
                '--hero-focus-mobile': current.focusMobile,
                '--hero-focus-desktop': current.focusDesktop,
              } as React.CSSProperties}
              initial={reduceMotion ? false : { opacity: 0, scale: 1.015 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.45 }}
            />
          )}
        </AnimatePresence>
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/75 to-background/5 lg:bg-gradient-to-r lg:from-background lg:via-background/95 lg:via-35% lg:to-background/0" />
      </div>

      <div className="hero-content relative z-10 mx-auto flex min-h-[min(660px,calc(100svh-6rem))] max-w-7xl flex-col justify-end px-6 pb-16 pt-28 sm:justify-center sm:pb-20 lg:min-h-[min(740px,calc(100svh-5rem))] lg:px-10" aria-busy={loading}>
        <AnimatePresence mode="wait">
          <motion.div
            key={current.key}
            className="max-w-2xl"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: reduceMotion ? 0 : 0.35 }}
          >
            <p className="comic-caption mb-2">
              <span className="h-px w-7 bg-primary" />
              {loading ? 'ComicCulture' : current.label}
            </p>
            <h1 className="mt-5 max-w-xl font-display text-5xl leading-tight tracking-tight text-foreground sm:text-6xl md:text-7xl lg:text-7xl">
              {loading ? 'Wear your universe' : current.headline}
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
              {loading ? 'Discover thoughtfully made apparel for fans.' : current.subline}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link to={current.ctaHref} className="btn-primary min-h-12">
                <ShoppingBag aria-hidden="true" className="h-4 w-4" />
                {loading ? 'Shop All' : current.ctaLabel}
              </Link>
              {current.ctaHref !== '/shop' && <Link to="/shop" className="inline-flex min-h-12 items-center gap-2 px-2 text-sm font-semibold text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-primary">
                Explore all designs
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>}
            </div>
          </motion.div>
        </AnimatePresence>

        {!loading && <div className="mt-12 flex items-center justify-between gap-2 sm:gap-4 sm:max-w-2xl">
          <div className="flex items-center gap-1 sm:gap-3" aria-label={multiSlide ? `Campaign ${index + 1} of ${slides.length}` : undefined}>
            {multiSlide ? slides.map((slide, slideIndex) => (
              <button
                key={slide.key}
                type="button"
                onClick={() => setIndex(slideIndex)}
                aria-label={`Show ${slide.headline} campaign`}
                aria-pressed={index === slideIndex}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
              >
                <span aria-hidden="true" className={`h-1.5 rounded-full transition-all ${index === slideIndex ? 'w-10 bg-primary' : 'w-5 bg-foreground/20'}`} />
              </button>
            )) : <span className="h-px w-10 bg-primary" />}
            <span className="ml-2 text-xs font-semibold tabular-nums tracking-[0.18em] text-muted">
              {String(index + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
            </span>
          </div>
          {multiSlide && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => moveSlide(-1)} aria-label="Previous campaign" className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/80 text-foreground transition-colors hover:border-primary hover:text-primary">
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => moveSlide(1)} aria-label="Next campaign" className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/80 text-foreground transition-colors hover:border-primary hover:text-primary">
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>}
      </div>

      <a href="#collections" className="absolute bottom-5 right-6 z-10 hidden items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted transition-colors hover:text-primary sm:inline-flex">
        Scroll to explore <ArrowDown aria-hidden="true" className="h-4 w-4" />
      </a>
    </section>
  );
}
