type TelegramBooking = {
  bookingReference: string;
  service: string;
  requestedDate: string;
  submittedAt?: string;
  fullName?: string;
  whatsapp?: string;
  email?: string;
  source?: string;
  campaignSource?: string | null;
  campaignMedium?: string | null;
  campaignName?: string | null;
  campaignContent?: string | null;
  campaignTerm?: string | null;
  photos?: string[];
  photoUploadWarning?: boolean;
};

type TelegramOptions = {
  token?: string;
  chatId?: string;
  fetcher?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

function line(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 300);
}

// Customer details go only to the staff chat configured in server-side secrets.
// Plain text and protected content avoid formatting injection and casual forwarding.
export async function notifyTelegram(booking: TelegramBooking, options: TelegramOptions) {
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
    `Name: ${line(booking.fullName || 'Not provided')}`,
    `WhatsApp: ${line(booking.whatsapp || 'Not provided')}`,
    `Email: ${line(booking.email || 'Not provided')}`,
    `Service: ${line(booking.service)}`,
    `Requested date: ${line(booking.requestedDate)}`,
    `Submitted at: ${line(booking.submittedAt || 'Not provided')}`,
    `Source: ${line(booking.source || 'Website')}`,
    'Booking terms: Accepted',
    "Status: Awaiting manual confirmation",
    ...([
      ['Campaign source', booking.campaignSource],
      ['Campaign medium', booking.campaignMedium],
      ['Campaign name', booking.campaignName],
      ['Campaign content', booking.campaignContent],
      ['Campaign term', booking.campaignTerm],
    ].filter(([, value]) => value).map(([label, value]) => `${label}: ${line(value!)}`)),
    ...(booking.photoUploadWarning ? ["A photo upload needs attention. The request is saved."] : []),
    'Private staff notification — please keep customer details confidential.',
  ].join("\n");

  // Separate bounded messages keep signed photo links intact below Telegram's limit.
  // These links are created by the backend, never taken directly from submitted text.
  const photoMessages = (booking.photos || []).slice(0, 3).map((url, index) => {
    if (url.length > 3000 || !url.startsWith('https://') || /[\r\n]/.test(url)) {
      throw new Error('Telegram photo link needs attention');
    }
    return `Reference: ${line(booking.bookingReference)}\nPhoto ${index + 1} (private link, expires after 7 days):\n${url}`;
  });
  for (const message of [text, ...photoMessages]) {
    await send(message);
  }
  return { status: 'sent' };

  async function send(text: string) {

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
      if (response.ok && result?.ok === true) return;
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
}
