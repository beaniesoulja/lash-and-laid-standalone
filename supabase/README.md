# Lash & Laid booking database

This directory contains the database definition for appointment requests submitted by the Shopify and standalone websites.

## Data model

`bookings` is the Excel-style master table. Each row contains:

- A human-readable booking reference
- Submission time and website source
- Full name, international WhatsApp number, and email address
- Selected service and preferred date
- Booking status and staff notes
- The mutually agreed appointment date and time, once confirmed
- Consent and privacy-notice information

`booking_photos` stores private photo metadata. The actual files are placed in the private `booking-photos` storage bucket. Each booking is limited to three JPEG, PNG, or WebP images of up to 10 MB each.

## Security posture

- Row Level Security is enabled and forced on both tables.
- Anonymous and ordinary authenticated browser clients receive no direct table permissions.
- The `submit-booking` Edge Function validates public form submissions and performs writes with a server-only service credential.
- No database secret belongs in Shopify Liquid, browser JavaScript, Git, or the public website.

## Booking statuses

- `new`: safely stored before WhatsApp opens
- `whatsapp_opened`: the customer was sent to WhatsApp; this does not prove the message was sent
- `contacted`: Lash & Laid contacted the customer
- `confirmed`: both sides agreed on the final schedule
- `completed`: appointment completed
- `cancelled`: booking cancelled
- `no_show`: confirmed customer did not attend

## Edge Function secrets

Configure these only in the Supabase Edge Function secret manager:

- `GOOGLE_SHEETS_WEBHOOK_URL`: deployed Google Apps Script web-app URL
- `GOOGLE_SHEETS_WEBHOOK_SECRET`: shared webhook secret stored in Google Apps Script properties
- `RATE_LIMIT_SALT`: a private random value used to hash visitor network addresses before counting attempts

The function keeps a successfully saved booking if Google notification fails and marks the record for staff attention. It never makes uploaded photos public; notification links are signed and expire after seven days.

The public form uses a hidden honeypot and allows five attempts per salted client fingerprint every fifteen minutes. Raw IP addresses are not stored.
