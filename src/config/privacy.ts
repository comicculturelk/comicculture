// Shared by the React page and server-rendered page so the notice stays consistent.
export const PRIVACY_UPDATED_ON = '15 November 2026';

export const PRIVACY_SECTIONS = [
  {
    title: 'Who we are and how to contact us',
    paragraphs: ['ComicCulture is a fan-apparel store based in Colombo, Sri Lanka. This notice explains how we handle personal information when you browse, order from, or contact our store. For privacy questions or requests, email the support address below.'],
  },
  {
    title: 'Information we collect',
    paragraphs: [
      'When you order, we collect your name, email address, phone number, delivery address, district, selected items, sizes, quantities and payment method. You may also provide an alternate phone number or additional address details.',
      'For bank transfers, we collect the payment receipt you upload and the payment verification record. Receipts may include your name, bank details and transaction reference. Upload only the information needed to verify your payment; do not send passwords, PINs or unrelated account information. We do not collect card numbers through this checkout.',
      'If you contact us, we receive the information you choose to share, such as your question, order reference and photos of an item. Published customer feedback may include a name, location, rating, product name and review text, shared with permission.',
      'Our hosting and security providers may process technical information such as your IP address, browser and device details, request times and security events. Checkout security also uses request identifiers and rate-limit records to prevent abuse.',
    ],
  },
  {
    title: 'How we use your information',
    paragraphs: ['We use order and contact details to fulfil purchases, verify bank transfers, arrange delivery, send order confirmations and status updates, provide tracking, handle enquiries, and manage returns or exchanges. We use technical information to operate the website, troubleshoot problems and protect checkout against fraud or automated abuse. We also keep transaction records for reconciliation, disputes and applicable recordkeeping obligations. Placing an order does not subscribe you to marketing messages.'],
  },
  {
    title: 'Who receives information',
    paragraphs: [
      'Authorised store staff use the information needed to manage orders and support requests. Our delivery courier receives the contact, address and parcel information needed to deliver your order and collect cash on delivery where applicable.',
      'We use Supabase for database and file storage, Vercel for website hosting, Resend for order emails, and Cloudflare Turnstile for checkout security. These providers process information needed to deliver their services. Cloudflare may receive your IP address and browser signals during security verification. Cloud services may process or store information outside Sri Lanka.',
      'We may disclose relevant records where required by applicable law or to resolve a dispute or protect the store and its customers. We do not sell customer information.',
    ],
  },
  {
    title: 'Browser storage and security tools',
    paragraphs: [
      'The cart is saved in local storage on your browser so it can remain available when you return on the same browser. Clearing site data removes that saved cart. Staff sign-in also uses browser storage for authentication sessions. Guest checkout does not require a customer account.',
      'Cloudflare Turnstile and our infrastructure providers may use storage or cookies needed for security and service operation. We do not use advertising pixels.',
      'Optional checkout analytics is off until you turn it on in the preference above. We use a random browser session ID lasting up to 24 hours, a broad screen-size category and product identifiers to count product views, cart additions, checkout starts and successful order placements. We use this to improve checkout. The analytics records exclude names, contact details, addresses, bank details, receipt information and form contents.',
      'Turning analytics off clears the current identifier and stops future collection. We also respect Global Privacy Control and Do Not Track signals. Existing analytics events expire after 90 days. Technical rate-limit records use a keyed version of the requesting network address for abuse prevention and are separate from analytics reports.',
    ],
  },
  {
    title: 'Retention and protection',
    paragraphs: [
      'We retain order, payment, receipt and support records for as long as needed to fulfil orders, reconcile payments, handle returns and disputes, and meet applicable recordkeeping obligations. Retention depends on the type of record and any unresolved issue. Contact us to ask about the records relating to you or request deletion when they are no longer needed.',
      'Payment receipts are kept in private storage with access restricted to authorised staff. We use access controls and secure connections, but no website or transmission method can guarantee complete security. Your saved cart remains in your browser until it is changed, cleared after checkout, or removed by clearing site data.',
    ],
  },
  {
    title: 'Your choices and privacy requests',
    paragraphs: [
      'You can ask us what personal information we hold about you, request a correction, or ask us to delete information or restrict its use. Where processing relies on your consent, you may ask to withdraw it. We will explain what we can do, including any records we need to retain and any rights that apply under the law in force at the time.',
      'Email us with your request and, if relevant, your order reference. We may ask for proportionate information to verify your identity before sharing or changing records. Do not send identity documents or sensitive bank information unless we explain why they are needed. If you have a concern, contact us first; you can also seek guidance from Sri Lanka’s Data Protection Authority at www.dpa.gov.lk.',
    ],
  },
  {
    title: 'External services and updates',
    paragraphs: ['Links to WhatsApp, Instagram and courier tracking take you to other services. Information you provide there is handled under their privacy policies as well as our handling of messages we receive. We may update this notice as the store changes; the date above identifies the latest update.'],
  },
] as const;
