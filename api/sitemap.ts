import { fetchCatalog } from '../server/catalog.js';
import { isIndexableProduct, SITE_URL, STATIC_SEO } from '../src/lib/seo.js';
import { escapeHtml } from '../server/seo.js';

interface SitemapResponse {
  setHeader(name: string, value: string): void;
  status(code: number): SitemapResponse;
  send(body: string): void;
}

export default async function handler(_req: unknown, res: SitemapResponse) {
  try {
    const { products, collections } = await fetchCatalog();
    const paths = [...Object.keys(STATIC_SEO),
      ...products.filter(isIndexableProduct).map((p) => `/product/${p.slug}`),
      ...collections.filter((c) => c.status === 'live').map((c) => `/collections/${c.slug}`),
    ];
    const entries = [...new Set(paths)].map((path) => `  <url><loc>${escapeHtml(`${SITE_URL}${path === '/' ? '/' : path}`)}</loc></url>`).join('\n');
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`);
  } catch {
    // Ask Google to retry instead of serving a successful, incomplete sitemap.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Retry-After', '60');
    res.status(503).send('Sitemap temporarily unavailable. Please retry.');
  }
}
