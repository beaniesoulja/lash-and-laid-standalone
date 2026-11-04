const MAX_BODY = 32 * 1024 * 1024;
const PHOTO_TTL = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();
async function key(secret: string) {
  if (!secret || secret.length < 32) throw new Error('Photo signing is not configured');
  return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
export async function signPhoto(origin: string, path: string, secret: string) {
  const expires = Math.floor(Date.now()/1000)+PHOTO_TTL;
  const bytes = await crypto.subtle.sign('HMAC',await key(secret),encoder.encode(`${path}\n${expires}`));
  const signature = [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
  const url = new URL('/api/booking-photo',origin);
  url.search = new URLSearchParams({path,expires:String(expires),signature}).toString();
  return url.href;
}
export async function servePhoto(request: Request, env: any) {
  const headers = {'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; sandbox",'X-Robots-Tag':'noindex, nofollow'};
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed',{status:405,headers});
  try {
    const params = new URL(request.url).searchParams;
    const path = params.get('path') || '', expiration = params.get('expires') || '', signature = params.get('signature') || '';
    const expires = Number(expiration), now = Math.floor(Date.now()/1000);
    if (!/^\d+$/.test(expiration) || !Number.isSafeInteger(expires) || expires <= now || expires > now+PHOTO_TTL || !/^[a-f0-9]{64}$/.test(signature) || !/^[a-f0-9-]{36}\/[1-3]-[a-f0-9-]{36}\.(jpg|png|webp)$/.test(path)) return new Response('Link unavailable',{status:403,headers});
    const bytes = Uint8Array.from(signature.match(/../g)!,s=>parseInt(s,16));
    if (!(await crypto.subtle.verify('HMAC',await key(env.PHOTO_LINK_SECRET),bytes,encoder.encode(`${path}\n${expiration}`)))) return new Response('Link unavailable',{status:403,headers});
    const object = await env.PHOTOS.get(path);
    if (!object) return new Response('Not found',{status:404,headers});
    return new Response(request.method === 'HEAD' ? null : object.body,{headers:{...headers,'Content-Type':object.httpMetadata?.contentType || 'application/octet-stream','Content-Disposition':'attachment; filename="inspiration-photo.'+path.split('.').pop()+'"'}});
  } catch { return new Response('Link unavailable',{status:503,headers}); }
}
export async function readMultipart(request: Request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw new RangeError('Body too large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing form');
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const {done,value} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY) { await reader.cancel(); throw new RangeError('Body too large'); }
    chunks.push(value);
  }
  return new Response(new Blob(chunks),{headers:{'Content-Type':request.headers.get('content-type') || ''}}).formData();
}
export async function validImage(file: File) {
  const b = new Uint8Array(await file.slice(0,12).arrayBuffer());
  if (file.type === 'image/jpeg') return b[0]===255 && b[1]===216 && b[2]===255;
  if (file.type === 'image/png') return [137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n);
  if (file.type === 'image/webp') return String.fromCharCode(...b.slice(0,4))==='RIFF' && String.fromCharCode(...b.slice(8,12))==='WEBP';
  return false;
}
