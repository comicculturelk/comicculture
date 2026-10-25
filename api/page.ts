import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchCatalog } from '../server/catalog.ts';
import { buildSeoPage, isUtilityPath, renderSeoHtml } from '../server/seo.ts';

interface PageRequest { query: { path?: string | string[] }; method?: string }
interface PageResponse { setHeader(name: string, value: string): void; status(code: number): PageResponse; send(body: string): void }

export default async function handler(req: PageRequest, res: PageResponse) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.method && !['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD'); res.status(405).send('Method not allowed'); return;
  }
  const path = `/${Array.isArray(req.query.path) ? req.query.path.join('/') : req.query.path || ''}`.replace(/\/$/, '') || '/';
  try {
    const template = await readFile(join(process.cwd(), 'dist', 'index.html'), 'utf8');
    const needsCatalog = path === '/' || path === '/shop' || /^\/(product|collections)\/[^/]+$/.test(path);
    const page = buildSeoPage(path, needsCatalog ? await fetchCatalog() : undefined);
    res.setHeader('X-Robots-Tag', page.robots);
    res.setHeader('Cache-Control', isUtilityPath(path) || page.status !== 200 ? 'private, no-store' : 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    res.status(page.status).send(req.method === 'HEAD' ? '' : renderSeoHtml(template, page));
  } catch {
    // A catalog outage must not turn real products into cached 404s.
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Retry-After', '60');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.status(503).send('The store is temporarily unavailable. Please try again shortly.');
  }
}
