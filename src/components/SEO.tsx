import { useEffect } from 'react';

/**
 * Lightweight, dependency-free route-level SEO manager.
 *
 * Mounts and updates <title>, meta description, canonical link,
 * Open Graph, Twitter/X tags, and optional JSON-LD <script> blocks.
 *
 * On unmount (or whenever its props change), it restores whatever
 * was in <head> immediately before it ran — so navigating away from
 * a page using <SEO /> automatically reverts to the previous
 * (e.g. static index.html) values rather than leaking stale
 * page-specific metadata onto the next route.
 *
 * Reusable for product pages, collection pages, and static pages.
 */

const SITE_NAME = 'ComicCulture';
const LOCALE = 'en_US';

export interface JsonLdBlock {
  /** Unique id for this block, e.g. 'product' or 'breadcrumb'. */
  id: string;
  data: Record<string, unknown>;
}

export interface SEOProps {
  title: string;
  description: string;
  /** Full canonical URL, e.g. https://comicculture.lk/product/classic-gwen */
  canonical: string;
  /** og:type — defaults to 'website'. Use 'product' on product pages. */
  ogType?: string;
  /** Used for both og:image and twitter:image. Omit if no real image is available. */
  image?: string;
  /** Optional JSON-LD structured data blocks to inject/remove alongside this page. */
  jsonLd?: JsonLdBlock[];
}

type MetaTarget = { attr: 'name' | 'property'; key: string; value: string };

function getOrCreateMeta(attr: 'name' | 'property', key: string): HTMLMetaElement {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  return el;
}

function getOrCreateCanonical(): HTMLLinkElement {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  return link;
}

export default function SEO({
  title,
  description,
  canonical,
  ogType = 'website',
  image,
  jsonLd,
}: SEOProps) {
  useEffect(() => {
    const previousTitle = document.title;

    const metaTargets: MetaTarget[] = [
      { attr: 'name', key: 'description', value: description },
      { attr: 'property', key: 'og:type', value: ogType },
      { attr: 'property', key: 'og:url', value: canonical },
      { attr: 'property', key: 'og:title', value: title },
      { attr: 'property', key: 'og:description', value: description },
      { attr: 'property', key: 'og:site_name', value: SITE_NAME },
      { attr: 'property', key: 'og:locale', value: LOCALE },
      { attr: 'name', key: 'twitter:card', value: 'summary_large_image' },
      { attr: 'name', key: 'twitter:title', value: title },
      { attr: 'name', key: 'twitter:description', value: description },
    ];

    if (image) {
      metaTargets.push({ attr: 'property', key: 'og:image', value: image });
      metaTargets.push({ attr: 'name', key: 'twitter:image', value: image });
    }

    // Snapshot whatever is currently in <head> so it can be restored later.
    const previousMetaValues = metaTargets.map(({ attr, key }) =>
      document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)?.getAttribute('content') ?? null
    );

    const canonicalEl = getOrCreateCanonical();
    const previousCanonical = canonicalEl.getAttribute('href');

    document.title = title;
    metaTargets.forEach(({ attr, key, value }) => {
      getOrCreateMeta(attr, key).setAttribute('content', value);
    });
    canonicalEl.setAttribute('href', canonical);

    const scriptEls: HTMLScriptElement[] = (jsonLd ?? []).map(({ id, data }) => {
      const scriptId = `jsonld-${id}`;
      let script = document.getElementById(scriptId) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement('script');
        script.type = 'application/ld+json';
        script.id = scriptId;
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(data);
      return script;
    });

    return () => {
      document.title = previousTitle;

      metaTargets.forEach(({ attr, key }, i) => {
        const el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
        if (!el) return;
        const prev = previousMetaValues[i];
        if (prev === null) {
          el.remove();
        } else {
          el.setAttribute('content', prev);
        }
      });

      if (previousCanonical === null) {
        canonicalEl.remove();
      } else {
        canonicalEl.setAttribute('href', previousCanonical);
      }

      scriptEls.forEach((script) => script.remove());
    };
    // Re-run whenever the page identity/content changes; jsonLd is stringified
    // for a stable dependency since it's a new array/object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, canonical, ogType, image, JSON.stringify(jsonLd)]);

  return null;
}
