import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
type TelegramBooking = {
  bookingReference: string;
  service: string;
  requestedDate: string;
  photoUploadWarning?: boolean;
};

type TelegramOptions = {
  token?: string;
  chatId?: string;
  fetcher?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

function line(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 160);
}

// No names, phone numbers, email addresses, or private photo URLs leave the database.
async function notifyTelegram(booking: TelegramBooking, options: TelegramOptions) {
  const token = options.token?.trim();
  const chatId = options.chatId?.trim();
  if (!token && !chatId) return { status: "disabled" };
  if (!token || !chatId || !/^-?[1-9]\d*$/.test(chatId)) {
    throw new Error("Telegram configuration incomplete");
  }
  const fetcher = options.fetcher || fetch;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const text = [
    "New Lash & Laid appointment request",
    `Reference: ${line(booking.bookingReference)}`,
    `Service: ${line(booking.service)}`,
    `Requested date: ${line(booking.requestedDate)}`,
    "Status: Awaiting manual confirmation",
    ...(booking.photoUploadWarning ? ["A photo upload needs attention. The request is saved."] : []),
    "Open the private booking database for customer contact details.",
  ].join("\n");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let delay = 500 * (attempt + 1);
    try {
      const response = await fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          chat_id: chatId,
          text,
          link_preview_options: { is_disabled: true },
          protect_content: true,
        }),
      });
      const result = await response.json().catch(() => null);
      if (response.ok && result?.ok === true) return { status: "sent" };
      const code = Number(result?.error_code) || response.status;
      if (code === 429) {
        const retryAfter = Number(result?.parameters?.retry_after);
        // Do not run beyond the background task budget or retry before Telegram allows it.
        if (!Number.isFinite(retryAfter) || retryAfter < 0 || retryAfter > 5) break;
        delay = Math.max(delay, retryAfter * 1000);
      } else if (code < 500) {
        break;
      }
    } catch {
      // Never log exceptions or provider bodies: a fetch error may contain the bot token.
    }
    if (attempt < 2) await sleep(delay);
  }
  throw new Error("Telegram delivery needs attention");
}


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
    headers: { ...corsHeaders(request), ...extraHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function textValue(form: FormData, name: string, maxLength: number) {
  return String(form.get(name) ?? "").trim().slice(0, maxLength);
}

function isPlausiblePhone(value: string) {
  return /^[+()\-\s\d]{5,40}$/.test(value) && /\d{5}/.test(value.replace(/\D/g, ""));
}

function isPlausibleEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isAllowedDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const requested = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(requested.getTime())) return false;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const lastDay = new Date(today);
  lastDay.setUTCDate(lastDay.getUTCDate() + 90);
  return requested >= today && requested <= lastDay;
}

function clientAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return request.headers.get("cf-connecting-ip") || forwarded || request.headers.get("x-real-ip") || "unknown";
}

