import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { formatPrice, getProductMinPrice, isProductAvailable, type Product } from '../data/products';

const MotionLink = motion.create(Link);

interface ProductCardProps {
  product: Product;
  index: number;
}

export default function ProductCard({ product, index }: ProductCardProps) {
  const reduceMotion = useReducedMotion();
  return (
    <MotionLink
      to={`/product/${product.slug}`}
      className={`comic-product-shape comic-product-shape--${index % 3} product-card group block h-full`}
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ delay: reduceMotion ? 0 : Math.min(index * 0.08, 0.24), duration: reduceMotion ? 0 : 0.5 }}
    >
      <div className="comic-product-inner">
        {/* Catalog label row */}
        <div className="product-card-label flex items-center justify-end px-3 pt-3 sm:px-5 sm:pt-5">
          <span className="truncate text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {product.collection}
          </span>
        </div>

        {/* A consistent image frame keeps product rows aligned across the catalog. */}
        <div className="relative mt-2 aspect-[4/5] sm:mt-4 overflow-hidden bg-background">
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 ease-out motion-reduce:transition-none group-hover:scale-105 motion-reduce:group-hover:scale-100"
          />

          {!isProductAvailable(product) && (
            <span className="absolute left-3 top-3 inline-flex items-center rounded-full border border-border bg-background/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
              Sold out
            </span>
          )}

          {product.featured && (
            <span className="absolute top-3 right-3 inline-flex items-center rounded-full border border-border bg-background/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary backdrop-blur-sm">
              Featured
            </span>
          )}
        </div>

        {/* Divider */}
        <div className="h-1 border-y-2 border-foreground bg-warning" />

        {/* Info */}
        <div className="product-card-copy flex flex-1 flex-col p-3 sm:p-5">
          <h3 className="font-display text-lg leading-tight tracking-wide sm:text-xl text-foreground">
            {product.name}
          </h3>
          {product.tagline && (
            <p className="mt-1 text-xs text-muted sm:text-sm">{product.tagline}</p>
          )}

          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3 sm:pt-5">
            <span className="font-display text-lg text-foreground">
              {getProductMinPrice(product) > 0
                ? formatPrice(getProductMinPrice(product))
                : 'Unavailable'}
            </span>
            <span className="inline-flex items-center gap-1 text-xs sm:text-sm font-medium text-primary transition-transform duration-200 group-hover:translate-x-0.5">
              <span className="hidden sm:inline">View details</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </div>
    </MotionLink>
  );
}
