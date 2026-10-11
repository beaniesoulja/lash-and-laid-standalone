# SEO page review — 11 October 2026

Local implementation only; not deployed or submitted to Google.

## Destinations

- `/hair-services/`: frontal installation, wig care/customization, styling/finishing.
- `/lash-extensions/`: lash service, starting price, timing, preparation.
- `/booking/`: request process, existing booking dialog, manual confirmation and privacy.
- `/contact/`: public WhatsApp and Telegram contact; no staff bot or private address.

Each page has a unique title, description, www canonical, crawlable content,
breadcrumb structured data, and links to the other main destinations. Homepage
navigation and footer link to all four. The sitemap contains five URLs including
the homepage. Google determines whether and how to display organic sitelinks.

## Maintenance

Edit page-specific copy in `scripts/build-service-pages.mjs`. Header, footer,
booking dialog, analytics script configuration and consent controls are reused
from `public/index.html` at generation time. After editing shared components:

```sh
node scripts/build-service-pages.mjs
node scripts/check-service-pages.mjs
npm run check
```

Generated directory `index.html` files are checked-in static delivery artifacts;
no runtime build framework or new hosting service is required. The local server
supports these directory routes, redirects slashless routes with query strings
preserved, and serves unknown paths with a 404 status. Cloudflare Pages serves
directory index files natively; verify redirects and status codes after deployment.

For HTTP checks against a running preview:

```sh
PREVIEW_ORIGIN=http://127.0.0.1:3431 node scripts/check-service-pages.mjs
```

## Release boundary

This checkout also contains earlier, unrelated analytics, backend and notification
changes. Review and isolate the intended release rather than deploying the entire
dirty checkout. No booking was submitted during page QA. Production notification,
database and spreadsheet delivery were not exercised by these tests.

After publishing the agreed release, check all five live destinations and their
canonicals, sitemap and 404 behavior before submitting the sitemap or requesting
indexing in Search Console. New pages are not confirmed Google sitelinks.
