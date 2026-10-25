import type { Catalog } from './catalog.js';
import { SITE_URL, STATIC_SEO, STORE_SCHEMA, UTILITY_PATHS, productSeo, collectionSeo, productSchema, breadcrumbs, isIndexableProduct } from '../src/lib/seo.js';

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export const serializeJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
export const isUtilityPath = (path: string) => UTILITY_PATHS.includes(path);

/** Same public information for people and crawlers; React takes over after load. */
export function buildSeoPage(path: string, catalog: Catalog = { products: [], collections: [] }) {
  let status = 200;
  let robots = isUtilityPath(path) ? 'noindex,follow' : 'index,follow';
  let metadata = STATIC_SEO[path];
  let image = `${SITE_URL}/images/logo/comicculture-logo.png`;
  let schema: Record<string, unknown>[] = [];
  let content = '';
  const products = catalog.products.filter(isIndexableProduct);
  const list = (rows: typeof products) => `<ul>${rows.map((p) => `<li><a href="/product/${escapeHtml(p.slug)}">${escapeHtml(p.name)}</a></li>`).join('')}</ul>`;
  const productMatch = path.match(/^\/product\/([^/]+)$/);
  const collectionMatch = path.match(/^\/collections\/([^/]+)$/);
  if (productMatch) {
    const product = catalog.products.find((p) => p.slug === productMatch[1]);
    if (product) {
      metadata = productSeo(product);
      image = product.image;
      if (!isIndexableProduct(product)) robots = 'noindex,follow';
      else schema = [STORE_SCHEMA, productSchema(product), breadcrumbs(product.name, path)];
      content = `<h1>${escapeHtml(product.name)}</h1><p>${escapeHtml(product.description || product.tagline)}</p><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" width="640" height="640" style="max-width:100%;height:auto"><ul>${product.versions.filter((v) => v.isActive).flatMap((v) => v.sizes.map((s) => `<li>${escapeHtml(v.versionName)} — ${escapeHtml(s.size)}: LKR ${s.price}; ${s.stock > 0 ? 'In stock' : 'Out of stock'}</li>`)).join('')}</ul><a href="/delivery">Delivery information</a> · <a href="/return-policy">Returns and exchanges</a>`;
    }
  } else if (collectionMatch) {
    const collection = catalog.collections.find((c) => c.slug === collectionMatch[1]);
    if (collection) {
      metadata = collectionSeo(collection);
      image = collection.coverImage || image;
      if (collection.status !== 'live') robots = 'noindex,follow';
      const items = products.filter((p) => p.collectionId === collection.id);
      content = `<h1>${escapeHtml(collection.name)}</h1><p>${escapeHtml(metadata.description)}</p>${list(items)}`;
      schema = [breadcrumbs(collection.name, path), { '@context': 'https://schema.org', '@type': 'CollectionPage', name: collection.name, url: `${SITE_URL}${path}`,
        mainEntity: { '@type': 'ItemList', itemListElement: items.map((p, index) => ({ '@type': 'ListItem', position: index + 1, name: p.name, url: `${SITE_URL}/product/${p.slug}` })) } }];
    }
  } else if (path === '/' || path === '/shop') {
    schema = [STORE_SCHEMA, { '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${SITE_URL}/#website`, name: 'ComicCulture', url: `${SITE_URL}/` }];
    content = `<h1>${escapeHtml(metadata.title.split(' | ')[0])}</h1><p>${escapeHtml(metadata.description)}</p>${list(products)}<h2>Collections</h2><ul>${catalog.collections.filter((c) => c.status === 'live').map((c) => `<li><a href="/collections/${escapeHtml(c.slug)}">${escapeHtml(c.name)}</a></li>`).join('')}</ul>`;
  }
  if (isUtilityPath(path)) metadata = { title: 'ComicCulture', description: 'ComicCulture shopping and order support.' };
  if (!metadata) {
    status = 404;
    robots = 'noindex,follow';
    metadata = { title: 'Page not found | ComicCulture', description: 'This page could not be found. Explore the ComicCulture shop.' };
    content = '<h1>Page not found</h1><p>This page does not exist.</p>';
  }
  if (!content) content = `<h1>${escapeHtml(metadata.title.split(' | ')[0])}</h1><p>${escapeHtml(metadata.description)}</p>`;
  const head = `<title>${escapeHtml(metadata.title)}</title><meta name="description" content="${escapeHtml(metadata.description)}"><meta name="robots" content="${robots}"><link rel="canonical" href="${SITE_URL}${escapeHtml(path)}">` +
    [['og:type', productMatch ? 'product' : 'website'], ['og:title', metadata.title], ['og:description', metadata.description], ['og:url', `${SITE_URL}${path}`], ['og:image', image], ['og:site_name', 'ComicCulture']].map(([key, value]) => `<meta property="${key}" content="${escapeHtml(value)}">`).join('') +
    [['twitter:card', 'summary_large_image'], ['twitter:title', metadata.title], ['twitter:description', metadata.description], ['twitter:image', image]].map(([key, value]) => `<meta name="${key}" content="${escapeHtml(value)}">`).join('') +
    `<script type="application/ld+json" id="jsonld-initial">${serializeJson(schema)}</script>`;
  return { status, robots, head, content: `<main style="max-width:70rem;margin:3rem auto;padding:1rem;font-family:system-ui"><nav><a href="/">ComicCulture</a> · <a href="/shop">Shop</a></nav>${content}</main>` };
}

export function renderSeoHtml(template: string, page: ReturnType<typeof buildSeoPage>) {
  return template.replace(/<title>[\s\S]*?<\/title>|<meta\s+[^>]*(?:name="(?:description|robots|twitter:[^"]+)"|property="og:[^"]+")[^>]*>|<link[^>]*rel="canonical"[^>]*>/gi, '')
    .replace('</head>', `${page.head}</head>`).replace('<div id="root"></div>', `<div id="root">${page.content}</div>`);
}
