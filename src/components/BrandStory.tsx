import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

export default function BrandStory() {
  return (
    <section className="relative overflow-hidden bg-surface py-24 lg:py-32">
      <div className="absolute inset-0 halftone-overlay opacity-20" />

      <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
        <motion.h2
          className="font-display text-4xl leading-tight tracking-wide text-foreground md:text-5xl lg:text-6xl"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          WEAR YOUR <span className="text-gradient-red">UNIVERSE</span>
        </motion.h2>

        <motion.p
          className="mx-auto mt-4 max-w-md text-lg text-muted"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1, duration: 0.6 }}
        >
          Comic culture, reimagined in premium everyday wear.
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          <Link to="/shop" className="btn-outline mt-8 inline-flex">
            Shop All
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
