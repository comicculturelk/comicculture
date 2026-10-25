import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { compileSeoRuntime } from './seo-runtime.mjs';

const load = await compileSeoRuntime();
const { productSeo, productSchema, isIndexableProduct, STATIC_SEO } = await load('src/lib/seo.js');
const { buildSeoPage, renderSeoHtml, serializeJson } = await load('server/seo.js');
const { default: pageHandler } = await load('api/page.js');
const { default: sitemapHandler } = await load('api/sitemap.js');

const product = {
  id: 'design', productCode: 'CC-P000007', name: 'Arc Reactor', slug: 'arc-reactor',
  description: 'Cotton T-shirt with glow-in-the-dark ink.', tagline: 'Stark tech',
  collectionId: 'collection', collection: 'Limited Edition', image: 'https://example.invalid/photo.jpg',
  versions: [{ id: 'edition', versionName: 'Cotton', productType: 'oversized_tshirt', isActive: true,
    isPreorder: false, material: 'Cotton', color: 'Red', sizes: [
      { id: 'small', size: 'S', sku: 'ARC-S', price: 3490, stock: 0 },
      { id: 'medium', size: 'M', sku: 'ARC-M', price: 3490, stock: 4 },
    ] }],
};
const collection = { id: 'collection', name: 'Limited Edition', slug: 'limited-edition', status: 'live' };
const catalog = { products: [product], collections: [collection] };

test('server product HTML contains specific metadata, readable content, links, and all variant offers', () => {
  const page = buildSeoPage('/product/arc-reactor', catalog);
  const html = renderSeoHtml(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), page);
  assert.equal(page.status, 200);
  assert.match(html, /Arc Reactor Oversized T-Shirt \| ComicCulture/);
  assert.match(html, /<h1>Arc Reactor<\/h1>/);
  assert.match(html, /LKR 3490/);
  assert.match(html, /href="\/delivery"/);
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
  const schema = productSchema(product);
  assert.equal(schema.productGroupID, product.productCode);
  assert.equal(schema.hasVariant.length, 2);
  assert.equal(schema.hasVariant[0].sku, 'ARC-S');
  assert.equal(schema.hasVariant[0].offers.availability, 'https://schema.org/OutOfStock');
  assert.equal(schema.hasVariant[1].offers.availability, 'https://schema.org/InStock');
  assert.match(schema.hasVariant[1].offers.url, /\?variant=medium$/);
  assert.equal(schema.hasVariant[1].offers.hasMerchantReturnPolicy.returnMethod, 'https://schema.org/ReturnByMail');
});

test('catalog pages link products and collections in initial HTML; no draft or utility indexing', () => {
  assert.match(buildSeoPage('/', catalog).content, /href="\/product\/arc-reactor"/);
  assert.match(buildSeoPage('/shop', catalog).content, /href="\/collections\/limited-edition"/);
  assert.match(buildSeoPage('/collections/limited-edition', catalog).content, /Arc Reactor/);
  for (const path of ['/admin', '/checkout', '/order-success', '/track-order']) {
    const page = buildSeoPage(path);
    assert.equal(page.status, 200);
    assert.equal(page.robots, 'noindex,follow');
  }
  for (const path of ['/unknown', '/product/missing', '/collections/missing', '/admin/missing']) {
    assert.equal(buildSeoPage(path, catalog).status, 404);
    assert.equal(buildSeoPage(path, catalog).robots, 'noindex,follow');
  }
  const draft = structuredClone(product);
  draft.versions[0].isActive = false;
  assert.equal(isIndexableProduct(draft), false);
  assert.equal(buildSeoPage('/product/arc-reactor', { products: [draft], collections: [] }).robots, 'noindex,follow');
  const soldOut = structuredClone(product);
  soldOut.versions[0].sizes.forEach((s) => { s.stock = 0; });
  assert.equal(isIndexableProduct(soldOut), true);
  assert.ok(STATIC_SEO['/delivery']);
  assert.ok(STATIC_SEO['/terms-and-conditions']);
});

test('catalog text cannot inject markup or terminate a structured-data script', () => {
  const unsafe = { ...product, name: '</script><img src=x onerror=alert(1)>', description: '"<script>alert(1)</script>' };
  const page = buildSeoPage('/product/arc-reactor', { ...catalog, products: [unsafe] });
  assert.ok(!page.content.includes('<img src=x'));
  assert.ok(!page.head.includes('<script>alert'));
  assert.ok(!serializeJson(productSchema(unsafe)).includes('</script>'));
  assert.equal(productSeo(unsafe).description, unsafe.description);
});

