import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import ProductCard from './ProductCard';
import type { Product } from '../data/products';

interface ProductShowcaseProps {
  title: string;
  viewAllHref: string;
  products: Product[];
  loading: boolean;
  error: string | null;
  sectionId?: string;
}

export default function ProductShowcase({
  title,
  viewAllHref,
  products,
  loading,
  error,
  sectionId,
}: ProductShowcaseProps) {
  return (
    <section id={sectionId} className="relative py-20 lg:py-28">
      <div className="absolute inset-0 bg-background">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-6">
        <div className="flex items-end justify-between mb-10">
          <h2 className="font-display text-3xl md:text-4xl text-foreground tracking-wide">
            {title}
          </h2>
          <Link
            to={viewAllHref}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-transform hover:translate-x-0.5"
          >
            View All
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {loading && <p className="text-muted">Loading products...</p>}

        {error && !loading && (
          <p className="text-primary">Couldn't load products right now. Please refresh the page.</p>
        )}

        {!loading && !error && products.length === 0 && (
          <p className="text-muted">Nothing here yet — check back soon.</p>
        )}

        {!loading && !error && products.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {products.map((product, index) => (
              <ProductCard key={product.id} product={product} index={index} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
