import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowDown, ShoppingBag } from 'lucide-react';
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
  ctaLabel: string;
  ctaHref: string;
}

const AUTOPLAY_MS = 5000;

// Used only when there are no live collections with a cover image yet —
// keeps the hero from breaking rather than inventing fake collection data.
const FALLBACK_SLIDE: Slide = {
  key: 'fallback',
  label: 'ComicCulture',
  headline: 'WEAR YOUR UNIVERSE',
  subline: 'Wearable art for fans, in limited runs.',
  image: null,
  ctaLabel: 'Shop All',
  ctaHref: '/shop',
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

export default function Hero({ collections }: HeroProps) {
  const { scrollY } = useScroll();
  const opacity = useTransform(scrollY, [0, 300], [1, 0]);

  const slides: Slide[] = useMemo(() => {
    const live = collections.filter((c) => c.status === 'live' && c.coverImage);
    if (live.length === 0) return [FALLBACK_SLIDE];
    return live.map((c) => ({
      key: c.id,
      label: c.tagline || 'Now Live',
      headline: c.name.toUpperCase(),
      subline: c.description ? truncate(c.description, 90) : 'Shop the latest drop.',
      image: c.coverImage,
      ctaLabel: 'Shop Collection',
      ctaHref: `/collections/${c.slug}`,
    }));
  }, [collections]);

  const [index, setIndex] = useState(0);

  // Reset to the first slide whenever the live collection set changes size
  // (e.g. once the async fetch resolves) so we never land on a stale index.
  useEffect(() => {
    setIndex(0);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [slides.length]);

  const current = slides[index] ?? FALLBACK_SLIDE;
  const isMultiSlide = slides.length > 1;

  return (
    <section id="home" className="relative min-h-screen overflow-hidden">
      {/* Base background */}
      <div className="absolute inset-0 bg-background">
        <div className="absolute inset-0 halftone-overlay opacity-30" />
        <motion.div
          className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/15 blur-3xl"
          animate={{ opacity: [0.3, 0.45, 0.3] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Slide image */}
      <div className="absolute inset-0">
        <AnimatePresence mode="wait">
          {current.image && (
            <motion.img
              key={current.key}
              src={current.image}
              alt={current.headline}
              className="h-full w-full object-cover"
              initial={{ opacity: 0, scale: 1.03 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1 }}
            />
          )}
        </AnimatePresence>
        {current.image && (
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/20" />
        )}
      </div>

      {/* Masthead */}
      <motion.div
        className="absolute top-20 2xl:top-6 left-0 right-0 z-10 hidden items-center justify-between px-8 sm:flex"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.6 }}
      >
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-foreground/40">
          ComicCulture Presents
        </span>
        {isMultiSlide && (
          <span
            className="text-xs font-semibold uppercase tracking-[0.3em] text-foreground/40"
            aria-live="polite"
          >
            {String(index + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
          </span>
        )}
      </motion.div>

      <CornerFrame className="hidden sm:block" />

      {/* Content */}
      <motion.div
        className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center"
        style={{ opacity }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={current.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block text-xs font-semibold uppercase tracking-[0.3em] text-primary">
              {current.label}
            </span>

            <h1 className="mt-4 font-display text-center text-6xl sm:text-7xl md:text-8xl tracking-wider leading-none text-foreground">
              {current.headline}
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-balance text-lg md:text-xl text-muted">
              {current.subline}
            </p>

            <div className="mt-10 flex justify-center">
              <Link to={current.ctaHref} className="btn-primary">
                <ShoppingBag className="h-5 w-5" />
                {current.ctaLabel}
              </Link>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Slide indicators */}
        {isMultiSlide && (
          <div className="mt-12 flex items-center gap-2" role="tablist" aria-label="Hero slides">
            {slides.map((slide, i) => (
              <button
                key={slide.key}
                role="tab"
                onClick={() => setIndex(i)}
                aria-label={`Show slide ${i + 1}: ${slide.headline}`}
                aria-selected={i === index}
                tabIndex={i === index ? 0 : -1}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-8 bg-primary' : 'w-1.5 bg-foreground/20'
                }`}
              />
            ))}
          </div>
        )}

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4 }}
        >
          <span className="text-xs uppercase tracking-widest text-muted">Scroll</span>
          <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
            <ArrowDown className="h-5 w-5 text-muted" />
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
}
