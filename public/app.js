const bookingDialog = document.querySelector('#bookingDialog');
const bookingForm = document.querySelector('#bookingForm');
const bookingDate = bookingForm?.elements.date;
const bookingStatus = bookingDialog?.querySelector('[data-booking-status]');
const bookingSuccess = bookingDialog?.querySelector('[data-booking-success]');
const bookingReference = bookingDialog?.querySelector('[data-booking-reference]');
const bookingWarning = bookingDialog?.querySelector('[data-booking-warning]');
const bookingWhatsapp = bookingDialog?.querySelector('[data-booking-whatsapp]');
const menuToggle = document.querySelector('.menu-toggle');
const navMenu = document.querySelector('#navMenu');
let bookingTrigger = null;
let bookingScrollY = 0;
let bookingPending = false;

const campaignFields = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const campaignParams = new URLSearchParams(window.location.search);
let campaign = {};
try {
  campaign = JSON.parse(sessionStorage.getItem('lashCampaign') || '{}');
} catch (_) {
  campaign = {};
}
if (!campaign || typeof campaign !== 'object' || Array.isArray(campaign)) campaign = {};
campaign = Object.fromEntries(campaignFields.filter(field => typeof campaign[field] === 'string')
  .map(field => [field, campaign[field].trim().slice(0, 120)]));
if (campaignFields.some(field => campaignParams.has(field))) {
  campaign = Object.fromEntries(campaignFields.map(field => [field, (campaignParams.get(field) || '').trim().slice(0, 120)]));
  try { sessionStorage.setItem('lashCampaign', JSON.stringify(campaign)); } catch (_) { /* Storage may be unavailable. */ }
}

function trackBooking(eventName, details = {}) {
  window.LashTracking?.track(eventName, details);
}

function closeMenu() {
  navMenu?.classList.remove('is-open');
  menuToggle?.setAttribute('aria-expanded', 'false');
  menuToggle?.setAttribute('aria-label', 'Open menu');
}

