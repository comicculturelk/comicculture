import { NEW_PRODUCT_DAYS } from '../config/merchandising';
import { PRODUCT_TYPE_LABELS, formatPrice, getProductMinPrice, type Product, type ProductVersion } from '../data/products';

export function isNewProduct(product: Product, now = Date.now()): boolean {
  const age = now - new Date(product.createdAt).getTime();
  return Number.isFinite(age) && age >= 0 && age < NEW_PRODUCT_DAYS * 86400000;
}

export function getProductSummary(product: Product, version: ProductVersion | undefined = product.versions.find((item) => item.isActive)): string {
  if (!version) return product.description || product.tagline;
  const feature = /glow.in.the.dark/i.test(product.description) ? 'Glow-in-the-dark ink' : version.fit;
  return [PRODUCT_TYPE_LABELS[version.productType], feature].filter(Boolean).join(' · ');
}

export function getProductImages(product: Product): string[] {
  const version = product.versions.find((item) => item.isActive);
  return [...new Set([product.image, ...(version?.images ?? []), ...(product.images ?? [])].filter(Boolean))];
}

export function getProductPriceLabel(product: Product): string {
  const prices = product.versions.filter((version) => version.isActive).flatMap((version) => version.sizes.map((size) => size.price));
  const minimum = getProductMinPrice(product);
  return minimum > 0 ? `${new Set(prices).size > 1 ? 'From ' : ''}${formatPrice(minimum)}` : 'Unavailable';
}
