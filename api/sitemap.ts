// Vercel Serverless Function — generates sitemap.xml dynamically from
// Supabase at request time. New products/collections appear automatically
// as soon as they're saved — no manual edit, no rebuild/redeploy required.
//
// Deliberately self-contained: queries Supabase's REST API directly via
// native fetch rather than importing src/lib/supabase.ts, since that file
// relies on Vite's `import.meta.env` (a browser/build-time construct not
// available in this Node serverless runtime) and pulling it in here would
// couple an isolated API route to the Vite app's module graph. No new
// dependency is added.

const SITE_URL = 'https://comicculture.lk';

// Keep in sync with the routes that should be publicly indexable.
// Deliberately excludes /admin, /checkout, /order-success, /track-order,
// and any other private/utility route.
const STATIC_PATHS = ['/', '/shop', '/about', '/faq', '/contact', '/return-policy'];

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function urlEntry(path: string): string {
  const loc = path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`;
  return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n  </url>`;
}

export default async function handler(req: any, res: any) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  const entries: string[] = STATIC_PATHS.map(urlEntry);

  // Falls back to static-only URLs if Supabase is unreachable or env vars
  // are missing, so a transient outage never takes the whole sitemap down.
  if (supabaseUrl && supabaseKey) {
    try {
      const [productsRes, collectionsRes] = await Promise.all([
        fetch(`${supabaseUrl}/rest/v1/products?select=slug`, {
          headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
        }),
        // Only 'live' collections are sitemap-eligible — matches the
        // original static sitemap's rule of excluding 'soon' collections.
        fetch(`${supabaseUrl}/rest/v1/collections?select=slug&status=eq.live`, {
          headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
        }),
      ]);

      if (productsRes.ok) {
        const products: { slug: string }[] = await productsRes.json();
        products.forEach((p) => {
          if (p.slug) entries.push(urlEntry(`/product/${p.slug}`));
        });
      }

      if (collectionsRes.ok) {
        const collections: { slug: string }[] = await collectionsRes.json();
        collections.forEach((c) => {
          if (c.slug) entries.push(urlEntry(`/collections/${c.slug}`));
        });
      }
    } catch {
      // Swallow — serve the static URLs only rather than failing the request.
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  // Cached at the edge for an hour so normal crawl traffic doesn't hit
  // Supabase on every request; stale-while-revalidate keeps it non-blocking.
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(xml);
}
