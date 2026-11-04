import { servePhoto, signPhoto, readMultipart, validImage } from "./privacy.ts";
import { notifyTelegram } from "../supabase/functions/submit-booking/telegram.ts";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILES = 3;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RATE_LIMIT_ATTEMPTS = 15;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
const ALLOWED_BROWSER_ORIGINS = new Set([
  "https://lashandlaid.com",
  "https://www.lashandlaid.com",
]);

const baseCorsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  return {
    ...baseCorsHeaders,
    ...(ALLOWED_BROWSER_ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
  };
}

function isAllowedBrowserOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || ALLOWED_BROWSER_ORIGINS.has(origin);
}

function json(request: Request, body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), ...extraHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function textValue(form: FormData, name: string, maxLength: number) {
  return String(form.get(name) ?? "").trim().slice(0, maxLength);
}

function campaignValue(form: FormData, name: string) {
  const value = textValue(form, name, 120).replace(/[\u0000-\u001f\u007f]/g, "");
  // Campaign tags are staff-created labels, never contact details.
  return value && !/@|\d{7,}/.test(value) && !/^[=+\-]/.test(value) ? value : null;
}

function isPlausiblePhone(value: string) {
  return /^[+()\-\s\d]{5,40}$/.test(value) && /\d{5}/.test(value.replace(/\D/g, ""));
}

function isPlausibleEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isAllowedDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const requested = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(requested.getTime()) || requested.toISOString().slice(0, 10) !== value) return false;
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find((entry) => entry.type === type)!.value;
  const today = new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00Z`);
  const lastDay = new Date(today);
  lastDay.setUTCDate(lastDay.getUTCDate() + 90);
  return requested >= today && requested <= lastDay;
}

export async function clientAddress(request: Request, env: any) {
  const signature = request.headers.get('x-lash-legacy-auth') || '';
  const address = request.headers.get('x-lash-legacy-ip') || '';
  // Only the legacy backend knows the shared secret; browser-supplied IP headers never bypass rate limits.
  if (/^[a-f0-9]{64}$/.test(signature) && /^[a-fA-F0-9:.]{3,64}$/.test(address) && env.GOOGLE_SHEETS_WEBHOOK_SECRET) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw',encoder.encode(env.GOOGLE_SHEETS_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    const bytes = Uint8Array.from(signature.match(/../g)!,s=>parseInt(s,16));
    if (await crypto.subtle.verify('HMAC',key,bytes,encoder.encode('lash-cloudflare-booking-bridge:'+address))) return address;
  }
  return request.headers.get("cf-connecting-ip") || "unknown";
}

async function fingerprintClient(request: Request, env: any) {
  const salt = env.RATE_LIMIT_SALT;
  if (!salt) throw new Error("Rate limiting is not configured");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(salt),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(await clientAddress(request, env)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function notifyBooking(payload: Record<string, unknown>, env: any) {
  const webhookUrl = env.GOOGLE_SHEETS_WEBHOOK_URL;
  const webhookSecret = env.GOOGLE_SHEETS_WEBHOOK_SECRET;
  if (!webhookUrl || !webhookSecret) throw new Error("Booking notification is not configured");

  let lastError = "Booking notification failed";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, secret: webhookSecret }),
        signal: AbortSignal.timeout(8000),
      });
      const result = await response.json().catch(() => null);
      if (response.ok && result?.ok) return;
      lastError = `Notification returned ${response.status}`;
    } catch {
      lastError = "Booking notification timed out or failed";
    }
  }
  throw new Error(lastError);
}

export default { async fetch(request: Request, env: any, ctx: any) {
  const url = new URL(request.url);
  if (url.pathname === "/api/booking-photo") return servePhoto(request, env);
  if (url.pathname !== "/api/submit-booking") return new Response("Not found", { status: 404 });
  const respond = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
    json(request, body, status, extraHeaders);

  if (!isAllowedBrowserOrigin(request)) {
    return respond({ ok: false, error: "This booking form is not allowed from this website" }, 403);
  }
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return respond({ ok: false, error: "Method not allowed" }, 405);

  let savedBooking: any = null;
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return respond({ ok: false, error: "The booking form format is invalid" }, 415);
    }
    const form = await readMultipart(request);
    if (textValue(form, "website", 200)) return respond({ ok: true });

    if (env.BOOKING_ENABLED !== "true") return respond({ ok: false, error: "Booking is temporarily unavailable. Please contact us." }, 503);
    for (const name of ["RATE_LIMIT_SALT", "PHOTO_LINK_SECRET", "GOOGLE_SHEETS_WEBHOOK_URL", "GOOGLE_SHEETS_WEBHOOK_SECRET", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]) {
      if (!env[name]) throw new Error("Booking configuration is incomplete");
    }
    const fingerprint = await fingerprintClient(request, env);
    const now = Math.floor(Date.now() / 1000);
    const start = Math.floor(now / RATE_LIMIT_WINDOW_SECONDS) * RATE_LIMIT_WINDOW_SECONDS;
    const results = await env.DB.batch([
      env.DB.prepare("DELETE FROM booking_rate_limits WHERE expires_at < ?").bind(now),
      env.DB.prepare(`INSERT INTO booking_rate_limits (fingerprint,window_started_at,attempts,expires_at)
        VALUES (?,?,1,?) ON CONFLICT(fingerprint,window_started_at)
        DO UPDATE SET attempts=attempts+1 RETURNING attempts`).bind(fingerprint,start,start+RATE_LIMIT_WINDOW_SECONDS*2)
    ]);
    const attempts = results[1].results[0].attempts;
    const limit = { allowed: attempts <= RATE_LIMIT_ATTEMPTS, retry_after_seconds: start+RATE_LIMIT_WINDOW_SECONDS-now };
    if (!limit?.allowed) {
      const retryAfter = Math.max(1, Number(limit?.retry_after_seconds) || RATE_LIMIT_WINDOW_SECONDS);
      return respond(
        { ok: false, error: "Too many booking attempts. Please wait a few minutes and try again." },
        429,
        { "Retry-After": String(retryAfter) },
      );
    }

    const fullName = textValue(form, "fullName", 120);
    const whatsappNumber = textValue(form, "phone", 40);
    const email = textValue(form, "email", 254);
    const service = textValue(form, "service", 120);
    const preferredDate = textValue(form, "date", 10);
    const sourceValue = textValue(form, "source", 20);
    const source = sourceValue === "shopify" ? "shopify" : "standalone";
    const campaignSource = campaignValue(form, "utm_source");
    const campaignMedium = campaignValue(form, "utm_medium");
    const campaignName = campaignValue(form, "utm_campaign");
    const campaignContent = campaignValue(form, "utm_content");
    const campaignTerm = campaignValue(form, "utm_term");
    const consent = textValue(form, "confirmation", 20);
    const photos = form.getAll("photos").filter((item): item is File => item instanceof File && item.size > 0);

    if (fullName.length < 2) return respond({ ok: false, error: "Please enter your full name" }, 400);
    if (!isPlausiblePhone(whatsappNumber)) return respond({ ok: false, error: "Please enter a valid WhatsApp number" }, 400);
    if (!isPlausibleEmail(email)) return respond({ ok: false, error: "Please enter a valid email address" }, 400);
    if (service.length < 2) return respond({ ok: false, error: "Please choose a service" }, 400);
    if (!isAllowedDate(preferredDate)) return respond({ ok: false, error: "Please choose a date within the next 90 days" }, 400);
    if (!consent) return respond({ ok: false, error: "Please confirm the appointment request" }, 400);
    if (photos.length > MAX_FILES) return respond({ ok: false, error: "Please choose no more than 3 photos" }, 400);
    for (const photo of photos) {
      if (!ALLOWED_IMAGE_TYPES.has(photo.type) || photo.size > MAX_FILE_BYTES || !(await validImage(photo))) {
        return respond({ ok: false, error: "Photos must be JPEG, PNG, or WebP and no larger than 10 MB each" }, 400);
      }
    }

    const bookingId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const dateParts = new Intl.DateTimeFormat('en', { timeZone: 'Africa/Cairo', year: '2-digit', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const day = ['year','month','day'].map(type => dateParts.find(p => p.type === type)!.value).join('');
    // D1 batch commits the counter and booking together, so concurrent requests cannot share a reference.
    const saved = await env.DB.batch([
      env.DB.prepare("UPDATE booking_sequence SET value=value+1 WHERE id=1"),
      env.DB.prepare(`INSERT INTO bookings (id,reference,created_at,updated_at,source,full_name,whatsapp_number,email,service,preferred_date,photo_count,consent_at,campaign_source,campaign_medium,campaign_name,campaign_content,campaign_term)
        SELECT ?, 'LL-' || ? || '-' || printf('%04d',value), ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM booking_sequence WHERE id=1
        RETURNING id,reference,created_at`).bind(bookingId,day,createdAt,createdAt,source,fullName,whatsappNumber,email||null,service,preferredDate,photos.length,createdAt,campaignSource,campaignMedium,campaignName,campaignContent,campaignTerm)
    ]);
    const booking = saved[1].results[0];
    if (!booking) throw new Error("Booking could not be created");
    savedBooking = booking;

    const photoLinks: string[] = [];
    let photoUploadWarning = false;
    try {
      for (let index = 0; index < photos.length; index += 1) {
        const photo = photos[index];
        const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
        const storagePath = `${booking.id}/${index + 1}-${crypto.randomUUID()}.${extension}`;
        await env.PHOTOS.put(storagePath, photo.stream(), { httpMetadata: {contentType: photo.type} });
        await env.DB.prepare(`INSERT INTO booking_photos (id,booking_id,position,storage_path,original_name,mime_type,size_bytes)
          VALUES (?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),booking.id,index+1,storagePath,photo.name.slice(0,255)||`photo-${index+1}.${extension}`,photo.type,photo.size).run();
        photoLinks.push(await signPhoto(url.origin, storagePath, env.PHOTO_LINK_SECRET));
      }
    } catch {
      // The booking already exists. Still notify staff even when an optional upload fails.
      photoUploadWarning = true;
    }

    // The Google Sheets/email notification is a nice-to-have, not core booking data (already
    // safely committed above), and its retries can take seconds when the webhook is slow. Run
    // it after the response goes out so the customer's WhatsApp handoff isn't stuck waiting on it.
    const notification = {
      bookingReference: booking.reference,
      submittedAt: booking.created_at,
      fullName,
      whatsapp: whatsappNumber,
      email,
      service,
      requestedDate: preferredDate,
      photos: photoLinks,
      recordId: booking.id,
      source,
      campaignSource,
      campaignMedium,
      campaignName,
      campaignContent,
      campaignTerm,
      photoUploadWarning,
    };
    // Record the pending delivery before starting network requests. Failures remain visible to staff.
    await env.DB.prepare("INSERT INTO booking_notifications (booking_id,payload) VALUES (?,?)")
      .bind(booking.id,JSON.stringify(notification)).run();
    const googleTask = notifyBooking(notification, env);
    const telegramTask = notifyTelegram({
      bookingReference: booking.reference,
      submittedAt: booking.created_at,
      fullName,
      whatsapp: whatsappNumber,
      email,
      service,
      requestedDate: preferredDate,
      source,
      campaignSource,
      campaignMedium,
      campaignName,
      campaignContent,
      campaignTerm,
      photos: photoLinks,
      photoUploadWarning,
    }, {
      token: env.TELEGRAM_BOT_TOKEN,
      chatId: env.TELEGRAM_CHAT_ID,
    });
    const notifyTask = Promise.allSettled([googleTask, telegramTask]).then(async (results) => {
      const notes = [
        ...(photoUploadWarning ? ["Photo upload needs attention."] : []),
        ...(results[0].status === "rejected" ? ["Google Sheets/email notification needs attention."] : []),
        ...(results[1].status === "rejected" ? ["Telegram notification needs attention."] : []),
      ];
      await env.DB.prepare("UPDATE booking_notifications SET google_status=?,telegram_status=?,updated_at=? WHERE booking_id=?")
        .bind(results[0].status === 'fulfilled' ? 'sent' : 'failed', results[1].status === 'fulfilled' ? 'sent' : 'failed',new Date().toISOString(),booking.id).run();
      if (notes.length) {
        await env.DB.prepare("UPDATE bookings SET staff_notes=? WHERE id=?").bind(notes.join(' '),booking.id).run();
      }
    }).catch(() => console.error("Booking notification status task failed"));
    ctx.waitUntil(notifyTask);

    return respond({
      ok: true,
      bookingReference: booking.reference,
      ...(photoUploadWarning ? { warning: "Your request was saved, but a photo upload needs attention." } : {}),
    }, photoUploadWarning ? 202 : 201);
  } catch (error) {
    if (savedBooking) {
      await env.DB.prepare("UPDATE bookings SET staff_notes=coalesce(staff_notes,'') || ' Notification setup needs attention.' WHERE id=?").bind(savedBooking.id).run().catch(() => {});
      return respond({ ok: true, bookingReference: savedBooking.reference, warning: "Your request was saved. Please contact us with your reference to confirm the details." }, 202);
    }
    if (error instanceof RangeError) return respond({ ok: false, error: "Photos must be no larger than 10 MB each, up to 3 photos." }, 413);
    console.error("Booking submission failed");
    return respond({ ok: false, error: "We could not save your booking. Please try again." }, 500);
  }
} };
