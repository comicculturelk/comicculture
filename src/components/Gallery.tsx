import { motion } from 'framer-motion';
import { Instagram, Heart, MessageCircle } from 'lucide-react';

const galleryImages = [
  '/images/products/volt-spider/front.webp',
  '/images/products/volt-spider/back.webp',
  '/images/products/classic-gwen/front.webp',
  '/images/products/classic-gwen/back.webp',
  '/images/products/symbiotic-suit/front.webp',
  '/images/products/symbiotic-suit/back.webp',
  '/images/products/upgraded-black/front.webp',
  '/images/products/upgraded-black/back.webp',
  '/images/products/classic-red/front.webp',
  '/images/products/classic-red/back.webp',
];

export default function Gallery() {
  return (
    <section id="gallery" className="relative py-24 lg:py-32">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-white/[0.02] to-background">
        <div className="absolute inset-0 halftone-overlay opacity-20" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-6">
        {/* Header */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl text-white tracking-wide">
            FOLLOW THE <span className="text-gradient-red">VERSE</span>
          </h2>
          <p className="mt-4 text-lg text-white/60">
            @ComicCulture.lk on Instagram
          </p>
        </motion.div>

        {/* Gallery grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {galleryImages.map((image, index) => (
            <motion.a
              key={index}
              href="https://instagram.com/comicculture.lk"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative aspect-square overflow-hidden rounded-lg"
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.4 }}
              whileHover={{ scale: 1.02 }}
            >
              <img
                src={image}
                alt={`ComicCulture ${index + 1}`}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              {/* Instagram overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-60" />
              <div className="absolute inset-0 bg-background/80 opacity-0 transition-opacity duration-300 group-hover:opacity-100 flex items-center justify-center gap-8">
                <div className="flex items-center gap-2 text-white">
                  <Heart className="h-6 w-6" />
                  <span className="font-medium">Like</span>
                </div>
                <div className="flex items-center gap-2 text-white">
                  <MessageCircle className="h-6 w-6" />
                  <span className="font-medium">View</span>
                </div>
              </div>
            </motion.a>
          ))}
        </div>

        {/* Follow CTA */}
        <motion.div
          className="mt-12 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
        >
          <motion.a
            href="https://instagram.com/comicculture.lk"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 px-6 py-3 font-semibold text-white"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Instagram className="h-5 w-5" />
            Follow @ComicCulture.lk
          </motion.a>
        </motion.div>
      </div>
    </section>
  );
}
