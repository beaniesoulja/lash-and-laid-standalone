# Lash & Laid booking receiver

`Code.gs` is the source for the Google Apps Script web app that receives the server-side Supabase notification, appends the booking to the private Google Sheet, and emails the Lash & Laid team.

The staff notification uses email-client-safe table markup, inline CSS, a plain-text fallback, a WhatsApp follow-up button, a booking-tracker button, and a clear notice that the requested date is not yet confirmed.

When the customer supplies a valid optional email address, the receiver also sends a branded thank-you email. It confirms that the request was saved, shows the booking reference and request summary, explains that the date is still pending, and tells the customer to expect confirmation shortly. No customer email is sent when the optional field is empty.

## Deployment

1. Paste `Code.gs` into the existing **Lash & Laid Booking Receiver** Apps Script project.
2. Keep `BOOKING_WEBHOOK_SECRET` in Apps Script properties. Never place it in this repository.
3. Save the project.
4. Edit the existing web-app deployment, select **New version**, and deploy it without changing the web-app URL.
5. Submit a clearly labelled test request and confirm the Supabase row, Google Sheets row, and HTML notification email.

The spreadsheet ID and notification inbox are operational configuration for this business. All credentials and webhook secrets remain outside the repository.
