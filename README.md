# Lash & Laid landing page

This is the independent, self-hosted Lash & Laid booking landing page. It has no customer checkout or website administration area.

## Included

- Responsive branded landing page
- Mobile-first navigation and landing animation
- Hair and lash service presentation
- Appointment request form with international WhatsApp numbers
- Optional private inspiration-photo uploads
- Secure booking storage through Supabase
- Google Sheets and email booking notifications
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

Place the website behind HTTPS and connect the final domain before launch. Once the domain is known, restrict the booking endpoint's allowed browser origin to that domain and add production rate limiting or bot protection.

## Booking flow

When a customer submits the form:

1. The booking and any optional photos are stored privately in Supabase.
2. The booking is copied to the Lash & Laid Google Sheet.
3. A notification email is sent to `Lashandlaid@gmail.com`.
4. WhatsApp opens with the customer's booking details and booking reference.

The requested date is not automatically confirmed. Lash & Laid contacts the customer to mutually agree on the final date and time.
