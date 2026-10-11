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
    <span className={className} role="text" aria-label={text}>
      {text.split('').map((char, i) => (
        <motion.span
          key={i}
          aria-hidden="true"
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
    transition: { duration: 0.42, ease: [0.76, 0, 0.24, 1] as const },
  },
};

// The intro should only play once per browser session — refreshing or
// deep-linking within the same session shouldn't replay it, but a genuinely
// new tab/session (sessionStorage, not localStorage) should still get it.
const INTRO_SESSION_KEY = 'comicculture:intro-seen';

function hasSeenIntroThisSession(): boolean {
  try {
    return sessionStorage.getItem(INTRO_SESSION_KEY) === 'true';
  } catch {
    // sessionStorage inaccessible (e.g. disabled) — fall back to the
    // original always-show behavior rather than throwing.
    return false;
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export default function LoadingScreen() {
  // Computed once, synchronously, before first paint — so a returning
  // visitor or a reduced-motion user never sees the intro flash in only to
  // be skipped a moment later; it simply never renders.
  const [loading, setLoading] = useState(
    () => !prefersReducedMotion() && !hasSeenIntroThisSession()
  );

  useEffect(() => {
    if (!loading) return;

    try {
      sessionStorage.setItem(INTRO_SESSION_KEY, 'true');
    } catch {
      // Storage unavailable — nothing more to persist, the intro still
      // plays once for this mount either way.
    }

    const timer = setTimeout(() => setLoading(false), 1250);
    return () => clearTimeout(timer);
  }, [loading]);

  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          className="comic-page fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-background"
          variants={wipeVariants}
          initial="visible"
          animate="visible"
          exit="exit"
        >
          {/* Base texture */}
          <div className="absolute inset-0 halftone-overlay opacity-20" />

          {/* Stage 1 — comic page grid, riffles in behind the cover panel */}
          <div className="absolute inset-0 grid grid-cols-3 grid-rows-2 gap-1 p-1 sm:gap-2 sm:p-2">
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className={`relative overflow-hidden border-2 border-foreground ${i === 1 ? 'bg-primary' : i === 4 ? 'bg-warning' : 'bg-surface'}`}
                initial={{ opacity: 0, scale: 0.78, rotate: i % 2 === 0 ? -3 : 3 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ delay: i * 0.045, duration: 0.32, ease: 'easeOut' }}
              >
                <div className="absolute inset-0 halftone-overlay opacity-30" />
              </motion.div>
            ))}
          </div>

          {/* Stage 2 — the cover panel */}
          <motion.div
            className="comic-panel relative z-10 flex flex-col items-center border-4 bg-surface px-8 py-9 sm:px-16 sm:py-12"
            initial={{ opacity: 0, scale: 0.78, rotate: -3 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ delay: 0.2, duration: 0.48, type: 'spring', stiffness: 180, damping: 16 }}
          >
            {/* Corner brackets */}
            <span className="absolute -top-px -left-px h-7 w-7 border-l-4 border-t-4 border-primary" />
            <span className="absolute -top-px -right-px h-7 w-7 border-r-4 border-t-4 border-primary" />
            <span className="absolute -bottom-px -left-px h-7 w-7 border-l-4 border-b-4 border-primary" />
            <span className="absolute -bottom-px -right-px h-7 w-7 border-r-4 border-b-4 border-primary" />

            <motion.span
              aria-hidden="true"
              className="comic-burst absolute -right-5 -top-7 flex h-[4.5rem] w-[4.5rem] rotate-12 items-center justify-center border-2 border-foreground font-display text-xl text-foreground shadow-[3px_3px_0_#d21f38] sm:-right-7 sm:-top-8 sm:h-24 sm:w-24 sm:text-3xl"
              initial={{ scale: 0, rotate: 35 }}
              animate={{ scale: 1, rotate: 12 }}
              transition={{ delay: 0.48, type: 'spring', stiffness: 320, damping: 12 }}
            >
              POW!
            </motion.span>

            {/* Kicker */}
            <motion.span
              className="text-[10px] font-extrabold uppercase tracking-[0.28em] text-primary sm:text-xs sm:tracking-[0.35em]"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.36, duration: 0.28 }}
            >
              ComicCulture Presents
            </motion.span>

            {/* Wordmark — ink-reveal per letter */}
            <div className="mt-3 flex flex-col items-center leading-none">
              <AnimatedWord
                text="COMIC"
                delay={0.4}
                className="font-display text-4xl tracking-wider text-foreground sm:text-6xl"
              />
              <AnimatedWord
                text="CULTURE"
                delay={0.52}
                className="font-display text-4xl tracking-wider text-gradient-red sm:text-6xl"
              />
            </div>

            {/* Hairline rule */}
            <motion.div
              className="mt-5 h-1 w-24 origin-center border-y border-foreground bg-warning"
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ delay: 0.78, duration: 0.3, ease: 'easeOut' }}
            />

            {/* Issue stamp */}
            <motion.span
              className="comic-caption mt-4 -rotate-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.84, duration: 0.25 }}
            >
              Issue N°01 · First Print
            </motion.span>
          </motion.div>

          {/* Stage 3 — brand line + quiet loading pulse */}
          <motion.div
            className="absolute bottom-8 flex items-center gap-2 px-4 text-center sm:bottom-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.62, duration: 0.3 }}
          >
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-foreground sm:text-sm sm:tracking-widest">
              Opening your next issue
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
