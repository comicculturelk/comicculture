import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Lock } from 'lucide-react';
import type { Collection } from '../data/collections';

interface CollectionsProps {
  collections: Collection[];
  loading: boolean;
  error: string | null;
}

// Home.tsx fetches collections itself and passes them in directly.
export default function Collections({ collections, loading, error }: CollectionsProps) {
  const reduceMotion = useReducedMotion();

  return (
    <section id="collections" className="comic-page relative isolate overflow-hidden border-y-2 border-foreground bg-white py-20 lg:py-28">
      <div className="relative z-10 mx-auto max-w-7xl px-6">
        <motion.div
          className="mb-10 flex flex-col justify-between gap-6 sm:mb-12 sm:flex-row sm:items-end"
          initial={reduceMotion ? false : { opacity: 0, y: 22 }}
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
          </div>
          <p className="hidden shrink-0 items-center gap-2 pb-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted sm:flex">
            Browse all collections
          </p>
        </motion.div>

        {loading && <p role="status" className="text-muted">Loading collections...</p>}

        {error && !loading && (
          <p role="alert" className="border-l-2 border-primary pl-4 text-primary">
            Couldn't load collections right now. Please refresh the page.
          </p>
        )}

        {!loading && !error && collections.length === 0 && (
          <p className="text-muted">No collections yet — check back soon.</p>
        )}

        {!loading && !error && collections.length > 0 && (
          <div className="-mx-6 grid grid-flow-col auto-cols-[min(82vw,340px)] gap-5 overflow-x-auto px-6 pb-7 snap-x snap-mandatory scroll-smooth [scrollbar-width:thin] sm:mx-0 sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
            {collections.map((collection, index) => {
              const isLive = collection.status === 'live';
              const badgeText = collection.tagline || (isLive ? 'Live Now' : 'Coming Soon');
              const cardClass = 'group relative block aspect-[4/5] w-full snap-start overflow-hidden rounded-2xl border border-border bg-surface text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4';

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
                        {isLive ? 'Shop collection' : 'Coming soon'}
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
                  className="snap-start"
                  initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
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
        )}

        <p className="mt-1 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-muted sm:hidden">
          Swipe to flip through collections
        </p>
      </div>
    </section>
  );
}
