/**
 * Converts a string into a URL-safe slug.
 * Generic by design — reusable by any feature needing slugs
 * (products, collections, banners, etc.), not just products.
 */
export function slugify(text: string): string {
  return text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