test('preorder schema does not promise ordinary dispatch; inactive variants are excluded', () => {
  const preorder = structuredClone(product);
  preorder.versions[0].isPreorder = true;
  preorder.versions.push({ ...product.versions[0], id: 'hidden', isActive: false });
  const schema = productSchema(preorder);
  assert.equal(schema.hasVariant.length, 2);
  assert.equal(schema.hasVariant[0].offers.shippingDetails.deliveryTime, undefined);
});

function response() {
  return { headers: {}, code: 0, body: '', setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; }, send(body) { this.body = body; } };
}

test('production handler and sitemap preserve status, cache safety, and public-only credentials', async (t) => {
  assert.equal(existsSync(new URL('../dist/index.html', import.meta.url)), false, 'a static homepage must not bypass the SEO handler');
  assert.equal(existsSync(new URL('../dist/app.html', import.meta.url)), true);
  const oldFetch = globalThis.fetch;
  const oldUrl = process.env.VITE_SUPABASE_URL;
  const oldKey = process.env.VITE_SUPABASE_ANON_KEY;
  process.env.VITE_SUPABASE_URL = 'https://example.invalid';
  process.env.VITE_SUPABASE_ANON_KEY = 'test-public-key';
  t.after(() => {
    globalThis.fetch = oldFetch;
    for (const [key, old] of [['VITE_SUPABASE_URL', oldUrl], ['VITE_SUPABASE_ANON_KEY', oldKey]]) {
      if (old === undefined) delete process.env[key]; else process.env[key] = old;
    }
  });
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).origin, 'https://example.invalid');
    assert.equal(options.headers.Authorization, 'Bearer test-public-key');
    const row = { ...product, product_code: product.productCode, collection_id: product.collectionId,
      versions: product.versions.map((v) => ({ ...v, version_name: v.versionName, product_type: v.productType,
        is_active: v.isActive, is_preorder: v.isPreorder, sort_order: 0 })) };
    const draft = { ...row, slug: 'unpublished-copy', versions: row.versions.map((v) => ({ ...v, is_active: false })) };
    return { ok: true, json: async () => new URL(url).pathname.endsWith('/collections') ? [collection] : [row, draft] };
  };
  const valid = response();
  await pageHandler({ query: { path: 'product/arc-reactor' }, method: 'GET' }, valid);
  assert.equal(valid.code, 200);
  assert.match(valid.body, /<h1>Arc Reactor<\/h1>/);
  assert.match(valid.body, /ProductGroup/);
  assert.match(valid.body, /\/assets\/index-/);
  assert.match(valid.headers['Cache-Control'], /s-maxage=60/);
  const missing = response();
  await pageHandler({ query: { path: 'product/missing' }, method: 'GET' }, missing);
  assert.equal(missing.code, 404);
  assert.match(missing.headers['Cache-Control'], /no-store/);
  const head = response();
  await pageHandler({ query: { path: 'checkout' }, method: 'HEAD' }, head);
  assert.equal(head.code, 200);
  assert.equal(head.body, '');
  assert.equal(head.headers['X-Robots-Tag'], 'noindex,follow');
  const sitemap = response();
  await sitemapHandler({}, sitemap);
  assert.equal(sitemap.code, 200);
  assert.match(sitemap.body, /https:\/\/comicculture.lk\/delivery/);
  assert.match(sitemap.body, /terms-and-conditions/);
  assert.ok(!sitemap.body.includes('/checkout'));
  assert.ok(!sitemap.body.includes('/product/unpublished-copy'));
  assert.ok(sitemap.body.includes('/product/arc-reactor'));
  globalThis.fetch = async () => { throw new Error('offline'); };
  const outage = response();
  await pageHandler({ query: { path: 'product/arc-reactor' }, method: 'GET' }, outage);
  assert.equal(outage.code, 503);
  assert.equal(outage.headers['Retry-After'], '60');
  const brokenSitemap = response();
  await sitemapHandler({}, brokenSitemap);
  assert.equal(brokenSitemap.code, 503);
  assert.equal(brokenSitemap.headers['Cache-Control'], 'no-store');
});
