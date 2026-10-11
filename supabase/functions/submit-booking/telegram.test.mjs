import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { notifyTelegram } from './telegram.ts';

const booking = { bookingReference: 'LL-TEST', service: 'Lash artistry', requestedDate: '2026-10-15' };
const options = { token: 'test-only', chatId: '12345', sleep: async () => {} };

test('unconfigured Telegram is disabled without making network calls', async () => {
  assert.deepEqual(await notifyTelegram(booking, { fetcher: () => assert.fail('network') }), { status: 'disabled' });
});
test('partial or invalid configuration is rejected', async () => {
  for (const config of [{ token: 'test' }, { ...options, chatId: '@untrusted' }]) {
    await assert.rejects(notifyTelegram(booking, config), /configuration incomplete/);
  }
});
test('sends complete plain-text booking details to server-configured chat only', async () => {
  const result = await notifyTelegram({ ...booking, service: '<b>Lashes</b>\nInjected', fullName: 'Test Customer', whatsapp: '+201012345678', email: 'test@example.test', submittedAt: '2026-10-11T10:00:00Z', source: 'Website', campaignSource: 'instagram', campaignMedium: 'paid', campaignName: 'october', campaignContent: 'reel', campaignTerm: 'lashes', photoUploadWarning: true, chatId: 'attacker' }, {
    ...options,
    fetcher: async (url, init) => {
      assert.equal(url, 'https://api.telegram.org/bottest-only/sendMessage');
      const body = JSON.parse(init.body);
      assert.equal(body.chat_id, '12345');
      assert.equal(body.parse_mode, undefined);
      assert.equal(body.disable_notification, undefined);
      assert.equal(body.protect_content, true);
      assert.match(body.text, /Service: <b>Lashes<\/b> Injected/);
      assert.match(body.text, /photo upload needs attention/);
      for (const value of ['Test Customer', '+201012345678', 'test@example.test', '2026-10-11T10:00:00Z', 'instagram', 'paid', 'october', 'reel', 'lashes']) assert.ok(body.text.includes(value));
      assert.ok(body.text.length < 4096);
      assert.doesNotMatch(body.text, /test-only|attacker/);
      assert.equal(init.redirect, 'error');
      assert.ok(init.signal);
      return Response.json({ ok: true });
    },
  });
  assert.equal(result.status, 'sent');
});
test('private photos use separate protected messages with intact links', async () => {
  const messages = [];
  const photos = [1, 2, 3].map(n => `https://example.test/private-${n}?token=${'x'.repeat(1800)}`);
  await notifyTelegram({ ...booking, photos }, { ...options, fetcher: async (url, init) => { messages.push(JSON.parse(init.body)); return Response.json({ ok: true }); } });
  assert.equal(messages.length, 4);
  messages.forEach(m => { assert.equal(m.chat_id, '12345'); assert.equal(m.protect_content, true); assert.ok(m.text.length < 4096); });
  photos.forEach((url, i) => assert.ok(messages[i + 1].text.includes(url)));
});
test('transient failure retries; success stops retries', async () => {
  let calls = 0;
  await notifyTelegram(booking, { ...options, fetcher: async () => ++calls === 1 ? Response.json({ ok: false }, { status: 503 }) : Response.json({ ok: true }) });
  assert.equal(calls, 2);
});
test('permanent error does not retry or expose response content', async () => {
  let calls = 0;
  await assert.rejects(notifyTelegram(booking, { ...options, fetcher: async () => {
    calls++;
    return Response.json({ ok: false, description: 'SENSITIVE' }, { status: 403 });
  } }), { message: 'Telegram delivery needs attention' });
  assert.equal(calls, 1);
});
test('respects bounded retry-after and stops on long waits', async () => {
  let calls = 0;
  const delays = [];
  await notifyTelegram(booking, { ...options, sleep: async ms => delays.push(ms), fetcher: async () => ++calls === 1 ? Response.json({ ok: false, parameters: { retry_after: 2 } }, { status: 429 }) : Response.json({ ok: true }) });
  assert.deepEqual(delays, [2000]);
  calls = 0;
  await assert.rejects(notifyTelegram(booking, { ...options, fetcher: async () => { calls++; return Response.json({ ok: false, parameters: { retry_after: 60 } }, { status: 429 }); } }));
  assert.equal(calls, 1);
});
test('network exceptions cannot leak token and retries are bounded', async () => {
  let calls = 0;
  await assert.rejects(notifyTelegram(booking, { ...options, fetcher: async () => { calls++; throw Error('https://api.telegram.org/botSECRET/sendMessage'); } }), { message: 'Telegram delivery needs attention' });
  assert.equal(calls, 3);
});

