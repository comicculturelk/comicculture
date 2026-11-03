import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Pause, Play } from 'lucide-react';
import type { Collection } from '../data/collections';
import { isProductAvailable, type Product } from '../data/products';
import { FEATURED_LAUNCH, HERO_ROTATION_INTERVAL_MS } from '../config/merchandising';
import { getProductImages, getProductSummary, isNewProduct } from '../lib/merchandising';

interface HeroProps { collections: Collection[]; products: Product[]; loading?: boolean }

const HERO_TRANSITION = { duration: 0.85, ease: [0.22, 1, 0.36, 1] as const };

export default function Hero({ collections, products, loading = false }: HeroProps) {
  const [index, setIndex] = useState(0);
  const [rotationPaused, setRotationPaused] = useState(false);
  const reduceMotion = useReducedMotion();
  const available = products.filter(isProductAvailable);
  const launch = [...available].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).find((product) => product.featured)
    ?? available.find((product) => product.slug === FEATURED_LAUNCH.productSlug) ?? available[0];
  const otherCollections = collections.filter((collection) => collection.status === 'live'
    && collection.coverImage && collection.id !== launch?.collectionId
    && available.some((product) => product.collectionId === collection.id));
  const slides = [
    ...(launch ? [{
      key: launch.id, title: launch.name,
      label: isNewProduct(launch) ? 'New drop' : 'Featured design',
      summary: launch.slug === FEATURED_LAUNCH.productSlug ? FEATURED_LAUNCH.summary : getProductSummary(launch),
      image: launch.image,
      detail: launch.slug === FEATURED_LAUNCH.productSlug && FEATURED_LAUNCH.detailImageIndex !== undefined
        ? getProductImages(launch)[FEATURED_LAUNCH.detailImageIndex] : undefined,
      href: `/product/${launch.slug}`, cta: 'Explore this design',
    }] : []),
    ...otherCollections.map((collection) => {
      const designs = available.filter((product) => product.collectionId === collection.id);
      return { key: collection.id, title: collection.name, label: 'Explore the collection',
        summary: collection.description || `${designs.length} available ${designs.length === 1 ? 'design' : 'designs'} to explore.`,
        image: designs[0]?.image || collection.coverImage, detail: undefined,
        href: designs.length === 1 ? `/product/${designs[0].slug}` : `/collections/${collection.slug}`, cta: 'Explore the designs' };
    }),
  ];
  const currentIndex = Math.min(index, Math.max(slides.length - 1, 0));
  const current = slides[currentIndex];
  const slideCount = slides.length;

  useEffect(() => {
    if (loading || reduceMotion || rotationPaused || slideCount < 2) return;

    // Restart the countdown after either an automatic or manual slide change.
    const timeout = window.setTimeout(() => {
      setIndex((currentIndex + 1) % slideCount);
    }, HERO_ROTATION_INTERVAL_MS);
    return () => window.clearTimeout(timeout);
  }, [currentIndex, slideCount, loading, reduceMotion, rotationPaused]);

  return (
    <section id="home" className="launch-hero border-b border-border bg-surface">
      <div className="mx-auto grid max-w-7xl items-center gap-6 px-4 pb-8 pt-20 sm:px-6 sm:pb-12 sm:pt-24 md:grid-cols-2 md:gap-8 lg:gap-12 lg:py-28">
        <div aria-busy={loading} className="launch-visual relative aspect-[4/3] overflow-hidden rounded-2xl bg-background sm:aspect-[5/4] md:order-2">
          {/* Keep the photos mounted so each incoming slide is already loaded. */}
          {slides.map((slide, slideIndex) => (
            <motion.div
              key={slide.key}
              aria-hidden={slideIndex !== currentIndex}
              className="pointer-events-none absolute inset-0"
              style={{ zIndex: slideIndex === currentIndex ? 1 : 0 }}
              initial={false}
              animate={{ opacity: slideIndex === currentIndex ? 1 : 0, scale: reduceMotion || slideIndex === currentIndex ? 1 : 1.04 }}
              transition={reduceMotion ? { duration: 0 } : HERO_TRANSITION}
            >
              <img src={slide.image ?? undefined} alt={`${slide.title} on a model`} loading="eager" {...{ fetchpriority: slideIndex === 0 ? 'high' : 'low' }} className="h-full w-full object-cover object-top" />
              {slide.detail && <div className="absolute bottom-3 right-3 w-20 overflow-hidden rounded-xl border-2 border-white bg-black shadow-sm sm:w-24 lg:w-32">
                <img src={slide.detail} alt={FEATURED_LAUNCH.detailLabel ?? 'Product detail'} className="aspect-square w-full object-cover" />
                <p className="px-2 py-1.5 text-center text-[10px] font-medium text-white">{FEATURED_LAUNCH.detailCaption ?? 'Detail'}</p>
              </div>}
            </motion.div>
          ))}
        </div>
        <div className="min-w-0 md:order-1">
          <div className="grid min-h-[14rem] items-start sm:min-h-[18rem] sm:items-center lg:min-h-[20rem]">
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                key={current?.key ?? 'loading'}
                initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
                transition={reduceMotion ? { duration: 0 } : { ...HERO_TRANSITION, duration: 0.3 }}
              >
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">{loading && !current ? 'ComicCulture' : current?.label ?? 'Wear your universe'}</p>
                <h1 className="mt-3 font-display text-4xl leading-tight text-foreground sm:text-5xl lg:text-6xl">{current?.title ?? 'Fan culture, made for every day.'}</h1>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">{current?.summary ?? 'Explore fan-inspired T-shirts and jerseys from Sri Lanka.'}</p>
                <Link to={current?.href ?? '/shop'} className="btn-primary mt-5 min-h-12">{current?.cta ?? 'Browse all designs'}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
              </motion.div>
            </AnimatePresence>
          </div>
          {slides.length > 1 && <div className="mt-5 flex max-w-xs items-center justify-between gap-4">
            <p aria-live="off" className="whitespace-nowrap text-xs tabular-nums text-muted">{currentIndex + 1} / {slides.length} · <span className="hidden sm:inline">Featured </span><span className="sm:lowercase">Collections</span></p>
            <div className="flex shrink-0 gap-2">
              {!reduceMotion && <button type="button" aria-label={rotationPaused ? 'Resume automatic rotation' : 'Pause automatic rotation'} className="icon-button border border-border" onClick={() => setRotationPaused((paused) => !paused)}>
                {rotationPaused ? <Play aria-hidden="true" className="h-4 w-4" /> : <Pause aria-hidden="true" className="h-4 w-4" />}
              </button>}
              <button type="button" aria-label="Previous campaign" className="icon-button border border-border" onClick={() => setIndex((currentIndex - 1 + slides.length) % slides.length)}><ArrowLeft aria-hidden="true" className="h-4 w-4" /></button>
              <button type="button" aria-label="Next campaign" className="icon-button border border-border" onClick={() => setIndex((currentIndex + 1) % slides.length)}><ArrowRight aria-hidden="true" className="h-4 w-4" /></button>
            </div>
          </div>}
        </div>
      </div>
    </section>
  );
}
