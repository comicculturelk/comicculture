import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { Link } from 'react-router-dom';
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

  const rotateX = useTransform(ySpring, [-0.5, 0.5], [10, -10]);
  const rotateY = useTransform(xSpring, [-0.5, 0.5], [-10, 10]);

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
        className="relative preserve-3d rounded-2xl overflow-hidden bg-gradient-to-b from-white/5 to-transparent border border-white/10 transition-all duration-300 group-hover:border-brand-red/30"
        style={{ rotateX, rotateY }}
        whileHover={{ scale: 1.02 }}
      >
        {/* Glow effect */}
        <motion.div
          className="absolute -inset-px rounded-2xl bg-gradient-to-r from-brand-red/0 via-brand-red/50 to-brand-blue/0 opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100"
        />

        {/* Image container */}
        <div className="relative aspect-[3/4] overflow-hidden">
          <motion.img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
          />

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-brand-bg via-transparent to-transparent opacity-80" />

          {/* Tagline badge */}
          <div className="absolute top-4 left-4">
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
              {product.tagline}
            </span>
          </div>

          {/* View button on hover */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center bg-brand-bg/60 backdrop-blur-sm opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          >
            <span className="btn-primary text-sm">
              View Details
            </span>
          </motion.div>
        </div>

        {/* Info */}
        <div className="relative p-5">
          <p className="text-xs text-brand-red font-medium uppercase tracking-wider">
            {product.collection}
          </p>
          <h3 className="mt-1 font-display text-xl text-white tracking-wide">
            {product.name}
          </h3>
          <p className="mt-2 text-sm text-white/60 italic">
            "{product.lore}"
          </p>
          <p className="mt-3 font-display text-2xl text-brand-red">
            Rs. {product.price}
          </p>
        </div>
      </motion.div>
    </MotionLink>
  );
}