menuToggle?.addEventListener('click', () => {
  const isOpen = navMenu.classList.toggle('is-open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
  menuToggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
});
navMenu?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('click', event => {
  if (!event.target.closest('.nav')) closeMenu();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeMenu();
});

function localDateValue(date) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const value = type => parts.find(part => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function parseLocalDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function prepareBookingCalendar() {
  if (!bookingDate) return;
  const today = localDateValue(new Date());
  const finalDay = new Date(`${today}T00:00:00Z`);
  finalDay.setUTCDate(finalDay.getUTCDate() + Number(bookingDialog?.dataset.bookingWindow || 90));
  bookingDate.min = today;
  bookingDate.max = finalDay.toISOString().slice(0, 10);
}

function resetBookingView() {
  bookingForm.hidden = false;
  bookingSuccess.hidden = true;
  bookingStatus.textContent = '';
  const submitButton = bookingForm.querySelector('[type="submit"]');
  submitButton.disabled = false;
  submitButton.classList.remove('is-loading');
  submitButton.textContent = 'Save booking request';
  bookingReference.textContent = '';
  if (bookingWarning) {
    bookingWarning.textContent = '';
    bookingWarning.hidden = true;
  }
  bookingWhatsapp.removeAttribute('href');
}

function openBooking(event) {
  if (bookingDialog.open) return;
  bookingTrigger = event.currentTarget;
  closeMenu();
  if (!bookingPending) resetBookingView();
  prepareBookingCalendar();
  const requestedService = bookingTrigger?.dataset.service;
  if (requestedService && bookingForm?.elements.service) {
    bookingForm.elements.service.value = requestedService;
  }
  bookingScrollY = window.scrollY;
  // Freeze the underlying page without losing its position on mobile Safari.
  document.body.style.top = `-${bookingScrollY}px`;
  document.documentElement.classList.add('booking-open');
  document.body.classList.add('booking-open');
  bookingDialog.showModal();
  bookingDialog.scrollTop = 0;
  trackBooking('booking_start', { service: requestedService || 'not_selected' });
  if (window.innerWidth > 640) bookingForm.elements.fullName.focus({ preventScroll: true });
}

function closeBooking() {
  if (bookingPending) return;
  bookingDialog.close();
}

document.querySelectorAll('[data-booking-open]').forEach(button => button.addEventListener('click', openBooking));
bookingDialog?.querySelectorAll('[data-booking-close]').forEach(button => button.addEventListener('click', closeBooking));
bookingDialog?.addEventListener('cancel', event => { if (bookingPending) event.preventDefault(); });
bookingDialog?.addEventListener('close', () => {
  document.body.classList.remove('booking-open');
  document.body.style.top = '';
  window.scrollTo({ top: bookingScrollY, behavior: 'instant' });
  document.documentElement.classList.remove('booking-open');
  if (!bookingPending) {
    bookingForm.reset();
    resetBookingView();
  }
  bookingTrigger?.focus({ preventScroll: true });
});

bookingForm?.addEventListener('submit', async event => {
  event.preventDefault();
  if (bookingPending) return;
  if (!bookingForm.reportValidity()) {
    bookingStatus.textContent = 'Please fill in all required fields, including the confirmation checkbox, then tap submit again.';
    return;
  }
  const values = new FormData(bookingForm);
  for (const field of campaignFields) {
    if (campaign[field]) values.set(field, campaign[field]);
  }
  const submitButton = bookingForm.querySelector('[type="submit"]');
  bookingPending = true;
  submitButton.disabled = true;
  submitButton.classList.add('is-loading');
  submitButton.textContent = 'Saving your request…';
  bookingStatus.textContent = 'Securely saving your booking request.';

  let result;
  let uncertainSave = false;
  try {
    const response = await fetch(bookingDialog.dataset.bookingEndpoint, {
      method: 'POST',
      body: values,
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20000)
    });
    result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok !== true) {
      // Do not reflect arbitrary server/debug messages into the customer UI.
      const safeErrors = new Set([
        'Please enter your full name', 'Please enter a valid WhatsApp number',
        'Please enter a valid email address or leave it blank', 'Please choose a service',
        'Please choose a date within the next 90 days', 'Please confirm the appointment request',
        'Please choose no more than 3 photos', 'Photos must be JPEG, PNG, or WebP and no larger than 10 MB each',
        'Too many booking attempts. Please wait a few minutes and try again.'
      ]);
      throw new Error(safeErrors.has(result?.error) ? result.error : 'We could not confirm your request. Please contact us before trying again.');
    }
    if (typeof result.bookingReference !== 'string' || !/^LL-[A-Z0-9-]{1,60}$/i.test(result.bookingReference)) {
      uncertainSave = true;
      throw new Error('We could not confirm whether your request was saved. Please contact us before submitting again.');
    }
  } catch (error) {
    bookingStatus.textContent = error.name === 'Error' ? error.message : 'We could not confirm your request. Please contact us before trying again.';
    submitButton.disabled = uncertainSave;
    submitButton.classList.remove('is-loading');
    submitButton.textContent = 'Save booking request';
    return;
  } finally {
    bookingPending = false;
  }

  const chosenDate = parseLocalDate(String(values.get('date')));
  const formattedDate = new Intl.DateTimeFormat('en-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(chosenDate);
  const service = values.get('service');
  const message = [
    'Hello Lash & Laid, I would like to request an appointment.',
    '',
    `Booking reference: ${result.bookingReference}`,
    `Full name: ${values.get('fullName')}`,
    `Service: ${service}`,
    `Preferred date: ${formattedDate}`,
    `Inspiration photos: I'll send any here for my ${service}.`,
    '',
    'Please contact me so we can mutually agree on the final appointment date and time.'
  ].join('\n');
  const whatsappUrl = new URL(bookingDialog.dataset.whatsappUrl || 'https://wa.me/201092445224');
  whatsappUrl.searchParams.set('text', message);
  bookingReference.textContent = result.bookingReference;
  if (bookingWarning) {
    bookingWarning.textContent = result.warning ? 'Your request was saved, but an optional photo upload needs attention. Please send any inspiration photos directly to us.' : '';
    bookingWarning.hidden = !result.warning;
  }
  bookingWhatsapp.href = whatsappUrl.toString();
  bookingForm.hidden = true;
  bookingSuccess.hidden = false;
  trackBooking('generate_lead', { service: String(service) });
  if (bookingDialog.open) {
    bookingDialog.scrollTop = 0;
    bookingSuccess.focus({ preventScroll: true });
  }
});

document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="https://wa.me/"]');
  if (!link) return;
  trackBooking('whatsapp_click', { placement: link.hasAttribute('data-booking-whatsapp') ? 'booking_saved' : 'site_contact' });
});

prepareBookingCalendar();
