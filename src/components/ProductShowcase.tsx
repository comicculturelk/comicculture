import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import ProductCard from './ProductCard';
import { useProducts } from '../hooks/useProducts';

export default function ProductShowcase() {
  const { products, loading, error } = useProducts();

  return (
    <section id="collection" className="relative py-24 lg:py-32">
      {/* Background */}
      <div className="absolute inset-0 bg-background">
        <div className="absolute inset-0 halftone-overlay opacity-20" />
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
          <span className="inline-block border border-primary/25 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
            LIMITED EDITION
          </span>
          <h2 className="mt-6 font-display text-4xl md:text-5xl lg:text-6xl text-foreground tracking-wide">
            DROP 01 — BRAND NEW DAY
          </h2>
          <p className="mt-4 text-lg text-muted max-w-2xl mx-auto">
            Six issues, six stories. Each jersey is crafted in premium materials and printed
            in limited quantities — once they're gone, that chapter closes.
          </p>
        </motion.div>

        {/* Loading state */}
        {loading && <p className="text-center text-muted">Loading collection...</p>}

        {/* Error state */}
        {error && !loading && (
          <p className="text-center text-primary">
            Couldn't load products right now. Please refresh the page.
          </p>
        )}

        {/* Product grid — each product framed as a collectible issue */}
        {!loading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
            {products.map((product, index) => (
              <ProductCard key={product.id} product={product} index={index} />
            ))}
          </div>
        )}

        {/* Explore CTA */}
        <motion.div
          className="mt-16 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
        >
          <Link to="/shop" className="btn-outline">
            View Full Collection
            <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
