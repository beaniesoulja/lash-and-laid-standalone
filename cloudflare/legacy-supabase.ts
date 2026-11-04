// Compatibility only: older open website tabs still post to the former URL.
// All booking writes, photo storage and notifications now run in Cloudflare.
const origins = new Set(['https://www.lashandlaid.com','https://lashandlaid.com']);
Deno.serve(async request => {
  const origin=request.headers.get('origin');
  const headers={
    'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin',
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    ...(origin && origins.has(origin)?{'Access-Control-Allow-Origin':origin}:{})
  };
  if(origin && !origins.has(origin)) return new Response('{"ok":false}',{status:403,headers});
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers});
  if(request.method!=='POST') return new Response('{"ok":false}',{status:405,headers});
  if(Number(request.headers.get('content-length'))>32*1024*1024) return new Response('{"ok":false}',{status:413,headers});
  try {
    const secret=Deno.env.get('GOOGLE_SHEETS_WEBHOOK_SECRET');
    if(!secret) throw Error('Bridge is not configured');
    const address=request.headers.get('cf-connecting-ip')||request.headers.get('x-real-ip')||'unknown';
    const encoder=new TextEncoder();
    const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const signed=await crypto.subtle.sign('HMAC',key,encoder.encode('lash-cloudflare-booking-bridge:'+address));
    const signature=[...new Uint8Array(signed)].map(v=>v.toString(16).padStart(2,'0')).join('');
    const response=await fetch('https://www.lashandlaid.com/api/submit-booking',{
      method:'POST',redirect:'manual',signal:AbortSignal.timeout(30000),
      headers:{'Content-Type':request.headers.get('content-type')||'',
        ...(origin?{Origin:origin}:{}),'X-Lash-Legacy-Auth':signature,'X-Lash-Legacy-IP':address},
      body:request.body,
    });
    if(response.status>=300 && response.status<400) throw Error('Unexpected bridge redirect');
    return new Response(response.body,{status:response.status,headers:{...headers,...(response.headers.get('retry-after')?{'Retry-After':response.headers.get('retry-after')!}:{})}});
  } catch { return new Response('{"ok":false,"error":"We could not confirm your request. Please contact us before trying again."}',{status:503,headers}); }
});
