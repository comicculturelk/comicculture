import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  PackageX,
  RefreshCw,
  Ruler,
  ShieldAlert,
  Truck,
  Landmark,
  Banknote,
  ClipboardList,
  Sparkles,
  Info,
} from 'lucide-react';

interface PolicySection {
  icon: typeof PackageX;
  title: string;
  intro?: string;
  points: string[];
}

const SECTIONS: PolicySection[] = [
  {
    icon: PackageX,
    title: '1. Order Changes & Cancellations',
    points: [
      'Order changes or cancellations can only be requested before the order is dispatched.',
      'Once an order has been dispatched, we are unable to guarantee changes or cancellations.',
      'Some products may require special stock arrangements from our suppliers. Once stock has been arranged for a confirmed order, cancellations may not be possible.',
    ],
  },
  {
    icon: RefreshCw,
    title: '2. Change of Mind Returns',
    intro:
      "We understand that customers' preferences may change. However, returns due to a change of mind, incorrect size selection, or no longer needing the product are subject to the following conditions:",
    points: [
      'The customer must contact ComicCulture within 3 days of receiving the order.',
      'The product must be unused, unworn, unwashed, and returned with original packaging and tags.',
      'The product must also be free from stains, damage, alterations, or any signs of use.',
      'The customer is responsible for all return delivery charges.',
      'Refunds or exchanges will only be processed after the returned product has been received and inspected.',
    ],
  },
  {
    icon: Ruler,
    title: '3. Size Exchanges',
    points: [
      'Customers are encouraged to check our size guide before placing an order.',
      'Size exchanges are possible depending on available stock.',
      "Return delivery charges for size exchanges are the customer's responsibility unless the incorrect size was sent by ComicCulture.",
    ],
  },
  {
    icon: ShieldAlert,
    title: '4. Damaged, Defective, or Incorrect Items',
    intro: 'If you receive a product that is:',
    points: ['Damaged', 'Defective', 'Different from the item you ordered'],
  },
  {
    icon: Truck,
    title: '5. Cash on Delivery (COD) Orders',
    points: [
      'By placing a COD order, customers confirm that they are willing to accept the parcel upon delivery.',
      'If a customer refuses a confirmed COD order at the time of delivery without a valid reason, the order will be considered a failed delivery.',
      'Customers with repeated refused COD orders may be required to make an advance payment or use bank transfer/prepaid payment methods for future orders.',
    ],
  },
  {
    icon: Landmark,
    title: '6. Bank Transfer Orders',
    points: [
      'Bank transfer orders are considered confirmed once payment has been received and verified.',
      'If a customer requests a cancellation before dispatch, we will review the request based on the order status and whether stock has already been arranged.',
      'For approved returns after delivery due to a change of mind, the customer is responsible for return delivery charges.',
      'Refunds for approved returns will be processed after we receive and inspect the returned product.',
      "Bank transfer refunds will be made to the customer's provided bank account after approval.",
    ],
  },
  {
    icon: Banknote,
    title: '7. Refund Policy',
    points: [
      'Refunds are only processed after returned items have been received and checked.',
      'Delivery charges are non-refundable unless the issue was caused by ComicCulture.',
      'Refund processing time may vary depending on the payment method and bank processing times.',
    ],
  },
  {
    icon: ClipboardList,
    title: '8. How to Request a Return or Exchange',
    intro:
      'To request a return or exchange, customers must contact ComicCulture through our official customer support channels within the required timeframe. Please provide:',
    points: [
      'Order reference number',
      'Customer name',
      'Reason for return/exchange',
      'Photos/videos if the item is damaged, defective, or incorrect',
    ],
  },
  {
    icon: Sparkles,
    title: '9. Limited Edition Products',
    points: [
      'Due to the limited nature of some ComicCulture releases, certain products or collections may have restricted return or exchange availability.',
      'Any such restrictions will be clearly communicated before purchase.',
    ],
  },
];

export default function ReturnPolicy() {
  return (
    <section className="relative min-h-screen bg-background py-24 lg:py-32">
      <div className="absolute inset-0 bg-web-pattern opacity-10" />

      <div className="relative z-10 mx-auto max-w-4xl px-6">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link to="/" className="transition-colors hover:text-foreground">
            Home
          </Link>
          <span>/</span>
          <span className="text-muted">Return & Exchange Policy</span>
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
          <h1 className="mb-3 font-display text-3xl text-foreground tracking-wide md:text-4xl">
            RETURN &amp; EXCHANGE POLICY
          </h1>
          <p className="mb-10 text-sm text-muted-foreground md:text-base">
            At ComicCulture, we want every customer to have the best experience with our
            products. Please read our return and exchange guidelines before placing your
            order.
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
                <h2 className="font-display text-lg text-foreground tracking-wide md:text-xl">
                  {section.title}
                </h2>
              </div>

              {section.intro && (
                <p className="mb-3 text-sm text-muted-foreground">{section.intro}</p>
              )}

              <ul className="space-y-2.5">
                {section.points.map((point) => (
                  <li key={point} className="flex gap-3 text-sm text-muted-foreground">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>

              {section.title.startsWith('4.') && (
                <p className="mt-4 text-sm text-muted-foreground">
                  Please contact us within 3 days of receiving your order and provide
                  relevant photos/videos. ComicCulture will arrange a replacement, exchange,
                  or another suitable solution depending on the situation.
                </p>
              )}

              {section.title.startsWith('8.') && (
                <p className="mt-4 text-sm text-muted-foreground">
                  Requests submitted after the stated timeframe may not be accepted.
                </p>
              )}
            </motion.div>
          ))}

          {/* Important note */}
          <motion.div
            className="flex gap-3 rounded-2xl border border-primary bg-primary/10 p-6 lg:p-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 * SECTIONS.length }}
          >
            <Info className="h-5 w-5 flex-shrink-0 text-primary" />
            <div>
              <h2 className="mb-2 font-display text-lg text-foreground tracking-wide">
                10. Important Note About Limited Stock
              </h2>
              <p className="text-sm text-muted-foreground">
                ComicCulture products are available in limited quantities. Some sizes and
                designs may require special stock arrangements from our suppliers. We kindly
                request customers to confirm their order details, sizes, and designs before
                completing their purchase.
              </p>
            </div>
          </motion.div>
        </div>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          Thank you for supporting ComicCulture ❤️
        </p>
      </div>
    </section>
  );
}
