# Lash & Laid booking database

This directory contains the database definition for appointment requests submitted by the Shopify and standalone websites.

## Data model

`bookings` is the Excel-style master table. Each row contains:

- A human-readable booking reference
- Submission time and website source
- Optional UTM source, medium, campaign, content, and term labels for attribution
- Full name, international WhatsApp number, and optional email address
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

- `new`: safely stored before the customer chooses to open WhatsApp
- `whatsapp_opened`: the customer opened WhatsApp; this does not prove the message was sent
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

The public form uses a hidden honeypot and allows fifteen attempts per salted client fingerprint every hour. Raw IP addresses are not stored.

## Campaign and appointment reporting

The UTM columns are client-provided attribution labels, not proof that an ad impression occurred. Staff should use the private Supabase Table Editor to move a request from `new` to `contacted`, then to `confirmed` once both sides agree. Set `confirmed_starts_at` when confirmed. After the visit, set `status` to `completed` and `completed_at` to the actual completion time. Use `cancelled` or `no_show` when appropriate. Do not mark a request as attended merely because its preferred date passed.

Run `reports/campaign_performance.sql` in the SQL editor for saved, confirmed, and attended counts by UTM campaign. Record actual spend for the same campaign and date range in your private advertising spreadsheet. **Cost per attended appointment = campaign spend ÷ attended appointments.** Keep campaigns with zero attended appointments separate rather than dividing by zero.
