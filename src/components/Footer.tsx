import { motion } from 'framer-motion';
import { Instagram, MessageCircle, Heart } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="relative border-t border-border bg-background">
      {/* Animated top line */}
      <motion.div
        className="absolute top-0 left-0 h-px bg-primary"
        initial={{ width: 0 }}
        whileInView={{ width: '100%' }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
      />

      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Logo */}
          <motion.div className="flex items-center gap-2" whileHover={{ scale: 1.02 }}>
            <div className="relative flex h-9 w-9 items-center justify-center">
              <div className="absolute inset-0 blur-md opacity-50" />
              <img
                src="/images/logo/logo-black.svg"
                alt="ComicCulture"
                className="relative h-10 w-10"
              />
            </div>
            <div className="flex flex-col">
              <span className="font-display text-base text-foreground leading-none">COMIC</span>
              <span className="font-display text-base text-primary leading-none">CULTURE</span>
            </div>
          </motion.div>

          {/* Social links */}
          <div className="flex items-center gap-6">
            <motion.a
              href="https://instagram.com/comicculture.lk"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-muted transition-colors hover:text-foreground"
              whileHover={{ y: -2 }}
            >
              <Instagram className="h-5 w-5" />
              <span className="text-sm font-medium">Instagram</span>
            </motion.a>
            <motion.a
              href="https://wa.me/94787756338"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-muted transition-colors hover:text-foreground"
              whileHover={{ y: -2 }}
            >
              <MessageCircle className="h-5 w-5" />
              <span className="text-sm font-medium">WhatsApp</span>
            </motion.a>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-8 pt-8 border-t border-border text-center">
          <p className="text-sm text-muted flex items-center justify-center gap-1">
            Made with <Heart className="h-4 w-4 text-primary" /> in Sri Lanka
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} ComicCulture. All rights reserved.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Fan-inspired designs. Not affiliated with Marvel, Sony, or DC.
          </p>
        </div>
      </div>
    </footer>
  );
}
