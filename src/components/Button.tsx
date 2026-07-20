import { motion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost';

interface ButtonProps extends HTMLMotionProps<'button'> {
  variant?: Variant;
}

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  secondary: 'bg-surface/75 text-foreground hover:bg-surface-hover',
  outline: 'border border-border text-foreground hover:bg-surface-hover',
  ghost: 'text-muted-foreground hover:text-foreground hover:bg-surface-hover',
};

export default function Button({ variant = 'primary', className = '', children, ...props }: ButtonProps) {
  return (
    <motion.button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition-colors disabled:opacity-50 ${variants[variant]} ${className}`}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      {...props}
    >
      {children}
    </motion.button>
  );
}
