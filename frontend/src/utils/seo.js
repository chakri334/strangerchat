/**
 * SEO & Geo Utilities for Stumble Chat
 * - Updates document title and meta tags dynamically
 * - Fires GA4 geo-enriched events
 */

const BASE_TITLE = 'Stumble Chat – Free Random Chat with Strangers Online';
const BASE_DESCRIPTION = 'Stumble Chat is a free random chat app that connects you with strangers worldwide. Meet new people, share photos, and have real conversations instantly – no sign-up required.';

/**
 * Updates the page title to include user's city for geo relevance.
 * e.g. "Random Chat in Mumbai – Stumble Chat"
 */
export function setGeoTitle(city) {
  if (city && city !== 'Global') {
    document.title = `Random Chat in ${city} – Stumble Chat | Meet Strangers Near You`;
    updateMeta('description', `Meet strangers and chat online in ${city} for free. Stumble Chat connects you with real people near you and worldwide instantly – no sign-up required.`);
    updateMeta('og:title', `Random Chat in ${city} – Stumble Chat`);
    updateMeta('og:description', `Connect with people in ${city} for free. Anonymous random chat – no sign-up needed.`);
  } else {
    document.title = BASE_TITLE;
    updateMeta('description', BASE_DESCRIPTION);
  }
}

/**
 * Updates a <meta> tag by name or property attribute.
 */
export function updateMeta(nameOrProp, content) {
  // Try name first, then og: property
  let el = document.querySelector(`meta[name="${nameOrProp}"]`)
        || document.querySelector(`meta[property="${nameOrProp}"]`);
  if (el) {
    el.setAttribute('content', content);
  }
}

/**
 * Pushes a geo-enriched event to GA4 via gtag.
 */
export function trackGeoEvent(eventName, params = {}) {
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, params);
  }
}

/**
 * Track when a user from a specific city joins the queue.
 */
export function trackCitySearch(city) {
  trackGeoEvent('city_search', {
    event_category: 'geo',
    city: city || 'Global',
  });
}

/**
 * Track successful geo-based match.
 */
export function trackGeoMatch(userCity, partnerCity) {
  const matchType = userCity && partnerCity && userCity === partnerCity
    ? 'local_match'
    : 'global_match';

  trackGeoEvent('geo_match', {
    event_category: 'geo',
    match_type: matchType,
    user_city: userCity || 'Global',
    partner_city: partnerCity || 'Global',
  });
}
