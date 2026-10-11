// Generate crawlable static pages, reusing the homepage's booking and navigation components.
// Run after changing shared homepage markup: node scripts/build-service-pages.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const home = readFileSync(join(publicDir, 'index.html'), 'utf8');
const origin = 'https://www.lashandlaid.com';
const escape = text => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const shared = pattern => {
  const result = home.match(pattern);
  if (!result) throw new Error(`Missing shared homepage component: ${pattern}`);
  return result[0];
};
const rootLinks = html => html.replaceAll('href="#', 'href="/#');
const header = rootLinks(shared(/<header class="nav"[\s\S]*?<\/header>/));
const footer = rootLinks(shared(/<footer class="footer"[\s\S]*?<\/footer>/));
const dialog = shared(/<dialog class="booking-dialog"[\s\S]*?<\/dialog>/);
const consent = shared(/<aside id="trackingConsent"[\s\S]*?<\/aside>/);
const scripts = [...home.matchAll(/<script src="[^"]+"[^>]*><\/script>/g)].map(match => match[0]).join('\n');
const request = service => `<button class="button" type="button" data-booking-open${service ? ` data-service="${escape(service)}"` : ''}>Request an appointment</button>`;
// Keep the complete service lists in sync with the homepage's customer-approved list.
const serviceList = category => shared(new RegExp(`<ul class="service-list" data-service-list="${category}">[\\s\\S]*?<\\/ul>`));
const serviceMenu = category => `<section class="service-menu" aria-labelledby="all-services-title"><p class="eyebrow">Our services</p><h2 id="all-services-title">${category === 'hair' ? 'Hair services we offer' : 'Lash services we offer'}</h2>${serviceList(category)}<p class="service-list-note">For individual service pricing, timing and preparation, <a href="/contact/">contact us</a>. We will confirm the details for your chosen service.</p></section>`;

const pages = [
  {
    slug: 'hair-services', name: 'Hair Services', title: 'Hair Services in New Cairo | Lash & Laid',
    description: 'Explore frontal installation from EGP 1,500, wig care and customization from EGP 500, and styling from EGP 500 at Lash & Laid in New Cairo.',
    intro: 'From your frontal installation to the final finish, explore hair services with clear starting prices and preparation guidance.',
    image: 'lash-laid-frontal.webp', alt: 'Frontal installation at Lash & Laid',
    content: `<section class="detail-grid" aria-label="Hair services and prices">
      <article class="detail-card"><p class="eyebrow">01 · From EGP 1,500</p><h2>Frontal installation</h2><p>A frontal installation with a finished-look video included.</p><dl><dt>Appointment length</dt><dd>Approximately 2 hours, plus preparation.</dd><dt>Preparation</dt><dd>Allow about 20 minutes for preparation before the installation starts. Confirm any wig or hair preparation details with us when arranging your visit.</dd></dl>${request('Frontal installation')}</article>
      <article class="detail-card"><p class="eyebrow">02 · From EGP 500</p><h2>Wig care &amp; customization</h2><p>We assess your wig with you and agree on the care and customization it needs before work begins.</p><dl><dt>Completion time</dt><dd>Confirmed after assessing the wig and agreeing on the treatment.</dd><dt>Preparation</dt><dd>Please arrange this service at least one day ahead. Contact us to discuss your wig and the result you want.</dd></dl>${request('Wig care & customization')}</article>
      <article class="detail-card"><p class="eyebrow">03 · From EGP 500</p><h2>Styling &amp; finishing</h2><p>Your chosen style and finish are agreed during consultation.</p><dl><dt>Appointment length</dt><dd>Confirmed during consultation, depending on the chosen style.</dd><dt>Preparation</dt><dd>We will confirm preparation requirements when arranging your appointment.</dd></dl>${request('Styling & finishing')}</article>
    </section><section class="detail-note"><h2>Choose your next look</h2><p>Prices shown are starting prices. We will confirm the service scope, final price and schedule with you before your appointment.</p><p>Looking for lashes too? Explore <a href="/lash-extensions/">lash extensions</a>, or <a href="/contact/">contact us</a> for help choosing a service.</p></section>`
  },
  {
    slug: 'lash-extensions', name: 'Lash Extensions', title: 'Lash Extensions in New Cairo | Lash & Laid',
    description: 'Lash extensions from EGP 1,000 in New Cairo. Explore appointment length, preparation and how to request your preferred lash look at Lash & Laid.',
    intro: 'Detail-driven lash artistry tailored to your chosen look, with a consultation to agree on the service before your appointment.',
    image: 'lash-laid-lashes.webp', alt: 'Lash extension detail at Lash & Laid',
    content: `<section class="detail-card" aria-labelledby="lash-details"><p class="eyebrow">From EGP 1,000</p><h2 id="lash-details">Your lash appointment</h2><p>Share the look you have in mind so we can discuss the lash service that suits your preferences. Inspiration photos can be sent directly to us.</p><dl><dt>What is included</dt><dd>Lash artistry tailored to the look agreed with you.</dd><dt>Appointment length</dt><dd>Approximately 2 hours, plus preparation.</dd><dt>Preparation</dt><dd>Allow about 20 minutes for preparation before the service begins. Contact us beforehand for any specific preparation instructions.</dd><dt>Final price</dt><dd>Prices start from EGP 1,000 and are confirmed with your chosen service.</dd></dl>${request('Lash artistry')}</section><section class="detail-note"><h2>Have a question before booking?</h2><p><a href="/contact/">Message Lash &amp; Laid</a> to discuss your preferred look. You can also explore our <a href="/hair-services/">hair services</a>.</p><p>Your request is not an appointment confirmation. We will contact you to agree on the final date and time.</p></section>`
  },
  {
    slug: 'booking', name: 'Request an Appointment', title: 'Request an Appointment | Lash & Laid New Cairo',
    description: 'Request a hair or lash appointment at Lash & Laid in New Cairo. Choose a service and preferred date; our team will contact you to confirm the schedule.',
    intro: 'Choose your service and preferred date. We will contact you to agree on your final appointment date and time. Visits are by appointment only.',
    content: `<section class="detail-card" aria-labelledby="request-title"><h2 id="request-title">Let’s arrange your visit</h2><p>The form asks for your name, WhatsApp number, service and preferred date. Email is optional.</p>${request('')}<noscript><p>The request form needs JavaScript. You can still <a href="/contact/">contact us directly</a> to arrange a visit.</p></noscript><ol class="request-steps"><li><strong>Choose your service.</strong> Explore <a href="/hair-services/">hair services</a> or <a href="/lash-extensions/">lash extensions</a> before choosing.</li><li><strong>Save your request.</strong> A successful submission displays a thank-you message and your booking reference. Keep the reference for follow-up.</li><li><strong>Wait for confirmation.</strong> We will contact you to agree on the date and time. A saved request does not reserve or confirm an appointment.</li></ol></section><section class="detail-note"><h2>Messaging and privacy</h2><p>After saving, you can open WhatsApp to review a prepared message. Opening WhatsApp does not send it automatically: you must tap Send. You can also message us on Telegram with your booking reference.</p><p>Your contact details are used to review your request and arrange your appointment. We send booking details to our restricted staff tools, including Telegram notifications and email, to arrange your appointment. They are not sold. Campaign labels may be saved with requests for appointment reporting; optional analytics requires a separate choice.</p><p>Need help? <a href="/contact/">Contact Lash &amp; Laid</a>.</p></section>`
  },
  {
    slug: 'contact', name: 'Contact Us', title: 'Contact Lash & Laid | Hair & Lashes in New Cairo',
    description: 'Contact Lash & Laid directly on WhatsApp or Telegram for hair and lash services in New Cairo. Ask about services or arrange an appointment.',
    intro: 'Have a question about your next look? Message our team directly. Based in New Cairo, we welcome clients from across Cairo by appointment.',
    content: `<section class="detail-card" aria-labelledby="contact-options"><h2 id="contact-options">Talk to Lash &amp; Laid</h2><p>Ask about a service, discuss inspiration photos or follow up on an existing request. If you have a booking reference, include it in your message.</p><div class="contact-actions"><a class="button" href="https://wa.me/201092445224" target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a><a class="button" href="https://t.me/lashandlaideg" target="_blank" rel="noopener noreferrer">Chat on Telegram</a></div><p>WhatsApp: +20 109 244 5224<br>Telegram: @lashandlaideg</p><p>Opening either chat does not send a message or confirm an appointment.</p></section><section class="detail-note"><h2>Plan your appointment</h2><p>Explore <a href="/hair-services/">hair services</a> and <a href="/lash-extensions/">lash extensions</a>, then <a href="/booking/">request an appointment</a>. We will agree on the final date and time with you.</p><p>Follow our work on <a href="https://www.instagram.com/lashandlaideg/" target="_blank" rel="noopener noreferrer">Instagram</a> and <a href="https://www.tiktok.com/@lashandlaideg" target="_blank" rel="noopener noreferrer">TikTok</a>.</p></section>`
  }
];

const guideSlides = [
  ['Frontal or closure?', 'Not sure which one is right for you? Let’s break it down.'],
  ['What is a closure?', 'A closure covers a smaller section at the front of your wig. It is usually easier to maintain and gives a clean, simple finish.'],
  ['What is a frontal?', 'A frontal extends from ear to ear and gives more flexibility with parting and styling.'],
  ['Choose a closure if…', 'You prefer easier maintenance, a simple polished look and less styling around the hairline.'],
  ['Choose a frontal if…', 'You want more styling options, different parting possibilities and a more versatile hairline.'],
  ['Which one is better?', 'Neither is automatically better. Your choice depends on your lifestyle, preferred style and the maintenance you are comfortable with.']
];
const hairGuideOriginal = `<section class="hair-guide" id="frontal-or-closure" aria-labelledby="hair-guide-title">
  <div class="hair-guide-intro"><img src="/assets/frontal-closure-guide/slide-1.png" alt="Lash &amp; Laid’s Frontal or Closure guide cover, showing a lace wig" width="1080" height="1350" loading="lazy" decoding="async"><div><p class="eyebrow">A little guidance</p><h2 id="hair-guide-title">Frontal or closure?</h2><p>Not sure which one is right for you? Our illustrated guide helps you compare the look, styling flexibility and upkeep before arranging your appointment.</p></div></div>
  <div class="hair-guide-comparison"><section aria-labelledby="closure-title"><h3 id="closure-title">A closure</h3><p>Covers a smaller section at the front of the wig. It can suit a simple, polished look with less styling around the hairline and is usually easier to maintain.</p></section><section aria-labelledby="frontal-title"><h3 id="frontal-title">A frontal</h3><p>Extends from ear to ear, giving more flexibility with parting and styling around the hairline.</p></section></div>
  <details class="hair-guide-slides"><summary>Explore the illustrated guide · 6 slides</summary><p>Tap any slide to open the full-size original. A readable explanation appears beneath each image.</p><ol>${guideSlides.map(([title, caption], index) => `<li><figure><a href="/assets/frontal-closure-guide/slide-${index + 1}.png" target="_blank" rel="noopener" aria-label="Open slide ${index + 1}: ${escape(title)} (new tab)"><img src="/assets/frontal-closure-guide/slide-${index + 1}.png" alt="${escape(title)} — illustrated Lash &amp; Laid guide" width="1080" height="1350" loading="lazy" decoding="async"></a><figcaption><strong>${index + 1}. ${title}</strong><p>${caption}</p></figcaption></figure></li>`).join('')}</ol></details>
  <div class="hair-guide-cta"><h3>The right choice is personal.</h3><p>Neither is automatically better. Tell us about your preferred style and maintenance routine, and we can discuss the options with you.</p><a class="button" href="/contact/">Help me choose</a></div>
</section>`;
// The website cover omits the social/contact footer; source artwork remains untouched.
const hairGuide = hairGuideOriginal.replaceAll('slide-1.png', 'slide-1-clean.png').replace('full-size original', 'full-size image');

for (const page of pages) {
  const url = `${origin}/${page.slug}/`;
  const schema = { '@context': 'https://schema.org', '@graph': [
    { '@type': page.slug === 'contact' ? 'ContactPage' : 'WebPage', '@id': `${url}#webpage`, url, name: page.title, description: page.description, inLanguage: 'en', isPartOf: {'@id': `${origin}/#website`}, about: {'@id': `${origin}/#business`}, breadcrumb: {'@id': `${url}#breadcrumb`} },
    { '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`, itemListElement: [ {'@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/`}, {'@type': 'ListItem', position: 2, name: page.name, item: url} ] }
  ] };
  const html = `<!doctype html>
<!-- Generated by scripts/build-service-pages.mjs. Edit that file or shared homepage components. -->
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(page.title)}</title><meta name="description" content="${escape(page.description)}"><meta name="robots" content="index, follow, max-image-preview:large"><meta name="theme-color" content="#450c2e">
<link rel="canonical" href="${url}"><link rel="icon" type="image/svg+xml" href="/assets/lash-laid-icon-plum.svg"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/service-pages.css">
<meta property="og:type" content="website"><meta property="og:site_name" content="Lash &amp; Laid"><meta property="og:title" content="${escape(page.title)}"><meta property="og:description" content="${escape(page.description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${origin}/assets/${page.image || 'lash-laid-hero.webp'}"><meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(schema)}</script>
${scripts}</head><body><a class="skip-link" href="#main">Skip to content</a><div class="site" id="top">${header}
<main class="detail-page" id="main"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><span aria-current="page">${page.name}</span></nav>
<section class="detail-hero${page.image ? ' detail-hero-with-image' : ''}"><div><p class="eyebrow">Lash &amp; Laid · New Cairo</p><h1>${page.name}</h1><p>${page.intro}</p></div>${page.image ? `<img src="/assets/${page.image}" alt="${page.alt}" width="788" height="1400" fetchpriority="high">` : ''}</section>
${page.slug === 'hair-services' ? serviceMenu('hair') : page.slug === 'lash-extensions' ? serviceMenu('lashes') : ''}
${page.content}${page.slug === 'hair-services' ? hairGuide : ''}</main>${footer}</div>${dialog}${consent}</body></html>\n`;
  mkdirSync(join(publicDir, page.slug), { recursive: true });
  writeFileSync(join(publicDir, page.slug, 'index.html'), html);
}
console.log(`Built ${pages.length} static pages using the shared booking form.`);
