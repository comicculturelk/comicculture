import { useEffect, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Pause, Play, Sparkles } from 'lucide-react';
import type { Collection } from '../data/collections';
import { isProductAvailable, type Product } from '../data/products';
import { HERO_ROTATION_INTERVAL_MS } from '../config/merchandising';

interface HeroProps { collections: Collection[]; products: Product[]; loading?: boolean }
const HERO_TRANSITION = { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const };

export default function Hero({ collections, products, loading = false }: HeroProps) {
  const [index, setIndex] = useState(0);
  const [rotationPaused, setRotationPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const reduceMotion = useReducedMotion();
  // Preserve catalog order and every published design, including sold-out ones.
  const slides = collections.filter((collection) => collection.status === 'live').map((collection) => ({
    ...collection,
    products: products.filter((product) => product.collectionId === collection.id
      && product.versions.some((version) => version.isActive && version.sizes.length > 0)),
  })).filter((collection) => collection.products.length > 0);
  const currentIndex = Math.min(index, Math.max(slides.length - 1, 0));
  const current = slides[currentIndex];
  const slideCount = slides.length;

  useEffect(() => {
    if (loading || reduceMotion || rotationPaused || hovered || slideCount < 2) return;
    const timeout = window.setTimeout(() => setIndex((currentIndex + 1) % slideCount), HERO_ROTATION_INTERVAL_MS);
    return () => window.clearTimeout(timeout);
  }, [currentIndex, slideCount, loading, reduceMotion, rotationPaused, hovered]);

  return (
    <section id="home" aria-label="Featured collections" className="launch-hero overflow-hidden border-b border-border bg-surface">
      <div className="mx-auto grid max-w-7xl items-center gap-6 px-4 pb-8 pt-24 sm:px-6 sm:pb-12 sm:pt-28 lg:grid-cols-[0.8fr_1.4fr] lg:gap-8 lg:py-28">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary"><Sparkles aria-hidden="true" className="h-4 w-4" /> Pick your universe</p>
          <div className="mt-3 grid items-start sm:min-h-48 lg:items-center">
            <AnimatePresence initial={false} mode="wait">
              <motion.div key={current?.id ?? 'loading'}
                initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
                transition={reduceMotion ? { duration: 0 } : HERO_TRANSITION}>
                <h1 className="font-display text-4xl leading-tight text-foreground sm:text-5xl lg:text-6xl">{current?.name ?? 'Wear your universe.'}</h1>
                <p className="mt-3 hidden max-w-md text-sm leading-relaxed text-muted-foreground sm:block sm:text-base">{current?.description || 'Fan-inspired designs, made for every day. Find the one that feels like you.'}</p>
                <Link to={current ? `/collections/${current.slug}` : '/shop'} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline">
                  {current ? current.products.length === 1 ? 'Explore the collection' : `Explore all ${current.products.length} designs` : 'Browse all designs'}<ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </motion.div>
            </AnimatePresence>
          </div>
          {slideCount > 1 && <div className="mt-3 flex max-w-xs items-center justify-between gap-3 lg:mt-6">
            <p aria-live="off" className="whitespace-nowrap text-xs tabular-nums text-muted">{currentIndex + 1} / {slideCount} · Collections</p>
            <div className="flex shrink-0 gap-2">
              {!reduceMotion && <button type="button" aria-label={rotationPaused ? 'Resume automatic rotation' : 'Pause automatic rotation'} className="icon-button border border-border" onClick={() => setRotationPaused((paused) => !paused)}>
                {rotationPaused ? <Play aria-hidden="true" className="h-4 w-4" /> : <Pause aria-hidden="true" className="h-4 w-4" />}
              </button>}
              <button type="button" aria-label="Previous collection" className="icon-button border border-border" onClick={() => setIndex((currentIndex - 1 + slideCount) % slideCount)}><ArrowLeft aria-hidden="true" className="h-4 w-4" /></button>
              <button type="button" aria-label="Next collection" className="icon-button border border-border" onClick={() => setIndex((currentIndex + 1) % slideCount)}><ArrowRight aria-hidden="true" className="h-4 w-4" /></button>
            </div>
          </div>}
        </div>

        <div className="min-w-0" aria-busy={loading}
          onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHovered(true); }} onPointerLeave={() => setHovered(false)}
          onFocusCapture={() => setRotationPaused(true)}>
          {loading && !current && <div className="h-80 animate-pulse rounded-2xl bg-background" />}
          <AnimatePresence initial={false} mode="wait">
            {current && <motion.div key={current.id}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : 8, pointerEvents: 'none' }}
              transition={reduceMotion ? { duration: 0 } : HERO_TRANSITION}>
              <ul aria-label={`${current.name} products`} className="collection-deck" data-count={current.products.length} data-fanned={current.products.length <= 6}>
                {current.products.map((product, productIndex) => (
                  <li key={product.id} className="collection-deck-slot" style={{ '--card-offset': productIndex - (current.products.length - 1) / 2, '--card-order': productIndex } as CSSProperties}>
                    <Link to={`/product/${product.slug}`} className="collection-deck-card" aria-label={`Explore ${product.name}`}>
                      <div className="flex items-center justify-between px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
                        <span>ComicCulture</span><span>{String(productIndex + 1).padStart(2, '0')}</span>
                      </div>
                      <div className="relative mx-2 overflow-hidden rounded-lg bg-background">
                        <img src={product.image} alt={product.name} loading={currentIndex === 0 ? 'eager' : 'lazy'} className="aspect-[3/4] w-full object-cover object-top" />
                        {!isProductAvailable(product) && <span className="absolute bottom-2 left-2 rounded-full bg-white/95 px-2 py-1 text-[10px] font-semibold text-muted-foreground">Sold out</span>}
                      </div>
                      <div className="flex min-h-20 items-center justify-between gap-2 px-3 py-3">
                        <h2 className="font-display text-lg leading-tight text-foreground">{product.name}</h2>
                        <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-center text-xs text-muted-foreground lg:mt-0">{current.products.length > 1 && <span className="lg:hidden">Swipe to explore · </span>}Tap a card to discover the design</p>
            </motion.div>}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
