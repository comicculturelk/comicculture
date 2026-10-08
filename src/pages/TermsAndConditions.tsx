import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronRight,
  ShoppingBag,
  CreditCard,
  Truck,
  RefreshCw,
  Package,
  Copyright,
  ShieldAlert,
  Scale,
  Mail,
} from 'lucide-react';
import SEO, { type JsonLdBlock } from '../components/SEO';

const SITE_URL = 'https://comicculture.lk';

interface TermsSection {
  icon: typeof ShoppingBag;
  title: string;
  points: string[];
}

const SECTIONS: TermsSection[] = [
  {
    icon: ShoppingBag,
    title: '1. About ComicCulture',
    points: [
      'ComicCulture is an online fan-apparel store based in Sri Lanka.',
      'By accessing or using our website, you agree to these Terms and Conditions.',
      'If you do not agree with these terms, please do not use the website or place an order.',
    ],
  },
  {
    icon: Package,
    title: '2. Products & Product Information',
    points: [
      'We make reasonable efforts to ensure that product names, descriptions, images, prices, sizes, and availability are accurate.',
      'Colours and visual appearance may vary slightly between screens and the actual product.',
      'Product availability may change without prior notice.',
      'Some products or sizes may require stock arrangements from suppliers. An order may be subject to availability confirmation before fulfilment.',
    ],
  },
  {
    icon: CreditCard,
    title: '3. Orders & Payment',
    points: [
      'Submitting an order through the website constitutes a request to purchase the selected products.',
      'An order is not considered finally accepted until ComicCulture confirms it.',
      'We currently support the payment methods displayed during checkout, including Cash on Delivery and bank transfer where available.',
      'For bank transfer orders, payment must be received and verified before the order is processed for fulfilment.',
      'We reserve the right to decline, cancel, or request clarification for an order where there is an availability, pricing, payment, delivery, or other legitimate issue.',
    ],
  },
  {
    icon: Truck,
    title: '4. Delivery',
    points: [
      'Delivery is available to the areas and destinations supported during checkout.',
      'Estimated delivery times are provided as guidance and may vary due to courier operations, weather, public holidays, address issues, or other circumstances outside our reasonable control.',
      'Customers are responsible for providing accurate delivery details and a reachable contact number.',
      'Once an order has been dispatched, delivery is handled through the applicable courier or delivery service.',
    ],
  },
  {
    icon: RefreshCw,
    title: '5. Returns, Exchanges & Refunds',
    points: [
      'Returns, exchanges, cancellations, and refunds are governed by our separate Return & Exchange Policy.',
      'Customers should review the Return & Exchange Policy before placing an order.',
      'Where a return or exchange is approved, the applicable conditions, time limits, inspection requirements, and delivery charges in that policy will apply.',
    ],
  },
  {
    icon: ShieldAlert,
    title: '6. Customer Responsibilities',
    points: [
      'You agree to provide accurate information when placing an order.',
      'You must not use the website for unlawful, fraudulent, abusive, or unauthorised purposes.',
      'You must not attempt to interfere with the website, its security, its services, or its underlying systems.',
      'You are responsible for checking your order details, including product, size, quantity, delivery address, and contact information, before completing checkout.',
    ],
  },
  {
    icon: Copyright,
    title: '7. Intellectual Property & Fan-Inspired Designs',
    points: [
      'The ComicCulture name, logo, website content, original artwork, photographs, text, graphics, and other original materials are owned by or used by ComicCulture with appropriate permission where applicable.',
      'You may not copy, reproduce, modify, distribute, sell, or commercially exploit ComicCulture-owned content without permission.',
      'Some ComicCulture designs are inspired by characters, stories, or fictional universes owned by their respective rights holders.',
      'ComicCulture is not affiliated with, endorsed by, or sponsored by Marvel, Sony, DC, or other respective intellectual property owners unless explicitly stated.',
    ],
  },
  {
    icon: Scale,
    title: '8. Website Availability & Liability',
    points: [
      'We aim to keep the website accurate, secure, and available, but we do not guarantee that it will always be uninterrupted, error-free, or available at all times.',
      'We are not responsible for delays or failures caused by circumstances outside our reasonable control, including courier delays, network interruptions, supplier issues, or other third-party service disruptions.',
      'Nothing in these terms is intended to exclude or limit any rights or protections that cannot lawfully be excluded or limited under applicable law.',
    ],
  },
  {
    icon: Mail,
    title: '9. Contact & Changes to These Terms',
    points: [
      'If you have questions about these Terms and Conditions, please contact ComicCulture through the official contact channels provided on our website.',
      'We may update these terms from time to time to reflect changes to our services, policies, or legal requirements.',
      'Any updated version will be published on this page. Your continued use of the website after an update constitutes acceptance of the updated terms, to the extent permitted by law.',
    ],
  },
];

export default function TermsAndConditions() {
  const canonicalUrl = `${SITE_URL}/terms-and-conditions`;

  const breadcrumbJsonLd: JsonLdBlock = {
    id: 'breadcrumb',
    data: {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Terms & Conditions',
          item: canonicalUrl,
        },
      ],
    },
  };

  return (
    <>
      <SEO
        title="Terms & Conditions | ComicCulture"
        description="Read the Terms & Conditions for using the ComicCulture website and placing orders for fan-inspired apparel."
        canonical={canonicalUrl}
        ogType="website"
        jsonLd={[breadcrumbJsonLd]}
      />

      <section className="relative min-h-screen bg-background py-24 lg:py-32">
        <div className="absolute inset-0 bg-web-pattern opacity-10" />

        <div className="relative z-10 mx-auto max-w-4xl px-6">
          <nav className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Link to="/" className="transition-colors hover:text-foreground">
              Home
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-muted">Terms &amp; Conditions</span>
          </nav>

          <Link
            to="/"
            className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="mb-3 font-display text-3xl tracking-wide text-foreground md:text-4xl">
              TERMS &amp; CONDITIONS
            </h1>
            <p className="mb-3 text-sm text-muted-foreground md:text-base">
              These Terms and Conditions govern your use of the ComicCulture website and
              your purchase of products from ComicCulture.
            </p>
            <p className="mb-10 text-xs text-muted-foreground">
              Last updated: October 8, 2026
            </p>
          </motion.div>

          <div className="space-y-6">
            {SECTIONS.map((section, index) => (
              <motion.div
                key={section.title}
                className="glass rounded-2xl p-6 lg:p-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.05 * index }}
              >
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/20">
                    <section.icon className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <h2 className="font-display text-lg tracking-wide text-foreground md:text-xl">
                    {section.title}
                  </h2>
                </div>

                <ul className="space-y-2.5">
                  {section.points.map((point) => (
                    <li key={point} className="flex gap-3 text-sm text-muted-foreground">
                      <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}

            <motion.div
              className="rounded-2xl border border-primary bg-primary/10 p-6 lg:p-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05 * SECTIONS.length }}
            >
              <p className="text-sm text-muted-foreground">
                These Terms and Conditions are intended as general website terms and are
                not a substitute for legal advice. If you need terms tailored to a specific
                business structure or legal requirements, have them reviewed by a qualified
                legal professional in Sri Lanka.
              </p>
            </motion.div>
          </div>

          <p className="mt-10 text-center text-sm text-muted-foreground">
            Thank you for choosing ComicCulture.
          </p>
        </div>
      </section>
    </>
  );
}