async function fingerprintClient(request: Request) {
  const salt = Deno.env.get("RATE_LIMIT_SALT");
  if (!salt) throw new Error("Rate limiting is not configured");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(salt),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(clientAddress(request)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function notifyBooking(payload: Record<string, unknown>) {
  const webhookUrl = Deno.env.get("GOOGLE_SHEETS_WEBHOOK_URL");
  const webhookSecret = Deno.env.get("GOOGLE_SHEETS_WEBHOOK_SECRET");
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

Deno.serve(async (request) => {
  const respond = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
    json(request, body, status, extraHeaders);

  if (!isAllowedBrowserOrigin(request)) {
    return respond({ ok: false, error: "This booking form is not allowed from this website" }, 403);
  }
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return respond({ ok: false, error: "Method not allowed" }, 405);

  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return respond({ ok: false, error: "The booking form format is invalid" }, 415);
    }
    const form = await request.formData();
    if (textValue(form, "website", 200)) return respond({ ok: true });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) throw new Error("Database configuration is missing");
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const fingerprint = await fingerprintClient(request);
    const { data: limitRows, error: limitError } = await supabase.rpc("consume_booking_rate_limit", {
      p_fingerprint: fingerprint,
      p_limit: RATE_LIMIT_ATTEMPTS,
      p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    });
    if (limitError) throw limitError;
    const limit = Array.isArray(limitRows) ? limitRows[0] : limitRows;
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
    const consent = textValue(form, "confirmation", 20);
    const photos = form.getAll("photos").filter((item): item is File => item instanceof File && item.size > 0);

    if (fullName.length < 2) return respond({ ok: false, error: "Please enter your full name" }, 400);
    if (!isPlausiblePhone(whatsappNumber)) return respond({ ok: false, error: "Please enter a valid WhatsApp number" }, 400);
    if (email && !isPlausibleEmail(email)) return respond({ ok: false, error: "Please enter a valid email address or leave it blank" }, 400);
    if (service.length < 2) return respond({ ok: false, error: "Please choose a service" }, 400);
    if (!isAllowedDate(preferredDate)) return respond({ ok: false, error: "Please choose a date within the next 90 days" }, 400);
    if (!consent) return respond({ ok: false, error: "Please confirm the appointment request" }, 400);
    if (photos.length > MAX_FILES) return respond({ ok: false, error: "Please choose no more than 3 photos" }, 400);
    for (const photo of photos) {
      if (!ALLOWED_IMAGE_TYPES.has(photo.type) || photo.size > MAX_FILE_BYTES) {
        return respond({ ok: false, error: "Photos must be JPEG, PNG, or WebP and no larger than 10 MB each" }, 400);
      }
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        source,
        full_name: fullName,
        whatsapp_number: whatsappNumber,
        email: email || null,
        service,
        preferred_date: preferredDate,
        photo_count: photos.length,
      })
      .select("id, reference, created_at")
      .single();

    if (bookingError || !booking) throw bookingError || new Error("Booking could not be created");

    const photoLinks: string[] = [];
    let photoUploadWarning = false;
    try {
      for (let index = 0; index < photos.length; index += 1) {
        const photo = photos[index];
        const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
        const storagePath = `${booking.id}/${index + 1}-${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("booking-photos")
          .upload(storagePath, photo, { contentType: photo.type, upsert: false });
        if (uploadError) throw uploadError;
        const { error: metadataError } = await supabase.from("booking_photos").insert({
          booking_id: booking.id,
          position: index + 1,
          storage_path: storagePath,
          original_name: photo.name.slice(0, 255) || `photo-${index + 1}.${extension}`,
          mime_type: photo.type,
          size_bytes: photo.size,
        });
        if (metadataError) throw metadataError;

        const { data: signed } = await supabase.storage
          .from("booking-photos")
          .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
        if (signed?.signedUrl) photoLinks.push(signed.signedUrl);
      }
    } catch {
      // The booking already exists. Still notify staff even when an optional upload fails.
      photoUploadWarning = true;
    }

    // The Google Sheets/email notification is a nice-to-have, not core booking data (already
    // safely committed above), and its retries can take seconds when the webhook is slow. Run
    // it after the response goes out so the customer's WhatsApp handoff isn't stuck waiting on it.
    const googleTask = notifyBooking({
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
    });
    const telegramTask = notifyTelegram({
      bookingReference: booking.reference,
      service,
      requestedDate: preferredDate,
      photoUploadWarning,
    }, {
      token: Deno.env.get("TELEGRAM_BOT_TOKEN"),
      chatId: Deno.env.get("TELEGRAM_CHAT_ID"),
    });
    const notifyTask = Promise.allSettled([googleTask, telegramTask]).then(async (results) => {
      const notes = [
        ...(photoUploadWarning ? ["Photo upload needs attention."] : []),
        ...(results[0].status === "rejected" ? ["Google Sheets/email notification needs attention."] : []),
        ...(results[1].status === "rejected" ? ["Telegram notification needs attention."] : []),
      ];
      if (notes.length) {
        const { error } = await supabase.from("bookings").update({ staff_notes: notes.join(" ") }).eq("id", booking.id);
        if (error) console.error("Could not record booking follow-up status");
      }
    }).catch(() => console.error("Booking notification status task failed"));
    const backgroundTasks = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (backgroundTasks?.waitUntil) backgroundTasks.waitUntil(notifyTask);
    else await notifyTask;

    return respond({
      ok: true,
      bookingReference: booking.reference,
      ...(photoUploadWarning ? { warning: "Your request was saved, but a photo upload needs attention." } : {}),
    }, photoUploadWarning ? 202 : 201);
  } catch {
    console.error("Booking submission failed");
    return respond({ ok: false, error: "We could not save your booking. Please try again." }, 500);
  }
});

