import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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
          className="fixed inset-0 z-[100] flex items-center justify-center bg-brand-bg"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Halftone overlay */}
          <div className="absolute inset-0 halftone-overlay opacity-50" />

          {/* Animated spider web */}
          <div className="relative">
            <motion.svg
              width="300"
              height="300"
              viewBox="0 0 300 300"
              className="relative z-10"
            >
              {/* Radial lines */}
              {[...Array(16)].map((_, i) => {
                const angle = (i * 360) / 16;
                const x1 = 150;
                const y1 = 150;
                const x2 = 150 + 140 * Math.cos((angle * Math.PI) / 180);
                const y2 = 150 + 140 * Math.sin((angle * Math.PI) / 180);
                return (
                  <motion.line
                    key={`radial-${i}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="#E11D48"
                    strokeWidth="1"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 0.6 }}
                    transition={{
                      duration: 0.5,
                      delay: i * 0.05,
                      ease: 'easeOut',
                    }}
                  />
                );
              })}

              {/* Spiral rings */}
              {[20, 50, 80, 110, 140].map((radius, i) => (
                <motion.circle
                  key={`ring-${i}`}
                  cx="150"
                  cy="150"
                  r={radius}
                  fill="none"
                  stroke="#E11D48"
                  strokeWidth="1"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 - i * 0.15 }}
                  transition={{
                    duration: 0.8,
                    delay: 0.5 + i * 0.15,
                    ease: 'easeOut',
                  }}
                />
              ))}
            </motion.svg>

            {/* Center glow */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 1.5, duration: 0.5 }}
            >
              <div className="h-4 w-4 rounded-full bg-brand-red glow-red" />
            </motion.div>

            {/* Logo text */}
            <motion.div
              className="absolute inset-0 flex flex-col items-center justify-center mt-44"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.8, duration: 0.5 }}
            >
              <span className="font-display text-4xl tracking-wider text-white">COMIC</span>
              <span className="font-display text-4xl tracking-wider text-brand-red">CULTURE</span>
            </motion.div>
          </div>

          {/* Loading text */}
          <motion.p
            className="absolute bottom-20 text-sm tracking-widest text-white/50 uppercase"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2 }}
          >
            Entering the Spider-Verse...
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
