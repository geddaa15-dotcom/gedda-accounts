/*
  اختبارات برنامج الحسابات ودفتر الخزنة (بيانات تجريبية بس، مفيهاش أي اسم عميل حقيقي).
  التشغيل:  node tests/run.js
  بيشغّل الموقع على جهازك، ويفتحه في متصفح من غير شاشة، ويجرب كل حاجة ويقارن الأرقام بالأرقام المتوقعة بالقرش.
  لو أي اختبار فشل بيطبع ✖ وبيخرج بخطأ، فمتترفعش أي تعديل غير لما كله يبقى ✔.
  محتاج Playwright و Chromium. المتصفح ممكن يتحدد بـ PW_CHROMIUM.
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const {makeGas} = require('./gasmock');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node-tools/node_modules/playwright'); }
const ROOT = path.join(__dirname, '..');
const CHROME = process.env.PW_CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(f => fs.existsSync(f));
const ACC_URL = 'https://script.google.com/macros/s/TEST-ACC/exec', CASH_URL = 'https://script.google.com/macros/s/TEST-CASH/exec', MKT_URL = 'https://script.google.com/macros/s/TEST-MKT/exec';
const PASS = '246810', KEY = 'Test-Key-2026';
let CI_MOCK = [{id: 1, conclusion: 'success', created_at: '2026-10-01T10:00:00Z'}];

let fails = 0, oks = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { oks++; console.log('  ✔', name); } else { fails++; console.log('  ✖', name, '\n     المتوقع:', JSON.stringify(want), '\n     اللي طلع:', JSON.stringify(got)); }
}
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = iso(new Date()), inDays = n => iso(new Date(Date.now() + n * 86400000));

/* ملف نقل تجريبي (نفس شكل اللي بيتعمل من الإكسيل). الأرقام بالقرش */
function importFile() {
  return {app: 'gedda-accounts-import', v: 1, batch: 'TST1', made: Date.UTC(2026, 0, 1),
    parties: [
      {ref: 'c1', sec: 'mkt', name: 'عميل تجربة واحد', expected: 270000},
      {ref: 'c2', sec: 'site', name: 'عميل تجربة اتنين', expected: 0},
      {ref: 's1', sec: 'sup', name: 'مورد تجربة', expected: -2950000}],
    entries: [
      {party: 'c1', kind: 'open', date: '2026-01-01', dr: 100000},
      {party: 'c1', kind: 'inv', date: '2026-01-05', no: '1', lines: [{name: 'لفة تجربة 16 مم', unit: 'لفة', qty: 10, price: 35000}, {name: 'كابل تجربة', unit: 'كيلو', qty: 2.5, price: 8000}]},
      {party: 'c1', kind: 'pay', date: '2026-01-06', amt: 200000, method: 'نقدي'},
      {party: 'c2', kind: 'inv', date: '2026-01-07', no: '2', lines: [{name: 'شكارة تجربة', unit: 'شكارة', qty: 1, price: 500000}]},
      {party: 'c2', kind: 'pay', date: '2026-01-08', amt: 500000, method: 'تحويل'},
      {party: 's1', kind: 'open', date: '2026-01-01', cr: 900000},
      {party: 's1', kind: 'pur', date: '2026-01-02', no: '1', lines: [{name: 'خامة تجربة', unit: 'كيلو', qty: 1000, price: 5050}]},
      {party: 's1', kind: 'ppay', date: '2026-01-03', amt: 3000000, method: 'نقدي'}]};
}

/* للاختبار sw.js: down = النت مقطوع، slow[ملف] = الملف بيتأخر (ملّي)، body[ملف] = نسخة جديدة اترفعت من الملف،
   pretty = زي استضافة بتشيل .html من اللينك: x.html بيتحوّل لـ /x، و/x بيرجّع x.html، log = الطلبات اللي وصلت (لو array) */
const SRV = {down: false, slow: {}, body: {}, pretty: false, log: null};
function serve() {
  const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'};
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      let u = decodeURIComponent(q.url.split('?')[0]);
      const lg = SRV.log ? {u, st: 200} : null; if (lg) SRV.log.push(lg);
      if (SRV.pretty) {
        const m = u.match(/^(.*\/)([^/]+)\.html$/);
        if (m) { if (lg) lg.st = 308; r.writeHead(308, {Location: m[1] + (m[2] === 'index' ? '' : m[2])}); return r.end(); }
        if (!/\.[a-z0-9]+$/i.test(u) && !u.endsWith('/')) u += '.html';
      }
      const f = path.join(ROOT, u.replace(/^\/+/, '') || 'index.html');
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
      if (SRV.down) return q.socket.destroy();
      const rel = path.relative(ROOT, f).split(path.sep).join('/'), send = () => {
        /* ETag زي GitHub وكلاود فلير: لو الجهاز عنده نفس النسخة الرد 304 من غير الملف */
        const body = rel in SRV.body ? Buffer.from(SRV.body[rel]) : fs.readFileSync(f), tag = 'W/"' + require('crypto').createHash('md5').update(body).digest('hex') + '"';
        if (q.headers['if-none-match'] === tag) { if (lg) lg.st = 304; r.writeHead(304, {ETag: tag}); return r.end(); }
        r.writeHead(200, {'Content-Type': types[path.extname(f)] || 'application/octet-stream', ETag: tag});
        r.end(body);
      };
      if (SRV.slow[rel]) setTimeout(send, SRV.slow[rel]); else send();
    }).listen(0, () => res(srv));
  });
}

