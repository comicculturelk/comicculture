export interface Product {
  id: string;
  name: string;
  slug: string;
  collection: string;
  tagline: string;
  description: string;
  lore: string;
  price: number;
  sizes: string[];
  image: string;
  images?: string[];
  instagramLink: string;
  featured?: boolean;
}

export function formatPrice(price: number): string {
  return `Rs. ${price}`;
}

export function generateWhatsAppMessage(product: Product, size: string): string {
  const message = `Hi! I'd like to order the ${product.name} jersey in size ${size} from ComicCulture. Is it available?`;
  return encodeURIComponent(message);
}

export const products: Product[] = [
  {
    id: 'classic-red',
    name: 'The Classic Red',
    slug: 'classic-red',
    collection: 'Drop 01',
    tagline: 'The Original',
    description: 'Premium football jersey inspired by the classic Spider-Man suit. Features breathable mesh fabric with iconic web pattern embroidery.',
    lore: 'The suit that started everything.',
    price: 3399,
    sizes: ['XS','S', 'M', 'L', 'XL', 'XXL'],
    image: '/images/products/classic-red/front.webp',
    instagramLink: 'https://instagram.com/comicculture.lk',
    featured: true,
  },
  {
    id: 'upgraded-black',
    name: 'The Upgraded Black',
    slug: 'upgraded-black',
    collection: 'Drop 01',
    tagline: 'Evolution',
    description: 'Sleek black variant with red accents. Made with premium moisture-wicking fabric for ultimate comfort.',
    lore: 'The evolution of a legend.',
    price: 3399,
    sizes: ['XS','S', 'M', 'L', 'XL', 'XXL'],
    image: '/images/products/upgraded-black/front.webp',
    instagramLink: 'https://instagram.com/comicculture.lk',
    featured: true,
  },
  {
    id: 'symbiotic-suit',
    name: 'The Symbiotic Suit',
    slug: 'symbiotic-suit',
    collection: 'Drop 01',
    tagline: 'Dark Power',
    description: 'All-black design with subtle white spider emblem. Premium heavyweight fabric with a matte finish.',
    lore: 'Forged from darkness. Built for domination.',
    price: 3399,
    sizes: ['XS','S', 'M', 'L', 'XL', 'XXL'],
    image: '/images/products/symbiotic-suit/front.webp',
    instagramLink: 'https://instagram.com/comicculture.lk',
  },
  {
    id: 'classic-gwen',
    name: 'The Classic Gwen',
    slug: 'classic-gwen',
    collection: 'Drop 01',
    tagline: 'Spider-Gwen',
    description: 'White and pink design inspired by Spider-Gwen. Lightweight fabric with hood-style collar detail.',
    lore: 'Grace, speed and precision.',
    price: 3399,
    sizes: ['XS','S', 'M', 'L', 'XL', 'XXL'],
    image: '/images/products/classic-gwen/front.webp',
    instagramLink: 'https://instagram.com/comicculture.lk',
    featured: true,
  },
  {
    id: 'volt-spider',
    name: 'The Volt Spider',
    slug: 'volt-spider',
    collection: 'Drop 01',
    tagline: 'Electric',
    description: 'Neon yellow and black design with electric accents. Reflective details that glow under UV light.',
    lore: 'Powered by pure energy.',
    price: 3399,
    sizes: ['XS','S', 'M', 'L', 'XL', 'XXL'],
    image: '/images/products/volt-spider/front.webp',
    instagramLink: 'https://instagram.com/comicculture.lk',
  },
  {
    id: 'noir-spider',
    name: 'The Noir Spider',
    slug: 'noir-spider',
    collection: 'Drop 01',
    tagline: 'Dark Hero',
    description: 'Black and white noir-inspired design. Vintage wash finish with distressed details.',
    lore: 'Darkness hides the strongest heroes.',
    price: 3399,
    sizes: ['XS','S', 'M', 'L', 'XL', 'XXL'],
    image: '/images/products/noir-spider/coming-soon-noir.webp',
    instagramLink: 'https://instagram.com/comicculture.lk',
  },
];

export const collections = [
  {
    name: 'Drop 01',
    subtitle: 'Brand New Day',
    description: 'Our debut collection inspired by the Spider-Verse.',
    products: products.filter((p) => p.collection === 'Drop 01'),
  },
];
