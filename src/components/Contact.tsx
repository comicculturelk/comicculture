import { motion } from 'framer-motion';
import { Instagram, MessageCircle, Mail, MapPin, Send } from 'lucide-react';

const contactMethods = [
  {
    icon: MessageCircle,
    label: 'WhatsApp',
    value: '+94 78 775 6338',
    href: 'https://wa.me/94787756338',
    gradient: 'bg-green-600',
  },
  {
    icon: Instagram,
    label: 'Instagram',
    value: '@ComicCulture.lk',
    href: 'https://instagram.com/comicculture.lk',
    gradient: 'bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400',
  },
  {
    icon: Mail,
    label: 'Email',
    value: 'comicculturelk@gmail.com',
    href: 'mailto:comicculturelk@gmail.com',
    gradient: 'bg-brand-blue',
  },
];

export default function Contact() {
  return (
    <section id="contact" className="relative py-24 lg:py-32 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-brand-bg">
        <div className="absolute inset-0 bg-web-pattern opacity-15" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-red/50 to-transparent" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-6">
        {/* Header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl text-white tracking-wide">
            GET IN <span className="text-gradient-red">TOUCH</span>
          </h2>
          <p className="mt-4 text-lg text-white/60 max-w-2xl mx-auto">
            Questions about jerseys? Want to collaborate? Reach out and let's talk.
          </p>
        </motion.div>

        {/* Contact methods */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {contactMethods.map((method, index) => (
            <motion.a
              key={method.label}
              href={method.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              whileHover={{ y: -4 }}
            >
              <div className="glass rounded-2xl p-6 text-center transition-all duration-300 group-hover:border-brand-red/30">
                <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-xl ${method.gradient}`}>
                  <method.icon className="h-6 w-6 text-white" />
                </div>
                <p className="mt-4 text-sm text-white/50 uppercase tracking-wider">
                  {method.label}
                </p>
                <p className="mt-2 font-medium text-white">
                  {method.value}
                </p>
              </div>
            </motion.a>
          ))}
        </div>

        {/* Location card */}
        <motion.div
          className="glass rounded-2xl p-8 md:p-12 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-red/20 border border-brand-red/30">
                <MapPin className="h-6 w-6 text-brand-red" />
              </div>
              <div>
                <p className="text-sm text-white/50 uppercase tracking-wider">Based in</p>
                <p className="mt-1 font-display text-xl text-white tracking-wide">
                  Sri Lanka
                </p>
              </div>
            </div>

            <div className="text-center md:text-right">
              <p className="text-sm text-white/60 mb-3">Ships worldwide from</p>
              <p className="font-display text-lg text-white">Colombo, Sri Lanka</p>
            </div>
          </div>

          {/* CTA */}
          <motion.a
            href="https://wa.me/94787756338"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-brand-red px-6 py-3 font-semibold text-white transition-all hover:bg-brand-red-dark"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Send className="h-5 w-5" />
            Send a Message
          </motion.a>
        </motion.div>
      </div>
    </section>
  );
}
