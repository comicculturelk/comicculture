import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Lock, ArrowUpRight } from 'lucide-react';

interface Universe {
  name: string;
  tagline: string;
  description: string;
  image?: string;
  status: 'live' | 'soon';
  to?: string;
}

// Only "Web-Slinger Saga" is live today (Drop 01). The rest are placeholders
// for future collections — flip `status` to 'live', add an `image`, and set
// `to` once a real collection exists for it. No backend change needed to
// add more of these; they're purely presentational until then.
const universes: Universe[] = [
  {
    name: 'Web-Slinger Saga',
    tagline: 'Drop 01 · Live Now',
    description:
      "Six issues. One web. Our debut arc, inspired by the masked hero everyone grew up swinging alongside.",
    image: '/images/products/classic-red/carousel.webp',
    status: 'live',
    to: '/collections/web-slinger-saga',
  },
  {
    name: 'Shadow City Files',
    tagline: 'Next Arc',
    description: 'Gritty vigilante energy for the next chapter. Dark tones, sharper lines.',
    image: '/images/products/noir-spider/coming-soon-noir.webp',
    status: 'soon',
  },
  {
    name: 'Anime Arcs',
    tagline: 'Coming Soon',
    description: 'Ink, speed lines, and legendary showdowns from the East.',
    status: 'soon',
  },
  {
    name: 'Original Universe',
    tagline: 'Coming Soon',
    description: 'Concepts born entirely in the ComicCulture studio — no source material, just imagination.',
    status: 'soon',
  },
];

export default function Collections() {
  return (
    <section id="universe" className="relative py-24 lg:py-32">
      {/* Background */}
      <div className="absolute inset-0 bg-background">
        <div className="absolute inset-0 bg-web-pattern opacity-20" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-6">
        {/* Section header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <motion.span
            className="inline-block rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary"
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            CHOOSE YOUR WORLD
          </motion.span>
          <h2 className="mt-6 font-display text-4xl md:text-5xl lg:text-6xl text-foreground tracking-wide">
            THE COMICCULTURE UNIVERSE
          </h2>
          <p className="mt-4 text-lg text-muted max-w-2xl mx-auto">
            Every collection is a different world. Step into the one that's calling you —
            the rest are still being drawn.
          </p>
        </motion.div>

        {/* Universe grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {universes.map((universe, index) => {
            const isLive = universe.status === 'live';
            const cardClasses = `group relative flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-2xl border border-foreground/10 ${
              isLive ? 'cursor-pointer' : 'cursor-default'
            }`;

            const content = (
              <>
                {/* Background */}
                <div className="absolute inset-0 bg-surface">
                  {universe.image && (
                    <img
                      src={universe.image}
                      alt={universe.name}
                      className={`h-full w-full object-cover transition-transform duration-500 ${
                        isLive ? 'group-hover:scale-105' : 'grayscale opacity-40'
                      }`}
                    />
                  )}
                  <div className="absolute inset-0 halftone-overlay opacity-30" />
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
                </div>

                {/* Issue number */}
                <span className="absolute top-4 left-4 text-xs font-semibold uppercase tracking-[0.2em] text-foreground/50">
                  №0{index + 1}
                </span>

                {/* Status pill */}
                <span
                  className={`absolute top-4 right-4 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                    isLive ? 'bg-primary/20 text-primary' : 'bg-surface-hover text-muted'
                  }`}
                >
                  {!isLive && <Lock className="h-3 w-3" />}
                  {universe.tagline}
                </span>

                {/* Content */}
                <div className="relative z-10 p-5">
                  <h3 className="font-display text-2xl tracking-wide text-foreground">
                    {universe.name}
                  </h3>
                  <p className="mt-2 text-sm text-muted leading-relaxed">
                    {universe.description}
                  </p>
                  {isLive && (
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                      Enter This World
                      <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </span>
                  )}
                </div>
              </>
            );

            return (
              <motion.div
                key={universe.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
              >
                {isLive ? (
                  <Link to={universe.to!} className={cardClasses}>
                    {content}
                  </Link>
                ) : (
                  <div className={cardClasses}>{content}</div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
