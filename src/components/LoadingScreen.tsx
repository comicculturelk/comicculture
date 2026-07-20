import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/** Renders text as individually-animated letters (comic-ink reveal). */
function AnimatedWord({
  text,
  delay,
  className,
}: {
  text: string;
  delay: number;
  className?: string;
}) {
  return (
    <span className={className}>
      {text.split('').map((char, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: delay + i * 0.035, duration: 0.4, ease: 'easeOut' }}
        >
          {char}
        </motion.span>
      ))}
    </span>
  );
}

const wipeVariants = {
  visible: { clipPath: 'inset(0% 0% 0% 0%)' },
  exit: {
    clipPath: 'inset(0% 0% 100% 0%)',
    transition: { duration: 0.7, ease: [0.76, 0, 0.24, 1] },
  },
};

export default function LoadingScreen() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background overflow-hidden"
          variants={wipeVariants}
          initial="visible"
          animate="visible"
          exit="exit"
        >
          {/* Base texture */}
          <div className="absolute inset-0 halftone-overlay opacity-20" />

          {/* Stage 1 — comic page grid, riffles in behind the cover panel */}
          <div className="absolute inset-0 grid grid-cols-3 grid-rows-2 gap-[2px] p-[2px]">
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="relative bg-surface border border-border overflow-hidden"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.06, duration: 0.4, ease: 'easeOut' }}
              >
                <div className="absolute inset-0 halftone-overlay opacity-20" />
              </motion.div>
            ))}
          </div>

          {/* Stage 2 — the cover panel */}
          <motion.div
            className="relative z-10 flex flex-col items-center border-2 border-foreground/15 bg-background px-12 py-10 sm:px-20 sm:py-14"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.55, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Corner brackets */}
            <span className="absolute -top-px -left-px h-6 w-6 border-l-2 border-t-2 border-primary" />
            <span className="absolute -top-px -right-px h-6 w-6 border-r-2 border-t-2 border-primary" />
            <span className="absolute -bottom-px -left-px h-6 w-6 border-l-2 border-b-2 border-primary" />
            <span className="absolute -bottom-px -right-px h-6 w-6 border-r-2 border-b-2 border-primary" />

            {/* Kicker */}
            <motion.span
              className="text-xs font-semibold uppercase tracking-[0.35em] text-muted-foreground"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.85, duration: 0.5 }}
            >
              ComicCulture Presents
            </motion.span>

            {/* Wordmark — ink-reveal per letter */}
            <div className="mt-3 flex flex-col items-center leading-none">
              <AnimatedWord
                text="COMIC"
                delay={1.0}
                className="font-display text-4xl sm:text-6xl tracking-wider text-foreground"
              />
              <AnimatedWord
                text="CULTURE"
                delay={1.15}
                className="font-display text-4xl sm:text-6xl tracking-wider text-gradient-red"
              />
            </div>

            {/* Hairline rule */}
            <motion.div
              className="mt-5 h-px w-20 origin-center bg-primary"
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ delay: 1.7, duration: 0.5, ease: 'easeOut' }}
            />

            {/* Issue stamp */}
            <motion.span
              className="mt-4 text-[11px] font-medium uppercase tracking-[0.25em] text-muted"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.95, duration: 0.4 }}
            >
              Issue N°01 · First Print
            </motion.span>
          </motion.div>

          {/* Stage 3 — brand line + quiet loading pulse */}
          <motion.div
            className="absolute bottom-16 flex items-center gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.15, duration: 0.4 }}
          >
            <p className="text-sm tracking-widest text-muted uppercase">
              Every design is a chapter
            </p>
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-1 w-1 rounded-full bg-primary"
                  animate={{ opacity: [0.2, 1, 0.2] }}
                  transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.2 }}
                />
              ))}
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
