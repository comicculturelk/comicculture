import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Star, ChevronLeft, ChevronRight, Instagram } from 'lucide-react';

const reviews = [
  {
    name: 'Kasun Perera',
    location: 'Colombo, Sri Lanka',
    avatar: 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=150',
    rating: 5,
    text: 'The Classic Red jersey is absolutely stunning. The quality exceeded my expectations. Premium fabric and perfect fit!',
    product: 'The Classic Red',
  },
  {
    name: 'Sarah Williams',
    location: 'London, UK',
    avatar: 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=150',
    rating: 5,
    text: 'Love the attention to detail on my Symbiotic Suit. The matte black finish is gorgeous. Ordering via WhatsApp was seamless!',
    product: 'The Symbiotic Suit',
  },
  {
    name: 'David Chen',
    location: 'Singapore',
    avatar: 'https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg?auto=compress&cs=tinysrgb&w=150',
    rating: 5,
    text: 'Finally a brand that understands the culture! The Volt Spider design turns heads everywhere I go. Will buy again.',
    product: 'The Volt Spider',
  },
  {
    name: 'Amala Fernando',
    location: 'Kandy, Sri Lanka',
    avatar: 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=150',
    rating: 5,
    text: 'The Gwen design is beautiful! Love how unique it is. Fast shipping and great customer service on Instagram.',
    product: 'The Classic Gwen',
  },
];

export default function Reviews() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % reviews.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const prev = () => setCurrent((current - 1 + reviews.length) % reviews.length);
  const next = () => setCurrent((current + 1) % reviews.length);

  return (
    <section id="community" className="relative py-24 lg:py-32 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-background">
        <div className="absolute inset-0 bg-web-pattern opacity-10" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl px-6">
        {/* Header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <span className="inline-block rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
            FAN TRANSMISSIONS
          </span>
          <h2 className="mt-6 font-display text-4xl md:text-5xl lg:text-6xl text-foreground tracking-wide">
            THE COMICCULTURE <span className="text-primary">COMMUNITY</span>
          </h2>
          <p className="mt-4 text-lg text-muted">Real stories from real collectors.</p>
        </motion.div>

        {/* Reviews carousel */}
        <div className="relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              className="glass relative rounded-2xl p-8 md:p-12 text-center"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.4 }}
            >
              {/* Avatar */}
              <motion.img
                src={reviews[current].avatar}
                alt={reviews[current].name}
                className="mx-auto h-20 w-20 rounded-full object-cover border-2 border-primary"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: 'spring' }}
              />

              {/* Stars */}
              <div className="mt-4 flex justify-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`h-5 w-5 ${i < reviews[current].rating ? 'text-primary fill-primary' : 'text-foreground/20'}`}
                  />
                ))}
              </div>

              {/* Review text */}
              <p className="mt-6 text-lg md:text-xl text-foreground/80 leading-relaxed italic">
                "{reviews[current].text}"
              </p>

              {/* Author */}
              <p className="mt-6 font-display text-lg text-foreground">
                {reviews[current].name}
              </p>
              <p className="text-sm text-muted">
                {reviews[current].location}
              </p>
              <p className="mt-2 text-sm text-primary">
                Purchased: {reviews[current].product}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* Navigation buttons */}
          <div className="mt-8 flex justify-center gap-4">
            <motion.button
              onClick={prev}
              className="rounded-full bg-foreground/10 p-3 text-foreground transition-colors hover:bg-foreground/20"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <ChevronLeft className="h-5 w-5" />
            </motion.button>
            {/* Dots */}
            <div className="flex items-center gap-2">
              {reviews.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrent(index)}
                  className={`h-2 rounded-full transition-all ${
                    index === current ? 'w-8 bg-primary' : 'w-2 bg-foreground/30'
                  }`}
                />
              ))}
            </div>
            <motion.button
              onClick={next}
              className="rounded-full bg-foreground/10 p-3 text-foreground transition-colors hover:bg-foreground/20"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <ChevronRight className="h-5 w-5" />
            </motion.button>
          </div>
        </div>

        {/* Community follow line — replaces the dropped Instagram grid section */}
        <motion.div
          className="mt-12 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
        >
          <a
            href="https://instagram.com/comicculture.lk"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
          >
            <Instagram className="h-4 w-4" />
            Join the conversation @ComicCulture.lk
          </a>
        </motion.div>
      </div>
    </section>
  );
}
