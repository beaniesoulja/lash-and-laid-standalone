import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip, createBrotliCompress } from 'node:zlib';

const root = dirname(fileURLToPath(import.meta.url));
const publicDir = join(root, 'public');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const canonicalOrigin = 'https://www.lashandlaid.com';
const redirectHosts = new Set(['lashandlaid.com', 'lash-and-laid-standalone.pages.dev']);

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

const compressibleTypes = new Set(['text/html; charset=utf-8', 'text/css; charset=utf-8', 'text/javascript; charset=utf-8', 'image/svg+xml', 'text/plain; charset=utf-8', 'application/xml; charset=utf-8']);

function serveFile(request, response, requestedPath, statusCode = 200) {
  const relative = normalize(requestedPath).replace(/^([/\\])+/, '');
  const filePath = join(publicDir, relative);
  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) return false;
  const type = contentTypes[extname(filePath).toLowerCase()] || 'application/octet-stream';
  const stat = statSync(filePath);
  if (!stat.isFile()) return false;
  const lastModified = stat.mtime.toUTCString();

  const headers = {
    'Content-Type': type,
    'Cache-Control': type.startsWith('image/') ? 'public, max-age=86400' : 'no-cache',
    'Last-Modified': lastModified,
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https://www.facebook.com https://www.google-analytics.com; style-src 'self' 'unsafe-inline'; script-src 'self' https://static.cloudflareinsights.com https://www.googletagmanager.com https://connect.facebook.net; connect-src 'self' https://xdjajqohyikwnfcqroyy.supabase.co https://cloudflareinsights.com https://www.google-analytics.com https://region1.google-analytics.com https://www.facebook.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://wa.me https://api.whatsapp.com",
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  };

  const ifModifiedSince = request.headers['if-modified-since'];
  if (statusCode === 200 && ifModifiedSince && Math.floor(new Date(ifModifiedSince).getTime() / 1000) >= Math.floor(stat.mtime.getTime() / 1000)) {
    response.writeHead(304, headers);
    response.end();
    return true;
  }

  const acceptEncoding = request.headers['accept-encoding'] || '';
  const canCompress = compressibleTypes.has(type) && stat.size > 512;
  if (canCompress && acceptEncoding.includes('br')) {
    headers['Content-Encoding'] = 'br';
    headers.Vary = 'Accept-Encoding';
    response.writeHead(statusCode, headers);
    createReadStream(filePath).pipe(createBrotliCompress()).pipe(response);
  } else if (canCompress && acceptEncoding.includes('gzip')) {
    headers['Content-Encoding'] = 'gzip';
    headers.Vary = 'Accept-Encoding';
    response.writeHead(statusCode, headers);
    createReadStream(filePath).pipe(createGzip()).pipe(response);
  } else {
    headers['Content-Length'] = stat.size;
    response.writeHead(statusCode, headers);
    createReadStream(filePath).pipe(response);
  }
  return true;
}

const server = createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Method not allowed');
    return;
  }

  let url;
  try {
    url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Bad request');
    return;
  }
  if (redirectHosts.has(url.hostname.toLowerCase())) {
    response.writeHead(301, { Location: `${canonicalOrigin}${url.pathname}${url.search}` });
    response.end();
    return;
  }
  const route = url.pathname === '/' ? '/index.html' : url.pathname;
  const directoryRoute = join(publicDir, normalize(route).replace(/^([/\\])+/, ''), 'index.html');
  if (route !== '/index.html' && directoryRoute.startsWith(publicDir + '/') && existsSync(directoryRoute)) {
    if (!url.pathname.endsWith('/')) {
      response.writeHead(301, { Location: `${url.pathname}/${url.search}` });
      response.end();
      return;
    }
    if (serveFile(request, response, `${route}index.html`)) return;
  }
  if (serveFile(request, response, route)) return;
  if (serveFile(request, response, '/404.html', 404)) return;
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(port, host, () => {
  console.log(`Lash & Laid is running at http://${host}:${server.address().port}`);
});
