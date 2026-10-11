// Add the GA4 and Meta IDs to this script tag in index.html only after the accounts are ready.
// No third-party tag loads before the visitor has opted in.
const trackingScript = document.currentScript;
const ga4Id = /^G-[A-Z0-9]+$/.test(trackingScript?.dataset.ga4Id || '') ? trackingScript.dataset.ga4Id : '';
const metaPixelId = /^\d+$/.test(trackingScript?.dataset.metaPixelId || '') ? trackingScript.dataset.metaPixelId : '';
const consentBanner = document.querySelector('#trackingConsent');
const consentKey = 'lashTrackingConsentV1';
let consent = null;
try { consent = localStorage.getItem(consentKey); } catch (_) { /* Storage may be unavailable. */ }
let trackingCampaign = {};
try { trackingCampaign = JSON.parse(sessionStorage.getItem('lashCampaign') || '{}'); } catch (_) { /* Storage may be unavailable. */ }
if (!trackingCampaign || typeof trackingCampaign !== 'object' || Array.isArray(trackingCampaign)) trackingCampaign = {};
const pageParams = new URLSearchParams(window.location.search);
if (['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].some(key => pageParams.has(key))) {
  trackingCampaign = Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
    .map(key => [key, (pageParams.get(key) || '').trim().slice(0, 120)]));
}
const safeCampaign = Object.fromEntries(Object.entries(trackingCampaign).filter(([key, value]) =>
  /^utm_(source|medium|campaign|content|term)$/.test(key) &&
  typeof value === 'string' && value.length <= 120 && !/@|\d{7,}/.test(value)
));

function addScript(src) {
  const script = document.createElement('script');
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

function enableTags() {
  if (consent !== 'yes') return;
  if (ga4Id && !window.gtag) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', ga4Id, {
      send_page_view: false,
      ...(safeCampaign.utm_source ? { campaign_source: safeCampaign.utm_source } : {}),
      ...(safeCampaign.utm_medium ? { campaign_medium: safeCampaign.utm_medium } : {}),
      ...(safeCampaign.utm_campaign ? { campaign_name: safeCampaign.utm_campaign } : {}),
      ...(safeCampaign.utm_content ? { campaign_content: safeCampaign.utm_content } : {}),
      ...(safeCampaign.utm_term ? { campaign_term: safeCampaign.utm_term } : {})
    });
    window.gtag('event', 'page_view', { page_location: window.location.origin + window.location.pathname, page_title: document.title });
    addScript(`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`);
  }
  if (metaPixelId && !window.fbq) {
    const pixel = function () { pixel.callMethod ? pixel.callMethod.apply(pixel, arguments) : pixel.queue.push(arguments); };
    pixel.queue = [];
    pixel.loaded = true;
    pixel.version = '2.0';
    window.fbq = pixel;
    window.fbq('init', metaPixelId);
    window.fbq('track', 'PageView');
    addScript('https://connect.facebook.net/en_US/fbevents.js');
  }
}

window.LashTracking = {
  track(name, details = {}) {
    if (consent !== 'yes') return;
    // Only non-identifying event labels and service/placement values are sent.
    if (ga4Id && window.gtag) window.gtag('event', name, details);
    if (metaPixelId && window.fbq) {
      if (name === 'generate_lead') window.fbq('track', 'Lead', { content_category: details.service });
      else if (name === 'whatsapp_click') window.fbq('track', 'Contact', { content_category: details.placement });
      else if (name === 'booking_start') window.fbq('trackCustom', 'BookingStart', { content_category: details.service });
    }
  }
};

function saveConsent(value) {
  consent = value;
  try { localStorage.setItem(consentKey, value); } catch (_) { /* Keep the current choice for this page. */ }
  consentBanner.hidden = true;
  enableTags();
}

if (ga4Id || metaPixelId) {
  if (consent === 'yes') enableTags();
  else if (consent !== 'no') consentBanner.hidden = false;
  document.querySelector('#trackingSettings').hidden = false;
}
consentBanner?.querySelector('[data-consent-accept]')?.addEventListener('click', () => saveConsent('yes'));
consentBanner?.querySelector('[data-consent-reject]')?.addEventListener('click', () => saveConsent('no'));
document.querySelector('#trackingSettings')?.addEventListener('click', () => { consentBanner.hidden = false; });
