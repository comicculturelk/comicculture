import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Lock, ArrowUpRight } from 'lucide-react';
import { fetchCollections, type Collection } from '../data/collections';

interface CollectionsProps {
  collections?: Collection[];
  loading?: boolean;
  error?: string | null;
}

// Props are optional so this stays compatible with callers that render
// <Collections /> with no data (e.g. Shop.tsx) — it self-fetches in that
// case, same as it did before the homepage redesign. Callers that already
// fetch collections themselves (e.g. Home.tsx) can pass them in directly
// to avoid a duplicate request.
export default function Collections({
  collections: collectionsProp,
  loading: loadingProp,
  error: errorProp,
}: CollectionsProps) {
  const isControlled = collectionsProp !== undefined;

  const [selfCollections, setSelfCollections] = useState<Collection[]>([]);
  const [selfLoading, setSelfLoading] = useState(true);
  const [selfError, setSelfError] = useState<string | null>(null);

  useEffect(() => {
    if (isControlled) return;

    let cancelled = false;

    fetchCollections()
      .then((data) => {
        if (!cancelled) {
          setSelfCollections(data);
          setSelfLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setSelfError(err.message);
          setSelfLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isControlled]);

  const collections = isControlled ? collectionsProp : selfCollections;
  const loading = isControlled ? loadingProp ?? false : selfLoading;
  const error = isControlled ? errorProp ?? null : selfError;

  return (
    <section id="collections" className="relative py-20 lg:py-28">
      <div className="absolute inset-0 bg-background">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-6">
        <div className="mb-10">
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
            Shop By Collection
          </span>
          <h2 className="mt-3 font-display text-3xl md:text-4xl text-foreground tracking-wide">
            Choose Your World
          </h2>
        </div>

        {loading && <p className="text-muted">Loading collections...</p>}

        {error && !loading && (
          <p className="text-primary">
            Couldn't load collections right now. Please refresh the page.
          </p>
        )}

        {!loading && !error && collections.length === 0 && (
          <p className="text-muted">No collections yet — check back soon.</p>
        )}

        {!loading && !error && collections.length > 0 && (
          <div className="flex gap-5 overflow-x-auto pb-4 -mx-6 px-6 snap-x snap-mandatory scroll-smooth">
            {collections.map((collection, index) => {
              const isLive = collection.status === 'live';
              const cardClasses = `group relative flex aspect-[3/4] w-[240px] sm:w-[280px] shrink-0 snap-start flex-col justify-end overflow-hidden border border-foreground/10 ${
                isLive ? 'cursor-pointer' : 'cursor-default'
              }`;
              const badgeText = collection.tagline || (isLive ? 'Live Now' : 'Coming Soon');

              const content = (
                <>
                  <div className="absolute inset-0 bg-surface">
                    {collection.coverImage && (
                      <img
                        src={collection.coverImage}
                        alt={collection.name}
                        className={`h-full w-full object-cover transition-transform duration-500 ${
                          isLive ? 'group-hover:scale-105' : 'grayscale opacity-40'
                        }`}
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
                  </div>

                  <span
                    className={`absolute top-3 right-3 inline-flex items-center gap-1 border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                      isLive
                        ? 'border-primary/30 bg-primary/20 text-primary'
                        : 'border-border bg-surface-hover text-muted'
                    }`}
                  >
                    {!isLive && <Lock className="h-3 w-3" />}
                    {badgeText}
                  </span>

                  <div className="relative z-10 p-4">
                    <h3 className="font-display text-xl tracking-wide text-foreground">
                      {collection.name}
                    </h3>
                    {isLive && (
                      <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary">
                        Shop Now
                        <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      </span>
                    )}
                  </div>
                </>
              );

              return (
                <motion.div
                  key={collection.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05, duration: 0.4 }}
                >
                  {isLive ? (
                    <Link to={`/collections/${collection.slug}`} className={cardClasses}>
                      {content}
                    </Link>
                  ) : (
                    <div className={cardClasses}>{content}</div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
