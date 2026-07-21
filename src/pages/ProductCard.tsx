import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { Product } from '../data/products';

const MotionLink = motion.create(Link);

interface ProductCardProps {
  product: Product;
  index: number;
}

export default function ProductCard({ product, index }: ProductCardProps) {
  return (
    <MotionLink
      to={`/product/${product.slug}`}
      className="group block"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ delay: index * 0.08, duration: 0.5 }}
    >
      <div className="overflow-hidden border border-border bg-surface transition-all duration-300 hover:-translate-y-1 hover:border-foreground/40">
        {/* Catalog label row */}
        <div className="flex items-center justify-between px-5 pt-5">
          <span className="font-display text-xs tracking-[0.25em] text-muted uppercase">
            Issue №{String(index + 1).padStart(3, '0')}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {product.collection}
          </span>
        </div>

        {/* Product image — clean, no overlay */}
        <div className="relative mt-4 aspect-[3/4] overflow-hidden bg-background">
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />

          {product.featured && (
            <span className="absolute top-3 right-3 inline-flex items-center border border-border bg-background/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary backdrop-blur-sm">
              Featured
            </span>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-border" />

        {/* Info */}
        <div className="p-5">
          <h3 className="font-display text-xl tracking-wide text-foreground">
            {product.name}
          </h3>
          {product.tagline && (
            <p className="mt-1 text-sm text-muted">{product.tagline}</p>
          )}

          <div className="mt-5 flex items-center justify-between">
            <span className="font-display text-lg text-foreground">
              Rs. {product.price}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-primary transition-transform duration-300 group-hover:translate-x-1">
              View Product
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </div>
    </MotionLink>
  );
}
