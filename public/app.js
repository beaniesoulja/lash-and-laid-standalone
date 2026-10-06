const bookingDialog = document.querySelector('#bookingDialog');
const bookingForm = document.querySelector('#bookingForm');
const bookingDate = bookingForm?.elements.date;
const bookingStatus = bookingDialog?.querySelector('[data-booking-status]');
const bookingSuccess = bookingDialog?.querySelector('[data-booking-success]');
const bookingReference = bookingDialog?.querySelector('[data-booking-reference]');
const bookingWhatsapp = bookingDialog?.querySelector('[data-booking-whatsapp]');
const menuToggle = document.querySelector('.menu-toggle');
const navMenu = document.querySelector('#navMenu');
let bookingTrigger = null;

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

function resetBookingView() {
  bookingForm.hidden = false;
  bookingSuccess.hidden = true;
  bookingStatus.textContent = '';
  const submitButton = bookingForm.querySelector('[type="submit"]');
  submitButton.disabled = false;
  submitButton.classList.remove('is-loading');
  submitButton.textContent = 'Save booking request';
  bookingReference.textContent = '';
  bookingWhatsapp.removeAttribute('href');
}

function openBooking(event) {
  bookingTrigger = event.currentTarget;
  closeMenu();
  resetBookingView();
  prepareBookingCalendar();
  const requestedService = bookingTrigger?.dataset.service;
  if (requestedService && bookingForm?.elements.service) {
    bookingForm.elements.service.value = requestedService;
  }
  document.body.classList.add('booking-open');
  bookingDialog.showModal();
  if (window.innerWidth > 640) bookingForm.elements.fullName.focus();
}

function closeBooking() {
  bookingDialog.close();
}

document.querySelectorAll('[data-booking-open]').forEach(button => button.addEventListener('click', openBooking));
bookingDialog?.querySelectorAll('[data-booking-close]').forEach(button => button.addEventListener('click', closeBooking));
bookingDialog?.addEventListener('close', () => {
  document.body.classList.remove('booking-open');
  bookingForm.reset();
  resetBookingView();
  bookingTrigger?.focus();
});

bookingForm?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!bookingForm.reportValidity()) {
    bookingStatus.textContent = 'Please fill in all required fields, including the confirmation checkbox, then tap submit again.';
    return;
  }
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
    submitButton.textContent = 'Save booking request';
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
  bookingReference.textContent = result.bookingReference;
  bookingWhatsapp.href = whatsappUrl.toString();
  bookingForm.hidden = true;
  bookingSuccess.hidden = false;
  bookingWhatsapp.focus();
});

prepareBookingCalendar();
