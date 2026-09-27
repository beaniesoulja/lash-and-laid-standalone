const productGrid = document.querySelector('#productGrid');
const shopEmpty = document.querySelector('#shopEmpty');

function money(value) {
  return new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 2 }).format(value || 0);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function renderProducts(products) {
  if (!products.length) {
    productGrid.innerHTML = '';
    shopEmpty.hidden = false;
    return;
  }
  shopEmpty.hidden = true;
  productGrid.innerHTML = products.map(product => {
    const sale = product.compareAt > product.price;
    const image = product.image || '/assets/lash-laid-hair.jpg';
    return `<article class="product-card">
      <div class="product-media"><img src="${escapeHtml(image)}" alt="${escapeHtml(product.title)}" loading="lazy" decoding="async" width="900" height="1154">${sale ? '<span class="product-badge">Sale</span>' : ''}</div>
      <div class="product-details">
        <p>${escapeHtml(product.type)}</p>
        <h3>${escapeHtml(product.title)}</h3>
        <div class="product-price"><span>${money(product.price)}</span>${sale ? `<s>${money(product.compareAt)}</s>` : ''}</div>
      </div>
    </article>`;
  }).join('');
}

async function loadProducts() {
  try {
    const response = await fetch('/api/products', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Products are unavailable');
    renderProducts(await response.json());
  } catch {
    renderProducts([]);
  }
}

const bookingDialog = document.querySelector('#bookingDialog');
const bookingForm = document.querySelector('#bookingForm');
const bookingDate = bookingForm?.elements.date;
const bookingPhotos = bookingForm?.elements.photos;
const bookingPhotoSummary = bookingDialog?.querySelector('[data-photo-summary]');
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
  bookingForm.elements.fullName.focus();
}

function closeBooking() {
  bookingDialog.close();
}

function summarizePhotos() {
  const files = [...(bookingPhotos?.files || [])];
  bookingPhotos.setCustomValidity(files.length > 3 ? 'Please choose no more than 3 photos.' : '');
  if (!files.length) bookingPhotoSummary.textContent = 'No photos selected';
  else if (files.length > 3) bookingPhotoSummary.textContent = 'Please choose no more than 3 photos';
  else bookingPhotoSummary.textContent = files.map(file => file.name).join(', ');
}

document.querySelectorAll('[data-booking-open]').forEach(button => button.addEventListener('click', openBooking));
bookingDialog?.querySelectorAll('[data-booking-close]').forEach(button => button.addEventListener('click', closeBooking));
bookingDialog?.addEventListener('close', () => {
  document.body.classList.remove('booking-open');
  bookingTrigger?.focus();
});
bookingPhotos?.addEventListener('change', summarizePhotos);

bookingForm?.addEventListener('submit', event => {
  event.preventDefault();
  summarizePhotos();
  if (!bookingForm.reportValidity()) return;
  const values = new FormData(bookingForm);
  const chosenDate = parseLocalDate(String(values.get('date')));
  const formattedDate = new Intl.DateTimeFormat('en-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(chosenDate);
  const photoCount = bookingPhotos.files.length;
  const message = [
    'Hello Lash & Laid, I would like to request an appointment.',
    '',
    `Full name: ${values.get('fullName')}`,
    `WhatsApp number: ${values.get('phone')}`,
    `Email: ${values.get('email')}`,
    `Service: ${values.get('service')}`,
    `Preferred date: ${formattedDate}`,
    `Inspiration photos: ${photoCount ? `${photoCount} selected — I will attach them in this chat.` : 'None'}`,
    '',
    'Please contact me so we can mutually agree on the final appointment date and time.'
  ].join('\n');
  const whatsappUrl = new URL(bookingDialog.dataset.whatsappUrl || 'https://wa.me/201092445224');
  whatsappUrl.searchParams.set('text', message);
  window.open(whatsappUrl.toString(), '_blank', 'noopener');
  closeBooking();
});

prepareBookingCalendar();
loadProducts();
