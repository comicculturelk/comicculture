import { motion } from 'framer-motion';
import ProductCard from './ProductCard';
import { useProducts } from '../hooks/useProducts';

export default function Collections() {
  const { products, loading, error } = useProducts();

  return (
    <section id="collection" className="relative py-24 lg:py-32">
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
            LIMITED EDITION
          </motion.span>
          <h2 className="mt-6 font-display text-4xl md:text-5xl lg:text-6xl text-white tracking-wide">
            DROP 01 — BRAND NEW DAY
          </h2>
          <p className="mt-4 text-lg text-white/60 max-w-2xl mx-auto">
            Our debut collection features six unique designs inspired by the Spider-Verse.
            Each jersey is crafted with premium materials and limited quantities.
          </p>
        </motion.div>

        {/* Loading state */}
        {loading && (
          <p className="text-center text-white/50">Loading collection...</p>
        )}

        {/* Error state */}
        {error && !loading && (
          <p className="text-center text-primary">
            Couldn't load products right now. Please refresh the page.
          </p>
        )}

        {/* Product grid */}
        {!loading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {products.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                index={index}
              />
            ))}
          </div>
        )}

        {/* Glow line */}
        <motion.div
          className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-secondary/50 to-transparent"
        />
      </div>
    </section>
  );
}
