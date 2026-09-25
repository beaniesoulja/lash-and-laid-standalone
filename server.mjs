import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, timingSafeEqual } from 'node:crypto';

const root = dirname(fileURLToPath(import.meta.url));
const publicDir = join(root, 'public');
const dataDir = join(root, 'data');
const uploadsDir = join(dataDir, 'uploads');
const productsFile = join(dataDir, 'products.json');

function loadEnv() {
  const file = join(root, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();
mkdirSync(uploadsDir, { recursive: true });
if (!existsSync(productsFile)) writeFileSync(productsFile, '[]\n');

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const adminPassword = process.env.ADMIN_PASSWORD || '';

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
};

function readProducts() {
  try {
    const value = JSON.parse(readFileSync(productsFile, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveProducts(products) {
  writeFileSync(productsFile, `${JSON.stringify(products, null, 2)}\n`);
}

function json(response, status, data) {
  const body = JSON.stringify(data);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  response.end(body);
}

function safePasswordMatch(candidate) {
  if (!adminPassword || typeof candidate !== 'string') return false;
  const expected = Buffer.from(adminPassword);
  const supplied = Buffer.from(candidate);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function isAdmin(request) {
  return safePasswordMatch(request.headers['x-admin-password']);
}

async function readJson(request, maxBytes = 8_000_000) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Request is too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    request.on('error', reject);
  });
}

function cleanText(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeProduct(input, existing = {}) {
  const price = Math.max(0, Number(input.price) || 0);
  const compareAt = Math.max(0, Number(input.compareAt) || 0);
  const inventory = Math.max(0, Math.floor(Number(input.inventory) || 0));
  return {
    id: existing.id || randomUUID(),
    title: cleanText(input.title, 120),
    type: cleanText(input.type, 80) || 'Hair',
    description: cleanText(input.description, 2000),
    price,
    compareAt,
    inventory,
    image: cleanText(input.image, 1000),
    active: Boolean(input.active),
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function serveFile(response, base, requestedPath) {
  const relative = normalize(requestedPath).replace(/^([/\\])+/, '');
  const filePath = join(base, relative);
  if (!filePath.startsWith(base) || !existsSync(filePath)) return false;
  const type = contentTypes[extname(filePath).toLowerCase()] || 'application/octet-stream';
  response.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': type.startsWith('image/') ? 'public, max-age=86400' : 'no-cache'
  });
  createReadStream(filePath).pipe(response);
  return true;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'GET' && url.pathname === '/api/products') {
    const products = readProducts()
      .filter(product => product.active && product.inventory > 0)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return json(response, 200, products);
  }

  if (url.pathname === '/api/admin/products') {
    if (!adminPassword) return json(response, 503, { error: 'Set ADMIN_PASSWORD before using the product manager.' });
    if (!isAdmin(request)) return json(response, 401, { error: 'Incorrect admin password.' });

    if (request.method === 'GET') return json(response, 200, readProducts());

    if (request.method === 'POST') {
      try {
        const input = await readJson(request);
        if (!cleanText(input.title, 120)) return json(response, 400, { error: 'Product name is required.' });
        const products = readProducts();
        const index = input.id ? products.findIndex(product => product.id === input.id) : -1;
        const product = normalizeProduct(input, index >= 0 ? products[index] : {});
        if (index >= 0) products[index] = product;
        else products.unshift(product);
        saveProducts(products);
        return json(response, 200, product);
      } catch (error) {
        return json(response, 400, { error: error.message });
      }
    }
  }

  if (request.method === 'DELETE' && url.pathname.startsWith('/api/admin/products/')) {
    if (!adminPassword) return json(response, 503, { error: 'Set ADMIN_PASSWORD before using the product manager.' });
    if (!isAdmin(request)) return json(response, 401, { error: 'Incorrect admin password.' });
    const id = decodeURIComponent(url.pathname.split('/').pop() || '');
    const products = readProducts();
    const nextProducts = products.filter(product => product.id !== id);
    if (nextProducts.length === products.length) return json(response, 404, { error: 'Product not found.' });
    saveProducts(nextProducts);
    return json(response, 200, { ok: true });
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/upload') {
    if (!adminPassword) return json(response, 503, { error: 'Set ADMIN_PASSWORD before using the product manager.' });
    if (!isAdmin(request)) return json(response, 401, { error: 'Incorrect admin password.' });
    try {
      const input = await readJson(request, 9_000_000);
      const match = String(input.data || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
      if (!match) return json(response, 400, { error: 'Choose a JPG, PNG, or WebP image.' });
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length > 6_000_000) return json(response, 400, { error: 'Image must be smaller than 6 MB.' });
      const extension = match[1] === 'image/jpeg' ? '.jpg' : `.${match[1].split('/')[1]}`;
      const filename = `${randomUUID()}${extension}`;
      writeFileSync(join(uploadsDir, filename), buffer);
      return json(response, 200, { url: `/uploads/${filename}` });
    } catch (error) {
      return json(response, 400, { error: error.message });
    }
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') return json(response, 405, { error: 'Method not allowed.' });

  if (url.pathname.startsWith('/uploads/')) {
    if (serveFile(response, uploadsDir, url.pathname.replace('/uploads/', ''))) return;
    return json(response, 404, { error: 'Image not found.' });
  }

  const route = url.pathname === '/admin' ? '/admin.html' : url.pathname === '/' ? '/index.html' : url.pathname;
  if (serveFile(response, publicDir, route)) return;
  if (!extname(route) && serveFile(response, publicDir, 'index.html')) return;
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(port, host, () => {
  console.log(`Lash & Laid is running at http://${host}:${port}`);
  console.log(`Product manager: http://${host}:${port}/admin`);
  if (!adminPassword) console.warn('Set ADMIN_PASSWORD in .env before using the product manager.');
});
