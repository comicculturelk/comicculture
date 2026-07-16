import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { ArrowDown, Play, ShoppingBag } from 'lucide-react';

export default function Hero() {
  const ref = useRef(null);
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 500], [0, 150]);
  const opacity = useTransform(scrollY, [0, 300], [1, 0]);

  return (
    <section ref={ref} id="home" className="relative min-h-screen overflow-hidden">
      {/* Animated background layers */}
      <div className="absolute inset-0">
        {/* Base gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-black" />

        {/* Animated gradient orbs */}
        <motion.div
          className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl"
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-secondary/20 blur-3xl"
          animate={{
            scale: [1.3, 1, 1.3],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Web pattern overlay */}
        <div className="absolute inset-0 bg-web-pattern opacity-30" />

        {/* Halftone overlay */}
        <div className="absolute inset-0 halftone-overlay opacity-40" />

        {/* Floating particles */}
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute h-1 w-1 rounded-full bg-white/20"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0.2, 0.5, 0.2],
            }}
            transition={{
              duration: 3 + Math.random() * 3,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      {/* Content */}
      <motion.div
        className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6"
        style={{ y, opacity }}
      >
        {/* Glowing badge */}
        <motion.div
          className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.7, duration: 0.6 }}
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <span className="text-sm font-medium text-primary">DROP 01 NOW LIVE</span>
        </motion.div>

        {/* Main headline */}
        <motion.h1
          className="font-display text-center text-6xl sm:text-7xl md:text-8xl lg:text-9xl tracking-wider leading-none"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.8, duration: 0.8 }}
        >
          <span className="text-white">WEAR YOUR</span>
          <br />
          <span className="text-gradient-red">UNIVERSE</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          className="mt-6 text-center text-lg md:text-xl text-white/60 max-w-lg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 3.1, duration: 0.6 }}
        >
          Football Meets The Spider-Verse
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          className="mt-10 flex flex-col sm:flex-row gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 3.3, duration: 0.6 }}
        >
          <motion.a
            href="#collection"
            className="btn-primary"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <ShoppingBag className="h-5 w-5" />
            Browse Collection
          </motion.a>
          <motion.button
            className="btn-outline"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Play className="h-5 w-5" />
            Watch Trailer
          </motion.button>
        </motion.div>

        {/* Stats */}
        <motion.div
          className="mt-16 flex items-center gap-12 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 3.6, duration: 0.6 }}
        >
          <div>
            <p className="font-display text-3xl text-white">6</p>
            <p className="text-sm text-white/50">Unique Designs</p>
          </div>
          <div className="h-12 w-px bg-white/10" />
          <div>
            <p className="font-display text-3xl text-white">LIMITED</p>
            <p className="text-sm text-white/50">Edition</p>
          </div>
          <div className="h-12 w-px bg-white/10" />
          <div>
            <p className="font-display text-3xl text-primary">Rs. 89</p>
            <p className="text-sm text-white/50">Starting</p>
          </div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 4 }}
        >
          <span className="text-xs uppercase tracking-widest text-white/40">Scroll</span>
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <ArrowDown className="h-5 w-5 text-white/60" />
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
}
