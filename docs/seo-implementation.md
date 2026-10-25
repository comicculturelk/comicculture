# SEO implementation — 25 October 2026

Changes are preserved in the local repository. No commit, push, or production deployment was performed. No database schema, catalog record, customer information, payment rule, or order was changed. Measurement remains in Search Console, as requested; no analytics tracker was added.

## Implemented

- A small Vercel page function serves route-specific titles, descriptions, canonical links, social previews, structured data, and readable catalog content in the initial HTML. People and crawlers receive the same response. The existing React app takes over after loading; no framework migration or crawler-specific rendering was introduced.
- Home/shop/product/collection pages expose product and collection links before JavaScript runs. New products are fetched from the public catalog at request time, so adding catalog content does not require generating a static page by hand.
- Product pages use actual garment types in titles. Shop and collection introductions describe the catalog and Sri Lankan market without changing product facts or inventing availability, reviews, discounts, or identifiers.
- Server and browser use shared metadata/schema helpers and apparel labels. The client removes the initial schema block before mounting its own blocks, preventing duplication after navigation.
- Missing products, collections, and unknown routes return HTTP 404. A catalog failure returns 503 with Retry-After rather than misclassifying a real product as missing. `/index.html` redirects to `/`.
- Admin, checkout, order success, and tracking return noindex metadata and headers. robots.txt allows crawling so Google can see those directives; authentication remains unchanged.
- The sitemap includes Delivery and Terms and currently contains 17 URLs: eight general pages, seven products, two live collections. Inactive drafts and coming-soon collections are excluded; active sold-out products remain discoverable. If catalog retrieval fails, the sitemap returns 503 instead of a successful incomplete list.
- ProductGroup/variant data uses permanent product codes and actual size SKUs, individual prices/stock states, and variant URLs that preselect the matching size/version. The base product remains canonical. No GTIN, rating, or review was fabricated.
- Shipping/return data stays tied to published policy and the existing delivery-fee configuration. Added the courier/mail return method; preorders do not inherit an ordinary dispatch-time promise.
- Home exposes OnlineStore/WebSite identity with the existing logo and Instagram account.

## Implementation and hosting

`api/page.ts` reads the built `dist/index.html`, injects public SEO content, and returns the correct status. Vercel configuration includes that template in the function bundle. Static assets continue to be served as files. Public catalog reads use the existing anonymous key, never an admin session/service credential. Only catalog tables are queried. Public HTML has a 60-second edge cache with a five-minute stale-while-revalidate window; utility/error responses are not cached. Shopping/cart/checkout still use their existing fresh validation.

`server/viteSeo.ts` provides equivalent HTML/status handling for `npm run dev` and `npm run preview`, allowing local verification of the initial response. `npm run typecheck` now also checks the server/API/Vite configuration. No runtime dependency was added.

## Actual verification

- `npm run typecheck`: passed (browser and server).
- `npm run lint`: passed.
- `npm run test:seo`: production build plus 5 tests passed. Covers initial product HTML, one title/canonical, variant identifiers/stock states, indexing controls, real 404s, script/HTML escaping, preorder shipping, public-only credentials, production handler/cache behavior, draft sitemap exclusion, and outage handling.
- `npm run test:admin`: 14 existing regression tests passed.
- `git diff --check`: passed after whitespace cleanup.
- Initial HTTP responses verified against the local development server and production preview: catalog/general pages 200, four utility routes noindex, missing products/collections/routes 404, sitemap 200. Preview checked at port 5175; development remains at port 5174.
- Browser: desktop product and built product; mobile 390px product, shop, collection; variant link selects XS, subsequent M selection works; utility-to-shop navigation restores index/follow and one canonical. No page-level overflow was observed in these samples. Existing cart contents were preserved; no orders submitted.
- No browser console errors observed. The existing multiple-GoTrue-client warning remains; storefront/admin sessions intentionally use separate storage keys.

Google's Rich Results code test returned “Something went wrong” on both attempts. The new ProductGroup code therefore still needs Google validation after publication; local tests are not a substitute for a successful Google test. The earlier live test of the published Iron Man page passed using the previous markup.

The Vercel-specific routing and function packaging still require a deployment smoke test. They were checked through the actual local production handler and Vite preview, not through a Vercel preview deployment.

## Search Console baseline and rollout

Baseline captured before these changes: latest aggregate indexing report dated 16 October shows three indexed pages (homepage, return policy, Symbiotic Suit), twelve discovered/not-indexed, one redirect. Sitemap last read 20 October: Success, 15 URLs. Last 28-day Web performance (26 Sep–23 Oct): 34 clicks, 75 impressions, 45.3% CTR, average position 4.1; all clicks to homepage. Visible query rows are branded. Core Web Vitals lacks sufficient data.

Indexing submissions were attempted for the current live Iron Man product and Limited Edition collection. Google returned “We had a problem submitting your indexing request. Please try again later” for both URLs. Neither request was confirmed, so the remaining batch was not repeatedly submitted. No successful request should be inferred from merely clicking the button.

After publishing:

1. Check production home/shop/product/collection initial HTML, status codes, robots controls, static JS/CSS/image delivery, and `/sitemap.xml`. Confirm 17 current URLs and that the page function has its HTML template and existing public environment configuration.
2. Run Google live URL inspection/Rich Results tests on the new product markup. Confirm canonical URLs, visible product content, stock/price accuracy, and no critical schema errors.
3. Submit priority URLs selectively when Google's request service is working: Iron Man, Classic Gwen, Classic Red, Noir Spider, Upgraded Black, Volt Spider, and both live collections. Avoid repeating requests already accepted. Indexing is Google's decision, not guaranteed by a submission.
4. Check Search Console weekly: indexed catalog URLs, product-page impressions, non-brand queries, clicks/CTR, and enhancement coverage. Compare equivalent date ranges. This is a handover checklist, not a scheduled automation.
5. Use performance measurements separately; no Core Web Vitals pass or organic-sales attribution is claimed. No GA4 setup is required for the agreed Search Console-only scope.

## Files

Added: `api/page.ts`, `server/catalog.ts`, `server/seo.ts`, `server/viteSeo.ts`, `src/config/catalog.ts`, `src/lib/seo.ts`, `tests/seo.test.mjs`, this report.

Updated: sitemap API, Vercel/Vite configuration, Node type-check configuration, package scripts, robots.txt, HTML fallback title, shared SEO component, App utility-route handling, product data label exports, and public page metadata/introductions in Home, Shop, Product, CollectionPage, About, Contact, Delivery, FAQ, ReturnPolicy, TermsAndConditions, and NotFound. No source files removed.
