# Cloudflare booking backend

The public website posts to `/api/submit-booking` on the canonical www domain. Cloudflare Workers validates submissions, D1 stores private records, and R2 stores private inspiration photos. The existing Google Apps Script receiver continues updating the booking tracker and sending the branded staff/customer emails through Resend. Telegram alerts use the existing private staff bot.

No database or notification credentials are sent to browsers. The Worker has no public booking-list or administrative endpoint. Photos require a signed link that expires after seven days and are served as downloads with no-store/noindex headers. The R2 bucket has no public domain.

## Deploy

Use Wrangler 4.157.0. Check `npx wrangler@4.157.0 whoami` before deployment. Configuration is `cloudflare/wrangler.jsonc`; D1 migrations are in `cloudflare/migrations`.

Required encrypted Worker secrets:

- `GOOGLE_SHEETS_WEBHOOK_URL` and `GOOGLE_SHEETS_WEBHOOK_SECRET`: existing receiver connection.
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`: existing staff alert destination.
- `RATE_LIMIT_SALT` and `PHOTO_LINK_SECRET`: independent random values of at least 32 bytes.

Keep all values in encrypted Cloudflare secrets. Never commit secret files, SQL data exports, client records or photos. `BOOKING_ENABLED=false` disables real submissions while the harmless `website=health-check` request remains available.

```sh
node --test cloudflare/worker.test.mjs
python3 cloudflare/convert-backup.py --self-test
npx wrangler@4.157.0 deploy --dry-run --config cloudflare/wrangler.jsonc
npx wrangler@4.157.0 d1 migrations apply lash-and-laid-bookings --remote --config cloudflare/wrangler.jsonc
npx wrangler@4.157.0 deploy --config cloudflare/wrangler.jsonc
```

## Staff operations

The existing Google Sheets tracker remains available. The authoritative new records are in Cloudflare D1 `lash-and-laid-bookings`; authorized Cloudflare account members can use its Studio to inspect/update appointment statuses. `preferred_date` is a request, not a confirmed appointment; set `confirmed_starts_at` only after agreeing with the client.

`booking_notifications` records Google/Resend and Telegram delivery-attempt statuses. `sent` means the receiver accepted the request; actual email delivery is verified in Resend. Failed or pending notifications require investigation; never ask a client to resubmit an already-saved booking. The receiver's existing duplicate-reference handling prevents duplicate spreadsheet rows. Background execution and provider failures can leave a pending status; there is no automatic indefinite replay.

Private photo links can be issued with the exported `signPhoto` helper using the server-side signing secret, or staff may download objects through the authenticated R2 dashboard. Do not make the bucket public.

## Migration and rollback

`convert-backup.py` accepts a Supabase SQL gzip and storage ZIP. It validates the schema, reference counter, relationships, exact object paths and sizes, then writes a D1 import plus photo manifest **outside the Git repository**. Imports deliberately fail on duplicate records rather than overwrite them. Compare every imported field and every photo checksum before cutover. The temporary IP rate-limit counters are not historical client data and are reset.

Keep the source project and protected backups during the transition. Deploy `legacy-supabase.ts` as the old Supabase `submit-booking` function: it forwards older open browser tabs to Cloudflare without writing to Supabase or sending duplicate notifications. Its HMAC-bound client address uses the existing webhook secret to preserve rate limiting. Check the old database for late arrivals before retiring Supabase. Do not pause or delete the old project until reconciliation is complete.

To roll back, first reconcile Cloudflare records and restore the original Supabase function from `supabase/functions/submit-booking/`, then restore the previous Pages deployment with its Supabase endpoint and corresponding CSP allowlist. Reverting Pages alone still uses the compatibility bridge. Keep the Cloudflare database and photos intact and reconcile any bookings received after cutover before reverting writes. Rolling back the website does not copy new Cloudflare records back to Supabase automatically.

The static frontend release must contain only `public/`. Backend source, backups and secrets must never be included in the public asset directory.