async function runHandler({ uploadFails = false, googleFails = false, telegramFails = false, health = false } = {}) {
  let handler;
  let googleCalls = 0;
  let telegramCalls = 0;
  let inserts = 0;
  let telegramPayload;
  const tasks = [];
  const notes = [];
  const db = {
    rpc: async () => ({ data: [{ allowed: true }] }),
    from: () => ({
      insert: () => { inserts++; return { select: () => ({ single: async () => ({ data: { id: 'test', reference: 'LL-TEST', created_at: '2026-10-10' } }) }) }; },
      update: value => ({ eq: async () => { notes.push(value.staff_notes); return {}; } }),
    }),
    storage: { from: () => ({ upload: async () => ({ error: uploadFails ? Error('test') : null }) }) },
  };
  const code = stripTypeScriptTypes(readFileSync(new URL('./index.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, ''));
  const context = vm.createContext({
    Request, Response, FormData, File, TextEncoder, crypto: globalThis.crypto, AbortSignal,
    console: { error: () => {} },
    createClient: () => db,
    notifyTelegram: async payload => { telegramPayload = payload; telegramCalls++; if (telegramFails) throw Error('test'); },
    fetch: async () => { googleCalls++; return Response.json({ ok: !googleFails }); },
    Deno: { env: { get: () => 'test-value' }, serve: fn => { handler = fn; } },
    EdgeRuntime: { waitUntil: task => tasks.push(task) },
  });
  vm.runInContext(code, context);
  const form = new FormData();
  if (health) form.set('website', 'health-check');
  else {
    for (const [key, value] of Object.entries({ fullName: 'Test', phone: '+201000000000', email: 'test@example.test', service: 'Lashes', date: new Date().toISOString().slice(0, 10), confirmation: 'yes', utm_source: 'instagram', utm_campaign: 'october' })) form.set(key, value);
    if (uploadFails) form.set('photos', new File(['test'], 'test.jpg', { type: 'image/jpeg' }));
  }
  const response = await handler(new Request('https://example.test', { method: 'POST', headers: { Origin: 'https://www.lashandlaid.com' }, body: form }));
  await Promise.all(tasks);
  return { status: response.status, body: await response.json(), googleCalls, telegramCalls, inserts, notes, telegramPayload };
}
test('saved request sends customer and campaign details privately, not in API response', async () => {
  const result = await runHandler();
  assert.equal(result.telegramPayload.fullName, 'Test');
  assert.equal(result.telegramPayload.whatsapp, '+201000000000');
  assert.equal(result.telegramPayload.email, 'test@example.test');
  assert.equal(result.telegramPayload.campaignSource, 'instagram');
  assert.equal(result.telegramPayload.campaignName, 'october');
  assert.deepEqual(result.body, { ok: true, bookingReference: 'LL-TEST' });
});
test('health probe never inserts or notifies', async () => {
  const result = await runHandler({ health: true });
  assert.deepEqual(result.body, { ok: true });
  assert.equal(result.inserts + result.googleCalls + result.telegramCalls, 0);
});
test('photo failure still notifies both channels and preserves saved reference', async () => {
  const result = await runHandler({ uploadFails: true });
  assert.equal(result.status, 202);
  assert.equal(result.body.bookingReference, 'LL-TEST');
  assert.equal(result.googleCalls, 1);
  assert.equal(result.telegramCalls, 1);
  assert.match(result.notes[0], /Photo upload/);
});
test('Google failure does not prevent Telegram or reject a saved booking', async () => {
  const result = await runHandler({ googleFails: true });
  assert.equal(result.status, 201);
  assert.equal(result.googleCalls, 3);
  assert.equal(result.telegramCalls, 1);
  assert.match(result.notes[0], /Google Sheets/);
});
test('channel failures retain photo warning and return saved success', async () => {
  const result = await runHandler({ googleFails: true, telegramFails: true, uploadFails: true });
  assert.equal(result.status, 202);
  assert.match(result.notes[0], /Photo upload.*Google Sheets.*Telegram/);
});