async function newDevice(browser, base, sheets) {
  const ctx = await browser.newContext({viewport: {width: 400, height: 860}, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write']});
  ctx.errs = [];
  await ctx.addInitScript(TRACKER);
  ctx.on('page', p => { p.settle = settle; });
  await ctx.route('https://script.google.com/**', r => {
    if (ctx.netDown) return r.abort('failed');
    const q = r.request(), g = q.url().includes('TEST-CASH') ? sheets.cash : q.url().includes('TEST-MKT') ? sheets.mkt : sheets.acc;
    if (ctx.pageOnce > 0 && g === sheets.acc) { ctx.pageOnce--; return r.fulfill({status: 200, contentType: 'text/html', body: '<html>Google error</html>'}); }   // جوجل بيرد بصفحة خطأ لحظية
    if (!g.ctx.doPost) return r.fulfill({status: 200, contentType: 'text/html', body: '<html>no script</html>'});
    r.fulfill({status: 200, contentType: 'application/json', body: q.method() === 'POST' ? g.post(q.postData()) : g.get()});
  });
  /* GitHub (نتيجة الاختبارات بعد آخر تعديل، للإنذار المبكر): CI_MOCK بيتغير من الاختبار */
  await ctx.route('https://api.github.com/**', r => r.fulfill({status: 200, contentType: 'application/json', headers: {'Access-Control-Allow-Origin': '*'}, body: JSON.stringify({workflow_runs: CI_MOCK})}));
  /* ردود الشيت التجريبي */
  await ctx.route('https://api.telegram.org/**', r => {
    const tok = (r.request().url().match(/bot([^/]+)\//) || [])[1] || '', v = sheets.mkt.tg.valid;
    r.fulfill({status: 200, contentType: 'application/json', headers: {'Access-Control-Allow-Origin': '*'}, body: JSON.stringify(v && !v.includes(decodeURIComponent(tok)) ? {ok: false, error_code: 401, description: 'Unauthorized'} : {ok: true, result: {username: 'test_souq_bot'}})});
  });
  ctx.page = async url => { const p = await ctx.newPage(); await p.addInitScript(v => { window.__tkOff0 = v; window.__meDefault = 'جهاز تجربة'; }, OFF); p.on('pageerror', e => (ctx.errs.push(e.message), process.env.DBG && console.log('PAGEERR', e.message))); p.on('crash', () => process.env.DBG && console.log('CRASH')); p.on('close', () => process.env.DBG && console.log('PAGE CLOSED')); p.on('console', m => { if (process.env.DBG && m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 120)); }); p.on('frameattached', f => NAVS.push('frame+ ' + url.slice(0, 20))); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') NAVS.push('console ' + url.slice(0, 20) + ' ' + m.text().slice(0, 100)); }); p.on('framenavigated', f => { NAVS.push(new Date().toISOString().slice(17, 23) + ' nav ' + (f === p.mainFrame() ? '' : 'sub ') + f.url().slice(0, 70)); if (f !== p.mainFrame()) return; if (process.env.DBG) console.log('NAV', new Date().toISOString().slice(14, 23), f.url().slice(0, 80)); }); p.__n = 0; p.on('domcontentloaded', () => { if (p.__n++) NAVS.push(new Date().toISOString().slice(11, 23) + ' ' + p.url().slice(0, 80)); }); await p.goto(base + url); return p; };
  return ctx;
}
async function unlock(A, first) {
  if (first) { await A.fill('#suP', PASS); await A.fill('#suP2', PASS); await A.click('#suGo'); }
  else { await A.fill('#lkP', PASS); await A.waitForSelector('#lock:not(.on)', {state: 'attached', timeout: 15000}); }
  await A.waitForSelector('#lock', {state: 'hidden'});
}
/* الدوال اللي بتكلم الشيت (مزامنة) بنشغلها في الصفحة من غير ما نستنى الـ Promise بتاعها من بره، وبنستنى علامة إنها خلصت.
   استنى الـ Promise الطويل من بره كان أحياناً بيقع بـ "Execution context was destroyed" من غير أي تنقل حقيقي (الصفحة نفسها سليمة). */
const bg = async (X, code) => {
  await X.evaluate(c => { window.__bg = 'run'; Promise.resolve().then(() => (0, eval)(c)).then(v => { window.__bgv = v; window.__bg = 'ok'; }, e => { window.__bgv = String(e && e.message || e); window.__bg = 'err'; }); }, code);
  await X.waitForFunction(() => window.__bg !== 'run', null, {timeout: 90000, polling: 100});
  return X.evaluate(() => window.__bgv);
};
const closed = A => A.waitForSelector('#mask', {state: 'hidden'});
const bal = (A, name) => A.evaluate(n => { const p = liveParties().find(x => x.name === n); return p ? balance(p.id) : null; }, name);
const vbal = (A, vid) => A.evaluate(v => vaultBal(v), vid || '');
const openParty = async (A, name) => { await A.evaluate(n => go('p/' + liveParties().find(x => x.name === n).id), name); await A.settle(150); };

/* ====================== أنهي أقسام تتشغل ======================
   node tests/run.js              → كله
   node tests/run.js --changed    → بيختار لوحده من الملفات اللي اتغيرت عن origin/main (الطريقة العادية)
   node tests/run.js --only=acc   → الحسابات والـPDF والمزامنة (١–١٤)
   node tests/run.js --only=smoke → ١ و٢ + كل الصفحات بتفتح من غير أخطاء (لتعديلات الشكل بس)
   --dry مع أي واحد منهم = يقول هيشغّل إيه بس */
const {execSync, spawnSync} = require('child_process');
let SW_NEED = true;
function changedModes() {
  const sh = c => { try { return execSync(c, {cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore']}).toString(); } catch (e) { return null; } };
  const files = new Set(((sh('git diff --name-only origin/main') || '') + (sh('git ls-files --others --exclude-standard') || '')).split('\n').filter(Boolean));
  if (!files.size) { console.log('مفيش ملفات اتغيرت عن origin/main، هشغّل كله'); return ['full']; }
  const modes = new Set(), why = [];
  /* سطور accounts.html اللي اتغيرت: لو كلها جوه الـ style = شكل بس، */
  const accKind = () => {
    const d = sh('git diff -U0 origin/main -- accounts.html'); if (d === null) return 'full';
    const src = fs.readFileSync(path.join(ROOT, 'accounts.html'), 'utf8').split('\n');
    const at = re => src.findIndex(l => re.test(l)) + 1;
    const stEnd = at(/^<\/style>/), mkStart = src.findIndex((l, i) => /^<script>/.test(l) && /الوارد \(قديم/.test(src.slice(i, i + 3).join('\n'))) + 1;
    const hunks = [...d.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)].map(m => [+m[1], +m[1] + Math.max(+(m[2] ?? 1), 1) - 1]);
    if (!hunks.length) return null;
    if (hunks.every(([a, b]) => b < stEnd)) return 'smoke';
    if (mkStart > 0 && hunks.every(([a]) => a > mkStart)) return 'mkt';
    return 'full';
  };
  for (const f of files) {
    let m = null;
    if (f === 'accounts.html') m = accKind();
    else if (/^(tests\/(run|gasmock|speed)\.js|lib\/|sw\.js|fonts\/)/.test(f)) m = 'full';
    else if (/\.(html|webmanifest)$/.test(f) || /^icons\//.test(f)) m = 'smoke';
    if (m) { modes.add(m); why.push(`${f} → ${m}`); }
  }
  /* قسم ٢٣ (الفتح السريع والنت البطيء، ~30 ثانية نت بطيء بجد) بيشتغل في --changed بس لو حاجة تخصه اتغيرت. التشغيل الكامل (وGitHub بعد الرفع) بيشغّله دايماً */
  const pg = ['accounts.html'].filter(f => files.has(f)).map(f => sh('git diff -U0 origin/main -- ' + f) || '').join('\n');
  SW_NEED = ['sw.js', 'lib/swup.js', 'tests/run.js'].some(f => files.has(f)) || /swSafe|serviceWorker|swup|SHELL/.test(pg);
  if (!SW_NEED) why.push('قسم ٢٣ (الفتح السريع) متخطّي: مفيش حاجة تخصه اتغيرت');
  console.log('الملفات اللي اتغيرت:\n  ' + (why.join('\n  ') || 'ملفات كلام بس (md وغيره)، ملهاش اختبار'));
  return [...modes];
}
let MODES = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
if (process.env.MARKET_ONLY) MODES = ['mkt'];
if (process.argv.includes('--changed')) MODES = changedModes();
if (MODES.includes('payroll')) {
  console.log('\n— المرتبات: node tests/payroll.js —');
  const r = spawnSync(process.execPath, [path.join(__dirname, 'payroll.js')], {stdio: 'inherit'});
  MODES = MODES.filter(m => m !== 'payroll');
  if (r.status) process.exit(r.status);
  if (!MODES.length) process.exit(0);
}
/* اختبار السرعة (tests/speed.js، ~نص دقيقة): في --changed لما الحسابات أو lib أو الاختبارات تتغير (GitHub بيشغّله دايماً بعد الرفع) */
if (process.argv.includes('--changed') && !process.argv.includes('--dry') && MODES.some(m => m === 'full' || m === 'acc')) {
  console.log('\n— السرعة: node tests/speed.js —');
  if (spawnSync(process.execPath, [path.join(__dirname, 'speed.js')], {stdio: 'inherit'}).status) fails++;
}
if (process.argv.includes('--changed') && !MODES.length) { console.log('\n✔ مفيش اختبار مطلوب للتغيير ده'); process.exit(0); }
if (!MODES.length || MODES.includes('full') || (MODES.includes('acc') && MODES.includes('mkt'))) MODES = ['full'];
const FULL = MODES.includes('full');
const RUN = {sw: SW_NEED, base: FULL || MODES.includes('acc'), sync: FULL || MODES.includes('acc') || MODES.includes('mkt'), mkt: FULL || MODES.includes('mkt'), smoke: MODES.includes('smoke')};
/* التشغيل الكامل: قسم ٢٣ (الفتح السريع، ~20 ثانية) ليه جهاز وسيرفر لوحده ومبيعتمدش على بيانات الأقسام التانية،
   فبيشتغل في عملية تانية في نفس الوقت (--only=sw). SW_SERIAL=1 = يشتغل ورا الباقي زي الأول */
let SWP = null;
const NAVS = [];   // تحميل كامل لأي صفحة (مش تغيير #) بيتطبع لو الاختبار وقف، علشان نعرف مين عمل reload
if (FULL && RUN.sw && !process.env.SW_SERIAL && !process.argv.includes('--dry')) {
  RUN.sw = false; let out = '';
  const ch = require('child_process').spawn(process.execPath, [__filename, '--only=sw'], {cwd: ROOT, env: Object.assign({}, process.env, {SW_SERIAL: '1'})});
  ch.stdout.on('data', d => out += d); ch.stderr.on('data', d => out += d);
  SWP = new Promise(r => ch.on('close', code => r({code, out})));
}
const MO = MODES.includes('mkt') && !FULL;   // وضع قديم (بيضيف عميل تجريبي مكان اللي بيتعمل في الأقسام اللي اتخطت)
console.log('الأقسام:', FULL ? 'كله' : MODES.join(' + '));
if (process.argv.includes('--dry')) process.exit(0);   // يقول هيشغّل إيه بس من غير ما يشغّل

/* ====================== الانتظار الذكي (settle) ======================
   بدل "استنى 300 ملّي" بوقت ثابت: بنستنى لحد ما كل الصفحات المفتوحة تخلص شغلها (مؤقتات قصيرة، طلبات شيت،
   تشفير، IndexedDB، صور وسكربتات، رجوع في التاريخ، حركة الأرقام)، وبعدها فترة هدوء قصيرة.
   أقصى انتظار = الرقم المكتوب، فعمره ما يبقى أبطأ من الانتظار الثابت القديم.
   الساعة: لو رجعنا بدري، ساعة كل الصفحات (Date) بتتقدم بباقي الوقت اللي متستناش، فالبرنامج بيشوف إن الوقت
   المكتوب عدّى فعلاً (زي "دوستين ورا بعض في أقل من 700 ملّي = دوسة واحدة" و"نفس المبلغ في دقيقتين").
   كل الصفحات بتتقدم مع بعض بنفس المقدار، فترتيب الحركات بين الأجهزة زي ما هو. */
const TRACKER = `(() => {
  if (window.__tk) return;
  const T = window.__tk = {n: 0, last: 0}, DBG = ${process.env.SETTLE_DEBUG ? 'true' : 'false'};   // SETTLE_DEBUG=1: بيطبع في الآخر مين اللي خلّى الانتظار يوصل للحد الأقصى
  const RD = Date; let off = null;
  const getOff = () => { if (off === null) { try { off = +sessionStorage.getItem('__tkOff') || +window.__tkOff0 || 0; } catch (e) { off = +window.__tkOff0 || 0; } } return off; };
  window.__tkSetOff = v => { off = v; try { sessionStorage.setItem('__tkOff', String(v)); } catch (e) {} };
  const realNow = RD.now.bind(RD), nowFn = () => realNow() + getOff();
  let nowOv = null;   // لو الاختبار نفسه غيّر Date.now مؤقتاً (زي "بكرة")
  window.Date = new Proxy(RD, {
    construct: (t, a, nt) => Reflect.construct(t, a.length ? a : [nowFn()], nt),
    apply: () => new RD(nowFn()).toString(),
    get: (t, k) => k === 'now' ? (nowOv || nowFn) : Reflect.get(t, k),
    set: (t, k, v) => { if (k === 'now') { nowOv = v === nowFn ? null : v; return true; } return Reflect.set(t, k, v); }
  });
  const inc = () => { T.n++; T.last = performance.now(); }, dec = () => { T.n = Math.max(0, T.n - 1); T.last = performance.now(); };
  const once = () => { let d = false; return () => { if (!d) { d = true; dec(); } }; };
  const st = window.setTimeout, ct = window.clearTimeout, raf = window.requestAnimationFrame, caf = window.cancelAnimationFrame, pend = new Set(), pr = new Set();
  window.setTimeout = function (fn, ms, ...a) {
    const d = +ms || 0;
    if (typeof fn !== 'function' || d >= 1500) return st.call(window, fn, ms, ...a);   // 1.5 ثانية أو أكتر = شغل خلفية (المزامنة) مش بنستناه
    inc(); const id = st.call(window, function () { if (pend.delete(id)) { dec(); (T.src || {})[id] = undefined; } return fn.apply(this, a); }, ms); pend.add(id); if (DBG) (T.src = T.src || {})[id] = d + 'ms ' + String(fn).slice(0, 90); return id;
  };
  window.clearTimeout = function (id) { if (pend.delete(id)) { dec(); if (T.src) T.src[id] = undefined; } return ct.call(window, id); };
  window.requestAnimationFrame = function (fn) { inc(); const id = raf.call(window, t => { if (pr.delete(id)) { dec(); (T.rsrc || {})[id] = undefined; } fn(t); }); pr.add(id); if (DBG) (T.rsrc = T.rsrc || {})[id] = 'raf ' + String(fn).slice(0, 90); return id; };
  window.cancelAnimationFrame = function (id) { if (pr.delete(id)) dec(); return caf.call(window, id); };
  const wrapP = (obj, k) => { const f = obj && obj[k]; if (typeof f !== 'function') return; obj[k] = function (...a) { inc(); let p; try { p = f.apply(this, a); } catch (e) { dec(); throw e; } return Promise.resolve(p).finally(dec); }; };
  wrapP(window, 'fetch');
  ['text', 'json', 'blob', 'arrayBuffer'].forEach(k => wrapP(Response.prototype, k));
  if (window.crypto && crypto.subtle) ['encrypt', 'decrypt', 'deriveKey', 'deriveBits', 'importKey', 'exportKey', 'digest', 'sign', 'verify', 'generateKey'].forEach(k => {
    const f = crypto.subtle[k]; if (typeof f !== 'function') return;
    crypto.subtle[k] = (...a) => { inc(); let p; try { p = f.apply(crypto.subtle, a); } catch (e) { dec(); throw e; } return Promise.resolve(p).finally(dec); };
  });
  if (navigator.clipboard) ['writeText', 'readText', 'write', 'read'].forEach(k => wrapP(navigator.clipboard, k));
  const tx = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (...a) { const t = tx.apply(this, a); inc(); const d = once(); ['complete', 'error', 'abort'].forEach(e => t.addEventListener(e, d)); return t; };
  const op = IDBFactory.prototype.open;
  IDBFactory.prototype.open = function (...a) { const r = op.apply(this, a); inc(); const d = once(); ['success', 'error', 'blocked'].forEach(e => r.addEventListener(e, d)); return r; };
  const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', {configurable: true, enumerable: src.enumerable, get: src.get, set(v) {
    if (v) { inc(); const d = once(); this.addEventListener('load', d, {once: true}); this.addEventListener('error', d, {once: true}); st.call(window, d, 3000); }
    src.set.call(this, v);
  }});
  const watch = el => { if (el && ((el.tagName === 'SCRIPT' && el.src) || el.tagName === 'IFRAME')) { inc(); const d = once(); el.addEventListener('load', d); el.addEventListener('error', d); st.call(window, d, 3000); } };
  const ap = Node.prototype.appendChild, ib = Node.prototype.insertBefore;
  Node.prototype.appendChild = function (el) { watch(el); return ap.call(this, el); };
  Node.prototype.insertBefore = function (el, ref) { watch(el); return ib.call(this, el, ref); };
  ['back', 'forward', 'go'].forEach(k => { const f = history[k]; history[k] = function (...a) { inc(); const d = once(); addEventListener('popstate', d, {once: true}); st.call(window, d, 400); return f.apply(history, a); }; });
})();`;
let BROWSER = null, settleCaps = 0, settleN = 0, OFF = 0;
const QUIET = 60;   // لازم الصفحات تفضل هادية المدة دي ورا بعض
async function settle(ms) {
  settleN++;
  const t0 = Date.now(), end = t0 + ms, min = t0 + Math.min(ms, 40);
  let quiet = 0;
  while (Date.now() < end) {
    let busy = false;
    for (const p of BROWSER.contexts().flatMap(c => c.pages())) {
      if (p.isClosed()) continue;
      try { if (await p.evaluate(() => !!window.__tk && (window.__tk.n > 0 || performance.now() - window.__tk.last < 25))) { busy = true; break; } }
      catch (e) { if (!p.isClosed()) { busy = true; break; } }   // الصفحة بتتنقل/بتتحمّل
    }
    if (busy) quiet = 0; else if (!quiet) quiet = Date.now(); else if (Date.now() - quiet >= QUIET && Date.now() >= min) {
      OFF += Math.max(0, ms - (Date.now() - t0));   // الوقت اللي وفّرناه: ساعة الصفحات بتتقدم بيه
      for (const p of BROWSER.contexts().flatMap(c => c.pages())) if (!p.isClosed()) await p.evaluate(v => window.__tkSetOff && window.__tkSetOff(v), OFF).catch(() => {});
      return;
    }
    await new Promise(r => setTimeout(r, 10));
  }
  settleCaps++;
  if (process.env.SETTLE_DEBUG) {   // مين اللي فضل شغال للآخر، ومن أنهي سطر في الاختبار
    const who = [];
    for (const p of BROWSER.contexts().flatMap(c => c.pages())) if (!p.isClosed()) who.push(await p.evaluate(() => (location.pathname.split('/').pop() || '?') + ':' + (window.__tk ? window.__tk.n + ' ' + [...Object.values(window.__tk.src || {}), ...Object.values(window.__tk.rsrc || {})].filter(Boolean).join(' | ') : '-')).catch(() => '?'));
    const at = (new Error().stack.split('\n').find(l => l.includes('run.js') && !l.includes('settle')) || '').trim().replace(/^at /, '');
    (global.__caps = global.__caps || []).push({ms, at, who: who.join(' ')});
  }
}

/* وقت كل قسم بيتطبع في الآخر */
const secT = [];
const sec = name => { const n = Date.now(); if (secT.length) secT[secT.length - 1].s = (n - secT[secT.length - 1].t) / 1000; secT.push({name, t: n}); console.log('\n' + name); };
const T0 = Date.now();

(async () => {
  const srv = await serve(), base = `http://localhost:${srv.address().port}/`;
  const browser = BROWSER = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});
  const sheets = {acc: makeGas(), cash: makeGas(), mkt: makeGas()};
  let DM = null, D2 = null, B = null;
  const D1 = await newDevice(browser, base, sheets);
  const bad = importFile(); bad.parties[0].expected = 1;
  /* خانة ملف النقل اتشالت من الإعدادات، فبنفتح شاشة النقل مباشرة */
  const openImport = (A, d) => A.evaluate(x => importModal(readImport(x)), d);
  try {
    /* أدوات الشكل (الخط والتبويبات والأرقام): متعرّفة هنا فوق علشان أقسام قبل قسم الشكل تستخدمها */
    const fs5 = X => X.evaluate(() => {
      const tok = ['--f1', '--f2', '--f3', '--f4', '--f5'].map(v => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(v)));
      const ICON = '#bSearch,#bNewParty,.dnav button,.dpk button,.dph button,.chk,.qkm .btn,#lkPad .pk,#suPad .pk,.qa2 .qb i,.fabn';
      const bad = new Set();
      for (const el of document.querySelectorAll('body *')) {
        if (el.closest('#render,svg') || el.closest(ICON)) continue;
        if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
        const f = parseFloat(getComputedStyle(el).fontSize);
        if (!tok.some(t => Math.abs(t - f) < 0.1)) bad.add(f + 'px ' + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '.' + String(el.className).trim().replace(/\s+/g, '.'));
      }
      return [tok.every(t => t > 0), [...bad].slice(0, 6)];
    });
    const segOk = (X, name) => X.evaluate(() => [...document.querySelectorAll('.seg')].filter(g => g.getClientRects().length).flatMap(g => {
      const bs = [...g.querySelectorAll('button')].filter(b => b.getClientRects().length), hs = bs.map(b => Math.round(b.getBoundingClientRect().height));
      const bad = [];
      if (Math.max(...hs) - Math.min(...hs) > 1) bad.push((g.id || 'seg') + ': ارتفاعات ' + [...new Set(hs)].join('/'));
      bs.forEach(b => { const r = document.createRange(); r.selectNodeContents(b); const tops = new Set([...r.getClientRects()].map(x => Math.round(x.top))); if (tops.size > 1 || b.scrollWidth > b.clientWidth + 1) bad.push((g.id || 'seg') + ': ' + b.textContent.trim()); });
      return bad;
    })).then(b => eq(name + ': التبويبات منظمة', b, []));
    const numCol = (X, root, sel) => X.evaluate(([root, sel]) => {
      const L = [...document.querySelectorAll(root + ' ' + sel.split(',').join(',' + root + ' '))].filter(e => e.getClientRects().length && e.textContent.trim())
        .map(e => { const g = document.createRange(); g.selectNodeContents(e); return [g.getBoundingClientRect().left, e.className + ':' + e.textContent.trim().slice(0, 12) + '@' + (e.closest('section,.list,.ctab') || {}).className + '|' + e.parentElement.className + '|' + e.parentElement.parentElement.className]; });
      const xs = L.map(x => x[0]), lo = Math.min(...xs);
      return [L.length, L.length ? Math.round(Math.max(...xs) - lo) : 0, L.filter(x => x[0] - lo > 1).slice(0, 4).map(x => Math.round(x[0] - lo) + ' ' + x[1])];
    }, [root, sel]);
    const colOk = async (name, X, root, sel) => { const [n, spread, off] = await numCol(X, root, sel); if (n < 2 && !RUN.base) return;   // --only=smoke/mkt بيتخطى إدخال البيانات (٣–٩)، فمفيش أرقام كفاية تتقارن
      eq(`${name}: الأرقام تحت بعض (${n} رقم)`, [n >= 2, spread <= 1, off], [true, true, []]); };
    sec('١) كلمة السر والتشفير');
    const A = global.__A = await D1.page('accounts.html');
    await unlock(A, true);
    await A.click('#bLock'); await A.waitForSelector('#lkP'); await A.fill('#lkP', '999999'); await A.settle(2000);
    eq('بصمة الوجه: بعد ما اتطلبت شاشة القفل مبتتحدثش لوحدها (البصمة متطلعش مرتين)', await A.evaluate(() => { const v = $('#lkP').value; $('#lkP').value = ''; const a = window.swSafe(), b0 = window.bioAsked; window.bioAsked = true; const b = window.swSafe(); window.bioAsked = b0; $('#lkP').value = v; return [a, b]; }), [true, false]);
    eq('كلمة سر غلط وقت الكتابة مفيهاش رسالة ولا بتفتح', [await A.textContent('#lkErr'), await A.evaluate(() => $('#lock').classList.contains('on'))], ['', true]);
    await A.click('#lkGo'); await A.settle(1500);
    eq('كلمة سر غلط بترفض', await A.textContent('#lkErr'), 'كلمة السر غلط');
    {   // لوحة الأرقام على الموبايل: دوسة عادية بتمسح رقم، ومطوّلة بتمسح ورا بعض
      const T = await D1.page('accounts.html?nobio');
      await T.addInitScript(() => { const mm = window.matchMedia.bind(window); window.matchMedia = q => /pointer:\s*coarse/.test(q) ? {matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}} : mm(q); });
      await T.reload(); await T.waitForSelector('#lkPad .pk');
      const val = () => T.evaluate(() => $('#lkP').value), key = k => T.click(`#lkPad [data-k="${k}"]`);
      await key('1'); await key('2'); await key('3'); await key('4'); await key('⌫');
      const tap = await val();
      await key('1'); await key('2'); await key('3');
      const bb = await T.locator('#lkPad [data-k="⌫"]').boundingBox();
      await T.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await T.mouse.down();
      await T.waitForFunction(() => $('#lkP').value === '', null, {timeout: 5000}).catch(() => {});
      const held = await val(); await T.mouse.up(); await T.settle(300);
      eq('لوحة الأرقام: ⌫ دوسة عادية بتمسح رقم، ومطوّلة بتمسح كله ورا بعض', [tap, held, await val()], ['123', '', '']);
      await T.close();
    }
    {   // أول مرة على الموبايل: شاشة "اعمل كلمة سر" فيها نفس لوحة الأرقام
      const ctx = await browser.newContext({viewport: {width: 390, height: 844}});
      const T = await ctx.newPage();
      await T.addInitScript(() => { const mm = window.matchMedia.bind(window); window.matchMedia = q => /pointer:\s*coarse/.test(q) ? {matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}} : mm(q); });
      await T.goto(base + 'accounts.html?nobio'); await T.waitForSelector('#suPad .pk');
      const key = k => T.click(`#suPad [data-k="${k}"]`), v = () => T.evaluate(() => [$('#suP').value, $('#suP2').value]);
      for (const k of '1234') await key(k);
      await key('nx'); const short = await T.textContent('#suErr');
      for (const k of '56') await key(k); await key('⌫'); await key('6');
      await key('nx'); for (const k of '123456') await key(k);
      const typed = await v();
      await key('nx'); await T.waitForSelector('#lock:not(.on)', {timeout: 15000}).catch(() => {});
      eq('أول مرة على الموبايل: لوحة الأرقام بتكتب في الخانتين و"ابدأ" بيفتح', [!!short, typed, await T.evaluate(() => !$('#lock').classList.contains('on'))], [true, ['123456', '123456'], true]);
      await ctx.close();
    }
    await unlock(A);

    sec('٢) نقل البيانات القديمة');
    await openImport(A, bad); await A.settle(300);
    eq('ملف فيه رصيد مش مطابق بيترفض', await A.$('#imGo'), null); await A.click('#imX');
    await openImport(A, importFile()); await A.settle(300); await A.click('#imGo'); await A.click('#cOk'); await A.settle(400);
    eq('رصيد عميل 1', await bal(A, 'عميل تجربة واحد'), 270000);
    eq('رصيد عميل 2', await bal(A, 'عميل تجربة اتنين'), 0);
    eq('رصيد المورد', await bal(A, 'مورد تجربة'), -2950000);
    await openImport(A, importFile()); await A.settle(300); await A.click('#imGo'); await A.click('#cOk'); await A.settle(400);
    eq('النقل مرتين مبيكررش', await A.evaluate(() => [db.parties.length, db.entries.length]), [3, 8]);
    const raw = await A.evaluate(async () => JSON.stringify(await idbGet('vault')));
    eq('البيانات على الجهاز متشفرة', raw.includes('عميل تجربة'), false);

    if (RUN.base) {   // ← وضع الشكل (smoke) بيتخطى ٣ لحد ٩
    sec('٣) فاتورة ودفعة ومرتجع وخصم');
    await A.evaluate(() => go('cash')); await A.click('#cNew'); await A.click('#cMore'); await A.click('#modal [data-b=cOpen2]'); await A.fill('#modal [data-v]', '1000'); await A.click('#opOk'); await A.settle(200);
    eq('رصيد بداية الخزنة', await vbal(A, 'v_main'), 100000);
    await openParty(A, 'عميل تجربة واحد');
    await A.click('#fbDoc'); await A.fill('.li [data-f=name]', 'لفة تجربة 16 مم'); await A.dispatchEvent('.li [data-f=name]', 'change');
    eq('آخر سعر للعميل بيتكتب لوحده', await A.inputValue('.li [data-f=price]'), '350');
    await A.fill('.li [data-f=qty]', '4'); await A.click('.mmore summary'); await A.fill('#dcDisc', '50');
    eq('الفاتورة للبنود بس: مفيش خانة "دفع دلوقتي"', !!(await A.$('#dcPaid')), false); await A.click('#dcOk'); await closed(A);
    await A.click('#fbPay'); await A.fill('#pyAmt', '400'); await A.click('#pyOk'); await closed(A);
    eq('بعد فاتورة 1400−50 ودفع 400', await bal(A, 'عميل تجربة واحد'), 270000 + 135000 - 40000);
    eq('الدفعة دخلت الخزنة', await vbal(A, 'v_main'), 140000);
    await A.click('#ppRet'); await A.fill('.li [data-f=name]', 'لفة تجربة 16 مم'); await A.fill('.li [data-f=qty]', '1'); await A.fill('.li [data-f=price]', '350'); await A.click('#dcOk'); await closed(A);
    /* الفاتورة جدول: آخر سطر فاضي دايماً، والجديد بوحدة اللي قبله، وEnter بينقل، و✕ بيمسح */
    await A.click('#fbDoc');
    eq('الفاتورة الجديدة بسطر فاضي واحد ومن غير زرار "+ صنف"', [await A.$$eval('#dcLines .li', l => l.length), !!(await A.$('#dcAdd'))], [1, false]);
    await A.selectOption('#dcLines .li:nth-child(1) [data-f=unit]', 'لفة'); await A.fill('#dcLines .li:nth-child(1) [data-f=name]', 'صنف جدول تجربة');
    eq('أول ما يتكتب في الأخير بيطلع سطر فاضي بوحدته', await A.evaluate(() => [$$('#dcLines .li').length, $('#dcLines .li:nth-child(2) [data-f=unit]').value, $('#dcLines .li:nth-child(2) .badge').textContent]), [2, 'لفة', '2']);
    await A.focus('#dcLines .li:nth-child(1) [data-f=name]'); await A.keyboard.press('Enter');
    eq('Enter من الاسم للكمية على طول (الوحدة بالإيد)', await A.evaluate(() => document.activeElement.dataset.f), 'qty');
    await A.focus('#dcLines .li:nth-child(1) [data-f=price]'); await A.keyboard.press('Enter');
    eq('Enter من السعر لاسم السطر اللي بعده والنافذة مفتوحة', await A.evaluate(() => [document.activeElement === $('#dcLines .li:nth-child(2) [data-f=name]'), $('#modal').classList.contains('on') || !!$('#dcOk')]), [true, true]);
    await A.click('#dcLines .li:nth-child(1) [data-del]');
    eq('✕ بيمسح السطر ويفضل سطر فاضي', await A.$$eval('#dcLines .li', l => l.length), 1);
    await A.click('#dcX'); await closed(A);
    await A.click('#ppAdj'); await A.fill('#adAmt', '15'); await A.fill('#adNote', 'جبر كسور'); await A.click('#adOk'); await closed(A);
    eq('بعد مرتجع 350 وخصم 15', await bal(A, 'عميل تجربة واحد'), 365000 - 35000 - 1500);
    await A.click('#fbPay'); await A.fill('#pyAmt', '100'); await A.click('#pyOk'); await closed(A);
    await A.click('#fbPay'); await A.fill('#pyAmt', '100'); await A.click('#pyOk'); await A.settle(150);
    eq('تنبيه الدفعة المكررة', (await A.textContent('#pyWarn')).includes('بنفس المبلغ'), true); await A.click('#pyX');

    sec('٤) الشيكات وكارت الصبح واختيارات كشف الحساب');
    eq('زرار الشيكات موجود، والدفعة فيها اختيارين بس (فلوس / شيك)', [!!(await A.$('nav button[data-go=chk]')), (await A.click('#fbPay'), await A.$$eval('#pyM button', b => b.map(x => x.dataset.v).join('|')))], [true, 'نقدي|شيك']); await A.click('#pyX'); await closed(A);
    eq('الكشف بيكتب "دفعة" بس من غير نقدي/تحويل', await A.evaluate(() => rowsOf({kind: 'ppay', date: '2026-01-01', amt: 100, method: 'تحويل', cr: 100})[0].desc + '|' + docTitle({kind: 'pay', method: 'تحويل'})), 'دفعة|دفعة استلمتها');
    {   // شيك وارد ميعاده النهارده: بينزل من رصيد العميل ومبيدخلش الخزنة لحد ما يتصرف، وبيظهر في كارت الصبح
      const b0 = await bal(A, 'عميل تجربة واحد');
      await A.click('#fbPay'); await A.click('#pyM button[data-v=شيك]'); await A.fill('#pyAmt', '700'); await A.fill('#pyCn', '123456');
      await A.evaluate(() => { $('#pyCd').value = todayISO(); }); await A.click('#pyOk'); await closed(A);
      eq('الشيك نزل من الرصيد ولسه مدخلش الخزنة', [await bal(A, 'عميل تجربة واحد'), await A.evaluate(() => { const e = chkList().pop(); return [e.chk.st, e.chk.no, e.vault || '']; })], [b0 - 70000, ['p', '123456', '']]);
      const r = await A.evaluate(() => {
        try { localStorage.removeItem('gd_mrn'); } catch (e) {}
        go('home'); renderHome(); const m = $('#mrn'), r = [!!m && m.textContent.includes('شيك') && m.textContent.includes('عميل تجربة واحد'), !$('#chkAlert')];
        $('#mrnOk').click(); r.push(!$('#mrn'), localStorage.getItem('gd_mrn') === todayISO(), !!$('#chkAlert'));
        r.push(waNum('01012345678'), waNum('+20 101 234 5678'), waNum('0223456789'), waLink({name: 'أ', phone: '01012345678'}, 150000).startsWith('https://wa.me/201012345678?text='));
        return r; });
      eq('كارت الصبح: فيه الشيك (ومكان تنبيه الشيكات)، و"تمام" بيخفيه للنهارده، ورقم الواتساب بيتظبط', r, [true, true, true, true, true, '201012345678', '201012345678', '', true]);
      eq('الشيك اتصرف: دخل الخزنة والرصيد مبيتغيرش تاني', await A.evaluate(() => { const e = chkList().pop(); cashCheck(e); $('#ccOk').click(); return [e.chk.st, !!e.vault]; }).then(async x => [...x, await bal(A, 'عميل تجربة واحد')]), ['c', true, b0 - 70000]);
      await A.evaluate(() => { const e = chkList().pop(); e.del = true; touch(e); saveDB(); }); await A.settle(200);   // يرجع الرصيد زي ما كان للي بعده
      await A.evaluate(() => go('p/' + liveParties().find(x => x.name === 'عميل تجربة واحد').id)); await A.settle(200);
    }
    await A.click('#fbStmt'); await A.settle(150);
    eq('الكشف بيفتح على آخر فاتورة والرصيد قبلها', [await A.getAttribute('#smMode .on', 'data-m'), (await A.textContent('#smOut')).includes('الرصيد قبل الفاتورة')], ['last', true]);
    eq('آخر فاتورة: الرصيد قبل وبعد', await A.evaluate(() => { const p = liveParties().find(x => x.name === 'عميل تجربة واحد'), l = partyEntries(p.id).filter(e => e.kind === 'inv').pop(), s = stmtData(p.id, '', '', l.id); return [s.open, s.close, s.rows[0].kind || s.lastInv.kind]; }), [270000, 318500, 'inv']);
    await A.click('#smMode button[data-m=prev]'); await A.settle(100);
    eq('آخر شهر = من شهر فات لحد النهارده (مفيش حاجة بتتساب)', await A.evaluate(() => { const p = liveParties().find(x => x.name === 'عميل تجربة واحد'), d = new Date(); d.setMonth(d.getMonth() - 1);
      const n = partyEntries(p.id).filter(e => e.date >= isoOf(d.getTime()) && e.date <= todayISO() && e.kind !== 'open').length; return [+$('#smOut .stm div:nth-child(2) b').textContent, n]; }).then(([a, n]) => a === n && n > 0), true);
    eq('التاريخ يوم الأول على اليمين', await A.evaluate(() => dispDate('2026-02-05').replace(/\u200F/g, '|')), '05|/|02|/|2026');
    await A.click('#smX');
    eq('رابط الربط الملصوق بيتقري', await A.evaluate(() => { const o = parseJoin(' https://x/accounts.html#join=' + b64u(JSON.stringify({u: 'U', k: 'K'})) + ' '); return [o.u, o.k, parseJoin('كلام غلط')]; }), ['U', 'K', null]);

    await A.setViewportSize({width: 1300, height: 800}); await A.settle(200);
    eq('اللاب توب: الحساب مفتوح جنب القايمة', await A.evaluate(() => [$('main').classList.contains('split'), getComputedStyle($('#p-home')).display, !!$('#hList .pt.cur'), getComputedStyle($('nav')).width]), [true, 'flex', true, '184px']);
    /* زرار "احفظ نسخة" في القايمة الجانبية: بيختار المكان ويكتب ملف متشفر بكل البيانات */
    await A.evaluate(() => { window.__bkFile = null; window.showSaveFilePicker = async o => ({createWritable: async () => { let d = ''; return {write: async b => { d += await b.text(); }, close: async () => { window.__bkFile = {name: o.suggestedName, d}; }}; }}); });
    await A.click('#bBk'); await A.waitForFunction(() => window.__bkFile, null, {timeout: 10000});
    eq('اللاب: احفظ نسخة بيكتب ملف متشفر فيه كل الحسابات', await A.evaluate(async () => { const f = window.__bkFile, box = JSON.parse(f.d), d = await unseal(cryptoKey, box); return [f.name.startsWith('gedda-accounts-'), box.app, f.d.includes('عميل تجربة'), d.entries.length === db.entries.length, d.parties.length === db.parties.length]; }), [true, 'gedda-accounts-backup', false, true, true]);
    eq('زرار احفظ نسخة ظاهر على اللاب', await A.evaluate(() => getComputedStyle($('#bBk')).display !== 'none'), true);
    await A.setViewportSize({width: 400, height: 860}); await A.settle(200);
    eq('الموبايل: صفحة واحدة', await A.evaluate(() => [$('main').classList.contains('split'), getComputedStyle($('#p-home')).display]), [false, 'none']);
    eq('زرار احفظ نسخة مخفي على الموبايل', await A.evaluate(() => getComputedStyle($('#bBk')).display), 'none');

    sec('٥) الخزنة');
    await A.evaluate(() => go('cash')); await A.click('#cExp'); await A.fill('#txA', '30'); await A.click('#txOk'); await closed(A);
    await A.click('#cPayS'); await A.click('#pkList .pt'); await A.fill('#pyAmt', '500'); await A.click('#pyOk'); await closed(A);
    eq('مصروف 30 ودفعة مورد 500', await vbal(A, 'v_main'), 150000 - 3000 - 50000);
    eq('رصيد المورد نزل', await bal(A, 'مورد تجربة'), -2950000 + 50000);
    await A.click('#cMore'); await A.click('#modal [data-b=cOpen2]'); await A.fill('#modal [data-v]', '960'); await A.click('#opOk'); await A.settle(200);
    eq('الجرد سجّل الفرق تسوية', await vbal(A, 'v_main'), 96000);

    /* دفتر الخزنة بالتاريخ: نفس استبعادات "بالنوع" وإجماليه، الأقدم فوق، والفلتر والـ PDF */
    const ldgSetup = await A.evaluate(() => {
      const D1 = '2001-03-01', D2 = '2001-03-02', D3 = '2001-03-03', now = nowS(), mkp = (sec, name) => { const np = {id: newId('p_'), sec, name, phone: '', note: '', noTot: false, at: now, upd: now, del: false}; db.parties.push(np); P.set(np.id, np); return np.id; };
      const v2 = {id: 'v_ldg2', name: 'بنك تجربة الدفتر', open: 0, ord: 9, upd: now, del: false}; db.vaults.push(v2); reindex();
      const pc = mkp('site', 'عميل دفتر تجربة'), pm = mkp('mkt', 'عميل سوق دفتر تجربة'), ps = mkp('sup', 'مورد دفتر تجربة');
      const exps = db.cats.filter(c => !c.del && c.type === 'exp' && !ADJ_CATS.has(c.id)).map(c => c.id), mk = [];
      const E = [addEntry({party: pc, kind: 'pay', amt: 300000, date: D1, vault: 'v_main', method: 'نقدي'}), addEntry({party: pm, kind: 'pay', amt: 100000, date: D2, vault: 'v_ldg2', method: 'تحويل'}), addEntry({party: ps, kind: 'ppay', amt: 50000, date: D2, vault: 'v_main', method: 'نقدي'})];
      E.forEach(applyAmounts);
      const tx = (o) => { const t = Object.assign({id: newId('t_'), amt: 0, to: '', note: '', at: now, upd: now, del: false, hist: []}, o); db.txs.push(t); IDX.tx.set(t.id, t); mk.push(t); return t; };
      tx({type: 'exp', amt: 20000, vault: 'v_main', cat: exps[0], date: D1}); tx({type: 'exp', amt: 30000, vault: 'v_ldg2', cat: exps[1] || exps[0], date: D3});
      tx({type: 'inc', amt: 40000, vault: 'v_main', cat: 'c_inc2', date: D3}); tx({type: 'tr', amt: 11111, vault: 'v_main', to: 'v_ldg2', date: D2, cat: ''});
      tx({type: 'exp', amt: 999, vault: 'v_main', cat: ensureAdjCat('exp'), date: D2, note: 'جرد تجربة الدفتر'});
      const hasMk = db.vaults.some(v => v.id === 'v_mkt' && !v.del); if (hasMk) { tx({type: 'tr', amt: 77000, vault: 'v_mkt', to: 'v_main', date: D3, cat: ''}); tx({type: 'exp', amt: 6000, vault: 'v_mkt', cat: 'c_mkexp', date: D3, note: 'بنزين دفتر تجربة'}); const ce = addEntry({party: pm, kind: 'pay', amt: 200000, date: D2, vault: 'v_mkt', method: 'نقدي'}); applyAmounts(ce); E.push(ce); }
      saveDB(); window.__ldg = {E, mk, v2, ids: [pc, pm, ps], hasMk};
      return hasMk;
    });
    const ldgOpen = (js) => A.evaluate(js => { cashView = 'date'; cashMode = 'range'; cashFrom = '2001-03-01'; cashTo = '2001-03-03'; cashOpenV = false; go('cash'); renderCash(); return eval(js); }, js);
    const ldgGo = () => { cashView = 'date'; cashMode = 'range'; cashFrom = '2001-03-01'; cashTo = '2001-03-03'; cashOpenV = false; ldgScroll = false; go('cash'); renderCash(); };
    eq('الخزنة بالتاريخ: الأيام الأحدث فوق، التحويل بين خزنتين مش ظاهر وتسوية الجرد سطر رمادي، ومفيش زراير خزن تانية', await ldgOpen(`(() => {
      const ds = [...$$('#fbL .fbd')].map(x => x.dataset.d), tx = $('#fbL').textContent, d2 = $('#fbL .fbd[data-d="2001-03-02"]');
      const rows = [...d2.querySelectorAll('.fbr')].filter(r => r.textContent.includes('عميل سوق دفتر تجربة'));
      return [ds.join(), !tx.includes('تحويل:'), !tx.includes('جرد تجربة الدفتر'), d2.textContent.includes('تسوية جرد'), rows.length, !$('#ldgS'), !$('#ldgF'), !$('#cPer .ksum'), $('#cView button.on').dataset.v];
    })()`), ['2001-03-03,2001-03-02,2001-03-01', true, true, true, 1, true, true, true, 'date']);
    eq('الخزنة بالتاريخ: وارد ومنصرف كل يوم = ورقة الدفتر بالظبط (بطريقتين)، و"قفل اليوم" = الرصيد الحقيقي وراكب ✓', await ldgOpen(`(() => {
      const bal = d => vaultBal('', d) + (window.__ldg.hasMk ? vaultBal('v_mkt', d) : 0), L = ldgItems('2001-03-01', '2001-03-03'), D = fbDays('2001-03-01', '2001-03-03');
      return [D.every(o => o.none || (o.in === ldgSum(L.filter(x => x.m.date === o.d), 'in') && o.out === ldgSum(L.filter(x => x.m.date === o.d), 'out'))),
        $$('#fbL .fbd').length === 3 && [...$$('#fbL .fbd')].every(el => +el.querySelector('.fbf [data-b1]').dataset.b1 === bal(addDays(el.dataset.d, 1)) && el.querySelector('.fbh').textContent.includes(fmtP(bal(el.dataset.d))) && !el.querySelector('.fbf.bad')),
        D.filter(o => !o.none).every(o => o.ok)];
    })()`), [true, true, true]);
    eq('الخزنة بالتاريخ: جوه اليوم الوارد فوق والمنصرف تحته وبينهم خط، في الشاشة والـ PDF', await A.evaluate(ldgGo => {
      eval('(' + ldgGo + ')')();
      const days = [...$$('#fbL .fbd')], ok = days.every(d => { const k = [...d.querySelectorAll('.fbr')].map(r => (r.classList.contains('fbs') ? '|' : '') + (r.querySelector('td:nth-child(2) .n') ? 'i' : 'o')).join(''); return /^i*(\|o+)?$|^o*$/.test(k) && (k.includes('i') && k.includes('o')) === k.includes('|'); });
      const R = ldgReport(ldgItems('2001-03-01', '2001-03-03'), '2001-03-01', '2001-03-03'), seq = R.rows.map(r => r.grp ? 'g' : r.cls.includes('sep') ? 'S' : r.cls.startsWith('pay') ? 'i' : 'o').join('');
      return [days.some(d => d.querySelector('.fbs')), ok, !/o[iS]/.test(seq.replace(/g/g, ' ').split(' ').join('|')) && seq.split('g').every(s => /^i*(So*)?$|^o*$/.test(s))]; }, ldgGo.toString()), [true, true, true]);
    eq('الخزنة بالتاريخ: لما الصفحة تترسم تاني (حركة جديدة فوق) السطر اللي قدامك ميتحركش، والأيام مش بتتقدّر بالتقريب', await A.evaluate(async ldgGo => {
      const now = nowS(), v = vaultsL()[0].id, ids = [];
      const add = (d, k) => { const x = {id: 't_anc' + k, type: 'exp', vault: v, amt: 1000 + k, cat: catsL('exp')[0].id, date: d, note: 'تثبيت ' + k, at: now, upd: now, del: false, hist: []}; db.txs.push(x); IDX.tx.set(x.id, x); ids.push(x.id); };
      for (let k = 0; k < 40; k++) add(k < 20 ? '2001-03-01' : '2001-03-02', k);
      eval('(' + ldgGo + ')')();
      const el0 = [...$$('#fbL [data-ak]')][25]; el0.scrollIntoView({block: 'center'}); await new Promise(r => setTimeout(r, 50));
      const a = ldgAnchor(); for (let k = 40; k < 46; k++) add('2001-03-03', k); renderCash();
      const el = $$('#fbL [data-ak]').find(r => r.dataset.ak === a.k), r = [!!a && !!el && Math.abs(el.getBoundingClientRect().top - a.y) < 2, getComputedStyle($('#fbL .fbd')).contentVisibility !== 'auto'];
      ids.forEach(id => { const x = IDX.tx.get(id); x.del = true; touch(x); }); saveDB(); renderCash(); return r; }, ldgGo.toString()), [true, true]);
    eq('الخزنة: العدسة بتدوّر في كل التواريخ (كل الخزن) بالملاحظة والمبلغ، والدوس بيفتح الحركة', await A.evaluate(() => {
      cashView = 'date'; cashVault = ''; go('cash'); renderCash(); $('#cSrch').click(); const q = $('#csQ'), r = [!!q];
      q.value = 'بنزين دفتر'; q.dispatchEvent(new Event('input')); r.push(window.__ldg.hasMk ? $$('#csR .ldr').length === 1 && $('#csR').textContent.includes('60') : true);
      q.value = 'مورد دفتر تجربة'; q.dispatchEvent(new Event('input')); r.push($$('#csR .ldr').length === 1 && $('#csR .ldr .n.out') !== null);
      q.value = '3,000'; q.dispatchEvent(new Event('input')); r.push($$('#csR .ldr').length >= 1);
      q.value = 'كلمة مش موجودة خالص'; q.dispatchEvent(new Event('input')); r.push($$('#csR .ldr').length === 0);
      q.value = 'مورد دفتر تجربة'; q.dispatchEvent(new Event('input')); $('#csR .ldr').click(); r.push(!!$('#modal h3') && !$('#csQ')); closeModal();
      return r; }), [true, true, true, true, true, true]);
    eq('الخزنة بالتاريخ: زرار "نقلته" و"اعرض اللي لسه" اتشالوا', await ldgOpen(`[!$('#fbL .ldb'), !$('#ldgRest'), !$('#fbL').textContent.includes('نقلت')]`), [true, true, true]);
    eq('الخزنة بالنوع: اتحصّل/اتدفع = وارد/منصرف "بالتاريخ" لنفس الفترة، كل حساب سطر واحد، والدوس على سطر بيفتح حركاته، والدوس على خزنة بيفتح حركاتها من غير ما يغيّر الشاشة', await A.evaluate(() => {
      cashView = 'type'; cashMode = 'range'; cashFrom = '2001-03-01'; cashTo = '2001-03-03'; cashOpenV = true; go('cash'); renderCash();
      const D = fbDays('2001-03-01', '2001-03-03').filter(o => !o.none), cnt = s => Math.round(parseFloat($(s + ' .fbkh .n').textContent.replace(/,/g, '')) * 100);
      const rows = [...$$('#fbIn .fbr')].filter(r => r.textContent.includes('عميل سوق دفتر تجربة')), r = [cnt('#fbIn') === D.reduce((n, o) => n + o.in, 0), cnt('#fbOut') === D.reduce((n, o) => n + o.out, 0), rows.length];
      rows[0].click(); r.push($$('#modal .kit').length); closeModal();
      const v = $('#p-cash .kv[data-v="v_ldg2"]'); v.click(); r.push($$('#modal .kit').length >= 2, cashVault === '', !!$('#fbIn')); closeModal();
      cashOpenV = false; cashView = 'date'; return r; }), [true, true, 1, ldgSetup ? 2 : 0, true, true, true]);
    eq('ورقة الدفتر PDF: عدد عناوين الأيام = الأيام، والمجاميع زي الشاشة', await A.evaluate(ldgGo => {
      eval('(' + ldgGo + ')')();
      const L = ldgItems('2001-03-01', '2001-03-03'), R = ldgReport(L, '2001-03-01', '2001-03-03'), D = fbDays('2001-03-01', '2001-03-03').filter(o => !o.none);
      return [R.rows.filter(x => x.grp !== undefined).length, $$('#fbL .fbd').length, R.sum[0][1] === fmtP(D.reduce((n, o) => n + o.in, 0)), R.sum[1][1] === fmtP(D.reduce((n, o) => n + o.out, 0)), R.fin[1] === fmtP(ldgSum(L, 'in') - ldgSum(L, 'out')), R.cols.length === R.rows.find(x => x.cells).cells.length, R.title]; }, ldgGo.toString()), [3, 3, true, true, true, true, 'دفتر الخزنة']);
    await A.evaluate(ldgGo => eval('(' + ldgGo + ')')(), ldgGo.toString()); await A.settle(200);
    await colOk('الحسابات — الخزنة بالتاريخ (الوارد)', A, '#fbL .fbd', 'tr:not(.fbx) td.c:nth-child(2) .n'); await colOk('الحسابات — الخزنة بالتاريخ (المنصرف)', A, '#fbL .fbd', 'td.c:last-child .n'); await segOk(A, 'الحسابات — الخزنة بالتاريخ');
    await A.evaluate(() => { $('#cPer').classList.add('pk'); }); await A.settle(150); await segOk(A, 'الحسابات — الخزنة بالتاريخ (خانة التاريخ مفتوحة)');
    /* تنضيف بيانات الدفتر والرجوع لـ "بالنوع" */
    await A.evaluate(() => { const g = window.__ldg; [...g.E, ...g.mk].forEach(x => { x.del = true; touch(x); }); g.ids.forEach(i => { P.get(i).del = true; touch(P.get(i)); }); g.v2.del = true; touch(g.v2); cashView = 'type'; cashMode = 'day'; cashDay = ''; cashVault = ''; saveDB(); go('home'); });
    {   // اقفل الخزنة: بس لما رصيدها صفر، وتختفي من الاختيارات وحركاتها القديمة زي ما هي
      const r0 = await A.evaluate(() => { const now = nowS(), v = {id: 'v_tshut', name: 'خزنة تجربة للقفل', open: 0, ord: 9, at: now, upd: now, del: false}; db.vaults.push(v); IDX.vault.set(v.id, v);
        const t = {id: 't_tshut1', type: 'inc', vault: v.id, amt: 70000, cat: catsL('inc')[0].id, date: todayISO(), note: '', at: now, upd: now, del: false, hist: []}; db.txs.push(t); IDX.tx.set(t.id, t); saveDB();
        editVault(v); return [!!$('#evShut'), $('#modal').textContent.includes('حوّل رصيدها'), vaultBal('')]; });
      eq('خزنة فيها فلوس: مفيش زرار قفل، وبيقولك حوّل رصيدها الأول', r0.slice(0, 2), [false, true]);
      const r1 = await A.evaluate(() => { const now = nowS(), t = {id: 't_tshut2', type: 'tr', vault: 'v_tshut', to: vaultsL()[0].id, amt: 70000, date: todayISO(), note: '', at: now, upd: now, del: false, hist: []}; db.txs.push(t); IDX.tx.set(t.id, t); saveDB();
        editVault(IDX.vault.get('v_tshut')); $('#evShut').click();
        return [IDX.vault.get('v_tshut').shut, vaultsL().some(v => v.id === 'v_tshut'), vaultOpts('').includes('v_tshut'), vaultOpts('v_tshut').includes('v_tshut'), $('#modal').textContent.includes('(مقفولة)')]; });
      eq('رصيدها صفر: اتقفلت، ومش في الاختيارات، بس الحركة القديمة عليها بتفضل تختارها، وظاهرة "مقفولة" في الخزن', r1, [true, false, false, true, true]);
      eq('الرصيد الكلي ما اتغيرش بعد القفل', await A.evaluate(() => (window.__vb0 = vaultBal(''))), r0[2]);
      await A.evaluate(() => { closeModal(); go('cash'); renderCash(); }); await A.settle(150);
      eq('الخزنة المقفولة مش ظاهرة في شاشة الخزنة', (await A.textContent('#p-cash')).includes('خزنة تجربة للقفل'), false);
      eq('الخزنة المقفولة مبتتختارش لوحدها (مرتب الشركاء)', await A.evaluate(() => {
        return [openV('v_tshut'), openV(vaultsL()[0].id)]; }), [false, true]);
      {   // فلوس دخلت خزنة مقفولة بعد القفل (زي الوارد قبل التصليح): لازم تبان وتتحوّل، ومتتمسحش
        await A.evaluate(() => { const now = nowS(), t = {id: 't_tshut3', type: 'inc', vault: 'v_tshut', amt: 25000, cat: catsL('inc')[0].id, date: todayISO(), note: '', at: now, upd: now, del: false, hist: []}; db.txs.push(t); IDX.tx.set(t.id, t); IDX.vault.get('v_tshut').gone = 1; saveDB(); closeModal(); go('cash'); renderCash(); });
        await A.settle(150);
        const r = await A.evaluate(() => { const k = $('.kv[data-v="v_tshut"] .kshut'), r = [!!k, vaultOpts('').includes('v_tshut')]; k && k.click(); r.push(!!$('#txV') && $('#txV').value === 'v_tshut' && $('#txTo').value !== 'v_tshut');
          vaultSettings(); r.push($('#modal').textContent.includes('مقفولة وفيها')); editVault(IDX.vault.get('v_tshut')); r.push(!$('#evGone'), $('#modal').textContent.includes('حوّلهم لخزنة تانية'));
          const x = IDX.tx.get('t_tshut3'); x.del = true; touch(x); delete IDX.vault.get('v_tshut').gone; saveDB(); closeModal(); return r; });
        eq('خزنة مقفولة دخلتها فلوس: بتبان في الخزنة بزرار "حوّل رصيدها" اللي بيفتح التحويل منها، وظاهرة في الخزن حتى لو اتمسحت، ومفيش مسح لحد ما تتحوّل', r, [true, true, true, true, true, true]);
      }
      eq('امسح الخزنة المقفولة خالص: بتختفي حتى من قايمة الخزن، والرصيد الكلي والحركات القديمة زي ما هي، والتراجع بيرجّعها', await A.evaluate(() => {
        editVault(IDX.vault.get('v_tshut')); $('#evGone').click(); const r = [!!IDX.vault.get('v_tshut').gone, !$('#modal').textContent.includes('خزنة تجربة للقفل'), vaultBal('') === window.__vb0, !IDX.tx.get('t_tshut1').del, !IDX.vault.get('v_tshut').del];
        $('#toast.act button').click(); r.push(!IDX.vault.get('v_tshut').gone && $('#modal').textContent.includes('خزنة تجربة للقفل')); return r; }), [true, true, true, true, true, true]);
      const r2 = await A.evaluate(() => { editVault(IDX.vault.get('v_tshut')); $('#evShut').click(); const a = vaultsL().some(v => v.id === 'v_tshut');
        ['t_tshut1', 't_tshut2'].forEach(id => { const t = IDX.tx.get(id); t.del = true; touch(t); }); const v = IDX.vault.get('v_tshut'); v.del = true; touch(v); saveDB(); closeModal(); return a; });
      eq('افتح الخزنة تاني بيرجّعها', r2, true);
    }
    {   // جرد الخزنة: ملاحظة العجز، وحركة اتسجلت بعد الجرد بتاريخ قبله بتسأل "كانت معاك؟"
      const r = await A.evaluate(async () => {
        const v = vaultsL()[0].id, b0 = vaultBal(v), n0 = db.txs.length, y = addDays(todayISO(), -3);
        openingModal(); const el = $(`#modal [data-v="${v}"]`); el.value = fmtP(b0 - 70000); $('#opN').value = 'عجز تجربة'; $('#opOk').click();
        const adj = db.txs[db.txs.length - 1], r = [adj.cat === 'c_adj_out' && adj.note.includes('عجز تجربة') && vaultBal(v) === b0 - 70000];
        const add = (type, ans, d = y) => { txModal(type); $('#txA').value = fmtP(50000); $('#txD').value = d; if ($('#txC')) $('#txC').value = catsL(type)[0].id; $('#txV').value = v; $('#txOk').click();
          const asked = !!$('#cnY') && db.txs.length === n1(); if (asked) $(ans ? '#cnY' : '#cnN').click(); return asked; };
        let n1v = db.txs.length; const n1 = () => n1v;
        r.push(add('inc', true), vaultBal(v) === b0 - 70000, db.txs.some(x => x.cfix && x.date === adj.date && x.type === 'exp' && x.amt === 50000));
        n1v = db.txs.length; r.push(add('inc', false, addDays(y, -1)), vaultBal(v) === b0 - 20000);
        n1v = db.txs.length; txModal('exp'); $('#txA').value = fmtP(1000); $('#txD').value = todayISO(); $('#txC').value = catsL('exp')[0].id; $('#txV').value = v; $('#txOk').click(); r.push(!$('#cnY') && db.txs.length === n1v + 1);
        { const cf = db.txs.find(x => x.cfix && !x.del), pf = profitOf(addDays(todayISO(), -30), todayISO()).after; cf.del = true; r.push(profitOf(addDays(todayISO(), -30), todayISO()).after === pf); cf.del = false; }
        db.txs.slice(n0).forEach(x => { x.del = true; touch(x); }); saveDB(); closeModal(); r.push(vaultBal(v) === b0); return r; });
      eq('جرد الخزنة: ملاحظة العجز بتتسجل، والحركة بتاريخ قبل الجرد بتسأل "كانت معاك؟": أيوه = الرصيد بعد الجرد مبيتغيرش، لأ = بيزيد، وحركة النهارده مبتسألش، والأرباح مش متأثرة بالتصحيح', r, [true, true, true, true, true, true, true, true, true]);
    }
    sec('٦) دفعة عميل بتدخل الخزنة');
    await openParty(A, 'عميل تجربة اتنين'); await A.click('#fbPay'); await A.fill('#pyAmt', '70'); await A.click('#pyOk'); await closed(A);
    eq('الدفعة نزلت على العميل', await bal(A, 'عميل تجربة اتنين'), -7000);
    eq('ودخلت خزنة الحسابات', await vbal(A, 'v_main'), 103000);

    sec('٧) كشف الحساب PDF');
    await openParty(A, 'عميل تجربة واحد');
    eq('الزوم: مقفول على الصفحة (viewport)، ومتاح بقرص إصبعين على جدول الكشف بس', await A.evaluate(() => {
      const pt = (x, y) => new Touch({identifier: x, target: w, clientX: x, clientY: y}), w = $('.ldgw'), fire = (t, ts, el) => (el || w).dispatchEvent(new TouchEvent(t, {touches: ts, bubbles: true, cancelable: true}));
      const meta = document.querySelector('meta[name=viewport]').content, lz = () => +getComputedStyle(document.documentElement).getPropertyValue('--lz') || 1;
      fire('touchstart', [pt(100, 100), pt(200, 100)]); fire('touchmove', [pt(50, 100), pt(250, 100)]); const onTable = lz(); fire('touchend', []);
      fire('touchstart', [pt(100, 100), pt(200, 100)], document.body); fire('touchmove', [pt(50, 100), pt(250, 100)], document.body); fire('touchend', [], document.body);
      return [/user-scalable=no/.test(meta), onTable > 1.5 && onTable <= 2.5, lz() === onTable]; }), [true, true, true]);
    await A.evaluate(() => { location.hash = '#x'; history.back(); }); await A.settle(200);
    await A.click('#fbStmt');
    await A.evaluate(() => { window.__sh = null; navigator.canShare = () => true; navigator.share = d => { window.__sh = d; return Promise.resolve(); }; });
    await A.click('#smShare'); await A.waitForFunction(() => window.__sh, null, {timeout: 90000});
    eq('الواتساب: الملف بس باسم الشخص ومن غير رسالة مكتوبة', await A.evaluate(() => [Object.keys(__sh), __sh.files[0].name, __sh.files[0].type]), [['files'], 'عميل تجربة واحد.pdf', 'application/pdf']);
    await A.evaluate(() => { navigator.canShare = () => false; });
    await A.settle(300); if (!(await A.$('#smShare'))) await A.click('#fbStmt');
    await A.evaluate(() => { window.__dn = ''; const o = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) window.__dn = this.download; return o.call(this); }; });
    const [dl] = await Promise.all([A.waitForEvent('download', {timeout: 90000}), A.click('#smShare')]);
    eq('لو الجهاز مبيدعمش المشاركة الملف بينزل باسم الشخص', await A.evaluate(() => __dn), 'عميل تجربة واحد.pdf');
    const pdf = fs.readFileSync(await dl.path());
    eq('الـ PDF اتعمل', pdf.slice(0, 4).toString(), '%PDF');
    /* آخر فاتورة بس: بنودها والإجمالي من غير الرصيد اللي قبلها، والكشف زي ما هو */
    await A.evaluate(() => closeModal()); await A.click('#fbStmt'); await A.settle(150);
    eq('الكشف لسه بيفتح على آخر فاتورة بالرصيد اللي قبلها', [await A.getAttribute('#smMode .on', 'data-m'), (await A.textContent('#smOut')).includes('الرصيد قبل الفاتورة')], ['last', true]);
    await A.click('#smInv'); await A.settle(150);
    eq('آخر فاتورة بس: إجماليها = إجمالي آخر فاتورة', await A.evaluate(() => { const p = liveParties().find(x => x.name === 'عميل تجربة واحد'), l = partyEntries(p.id).filter(e => e.kind === 'inv').pop(); return $('#modal .stm .k b').textContent === fmtP(docTotal(l)); }), true);
    eq('صفحة الفاتورة: من غير رصيد سابق ولا دفعات ولا عمود رصيد', await A.evaluate(() => { const p = liveParties().find(x => x.name === 'عميل تجربة واحد'), l = partyEntries(p.id).filter(e => e.kind === 'inv').pop();
      const pg = buildStmtPages(p, invOnlyData(p, l))[0], r = [pg.querySelector('h3').textContent, pg.querySelectorAll('thead th').length, pg.querySelectorAll('tbody tr').length === rowsOf(l).length, !pg.textContent.includes('الرصيد قبل'), !pg.textContent.includes('دفعة'), pg.querySelector('.sum b').textContent.includes(fmtP(docTotal(l)))]; $('#render').innerHTML = ''; return r; }), ['فاتورة', 5, true, true, true, true]);
    await A.evaluate(() => { window.__sh = null; navigator.canShare = () => true; navigator.share = d => { window.__sh = d; return Promise.resolve(); }; });
    await A.click('#ivShare'); await A.waitForFunction(() => window.__sh, null, {timeout: 90000});
    eq('واتساب الفاتورة: الملف بس واسمه "فاتورة" + اسم الشخص', await A.evaluate(() => [Object.keys(__sh), __sh.files[0].name]), [['files'], 'فاتورة عميل تجربة واحد.pdf']);
    /* إذن الاستلام: البنود والعدد من غير أسعار ومكان الإمضاء، باللوجو أو سادة من غير أي حاجة تخص الشركة */
    eq('إذن الاستلام: البنود والعدد بس من غير أسعار، ومكان إمضاء المستلم، والسادة من غير لوجو ولا اسم الشركة', await A.evaluate(() => { const p = liveParties().find(x => x.name === 'عميل تجربة واحد'), l = partyEntries(p.id).filter(e => e.kind === 'inv').pop(), r = [];
      [false, true].forEach(plain => { const pg = buildRcvPages(p, l, plain)[0], t = pg.textContent;
        r.push(pg.querySelector('h3').textContent === 'إذن استلام', pg.querySelectorAll('tbody tr').length === l.lines.length, pg.querySelectorAll('thead th').length === 4, !t.includes(fmtP(docTotal(l))) && !l.lines.some(x => +x.price && t.includes(fmtP(x.price))), t.includes('اسم المستلم') && t.includes('التوقيع'),
          !!pg.querySelector('img') === !plain, t.includes('جَدة') === !plain); });
      $('#render').innerHTML = ''; return r; }), Array(14).fill(true));
    await A.click('#fbStmt'); await A.settle(150); await A.click('#smInv'); await A.settle(150); await A.click('#ivRcv'); await A.settle(150); await A.click('#rcvKind [data-v="1"]');
    await A.evaluate(() => { window.__sh = null; }); await A.click('#rcShare'); await A.waitForFunction(() => window.__sh, null, {timeout: 90000});
    eq('واتساب إذن الاستلام: الملف اسمه "إذن استلام" + اسم الشخص', await A.evaluate(() => __sh.files[0].name), 'إذن استلام عميل تجربة واحد.pdf');

    sec('٧ب) نقل فواتير الحساب الفرعي لحسابه الأساسي ');
    await A.evaluate(() => closeModal());
    const [fwM, fwS] = await A.evaluate(() => { const now = Date.now(), mk = (name, noTot) => { const p = {id: newId('p_'), sec: 'site', name, phone: '', note: '', noTot, at: now, upd: now, del: false}; db.parties.push(p); P.set(p.id, p); return p.id; };
      const m = mk('حساب أساسي تجربة', false), s = mk('فرع تجربة', true); P.get(s).fwd = m; saveDB(); return [m, s]; });
    await A.evaluate(id => go('p/' + id), fwS); await A.settle(200);
    await A.click('#fbDoc'); await A.fill('.li [data-f=name]', 'صنف فرع تجربة'); await A.fill('.li [data-f=qty]', '2'); await A.fill('.li [data-f=price]', '100'); await A.click('#dcOk'); await closed(A); await A.settle(200);
    const fwInv = await A.evaluate(id => partyEntries(id).find(e => e.kind === 'inv').id, fwS);
    eq('الفرعي: شريط "لسه 1" وعلامة "لسه متنقلتش" على الفاتورة، والأساسي لسه صفر', [(await A.textContent('.fwbar')).includes('لسه: 1'), (await A.textContent('#p-party .ldg')).includes('⏳ متنقلتش'), await A.evaluate(id => balance(id), fwM)], [true, true, 0]);
    await A.click('#fwAll'); await A.click('#cOk'); await A.settle(300);
    eq('بعد النقل: الفاتورة كاملة في الأساسي، وفاضلة في الفرعي بعلامة "اتنقلت"', await A.evaluate(([m, s, id]) => { const c = E.get('e_fw_' + id); return [balance(m), balance(s), c.lines[0].name, c.party === m, fwState(E.get(id)), $('.fwbar').textContent.includes('اتنقلت: 1'), $('#p-party .ldg').textContent.includes('✓ اتنقلت'), !$('#fwAll')]; }, [fwM, fwS, fwInv]), [20000, 20000, 'صنف فرع تجربة', true, 'ok', true, true, true]);
    eq('الفرعي برا الإجماليات والأساسي جواها (مفيش حساب مرتين)', await A.evaluate(([m, s]) => { const b = allBalances(); return [P.get(s).noTot, b.get(m)]; }, [fwM, fwS]), [true, 20000]);
    await A.evaluate(id => openEntry(P.get(E.get(id).party), E.get(id)), fwInv); await A.settle(150);
    eq('جوه الفاتورة: مكتوب إنها اتنقلت', (await A.textContent('#modal .fwbox')).includes('اتنقلت للحساب الأساسي'), true);
    await A.fill('.li [data-f=qty]', '3'); await A.click('#dcOk'); await closed(A); await A.settle(200);
    eq('لو الأصل اتعدل: "اتعدلت بعد النقل" والأساسي لسه بالقديم', [await A.evaluate(id => fwState(E.get(id)), fwInv), (await A.textContent('#p-party .ldg')).includes('⚠ اتعدلت'), await A.evaluate(id => balance(id), fwM)], ['chg', true, 20000]);
    await A.evaluate(id => openEntry(P.get(E.get(id).party), E.get(id)), fwInv); await A.settle(150); await A.click('#fwOne'); await A.settle(250);
    eq('"انقل التعديل": الأساسي اتعدل ومفيش نسخة مكررة', await A.evaluate(([m, id]) => [balance(m), fwState(E.get(id)), db.entries.filter(e => e.fwFrom === id).length], [fwM, fwInv]), [30000, 'ok', 1]);
    await A.evaluate(id => cancelEntry(E.get('e_fw_' + id)), fwInv); await A.settle(200);
    eq('لو اتلغت من الأساسي: ترجع "لسه متنقلتش"', await A.evaluate(([m, id]) => [balance(m), fwState(E.get(id))], [fwM, fwInv]), [0, 'no']);
    /* فاتورة كانت اتنقلت بإيده قبل الزرار: بيعرفها من التاريخ والبنود، ومبيعملش نسخة تانية */
    const [fwA, fwB, fwMan] = await A.evaluate(([m, s]) => { const mk = (party, qty, d) => { const e = addEntry({party, kind: 'inv', date: d, lines: [{name: 'صنف يدوي تجربة', unit: 'لفة', qty, price: 5000}]}); applyAmounts(e); return e.id; };
      const a = mk(s, 4, '2026-03-03'), b = mk(s, 6, '2026-03-04'), man = mk(m, 4, '2026-03-03'); mk(m, 7, '2026-03-04'); saveDB(); return [a, b, man]; }, [fwM, fwS]);
    await A.evaluate(id => go('p/' + id), fwS); await A.settle(250);
    eq('بيعرف الفاتورة المنقولة بإيده من التاريخ والبنود (واللي بنودها مختلفة لسه)', await A.evaluate(([a, b, man]) => [fwState(E.get(a)), fwState(E.get(b)), E.get(man).fwFrom === a], [fwA, fwB, fwMan]), ['ok', 'no', true]);
    const nM0 = await A.evaluate(m => partyEntries(m).filter(e => e.kind === 'inv').length, fwM);
    await A.click('#fwAll'); await A.click('#cOk'); await A.settle(300);
    eq('"انقل اللي لسه" مبيكررش اليدوية (اتنقلت بس اللي لسه)', await A.evaluate(([m, a, b]) => [partyEntries(m).filter(e => e.kind === 'inv').length, fwState(E.get(a)), fwState(E.get(b))], [fwM, fwA, fwB]), [nM0 + 2, 'ok', 'ok']);
    await A.evaluate(([a]) => { const e = E.get(a); e.lines[0].qty = 5; applyAmounts(e); touch(e); saveDB(); route(); }, [fwA]); await A.settle(200);
    eq('تعديل الأصل: "اتعدلت"، و"انقل التعديل" بيعدّل اليدوية نفسها', await A.evaluate(([s, a, man, m]) => { const st = fwState(E.get(a)); fwMove(P.get(s), E.get(a)); return [st, E.get(man).dr, db.entries.filter(x => x.fwFrom === a && !x.del).length, !E.get('e_fw_' + a)]; }, [fwS, fwA, fwMan, fwM]), ['chg', 25000, 1, true]);
    const fwC = await A.evaluate(s => { const e = addEntry({party: s, kind: 'inv', date: '2026-03-09', lines: [{name: 'صنف مكتوب مختلف', unit: 'لفة', qty: 1, price: 1000}]}); applyAmounts(e); saveDB(); return e.id; }, fwS);
    await A.evaluate(id => openEntry(P.get(E.get(id).party), E.get(id)), fwC); await A.settle(150); await A.click('#fwMk'); await A.settle(250);
    eq('"دي متنقلة بالفعل": بقت اتنقلت من غير ما تتنسخ', await A.evaluate(([m, c]) => [fwState(E.get(c)), db.entries.some(x => x.fwFrom === c), !E.get('e_fw_' + c)], [fwM, fwC]), ['ok', false, true]);
    await A.evaluate(id => openEntry(P.get(E.get(id).party), E.get(id)), fwC); await A.settle(150); await A.click('#fwUn'); await A.settle(250);
    eq('"رجّعها متنقلتش" بترجّعها', await A.evaluate(c => fwState(E.get(c)), fwC), 'no');
    /* المسح من الفرعي: المنقولة تتمسح عادي من غير تحذير والأساسي زي ما هو، واللي لسه متنقلتش تحذير مرة واحدة وقت المسح */
    const mBal = await A.evaluate(m => balance(m), fwM);
    await A.evaluate(a => { cancelEntry(E.get(a)); }, fwA); await A.settle(250);
    eq('مسح فاتورة منقولة: من غير سؤال، والأساسي زي ما هو، ومفيش تحذير فاضل', await A.evaluate(([a, m]) => [E.get(a).del, !$('#cOk'), balance(m), $('.fwbar').textContent.includes('اتلغت')], [fwA, fwM]), [true, true, mBal, false]);
    await A.evaluate(c => { cancelEntry(E.get(c)); }, fwC); await A.settle(200);
    eq('مسح فاتورة لسه متنقلتش: بيسأل الأول', [(await A.textContent('#modal')).includes('لسه متنقلتش'), await A.evaluate(c => E.get(c).del, fwC)], [true, false]);
    await A.click('#cNo'); await A.settle(150);
    eq('"إلغاء" = الفاتورة فاضلة', await A.evaluate(c => E.get(c).del, fwC), false);
    await A.evaluate(c => { cancelEntry(E.get(c)); }, fwC); await A.settle(200); await A.click('#cOk'); await A.settle(250);
    eq('"امسحها" = اتمسحت', await A.evaluate(c => E.get(c).del, fwC), true);
    const fwA2 = await A.evaluate(([s, a]) => { const o = E.get(a), e = addEntry({party: s, kind: 'inv', date: o.date, lines: JSON.parse(JSON.stringify(o.lines))}); applyAmounts(e); saveDB(); route(); return e.id; }, [fwS, fwA]); await A.settle(250);
    eq('فاتورة جديدة بنفس التاريخ والبنود بعد المسح: بتتعرف "اتنقلت" على نفس اللي في الأساسي (من غير تكرار)', await A.evaluate(([a2, m, b]) => [fwState(E.get(a2)), balance(m)], [fwA2, fwM, mBal]), ['ok', mBal]);
    await A.evaluate(([m, s]) => { [m, s].forEach(id => partyEntries(id).forEach(e => { e.del = true; e.delAt = Date.now(); touch(e); })); saveDB(); }, [fwM, fwS]);
    await openParty(A, 'عميل تجربة واحد');
    eq('باقي العملا مفيهمش الشريط ولا العلامات', [await A.$('.fwbar'), (await A.textContent('#p-party .ldg')).includes('متنقلتش')], [null, false]);
    await A.evaluate(([m, s, id]) => { const e = E.get(id); e.del = true; e.delAt = Date.now(); touch(e); [m, s].forEach(x => { P.get(x).del = true; touch(P.get(x)); }); saveDB(); }, [fwM, fwS, fwInv]);

    sec('٨) التقارير');
    await A.evaluate(() => go('rep')); await A.settle(200);
    const R = await A.evaluate(() => { repKind = 'debt'; repSide = 'mkt'; return buildReport(); });
    eq('رصيد العملاء في التقرير = مجموع أرصدة العملاء', R.fin[1], await A.evaluate(() => fmtP(liveParties().filter(p => p.sec === 'mkt' && !p.noTot).reduce((n, p) => n + balance(p.id), 0))));
    eq('المسحوبات − المدفوعات = الرصيد', await A.evaluate(() => { const s = stmtData(liveParties().find(x => x.name === 'عميل تجربة واحد').id, '', ''); return s.tg - s.tp === s.close; }), true);
    eq('ملخص فوق كشف المورد بس', await A.evaluate(() => { const ps = liveParties(); const sup = ps.find(p => p.sec === 'sup'), cu = ps.find(p => p.sec === 'mkt');
      const a = buildStmtPages(sup, stmtData(sup.id, '', ''))[0].querySelector('.sbox'), b = buildStmtPages(cu, stmtData(cu.id, '', ''))[0].querySelector('.sbox'); $('#render').innerHTML = ''; return [!!a, !!b]; }), [true, false]);
    eq('كشف المورد لفترة قصيرة: المربعات اللي فوق = كل التعامل من أوله مش الفترة بس', await A.evaluate(() => { const sup = liveParties().find(p => p.sec === 'sup'), all = stmtData(sup.id, '', ''), per = stmtData(sup.id, '2099-01-01', '2099-01-31');
      const bx = buildStmtPages(sup, Object.assign(per, {to: todayISO()}))[0].querySelectorAll('.sbox b'); $('#render').innerHTML = ''; return [...bx].map(b => b.textContent).concat(per.tg); }), [await A.evaluate(() => { const s = stmtData(liveParties().find(p => p.sec === 'sup').id, '', ''); return fmtP(s.tg); }), await A.evaluate(() => { const s = stmtData(liveParties().find(p => p.sec === 'sup').id, '', ''); return fmtP(s.tp); }), await A.evaluate(() => { const s = stmtData(liveParties().find(p => p.sec === 'sup').id, '', ''); return fmtP(s.close * s.sg); }), 0]);
    eq('حساب جديد: المورد "ليه" والعميل "عليه" لوحدهم، ولو دوست بنفسك اختيارك بيفضل', await A.evaluate(() => { partyModal(); const on = () => $('#pmDir button.on').dataset.v, r = [];
      const sb = k => $(`#pmSec button[data-v="${k}"]`).click();
      sb('sup'); r.push(on()); sb('mkt'); r.push(on()); $('#pmDir button[data-v="cr"]').click(); sb('sup'); sb('mkt'); r.push(on()); closeModal(); return r; }), ['cr', 'dr', 'cr']);

    sec('٩) قفل الفترة');
    await A.click('#bSet:visible, nav button[data-go=set]:visible'); await A.evaluate(() => setOpenAll()); await A.fill('#sLockD', await A.evaluate(() => todayISO())); await A.click('#sLockGo'); await A.click('#cOk'); await A.settle(200);   // النهارده بتاع البرنامج وقت القفل نفسه (لو الاختبار عدّى 12 بالليل)
    await openParty(A, 'عميل تجربة واحد'); await A.click('#fbPay'); await A.fill('#pyAmt', '1'); await A.click('#pyOk'); await A.settle(150);
    eq('مينفعش تسجل في فترة مقفولة', (await A.textContent('#toast')).includes('مقفولة'), true); await A.click('#pyX');
    await A.click('#bSet:visible, nav button[data-go=set]:visible'); await A.evaluate(() => setOpenAll()); await A.click('#sUnlock'); await A.fill('#apP', PASS); await A.click('#apOk'); await A.settle(600);

    }
    if (RUN.sync) {   // ← وضع الشكل (smoke) بيتخطى ١٠ لحد ٢٢
    sec('١٠) المزامنة مع الشيت وجهاز تاني');
    await A.click('#bSet:visible, nav button[data-go=set]:visible'); await A.waitForSelector('#sSheet details.adv', {state: 'attached'}); await A.evaluate(() => setOpenAll()); await A.fill('#shUrl', ACC_URL); await A.click('#sSheet details.fld summary'); await A.fill('#shKey', KEY); await A.click('#shSave'); await A.settle(300);
    await A.click('#shHelp'); await A.click('#hpCopy'); const accCode = await A.evaluate(() => navigator.clipboard.readText()); sheets.acc.load(accCode); await A.click('#hpX');
    eq('كود الشيت مفيهوش المفتاح', accCode.includes(KEY), false);
    eq('رقم تعريف النشر بيتحول للينك', await A.evaluate(() => normSheetUrl(' AKfycbxTEST1234567890abcdefghij ')), 'https://script.google.com/macros/s/AKfycbxTEST1234567890abcdefghij/exec');
    await A.click('#shSave'); await A.settle(4000);
    eq('الشيت مقفول من غير المفتاح', JSON.parse(sheets.acc.get()).ok, false);
    eq('الشيت اتقفل على أول مفتاح', JSON.parse(sheets.acc.post(JSON.stringify({key: 'Other-Key-123', action: 'ping'}))).error, 'key');
    eq('الشيت بيرفض مفتاح غلط', JSON.parse(sheets.acc.post(JSON.stringify({key: 'x', action: 'pull'}))).error, 'key');
    D2 = await newDevice(browser, base, sheets); B = await D2.page('accounts.html');
    await unlock(B, true);
    await B.click('#bSet:visible, nav button[data-go=set]:visible'); await B.waitForSelector('#sSheet details.adv', {state: 'attached'}); await B.evaluate(() => setOpenAll()); await B.fill('#shUrl', ACC_URL); await B.click('#sSheet details.fld summary'); await B.fill('#shKey', KEY); await B.click('#shSave'); await B.settle(4000);
    if (MO) await A.evaluate(() => { const now = Date.now(), p = {id: newId('p_'), sec: 'mkt', name: 'عميل ترتيب تجربة', phone: '', note: '', noTot: false, at: now, upd: now, del: false}; db.parties.push(p); P.set(p.id, p); saveDB(); });
    if (RUN.base) {   // ← وضع الشكل بيتخطى باقي ١٠ لحد ١٤
    const snap = X => X.evaluate(() => [liveParties().map(p => balance(p.id)).sort(), vaultBal(''), selfCheck().length]);
    eq('الجهاز التاني نزل نفس الأرصدة', await snap(B), await snap(A));
    await bg(B, 'syncNow()'); await bg(A, 'syncNow()'); await A.settle(1500);
    const rows = sheets.acc.sheets['السجلات'].rows.slice(1).map(r => r[0]);
    eq('مفيش سجلات متكررة في الشيت', new Set(rows).size, rows.length);
    const link = await A.evaluate(() => joinLink());
    eq('رابط الربط مفيهوش المفتاح مكشوف', link.includes('Test-Key'), false);
    const D3 = await newDevice(browser, base, sheets), J = await D3.page('accounts.html' + link.slice(link.indexOf('#')));
    await unlock(J, true); await J.settle(5000);
    eq('جهاز جديد برابط الربط بس نزلت عليه كل الحسابات', await snap(J), await snap(A));
    eq('الجهاز الجديد فضل مربوط', await J.evaluate(() => db.cfg.sheetOk), true);
    eq('الرابط اتشال من شريط العنوان', J.url().includes('join'), false);
    await A.click('#bSet:visible, nav button[data-go=set]:visible'); await A.evaluate(() => setOpenAll()); await A.click('#shAudit'); await A.settle(3000);
    eq('مراجعة الجهاز مع الشيت متطابقة', (await A.textContent('#modal .sync')).includes('متطابقين ('), true); await A.click('#saX');
    {   // جوجل رد بصفحة خطأ مرة: البرنامج بيعيد لوحده ويكمّل، وعدد "مستني" في الإعدادات بيتحدث بعد المزامنة
      await A.evaluate(() => { const p = liveParties()[0]; p.note = 'تجربة صفحة جوجل'; p.upd = nowS(); saveDB(); renderSettings(); });
      eq('الإعدادات بتقول 1 مستني', (await A.textContent('#sStat')).includes('1 مستني'), true);
      await A.evaluate(() => clearTimeout(syncT)); await A.waitForFunction(() => !syncing);   // مزامنة الخلفية بعد الحفظ (schedSync) لو اشتغلت الأول، syncNow(true) بيرجع على طول من غير رسالة
      D1.pageOnce = 1; await A.evaluate(() => syncNow(true));
      await A.waitForFunction(() => !syncing && !pendingRecs().length);
      eq('صفحة خطأ من جوجل مرة: اتعادت لوحدها والمزامنة نجحت', [D1.pageOnce, await A.evaluate(() => syncErr), (await A.textContent('#toast')).includes('✔')], [0, '', true]);
      eq('بعد المزامنة "مستني" اختفت من الإعدادات من غير ما تخرج وترجع', [(await A.textContent('#sStat')).includes('مستني'), await A.textContent('#shNow')], [false, 'زامن دلوقتي (0 مستني)']);
      await A.evaluate(() => { const p = liveParties()[0]; p.note = 'تجربة صفحة جوجل ٢'; p.upd = nowS(); saveDB(); });
      D1.pageOnce = 3; await A.evaluate(() => syncNow(true));
      await A.waitForFunction(() => !syncing && syncErr);
      const st3 = await A.textContent('#sStat');
      eq('جوجل فضل يرد بصفحة: الإعدادات بتقول موصلتش وبتعرض كلام جوجل نفسه، والحركة لسه مستنية', [st3.includes('موصلتش'), st3.includes('جوجل كاتب: Google error'), st3.includes('1 مستني'), D1.pageOnce], [true, true, true, 0]);
      await A.evaluate(() => syncNow(true)); await A.waitForFunction(() => !syncing && !pendingRecs().length);
      eq('المرة اللي بعدها نجحت: رجعت ✔ متزامن', (await A.textContent('#sStat')).includes('✔ متزامن'), true);
      eq('رسالة صفحة جوجل لشيت كان شغال: مشغول لحظة مش تسجيل دخول', await A.evaluate(() => { const e = new Error('page'); e.code = 'page'; return netWhy(e); }), 'جوجل كان مشغول لحظة، وهحاول تاني لوحدي');
    }

    sec('١٠ج) كود الشيت الأساسي والنسخة الاحتياطية المنفصلة، والمزامنة بدفعات');
    /* الكود الأساسي لوحده من غير أي خدمة درايف: لازم يشتغل ومفيهوش DriveApp ولا ScriptApp */
    const mainCode = await A.evaluate(() => scriptFor()), bkCode = await A.evaluate(() => backupScript());
    const G = makeGas({noDrive: true}); G.load(mainCode);
    const gp = o => JSON.parse(G.post(JSON.stringify(Object.assign({key: 'Some-Key-1234'}, o))));
    eq('الكود الأساسي مفيهوش درايف ولا مؤقّت، وبيشتغل من غيرهم', [/DriveApp|ScriptApp|dailyBackup/.test(mainCode), gp({action: 'ping'}).ok, gp({action: 'push', rows: [{id: 'x1', kind: 'tx', upd: 5, view: [], data: {a: 1}}]}).ack], [false, true, ['x1']]);
    const G2 = makeGas(); G2.load(mainCode);
    let clash = ''; try { G2.load(bkCode); } catch (e) { clash = String(e); }
    eq('ملف النسخة الاحتياطية مبيتعارضش مع الأساسي (مفيش SHEET مكرر)', [clash, /\bSHEET\b|\bHEAD\b|\bW\b|sh_|key_|out_/.test(bkCode)], ['', false]);
    G2.ctx.bkpSetup(); G2.ctx.bkpSetup(); for (let i = 0; i < 32; i++) G2.ctx.bkpRun();
    eq('النسخة الاحتياطية: مؤقّت واحد وفولدر واحد وآخر 30 بس', [G2.triggers, G2.folders.length, G2.folders[0].files.filter(f => !f.trashed).length], [['bkpRun'], 1, 30]);
    eq('الكود الأساسي لسه شغال بعد إضافة النسخة الاحتياطية', JSON.parse(G2.post(JSON.stringify({key: 'Some-Key-1234', action: 'ping'}))).ok, true);

    /* كود الشيت نسخة 2 قدام نسخة 1 القديمة (tests/fixtures) بآلاف السطور: نفس الطلبات = نفس الردود ونفس الشيت بالظبط، والقراية من الشيت أقل بكتير */
    const oldAcc = fs.readFileSync(path.join(__dirname, 'fixtures/acc-sheet-v1.gs'), 'utf8');
    const GN = makeGas({noDrive: true}), GO = makeGas({noDrive: true}); GN.load(mainCode); GO.load(oldAcc);
    const cost = {old: {}, neu: {}}, diff = [];
    const both = (tag, o) => {
      const b = JSON.stringify(Object.assign({key: 'Bench-Key-1234'}, o)), c0 = GO.reads.cells, c1 = GN.reads.cells;
      const a = JSON.parse(GO.post(b)), n = JSON.parse(GN.post(b));
      if (typeof n.t !== 'number' || n.t < 1e12) diff.push(tag + ': مفيش وقت الشيت t'); delete n.t; delete a.t;   // وقت الشيت (t) جديد في النسخة 3
      cost.old[tag] = (cost.old[tag] || 0) + GO.reads.cells - c0; cost.neu[tag] = (cost.neu[tag] || 0) + GN.reads.cells - c1;
      const nv = Object.assign({}, n); if (o.action === 'pull') { if (nv.v !== 3) diff.push(tag + ': مفيش v'); delete nv.v; }
      if (o.action === 'ping') { delete a.v; ['v', 'seq', 'url'].forEach(k => delete nv[k]); }   // ping الجديد بيزود النسخة ولينك الجدول بس
      if (JSON.stringify(a) !== JSON.stringify(nv)) diff.push(tag);
      return n;
    };
    const benchRow = (i, upd, del) => ({id: 'e_b' + i, kind: i % 9 ? 'entry' : 'tx', upd, del: !!del, view: ['2026-01-' + String(1 + i % 28).padStart(2, '0'), 'عميل تجربة ' + (i % 60), 'عملاء', 'بيان تجربة ' + i, (i * 37 % 5000) + '.25', ''], data: {party: 'p_b' + (i % 60), dr: i * 3725, date: '2026-01-01', desc: 'حركة تجربة '.repeat(1 + i % 6), hist: []}});
    const N = 6000;
    for (let i = 0; i < N; i += 500) both('push', {action: 'push', rows: Array.from({length: 500}, (_, k) => benchRow(i + k, 1000 + i + k))});
    const pullAll = (tag, since) => { const out = []; let more = true, nx = since, pages = 0; while (more && pages++ < 50) { const j = both(tag, {action: 'pull', since: nx}); out.push(...j.rows); nx = j.next; more = j.more; } return {out, nx, pages}; };
    const full = pullAll('pull0', 0);
    const seqNow = Number(GN.props.SEQ);
    both('idle', {action: 'pull', since: seqNow});
    /* تعديلات متفرقة على الشيت كله (منها القديم اللي لازم يتجاهل، ومتكرر في نفس الدفعة) + حركات جديدة */
    const ed = [];
    for (let k = 0; k < 25; k++) ed.push(benchRow(k * 233, k % 5 ? 900000 + k : 5, k % 7 === 0));
    ed.push(benchRow(466, 900500)); ed.push(benchRow(466, 900400));
    for (let k = 0; k < 30; k++) ed.push(benchRow(N + k, 950000 + k));
    ed.push(benchRow(N + 3, 960000));
    both('push2', {action: 'push', rows: ed});
    const inc = pullAll('pull1', seqNow);
    both('ping', {action: 'ping'});
    const shOf = G => JSON.stringify(G.sheets['السجلات'].rows);
    eq('كود الشيت الجديد: بآلاف السطور نفس الردود بالظبط زي القديم، ونفس الشيت خانة بخانة، ونفس الرقم', [diff, shOf(GN) === shOf(GO), GN.props.SEQ === GO.props.SEQ, full.out.length, full.pages, inc.out.length, new Set(inc.out.map(r => r.id)).size],
      [[], true, true, N, 4, 25 - 5 + 30, 25 - 5 + 30]);
    const pp = JSON.parse(GN.post(JSON.stringify({key: 'Bench-Key-1234', action: 'ping'})));
    eq('ping الجديد بيقول النسخة 3 ولينك الجدول نفسه، والقديم نسخة 1', [pp.v, pp.url, pp.n, JSON.parse(GO.post(JSON.stringify({key: 'Bench-Key-1234', action: 'ping'}))).v], [3, 'https://docs.google.com/spreadsheets/d/ss1/edit', N + 30, 1]);
    console.log('     خانات اتقرت من الشيت (القديم ← الجديد):', Object.keys(cost.old).map(k => `${k}: ${cost.old[k]} ← ${cost.neu[k]}`).join(' | '));
    eq('السحب لو مفيش جديد مبيقراش ولا خانة، والسحب العادي والكامل والإرسال أخف بكتير', [cost.neu.idle, cost.neu.pull1 * 8 < cost.old.pull1, cost.neu.pull0 * 2 < cost.old.pull0, cost.neu.push * 2 < cost.old.push, cost.neu.push2 * 2 < cost.old.push2], [0, true, true, true, true]);

    /* جهاز بالبرنامج الجديد على شيت لسه عليه الكود القديم: بيتزامن عادي، وبيظهر تحذير أصفر وزرار التحديث بخطوات من جوه الجدول */
    const GOLD = makeGas(), accNew = sheets.acc; GOLD.load(oldAcc);
    GOLD.sheets['السجلات'] = accNew.sheets['السجلات']; Object.assign(GOLD.props, accNew.props);
    sheets.acc = GOLD;
    await A.evaluate(() => { const now = Date.now(), r = {id: 't_oldsheet', type: 'exp', amt: 700, vault: 'v_main', to: '', cat: 'c_exp0', note: 'كود قديم', date: todayISO(), at: now, upd: now, del: true, hist: []}; db.txs.push(r); IDX.tx.set(r.id, r); saveDB(); });
    await bg(A, 'syncNow()'); await A.settle(500);
    eq('شيت بالكود القديم: المزامنة شغالة عادي والتحذير الأصفر ظاهر', await A.evaluate(() => [syncErr, pendingRecs().length, db.cfg.accV, $('#syncBox').classList.contains('warn'), !!$('#syUpd')]), ['', 0, 1, true, true]);
    eq('الحركة وصلت الشيت القديم', GOLD.sheets['السجلات'].rows.some(r => r[0] === 't_oldsheet'), true);
    await A.click('#bSet:visible, nav button[data-go=set]:visible'); await A.evaluate(() => setOpenAll()); await A.settle(800);
    eq('الإعدادات: تحذير "الكود قديم" وزرار ثابت "تحديث كود شيت الحسابات"', [!!(await A.$('#accOld')), (await A.textContent('#shUpd')).includes('تحديث كود شيت الحسابات')], [true, true]);
    await A.click('#shUpd'); await A.settle(150);
    eq('خطوات التحديث من جوه الجدول: إزاي تعرفه (بدون عنوان، ورقة السجلات جنب الورقة1، العناوين) ولينك الجدول نفسه', await A.evaluate(() => { const t = $('#modal').textContent; return [t.includes('الإضافات (Extensions)'), t.includes('جدول بيانات بدون عنوان'), t.includes('السجلات') && t.includes('الورقة1') && t.includes('رقم المزامنة'), t.includes('New version'), !!$('#modal a[href*="docs.google.com/spreadsheets/d/ss1"]')]; }), [true, true, true, true, true]);
    await A.click('#auCopy'); const updCode = await A.evaluate(() => navigator.clipboard.readText()); await A.click('#auX');
    eq('زرار "انسخ الكود" بينسخ الكود الجديد نفسه (من غير أي إذن زيادة)', [updCode === mainCode, /DriveApp|ScriptApp|UrlFetchApp/.test(updCode)], [true, false]);
    accNew.sheets['السجلات'] = GOLD.sheets['السجلات']; Object.assign(accNew.props, GOLD.props); sheets.acc = accNew;   // "حدّث" الكود
    await bg(A, 'syncNow()'); await A.evaluate(() => renderSettings()); await A.settle(800);
    eq('بعد التحديث: التحذير بيختفي من الرئيسية والإعدادات', await A.evaluate(() => [db.cfg.accV, $('#syncBox').classList.contains('warn'), !!$('#accOld')]), [3, false, false]);

    const posts = [], origPost = sheets.acc.post.bind(sheets.acc);
    sheets.acc.post = body => { const q = JSON.parse(body); if (q.action === 'push') posts.push(q.rows.length); return origPost(body); };
    const addBulk = (X, n, tag) => X.evaluate(([n, tag]) => { for (let i = 0; i < n; i++) { const now = Date.now() + i; const r = {id: 't_' + tag + i, type: 'exp', amt: 100, vault: 'v_main', to: '', cat: 'c_exp0', note: tag, date: todayISO(), at: now, upd: now, del: true, hist: []}; db.txs.push(r); IDX.tx.set(r.id, r); } saveDB(); }, [n, tag]);
    await addBulk(A, 130, 'bulk'); await bg(A, 'syncNow()'); await A.settle(500);
    eq('المزامنة بتبعت دفعات 50 كحد أقصى (130 حركة)', [Math.max(...posts) <= 50, posts.reduce((a, b) => a + b, 0) >= 130, await A.evaluate(() => pendingRecs().length)], [true, true, 0]);
    sheets.acc.post = body => { const q = JSON.parse(body); return q.action === 'push' ? JSON.stringify({ok: false, error: 'boom'}) : origPost(body); };
    await addBulk(A, 3, 'fail'); await bg(A, 'syncNow()'); await A.settle(300);
    eq('ok:false: بيعرض الخطأ اللي راجع والحركات تفضل مستنية ومفيش "تمام"', await A.evaluate(() => [syncErr, pendingRecs().length >= 3, $('#syncBox').textContent.includes('✔ كل حاجة')]), ['boom', true, false]);
    let lockTry = 0;
    sheets.acc.post = body => { const q = JSON.parse(body); if (q.action === 'push' && lockTry++ < 1) return JSON.stringify({ok: false, error: 'Exception: Lock timeout: another process was holding the lock for too long.'}); return origPost(body); };
    await bg(A, 'syncNow()'); await A.settle(3500);
    eq('القفل بيستنى ويعيد بدل ما يرفض: اتبعت بعد المحاولة التانية', [lockTry >= 2, await A.evaluate(() => pendingRecs().length)], [true, 0]);
    sheets.acc.post = body => { const q = JSON.parse(body); if (q.action === 'push') return JSON.stringify({ok: true, ack: q.rows.map(r => r.id), seq: 1}); return origPost(body); };   // بيقول تمام وهو مكتبش حاجة
    await addBulk(A, 2, 'ghost'); await bg(A, 'syncNow()'); await A.settle(500);
    eq('شيت بيرد ok وهو فاضي: التطبيق يكتشف الفرق ومبيقولش تمام', await A.evaluate(() => [/الشيت فيه/.test(syncErr), pendingRecs().length > 0, $('#syncBox').textContent.includes('✔ كل حاجة')]), [true, true, false]);
    sheets.acc.post = origPost;
    await bg(A, 'syncNow()'); await A.settle(1500);
    eq('بعد ما الشيت يرجع سليم كل حاجة تتبعت وتبقى تمام', await A.evaluate(() => [syncErr, pendingRecs().length]), ['', 0]);

    sec('١٠د) خانة الشيت (50 ألف حرف) وتنبيه التعارض بين جهازين');
    eq('الشيت التجريبي بيرفض خانة أكبر من 50 ألف حرف زي جوجل', gp({action: 'push', rows: [{id: 'x2', kind: 'tx', upd: 6, view: [], data: {a: 'س'.repeat(50001)}}]}).ok, false);
    /* حركة سجل تعديلاتها كبير (90 تعديل × ~1000 حرف): لازم تتبعت والمزامنة متقفش، والجهاز يفضل شايل كل التعديلات */
    const mkTx = (X, id, o) => X.evaluate(([id, o]) => { const now = Date.now(); const r = Object.assign({id, type: 'exp', amt: 100, vault: 'v_main', to: '', cat: 'c_exp0', note: 'تجربة', date: todayISO(), at: now, upd: now, del: true, hist: []}, o); db.txs.push(r); IDX.tx.set(r.id, r); saveDB(); }, [id, o]);
    await A.evaluate(() => { const now = Date.now(); const r = {id: 't_bighist', type: 'exp', amt: 100, vault: 'v_main', to: '', cat: 'c_exp0', note: 'تعديلات كتير', date: todayISO(), at: now, upd: now, del: true,
      hist: Array.from({length: 90}, (_, i) => ({t: now - (90 - i) * 1000, date: todayISO(), desc: 'تعديل رقم ' + i + ' ' + 'ب'.repeat(1000), dr: i, cr: 0}))}; db.txs.push(r); IDX.tx.set(r.id, r); saveDB(); });
    await mkTx(A, 't_small1', {note: 'حركة عادية في نفس الدفعة'});
    await bg(A, 'syncNow()');
    const cellOf = id => { const r = sheets.acc.sheets['السجلات'].rows.find(x => x[0] === id); return r ? String(r[r.length - 1]) : ''; };
    eq('سجل تعديلات كبير: اتبعت والمزامنة مكملة، والخانة أقل من 50 ألف، والجهاز لسه فيه الـ 90 تعديل', await A.evaluate(() => [syncErr, pendingRecs().length, IDX.tx.get('t_bighist').hist.length]).then(r => r.concat([cellOf('t_bighist').length > 0 && cellOf('t_bighist').length <= 50000, !!cellOf('t_small1')])), ['', 0, 90, true, true]);
    const shH = JSON.parse(cellOf('t_bighist')).hist;
    eq('الشيت خد أحدث التعديلات (الأقدم اتقص)', [shH.length > 10 && shH.length < 90, shH[shH.length - 1].dr], [true, 89]);
    await bg(B, 'syncNow()');
    eq('الجهاز التاني نزلت عليه الحركة بأحدث التعديلات', await B.evaluate(() => { const r = IDX.tx.get('t_bighist'); return [!!r, r.hist.length < 90, r.hist[r.hist.length - 1].dr]; }), [true, true, 89]);
    await B.evaluate(() => { const t = IDX.tx.get('t_bighist'); t.hist.push({t: Date.now(), date: t.date, desc: 'تعديل من الجهاز التاني', dr: 999, cr: 0}); t.note = 'اتعدلت من التاني'; touch(t); saveDB(); });
    await bg(B, 'syncNow()'); await bg(A, 'syncNow()');
    eq('تعديل من الجهاز التاني: الأول خد التعديل ومخسرش ولا تعديل قديم', await A.evaluate(() => { const t = IDX.tx.get('t_bighist'); return [t.note, t.hist.length, t.hist[0].dr, t.hist[t.hist.length - 1].dr, syncErr]; }), ['اتعدلت من التاني', 91, 0, 999, '']);
    /* سجل أكبر من الخانة حتى من غير تعديلات (مستحيل تقريباً): ميوقفش الباقي ويتقال عليه */
    await mkTx(A, 't_huge', {note: 'ج'.repeat(60000)}); await mkTx(A, 't_small2', {note: 'بعد الكبير'});
    await bg(A, 'syncNow()'); await A.evaluate(() => { closeModal(); go('home'); });
    eq('سجل أكبر من الخانة: الباقي اتبعت عادي ومفيش خطأ، ومتعلّم ومكتوب عليه فوق', await A.evaluate(() => [syncErr, pendingRecs().length, bigRecs().map(r => r.id), $('#syncBox').textContent.includes('كبير')]).then(r => r.concat([!!cellOf('t_small2'), !cellOf('t_huge')])), ['', 0, ['t_huge'], true, true, true]);
    await A.evaluate(() => { const t = IDX.tx.get('t_huge'); t.note = 'اتصغرت'; touch(t); saveDB(); }); await bg(A, 'syncNow()');
    eq('لما يصغر بيتبعت عادي والتنبيه يروح', await A.evaluate(() => [syncErr, bigRecs().length, pendingRecs().length]).then(r => r.concat([JSON.parse(cellOf('t_huge') || '{}').note])), ['', 0, 0, 'اتصغرت']);

    /* التعارض: نفس الحركة اتعدلت على الجهازين قبل ما يتزامنوا */
    await mkTx(A, 't_cf', {amt: 100}); await bg(A, 'syncNow()'); await bg(B, 'syncNow()');
    let lastUpd = 0;   // تعديلين على جهازين في نفس الملّي ثانية بياخدوا نفس الوقت ومبيبانش تعارض (ده اللي كان بيفشّل GitHub لأنه أسرع): كل تعديل بيستنى الساعة تعدّي اللي قبله
    const setAmt = async (X, a) => { await X.waitForFunction(t => Date.now() > t, lastUpd, {polling: 1}); lastUpd = await X.evaluate(a => { srvOff = 0; const t = IDX.tx.get('t_cf'); t.amt = a; touch(t); saveDB(); return t.upd; }, a); };   // الصفحتين على نفس الجهاز: نثبّت فرق الساعة علشان الترتيب بين تعديلين متقاربين ميتهزّش بفروق ملّي ثانية
    await B.evaluate(() => { closeModal(); go('home'); }); await A.evaluate(() => { closeModal(); go('home'); });
    await setAmt(A, 11100); await bg(A, 'syncNow()');
    await setAmt(B, 22200); await bg(B, 'syncNow()');
    eq('تعارض: الجهاز التاني طلّع تنبيه "تعارض" فيه التعديلين، والأحدث (بتاعه) اتحفظ', await B.evaluate(() => { const c = db.cfg.clash[0]; return [c.id, c.here, c.mine.includes('222'), c.theirs.includes('111'), $('#modal').textContent.includes('تعارض'), IDX.tx.get('t_cf').amt, pendingRecs().length]; }), ['t_cf', true, true, true, true, 22200, 0]);
    await B.click('#clX');
    eq('بعد "تمام، شفته" التنبيه بيروح من فوق', await B.evaluate(() => [$('#mask').classList.contains('on'), $('#syncBox').textContent.includes('تعارض'), db.cfg.clash[0].seen]), [false, false, true]);
    await setAmt(A, 33300); await setAmt(B, 44400); await bg(B, 'syncNow()'); await bg(A, 'syncNow()');
    eq('تعارض والتاني أحدث: الجهاز ده عرف إن تعديله اتلغى، والاتنين على نفس الرقم', [await A.evaluate(() => { const c = db.cfg.clash[0]; return [c.here, c.mine.includes('333'), c.theirs.includes('444'), IDX.tx.get('t_cf').amt]; }), await B.evaluate(() => IDX.tx.get('t_cf').amt)], [[false, true, true, 44400], 44400]);
    await A.evaluate(() => { closeModal(); db.cfg.clash.forEach(c => c.seen = true); renderSyncBox(); });
    const nCl = X => X.evaluate(() => (db.cfg.clash || []).length);
    const cl0 = [await nCl(A), await nCl(B)];
    await setAmt(A, 55500); await bg(A, 'syncNow()'); await bg(B, 'syncNow()');
    await setAmt(B, 66600); await setAmt(A, 66600); await bg(B, 'syncNow()'); await bg(A, 'syncNow()');
    eq('مفيش تعارض غلط: تعديل عادي بعد مزامنة، أو نفس التعديل على الجهازين', [await nCl(A), await nCl(B), await A.evaluate(() => IDX.tx.get('t_cf').amt), await B.evaluate(() => IDX.tx.get('t_cf').amt)], cl0.concat([66600, 66600]));

    sec('١٠ب) رابط الربط مع نت بيقطع أو صفحة بتتعمل لها ريفرش');
    const D4 = await newDevice(browser, base, sheets); D4.netDown = true;
    const J2 = await D4.page('accounts.html' + link.slice(link.indexOf('#')));
    await J2.fill('#suP', PASS); await J2.fill('#suP2', PASS);
    await J2.reload(); await J2.waitForSelector('#suP');   // ريفرش قبل كلمة السر: الرابط لازم ميضيعش
    await J2.fill('#suP', PASS); await J2.fill('#suP2', PASS); await J2.click('#suGo'); await J2.waitForFunction(() => typeof db !== 'undefined' && db && db.cfg.joinWait && typeof joinErr === 'string' && joinErr.length > 5, null, {timeout: 20000}).catch(() => {}); await J2.settle(300);
    eq('النت واقع وقت الربط: الربط محفوظ ومستني وبيقول السبب', await J2.evaluate(() => [db.cfg.joinWait, db.cfg.sheetOk, !!db.cfg.sheetUrl, joinErr.length > 5]), [true, false, true, true]);
    D4.netDown = false;
    await bg(J2, 'finishJoin(false)'); await J2.waitForFunction(() => db.cfg.sheetOk && !db.cfg.joinWait, null, {timeout: 20000}).catch(() => {}); await J2.settle(500);
    eq('النت رجع: كمّل الربط لوحده ونزّل نفس الأرصدة', [await J2.evaluate(() => [db.cfg.sheetOk, !!db.cfg.joinWait]), await snap(J2)], [[true, false], await snap(A)]);
    eq('رابط مقطوع بيطلع رسالة', await (async () => { const X = await D4.page('accounts.html#join=AAAA'); await X.settle(1200); return (await X.textContent('#toast')).includes('ناقص'); })(), true);

    sec('١٢) الشركاء: مرتب كل خميس ومسحوبات');
    await bg(A, 'syncNow()');   // ياخد اللي اتسجل في الجهاز التاني الأول
    const vb0 = await A.evaluate(() => vaultBal(''));
    eq('الموبايل: الشريط اللي تحت عملاء وموردين وتقارير وخزنة في سطر واحد، والشركاء جوه الخزنة والشيكات على اللاب بس', await A.evaluate(() => [...document.querySelectorAll('nav button[data-go]')].filter(b => getComputedStyle(b).display !== 'none').sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left).map(b => b.dataset.go).reverse()), ["home", "sup", "rep", "cash"]);
    eq('الموبايل: زراير الشريط اللي تحت كلها في سطر واحد', await A.evaluate(() => new Set([...document.querySelectorAll('nav button[data-go]')].filter(b => getComputedStyle(b).display !== 'none').map(b => Math.round(b.getBoundingClientRect().top))).size), 1);
    await A.evaluate(() => go('cash')); await A.waitForSelector('#cMore'); await A.click('#cMore'); await A.click('#modal [data-b=cChk]'); await A.waitForFunction(() => location.hash === '#chk', null, {timeout: 3000}).catch(() => {});
    eq('الشيكات من ⋯ في الخزنة على الموبايل', await A.evaluate(() => location.hash), '#chk');
    await A.evaluate(() => go('cash')); await A.click('#cMore'); await A.click('#modal [data-b=cPart]'); await A.waitForSelector('#ptBack', {timeout: 3000}).catch(() => {});   // الصفحة بتفتح بعد تغيير العنوان
    eq('الشركاء من الخزنة: الخزنة متعلّمة تحت وفيه رجوع', [await A.evaluate(() => $('nav button.on').dataset.go), !!await A.$('#ptBack')], ['cash', true]);
    await A.click('#psGo'); await A.fill('#psA', '10');
    await A.evaluate(() => $$('#psL input[data-p]').forEach((el, i) => { el.value = ['شريك أول', 'شريك تاني'][i]; }));
    await A.fill('#psS', await A.evaluate(() => addDays(lastThu(), -14))); await A.click('#psOk'); await A.settle(200);
    const autoN = X => X.evaluate(() => db.txs.filter(t => t.id.startsWith('t_ps_') && !t.del).length);
    eq('اتسجل مرتب 3 خميسات لـ 2 شركاء بتواريخ الخميس', [await autoN(A), await A.evaluate(() => db.txs.filter(t => t.auto).every(t => dowOf(t.date) === 4)), await A.evaluate(() => vaultBal(''))], [6, true, vb0 - 6000]);
    eq('التشغيل تاني مبيكررش', await A.evaluate(() => autoPartners(true)), 0);
    await bg(A, 'syncNow()'); await bg(B, 'syncNow()'); await B.settle(1500);
    eq('الجهاز التاني مسجلش تاني', [await B.evaluate(() => autoPartners(true)), await autoN(B)], [0, 6]);
    await A.click('#p-part tr[data-i]'); await A.click('#ptDel'); await A.click('#cOk'); await A.settle(150);
    eq('المرتب الملغي مبيرجعش يتسجل', [await A.evaluate(() => autoPartners(true)), await autoN(A)], [0, 5]);
    await A.click('#ptNew'); await A.fill('#ptA', '50'); await A.fill('#ptN', 'سلفة'); await A.click('#ptOk'); await closed(A);
    eq('المسحوبات اتسجلت للشريك ونزلت الخزنة', await A.evaluate(() => [db.txs.filter(t => t.cat === 'c_pdraw' && !t.del).map(t => [partName(t.pt), t.amt, t.note]), vaultBal('')]), [[['شريك أول', 5000, 'مسحوبات شريك أول — سلفة']], vb0 - 5000 - 5000]);
    eq('بنود الشركاء مش في قايمة المصروفات العادية', await A.evaluate(() => catsL('exp').some(c => c.id === 'c_psal' || c.id === 'c_pdraw')), false);

    sec('١٣) الأرباح ولوحة النهارده والبحث');
    const PR = await A.evaluate(() => { const y = todayISO().slice(0, 4) + '-01-01', x = profitOf(y, todayISO()), ex = db.txs.filter(t => !t.del && t.type === 'exp' && !t.pt && !NOT_PL.has(t.cat) && t.date >= y).reduce((s, t) => s + t.amt, 0); return [x.sales, x.purch, x.part, x.exp === ex, x.before === x.sales - x.purch - x.exp + x.inc, x.after === x.before - x.part]; });
    eq('الأرباح: المبيعات والمشتريات والشركاء لوحدهم والربح قبل وبعد', PR, [968500, 5050000, 10000, true, true, true]);
    /* التقارير بتفتح على الكروت: شريط فترة واحد، وكل كارت = رقم التقرير الكامل، والدوس بيفتحه بنفس الفترة */
    await A.evaluate(() => { repKind = 'ov'; ovP = 'year'; go('rep'); renderReports(); }); await A.settle(200);
    eq('التقارير: الكروت الأول بشريط فترة واحد، والأرقام = الأرباح والمبيعات والتحصيل، والمقارنة بنفس الأيام من الفترة اللي قبلها', await A.evaluate(() => {
      const [f, t] = ovRanges().cur, pr = profitOf(f, t), card = k => $(`#p-rep .ovc[data-ov="${k}"] b`).textContent;
      let c = 0; db.entries.forEach(e => { const p = P.get(e.party); if (!e.del && e.kind === 'pay' && e.date >= f && e.date <= t && p && !p.noTot && p.sec !== 'sup') c += e.amt; });
      return [!!$('#ovP .on') && $('#ovP .on').dataset.v === 'year' && !$('#rpK'), card('profit') === fmtP(Math.abs(pr.before)), card('item') === fmtP(pr.sales), card('col') === fmtP(c),
        ovRanges('month', '2026-03-31').prev.join(), ovRanges('year', '2028-02-29').prev.join(), ovRanges('week', '2026-10-24').prev[1], ovRanges('day', '2026-10-24').prev[0]]; }),
      [true, true, true, true, '2026-02-01,2026-02-28', '2027-01-01,2027-02-28', '2026-10-17', '2026-10-23']);
    await segOk(A, 'الحسابات — التقارير (الكروت)');
    await A.click('#p-rep .ovc[data-ov=col]'); await A.settle(200);
    eq('كارت التحصيل بيفتح التقرير الكامل، و"كل التقارير" بيرجع للكروت، وزرار التقارير في الشريط بيفتح الكروت', [await A.getAttribute('#rpK .on', 'data-v'),
      (await A.click('#rpBack'), await A.settle(150), !!(await A.$('#ovP')) && !(await A.$('#rpK'))),
      await A.evaluate(async () => { repOpen('cash'); const a = !!$('#rpK'); $('nav button[data-go=rep]').click(); await new Promise(r => setTimeout(r, 50)); renderReports(); return a && repKind === 'ov' && !!$('#ovP'); })], ['col', true, true]);
    await A.evaluate(() => { repColMode = 'week'; repMonth = ''; repYear = ''; });   // كارت التحصيل بالسنة فتحه شهري
    await A.evaluate(() => { repColMode = 'week'; repMonth = ''; repYear = ''; });   // كارت التحصيل بالسنة فتحه شهري
    await A.click('#p-rep .ovc[data-ov=profit]'); await A.settle(200);
    eq('كارت الربح بيفتح تقرير الأرباح بنفس الفترة', [await A.getAttribute('#rpK .on', 'data-v'), (await A.textContent('#p-rep .ldgf')).includes('بعد الشركاء')], ['profit', true]);
    /* تقرير التحصيل: دفعات العملاء (من غير الموردين والحساب الفرعي)، أسبوعي وشهري */
    await A.click('#rpK button[data-v=col]'); await A.settle(200);
    const CR = await A.evaluate(() => {
      const t = todayISO(), m = t.slice(0, 7); let want = 0, n = 0;
      db.entries.forEach(e => { const p = P.get(e.party); if (!e.del && e.kind === 'pay' && e.date.startsWith(m) && p && !p.noTot && p.sec !== 'sup') { want += e.amt; n++; } });
      const W = buildReport(), wk = W.rows.map(r => r.cells[0]);
      repColMode = 'month'; renderReports(); const M = buildReport(), row = M.rows.find(r => r.cells[0].startsWith(AR_MONTHS[+m.slice(5) - 1]));
      repColMode = 'week'; renderReports();
      return [W.title, W.fin[1] === fmtP(want), want > 0, W.sum[0][1] === String(n), row && row.cells[2] === W.fin[1], M.title, wk.every(n => /^من |^[^\d]/.test(n)), $('#p-rep .ldg th').textContent];
    });
    eq('تقرير التحصيل: أسبوعي = دفعات العملاء بالظبط، والشهري نفس الرقم للشهر ده', CR, ['التحصيل الأسبوعي', true, true, true, true, 'التحصيل الشهري', true, 'الأسبوع']);
    /* تقرير حركة العملاء: اتباع واتحصّل في الأسبوع (سبت→جمعة)، وأول + باع − حصّل = آخر بالقرش، ومن غير مصاريف */
    await A.click('#rpK button[data-v=ah]'); await A.settle(200);
    eq('تقرير حركة العملاء: اتباع − اتحصّل = الفرق بين أول وآخر الفترة', await A.evaluate(() => {
      const [f, t] = repRange(), ps = liveParties().filter(p => p.sec === 'mkt' && !p.noTot); let s = 0, c = 0;
      db.entries.forEach(e => { if (e.del || e.kind === 'open' || e.date < f || e.date > t || !ps.some(p => p.id === e.party)) return; const v = (e.dr || 0) - (e.cr || 0); e.kind === 'pay' ? c -= v : s += v; });
      const R = buildReport(), b0 = ps.reduce((a, p) => a + balance(p.id, f), 0), b1 = ps.reduce((a, p) => a + balance(p.id, addDays(t, 1)), 0);
      const g = k => (R.sum.find(r => r[0] === k) || [])[1];
      return [repMode, dowOf(f), dowOf(t), g('اتباع') === fmtP(s), g('اتحصّل') === fmtP(c), R.fin[1] === fmtP(b1), b0 - b1 === c - s, R.sum.every(r => !/الوارد|مصروف|مصاريف/.test(r[0])), R.rows.every(r => !r.id || P.get(r.id).sec === 'mkt'), $('#p-rep .ldg th').textContent];
    }), ['week', 6, 5, true, true, true, true, true, true, 'العميل']);
    await A.click('nav button[data-go=home]'); await A.settle(200);
    eq('لوحة النهارده اتشالت من الرئيسية', await A.$('#hDash'), null);
    const SR = await A.evaluate(() => [searchAll('لفة تجربة').length, searchAll('1350').map(r => r.title)[0] || '', searchAll('سلفة').length, searchAll('x').length]);
    eq('البحث بالصنف وبالمبلغ', SR, [3, 'فاتورة بيع — عميل تجربة واحد', 1, 0]);
    await A.evaluate(() => go('home')); await A.settle(150); await A.click('#bSearchAll'); await A.fill('#saQ', 'سلفة'); await A.settle(400);
    eq('البحث في الحركات', (await A.textContent('#saR')).includes('مسحوبات الشركاء'), true); await A.click('#saX2'); await A.fill('#hSearch', ''); await A.settle(150);
    eq('البحث في الحسابات: كل قسم بيطلع حساباته بس (الموردين موردين بس، والعملاء عملاء بس)', await A.evaluate(() => {
      const t0 = tab, r = [];
      for (const k of ['sup', 'mkt']) { tab = k; $('#hSearch').value = 'تجربة'; renderList(); const s = $$('#hList .pt').map(el => P.get(el.dataset.id).sec); r.push(s.length > 0 && s.every(x => x === k)); }
      $('#hSearch').value = ''; tab = t0; renderList(); return r; }), [true, true]);
    eq('الأرباح: الإيراد التاني بيزوّد الربح بالظبط، وتسوية الجرد مبتغيّرهوش', await A.evaluate(() => {
      const y = todayISO().slice(0, 4) + '-01-01', t = todayISO(), b0 = profitOf(y, t), n = db.txs.length, mk = (id, cat, amt) => ({id, type: 'inc', vault: 'v_main', amt, cat, date: t, note: '', at: 1, upd: 1, del: false, hist: []});
      db.txs.push(mk('t_tinc1', 'c_inc2', 12345)); const b1 = profitOf(y, t);
      db.txs.push(mk('t_tinc2', 'c_adj_in', 7000)); const b2 = profitOf(y, t);
      db.txs.splice(n);
      return [b1.before - b0.before, b1.inc - b0.inc, b2.before - b1.before, b1.exp === b0.exp]; }), [12345, 12345, 0, true]);
    eq('سطر الفاتورة بيتقرّب لأقرب قرش (1.5 × 3.33 = 5)', await A.evaluate(() => [lineTot({qty: 1.5, price: 333}), docTotal({lines: [{qty: 1.5, price: 333}, {qty: 0.333, price: 1000}], disc: 0})]), [500, 833]);

    eq('مفيش أرقام فواتير: لا خانة ولا عرض في الكشف ولا العنوان', await A.evaluate(() => { const p = liveParties().find(x => x.name === 'عميل تجربة واحد'); docModal(p, 'inv'); const f = !!$('#dcNo'); closeModal();
      const e = partyEntries(p.id).find(x => x.kind === 'inv'); return [f, /رقم/.test(docTitle(e)), /رقم/.test(docDesc(e)), stmtData(p.id, '', '').rows.some(r => isDoc(r.e) && r.ref)]; }), [false, false, false, false]);
    eq('دوسة على بند في الكشف بتفتح البند لوحده وتعدّله من غير ما تلمس باقي الفاتورة', await A.evaluate(() => {
      const p = liveParties().find(x => x.name === 'عميل تجربة واحد');
      const e = partyEntries(p.id).find(x => x.kind === 'inv' && x.lines.length > 1);
      if (!e) return 'no multi-line invoice';
      const r = [ledgerTable(p).includes('data-li="1"')], tot0 = docTotal(e), l1 = JSON.stringify(e.lines[1]), l0 = e.lines[0], h0 = (e.hist || []).length;
      lineModal(p, e, 0);
      r.push(!!$('#lnName') && !$('#dcLines') && $('#lnName').value === l0.name);
      $('#lnQty').value = String(l0.qty + 1); $('#lnQty').dispatchEvent(new Event('input')); $('#lnOk').click();
      r.push(docTotal(e) === tot0 + l0.price, JSON.stringify(e.lines[1]) === l1, e.hist.length === h0 + 1);
      lineModal(p, e, 0); $('#lnQty').value = String(l0.qty); $('#lnQty').dispatchEvent(new Event('input')); $('#lnOk').click();
      r.push(docTotal(e) === tot0);
      return r; }), [true, true, true, true, true, true]);
    eq('اقتراحات الفاتورة: أصناف الحساب بسعرها القديم، والدوسة تملّي الاسم والسعر، والكتابة بتفلتر', await A.evaluate(() => {
      const p = liveParties().find(x => x.name === 'عميل تجربة واحد'); docModal(p, 'inv');
      const mine = custItems(p.id, 'inv'), n = $('#dcLines [data-f=name]'), box = $('#dcLines .sg');
      n.dispatchEvent(new Event('focus'));
      const first = box.querySelector('.sr'), shown = box.classList.contains('on'), showsPrice = first.textContent.includes(fmtP(mine[0].price));
      first.click();
      const r = [mine.length > 0, shown, showsPrice, n.value === mine[0].name, $('#dcLines [data-f=price]').value === fmtP(mine[0].price), !box.classList.contains('on')];
      n.value = 'zzzz'; n.dispatchEvent(new Event('input')); r.push(!box.classList.contains('on'));
      closeModal(); return r; }), [true, true, true, true, true, true, true]);
    const PGN = await A.evaluate(() => { const p = liveParties().find(x => x.name === 'عميل تجربة واحد'); const pg = buildStmtPages(p, stmtData(p.id, '', '')); const c = pg[0].querySelectorAll('thead th').length; const fs = parseFloat(getComputedStyle(pg[0].querySelector('tbody td.l')).fontSize); $('#render').innerHTML = ''; return [c, fs >= 16]; });
    eq('كشف الـ PDF: 7 أعمدة وخط كبير', PGN, [7, true]);
    eq('كشف العميل مفيهوش "عميل سوق/مواقع"، والمورد فيه "مورد"', await A.evaluate(() => { const ps = liveParties(), c = ps.find(x => x.sec === 'mkt'), m = ps.find(x => x.sec === 'sup');
      const t = (p) => { const pg = buildStmtPages(p, stmtData(p.id, '', '')); const r = pg[0].querySelector('.cust i'); const v = r ? r.textContent : ''; $('#render').innerHTML = ''; return v; };
      return [t(c), t(m)]; }), ['', 'مورد']);
    eq('المبلغ بالحروف (تفقيط)', await A.evaluate(() => [12134000, 100, 200, 300000, 1105050, 1100000000, 0].map(moneyWords)),
      ['فقط مائة وواحد وعشرون ألفاً وثلاثمائة وأربعون جنيهاً لا غير', 'فقط جنيه واحد لا غير', 'فقط جنيهان لا غير', 'فقط ثلاثة آلاف جنيه لا غير', 'فقط أحد عشر ألفاً وخمسون جنيهاً وخمسون قرشاً لا غير', 'فقط أحد عشر مليون جنيه لا غير', 'لا يوجد رصيد مستحق']);
    eq('كشف احترافي: الفاتورة متجمعة، بيانات الشركة، المبلغ بالحروف، سطر الإصدار', await A.evaluate(() => {
      const p = liveParties().find(x => x.sec === 'mkt' && partyEntries(x.id).some(e => e.kind === 'inv' && (e.lines || []).length > 1));
      const inv = partyEntries(p.id).find(e => e.kind === 'inv' && (e.lines || []).length > 1), c = db.cfg, old = [c.coAddr, c.coCr, c.coTax];
      const run = () => { const pg = buildStmtPages(p, stmtData(p.id, '', '')), all = pg.flatMap(x => [...x.querySelectorAll('tbody tr')]); const r = {pg, all}; return r; };
      c.coAddr = c.coCr = c.coTax = ''; const a = run(), noBar = !a.pg[0].querySelector('.coi'); $('#render').innerHTML = '';
      Object.assign(c, {coAddr: 'عنوان تجربة', coCr: '111', coTax: '222'}); const {pg, all} = run();
      const bar = pg[0].querySelector('.coi').textContent, items = all.filter(tr => tr.classList.contains('it')), firsts = items.filter(tr => tr.classList.contains('f'));
      const subs = all.filter(tr => tr.classList.contains('is')), last = pg[pg.length - 1], s = stmtData(p.id, '', '');
      const r = [noBar, bar.includes('عنوان تجربة') && bar.includes('111') && bar.includes('222'), firsts.length === subs.length && subs.length > 0,
        items.filter(tr => !tr.classList.contains('f')).every(tr => !tr.cells[0].textContent && !tr.cells[6].textContent),
        subs.some(tr => tr.cells[1].textContent === 'إجمالي الفاتورة' && tr.querySelector('td.b').textContent === fmtP(s.rows.filter(x => x.e === inv).pop().run * s.sg)),
        last.querySelector('.tot .wd b').textContent === moneyWords(s.close * s.sg), /المستحق (عليكم|لكم)/.test(last.querySelector('.sum .f span').textContent),
        pg.every(x => x.querySelector('.gen').textContent.startsWith('صدر هذا الكشف إلكترونياً')), !last.querySelector('.note'), pg[0].querySelector('thead').textContent.includes('المدفوع')];
      [c.coAddr, c.coCr, c.coTax] = old; $('#render').innerHTML = ''; return r; }), [true, true, true, true, true, true, true, true, true, true]);
    sec('١٣ب) الجرد');
    eq('الموبايل: مفيش زرار جديد تحت، والجرد زرار جوه التقارير', await A.evaluate(() => { go('rep'); renderReports(); return [getComputedStyle($('nav button[data-go=jrd]')).display, !!$('#rpJrd')]; }), ['none', true]);
    await A.click('#rpJrd'); await A.waitForSelector('#jrS', {timeout: 3000});
    /* الأرقام اللي جاية لوحدها = نفس اللي بيتحسب من الحسابات والخزنة بطريقة تانية */
    eq('الجرد: العملا والموردين والخزن من الحسابات (من غير الحساب الفرعي)', await A.evaluate(() => {
      const n = jrdCalc(todayISO()), b = allBalances(), w = {mkt: 0, sup: 0};
      b.forEach((v, id) => { const p = P.get(id); if (!p.noTot) w[p.sec] += v; });
      return [n.mkt === w.mkt, n.sup === -w.sup, n.vault === vaultBal(''), !!$('#jrBack')]; }), [true, true, true, true]);
    await A.fill('#jrS', '1000'); await A.settle(100);
    const J1 = await A.evaluate(() => { const n = jrdCalc(todayISO()), T = jrdTot(n, 100000); return [$('#jrStockV').textContent, $('#jrNet').textContent.trim().startsWith(fmtP(T.net)), T.net === n.mkt + n.vault + 100000 - n.sup]; });
    eq('المخزون بيتكتب مبلغ والصافي بيتحسب على طول', J1, ['1,000', true, true]);
    await A.click('#jrSave'); await A.settle(200);
    eq('الجرد اتحفظ بأرقامه', await A.evaluate(() => { const s = jrdSaved(); return [s.length, s[0].stock, s[0].date === todayISO(), !!$('#p-jrd tr[data-s]')]; }), [1, 100000, true, true]);
    await A.click('#jrSave'); await A.settle(200);
    eq('حفظ نفس اليوم تاني بيحدّث نفس الجرد مش جرد جديد', await A.evaluate(() => jrdSaved().length), 1);
    /* جرد قديم بالأرقام بس، وفرق المخزون في تقرير الأرباح (بطلبه 17/10/2026) */
    await A.click('#jrOld'); await A.waitForSelector('#joD');
    const oldD = await A.evaluate(() => addDays(todayISO(), -60));
    await A.fill('#joD', oldD); await A.fill('#joN', '500000'); await A.fill('#joC', '300000'); await A.fill('#joS', '150000'); await A.click('#joOk'); await A.settle(200);
    eq('جرد قديم: بيتحفظ بأرقامه زي ما هي، والجرد الجديد بيتقارن بيه ومخزونه مبيتملاش منه', await A.evaluate(d => { const o = jrdSaved().find(x => x.date === d), cur = jrdSaved()[0];
      return [jrdSaved().length, !!o.n.old, jrdTot(o.n, o.stock).net, o.stock, jrdLines(o.n, o.stock).map(x => x.a), $('#p-jrd').textContent.includes('(قديم)'), cur.stock, $('#jrS').value.replace(/\D/g, '')]; }, oldD),
      [2, true, 50000000, 15000000, [30000000, 15000000, 5000000, 50000000], true, 100000, '1000']);
    eq('جرد قديم: نفس التاريخ مرتين أو تاريخ النهارده مش بيتسجلوا', await A.evaluate(async d => { const n0 = jrdSaved().length;
      for (const x of [d, todayISO()]) { jrdOldModal(); $('#joD').value = x; $('#joN').value = '1'; $('#joOk').click(); closeModal(); } return jrdSaved().length - n0; }, oldD), 0);
    eq('الأرباح من جرد لجرد: سطر فرق المخزون والربح بيتظبط بيه، وفترة مش من جرد لجرد مفيهاش السطر', await A.evaluate(d => {
      const f = addDays(d, 1), t = todayISO(), R = profitReport(f, t), x = profitOf(f, t), at = k => R.sum.findIndex(r => r[0].includes(k)), dd = 100000 - 15000000;
      const R2 = profitReport(addDays(d, 3), t);
      return [R.sum[at('نقص المخزون')][1] === fmtP(-dd), R.sum[at('الربح قبل الشركاء')][1] === fmtP(x.before + dd), R.fin[1] === fmtP(x.after + dd), R.note.includes('الفرق في المخزون'),
        at('المخزون (من الجرد)') === -1 ? 0 : 1, R2.sum.some(r => r[0].includes('المخزون (من الجرد)')), R2.note.includes('من يوم جرد لحد يوم جرد')]; }, oldD), [true, true, true, true, 1, false, true]);
    eq('جرد قديم من غير مخزون مبيدخلش في فرق المخزون', await A.evaluate(d => { const n0 = db.stks.length; jrdOldModal(); $('#joD').value = addDays(d, -1); $('#joN').value = '400000'; $('#joOk').click();
      const o = db.stks[db.stks.length - 1], r = [db.stks.length - n0, !!o.n.noStock, jrdTot(o.n, o.stock).net, !!stockDiff(addDays(d, -1), todayISO())];
      db.stks.forEach(x => { if (x.n.old) x.del = true; }); saveDB(); renderJrd(); return r; }, oldD), [1, true, 40000000, false]);

    /* الشكل: التبويبات والأرقام تحت بعض والخط */
    await A.evaluate(() => { jrDate = ''; go('jrd'); }); await A.settle(300);
    await segOk(A, 'الحسابات — الجرد'); await colOk('الحسابات — الجرد', A, '#p-jrd', '.cmt td.am,.cth b');
    eq('الجرد: الخط بالخمس أحجام بس', await fs5(A), [true, []]);
    /* المزامنة: الجهاز التاني بياخد الجرد */
    await bg(A, 'syncNow()'); await bg(B, 'syncNow()'); await B.settle(1500);
    eq('الجهاز التاني: نفس الجرد ونفس الأرقام', await B.evaluate(() => jrdSaved().map(s => [s.date, s.stock])), await A.evaluate(() => jrdSaved().map(s => [s.date, s.stock])));
    await A.evaluate(() => go('home')); await A.settle(200);

    sec('١٤) التاريخ ورصيد أول المدة');
    const OP = await A.evaluate(() => {
      const now = Date.now(), p = {id: newId('p_'), sec: 'mkt', name: 'عميل ترتيب تجربة', phone: '', note: '', noTot: false, at: now, upd: now, del: false};
      db.parties.push(p); P.set(p.id, p);
      addEntry({party: p.id, kind: 'man', date: '2026-01-10', desc: 'بند قبل الرصيد', dr: 5000, cr: 0});
      addEntry({party: p.id, kind: 'open', date: '2026-03-01', desc: 'رصيد أول المدة', dr: 20000, cr: 0});
      const s = stmtData(p.id, '2026-02-01', '2026-12-31');
      return [partyEntries(p.id)[0].kind, stmtData(p.id, '', '').rows[0].run, s.open, s.n];
    });
    eq('رصيد أول المدة أول سطر حتى لو في بند بتاريخ قبله', OP, ['open', 20000, 25000, 0]);
    eq('كشف لفترة: حركة في نفس يوم البداية بتبان في الكشف ومبتتحسبش تاني في رصيد أول المدة', await A.evaluate(() => {
      const p = liveParties().find(x => x.name === 'عميل ترتيب تجربة'), n = db.entries.length;
      const e = addEntry({party: p.id, kind: 'man', date: '2026-02-01', desc: 'بند يوم البداية', dr: 3000, cr: 0});
      const s = stmtData(p.id, '2026-02-01', '2026-12-31'), r = [s.open, s.n, s.close === balance(p.id)];
      db.entries.splice(n); E.delete(e.id); return r; }), [25000, 1, true]);
    await A.evaluate(() => go('cash')); await A.click('#cExp'); await A.settle(150);
    const DP = await A.evaluate(() => { const b = $('#txD').nextElementSibling; return [b.className, [...b.querySelectorAll('span')].slice(0, 5).map(x => x.textContent).join('') === dispDate(todayISO()).split('/').join('/') .replace(/\//g, '') || true, getComputedStyle(b).direction, b.firstElementChild.textContent === todayISO().slice(8)]; });
    eq('خانة التاريخ: اليوم أول واحد على اليمين', [DP[0], DP[2], DP[3]], ['dp', 'rtl', true]);
    await A.click('#txD + .dp'); await A.waitForSelector('.dpo');
    await A.click('.dpo [data-d="5"]');
    const T = await A.evaluate(() => todayISO().slice(0, 8) + '05');
    eq('أول ما تدوس على اليوم بيتسجل وبيتقفل الكليندر', [await A.inputValue('#txD'), await A.$('.dpo')], [T, null]);
    await A.click('#txX');

    sec('١٤ج) حد بيحوّل للموردين بدالنا (فودافون كاش) بعمولة أو من غيرها');
    await A.evaluate(() => { const now = Date.now(); ['مورد تحويل تجربة', 'شخص بيحوّل تجربة'].forEach((name, i) => { const p = {id: 'p_vt' + i, sec: 'sup', name, phone: '', note: '', noTot: false, at: now, upd: now, del: false}; db.parties.push(p); P.set(p.id, p); }); saveDB(); });
    const VB0 = await vbal(A, ''), FEE = () => A.evaluate(() => cashSums(todayISO(), todayISO()).byCat.get('− عمولة تحويل') || 0), FEE0 = await FEE();
    await openParty(A, 'مورد تحويل تجربة'); await A.click('#fbPay'); await A.fill('#pyAmt', '5000');
    eq('"حد حوّلها" مقفولة لحد ما تدوس عليها، وبعدها الخزنة بتستخبى', [await A.isVisible('#pyVia'), (await A.click('#pyM [data-v=via]'), await A.isVisible('#pyVia')), await A.isVisible('#pyVW')], [false, true, false]);
    await A.selectOption('#pyVp', 'p_vt1');
    eq('العمولة 10 على الألف ظاهرة قبل الحفظ', (await A.textContent('#pyViaH')).includes('5,050'), true);
    await A.click('#pyOk'); await closed(A);
    eq('المورد نزل 5000، واللي حوّل زاد 5050، والخزنة متحركتش، والعمولة مصروف', [await bal(A, 'مورد تحويل تجربة'), await bal(A, 'شخص بيحوّل تجربة'), await vbal(A, '') - VB0, await FEE() - FEE0], [500000, -505000, 0, 5000]);
    eq('جوه البرنامج بس: صفحة المورد بتقول مين حوّلها', await A.evaluate(() => { go('p/p_vt0'); return $('#p-party .ldg').textContent.includes('حوّلها شخص بيحوّل تجربة'); }), true);
    eq('كشف المورد: "دفعة" من غير اسم اللي حوّل', await A.evaluate(() => stmtData('p_vt0', '', '').rows.map(r => [r.desc, r.ref, r.dr])), [['دفعة', '', 500000]]);
    eq('كشف اللي حوّل: سطر التحويل وسطر العمولة', await A.evaluate(() => stmtData('p_vt1', '', '').rows.map(r => [r.desc, r.cr])), [['حوّل لـ مورد تحويل تجربة', 500000], ['عمولة تحويل', 5000]]);
    /* الدوسة على الحركة من حساب اللي حوّل بتفتح الدفعة نفسها، والتعديل بيتنقل للاتنين */
    await openParty(A, 'شخص بيحوّل تجربة'); await A.click('#p-party .ldg tr[data-id^="e_vp_"]'); await A.settle(150);
    eq('من حساب اللي حوّل بتفتح دفعة المورد', (await A.textContent('#modal h3')).includes('مورد تحويل تجربة'), true);
    eq('مفيش اختيار عمولة (دايماً 10 على الألف)', await A.$('#pyFee'), null);
    await A.fill('#pyAmt', '6000'); await A.click('#pyOk'); await closed(A);
    eq('التعديل (6000) اتنقل للاتنين ومعاه العمولة', [await bal(A, 'مورد تحويل تجربة'), await bal(A, 'شخص بيحوّل تجربة'), await FEE() - FEE0], [600000, -606000, 6000]);
    eq('فوق في صفحة اللي حوّل: إجمالي اللي حوّله والعمولة', await A.evaluate(() => { go('p/p_vt1'); const t = $('#p-party .mini2').textContent; return [t.includes('حوّل للموردين: 6,000'), t.includes('العمولة: 60')]; }), [true, true]);
    const vid = await A.evaluate(() => db.entries.find(e => !e.del && e.party === 'p_vt0').id);
    await A.evaluate(id => cancelEntry(E.get(id)), vid); await A.settle(150);
    eq('إلغاء الدفعة بيلغي اللي عند اللي حوّل', [await bal(A, 'مورد تحويل تجربة'), await bal(A, 'شخص بيحوّل تجربة')], [0, 0]);
    await A.evaluate(id => { closeModal(); openEntry(P.get('p_vt1'), E.get('e_vp_' + id)); }, vid); await A.settle(150); await A.click('#emBack'); await closed(A);
    eq('رجوع الدفعة الملغية بيرجّع الاتنين', [await bal(A, 'مورد تحويل تجربة'), await bal(A, 'شخص بيحوّل تجربة')], [600000, -606000]);
    await A.evaluate(id => openEntry(P.get('p_vt0'), E.get(id)), vid); await A.settle(150); await A.click('#pyM button:first-child'); await A.click('#pyOk'); await closed(A);
    eq('لو بقت من الخزنة: اللي حوّل بيرجع صفر والفلوس طلعت من الخزنة', [await bal(A, 'شخص بيحوّل تجربة'), await vbal(A, '') - VB0], [0, -600000]);

    sec('١٤د) رقم التليفون بالزيرو، واختيار الرقم من أسماء الموبايل');
    eq('الرقم بيتظبط: الزيرو اللي اتشال بيرجع، و+20 بيبقى 0، والمسافات بتتشال، والأرضي زي ما هو', await A.evaluate(() => ['1012345678', '+20 101 234 5678', '٠١٠١٢٣٤٥٦٧٨', '010-1234-5678', '0223456789', ''].map(fixPhone)),
      ['01012345678', '01012345678', '01012345678', '01012345678', '0223456789', '']);
    await A.evaluate(() => { navigator.contacts = {select: async () => [{name: ['اسم تجربة من الموبايل'], tel: ['+20 109 876 5432']}]}; partyModal(); }); await A.settle(150);
    await A.click('#pmCt'); await A.waitForFunction(() => $('#pmPh').value !== '');
    eq('"من الأسماء" بيحط الرقم (بالزيرو) والاسم لو فاضي', [await A.inputValue('#pmPh'), await A.inputValue('#pmN')], ['01098765432', 'اسم تجربة من الموبايل']);
    await A.click('#pmOk'); await A.settle(200);
    eq('الحساب اتحفظ بالرقم صح، وفي الشيت بيتكتب نص علشان الزيرو ميتشالش', await A.evaluate(() => { const p = liveParties().find(x => x.name === 'اسم تجربة من الموبايل'); delete navigator.contacts; return [p.phone, viewOf('party', p)[3]]; }), ['01098765432', "'01098765432"]);
    eq('من غير أسماء الموبايل (الآيفون) الزرار مش بيظهر', await A.evaluate(() => { partyModal(); const r = !!$('#pmCt'); closeModal(); return r; }), false);

    sec('١٤ب) راحة العين واستغلال المساحة (ماتدوسش حاجة مكان حاجة)');
    await A.setViewportSize({width: 400, height: 860}); await A.settle(200);
    {   // القفل وانت جوه حساب، وبعد ما تفتح ترجع: القايمة لازم تترسم تاني (كانت بتطلع فاضية والإجماليات بس)
      await A.evaluate(() => go('')); await A.settle(150); await openParty(A, 'عميل تجربة واحد');
      await A.evaluate(() => lockNow()); await A.waitForSelector('#lock.on', {state: 'attached'}); await unlock(A); await A.settle(200);
      await A.evaluate(() => history.back()); await A.waitForFunction(() => !location.hash.startsWith('#p/')); await A.settle(200);
      eq('قفل جوه حساب وفتح ورجوع: قايمة العملاء مش فاضية', await A.evaluate(() => $$('#hList .pt').length > 0), true);
    }
    await openParty(A, 'عميل تجربة واحد');
    eq('الموبايل: كشف الحساب 5 عواميد، الكمية × السعر تحت البيان، والسنة سطر لوحده مش جنب كل تاريخ', await A.evaluate(() => {
      const vis = el => getComputedStyle(el).display !== 'none', th = [...$$('#p-party .ldg thead th')].filter(vis).map(x => x.textContent);
      return [th.join('|'), $$('#p-party .ldg tr.yr').length > 0 && vis($('#p-party .ldg tr.yr')), [...$$('#p-party .ldg td.dt small')].some(vis), [...$$('#p-party .ldg td.l .qp')].some(vis),
        $('#p-party .ldgw').scrollWidth <= $('#p-party .ldgw').clientWidth + 1]; }), ['التاريخ|البيان|الإجمالي|دفعة|الرصيد', true, false, true, true]);
    eq('الموبايل: كل زراير صفحة العميل جوه الشاشة', await A.evaluate(() => [...$$('#p-party .acts .btn')].filter(b => b.offsetParent).every(b => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })), true);
    eq('رسالة التراجع: صغيرة فوق مكان الاسم، مش فوق أي زرار، وبتختفي في أقل من 5 ثواني', await A.evaluate(async () => {
      toastUndo('اتلغت حركة تجربة طويلة شوية علشان نشوف الاسم بيتقص ولا لأ', () => {});
      await Promise.all($('#toast').getAnimations().map(a => a.finished));   // بعد حركة الظهور (foUp) مش في نصها
      /* كلمة المزامنة (#bSyncM) بقت سطر صغير تحت الاسم نفسه (بطلبه 17/10/2026)، فالرسالة بتغطيها مكان الاسم عادي */
      const t = $('#toast').getBoundingClientRect(), hit = [...$$('.top button')].filter(b => b.offsetParent && b.id !== 'bSyncM').some(b => { const r = b.getBoundingClientRect(); return r.right > t.left && r.left < t.right && r.bottom > t.top && r.top < t.bottom; });
      return [t.top < 20, t.height < 50, hit]; }), [true, true, false]);
    eq('رسالة التراجع اختفت لوحدها في أقل من 5 ثواني', await A.waitForFunction(() => getComputedStyle($('#toast')).display === 'none', null, {timeout: 5000}).then(() => true, () => false), true);
    await A.evaluate(() => { tab = 'mkt'; go('home'); }); await A.settle(200);
    eq('الموبايل: مفيش زرار الليلي فوق، وزرار الحساب الجديد مش نفس ＋ بتاع التسجيل السريع، وسطر "آخر دفعة" تحت الاسم', await A.evaluate(() => [!!$('#bTheme').offsetParent, $('#bNewParty').textContent.includes('＋'), !!$('#bNewParty svg'),
      [...$$('#hList .lpy')].some(x => x.offsetParent && x.textContent.startsWith('آخر دفعة'))]), [false, false, true, true]);
    eq('الموبايل: خانة البحث على طول فوق القايمة (من غير زرار عدسة)، والزراير الست (الجرد … حساب جديد) سطرين كل سطر 3، كبار ومتباعدين', await A.evaluate(() => {
      const bs = ['#hJrd', '#hAct', '#hQt', '#hOrd', '#hPrc', '#bNewParty'].map(x => $(x).getBoundingClientRect()), q = $('#hSearch').getBoundingClientRect(), row = (a, b) => a.every(r => Math.abs(r.top - a[0].top) < 2) && b.every(r => Math.abs(r.top - b[0].top) < 2) && b[0].top > a[0].bottom;
      return [!!$('#hSearch').offsetParent, !!$('#bSearch').offsetParent, q.bottom <= $('#hList').getBoundingClientRect().top + 1, bs.every(r => r.height >= 50 && r.width >= 70) && row(bs.slice(0, 3), bs.slice(3)), [1, 2, 4, 5].every(i => Math.abs(bs[i].right - bs[i - 1].left) >= 6 && Math.abs(bs[i - 1].right - bs[i].left) >= 6)]; }), [true, false, true, true, true]);
    await A.fill('#hSearch', 'تجربة واحد'); await A.settle(200);
    eq('الكتابة في خانة البحث بتفلتر القايمة على طول', await A.evaluate(() => $$('#hList .pt').length), 1);
    await A.click('#bSearchAll'); await A.settle(400);
    eq('"في الحركات" بيدوّر في كل الحركات على اللي مكتوب', await A.evaluate(() => [$('#saQ').value, $$('#saR .cm').length > 0]), ['تجربة واحد', true]);
    await A.evaluate(() => closeModal()); await A.fill('#hSearch', ''); await A.settle(150);
    eq('مسح خانة البحث بيرجّع القايمة كلها', await A.evaluate(() => $$('#hList .pt').length > 1), true);
    /* تعديلات الشكل والسهولة (بطلبه 17/10/2026) */
    eq('الآلة الحاسبة جوه الخانة: بتحسب العملية وبتسيب الرقم العادي زي ما هو', await A.evaluate(() => [calcExpr('40*525'), calcExpr('٤٠×٥٢٥'), calcExpr('1500+2300'), calcExpr('(10+5)/2'), calcExpr('12'), calcExpr('-5'), calcExpr('5*')]), [21000, 21000, 3800, 7.5, null, null, null]);
    eq('شريط اللون حسب آخر دفعة، و"له عندنا" تحت الرصيد السالب', await A.evaluate(() => {
      const t = todayISO(), mk = (name, rows) => { const now = Date.now(), p = {id: newId('p_'), sec: 'mkt', name, phone: '', note: '', noTot: false, at: now, upd: now, del: false}; db.parties.push(p); P.set(p.id, p); rows.forEach(r => { const x = addEntry(Object.assign({party: p.id, desc: 'بند', dr: 0, cr: 0}, r)); if (r.kind === 'pay') applyAmounts(x); }); return p; };
      const ps = [mk('لون تجربة أ', [{kind: 'man', date: addDays(t, -90), dr: 100000}, {kind: 'pay', date: addDays(t, -3), amt: 1000, method: 'نقدي', vault: 'v_main'}]),
        mk('لون تجربة ب', [{kind: 'man', date: addDays(t, -45), dr: 100000}]), mk('لون تجربة ج', [{kind: 'man', date: addDays(t, -90), dr: 100000}]),
        mk('لون تجربة د', [{kind: 'pay', date: t, amt: 5000, method: 'نقدي', vault: 'v_main'}])];
      tab = 'mkt'; $('#hSearch').value = 'لون تجربة'; renderList();
      const r = ps.map(p => { const el = $(`#hList .pt[data-id="${p.id}"]`); return el ? ['age-g', 'age-y', 'age-r'].find(c => el.classList.contains(c)) || '-' : 'x'; });
      const neg = $(`#hList .pt[data-id="${ps[3].id}"]`).textContent.includes('له عندنا');
      ps.forEach(p => { p.del = true; db.entries.forEach(e => { if (e.party === p.id) e.del = true; }); }); $('#hSearch').value = ''; renderList();
      return [r, neg]; }), [['age-g', 'age-y', 'age-r', '-'], true]);
    eq('ملخص الأرباح: الداخل كله فوق وبعده الخارج وبعدين الربح، بنفس الأرقام', await A.evaluate(() => {
      const y = todayISO().slice(0, 4) + '-01-01', R = profitReport(y, todayISO()), x = profitOf(y, todayISO()), L = R.sum.map(r => r[0].trim()), at = k => L.indexOf(k);
      const lastIn = Math.max(at('صافي المبيعات'), ...L.map((l, i) => l.startsWith('+ ') ? i : -1)), firstOut = Math.min(...L.map((l, i) => l.startsWith('− ') || l === 'صافي المشتريات' ? i : 99));
      return [lastIn < firstOut, at('إجمالي الخارج') < at('الربح قبل الشركاء'), R.sum[at('إجمالي الخارج')][1] === fmtP(x.purch + x.exp), R.sum[at('الربح قبل الشركاء')][1] === fmtP(x.before)]; }), [true, true, true, true]);
    eq('الرسم البياني بيعرض الشهور اللي فيها شغل بس', await A.evaluate(() => { const rw = (m, s, e) => ({empty: e, raw: {m, s, p: s / 2}}), d = document.createElement('div');
      d.innerHTML = profitChart([rw('يناير', 100), rw('فبراير', 0, true), rw('مارس', 300), rw('أبريل', 0, true)]); return [...d.querySelectorAll('.rchb .c small')].map(x => x.textContent); }), ['يناير', 'مارس']);
    eq('"حفظ وسجّل تاني" في المصروف: بيحفظ ويفتح النافذة فاضية بنفس التاريخ والخزنة', await A.evaluate(() => {
      const n0 = db.txs.length, d = todayISO(); txModal('exp'); $('#txA').value = '40*5'; $('#txA').dispatchEvent(new Event('change', {bubbles: true}));
      const calc = $('#txA').value.replace(/\D/g, ''); $('#txD').value = d; const v = $('#txV').value; $('#txAgain').click();
      const r = [calc, db.txs.length - n0, db.txs[db.txs.length - 1].amt, !!$('#txAgain'), $('#txD').value === d, $('#txV').value === v, $('#txA').value];
      db.txs[db.txs.length - 1].del = true; closeModal(); route(); return r; }), ['200', 1, 20000, true, true, true, '']);
    eq('"حفظ وسجّل تاني" مش موجود في التعديل ولا التحويل', await A.evaluate(() => { const t = db.txs.find(x => !x.del && x.type === 'exp'); txModal('exp', t); const a = !!$('#txAgain'); closeModal(); txModal('tr'); const b = !!$('#txAgain'); closeModal(); return [a, b]; }), [false, false]);
    eq('اسحب لتحت يحدّث: سحبة طويلة من أول الصفحة بتزامن، والقصيرة لأ', await A.evaluate(async () => {
      const s0 = syncNow; let n = 0; syncNow = async () => { n++; }; scrollTo(0, 0);
      const ev = (type, y) => { const e = new Event(type, {bubbles: true}); Object.defineProperty(e, 'touches', {value: y === null ? [] : [{clientY: y}]}); $('#hList').dispatchEvent(e); };
      const pull = async d => { ev('touchstart', 100); ev('touchmove', 100 + d); ev('touchend', null); await new Promise(r => setTimeout(r, 30)); };
      await pull(30); const a = n; await pull(120); const b = n; syncNow = s0; return [a, b, $('#ptr').classList.contains('on')]; }), [0, 1, false]);
    await A.click('#hSortB'); await A.settle(150);
    eq('زرار الترتيب الصغير فوق القايمة بيغيّر الترتيب', await A.evaluate(() => [$('#hSort').value, $('#hSortB').textContent.includes('بالاسم')]), ['name', true]);
    await A.click('#hSortB'); await A.click('#hSortB'); await A.settle(150);
    await A.evaluate(() => { const now = Date.now(), p = {id: newId('p_'), sec: 'mkt', name: 'عميل طويل تجربة', phone: '', note: '', noTot: false, at: now, upd: now, del: false}; db.parties.push(p); P.set(p.id, p);
      for (let i = 0; i < 45; i++) addEntry({party: p.id, kind: 'man', date: '2026-0' + (1 + i % 9) + '-1' + (i % 9), desc: 'بند ' + i, dr: 1000, cr: 0}); go('p/' + p.id); }); await A.settle(300);
    eq('كشف حساب طويل على الموبايل: سطر "أقدم" مبيعملش عمود فاضي', await A.evaluate(() => { const t = $('#p-party .ldg'), th = [...t.querySelectorAll('thead th')].filter(x => getComputedStyle(x).display !== 'none');
      return [!!$('#ldgOld'), Math.abs(th.reduce((n, x) => n + x.getBoundingClientRect().width, 0) - t.getBoundingClientRect().width) <= 4]; }), [true, true]);
    await A.evaluate(() => { const p = liveParties().find(x => x.name === 'عميل طويل تجربة'); db.entries.filter(e => e.party === p.id).forEach(e => { e.del = true; e.delAt = nowS(); touch(e); }); p.del = true; touch(p); saveDB(); go('home'); }); await A.settle(150);   // الحساب ده للاختبار بس، ميدخلش في أقسام السوق
    await A.evaluate(() => { go('rep'); repKind = 'profit'; repMode = 'year'; repYear = ''; renderReports(); }); await A.settle(300);
    eq('تقرير الأرباح: الشهور الفاضية مش ظاهرة، والجدول جوه الشاشة على الموبايل (والـ PDF فيه السنة كلها)', await A.evaluate(() => {
      const R = buildReport(), tb = $('#p-rep table.pft'), w = tb.closest('.ldgw');
      return [tb.querySelectorAll('tbody tr').length === R.rows.filter(r => !r.empty).length, R.rows.length, R.rows.some(r => r.empty), w.scrollWidth <= w.clientWidth + 1]; }), [true, 12, true, true]);
    await A.evaluate(() => go('cash')); await A.settle(200);
    eq('زرار عدّ الفلوس في الخزنة (مش "جرد" زي صفحة الجرد)', (await A.textContent('#cOpen2')).trim(), '✎ عدّ الفلوس');
    await A.setViewportSize({width: 1280, height: 760}); await A.settle(300);
    eq('اللاب: العملاء/الموردين مش متكررين في القايمة الجانبية، وآخر زرار فيها بيوصله من غير ما القفل يغطيه', await A.evaluate(() => {
      const nav = document.querySelector('nav'), last = [...nav.querySelectorAll('button')].filter(b => b.offsetParent).pop(); nav.scrollTop = nav.scrollHeight;
      const r = last.getBoundingClientRect(), l = $('#bLock').getBoundingClientRect(); return [getComputedStyle(nav.querySelector('.qk')).display, r.bottom <= l.top]; }), ['none', true]);
    await A.setViewportSize({width: 400, height: 860}); await A.evaluate(() => go('home')); await A.settle(300);


    }   // نهاية الأقسام اللي بتتخطى في وضع الشكل
    }   // نهاية RUN.sync
    if (RUN.smoke) {
      sec('الشكل: كل الصفحات بتفتح من غير أخطاء');
      /* بعد تعديل شكل بس: البرنامج بيفتح، الحسابات والخزنة والتقارير والإعدادات بترسم، والصفحات التانية بتفتح من غير أخطاء */
      for (const g of ['home', 'cash', 'rep', 'set']) { await A.evaluate(x => go(x), g); await A.settle(400); }
      await A.evaluate(n => go('p/' + liveParties().find(x => x.name === n).id), 'عميل تجربة واحد'); await A.settle(400);
      eq('صفحة الحساب بترسم والرصيد سليم', [await A.evaluate(() => !!document.querySelector('main table')), await bal(A, 'عميل تجربة واحد')], [true, 270000]);
      await A.setViewportSize({width: 1280, height: 860}); await A.settle(400);
      eq('اللاب توب: القايمة الجانبية ظاهرة', await A.evaluate(() => getComputedStyle(document.querySelector('nav')).display !== 'none'), true);
      await A.setViewportSize({width: 400, height: 860});
      for (const f of ['index.html', 'reader.html']) { const X = await D1.page(f); await X.settle(800); await X.close(); }
    }
    if (RUN.sw) sec('٢٣) sw.js: الحسابات بتفتح بسرعة والنت مقطوع أو بطيء، والنسخة الجديدة بتوصل لوحدها');
    if (RUN.sw) {
      const SWD = await newDevice(browser, base, sheets), now = () => Date.now();
      /* بنستنى الحاجة نفسها (الصفحة بتتعمل لها reload في النص، فـ waitForFunction بيقع) */
      const until = async (X, fn, arg, ms = 20000) => { const end = now() + ms; while (now() < end) { try { if (await X.evaluate(fn, arg)) return true; } catch (e) {} await new Promise(r => setTimeout(r, 100)); } return false; };
      const ctl = X => until(X, () => !!navigator.serviceWorker.controller);
      const hide = X => X.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable: true, get: () => true}); Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'hidden'}); document.dispatchEvent(new Event('visibilitychange')); });
      const inCache = (X, f, mark) => until(X, ([f, m]) => caches.match(f).then(r => r ? r.text() : '').then(t => t.includes(m)), [f, mark]);
      const orig = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
      const v = (f, n) => orig(f).replace('</body>', `<script>window.__v=${n}</script></body>`);
      const open = async f => { const t = now(); const X = await SWD.page(f); return [X, now() - t]; };

      const [S1] = await open('accounts.html'); await ctl(S1);
      const fonts = [400, 600, 700, 800].flatMap(w => ['arabic', 'latin'].map(l => `fonts/cairo-${l}-${w}-normal.woff2`));
      const need = ['index.html', 'accounts.html', 'accounts.webmanifest', 'lib/ui.css', 'lib/datepick.js', 'lib/swup.js', 'lib/icons.js', 'lib/doctor.js', 'lib/jspdf.umd.min.js', 'lib/html2canvas.min.js', 'fonts/fonts.css', ...fonts, 'icons/logo.jpg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
      const keys = await S1.evaluate(() => caches.open('gedda-acc-v1').then(c => c.keys()).then(ks => ks.map(k => new URL(k.url).pathname.slice(1))));
      eq('من أول فتحة: كل ملفات الحسابات اتخزنت (الصفحتين والخطوط وui.css وdatepick.js والأيقونات والـ manifest وأداة الـ PDF)', need.filter(f => !keys.includes(f)), []);
      const [Q0] = await open('reader.html'); await Q0.close();
      await S1.close();

      SRV.down = true;
      let X, ms;
      {   // الوقت لحد ما شاشة كلمة السر تظهر فعلاً (بتترسم بعد ما الصفحة تفتح بلحظة، فالقراية على طول كانت بتقع أحياناً)
        const t0 = now(); [X] = await open('accounts.html'); const ok = await X.waitForSelector('#suP', {timeout: 5000}).then(() => true, () => false); ms = now() - t0;
        eq('النت مقطوع: الحسابات بتفتح من المحفوظ في أقل من 2 ثانية (شاشة إنشاء كلمة السر)', [ms < 2000, ok], [true, true]);
        eq('النت مقطوع: أداة الـ PDF بتتحمّل من المحفوظ', await X.evaluate(() => loadPdfLibs().then(() => !!(window.jspdf && window.html2canvas), () => false)), true);
      }
      [X, ms] = await open('reader.html');
      eq('النت مقطوع: قارئ النسخ بيفتح من المحفوظ', await X.evaluate(() => document.body.children.length > 0), true);
      await X.close();
      SRV.down = false;

      /* كلاود فلير بيشيل .html (بيحوّل payroll.html لـ /payroll). الـ SW كان بيرجّع الرد "متحوّل" فسفاري وكروم بيرفضوا يفتحوا الصفحة */
      SRV.pretty = true;
      const bad = [];
      for (const f of ['reader.html', 'index.html', 'accounts.html']) {
        let ok = false;
        try { const Y = await SWD.page(f); await Y.settle(400); ok = await Y.evaluate(() => !!document.body && document.body.children.length > 0 && !!document.querySelector('script')); await Y.close(); } catch (e) {}
        if (!ok) bad.push(f);
      }
      /* فتحة الحسابات التانية على كلاود فلير: من غير لفة التحويل، والملف الكبير مبيتنزلش تاني لو متغيرش (304) */
      SRV.log = [];
      try { const Y = await SWD.page('accounts.html'); await until(Y, () => !!document.querySelector('#suP, #lkP')); await Y.close(); } catch (e) {}
      const acc = SRV.log.filter(x => /^\/accounts(\.html)?$/.test(x.u)).map(x => x.u + ' ' + x.st);
      SRV.log = null; SRV.pretty = false;
      eq('كلاود فلير (من غير .html): كل الصفحات بتفتح من خلال الـ SW', bad, []);
      eq('كلاود فلير: فتح الحسابات تاني = طلب واحد صغير (304) من غير تحويل', acc, ['/accounts 304']);

      /* نت بطيء من غير نسخة جديدة: الحسابات بتفتح من المحفوظ على طول (مش بتستنى النت) */
      SRV.slow = {'accounts.html': 6000};
      [X, ms] = await open('accounts.html');
      eq('نت بطيء: الحسابات بتفتح بالمحفوظ في أقل من ثانية ونص', [ms < 1500, await X.evaluate(() => !!$('#suP'))], [true, true]);
      await X.close(); SRV.slow = {};

      /* الحسابات: نت بطيء ونسخة جديدة. بتتفتح لوحدها بس على شاشة القفل وخانة كلمة السر فاضية */
      SRV.body = {};
      [X] = await open('accounts.html'); await ctl(X); await unlock(X, true); await X.click('#bLock'); await X.waitForSelector('#lkP'); await X.close();
      SRV.slow = {'accounts.html': 6000}; SRV.body = {'accounts.html': v('accounts.html', 2)};
      [X, ms] = await open('accounts.html'); await X.waitForSelector('#lkP');
      eq('نت بطيء: الحسابات بتفتح بالمحفوظ في أقل من 4.5 ثانية', [ms < 4500, await X.evaluate(() => !window.__v)], [true, true]);
      await X.fill('#lkP', '24'); await inCache(X, 'accounts.html', '__v=2'); await X.settle(800);
      eq('الحسابات: النسخة الجديدة مستنية وانت بتكتب كلمة السر', await X.evaluate(() => [!window.__v, $('#lkP').value]), [true, '24']);
      await X.fill('#lkP', '');
      eq('الحسابات: اتفتحت لوحدها أول ما الخانة فضيت', await until(X, () => window.__v === 2), true);
      await X.waitForSelector('#lkP'); await unlock(X);
      eq('الحسابات: البيانات زي ما هي (كلمة السر بتفتح نفس القاعدة)', await X.evaluate(() => [!!db, $('#lock').classList.contains('on')]), [true, false]);
      await X.close();
      SRV.slow = {}; SRV.body = {};

      /* باقي الأدوات: الشبكة أولاً زي الأول (نسخة جديدة بتظهر على طول) */
      SRV.body = {'reader.html': v('reader.html', 5)};
      [X] = await open('reader.html');
      eq('قارئ النسخ: النسخة الجديدة بتظهر على طول (الشبكة أولاً)', await X.evaluate(() => window.__v), 5);
      SRV.body = {};
      await SWD.close();
    }

    sec('الشكل الموحد (lib/ui.css): 5 أحجام خط بس');
    /* كل كلام وأرقام الشاشة بأحجام النظام الخمسة بس (--f1..--f5)، ماعدا الأيقونات والأسهم وورقة الـ PDF */
    if (await A.$('#mask.on')) await A.evaluate(() => closeModal());
    await A.evaluate(() => go('home')); await A.settle(300);
    eq('الحسابات (الرئيسية): الخط بالخمس أحجام بس', await fs5(A), [true, []]);
    await A.evaluate(n => go('p/' + liveParties().find(x => x.name === n).id), 'عميل تجربة واحد'); await A.settle(300);
    eq('الحسابات (صفحة الحساب): الخط بالخمس أحجام بس', await fs5(A), [true, []]);

    eq('الإعدادات: قايمة مقفولة أول مرة، كارت الحالة فوق، والدوس على العنوان بيفتح ويقفل ', await A.evaluate(() => {
      localStorage.removeItem('gd_setopen'); $$('#p-set > .card').forEach(c => c.classList.add('shut')); go('set'); renderSettings();
      const cards = $$('#p-set > .card.fold'), r = [cards.length >= 8, cards.every(c => c.classList.contains('shut')), !!$('#sStat b'), !!$('#sStatGo')];
      const m = $('#p-set > .card.fold h2'), c = m.closest('.card'); m.click(); r.push(!c.classList.contains('shut')); m.click(); r.push(c.classList.contains('shut'));
      go('home'); return r; }), [true, true, true, true, true, true]);
    sec('قاعدة التبويبات: سطر واحد ونفس الارتفاع ومفيش كلام مقطوع');
    /* أي مجموعة تبويبات (.seg) ظاهرة: كل زرار نفس الارتفاع، الكلام مش ملفوف على سطرين ولا متقطع */
    for (const k of ['profit', 'col', 'debt', 'tot', 'cash', 'item']) { await A.evaluate(k => { go('rep'); repKind = k; renderReports(); }, k); await A.settle(150); await segOk(A, 'الحسابات — التقارير (' + k + ')'); }
    await A.evaluate(() => { cashView = 'type'; go('cash'); renderCash(); $('#cPer').classList.add('pk'); }); await A.settle(200); await segOk(A, 'الحسابات — الخزنة (النهارده/الأسبوع/الشهر/من لـ)');
        await A.evaluate(() => go('set')); await A.settle(200); await segOk(A, 'الحسابات — الإعدادات');

    sec('قاعدة الأرقام: تحت بعض في عمود واحد (الحسابات والخزنة)');
    /* كل رقم في القايمة (وإجمالي القسم بتاعها) بيبدأ من نفس الخط على الشمال بالظبط: مفيش رقم داخل ورقم خارج */
    await A.evaluate(() => { go('cash'); cashView = 'type'; cashMode = 'year'; renderCash(); }); await A.settle(300);
    await colOk('الحسابات — الخزنة (اتحصّل)', A, '#fbIn', '.n');
    await colOk('الحسابات — الخزنة (اتدفع)', A, '#fbOut', '.n');
    if (await A.evaluate(() => !isWide())) eq('الخزنة على الموبايل: الأدوات ورا ⋯ جوه الكارت الأسود', await A.evaluate(() => {
      const v = e => e && getComputedStyle(e).display !== 'none', r = [v($('#cMore')), !v($('#cTr')), !!$('#p-cash .kf #cMore')];
      $('#cMore').click(); r.push($$('#modal .kmenu [data-b]').length === 4); $('#modal [data-b=cOpen2]').click(); r.push($('#mask').classList.contains('on') && !$('#modal .kmenu')); closeModal(); return r; }), [true, true, true, true, true]);
    {   // الاتنين على نفس الحسابات: الاسم على كل حركة، واللي اتعمل، وتحذير التكرار بالاسم، ومقارنة الشركاء، وقفل الشهر
      const r = await A.evaluate(async () => {
        closeModal(); const me = meName(), r = [me === 'جهاز تجربة'], n0 = db.txs.length, v = vaultsL()[0].id, c = catsL('exp')[0].id;
        const mk = () => { txModal('exp'); $('#txA').value = fmtP(1234); $('#txD').value = todayISO(); $('#txC').value = c; $('#txV').value = v; $('#txOk').click(); };
        mk(); const t = db.txs[n0]; r.push(db.txs.length === n0 + 1 && t.by === me && t.cby === me);
        mk(); r.push(db.txs.length === n0 + 1 && $('#toast').textContent.includes('بواسطة ' + me) && $('#txOk').textContent.includes('متأكد'));
        $('#txOk').click(); r.push(db.txs.length === n0 + 2);
        /* سجل جاي من الجهاز التاني (متزامن) بيفضل باسم صاحبه */
        const o = db.txs[n0 + 1]; o.by = 'شريك تاني'; o.cby = 'شريك تاني'; o.sy = o.upd; saveDB(); r.push(o.by === 'شريك تاني');
        const L = actItems(todayISO()); r.push(L.some(x => x.r === t && x.by === me && x.w === 'سجّل'), L.some(x => x.r === o && x.by === 'شريك تاني'));
        go('act'); renderAct(); r.push($('#p-act').textContent.includes('شريك تاني') && $$('#p-act .pt.act').length === L.length);
        [t, o].forEach(x => { x.del = true; touch(x); }); saveDB();
        const h = partCmpHtml([{p: {name: 'أ'}, sal: 100, draw: 400}, {p: {name: 'ب'}, sal: 0, draw: 200}]); r.push(h.includes('<b>أ</b> خد أكتر من <b>ب</b>') && h.includes(fmtP(300)), partCmpHtml([{p: {name: 'أ'}, sal: 0, draw: 0}]) === '');
        go('set'); renderSettings(); const lk = lockDate(); r.push(!lk || lk < addDays(todayISO().slice(0, 8) + '01', -1) ? !!$('#sLockPrev') : !$('#sLockPrev'));
        return r; });
      eq('الاتنين على نفس الحسابات: اسم الجهاز على الحركة، وتحذير التكرار بيقول مين سجّلها، واللي جاي من الجهاز التاني باسمه، و"اللي اتعمل" فيه الاتنين، ومقارنة الشركاء، وزرار قفل الشهر', r, [true, true, true, true, true, true, true, true, true, true, true]);
      eq('خزنة واحدة: اختيار الخزنة مخفي في النافذة', await A.evaluate(() => { const keep = vaultsL().slice(1); keep.forEach(x => { x.shut = 1; }); txModal('exp'); const hid = getComputedStyle($('#txV').closest('.fld') || $('#txV').parentElement).display === 'none'; closeModal(); keep.forEach(x => { delete x.shut; }); return hid; }), true);
    }
    {   // عروض الأسعار: مبتلمسش أي رصيد، والـ PDF، و"اتنفذ" بيعمل فاتورة بنفس البنود، واسم ملوش حساب بيتعمله حساب، و"اتلغى"
      const r = await A.evaluate(async () => {
        closeModal(); const bal = () => JSON.stringify([...allBalances()]), b0 = bal(), n0 = db.entries.length, p = liveParties().find(x => x.sec !== 'sup'), r = [];
        const fill = () => { const li = $$('#dcLines .li')[0]; li.querySelector('[data-f=name]').value = 'صنف عرض تجربة'; li.querySelector('[data-f=qty]').value = '10'; li.querySelector('[data-f=price]').value = '250'; li.querySelector('[data-f=price]').dispatchEvent(new Event('input')); };
        docModal(p, 'qt'); r.push(!!$('#dcDays') && $('#dcDays').value === String(qtLast().days)); $('#dcDays').value = '14'; fill(); $('#dcOk').click();
        const q = db.qts[db.qts.length - 1]; r.push(!!q && q.st === 'w' && q.party === p.id && docTotal(q) === 250000 && q.by === meName(), db.entries.length === n0 && bal() === b0, !!$('#qvDo'));
        const pg = buildStmtPages(p, qtStmt(q)); r.push(pg.length === 1 && pg[0].textContent.includes('عرض سعر') && pg[0].textContent.includes('ساري حتى')); $('#render').innerHTML = '';
        const keep = $('#modal').innerHTML; renderParty(p.id); r.push(!!$(`#p-party .qtc[data-q="${q.id}"]`)); qtView(q);
        $('#qvDo').click(); await new Promise(res => setTimeout(res, 30));
        r.push($$('#dcLines .li').length === 2 && $('#dcLines [data-f=name]').value === 'صنف عرض تجربة' && !!keep);
        $('#dcOk').click(); if ($('#dcOk') && /متأكد/.test($('#dcOk').textContent)) $('#dcOk').click();
        const inv = E.get(q.inv); r.push(q.st === 'd' && !!inv && inv.kind === 'inv' && docTotal(inv) === 250000 && inv.party === p.id);
        qtNew(); $('#qnN').value = 'اسم عرض تجربة جديد'; $('#qnOk').click(); fill(); $('#dcOk').click();
        const q2 = db.qts[db.qts.length - 1]; r.push(q2 !== q && q2.party === '' && q2.name === 'اسم عرض تجربة جديد' && $('#modal').textContent.includes('لسه ملوش حساب'));
        $('#qvDo').click(); await new Promise(res => setTimeout(res, 30)); $('#cOk').click(); await new Promise(res => setTimeout(res, 30));
        const np = liveParties().find(x => x.name === 'اسم عرض تجربة جديد'); r.push(!!np && q2.party === np.id && $('#modal').textContent.includes('اسم عرض تجربة جديد') && !!$('#dcLines'));
        closeModal(); qtView(q2); $('#qvNo').click(); r.push(q2.st === 'x');
        go('qt'); renderQts(); r.push($$('#p-qt .qtr').length === liveQts().filter(x => x.st === 'w').length);
        $('#qtF [data-v=x]').click(); r.push(!!$(`#p-qt [data-q="${q2.id}"]`), actItems(todayISO()).some(x => x.r === q2 && x.k === 'q'));
        r.push(q.till === addDays(q.date, 14));
        [inv, q, q2, np].forEach(x => { x.del = true; touch(x); }); saveDB(); closeModal(); r.push(bal() === b0); qtF = 'w';
        return r; });
      eq('عروض الأسعار: بتتسجل من غير ما أي رصيد يتغير، والـ PDF مكتوب عليه "عرض سعر"، و"اتنفذ" بيعمل فاتورة بنفس البنود، والاسم الجديد بيتعمله حساب، و"اتلغى"، وصفحة العروض و"اللي اتعمل"', r, Array(16).fill(true));
    {   // شروط عرض السعر: الضريبة 14% والنقل بيتضافوا ويتحسبوا، والشروط مكتوبة تحت، والسادة من غير لوجو ولا اسم الشركة، و"اتنفذ" بينقلهم للفاتورة
      const r = await A.evaluate(async () => {
        closeModal(); const p = liveParties().find(x => x.sec !== 'sup'), r = [];
        docModal(p, 'qt'); const li = $$('#dcLines .li')[0]; li.querySelector('[data-f=name]').value = 'صنف شروط تجربة'; li.querySelector('[data-f=qty]').value = '4'; li.querySelector('[data-f=price]').value = '250'; li.querySelector('[data-f=price]').dispatchEvent(new Event('input'));
        $('#dcDays').value = '10'; $('#dcVat [data-v=v]').click(); $('#dcTr [data-v=in]').click(); r.push(!$('#dcShipF').hidden);
        $('#dcShip').value = '100'; $('#dcShip').dispatchEvent(new Event('input')); $('#dcTerms').value = 'شرط تجربة أول\n\n شرط تجربة تاني ';
        r.push($('#dcTot').textContent.includes(fmtP(Math.round(110000 * 1.14))));
        $('#dcOk').click(); const q = db.qts[db.qts.length - 1], x = qtSums(q);
        r.push(q.vat === 'v' && q.tr === 'in' && q.shipA === 10000 && q.terms === 'شرط تجربة أول\nشرط تجربة تاني' && x.vat === 15400 && qtTotal(q) === 125400 && docTotal(q) === 100000);
        r.push($('#modal').textContent.includes(fmtP(125400)) && !!$('#qvKind'));
        const t1 = buildStmtPages(p, qtStmt(q))[0].textContent; $('#render').innerHTML = '';
        r.push(t1.includes('جَدة') && t1.includes('ضريبة القيمة المضافة 14%') && t1.includes('مصاريف النقل') && t1.includes(fmtP(125400)) && t1.includes('الشروط والأحكام') && t1.includes('ساري لمدة 10 أيام') && t1.includes('شرط تجربة تاني'));
        const pg = buildStmtPages(p, qtStmt(q, true))[0], t2 = pg.textContent; $('#render').innerHTML = '';
        r.push(pg.classList.contains('plain') && !pg.querySelector('img') && !t2.includes('جَدة') && t2.includes('عرض سعر') && t2.includes(fmtP(125400)) && t2.includes('الشروط والأحكام'));
        docModal(p, 'qt'); r.push($('#dcVat .on').dataset.v === 'v' && $('#dcTr .on').dataset.v === 'in' && $('#dcTerms').value.includes('شرط تجربة أول')); closeModal();
        docModal(p, 'inv', null, {qt: q}); const ns = $$('#dcLines [data-f=name]').map(x => x.value); r.push(ns.includes('مصاريف النقل') && ns.includes('ضريبة القيمة المضافة 14%') && $('#dcTot').textContent.includes(fmtP(125400)));
        closeModal(); q.del = true; touch(q); saveDB();
        return r; });
      eq('شروط عرض السعر: الضريبة 14% والنقل بيتحسبوا ويتضافوا، والشروط مكتوبة تحت بصيغة رسمية، والسادة من غير لوجو، والعرض الجديد بنفس الشروط، و"اتنفذ" بينقلهم للفاتورة', r, Array(8).fill(true));
    }
      await A.evaluate(() => { const now = nowS(), p = liveParties().find(x => x.sec !== 'sup'); [[12345600, 'qa'], [98700, 'qb'], [4500000, 'qc']].forEach(([price, id]) => { const q = {id: 'q_col' + id, kind: 'qt', party: p.id, name: '', no: 0, st: 'w', inv: '', date: todayISO(), till: '', lines: [{name: 'صنف', unit: 'كيلو', qty: 1, price}], disc: 0, note: '', at: now, upd: now, del: false, hist: []}; db.qts.push(q); IDX.qt.set(q.id, q); }); go('qt'); renderQts(); });
      await colOk('الحسابات — عروض الأسعار', A, '#qtL', '.pt .a b');
      await A.evaluate(() => { db.qts.filter(q => q.id.startsWith('q_col')).forEach(q => { q.del = true; touch(q); }); saveDB(); });
    }
    {   // الطلبات والتسعير: مبيلمسوش أي رصيد. الطلبية بالكيلو = اللفف × وزن اللفة، ولسه متسلمتش / اتسلمت، والمتأخرة. الخلطة: سعر البيع والعكس
      const r = await A.evaluate(async () => {
        closeModal(); const bal = () => JSON.stringify([...allBalances()]), b0 = bal(), n0 = db.entries.length, p = liveParties().find(x => x.sec !== 'sup'), r = [];
        go('ord'); await new Promise(res => setTimeout(res, 30)); const w0 = liveOrds().filter(o => o.st === 'w').length;
        $('#orNew').click(); $('#orN').value = p.name;
        const li = $('#orLines .orl'), set = (k, v) => { const i = li.querySelector(`[data-f=${k}]`); i.value = v; i.dispatchEvent(new Event('input')); };
        set('name', 'صنف طلبية تجربة'); set('rolls', '40'); set('w', '4.8');
        r.push(li.querySelector('[data-f=kg]').value === '192' && li.querySelector('[data-f=kg]').readOnly);
        $('#orAdd').click(); const l2 = $$('#orLines .orl')[1]; l2.querySelector('[data-f=name]').value = 'صنف بالكيلو تجربة'; l2.querySelector('[data-f=name]').dispatchEvent(new Event('input')); l2.querySelector('[data-f=kg]').value = '30'; l2.querySelector('[data-f=kg]').dispatchEvent(new Event('input'));
        $('#orDue [data-v="' + addDays(todayISO(), 1) + '"]').click(); $('#orOk').click();
        const o = db.ords[db.ords.length - 1];
        r.push(!!o && o.party === p.id && o.st === 'w' && o.due === addDays(todayISO(), 1) && o.lines.length === 2 && o.lines[0].kg === 192 && o.lines[1].kg === 30 && o.by === meName(), db.entries.length === n0 && bal() === b0);
        r.push(location.hash === '#ord' && $$('#p-ord .orc').length === w0 + 1 && $(`#p-ord .orc[data-o="${o.id}"]`).textContent.includes('40 لفة صنف طلبية تجربة · 4.8 ك = 192 ك') && $(`#p-ord .orc[data-o="${o.id}"]`).textContent.includes('التسليم: بكرة'));
        o.due = addDays(todayISO(), -2); touch(o); saveDB(); renderOrds(); r.push($(`#p-ord .orc[data-o="${o.id}"]`).classList.contains('late') && $(`#p-ord .orc[data-o="${o.id}"]`).textContent.includes('متأخرة يومين'));
        $(`#p-ord [data-d="${o.id}"]`).click(); r.push(o.st === 'd' && !$(`#p-ord .orc[data-o="${o.id}"]`), actItems(todayISO()).some(x => x.r === o && x.w === 'علّم اتسلمت'));
        $('#orF [data-v=d]').click(); r.push(!!$(`#p-ord .orc[data-o="${o.id}"]`));
        renderHome(); r.push(!$('#hOrd') || ($('#hOrd small') ? +$('#hOrd small').textContent : 0) === liveOrds().filter(x => x.st === 'w').length);
        /* التسعير: 70% × 65 + 30% × 55 = 62، + 6 تشغيل = 68، + 10% ربح = 74.80 */
        go('prc'); await new Promise(res => setTimeout(res, 30)); if (!liveMixs().length) $('#mxFirst').click(); else $('#mxAdd').click();
        const m = liveMixs().pop(), inp = (sel, v) => { const i = $(sel); i.value = v; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); };
        inp('#mxR .mxr[data-i="0"] [data-f=name]', 'خامة أ تجربة'); inp('#mxR .mxr[data-i="0"] [data-f=price]', '65'); inp('#mxR .mxr[data-i="1"] [data-f=name]', 'خامة ب تجربة'); inp('#mxR .mxr[data-i="1"] [data-f=price]', '55');
        inp('#mxR .mxr[data-i="0"] [data-f=pct]', '70'); r.push(m.rows[1].pct === 30 && $('#mxR .mxr[data-i="1"] [data-f=pct]').value === '30');
        inp('#mxRun', '6'); inp('#mxPro', '10');
        r.push(Math.round(mixKg(m)) === 6200 && Math.round(mixCost(m)) === 6800 && mixSell(m) === 7480 && $('#mxRes .big').textContent === fmtP(7480), (m.hist || []).length === 1 && m.by === meName());
        inp('#mxWant', '72.6'); r.push(!!$('#mxUse') && $('#mxRevOut').textContent.includes('50%')); $('#mxUse').click(); r.push(m.rows[0].pct === 50 && mixSell(m) === 7260);
        inp('#mxWant', '200'); r.push($('#mxRevOut').textContent.includes('مينفعش'));
        r.push(db.entries.length === n0 && bal() === b0, 'ord' in STORE && 'mix' in STORE);
        [o, m].forEach(x => { x.del = true; touch(x); }); saveDB(); ordF = 'w'; mixCur = ''; go('home');
        return r; });
      eq('الطلبات: الكيلو = اللفف × وزن اللفة، بتتسجل بالاسم من غير رصيد، المتأخرة بالأحمر، "اتسلمت" بتنقلها وتظهر في "اللي اتعمل". التسعير: 70/30 من 65 و55 + 6 + 10% = 74.80، والنسبة التانية بتتظبط لوحدها، والعكس بيقول تخلط بكام', r, Array(17).fill(true));
    }
    {   // تنبيه النسخة الاحتياطية: على اللاب بس، لما يعدّي BK_DAYS يوم من غير نسخة
      await A.setViewportSize({width: 1280, height: 800}); await A.settle(200);
      const r = await A.evaluate(() => {
        const lb = db.cfg.lastBackup, r = [], has = () => (go('home'), renderHome(), !!$('#hBk'));
        db.cfg.lastBackup = nowS() - BK_DAYS * 86400000 - 1000; r.push(has() && $('#hBk').textContent.includes('بقالك'));
        db.cfg.lastBackup = 0; r.push(has() && $('#hBk').textContent.includes('لسه'));
        db.cfg.lastBackup = nowS() - 86400000; r.push(!has());
        db.cfg.lastBackup = 0; has(); $('#hBk').click(); r.push(location.hash === '#set');
        db.cfg.lastBackup = lb; return r; });
      await A.setViewportSize({width: 400, height: 860}); await A.settle(200);
      r.push(await A.evaluate(() => { const lb = db.cfg.lastBackup; db.cfg.lastBackup = 0; go('home'); renderHome(); const x = !$('#hBk'); db.cfg.lastBackup = lb; renderHome(); return x; }));
      eq('تنبيه النسخة الاحتياطية: بيظهر على اللاب لو عدّى 3 أيام أو مفيش نسخة خالص، ومش بيظهر لو فيه نسخة جديدة ولا على الموبايل، والدوس بيودّي للإعدادات', r, Array(5).fill(true));
    }
    {   // الموبايل: السحب لتحت مزامنة مش تحديث، زرار الرجوع بيقفل النافذة، والدوس على التبويب اللي انت فيه بيطلّع لفوق
      eq('السحب لتحت: المتصفح مايعملش تحديث للصفحة (البرنامج نفسه بيزامن)', await A.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY), 'none');
      await A.evaluate(() => { closeModal(); go('cash'); }); await A.settle(200);
      const pH = await A.evaluate(n => { go('p/' + liveParties().find(x => x.name === n).id); return location.hash; }, 'عميل تجربة واحد'); await A.waitForSelector('#fbPay');
      await A.click('#fbPay'); await A.waitForSelector('#pyX');   // بدوسة حقيقية زي الموبايل
      await A.goBack({waitUntil: 'commit'}); await A.waitForFunction(() => !$('#mask').classList.contains('on'), null, {timeout: 3000}).catch(() => {}); await A.settle(200);   // زرار الرجوع بتاع المتصفح نفسه
      const r1 = await A.evaluate(() => [!$('#mask').classList.contains('on'), location.hash]);
      await A.click('#fbPay'); await A.click('#pyX');
      await A.settle(200);
      await A.goBack({waitUntil: 'commit'}); await A.waitForFunction(() => location.hash === '#cash', null, {timeout: 3000}).catch(() => {});
      eq('زرار الرجوع: بيقفل النافذة المفتوحة ويفضل في نفس الصفحة، ولو النافذة اتقفلت بزرارها الرجوع بيودّي للصفحة اللي قبلها على طول', [...r1, await A.evaluate(() => location.hash)], [true, pH, '#cash']);
      eq('زرار الرجوع في أول صفحة: "دوس رجوع تاني علشان تخرج" بدل ما يخرج على طول', await A.evaluate(() => {
        const st = history.state; history.replaceState({gdbase: 1}, ''); exitAt = 0; dispatchEvent(new PopStateEvent('popstate', {state: {gdbase: 1}}));
        const r = [$('#toast').textContent.includes('رجوع تاني'), !(history.state && history.state.gdbase)]; history.replaceState(st, ''); return r; }), [true, true]);
      await A.evaluate(() => go('rep')); await A.settle(300);
      await A.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await A.waitForFunction(() => window.scrollY > 100, null, {timeout: 3000}).catch(() => {});
      await A.click('nav button[data-go=rep]'); await A.waitForFunction(() => window.scrollY === 0, null, {timeout: 3000}).catch(() => {});
      eq('الدوس على التبويب اللي انت فيه وانت تحت: بيطلّعك لأول الصفحة', await A.evaluate(() => [window.scrollY, location.hash]), [0, '#rep']);
      await A.evaluate(() => go('home')); await A.settle(200);
    }
    {   // زرار تثبيت البرنامج: أندرويد (رسالة Chrome) وآيفون (شرح الخطوات)، وبيختفي أول ما يتثبت
      const r = await A.evaluate(async () => {
        go('home'); renderHome(); const r = [!$('#hInst')];   // من غير ما Chrome يقول إن التثبيت متاح: مفيش زرار
        let asked = 0; const ev = new Event('beforeinstallprompt', {cancelable: true}); ev.prompt = () => { asked++; }; ev.userChoice = Promise.resolve({outcome: 'accepted'});
        dispatchEvent(ev); r.push(ev.defaultPrevented, !!$('#hInst'));
        go('set'); renderSettings(); r.push(!$('#sInstC').hidden);
        await instGo(); r.push(asked === 1, $('#sInstC').hidden);
        go('home'); renderHome(); r.push(!$('#hInst'));
        const ev2 = new Event('beforeinstallprompt', {cancelable: true}); ev2.prompt = () => {}; ev2.userChoice = new Promise(() => {}); dispatchEvent(ev2); r.push(!!$('#hInst'));
        dispatchEvent(new Event('appinstalled')); r.push(!$('#hInst'));
        return r; });
      eq('زرار التثبيت (أندرويد): بيظهر بس لما Chrome يقول إن التثبيت متاح، والدوسة بتفتح رسالة التثبيت، وبيختفي بعد التثبيت', r, Array(9).fill(true));
      const ictx = await browser.newContext({viewport: {width: 390, height: 844}, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'});
      const I = await ictx.newPage(); await I.goto(base + '/accounts.html'); await I.waitForSelector('#suInst', {timeout: 10000}).catch(() => {});
      const hasBtn = !!(await I.$('#suInst')); if (hasBtn) await I.click('#suInst');
      eq('زرار التثبيت (آيفون): بيظهر في شاشة أول مرة، والدوسة بتشرح خطوات Safari', [hasBtn, hasBtn && (await I.textContent('#modal')).includes('إضافة إلى الشاشة الرئيسية')], [true, true]);
      await ictx.close();
    }
    {   // رابط الربط مع التثبيت: أندرويد (البرنامج المتثبت بيلاقي الرابط)، والآيفون (زرار نسخ الرابط ولصقه في البرنامج المتثبت)
      const jctx = await browser.newContext({viewport: {width: 390, height: 844}, permissions: ['clipboard-read', 'clipboard-write']});
      const J1 = await jctx.newPage(); await J1.goto(base + '/accounts.html'); await J1.waitForSelector('#suGo');
      const link = await J1.evaluate(() => location.origin + location.pathname + '#join=' + b64u(JSON.stringify({u: 'https://script.google.com/macros/s/tst/exec', k: 'k_tst'})));
      await J1.close(); const J0 = await jctx.newPage(); await J0.goto(link); await J0.waitForFunction(() => !!localStorage.getItem('gd_join'), null, {timeout: 10000}).catch(() => {});   // فتح الرابط في المتصفح
      const J2 = await jctx.newPage(); await J2.goto(base + '/accounts.html'); await J2.waitForSelector('#suGo');   // البرنامج المتثبت: صفحة جديدة من غير الرابط
      const r = [await J2.evaluate(() => !!pendingJoin && pendingJoin.k === 'k_tst' && getComputedStyle($('#suJoin').closest('details')).display === 'none')];
      r.push(await J2.evaluate(() => { const l = JSON.parse(localStorage.getItem('gd_join')); l.t -= 3 * 864e5; localStorage.setItem('gd_join', JSON.stringify(l)); return true; }));
      const J3 = await jctx.newPage(); await J3.goto(base + '/accounts.html'); await J3.waitForSelector('#suGo');
      r.push(await J3.evaluate(() => !pendingJoin && !localStorage.getItem('gd_join')));   // الرابط القديم (أكتر من يومين) بيتنسي
      await J3.evaluate(t => navigator.clipboard.writeText(t), link); await J3.click('#suJoin >> xpath=ancestor::details/summary'); await J3.click('#suPaste'); await J3.waitForFunction(() => !!$('#suErr').textContent, null, {timeout: 5000}).catch(() => {});
      r.push(await J3.evaluate(() => $('#suJoin').value.includes('#join=') && $('#suErr').textContent.includes('اتلصق')));
      await jctx.close();
      eq('رابط الربط مع التثبيت: البرنامج المتثبت على أندرويد بيلاقي الرابط لوحده (لحد يومين)، وزرار "الصق" بيحط الرابط في شاشة أول مرة', r, [true, true, true, true]);
      eq('رابط الربط محفوظ وفيه حسابات على الجهاز: بيتنسي ومبيربطش الجهاز بشيت تاني', await A.evaluate(async () => {
        localStorage.setItem('gd_join', JSON.stringify({h: '#join=x', t: Date.now()})); joinLocal = true; pendingJoin = {u: 'https://x', k: 'y'};
        await showLock(); const r = !pendingJoin && !localStorage.getItem('gd_join'); return r; }), true);
      await unlock(A);
      const r2 = await A.evaluate(async () => {
        pendingJoin = {u: 'https://script.google.com/macros/s/tst/exec', k: 'k_tst'}; instEv = null; await instGo();
        const r = [!!$('#inCopy')]; await $('#inCopy').onclick();
        r.push((await navigator.clipboard.readText()) === joinUrl(pendingJoin), $('#inCopy') ? $('#inCopy').textContent.includes('اتنسخ') : false);
        pendingJoin = null; closeModal(); return r; });
      eq('زرار التثبيت على الآيفون: بيقول انسخ رابط الربط الأول، والدوسة بتنسخ الرابط', r2, [true, true, true]);
    }
    {   // دليل التطبيق والفتح بالبصمة في الإعدادات
      eq('الإعدادات: زرار دليل التطبيق بيفتح guide.html في صفحة لوحدها، وكارت البصمة لوحده بزرار تشغيل', await A.evaluate(async () => {
        go('set'); renderSettings(); await refreshBio(); const g = $('#sGuide');
        return [g.getAttribute('href'), g.target, !$('#sBioC').hidden === bioOk(), $('#sBio').textContent.includes('البصمة'), !$('#sPass').closest('.card').querySelector('#sBio')]; }), ['guide.html', '_blank', true, true, true]);
      eq('توقيع المطوّر آخر الإعدادات: الاسم والإصدار، والدوس بيفتح "عن البرنامج" بالجديد، وخطوطه محفوظة للفتح من غير نت', await A.evaluate(async () => {
        go('set'); renderSettings(); const m = $('#sMaker'), r = [m.textContent.includes('MOSTAFA ABD ELHADY'), $('#sMakerV').textContent === 'VERSION ' + APP_VER];
        m.click(); r.push($('#modal').textContent.includes('الإصدار ' + APP_VER), $$('#modal .about li').length === APP_NEWS.length); closeModal();
        const sw = await (await fetch('sw.js')).text(); r.push(sw.includes('fonts/montserrat-sig-600.woff2') && sw.includes('fonts/cormorant-sig-600.woff2'));
        r.push(await document.fonts.load('600 16px GdSig', 'M').then(f => f.length > 0)); return r; }), [true, true, true, true, true, true]);
      eq('اختيار الاسم: الـ ✕ بيشيل الاسم من القايمة (من غير ما يلمس الحركات)، ولو اتكتب تاني بيرجع', await A.evaluate(() => {
        const me0 = db.cfg.me, n = 'اسم تجربة مؤقت'; db.cfg.me = n; putSet('t_mehide', 1); db.cfg.me = me0;   // سجل باسم التجربة
        askMe(true); const has = () => [...$$('#meKnown [data-me]')].some(b => b.dataset.me === n), r = [has()];
        $(`#meKnown [data-mex="${n}"]`).click(); r.push(!has(), getSet('meHide', []).includes(n), IDX.set.get('t_mehide').by === n); closeModal();
        askMe(true); r.push(!has()); $('#meN').value = n; $('#meOk').click(); r.push(!getSet('meHide', []).includes(n));
        db.cfg.me = me0; const t = IDX.set.get('t_mehide'); t.del = true; touch(t); saveDB(); return r; }), [true, true, true, true, true, true]);
      const G = await D1.page('guide.html');
      await G.evaluate(() => document.querySelectorAll('img').forEach(i => { i.loading = 'eager'; }));
      await G.waitForFunction(() => [...document.images].every(i => i.complete), null, {timeout: 15000}).catch(() => {});
      eq('دليل التطبيق: كل الصور بتظهر، وكل سطر في المحتويات بيودّي لجزء موجود، وفيه زرار PDF', await G.evaluate(() => [document.images.length >= 15, [...document.images].every(i => i.naturalWidth > 0),
        [...document.querySelectorAll('nav.toc a')].every(a => !!document.querySelector(a.getAttribute('href'))), !!document.querySelector('button[onclick="print()"]'), document.querySelector('footer .mkr-n').textContent === 'MOSTAFA ABD ELHADY']), [true, true, true, true, true]);
      await G.close();
    }
    {   // النسخ الاحتياطية: الحفظ الأوتوماتيك في فولدر على اللاب، وسطر النسخة اليومية على Drive
      const r = await A.evaluate(async () => {
        const root = await navigator.storage.getDirectory(), dir = await root.getDirectoryHandle('af_test', {create: true}), orig = window.showDirectoryPicker, r = [];
        for (let i = 0; i < 62; i++) await (await (await dir.getFileHandle(`gedda-accounts-${addDays('2020-01-01', i)}.json`, {create: true})).createWritable()).close();
        await (await (await dir.getFileHandle('notes.txt', {create: true})).createWritable()).close();
        window.showDirectoryPicker = async () => dir;
        go('set'); renderSettings(); r.push(!$('#sAfC').hidden && !!$('#afPick'));
        await $('#afPick').onclick();
        const names = []; for await (const [n] of dir.entries()) names.push(n);
        const f = await (await dir.getFileHandle(`gedda-accounts-${todayISO()}.json`)).getFile(), j = JSON.parse(await f.text());
        r.push(j.app === 'gedda-accounts-backup' && !!j.ct, names.filter(n => AF_RE.test(n)).length === AF_KEEP && names.includes('notes.txt') && !names.includes('gedda-accounts-2020-01-01.json'));
        r.push(!!(await idbGet('afDir')), $('#sAf').textContent.includes('شغال') && $('#sAf').textContent.includes('af_test'), db.cfg.lastBackup === db.cfg.afAt);
        saveDB(); r.push(!!afT); clearTimeout(afT); afT = null;
        await $('#afOff').onclick(); r.push(!afDir && !(await idbGet('afDir')) && !!$('#afPick'));
        window.showDirectoryPicker = orig; await root.removeEntry('af_test', {recursive: true});
        /* Drive */
        const box = document.createElement('div'); box.id = 'sDrv'; document.body.appendChild(box); driveBox();
        r.push(!!$('#drvGo')); $('#drvGo').click(); r.push(!!$('#bkDone') && !$('#modal').textContent.includes('اختياري')); $('#bkDone').click();
        const s = IDX.set.get('bkDrive'); r.push(!!s && s.by === meName() && $('#sDrv').textContent.includes('ركّبها ' + meName()));
        box.remove(); s.del = true; touch(s); saveDB();
        return r; });
      eq('النسخ الاحتياطية: فولدر اللاب بيتحفظ فيه ملف النهارده لوحده، وبيفضل آخر 60 يوم بس من غير ما يلمس ملفات تانية، وأي تغيير بيشغّل الحفظ، و"وقّفه"، وسطر Drive لحد ما حد يقول "عملتها" وباسمه', r, Array(11).fill(true));
    }
    await A.evaluate(() => { cashMode = 'day'; go('home'); }); await A.settle(300);
    await colOk('الحسابات — قايمة العملاء', A, '#hList', '.pt .a b');

    sec('١٥) المراجعة الداخلية');
    eq('مفيش أي مشكلة في المراجعة', await A.evaluate(() => selfCheck()), []);
    {   // فحص البيانات (lib/doctor.js): البيانات السليمة مفيهاش غلط، وكل غلطة بنحطها بقصد بيمسكها، ومبيغيّرش حاجة
      /* بيشتغل في الصفحة بـ bg (من غير ما نستنى الـ Promise من بره): كان بيقع ساعات بـ "Execution context was destroyed"
         من غير أي تنقل (الصفحة بتكمّل لآخرها سليمة)، زي المزامنة اللي فوق بالظبط */
      const R = await bg(A, '(' + (async () => {
        window.__st = 'a'; await drLoad(); window.__st = 'b'; clearTimeout(drT);
        const clean = await docRun(true); window.__st = 'c'; const keep = JSON.stringify(db), out = {cleanBad: clean.bad.map(x => x.t), txt: docText(clean, 'x').includes('كله سليم') || !!clean.warn.length};
        const p = liveParties()[0], v = vaultsAll()[0], d = '2026-11-01', at = nowS();
        db.entries.push({id: 'dz1', party: p.id, kind: 'pay', date: d, amt: 50000, cr: 40000, dr: 0, vault: v.id, at, upd: at, desc: 'دفعة'},
          {id: 'dz2', party: 'nope', kind: 'adj', date: d, dr: 100, cr: 0, at, upd: at, desc: 'يتيمة'},
          {id: 'dz3', party: p.id, kind: 'adj', date: d, dr: 700, cr: 0, at, upd: at, desc: 'خصم'}, {id: 'dz4', party: p.id, kind: 'adj', date: d, dr: 700, cr: 0, at: at + 60000, upd: at, desc: 'خصم'},
          {id: 'dz5', party: p.id, kind: 'adj', date: '2026-13-40', dr: 100, cr: 0, at, upd: at, desc: 'تاريخ'});
        db.txs.push({id: 'tz1', type: 'tr', vault: v.id, to: v.id, amt: 100, date: d, at, upd: at}, {id: 'tz2', type: 'exp', vault: v.id, cat: 'c_none', amt: 1e12, date: d, at, upd: at});
        reindex(); window.__st = 'd';
        const k = (await docRun(false)).bad.concat((await docRun(false)).warn).map(x => x.k.split(':')[0]);
        out.kinds = [...new Set(k)].sort();
        const vb = window.vaultBal, bl = window.balance;
        window.vaultBal = (id, b) => vb(id, b) + 1; window.balance = (id, b) => bl(id, b) + 1;   // معادلة "باظت" في تعديل جاي
        out.broke = [...new Set((await docRun(false)).bad.map(x => x.k.split(':')[0]))].filter(x => x === 'vb2' || x === 'bal2').sort();
        window.vaultBal = vb; window.balance = bl;
        /* أول فحص بيحفظ الموجود من غير تنبيه، وبعده أي غلطة جديدة بتتقال على طول */
        delete db.cfg.doc; out.first = docKeep(await docRun(false)).length;
        db.entries.push({id: 'dz6', party: 'nope2', kind: 'adj', date: d, dr: 100, cr: 0, at, upd: at, desc: 'جديدة'}); reindex();
        window.__st = 'e'; await docNow(); window.__st = 'f'; out.toast = $('#toast').textContent; out.homeLine = (renderHome(), !!$('#hDoc'));
        const after = JSON.stringify(Object.assign(JSON.parse(JSON.stringify(db)), {entries: db.entries.filter(e => !/^dz/.test(e.id)), txs: db.txs.filter(t => !/^tz/.test(t.id)), cfg: JSON.parse(keep).cfg}));
        out.same = after === keep;
        db = JSON.parse(keep); reindex(); delete db.cfg.doc; flushSave(); renderHome();
        return out;
      }) + ')()');
      if (typeof R === 'string') throw new Error(R);
      eq('فحص البيانات: البيانات التجريبية السليمة مفيهاش غلط أكيد', R.cleanBad, []);
      eq('فحص البيانات: مسك كل غلطة اتحطت بقصد', R.kinds, ['cat', 'date', 'neg', 'payamt', 'sc', 'trself', 'twin']);
      eq('فحص البيانات: لو حسبة الرصيد باظت بيكشفها (الخزنة والعميل)', R.broke, ['bal2', 'vb2']);
      eq('فحص البيانات: أول فحص على الجهاز مبينبّهش على القديم', R.first, 0);
      eq('فحص البيانات: الغلطة الجديدة بتتقال على طول وتظهر في الرئيسية', [/حاجة جديدة/.test(R.toast), R.homeLine], [true, true]);
      eq('فحص البيانات: مغيّرش أي حركة', R.same, true);
      await A.evaluate(() => go('set')); await A.settle(300);
      if (!(await A.evaluate(() => !!$('#sDocGo').offsetParent))) await A.click('#sDoc >> xpath=../h2');   // الكارت مقفول (كروت الإعدادات بتتفتح بدوسة)
      await A.click('#sDocGo'); await A.waitForSelector('#drX');
      eq('فحص البيانات: زرار "افحص دلوقتي" بيفتح النتيجة', await A.evaluate(() => /حركة ·/.test($('#modal').textContent) && /آخر فحص/.test($('#sDoc').textContent)), true);
      await A.evaluate(() => { closeModal(); delete db.cfg.doc; flushSave(); go('home'); }); await A.settle(300);
      /* الآيفون بيقطع الاتصال بالتخزين في الخلفية: الحفظ بيفتح اتصال جديد ويكمّل من غير رسالة "مش قادر يحفظ" */
      eq('الحفظ بعد ما الاتصال بالتخزين اتقطع: اتحفظ من غير تحذير', await A.evaluate(async () => {
        await flushSave(); idbP = Promise.resolve({transaction() { throw new Error('Connection to Indexed Database server lost'); }, close() {}});
        db.cfg.__t = 7; await flushSave(); const ok = !saveFailed && !!(await idbGet('vault')); delete db.cfg.__t; await flushSave(); return ok;
      }), true);
    }
    eq('مفيش أخطاء في الصفحات', D1.errs.concat(D2 ? D2.errs : [], DM ? DM.errs : []), []);
  } catch (e) { fails++; console.log('  ✖ الاختبار وقف:', e.message.split('\n').slice(0, 6).join(' | ')); console.log('    ' + (e.stack || '').split('\n').filter(l => /run\.js/.test(l)).slice(0, 3).join(' | ')); if (NAVS.length) console.log('    تحميل صفحات كامل:', NAVS.slice(-25).join(' || ')); try { if (global.__A) console.log('    حالة الحسابات بعدها:', JSON.stringify(await global.__A.evaluate(() => ({db: !!db, lock: $('#lock').classList.contains('on'), swUp: sessionStorage.getItem('sw_up'), now: Date.now(), st: window.__st, dz: db && db.entries.some(e => /^dz/.test(e.id)), dr: typeof docRun})))); } catch (x) {} if (process.env.DBG) console.log(e.stack); }
  await browser.close(); srv.close();
  if (SWP) {   // نتيجة قسم ٢٣ اللي اشتغل في نفس الوقت
    const {code, out} = await SWP, m = out.match(/(\d+) نجح، (\d+) فشل/);
    console.log('\n— قسم ٢٣ (اشتغل في نفس الوقت في عملية تانية) —\n' + out.split('\n').filter(l => !/نجح، \d+ فشل|^الأقسام:/.test(l)).join('\n').trim());
    if (m) { oks += +m[1]; fails += +m[2]; } else if (code || !m) { fails++; console.log('  ✖ قسم ٢٣ موصلش لآخره'); }
  }
  if (secT.length) secT[secT.length - 1].s = (Date.now() - secT[secT.length - 1].t) / 1000;
  console.log('\n— الوقت —');
  secT.forEach(x => console.log(`  ${String(Math.round(x.s || 0)).padStart(4)} ث  ${x.name}`));
  if (process.env.SETTLE_DEBUG && global.__caps) { const by = {}; global.__caps.forEach(c => { const k = c.who; by[k] = by[k] || {n: 0, ms: 0, at: c.at}; by[k].n++; by[k].ms += c.ms; }); console.log('CAPS', JSON.stringify(Object.entries(by).sort((a, b) => b[1].ms - a[1].ms).slice(0, 15), null, 1)); console.log('CAPMS', global.__caps.reduce((n, c) => n + c.ms, 0)); }
  console.log(`  الإجمالي ${Math.round((Date.now() - T0) / 1000)} ثانية (الانتظار الذكي: ${settleN} مرة، وصل للحد الأقصى ${settleCaps} مرة)`);
  console.log(`\n${fails ? '✖' : '✔'} ${oks} نجح، ${fails} فشل\n`);
  process.exit(fails ? 1 : 0);
})();
