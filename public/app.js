const productGrid = document.querySelector('#productGrid');
const shopEmpty = document.querySelector('#shopEmpty');
const cartToggles = [...document.querySelectorAll('[data-cart-toggle]')];
const primaryCartToggle = document.querySelector('#cartToggle');
const cartClose = document.querySelector('#cartClose');
const cartDrawer = document.querySelector('#cartDrawer');
const drawerBackdrop = document.querySelector('#drawerBackdrop');
const cartItems = document.querySelector('#cartItems');
const cartEmpty = document.querySelector('#cartEmpty');
const cartFooter = document.querySelector('#cartFooter');
const cartCounts = [...document.querySelectorAll('[data-cart-count]')];
const cartTotal = document.querySelector('#cartTotal');
const checkoutWhatsapp = document.querySelector('#checkoutWhatsapp');
const continueShopping = document.querySelector('#continueShopping');

let products = [];
let cart = readCart();

function readCart() {
  try {
    const value = JSON.parse(localStorage.getItem('lash-laid-cart') || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveCart() {
  localStorage.setItem('lash-laid-cart', JSON.stringify(cart));
}

function money(value) {
  return new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 2 }).format(value || 0);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function renderProducts() {
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
        <div class="product-actions"><button class="add-button" type="button" data-add="${escapeHtml(product.id)}">Add to bag</button></div>
      </div>
    </article>`;
  }).join('');
}

function renderCart() {
  cart = cart.filter(item => products.some(product => product.id === item.id));
  const lines = cart.map(item => {
    const product = products.find(candidate => candidate.id === item.id);
    const quantity = Math.min(item.quantity, product.inventory);
    return { ...item, quantity, product };
  }).filter(item => item.quantity > 0);
  cart = lines.map(({ id, quantity }) => ({ id, quantity }));
  saveCart();

  const count = lines.reduce((total, item) => total + item.quantity, 0);
  const total = lines.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  cartCounts.forEach(element => { element.textContent = String(count); });
  cartEmpty.hidden = lines.length > 0;
  cartFooter.hidden = lines.length === 0;
  cartItems.innerHTML = lines.map(item => `<article class="cart-item">
    <img src="${escapeHtml(item.product.image || '/assets/lash-laid-hair.jpg')}" alt="" loading="lazy" decoding="async" width="80" height="100">
    <div><h3>${escapeHtml(item.product.title)}</h3><p>${money(item.product.price)}</p><div class="quantity"><button type="button" data-decrease="${escapeHtml(item.id)}" aria-label="Decrease ${escapeHtml(item.product.title)} quantity">−</button><span>${item.quantity}</span><button type="button" data-increase="${escapeHtml(item.id)}" aria-label="Increase ${escapeHtml(item.product.title)} quantity">+</button></div></div>
    <button class="remove-item" type="button" data-remove="${escapeHtml(item.id)}">Remove</button>
  </article>`).join('');
  cartTotal.textContent = money(total);
  const orderLines = lines.map(item => `• ${item.product.title} × ${item.quantity} — ${money(item.product.price * item.quantity)}`);
  const message = ['Hello Lash & Laid, I would like to order:', '', ...orderLines, '', `Subtotal: ${money(total)}`, '', 'Please confirm availability and delivery details.'].join('\n');
  checkoutWhatsapp.href = `https://wa.me/201092445224?text=${encodeURIComponent(message)}`;
}

function addToCart(id) {
  const product = products.find(item => item.id === id);
  if (!product) return;
  const current = cart.find(item => item.id === id);
  if (current) current.quantity = Math.min(current.quantity + 1, product.inventory);
  else cart.push({ id, quantity: 1 });
  renderCart();
  openCart();
}

function updateQuantity(id, change) {
  const item = cart.find(line => line.id === id);
  const product = products.find(candidate => candidate.id === id);
  if (!item || !product) return;
  item.quantity = Math.max(0, Math.min(item.quantity + change, product.inventory));
  if (!item.quantity) cart = cart.filter(line => line.id !== id);
  renderCart();
}

function openCart() {
  document.body.classList.add('drawer-open');
  drawerBackdrop.hidden = false;
  cartDrawer.classList.add('open');
  cartDrawer.setAttribute('aria-hidden', 'false');
  cartToggles.forEach(button => button.setAttribute('aria-expanded', 'true'));
  cartClose.focus();
}

function closeCart() {
  document.body.classList.remove('drawer-open');
  drawerBackdrop.hidden = true;
  cartDrawer.classList.remove('open');
  cartDrawer.setAttribute('aria-hidden', 'true');
  cartToggles.forEach(button => button.setAttribute('aria-expanded', 'false'));
  primaryCartToggle?.focus();
}

productGrid.addEventListener('click', event => {
  const button = event.target.closest('[data-add]');
  if (button) addToCart(button.dataset.add);
});

cartItems.addEventListener('click', event => {
  const decrease = event.target.closest('[data-decrease]');
  const increase = event.target.closest('[data-increase]');
  const remove = event.target.closest('[data-remove]');
  if (decrease) updateQuantity(decrease.dataset.decrease, -1);
  if (increase) updateQuantity(increase.dataset.increase, 1);
  if (remove) {
    cart = cart.filter(item => item.id !== remove.dataset.remove);
    renderCart();
  }
});

cartToggles.forEach(button => button.addEventListener('click', openCart));
cartClose.addEventListener('click', closeCart);
drawerBackdrop.addEventListener('click', closeCart);
continueShopping.addEventListener('click', closeCart);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && cartDrawer.classList.contains('open')) closeCart();
});

async function loadProducts() {
  try {
    const response = await fetch('/api/products', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Products are unavailable');
    products = await response.json();
  } catch {
    products = [];
  }
  renderProducts();
  renderCart();
}

loadProducts();
