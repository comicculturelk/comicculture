import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import type { Product } from '../data/products';

const MotionLink = motion.create(Link);

interface ProductCardProps {
  product: Product;
  index: number;
}

export default function ProductCard({ product, index }: ProductCardProps) {
  const ref = useRef<HTMLAnchorElement>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const xSpring = useSpring(x, { stiffness: 300, damping: 30 });
  const ySpring = useSpring(y, { stiffness: 300, damping: 30 });

  const rotateX = useTransform(ySpring, [-0.5, 0.5], [8, -8]);
  const rotateY = useTransform(xSpring, [-0.5, 0.5], [-8, 8]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const xPos = (e.clientX - rect.left) / rect.width - 0.5;
    const yPos = (e.clientY - rect.top) / rect.height - 0.5;
    x.set(xPos);
    y.set(yPos);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <MotionLink
      ref={ref}
      to={`/product/${product.slug}`}
      className="group perspective-1000 block cursor-pointer"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ delay: index * 0.1, duration: 0.6 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div
        className="relative preserve-3d overflow-hidden rounded-2xl border border-foreground/10 bg-surface transition-all duration-300 group-hover:border-primary/30"
        style={{ rotateX, rotateY }}
        whileHover={{ scale: 1.02 }}
      >
        {/* Glow effect */}
        <motion.div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-primary/0 via-primary/40 to-secondary/0 opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100" />

        {/* Image container */}
        <div className="relative aspect-[3/4] overflow-hidden">
          <motion.img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
          />

          {/* Comic dot texture + gradient overlay */}
          <div className="absolute inset-0 halftone-overlay opacity-20" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/10 to-transparent" />

          {/* Issue number */}
          <span className="absolute top-4 left-4 font-display text-xs tracking-[0.2em] text-foreground/60">
            ISSUE №{String(index + 1).padStart(2, '0')}
          </span>

          {/* Featured badge */}
          {product.featured && (
            <span className="absolute top-4 right-4 inline-flex items-center gap-1 rounded-full bg-primary/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
              <Star className="h-3 w-3 fill-primary" />
              Reader's Pick
            </span>
          )}

          {/* Tagline ribbon */}
          <div className="absolute bottom-4 left-4">
            <span className="rounded-full border border-foreground/10 bg-background/60 px-3 py-1 text-xs font-medium text-foreground backdrop-blur-sm">
              {product.tagline}
            </span>
          </div>

          {/* Hover CTA */}
          <motion.div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <span className="btn-primary text-sm">Open This Issue</span>
          </motion.div>
        </div>

        {/* Panel gutter divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        {/* Info */}
        <div className="relative p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            {product.collection}
          </p>
          <h3 className="mt-1 font-display text-xl tracking-wide text-foreground">
            {product.name}
          </h3>
          {product.lore && (
            <p className="mt-2 text-sm italic text-muted leading-relaxed line-clamp-2">
              "{product.lore}"
            </p>
          )}
          <div className="mt-4 flex items-center justify-between">
            <p className="font-display text-2xl text-primary">Rs. {product.price}</p>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Collector's Edition
            </span>
          </div>
        </div>
      </motion.div>
    </MotionLink>
  );
}
