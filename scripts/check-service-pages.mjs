import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../public/', import.meta.url));
const routes = ['/', '/hair-services/', '/lash-extensions/', '/booking/', '/contact/'];
const read = route => readFileSync(join(root, route, 'index.html'), 'utf8');
const home = read('/');
const hairPage = read('/hair-services/');
assert.ok(hairPage.includes('id="frontal-or-closure"'), 'Hair guide is present');
assert.ok(!home.includes('/assets/frontal-closure-guide/'), 'Guide images are not added to homepage payload');
for (let slide = 1; slide <= 6; slide++) {
  const imageName = slide === 1 ? 'slide-1-clean.png' : `slide-${slide}.png`;
  assert.ok(hairPage.includes(`href="/assets/frontal-closure-guide/${imageName}"`), `Guide slide ${slide} available at full size`);
  assert.ok(hairPage.includes(`src="/assets/frontal-closure-guide/${imageName}"`), `Guide slide ${slide} displayed`);
}
assert.ok(!hairPage.includes('/assets/frontal-closure-guide/slide-1.png'), 'Original contact-strip cover is not displayed or linked');
const hairServices = ['Frontal Installation', 'Wig Revamping', 'Wig Styling', 'Wig Customization', 'Glueless Frontal Installation', 'Wig Maintenance'];
const lashServices = ['Lash Extension', 'Lash Refill', 'Lash Removal', 'Strip Lash Application'];
for (const [route, services] of [['/', [...hairServices, ...lashServices]], ['/hair-services/', hairServices], ['/lash-extensions/', lashServices]]) {
  const html = read(route);
  for (const service of services) assert.ok(html.includes(`<li>${service}</li>`), `${route}: lists ${service}`);
}
const dialog = html => html.match(/<dialog class="booking-dialog"[\s\S]*?<\/dialog>/)[0];
const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
const titles = new Set();
for (const route of routes) {
  const html = read(route);
  assert.equal((html.match(/<h1\b/g) || []).length, 1, `${route}: one h1`);
  assert.ok(html.includes(`<link rel="canonical" href="https://www.lashandlaid.com${route}">`));
  assert.ok(sitemap.includes(`<loc>https://www.lashandlaid.com${route}</loc>`));
  const title = html.match(/<title>(.*?)<\/title>/)[1];
  assert.ok(!titles.has(title), `${route}: unique title`); titles.add(title);
  for (const block of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(block[1]);
  assert.equal(dialog(html), dialog(home), `${route}: unchanged shared booking form`);
  assert.ok(!html.includes('LashAndLaidBookingsBot'), 'No customer links to staff bot');
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const target = match[1];
    if (!target.startsWith('/') && !target.startsWith('#')) continue;
    const url = new URL(target, `https://www.lashandlaid.com${route}`);
    const file = join(root, url.pathname, url.pathname.endsWith('/') ? 'index.html' : '');
    assert.ok(existsSync(file), `${route}: link exists ${target}`);
    if (url.hash) {
      const destination = readFileSync(file, 'utf8');
      assert.ok(destination.includes(`id="${url.hash.slice(1)}"`), `${route}: anchor exists ${target}`);
    }
  }
}
if (process.env.PREVIEW_ORIGIN) {
  for (const route of routes) {
    const response = await fetch(`${process.env.PREVIEW_ORIGIN}${route}`);
    assert.equal(response.status, 200, route);
    assert.ok((await response.text()).includes('<h1'));
  }
  const missing = await fetch(`${process.env.PREVIEW_ORIGIN}/not-a-real-page`);
  assert.equal(missing.status, 404);
  assert.ok((await missing.text()).includes('noindex'));
  const redirect = await fetch(`${process.env.PREVIEW_ORIGIN}/hair-services?utm_source=test`, {redirect:'manual'});
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get('location'), '/hair-services/?utm_source=test');
}
console.log('PASS: 5 canonical pages, unique titles, JSON-LD, sitemap, local links and unchanged booking forms.');
