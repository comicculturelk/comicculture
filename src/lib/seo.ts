import type { Product } from '../data/products.ts';
import type { Collection } from '../data/collections.ts';
import { PRODUCT_TYPE_LABELS } from '../config/catalog.ts';
import { STORE_CONFIG } from '../config/store.ts';

export const SITE_URL = 'https://comicculture.lk';
export const HOME_TITLE = 'Superhero T-Shirts & Jerseys in Sri Lanka | ComicCulture';
export const HOME_DESCRIPTION = 'Discover ComicCulture fan apparel in Sri Lanka. Explore new superhero T-shirt and jersey designs, browse collections, and find your next everyday fit.';
export const SHOP_DESCRIPTION = 'Shop fan-inspired T-shirts and jerseys from ComicCulture in Sri Lanka. Explore comic and superhero designs, compare fits, and check size guides before ordering.';
export const UTILITY_PATHS = ['/admin', '/checkout', '/order-success', '/track-order'];
export const STATIC_SEO: Record<string, { title: string; description: string }> = {
  '/': { title: HOME_TITLE, description: HOME_DESCRIPTION },
  '/shop': { title: 'Shop Fan T-Shirts & Jerseys in Sri Lanka | ComicCulture', description: SHOP_DESCRIPTION },
  '/about': { title: 'About ComicCulture | Fan Apparel from Sri Lanka', description: 'Meet ComicCulture, a Sri Lankan brand creating fan-inspired apparel for comics, superheroes, and pop culture.' },
  '/faq': { title: 'Ordering, Sizing & Delivery FAQ | ComicCulture', description: 'Answers to common questions about ComicCulture sizing, payments, delivery in Sri Lanka, and returns.' },
  '/contact': { title: 'Contact ComicCulture | Order & Product Help', description: 'Contact ComicCulture for help with products, sizing, and existing orders in Sri Lanka.' },
  '/delivery': { title: 'Delivery information | ComicCulture', description: 'Delivery fees, dispatch information and pre-order guidance for ComicCulture orders in Sri Lanka.' },
  '/return-policy': { title: 'Return & Exchange Policy | ComicCulture', description: 'Read the ComicCulture return and exchange policy, including sizing exchanges, damaged items, and return delivery charges.' },
  '/terms-and-conditions': { title: 'Terms & Conditions | ComicCulture', description: 'Read the terms and conditions for shopping with ComicCulture in Sri Lanka.' },
};

export function isIndexableProduct(product: Product): boolean {
  return product.versions.some((version) => version.isActive && version.sizes.length > 0);
}

export function productSeo(product: Product) {
  const types = [...new Set(product.versions.filter((v) => v.isActive).map((v) => PRODUCT_TYPE_LABELS[v.productType]))];
  const context = types.length === 1 && !product.name.toLowerCase().includes(types[0].toLowerCase()) ? ` ${types[0]}` : '';
  const description = product.description?.trim() || product.tagline?.trim() || `Explore ${product.name}, fan-inspired apparel from ComicCulture in Sri Lanka.`;
  return { title: `${product.name}${context} | ComicCulture`, description: description.length > 160 ? `${description.slice(0, 157).trimEnd()}…` : description };
}

export function collectionSeo(collection: Collection) {
  const description = collection.description?.trim() || collection.tagline?.trim() || `Explore ${collection.name}: fan-inspired apparel from ComicCulture in Sri Lanka. Check available designs, fits, and sizes.`;
  return { title: `${collection.name} | Fan Apparel Sri Lanka | ComicCulture`, description: `${description}${collection.status === 'soon' ? ' Coming soon.' : ''}`.slice(0, 160) };
}

export const STORE_SCHEMA = {
  '@context': 'https://schema.org', '@type': 'OnlineStore', '@id': `${SITE_URL}/#store`,
  name: 'ComicCulture', url: `${SITE_URL}/`, logo: `${SITE_URL}/images/logo/comicculture-logo.png`,
  sameAs: ['https://instagram.com/comicculture.lk'], areaServed: { '@type': 'Country', name: 'Sri Lanka' },
};

export const RETURN_POLICY = {
  '@type': 'MerchantReturnPolicy', returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
  merchantReturnDays: 3, returnFees: 'https://schema.org/ReturnFeesCustomerResponsibility',
  returnMethod: 'https://schema.org/ReturnByMail', applicableCountry: 'LK', merchantReturnLink: `${SITE_URL}/return-policy`,
};

function shippingDetails(preorder: boolean) {
  return {
    '@type': 'OfferShippingDetails',
    shippingRate: { '@type': 'MonetaryAmount', value: STORE_CONFIG.deliveryFee, currency: STORE_CONFIG.currency },
    shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'LK' },
    // Do not describe preorders as having the standard dispatch time.
    ...(!preorder ? { deliveryTime: { '@type': 'ShippingDeliveryTime',
      handlingTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 2, unitCode: 'DAY' },
      transitTime: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 4, unitCode: 'DAY' } } } : {}),
  };
}

export function productSchema(product: Product): Record<string, unknown> {
  const url = `${SITE_URL}/product/${product.slug}`;
  const variants = product.versions.filter((v) => v.isActive).flatMap((version) => version.sizes.map((size) => ({
    '@type': 'Product', '@id': `${url}#${size.id}`, sku: size.sku,
    name: `${product.name} — ${version.versionName} — ${size.size}`,
    description: productSeo(product).description, size: size.size,
    image: version.images?.[0] || product.image,
    ...(version.color ? { color: version.color } : {}), ...(version.material ? { material: version.material } : {}),
    brand: { '@type': 'Brand', name: 'ComicCulture' },
    offers: { '@type': 'Offer', url: `${url}?variant=${encodeURIComponent(size.id)}`,
      price: size.price, priceCurrency: STORE_CONFIG.currency,
      availability: size.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      seller: { '@id': `${SITE_URL}/#store` }, hasMerchantReturnPolicy: RETURN_POLICY,
      shippingDetails: shippingDetails(version.isPreorder) },
  })));
  return { '@context': 'https://schema.org', '@type': 'ProductGroup', '@id': `${url}#group`, url,
    productGroupID: product.productCode, name: product.name, description: productSeo(product).description,
    image: product.images?.length ? product.images : [product.image], brand: { '@type': 'Brand', name: 'ComicCulture' },
    variesBy: ['https://schema.org/size', 'https://schema.org/color', 'https://schema.org/material'], hasVariant: variants };
}

export function breadcrumbs(name: string, path: string) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
    { '@type': 'ListItem', position: 2, name: 'Shop', item: `${SITE_URL}/shop` },
    { '@type': 'ListItem', position: 3, name, item: `${SITE_URL}${path}` },
  ] };
}
