import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from './worker.ts';
import {signPhoto,servePhoto} from './privacy.ts';

function fixture() {
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');sql.exec(readFileSync(new URL('./migrations/0001_bookings.sql',import.meta.url),'utf8'));
 const DB={prepare(query){let args=[];return {bind(...values){args=values;return this},async run(){return {success:true,meta:sql.prepare(query).run(...args)}},query(){return sql.prepare(query).all(...args)}}},async batch(statements){sql.exec('BEGIN');try {const out=statements.map(s=>({success:true,results:s.query()}));sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const objects=new Map(); const PHOTOS={async put(k,body,meta){objects.set(k,{body:await new Response(body).arrayBuffer(),...meta});},async get(k){return objects.get(k)||null;}};
 const env={DB,PHOTOS,BOOKING_ENABLED:'true',RATE_LIMIT_SALT:'test-rate-salt',PHOTO_LINK_SECRET:'x'.repeat(64),GOOGLE_SHEETS_WEBHOOK_URL:'https://example.test/receiver',GOOGLE_SHEETS_WEBHOOK_SECRET:'private-secret',TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_CHAT_ID:'1234'};
 const pending=[];const ctx={waitUntil(p){pending.push(p)}};
 return {sql,env,ctx,objects,pending};
}
function request(fields={},headers={}) {
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const f=new FormData(); for(const [k,v]of Object.entries({fullName:'Test Customer',phone:'+201036880246',email:'test@example.test',service:'Lash artistry',date,confirmation:'on',...fields}))f.append(k,v);
 return new Request('https://www.lashandlaid.com/api/submit-booking',{method:'POST',body:f,headers:{Origin:'https://www.lashandlaid.com','CF-Connecting-IP':'192.0.2.1',...headers}});
}
test('origin, disabled configuration and honeypot fail safely without a booking',async()=>{
 const {sql,env,ctx}=fixture();
 assert.equal((await worker.fetch(request({}, {Origin:'https://attacker.example'}),env,ctx)).status,403);
 assert.deepEqual(await (await worker.fetch(request({website:'health-check'}),{},ctx)).json(),{ok:true});
 assert.equal((await worker.fetch(request(),{...env,BOOKING_ENABLED:'false'},ctx)).status,503);
 assert.equal((await worker.fetch(new Request('https://www.lashandlaid.com/api/submit-booking'),env,ctx)).status,405);
 assert.equal(sql.prepare('SELECT count(*) n FROM bookings').get().n,0);
});
test('validation rejects malformed dates, missing consent and spoofed image content',async()=>{
 const {sql,env,ctx}=fixture();
 for(const data of [{date:'2026-02-31'},{confirmation:''},{email:'not-email'},{photos:new File(['<svg>bad</svg>'],'fake.png',{type:'image/png'})}]) assert.equal((await worker.fetch(request(data),env,ctx)).status,400);
 assert.equal(sql.prepare('SELECT count(*) n FROM bookings').get().n,0);
});
test('email is required before saving or scheduling notifications',async()=>{
 for(const email of [null,'','   ','invalid']) {
  const {sql,env,ctx}=fixture(); const form=await request().formData();
  if(email===null) form.delete('email'); else form.set('email',email);
  const response=await worker.fetch(new Request('https://www.lashandlaid.com/api/submit-booking',{method:'POST',body:form}),env,ctx);
  assert.equal(response.status,400);assert.equal((await response.json()).error,'Please enter a valid email address');
  assert.equal(sql.prepare('SELECT count(*) n FROM bookings').get().n,0);
  assert.equal(sql.prepare('SELECT count(*) n FROM booking_notifications').get().n,0);
 }
});
test('oversized bodies are rejected before parsing or database writes',async()=>{
 const {sql,env,ctx}=fixture(); const r=request();r.headers.set('content-length','999999999');
 assert.equal((await worker.fetch(r,env,ctx)).status,413);
 assert.equal(sql.prepare('SELECT count(*) n FROM bookings').get().n,0);
});
test('booking, image metadata, private link and both notification channels work together',async()=>{
 const f=fixture(), sent=[];const old=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{sent.push({url,body:JSON.parse(options.body)});return Response.json({ok:true});};
 try {
 const photo=new File([Uint8Array.from([137,80,78,71,13,10,26,10,0])],'test.png',{type:'image/png'});
 const response=await worker.fetch(request({photos:photo,utm_source:'instagram'}),f.env,f.ctx);
 assert.equal(response.status,201);const body=await response.json();assert.match(body.bookingReference,/^LL-\d{6}-1000$/);
 assert.deepEqual(Object.keys(body).sort(),['bookingReference','ok']);
 await Promise.all(f.pending);
 assert.equal(sent.filter(s=>s.url==='https://example.test/receiver').length,1);
 assert.equal(sent.filter(s=>s.url.includes('/sendMessage')).length,2);
 const emailReceiver=sent.find(s=>s.url==='https://example.test/receiver').body;
 assert.equal(emailReceiver.campaignSource,'instagram');assert.equal(emailReceiver.secret,'private-secret');
 assert.equal(f.sql.prepare('SELECT count(*) n FROM booking_photos').get().n,1);
 const link=emailReceiver.photos[0];assert.equal((await servePhoto(new Request(link),f.env)).status,200);
 assert.equal((await servePhoto(new Request(link.replace('signature=','signature=0')),f.env)).status,403);
 const delivery=f.sql.prepare('SELECT google_status,telegram_status FROM booking_notifications').get();assert.equal(delivery.google_status,'sent');assert.equal(delivery.telegram_status,'sent');
 assert.equal((await servePhoto(new Request(link),f.env)).headers.get('cache-control'),'private, no-store');
 } finally {globalThis.fetch=old;}
});
test('concurrent submissions have unique references and forwarded headers cannot bypass limits',async()=>{
 const f=fixture(),old=globalThis.fetch;globalThis.fetch=async()=>Response.json({ok:true});
 try {
 const results=await Promise.all(Array.from({length:16},(_,i)=>worker.fetch(request({}, {'X-Forwarded-For':`192.0.2.${i+2}`}),f.env,f.ctx)));
 assert.equal(results.filter(r=>r.status===201).length,15);assert.equal(results.filter(r=>r.status===429).length,1);
 assert.equal(f.sql.prepare('SELECT count(distinct reference) n FROM bookings').get().n,15);
 await Promise.all(f.pending);
 }finally{globalThis.fetch=old;}
});
test('optional photo failure keeps booking and still sends staff notification',async()=>{
 const f=fixture(),old=globalThis.fetch;globalThis.fetch=async()=>Response.json({ok:true});f.env.PHOTOS.put=async()=>{throw Error('unavailable');};
 try{const r=await worker.fetch(request({photos:new File([Uint8Array.from([255,216,255])],'test.jpg',{type:'image/jpeg'})}),f.env,f.ctx);assert.equal(r.status,202);assert.equal((await r.json()).ok,true);await Promise.all(f.pending);assert.match(f.sql.prepare('SELECT staff_notes FROM bookings').get().staff_notes,/Photo upload/);}finally{globalThis.fetch=old;}
});
test('photo signatures reject expired links, unsigned requests and unknown paths',async()=>{
 const {env}=fixture();assert.equal((await servePhoto(new Request('https://www.lashandlaid.com/api/booking-photo'),env)).status,403);
 const link=await signPhoto('https://www.lashandlaid.com',`${crypto.randomUUID()}/1-${crypto.randomUUID()}.png`,env.PHOTO_LINK_SECRET);
 const expired=new URL(link);expired.searchParams.set('expires','1');assert.equal((await servePhoto(new Request(expired),env)).status,403);
 assert.equal((await servePhoto(new Request(link),env)).status,404);
});
test('notification setup failure never tells the customer to duplicate an already saved booking',async()=>{
 const f=fixture();const prepare=f.env.DB.prepare;
 f.env.DB.prepare=query=>query.startsWith('INSERT INTO booking_notifications')?{bind(){return this},async run(){throw Error('unavailable')}}:prepare(query);
 const response=await worker.fetch(request(),f.env,f.ctx);
 assert.equal(response.status,202);assert.equal((await response.json()).ok,true);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM bookings').get().n,1);
 assert.match(f.sql.prepare('SELECT staff_notes FROM bookings').get().staff_notes,/Notification setup/);
});
test('legacy forwarding trusts only an HMAC-bound client address',async()=>{
 const {clientAddress}=await import('./worker.ts');const env={GOOGLE_SHEETS_WEBHOOK_SECRET:'bridge-shared-secret'};
 const request=new Request('https://www.lashandlaid.com/api/submit-booking',{headers:{'CF-Connecting-IP':'192.0.2.1','X-Lash-Legacy-IP':'192.0.2.2','X-Lash-Legacy-Auth':'0'.repeat(64)}});
 assert.equal(await clientAddress(request,env),'192.0.2.1');
 const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(env.GOOGLE_SHEETS_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const sig=await crypto.subtle.sign('HMAC',key,enc.encode('lash-cloudflare-booking-bridge:192.0.2.2'));
 request.headers.set('X-Lash-Legacy-Auth',[...new Uint8Array(sig)].map(n=>n.toString(16).padStart(2,'0')).join(''));
 assert.equal(await clientAddress(request,env),'192.0.2.2');request.headers.set('X-Lash-Legacy-IP','192.0.2.3');assert.equal(await clientAddress(request,env),'192.0.2.1');
});
