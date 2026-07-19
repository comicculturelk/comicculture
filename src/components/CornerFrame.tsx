interface CornerFrameProps {
  className?: string;
}

/**
 * Purely decorative comic-panel corner brackets, used to frame hero-style
 * sections with a "cover" feel. Token-driven (foreground) so it follows
 * theme changes automatically. Not interactive — always aria-hidden.
 */
export default function CornerFrame({ className = '' }: CornerFrameProps) {
  return (
    <div className={`pointer-events-none absolute inset-4 z-10 ${className}`} aria-hidden="true">
      <span className="absolute top-0 left-0 h-6 w-6 border-l-2 border-t-2 border-foreground/20" />
      <span className="absolute top-0 right-0 h-6 w-6 border-r-2 border-t-2 border-foreground/20" />
      <span className="absolute bottom-0 left-0 h-6 w-6 border-l-2 border-b-2 border-foreground/20" />
      <span className="absolute bottom-0 right-0 h-6 w-6 border-r-2 border-b-2 border-foreground/20" />
    </div>
  );
}
