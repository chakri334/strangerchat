/**
 * useSEO – Dynamic per-page SEO for Stumble Chat
 * Usage: useSEO({ title, description, canonical, noIndex })
 *
 * Place at: frontend/src/hooks/useSEO.js
 */
import { useEffect } from 'react';

const SITE_NAME    = 'Stumble Chat';
const BASE_URL     = 'https://stumblechat.online';
const DEFAULT_IMG  = `${BASE_URL}/og-image.png`;
const DEFAULT_DESC = 'Stumble Chat is a free random chat app that connects you with strangers worldwide. Meet new people, share photos, and have real conversations instantly – no sign-up required.';
const DEFAULT_TITLE = `${SITE_NAME} – Free Random Chat with Strangers Online | Meet New People`;

export default function useSEO({
  title,
  description,
  canonical,
  noIndex = false,
  ogImage = DEFAULT_IMG,
}) {
  useEffect(() => {
    const fullTitle    = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;
    const fullCanonical = `${BASE_URL}${canonical || '/'}`;
    const desc         = description || DEFAULT_DESC;

    // ── Title ──────────────────────────────────────────────────
    document.title = fullTitle;

    // ── Helpers ────────────────────────────────────────────────
    const setMeta = (selector, content) => {
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement('meta');
        // Parse selector like meta[name='description'] or meta[property='og:title']
        const nameMatch = selector.match(/\[name='([^']+)'\]/);
        const propMatch = selector.match(/\[property='([^']+)'\]/);
        if (nameMatch)     el.setAttribute('name', nameMatch[1]);
        else if (propMatch) el.setAttribute('property', propMatch[1]);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    const setLink = (rel, href) => {
      let el = document.querySelector(`link[rel='${rel}']`);
      if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', rel);
        document.head.appendChild(el);
      }
      el.setAttribute('href', href);
    };

    // ── Core meta ─────────────────────────────────────────────
    setMeta("meta[name='description']",  desc);
    setMeta("meta[name='robots']",       noIndex
      ? 'noindex, nofollow'
      : 'index, follow, max-snippet:-1, max-image-preview:large');

    // ── Canonical ─────────────────────────────────────────────
    setLink('canonical', fullCanonical);

    // ── Open Graph ────────────────────────────────────────────
    setMeta("meta[property='og:title']",       fullTitle);
    setMeta("meta[property='og:description']", desc);
    setMeta("meta[property='og:url']",         fullCanonical);
    setMeta("meta[property='og:image']",       ogImage);

    // ── Twitter ───────────────────────────────────────────────
    setMeta("meta[name='twitter:title']",       fullTitle);
    setMeta("meta[name='twitter:description']", desc);
    setMeta("meta[name='twitter:image']",       ogImage);

    // ── Cleanup: restore homepage defaults on unmount ─────────
    return () => {
      document.title = DEFAULT_TITLE;
      setMeta("meta[name='description']",        DEFAULT_DESC);
      setMeta("meta[name='robots']",             'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1');
      setLink('canonical',                        `${BASE_URL}/`);
      setMeta("meta[property='og:title']",       `${SITE_NAME} – Free Random Chat with Strangers Online`);
      setMeta("meta[property='og:description']", 'Connect with random strangers instantly. Free anonymous chat, photo sharing, and real conversations worldwide. No sign-up needed!');
      setMeta("meta[property='og:url']",         `${BASE_URL}/`);
      setMeta("meta[name='twitter:title']",      `${SITE_NAME} – Free Random Chat with Strangers Online`);
      setMeta("meta[name='twitter:description']",'Connect with random strangers instantly. Free anonymous chat, photo sharing, and real conversations worldwide. No sign-up needed!');
    };
  }, [title, description, canonical, noIndex, ogImage]);
}
