import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Lock, Sparkles } from 'lucide-react';
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
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(17,17,17,0.12)_1px,transparent_0)] bg-[size:9px_9px] opacity-25 [mask-image:linear-gradient(90deg,black,transparent_45%,black)]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 top-20 h-64 w-64 rounded-full border-[28px] border-primary/5" />

      <div className="relative z-10 mx-auto max-w-7xl px-6">
        <motion.div
          className="mb-10 flex flex-col justify-between gap-6 sm:mb-12 sm:flex-row sm:items-end"
          initial={reduceMotion ? false : { opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
        >
          <div>
            <span className="inline-flex items-center gap-2 border border-primary/25 bg-background/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-primary shadow-[3px_3px_0_rgba(140,31,46,0.15)]">
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
              ComicCulture Presents
            </span>
            <h2 className="mt-4 font-display text-4xl uppercase leading-none tracking-wide text-foreground sm:text-5xl lg:text-6xl">
              Choose Your <span className="text-gradient-red">World</span>
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
              Every collection is a new chapter. Pick the one you want to wear.
            </p>
          </div>
          <p className="hidden shrink-0 items-center gap-2 pb-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted sm:flex">
            <span className="h-px w-8 bg-primary" />
            Swipe through the panels
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
              const cardClass = 'group relative block aspect-[4/5] w-full snap-start overflow-hidden border-2 border-foreground bg-foreground text-left shadow-[6px_6px_0_rgba(17,17,17,0.16)] transition-[box-shadow,border-color] duration-300 hover:border-primary hover:shadow-[10px_10px_0_rgba(140,31,46,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4';

              const cardContent = (
                <>
                  <div className="absolute inset-0 bg-[#242424]">
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
                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/70 via-50% to-black/20" />
                    <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(135deg,transparent_55%,rgba(140,31,46,0.34))] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  </div>

                  <div aria-hidden="true" className="pointer-events-none absolute inset-2 border border-white/40" />

                  <span className="absolute left-5 top-5 z-10 -rotate-3 border border-foreground bg-white px-2.5 py-1 font-display text-xs uppercase tracking-[0.16em] text-foreground shadow-[3px_3px_0_rgba(140,31,46,0.9)]">
                    CC · {String(index + 1).padStart(2, '0')}
                  </span>

                  <span className={`absolute right-5 top-5 z-10 inline-flex max-w-[55%] items-center gap-1.5 border border-white/50 bg-black/80 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-white backdrop-blur-sm ${!isLive ? 'text-white/90' : ''}`}>
                    {!isLive && <Lock aria-hidden="true" className="h-3 w-3 shrink-0" />}
                    <span className="truncate">{badgeText}</span>
                  </span>

                  <div aria-hidden="true" className="pointer-events-none absolute bottom-28 right-7 h-20 w-20 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.6)_1px,transparent_1.5px)] bg-[size:6px_6px] opacity-50 transition-transform duration-500 group-hover:scale-125" />

                  <div className="absolute inset-x-0 bottom-0 z-10 p-6 text-white sm:p-7">
                    <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.24em] text-white/65">
                      {isLive ? 'The next issue starts here' : 'Coming to the archive'}
                    </p>
                    <h3 className="line-clamp-2 font-display text-4xl uppercase leading-[0.92] tracking-wide drop-shadow sm:text-5xl">
                      {collection.name}
                    </h3>
                    <div className="mt-5 flex items-center justify-between border-t border-white/35 pt-3.5">
                      <span className="font-display text-sm uppercase tracking-[0.2em] text-white/80">
                        {isLive ? 'Open this world' : 'Stay tuned'}
                      </span>
                      <span className={`flex h-10 w-10 items-center justify-center border border-white/60 transition-all duration-300 ${isLive ? 'group-hover:rotate-45 group-hover:border-primary group-hover:bg-primary' : 'opacity-70'}`}>
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
                  initial={reduceMotion ? false : { opacity: 0, y: 34, rotate: index % 2 === 0 ? -1.5 : 1.5, scale: 0.97 }}
                  whileInView={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ delay: reduceMotion ? 0 : Math.min(index * 0.1, 0.3), duration: 0.55, ease: 'easeOut' }}
                  whileHover={reduceMotion ? undefined : { y: -8, rotate: index % 2 === 0 ? 0.7 : -0.7, scale: 1.015 }}
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
