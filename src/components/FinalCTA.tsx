import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import CornerFrame from './CornerFrame';

export default function FinalCTA() {
  return (
    <section className="relative overflow-hidden py-28 lg:py-36">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-surface to-background">
        <div className="absolute inset-0 halftone-overlay opacity-30" />
        <div className="absolute inset-0 bg-web-pattern opacity-20" />
      </div>

      {/* Glow */}
      <motion.div
        className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl"
        animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.6, 0.4] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />

      <CornerFrame className="hidden sm:block" />

      <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
        <motion.span
          className="inline-block text-xs font-semibold uppercase tracking-[0.3em] text-muted"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          To Be Continued...
        </motion.span>

        <motion.h2
          className="mt-6 font-display text-5xl leading-none tracking-wide text-foreground sm:text-6xl lg:text-7xl"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1, duration: 0.6 }}
        >
          YOUR STORY <span className="text-gradient-red">STARTS HERE</span>
        </motion.h2>

        <motion.p
          className="mx-auto mt-6 max-w-lg text-lg text-muted"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          Six issues are already live. The rest of the universe is still being drawn.
          Get your chapter before it's out of print.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          <Link to="/shop" className="btn-primary mt-10 inline-flex">
            Shop The Collection
            <ArrowRight className="h-5 w-5" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
