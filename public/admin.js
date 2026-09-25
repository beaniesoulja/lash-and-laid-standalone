const loginPanel = document.querySelector('#loginPanel');
const loginForm = document.querySelector('#loginForm');
const loginMessage = document.querySelector('#loginMessage');
const passwordInput = document.querySelector('#adminPassword');
const dashboard = document.querySelector('#dashboard');
const productForm = document.querySelector('#productForm');
const productMessage = document.querySelector('#productMessage');
const adminProductList = document.querySelector('#adminProductList');
const adminEmpty = document.querySelector('#adminEmpty');
const productCount = document.querySelector('#productCount');
const editorTitle = document.querySelector('#editorTitle');
const cancelEdit = document.querySelector('#cancelEdit');
const newProduct = document.querySelector('#newProduct');
const imagePreview = document.querySelector('#imagePreview');

const fields = {
  id: document.querySelector('#productId'),
  title: document.querySelector('#productTitle'),
  type: document.querySelector('#productType'),
  inventory: document.querySelector('#productInventory'),
  price: document.querySelector('#productPrice'),
  compareAt: document.querySelector('#productCompareAt'),
  description: document.querySelector('#productDescription'),
  imageFile: document.querySelector('#productImage'),
  imageUrl: document.querySelector('#productImageUrl'),
  active: document.querySelector('#productActive')
};

let password = sessionStorage.getItem('lash-laid-admin-password') || '';
let products = [];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function money(value) {
  return new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 2 }).format(value || 0);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password, ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
  return body;
}

function showMessage(element, text, type = '') {
  element.textContent = text;
  element.className = `form-message ${type}`.trim();
}

function renderProducts() {
  productCount.textContent = `${products.length} ${products.length === 1 ? 'product' : 'products'}`;
  adminEmpty.hidden = products.length > 0;
  adminProductList.innerHTML = products.map(product => {
    const live = product.active && product.inventory > 0;
    return `<article class="admin-product">
      <img src="${escapeHtml(product.image || '/assets/lash-laid-hair.jpg')}" alt="">
      <div><h3>${escapeHtml(product.title)}</h3><p>${escapeHtml(product.type)} · ${money(product.price)} · ${product.inventory} in stock</p><div class="status-row"><span class="status-pill ${live ? 'live' : ''}">${product.active ? 'Active' : 'Hidden'}</span><span class="status-pill ${product.inventory > 0 ? '' : 'out'}">${product.inventory > 0 ? 'In stock' : 'Out of stock'}</span></div></div>
      <div class="admin-product-actions"><button type="button" data-edit="${escapeHtml(product.id)}">Edit</button><button class="delete" type="button" data-delete="${escapeHtml(product.id)}">Delete</button></div>
    </article>`;
  }).join('');
}

async function loadProducts() {
  products = await api('/api/admin/products');
  loginPanel.hidden = true;
  dashboard.hidden = false;
  renderProducts();
}

function resetForm() {
  productForm.reset();
  fields.id.value = '';
  fields.inventory.value = '0';
  fields.active.checked = true;
  imagePreview.hidden = true;
  imagePreview.removeAttribute('src');
  editorTitle.textContent = 'New product';
  cancelEdit.hidden = true;
  showMessage(productMessage, '');
}

function editProduct(id) {
  const product = products.find(item => item.id === id);
  if (!product) return;
  fields.id.value = product.id;
  fields.title.value = product.title;
  fields.type.value = product.type;
  fields.inventory.value = product.inventory;
  fields.price.value = product.price;
  fields.compareAt.value = product.compareAt || '';
  fields.description.value = product.description || '';
  fields.imageUrl.value = product.image || '';
  fields.active.checked = product.active;
  fields.imageFile.value = '';
  if (product.image) {
    imagePreview.src = product.image;
    imagePreview.hidden = false;
  } else imagePreview.hidden = true;
  editorTitle.textContent = 'Edit product';
  cancelEdit.hidden = false;
  document.querySelector('.editor-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.readAsDataURL(file);
  });
}

async function uploadImage(file) {
  const data = await fileToDataUrl(file);
  const result = await api('/api/admin/upload', { method: 'POST', body: JSON.stringify({ data }) });
  return result.url;
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  password = passwordInput.value;
  showMessage(loginMessage, 'Checking access…');
  try {
    await loadProducts();
    sessionStorage.setItem('lash-laid-admin-password', password);
    showMessage(loginMessage, '');
  } catch (error) {
    showMessage(loginMessage, error.message, 'error');
  }
});

productForm.addEventListener('submit', async event => {
  event.preventDefault();
  showMessage(productMessage, 'Saving product…');
  try {
    let image = fields.imageUrl.value.trim();
    if (fields.imageFile.files[0]) image = await uploadImage(fields.imageFile.files[0]);
    const product = {
      id: fields.id.value || undefined,
      title: fields.title.value,
      type: fields.type.value,
      inventory: Number(fields.inventory.value),
      price: Number(fields.price.value),
      compareAt: Number(fields.compareAt.value || 0),
      description: fields.description.value,
      image,
      active: fields.active.checked
    };
    await api('/api/admin/products', { method: 'POST', body: JSON.stringify(product) });
    await loadProducts();
    resetForm();
    showMessage(productMessage, 'Product saved.', 'success');
  } catch (error) {
    showMessage(productMessage, error.message, 'error');
  }
});

adminProductList.addEventListener('click', async event => {
  const edit = event.target.closest('[data-edit]');
  const remove = event.target.closest('[data-delete]');
  if (edit) editProduct(edit.dataset.edit);
  if (remove) {
    const product = products.find(item => item.id === remove.dataset.delete);
    if (!product || !window.confirm(`Delete “${product.title}”? This cannot be undone.`)) return;
    try {
      await api(`/api/admin/products/${encodeURIComponent(product.id)}`, { method: 'DELETE' });
      await loadProducts();
      if (fields.id.value === product.id) resetForm();
    } catch (error) {
      window.alert(error.message);
    }
  }
});

fields.imageFile.addEventListener('change', async () => {
  const file = fields.imageFile.files[0];
  if (!file) return;
  imagePreview.src = await fileToDataUrl(file);
  imagePreview.hidden = false;
});

fields.imageUrl.addEventListener('input', () => {
  if (!fields.imageUrl.value.trim()) return;
  imagePreview.src = fields.imageUrl.value.trim();
  imagePreview.hidden = false;
});

cancelEdit.addEventListener('click', resetForm);
newProduct.addEventListener('click', () => {
  resetForm();
  document.querySelector('.editor-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

if (password) loadProducts().catch(() => {
  sessionStorage.removeItem('lash-laid-admin-password');
  password = '';
});
