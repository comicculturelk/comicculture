import { motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import type { Collection } from '../data/collections';
import { useMediaQuery } from '../hooks/useMediaQuery';

interface CollectionsProps {
  collections: Collection[];
  loading: boolean;
  error: string | null;
}

// Home.tsx fetches collections itself and passes them in directly.
export default function Collections({ collections, loading, error }: CollectionsProps) {
  const reduceMotion = useReducedMotion();
  const isMobile = useMediaQuery('(max-width: 639px)');
  const carouselRef = useRef<HTMLDivElement>(null);
  const carouselId = useId();
  const [activeIndex, setActiveIndex] = useState(0);
  const currentIndex = Math.min(activeIndex, Math.max(collections.length - 1, 0));
  const hasMoreCollections = collections.length > 1;

  const updateActiveIndex = useCallback(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const cards = Array.from(carousel.children) as HTMLElement[];
    const start = cards[0]?.offsetLeft ?? 0;
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    cards.forEach((card, index) => {
      const distance = Math.abs(card.offsetLeft - start - carousel.scrollLeft);
      if (distance < nearestDistance) {
        nearestIndex = index;
        nearestDistance = distance;
      }
    });
    setActiveIndex(nearestIndex);
  }, []);

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const observer = new ResizeObserver(updateActiveIndex);
    observer.observe(carousel);
    updateActiveIndex();
    return () => observer.disconnect();
  }, [collections.length, loading, error, updateActiveIndex]);

  const showCollection = (index: number) => {
    const carousel = carouselRef.current;
    const first = carousel?.children[0] as HTMLElement | undefined;
    const card = carousel?.children[index] as HTMLElement | undefined;
    if (!carousel || !first || !card) return;
    carousel.scrollTo({
      left: card.offsetLeft - first.offsetLeft,
      behavior: reduceMotion ? 'instant' : 'smooth',
    });
  };

  return (
    <section id="collections" className="comic-page relative isolate overflow-hidden border-y-2 border-foreground bg-white py-12 sm:py-20 lg:py-28">
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          className="mb-6 flex flex-col justify-between gap-6 sm:mb-12 sm:flex-row sm:items-end"
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
        >
          <div>
            <h2 className="mt-4 font-display text-4xl leading-tight tracking-wide text-foreground sm:text-5xl lg:text-6xl">
              Choose your <span className="text-gradient-red">collection</span>
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
              Discover the designs and stories behind each collection.
            </p>
            {!loading && !error && hasMoreCollections && (
              <p className="mt-3 flex items-center gap-2 text-sm font-medium text-muted sm:hidden">
                Swipe to explore all {collections.length} collections
                <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
              </p>
            )}
          </div>
          <p className="hidden shrink-0 items-center gap-2 pb-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted sm:flex">
            Browse all collections
          </p>
        </motion.div>

        {loading && (
          <div role="status" aria-label="Loading collections" className="collection-carousel grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="aspect-[4/5] animate-pulse rounded-2xl border border-border bg-slate-100" />
            ))}
          </div>
        )}

        {error && !loading && (
          <p role="alert" className="border-l-2 border-primary pl-4 text-primary">
            Couldn't load collections right now. Please refresh the page.
          </p>
        )}

        {!loading && !error && collections.length === 0 && (
          <p className="text-muted">No collections yet — check back soon.</p>
        )}

        {!loading && !error && collections.length > 0 && (
          <>
            <div
              ref={carouselRef}
              id={carouselId}
              role="region"
              aria-label="Collections"
              data-single={collections.length === 1 || undefined}
              onScroll={updateActiveIndex}
              className="collection-carousel relative grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
            >
              {collections.map((collection, index) => {
                const isLive = collection.status === 'live';
                const badgeText = collection.tagline || (isLive ? 'Live Now' : 'Coming Soon');
                const cardClass = 'group relative block aspect-[4/5] w-full overflow-hidden rounded-2xl border border-border bg-surface text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4';

                const cardContent = (
                  <>
                    <div className="absolute inset-0 bg-surface">
                      {collection.coverImage ? (
                        <motion.img
                          src={collection.coverImage}
                          alt=""
                          style={{ objectPosition: collection.cardFocus || '50% 38%' }}
                          loading="lazy"
                          className={`h-full w-full object-cover ${isLive ? '' : 'grayscale opacity-60'}`}
                          whileHover={reduceMotion ? undefined : { scale: 1.07 }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                        />
                      ) : (
                        <div className="halftone-overlay h-full w-full opacity-30" />
                      )}
                    </div>

                    <div aria-hidden="true" className="pointer-events-none absolute inset-2 border border-foreground/10" />

                    <span className="absolute left-5 top-5 z-10 rounded-full border border-border bg-white/95 px-3 py-1 font-sans text-xs font-semibold text-foreground shadow-sm">
                      {String(index + 1).padStart(2, '0')}
                    </span>

                    <span className="absolute right-5 top-5 z-10 inline-flex max-w-[55%] items-center gap-1.5 rounded-full border border-border bg-white/95 px-3 py-1.5 text-[10px] font-semibold text-foreground shadow-sm">
                      {!isLive && <Lock aria-hidden="true" className="h-3 w-3 shrink-0 text-muted-foreground" />}
                      <span className="truncate">{badgeText}</span>
                    </span>

                    <div className="absolute inset-x-0 bottom-0 z-10 border-t border-border bg-white/95 p-5 text-foreground sm:p-6">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">
                        {isLive ? 'Explore collection' : 'Coming soon'}
                      </p>
                      <h3 className="line-clamp-2 font-display text-3xl leading-tight tracking-tight sm:text-4xl">
                        {collection.name}
                      </h3>
                      <div className="mt-4 flex items-center justify-between border-t border-border pt-3.5">
                        <span className="font-sans text-sm font-medium text-foreground">
                          {isLive ? 'Shop collection' : <a href="https://instagram.com/comicculture.lk" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">Follow for launch updates</a>}
                        </span>
                        <span className={`flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground transition-all duration-200 ${isLive ? 'group-hover:border-primary group-hover:bg-primary/5 group-hover:text-primary' : 'opacity-70'}`}>
                          {isLive ? <ArrowUpRight aria-hidden="true" className="h-5 w-5" /> : <Lock aria-hidden="true" className="h-4 w-4" />}
                        </span>
                      </div>
                    </div>
                  </>
                );

                return (
                  <motion.article
                    key={collection.id}
                    className="min-w-0 snap-start snap-always"
                    initial={false}
                    animate={isMobile ? { opacity: 1, y: 0 } : undefined}
                    whileInView={isMobile ? undefined : { opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.2 }}
                    transition={{ delay: reduceMotion ? 0 : Math.min(index * 0.06, 0.18), duration: 0.35, ease: 'easeOut' }}
                  >
                    {isLive ? (
                      <Link to={`/collections/${collection.slug}`} className={cardClass}>
                        {cardContent}
                      </Link>
                    ) : (
                      <div className={`${cardClass} cursor-default`} aria-label={`${collection.name}, coming soon`}>
                        {cardContent}
                      </div>
                    )}
                  </motion.article>
                );
              })}
            </div>
            {hasMoreCollections && (
              <div className="mt-2 flex items-center justify-between gap-4 sm:hidden">
                <p role="status" aria-live="polite" aria-atomic="true" className="text-sm tabular-nums text-muted">
                  <span className="font-semibold text-foreground">{currentIndex + 1}</span> of {collections.length} collections
                </p>
                <div className="flex gap-2">
                  <button type="button" aria-label="Previous collection" aria-controls={carouselId}
                    disabled={currentIndex === 0} onClick={() => showCollection(currentIndex - 1)}
                    className="icon-button border border-border bg-surface text-foreground disabled:cursor-not-allowed disabled:opacity-35">
                    <ChevronLeft aria-hidden="true" className="h-5 w-5" />
                  </button>
                  <button type="button" aria-label="Next collection" aria-controls={carouselId}
                    disabled={currentIndex === collections.length - 1} onClick={() => showCollection(currentIndex + 1)}
                    className="icon-button border border-border bg-surface text-foreground disabled:cursor-not-allowed disabled:opacity-35">
                    <ChevronRight aria-hidden="true" className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
