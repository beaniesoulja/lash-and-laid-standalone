import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { once } from 'node:events';

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('google-apps-script/Code.gs', root), 'utf8');
function receiver(payload) {
  let row;
  const emails = [];
  const sheet = { getMaxColumns: () => 19, getRange: () => ({ getValues: () => [['existing']], createTextFinder: () => ({ matchEntireCell: () => ({ findNext: () => null }) }) }), appendRow: value => { row = value; } };
  const context = vm.createContext({
    Date, console, LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'test-secret' }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) },
    MailApp: { sendEmail: email => emails.push(email) },
    Utilities: { formatDate: date => date.toISOString() },
    Session: { getScriptTimeZone: () => 'Africa/Cairo' },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => JSON.parse(text) }) },
  });
  vm.runInContext(source, context);
  const response = context.doPost({ postData: { contents: JSON.stringify({ secret: 'test-secret', bookingReference: 'LL-TEST', submittedAt: '2026-10-11T10:00:00Z', fullName: 'Test Customer', whatsapp: '+201012345678', email: 'test@example.test', service: 'Lash artistry', requestedDate: '2026-10-15', ...payload }) } });
  return { row, emails, response };
}
test('spreadsheet neutralizes all formula-like customer fields at the row boundary', () => {
  for (const value of ['=SUM(1,1)', '+SUM(1,1)', '-SUM(1,1)', '@SUM(1,1)', '\t=SUM(1,1)', '\u0000=SUM(1,1)', '\u200b=SUM(1,1)']) {
    const { row, response } = receiver({ fullName: value, service: value, source: value, campaignSource: value });
    assert.equal(response.ok, true);
    for (const i of [2, 5, 12, 14]) assert.equal(row[i][0], "'");
    assert.equal(row.length, 19);
    assert.ok(row[1] instanceof Date && row[6] instanceof Date);
  }
});
test('ordinary customer details and email stay intact outside spreadsheet encoding', () => {
  const { row, emails, response } = receiver();
  assert.equal(response.bookingReference, 'LL-TEST');
  assert.equal(row[2], 'Test Customer');
  assert.equal(row[3], "'+201012345678");
  assert.equal(emails.length, 2);
  assert.equal(emails[1].to, 'test@example.test');
  assert.match(emails[0].body, /\+201012345678/);
  assert.doesNotMatch(emails[0].body, /'\+201012345678/);
});
test('receiver rejects missing authentication before writing or emailing', () => {
  const { row, emails, response } = receiver({ secret: 'wrong' });
  assert.equal(response.ok, false);
  assert.equal(row, undefined);
  assert.equal(emails.length, 0);
});
test('booking date window matches Cairo and includes day 90 but rejects rollover dates', () => {
  const source = readFileSync(new URL('supabase/functions/submit-booking/index.ts', root), 'utf8');
  const fn = stripTypeScriptTypes(source.match(/function isAllowedDate\(value: string\) \{[\s\S]*?\n\}/)[0]);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = type => parts.find(p => p.type === type).value;
  const today = new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00Z`);
  const allowed = value => vm.runInNewContext(`const DATE_PATTERN=/^\\d{4}-\\d{2}-\\d{2}$/;${fn};isAllowedDate(${JSON.stringify(value)})`, { Date, Intl });
  for (const day of [0, 90]) assert.equal(allowed(new Date(+today + day * 86400000).toISOString().slice(0, 10)), true);
  for (const day of [-1, 91]) assert.equal(allowed(new Date(+today + day * 86400000).toISOString().slice(0, 10)), false);
  assert.equal(allowed('2026-02-31'), false);
});
test('malformed Host and targets return 400 without terminating the static server', async () => {
  const child = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, HOST: '127.0.0.1', PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const [ready] = await once(child.stdout, 'data');
    const port = Number(String(ready).match(/:(\d+)/)[1]);
    assert.ok(port > 0);
    const raw = (host, target = '/') => new Promise((resolve, reject) => {
      const socket = connect(port, '127.0.0.1', () => socket.end(`GET ${target} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`));
      let data = '';
      socket.setTimeout(3000, () => socket.destroy(Error('timeout')));
      socket.on('data', chunk => { data += chunk; });
      socket.on('error', reject); socket.on('end', () => resolve(data));
    });
    for (const host of ['%', '[', 'localhost:abc']) assert.match(await raw(host), /^HTTP\/1.1 400/);
    for (const target of ['//[', 'http://[']) assert.match(await raw('localhost', target), /^HTTP\/1.1 400/);
    assert.match(await raw('lashandlaid.com', '/hair-services/?a=one%20two&b=3'), /Location: https:\/\/www.lashandlaid.com\/hair-services\/\?a=one%20two&b=3/);
    assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
    for (const path of ['/.env', '/supabase/functions/submit-booking/index.ts', '/google-apps-script/Code.gs', '/.git/config']) assert.equal((await fetch(`http://127.0.0.1:${port}${path}`)).status, 404);
  } finally { child.kill(); await once(child, 'exit'); }
});
