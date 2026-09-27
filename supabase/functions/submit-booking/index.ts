import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILES = 3;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
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
      });
      const result = await response.json().catch(() => null);
      if (response.ok && result?.ok) return;
      lastError = result?.error || `Notification returned ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  throw new Error(lastError);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return json({ ok: false, error: "The booking form format is invalid" }, 415);
    }

    const form = await request.formData();
    if (textValue(form, "website", 200)) return json({ ok: true });

    const fullName = textValue(form, "fullName", 120);
    const whatsappNumber = textValue(form, "phone", 40);
    const email = textValue(form, "email", 254);
    const service = textValue(form, "service", 120);
    const preferredDate = textValue(form, "date", 10);
    const sourceValue = textValue(form, "source", 20);
    const source = sourceValue === "shopify" ? "shopify" : "standalone";
    const consent = textValue(form, "confirmation", 20);
    const photos = form.getAll("photos").filter((item): item is File => item instanceof File && item.size > 0);

    if (fullName.length < 2) return json({ ok: false, error: "Please enter your full name" }, 400);
    if (!isPlausiblePhone(whatsappNumber)) return json({ ok: false, error: "Please enter a valid WhatsApp number" }, 400);
    if (!isPlausibleEmail(email)) return json({ ok: false, error: "Please enter a valid email address" }, 400);
    if (service.length < 2) return json({ ok: false, error: "Please choose a service" }, 400);
    if (!isAllowedDate(preferredDate)) return json({ ok: false, error: "Please choose a date within the next 90 days" }, 400);
    if (!consent) return json({ ok: false, error: "Please confirm the appointment request" }, 400);
    if (photos.length > MAX_FILES) return json({ ok: false, error: "Please choose no more than 3 photos" }, 400);
    for (const photo of photos) {
      if (!ALLOWED_IMAGE_TYPES.has(photo.type) || photo.size > MAX_FILE_BYTES) {
        return json({ ok: false, error: "Photos must be JPEG, PNG, or WebP and no larger than 10 MB each" }, 400);
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) throw new Error("Database configuration is missing");
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        source,
        full_name: fullName,
        whatsapp_number: whatsappNumber,
        email,
        service,
        preferred_date: preferredDate,
        photo_count: photos.length,
      })
      .select("id, reference, created_at")
      .single();

    if (bookingError || !booking) throw bookingError || new Error("Booking could not be created");

    const uploadedPaths: string[] = [];
    const photoLinks: string[] = [];
    try {
      for (let index = 0; index < photos.length; index += 1) {
        const photo = photos[index];
        const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
        const storagePath = `${booking.id}/${index + 1}-${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("booking-photos")
          .upload(storagePath, photo, { contentType: photo.type, upsert: false });
        if (uploadError) throw uploadError;
        uploadedPaths.push(storagePath);

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

      await notifyBooking({
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
    } catch (error) {
      await supabase.from("bookings").update({
        staff_notes: `Automatic notification needs attention: ${error instanceof Error ? error.message : "unknown error"}`.slice(0, 1000),
      }).eq("id", booking.id);
      return json({
        ok: true,
        bookingReference: booking.reference,
        warning: "Your request was saved, but the team notification needs attention.",
      }, 202);
    }

    return json({ ok: true, bookingReference: booking.reference }, 201);
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: "We could not save your booking. Please try again." }, 500);
  }
});
