const bookingDialog = document.querySelector('#bookingDialog');
const bookingForm = document.querySelector('#bookingForm');
const bookingDate = bookingForm?.elements.date;
const bookingStatus = bookingDialog?.querySelector('[data-booking-status]');
let bookingTrigger = null;

function localDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function prepareBookingCalendar() {
  if (!bookingDate) return;
  const today = new Date();
  const finalDay = new Date(today);
  finalDay.setDate(finalDay.getDate() + Number(bookingDialog?.dataset.bookingWindow || 90));
  bookingDate.min = localDateValue(today);
  bookingDate.max = localDateValue(finalDay);
}

function openBooking(event) {
  bookingTrigger = event.currentTarget;
  prepareBookingCalendar();
  document.body.classList.add('booking-open');
  bookingDialog.showModal();
  bookingStatus.textContent = '';
  if (window.innerWidth > 640) bookingForm.elements.fullName.focus();
}

function closeBooking() {
  bookingDialog.close();
}

document.querySelectorAll('[data-booking-open]').forEach(button => button.addEventListener('click', openBooking));
bookingDialog?.querySelectorAll('[data-booking-close]').forEach(button => button.addEventListener('click', closeBooking));
bookingDialog?.addEventListener('close', () => {
  document.body.classList.remove('booking-open');
  bookingTrigger?.focus();
});

bookingForm?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!bookingForm.reportValidity()) return;
  const values = new FormData(bookingForm);
  const submitButton = bookingForm.querySelector('[type="submit"]');
  submitButton.disabled = true;
  submitButton.classList.add('is-loading');
  submitButton.textContent = 'Saving your request…';
  bookingStatus.textContent = 'Securely saving your booking request.';

  let result;
  try {
    const response = await fetch(bookingDialog.dataset.bookingEndpoint, {
      method: 'POST',
      body: values,
      headers: { Accept: 'application/json' }
    });
    result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || 'We could not save your request. Please try again.');
  } catch (error) {
    bookingStatus.textContent = error.message || 'We could not save your request. Please try again.';
    submitButton.disabled = false;
    submitButton.classList.remove('is-loading');
    submitButton.textContent = 'Submit & continue to WhatsApp';
    return;
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
  bookingStatus.textContent = result.warning || `Booking ${result.bookingReference} saved. Opening WhatsApp…`;
  window.location.assign(whatsappUrl.toString());
});

prepareBookingCalendar();
