import { useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowRight, ShoppingBag } from 'lucide-react';
import CornerFrame from './CornerFrame';
import type { Collection } from '../data/collections';

interface HeroProps {
  collections: Collection[];
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
  headline: 'WEAR YOUR UNIVERSE',
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

export default function Hero({ collections }: HeroProps) {
  const reduceMotion = useReducedMotion();
  const slides: Slide[] = useMemo(() => {
    const live = collections.filter((collection) => collection.status === 'live' && collection.coverImage);
    if (live.length === 0) return [FALLBACK_SLIDE];
    return live.map((collection) => ({
      key: collection.id,
      label: collection.tagline || 'Now Live',
      headline: collection.name.toUpperCase(),
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
    <section id="home" className="relative min-h-[min(760px,100svh)] overflow-hidden bg-background pt-24 lg:min-h-[min(820px,100svh)] lg:pt-20">
      <div className="absolute inset-0 bg-web-pattern opacity-10" />

      <div className="absolute inset-0 lg:left-[40%]">
        <AnimatePresence mode="wait">
          {current.image && (
            <motion.img
              key={current.key}
              src={current.image}
              alt={`${current.headline} collection campaign`}
              fetchPriority="high"
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

      <CornerFrame className="hidden sm:block" />

      <div className="relative z-10 mx-auto flex min-h-[min(660px,calc(100svh-6rem))] max-w-7xl flex-col justify-end px-6 pb-16 pt-28 sm:justify-center sm:pb-20 lg:min-h-[min(740px,calc(100svh-5rem))] lg:px-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.key}
            className="max-w-2xl"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: reduceMotion ? 0 : 0.35 }}
          >
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-primary">
              <span className="h-px w-7 bg-primary" />
              {current.label}
            </p>
            <h1 className="mt-5 max-w-xl font-display text-5xl leading-[0.92] tracking-wide text-foreground sm:text-6xl md:text-7xl lg:text-8xl">
              {current.headline}
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
              {current.subline}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link to={current.ctaHref} className="btn-primary min-h-12">
                <ShoppingBag aria-hidden="true" className="h-4 w-4" />
                {current.ctaLabel}
              </Link>
              <Link to="/shop" className="inline-flex min-h-12 items-center gap-2 px-2 text-sm font-semibold text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-primary">
                Explore all designs
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="mt-12 flex items-center justify-between gap-4 sm:max-w-2xl">
          <div className="flex items-center gap-3" aria-label={multiSlide ? `Campaign ${index + 1} of ${slides.length}` : undefined}>
            {multiSlide ? slides.map((slide, slideIndex) => (
              <button
                key={slide.key}
                type="button"
                onClick={() => setIndex(slideIndex)}
                aria-label={`Show ${slide.headline} campaign`}
                aria-pressed={index === slideIndex}
                className={`h-1.5 rounded-full transition-all ${index === slideIndex ? 'w-10 bg-primary' : 'w-5 bg-foreground/20 hover:bg-foreground/40'}`}
              />
            )) : <span className="h-px w-10 bg-primary" />}
            <span className="ml-2 text-xs font-semibold tabular-nums tracking-[0.18em] text-muted">
              {String(index + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
            </span>
          </div>
          {multiSlide && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => moveSlide(-1)} aria-label="Previous campaign" className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/80 text-foreground transition-colors hover:border-primary hover:text-primary">
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => moveSlide(1)} aria-label="Next campaign" className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/80 text-foreground transition-colors hover:border-primary hover:text-primary">
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      <a href="#collections" className="absolute bottom-5 right-6 z-10 hidden items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted transition-colors hover:text-primary sm:inline-flex">
        Scroll to explore <ArrowDown aria-hidden="true" className="h-4 w-4" />
      </a>
    </section>
  );
}
