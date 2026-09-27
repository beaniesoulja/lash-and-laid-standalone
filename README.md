# Lash & Laid standalone website

This is the independent, self-hosted version of the Lash & Laid storefront. It does not require Shopify or any third-party JavaScript packages.

## Included

- Responsive branded storefront
- Mobile-first navigation with a fixed shop, services, and booking dock
- Short landing animation with reduced-motion accessibility support
- Hair and hair-care product catalog
- Password-protected product manager
- Product image uploads
- Stock and storefront visibility controls
- View-only hair and hair-care catalogue with no purchasing controls
- Appointment request form with WhatsApp handoff
- Instagram, TikTok, Snapchat, email, and WhatsApp links

## Run locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env`.
3. Replace the example admin password with a long private password.
4. In this folder, run:

   ```sh
   npm start
   ```

5. Open `http://127.0.0.1:3000`.
6. Open `http://127.0.0.1:3000/admin` to manage products.

## Self-host with Docker

Build the container:

```sh
docker build -t lash-and-laid .
```

Run it with a persistent data folder:

```sh
docker run -d \
  --name lash-and-laid \
  -p 3000:3000 \
  -e ADMIN_PASSWORD='replace-with-a-long-private-password' \
  -v lash-and-laid-data:/app/data \
  lash-and-laid
```

Place the website behind an HTTPS reverse proxy such as Caddy, Nginx, or your hosting provider's proxy before making the product manager public.

## Product data and backups

Products are stored in `data/products.json`. Uploaded product images are stored in `data/uploads/`. Back up the entire `data` directory. When using Docker, keep the `/app/data` volume mounted so products survive updates and restarts.

## Booking requests

Customers can submit their preferred date and contact details through the appointment form. The request opens in WhatsApp so Lash & Laid and the customer can mutually agree on the final appointment date and time. Optional inspiration photos remain on the customer's device until they attach them in WhatsApp.
