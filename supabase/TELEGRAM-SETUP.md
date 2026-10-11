# Telegram booking notifications

## Two separate Telegram destinations

- Public contact: https://t.me/lashandlaideg (website contact buttons).
- Private staff bot: `@LashAndLaidBookingsBot` (server-generated booking alerts).

Never link customers to the staff bot. Never put its token or staff chat ID in public assets, Git, screenshots, or logs.

## Configuration

In the existing project's Edge Functions secrets, set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. The chat ID must identify the owner's confirmed private chat (or an explicitly approved private staff group), not the bot's own account. The owner must first press Start on the bot. Do not automatically select an arbitrary person who starts a public bot.

The token and recipient secret names were verified in the live dashboard on 2026-10-10. Destination discovery matched the owner's private Saved Messages ID. A labelled staff-only test alert was delivered and visibly verified in the booking bot conversation at 14:13 Africa/Cairo. No customer booking was created by that test.

### Release status, 2026-10-10

- Public Telegram links and the social paper-plane icon are live in Cloudflare Pages deployment `5ac75b9a` (isolated from deployed baseline `70ea7fb`). HTTP verification found the icon linking to the business account, not the bot. The booking health probe returned `{"ok":true}`.
- Isolated release files are in `/private/tmp/lash-telegram-release.uLOYE2`. The production booking function was deployed on 2026-10-10 around 14:10 Africa/Cairo using the tested isolated source. Its exact single-file deployment source is archived in `supabase/releases/20261010-submit-booking.ts`; do not overwrite it with unpublished campaign code.
- Owner-approved `telegram-setup-check` was deployed separately, protected by explicit administrator-key authorization in addition to enabled gateway JWT verification. It only returns the unique private `/start` sender ID, never bot tokens or message contents. It refuses requests after `2026-10-10T12:00:00Z`.
- Initial discovery returned no unique Start message; after the owner's fresh `/start`, it returned one verified private recipient. `TELEGRAM_CHAT_ID` was saved in Supabase, not in public assets or this repository.
- Post-deploy health probe passed; the production-origin preflight returned 200 and an unrelated origin returned 403. All 11 offline notification/booking tests passed. Full live form-to-database/Sheets/email/Telegram verification remains pending and is not implied by the staff-only test.
- After verifying receipt, the temporary setup function was replaced and redeployed with an unconditional HTTP 410 response. It no longer reads bot updates or sends messages. Temporary local source-transfer pages were removed; the production source archive remains available.

## Behavior

Only saved bookings trigger notifications. Honeypot health checks, validation failures, and database insert failures must never notify. Google Sheets/email and Telegram run independently. An optional photo upload failure still triggers notifications and returns the saved booking reference with a warning. The website shows this warning.

Local update (not deployed): at the owner's request, alerts now include the customer's name, full international WhatsApp number, optional email, selected service, preferred date, submission timestamp, accepted booking terms, source and supplied campaign labels, plus the reference and pending-confirmation status. Uploaded photos, when present, are sent as separate private seven-day signed links. Alerts use protected plain text and disabled link previews. They go only to the server-configured staff recipient, never to customers. Telegram is a third-party processor; protected content does not prevent staff screenshots or substitute for access controls.

Each channel has bounded in-process retries and timeouts. Telegram retries transient failures up to three times, honors short `retry_after` values, and records a generic follow-up note on failure. Ambiguous network failures may result in duplicate alerts: identify requests by booking reference. This is NOT a durable queue and does not guarantee delivery if the Edge runtime terminates. A database-backed outbox/scheduled retry worker is future hardening, not already deployed functionality.

## Deployment gate

The working checkout contains separate, unpublished campaign attribution changes. The live schema check on 2026-10-10 found ZERO campaign columns. Do NOT deploy the entire working function or website as-is: the function currently includes those staged campaign fields and would fail inserts without their migration.

Prepare an isolated release from the actual deployed function plus the Telegram/photo-warning patch, or separately approve and validate the full campaign migration in its documented order. Deploy both `index.ts` and `telegram.ts` together. Do not accidentally ship test files as an endpoint. No new database columns are required by the Telegram helper itself.

Live schema checks confirmed: optional email, forced RLS on bookings and booking_photos, no anon booking table access, private booking-photos bucket, and rate-limit function present. Production-origin preflight and honeypot POST returned 200; an unrelated origin was rejected with 403. These checks do NOT prove a real booking reaches Sheets/email/Telegram.

Run offline tests with Node 22.18+ (verified using Node 26):

```sh
node --test supabase/functions/submit-booking/telegram.test.mjs
npm run check
git diff --check
```

After destination approval/configuration, send an explicitly labeled staff-only notification test (no booking row). Then perform an owner-approved end-to-end request using agreed test contact details; verify database, Sheets, staff email, optional customer email, and Telegram. Do not send a customer WhatsApp message. Keep any cleanup scoped to confirmed test records.

References: https://core.telegram.org/bots/api#sendmessage and https://supabase.com/docs/guides/functions/background-tasks
