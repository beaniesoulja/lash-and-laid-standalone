# Lash & Laid landing page

This is the independent, self-hosted Lash & Laid booking landing page. It has no customer checkout or website administration area.

The production canonical URL is `https://www.lashandlaid.com`. The apex domain and Cloudflare Pages project hostname permanently redirect to this `www` address while preserving the request path and query string.

## Included

- Responsive branded landing page
- Mobile-first navigation and landing animation
- Hair and lash service presentation
- Appointment request form with international WhatsApp numbers and optional email
- Optional private inspiration-photo uploads
- Secure booking storage through Supabase
- Google Sheets and email booking notifications
- Branded, mobile-friendly HTML staff and optional customer emails with plain-text fallbacks and one-tap WhatsApp follow-up
- WhatsApp handoff containing the booking reference
- Instagram, TikTok, Snapchat, and WhatsApp links

## Run locally

1. Install Node.js 20 or newer.
2. Run `npm start` in this folder.
3. Open `http://127.0.0.1:3000`.

## Host with Docker

```sh
docker build -t lash-and-laid .
docker run -d --name lash-and-laid -p 3000:3000 lash-and-laid
```

The container is stateless. Booking information and optional photos are stored by the configured Supabase booking endpoint, not on the website host.

## Host on Cloudflare Pages

The production website can be deployed as a static Cloudflare Pages project:

1. Connect this GitHub repository to Cloudflare Pages.
2. Use `main` as the production branch.
3. Leave the framework preset and build command empty.
4. Set the build output directory to `public`.
5. Add the final custom domain when it is ready.

The `public/_headers` file applies the same security headers as the local Node.js server. Booking rate limiting and bot protection run at the Supabase endpoint. No persistent website disk is required.

Once the final domain is known, restrict the booking endpoint's allowed browser origin to that domain.

## Booking flow

When a customer submits the form:

1. The booking and any optional photos are stored privately in Supabase.
2. The booking is copied to the Lash & Laid Google Sheet.
3. A notification email is sent to `Lashandlaid@gmail.com`.
   The version-controlled Apps Script source is in `google-apps-script/Code.gs`; its webhook secret stays in Apps Script properties and is never committed.
4. If the customer supplied an email address, they receive a branded acknowledgement with their reference and an explanation that staff confirmation will follow shortly.
5. A clear confirmation screen shows the booking reference and a WhatsApp button.
6. The customer opens WhatsApp, reviews the pre-filled message, and taps Send. Opening WhatsApp does not send the message automatically.

The requested date is not automatically confirmed. Lash & Laid contacts the customer to mutually agree on the final date and time.

Contact details are collected only to review the appointment request, contact the customer, and arrange the service. Booking records are stored privately in Supabase; they are not used for unrelated marketing.
