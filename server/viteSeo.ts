import { readFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { fetchCatalog } from './catalog.js';
import { buildSeoPage, isUtilityPath, renderSeoHtml } from './seo.js';
import sitemap from '../api/sitemap.js';

/** Exercise production SEO/status behavior locally, including without JavaScript. */
export function seoPlugin(): Plugin {
  const middleware = (template: (url: string) => Promise<string>) => async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (['/index.html', '/app.html'].includes(url.pathname)) { res.statusCode = 308; res.setHeader('Location', '/'); res.end(); return; }
    if (url.pathname === '/sitemap.xml') {
      await sitemap(req, { setHeader: (name, value) => { res.setHeader(name, value); }, status(code) { res.statusCode = code; return this; }, send: (body) => { res.end(body); } });
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method || '') || /^\/(?:@|src\/|node_modules\/|assets\/|images\/|api\/)/.test(url.pathname) || /\.(?:js|css|map|png|jpe?g|svg|ico|webp|avif|woff2?|ttf|txt|xml|json)$/i.test(url.pathname)) { next(); return; }
    try {
      const path = url.pathname.replace(/\/$/, '') || '/';
      const needsCatalog = path === '/' || path === '/shop' || /^\/(product|collections)\/[^/]+$/.test(path);
      const page = buildSeoPage(path, needsCatalog ? await fetchCatalog() : undefined);
      res.statusCode = page.status;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Robots-Tag', page.robots);
      res.setHeader('Cache-Control', isUtilityPath(path) ? 'private, no-store' : 'no-cache');
      res.end(req.method === 'HEAD' ? '' : renderSeoHtml(await template(req.url || '/'), page));
    } catch {
      res.statusCode = 503; res.setHeader('Cache-Control', 'no-store'); res.setHeader('Retry-After', '60');
      res.end('The store is temporarily unavailable. Please try again shortly.');
    }
  };
  return {
    name: 'comicculture-seo',
    async writeBundle(options) {
      // Vercel serves an existing index.html before rewrites. Keep the app
      // template under another name so / reaches the same handler as products.
      if (options.dir) await rename(resolve(options.dir, 'index.html'), resolve(options.dir, 'app.html'));
    },
    configureServer(server) {
      server.middlewares.use(middleware(async (url) => server.transformIndexHtml(url, await readFile(resolve('index.html'), 'utf8'))));
    },
    async configurePreviewServer(server) {
      const config: { headers: { source: string; headers: { key: string; value: string }[] }[] } = JSON.parse(await readFile(resolve('vercel.json'), 'utf8'));
      const securityHeaders = config.headers.find(rule => rule.source === '/(.*)')?.headers ?? [];
      server.middlewares.use((_req, res, next) => {
        for (const header of securityHeaders) res.setHeader(header.key, header.value);
        next();
      });
      server.middlewares.use(middleware(() => readFile(resolve('dist/app.html'), 'utf8')));
    },
  };
}
