import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ShoppingBag } from 'lucide-react';

const MotionLink = motion.create(Link);

const navLinks = [
  { label: 'Home', to: '/' },
  { label: 'Shop', to: '/shop' },
  { label: 'Contact', to: '/contact' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <motion.header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? 'glass-dark py-3' : 'py-5'
        }`}
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, delay: 2.5 }}
      >
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6">
          {/* Logo */}
          <MotionLink
            to="/"
            className="flex items-center gap-2"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="relative flex h-9 w-9 items-center justify-center">
              <div className="absolute inset-0 bg-brand-red blur-md opacity-50" />
              <img
                src="/images/logo/logo-white.svg"
                alt="ComicCulture"
                className="relative h-8 w-8"
              />
            </div>
            <div className="hidden sm:flex flex-col">
              <span className="font-display text-base text-white leading-none">COMIC</span>
              <span className="font-display text-base text-brand-red leading-none">CULTURE</span>
            </div>
          </MotionLink>

          {/* Desktop Nav Links */}
          <ul className="hidden lg:flex items-center gap-8">
            {navLinks.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="relative text-sm font-medium text-white/70 transition-colors hover:text-white group"
                >
                  {link.label}
                  <span className="absolute -bottom-1 left-0 h-px w-0 bg-brand-red transition-all group-hover:w-full" />
                </Link>
              </li>
            ))}
          </ul>

          {/* CTA Buttons */}
          <div className="hidden lg:flex items-center gap-4">
            <MotionLink
              to="/shop"
              className="btn-primary"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <ShoppingBag className="h-4 w-4" />
              Shop Now
            </MotionLink>
          </div>

          {/* Mobile Menu Toggle */}
          <motion.button
            className="lg:hidden p-2 text-white"
            onClick={() => setMobileOpen(!mobileOpen)}
            whileTap={{ scale: 0.9 }}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </motion.button>
        </nav>
      </motion.header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-40 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 bg-black/80 backdrop-blur-xl"
              onClick={() => setMobileOpen(false)}
            />

            {/* Menu Content */}
            <motion.nav
              className="absolute top-20 left-0 right-0 bg-brand-bg border-t border-white/10 px-6 py-8"
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
            >
              <ul className="flex flex-col gap-1">
                {navLinks.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="block rounded-lg px-4 py-3 text-lg font-medium text-white/80 transition-colors hover:bg-white/5 hover:text-white"
                      onClick={() => setMobileOpen(false)}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>

              <div className="mt-6 pt-6 border-t border-white/10">
                <Link
                  to="/shop"
                  className="btn-primary w-full justify-center"
                  onClick={() => setMobileOpen(false)}
                >
                  <ShoppingBag className="h-5 w-5" />
                  Shop Now
                </Link>
              </div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
