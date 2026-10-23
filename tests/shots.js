/*
  صور الشاشات قبل وبعد أي تعديل شكل (بيانات تجريبية بس، مفيهاش أي اسم عميل حقيقي).
  التشغيل:
    node tests/shots.js <فولدر الصور>                 ← يصوّر النسخة اللي على الجهاز
    node tests/shots.js <فولدر الصور> --root=<فولدر>   ← يصوّر نسخة تانية (مثلاً git worktree من origin/main)
    --only=acc-list-m,acc-cash-m                       ← شاشات معينة بس
    --dark                                             ← كل الشاشات في الوضع الليلي (اسم الصورة بيخلص بـ -dk)
  كل شاشة بتتصور بنفس المقاس ونفس البيانات كل مرة، فالمقارنة بين "قبل" و"بعد" صورة بصورة.
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node-tools/node_modules/playwright'); }
const CHROME = process.env.PW_CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(f => fs.existsSync(f));
const args = process.argv.slice(2), opt = k => (args.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const OUT = path.resolve(args.find(a => !a.startsWith('--')) || 'shots');
const ROOT = path.resolve(opt('root') || path.join(__dirname, '..'));
const DARK = args.includes('--dark');
const ONLY = opt('only') ? opt('only').split(',') : null;
const PASS = '246810';
/* يوم ثابت للصور كلها علشان التواريخ متتغيرش بين "قبل" و"بعد" */
const NOW = Date.UTC(2026, 9, 11, 9, 30);
const iso = d => new Date(NOW - d * 86400000).toISOString().slice(0, 10);

function serve() {
  const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'};
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, {'Content-Type': types[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(r);
    }).listen(0, () => res(srv));
  });
}

/* ====================== بيانات الحسابات التجريبية ====================== */
const L = (name, unit, qty, price) => ({name, unit, qty, price});
function accData() {
  const P = [
    ['c1', 'mkt', 'مؤسسة تجربة للمقاولات العمومية', '01000000001'],
    ['c2', 'mkt', 'معرض تجربة الأمل', '01000000002'],
    ['c3', 'mkt', 'محل تجربة الجديد', ''],
    ['c4', 'mkt', 'عميل تجربة واحد', '01000000004'],
    ['c5', 'mkt', 'عميل تجربة اتنين', ''],
    ['c6', 'mkt', 'ورشة تجربة', '01000000006'],
    ['c7', 'mkt', 'عميل تجربة تلاتة', ''],
    ['c8', 'mkt', 'شركة تجربة للتوريدات', ''],
    ['c9', 'mkt', 'عميل تجربة أربعة', ''],
    ['c10', 'mkt', 'عميل تجربة خمسة', ''],
    ['w1', 'mkt', 'موقع تجربة التجمع', ''],
    ['w2', 'mkt', 'موقع تجربة أكتوبر', ''],
    ['s1', 'sup', 'مورد تجربة الخامات', ''],
    ['s2', 'sup', 'مورد تجربة الكرتون', '']];
  const E = [];
  const inv = (p, d, lines, no) => E.push({party: p, kind: p[0] === 's' ? 'pur' : 'inv', date: iso(d), no: String(no || ''), lines});
  const pay = (p, d, amt, method) => E.push({party: p, kind: p[0] === 's' ? 'ppay' : 'pay', date: iso(d), amt, method: method || 'نقدي'});
  const open = (p, d, dr, cr) => E.push({party: p, kind: 'open', date: iso(d), dr: dr || 0, cr: cr || 0});
  /* العميل اللي بنصوّر صفحته: حركات كتير ومتنوعة */
  open('c1', 400, 4850000);
  inv('c1', 120, [L('خرطوم تجربة 16 مم', 'لفة', 40, 52500), L('خرطوم تجربة 20 مم', 'لفة', 25, 71000), L('وصلة تجربة', 'كرتونة', 6, 18500)]);
  pay('c1', 110, 3000000, 'تحويل');
  inv('c1', 95, [L('خرطوم تجربة 25 مم', 'لفة', 30, 94000)]);
  pay('c1', 80, 1500000);
  E.push({party: 'c1', kind: 'man', date: iso(70), cr: 125000, desc: 'خصم تسوية'});
  inv('c1', 60, [L('خرطوم تجربة 16 مم', 'لفة', 50, 53500), L('كوع تجربة', 'كرتونة', 10, 22000)]);
  pay('c1', 45, 2250000, 'تحويل');
  inv('c1', 30, [L('خرطوم تجربة 32 مم', 'لفة', 12, 148000), L('خرطوم تجربة 20 مم', 'لفة', 20, 72000)]);
  pay('c1', 21, 1000000);
  inv('c1', 12, [L('خرطوم تجربة 16 مم', 'لفة', 35, 54000)]);
  pay('c1', 6, 750000);
  inv('c1', 2, [L('وصلة تجربة', 'كرتونة', 8, 19000), L('خرطوم تجربة 25 مم', 'لفة', 10, 95000)]);
  /* باقي العملا: أرصدة بأحجام مختلفة */
  open('c2', 200, 1234500); inv('c2', 40, [L('خرطوم تجربة 20 مم', 'لفة', 15, 72000)]); pay('c2', 9, 500000);
  inv('c3', 33, [L('خرطوم تجربة 16 مم', 'لفة', 8, 54000)]); pay('c3', 15, 200000);
  open('c4', 300, 270000); inv('c4', 18, [L('كوع تجربة', 'كرتونة', 3, 22000)]);
  inv('c5', 50, [L('خرطوم تجربة 16 مم', 'لفة', 10, 53000)]); pay('c5', 20, 530000);
  open('c6', 250, 12500000); inv('c6', 25, [L('خرطوم تجربة 32 مم', 'لفة', 40, 148000)]); pay('c6', 3, 4000000);
  inv('c7', 14, [L('وصلة تجربة', 'كرتونة', 2, 19000)]);
  open('c8', 180, 0, 350000);
  open('c9', 90, 9875000);
  inv('c10', 7, [L('خرطوم تجربة 20 مم', 'لفة', 4, 72000)]); pay('c10', 1, 100000);
  open('w1', 150, 24500000); inv('w1', 20, [L('خرطوم تجربة 25 مم', 'لفة', 100, 92000)]); pay('w1', 4, 10000000, 'تحويل');
  inv('w2', 35, [L('خرطوم تجربة 16 مم', 'لفة', 60, 52000)]);
  open('s1', 365, 0, 9000000); inv('s1', 30, [L('خامة تجربة', 'كيلو', 2000, 5050)]); pay('s1', 10, 6000000);
  inv('s2', 22, [L('كرتون تجربة', 'كرتونة', 500, 1200)]); pay('s2', 5, 400000);
  /* الرصيد المتوقع لكل حساب (الملف بيترفض لو مش مطابق) */
  const exp = {};
  E.forEach(e => {
    const t = e.lines ? e.lines.reduce((s, l) => s + Math.round(l.qty * l.price), 0) : 0;
    const v = e.kind === 'inv' ? t : e.kind === 'pur' ? -t : e.kind === 'pay' ? -e.amt : e.kind === 'ppay' ? e.amt : (e.dr || 0) - (e.cr || 0);
    exp[e.party] = (exp[e.party] || 0) + v;
  });
  return {app: 'gedda-accounts-import', v: 1, batch: 'SHOT1', made: NOW - 400 * 86400000,
    parties: P.map(([ref, sec, name, phone]) => ({ref, sec, name, phone, expected: exp[ref] || 0})), entries: E};
}

/* ====================== الشاشات ======================
   app: acc (الحسابات). full = الصفحة كلها (موبايل بس). go = بيوصل للشاشة */
const MOB = {width: 390, height: 844}, LAP = {width: 1440, height: 900}, LAP2 = {width: 1100, height: 760};
const PNAME = 'مؤسسة تجربة';
const accGo = h => async A => { await A.evaluate(h => { if ($('#mask').classList.contains('on')) closeModal(); if (typeof cashSide !== 'undefined') { cashSide = 'me'; cashOpenV = false; cashVault = ''; } go(h); if (h === 'cash') renderCash(); }, h); };
const accEval = code => async A => { await A.evaluate(code => { if ($('#mask').classList.contains('on')) closeModal(); (0, eval)(code); }, code); };
const party = `liveParties().find(p => p.name.startsWith('${PNAME}'))`;
/* جرد قديم (بالإيد) من 60 يوم وجرد النهارده، لصور الجرد القديم وفرق المخزون في الأرباح */
const JRDSHOT = `if (!IDX.stk.get('jr_shot_o')) { const u = Date.now(), t = todayISO(), mk = (id, date, stock, n) => { const r = {id, date, stock, n, at: u, upd: u, del: false, hist: []}; db.stks.push(r); IDX.stk.set(id, r); };
  mk('jr_shot_o', addDays(t, -60), 15000000, {old: 1, mkt: 30000000, sup: 0, vault: 0, cnt: {mkt: 0, sup: 0}, rest: 5000000}); mk('jr_shot_n', t, 18000000, jrdCalc(t)); }; `;
const ACC = (sfx, vp, extra = {}) => [
  {name: 'acc-list-' + sfx, go: accEval("tab = 'mkt'; go('home'); renderHome()"), full: true},
  {name: 'acc-sup-' + sfx, go: accEval("go(isWide() ? 'home' : 'sup'); tab = 'sup'; renderHome()")},
  {name: 'acc-party-' + sfx, go: accEval(`tab = 'mkt'; go('p/' + ${party}.id)`), full: true},
  {name: 'acc-entry-' + sfx, go: accEval(`entryModal(${party}, E.get([...E.values()].filter(e => e.party === ${party}.id && e.kind === 'inv').pop().id))`)},
  {name: 'acc-inv-' + sfx, go: accEval(`docModal(${party}, 'inv')`)},
  {name: 'acc-inv-edit-' + sfx, go: async A => { await accEval(`docModal(${party}, 'inv', [...E.values()].filter(e => e.party === ${party}.id && e.kind === 'inv' && !e.del && (e.lines || []).length > 1).pop())`)(A); await A.focus('#dcLines .li:nth-child(2) [data-f=qty]'); }},
  {name: 'acc-inv-sug-' + sfx, go: async A => { await accEval(`docModal(${party}, 'inv')`)(A); await A.focus('#dcLines [data-f=name]'); }},
  {name: 'acc-pay-' + sfx, go: accEval(`payModal(${party}, 'pay')`)},
  {name: 'acc-chk-' + sfx, go: accGo('chk'), full: true},
  {name: 'acc-chkn-' + sfx, go: async A => { await accEval(`payModal(${party}, 'pay', null, {method: 'شيك'})`)(A); }},
  {name: 'acc-quick-' + sfx, go: accEval('quickModal()')},
  {name: 'acc-cash-' + sfx, go: accEval(`cashView = 'type'; cashMode = 'week'; cashDay = ''; cashOpenV = false; go('cash'); renderCash()`), full: true},
  {name: 'acc-part-' + sfx, go: accGo('part'), full: true},
  {name: 'acc-rep-' + sfx, go: accGo('rep'), full: true},
  {name: 'acc-col-' + sfx, go: async A => { await accGo('rep')(A); await A.evaluate(() => { repKind = 'col'; repColMode = 'month'; renderReports(); }); }, full: true},
  {name: 'acc-ldg-' + sfx, go: accEval(`cashView = 'date'; cashMode = 'week'; cashDay = ''; cashOpenV = false; go('cash'); renderCash()`), full: true},
  {name: 'acc-cash-srch-' + sfx, go: async A => { await accEval(`cashView = 'date'; cashMode = 'week'; cashDay = ''; go('cash'); renderCash(); $('#cSrch').click()`)(A); await A.fill('#csQ', 'عميل'); await A.waitForTimeout(150); }},
  {name: 'acc-ldg-mon-' + sfx, go: accEval(`cashView = 'date'; cashMode = 'month'; cashMonth = ''; cashOpenV = false; go('cash'); renderCash()`), full: true},
  {name: 'acc-set-' + sfx, go: accGo('set'), full: true},
  {name: 'acc-qt-' + sfx, go: accGo('qt'), full: true},
  {name: 'acc-drv-' + sfx, go: accEval('backupHelp()')},
  {name: 'acc-af-' + sfx, go: async A => { await accGo('set')(A); await A.evaluate(() => { const c = $('#sAfC'); c.hidden = false; c.classList.remove('shut'); c.scrollIntoView(); }); }},
  {name: 'acc-ord-' + sfx, go: accEval("ordF = 'w'; go('ord')"), full: true},
  {name: 'acc-ordn-' + sfx, go: accEval("ordModal(IDX.ord.get('o_shot0'))")},
  {name: 'acc-prc-' + sfx, go: accEval("mixCur = 'm_shot0'; go('prc')"), full: true},
  {name: 'acc-qtv-' + sfx, go: accEval("qtView(IDX.qt.get('q_shot0'))")},
  {name: 'acc-qted-' + sfx, go: accEval(`docModal(${party}, 'qt', IDX.qt.get('q_shot0'))`)},
  {name: 'acc-jrd-' + sfx, go: accEval(JRDSHOT + "jrDate = ''; jrStock = null; go('jrd')"), full: true},
  {name: 'acc-jrd-old-' + sfx, go: accEval(JRDSHOT + "jrDate = ''; jrStock = null; go('jrd'); jrdOldModal()")},
  {name: 'acc-jrd-list-' + sfx, go: accEval(JRDSHOT + "jrDate = ''; jrStock = null; go('jrd')"), full: true},
  {name: 'acc-rep-stk-' + sfx, go: accEval(JRDSHOT + "go('rep'); repKind = 'profit'; repMode = 'range'; repFrom = addDays(todayISO(), -59); repTo = todayISO(); renderReports()"), full: true},
].map(x => Object.assign({app: 'acc', vp}, x, extra, vp.width > 999 ? {full: false} : {}));
const SCREENS = [
  ...ACC('m', MOB),
  {name: 'acc-rep-ah-m', app: 'acc', vp: MOB, full: true, go: accEval(`go('rep'); repKind = 'ah'; repMode = 'week'; repDay = addDays(todayISO(), -3); renderReports()`)},
  {name: 'acc-lock-m', app: 'acc', vp: MOB, go: accEval("$('#bLock').click()")},
  {name: 'acc-act-m', app: 'acc', vp: MOB, full: true, go: accEval("actDay = ''; go('act')")},
  {name: 'acc-who-m', app: 'acc', vp: MOB, go: accEval(`const e = [...E.values()].filter(e => e.party === ${party}.id && e.kind === 'pay').pop(); e.by = 'كريم'; e.cby = 'سامح'; openEntry(${party}, e)`)},
  {name: 'acc-me-m', app: 'acc', vp: MOB, go: accEval('askMe(true)')},
  ...ACC('l', LAP),
  {name: 'acc-party-l1100', app: 'acc', vp: LAP2, go: accEval(`go('p/' + ${party}.id)`)},
  {name: 'acc-cash-wk-m', app: 'acc', vp: MOB, go: accEval("cashSide = 'me'; cashMode = 'week'; go('cash'); renderCash()")},
  {name: 'acc-cash-rng-m', app: 'acc', vp: MOB, go: accEval("cashSide = 'me'; cashMode = 'range'; go('cash'); renderCash()")},
  {name: 'acc-cash-open-m', app: 'acc', vp: MOB, full: true, go: accEval(`cashOpenV = true; cashVault = ''; go('cash'); renderCash()`)},
  {name: 'acc-cash-open-l', app: 'acc', vp: LAP, go: accEval(`cashOpenV = true; cashVault = ''; go('cash'); renderCash()`)},
  {name: 'acc-cash-sheet-m', app: 'acc', vp: MOB, go: async A => { await accEval(`cashView = 'type'; cashMode = 'week'; cashOpenV = false; go('cash'); renderCash()`)(A); await A.waitForTimeout(300); await A.evaluate(() => [...$$('#p-cash .fbk .fbr')].pop().click()); }},
  {name: 'acc-set-pass-m', app: 'acc', vp: MOB, full: true, go: accEval("go('set'); renderSettings(); $('#sBio').style.display='block'; $('#sBio').textContent='👆 بصمة الوجه'; $$('#p-set > .card').forEach(c => c.classList.toggle('shut', !/كلمة السر/.test(c.querySelector('h2').textContent)))")},
  {name: 'acc-party-scroll-m', app: 'acc', vp: MOB, go: async A => { await accEval(`tab = 'mkt'; go('p/' + ${party}.id)`)(A); await A.evaluate(() => { const b = $('#p-party'); b.scrollTo(0, b.scrollHeight / 2); }); await A.waitForTimeout(300); console.log('th top', await A.evaluate(() => Math.round($('#p-party .ldg th').getBoundingClientRect().top))); }},
  {name: 'acc-party-zoom-m', app: 'acc', vp: MOB, go: async A => { await accEval(`tab = 'mkt'; go('p/' + ${party}.id)`)(A); await A.evaluate(() => { document.documentElement.style.setProperty('--lz', 1.8); document.documentElement.setAttribute('data-lz', ''); const st = document.createElement('style'); st.textContent = '.ldgw .ldg{zoom:var(--lz)}'; document.head.appendChild(st); }); await A.waitForTimeout(300); }},
  {name: 'acc-cash-l1100', app: 'acc', vp: LAP2, go: accGo('cash')},
  {name: 'acc-cash-pick-m', app: 'acc', vp: MOB, go: accEval("cashOpenV = false; cashVault = ''; cashMode = 'day'; cashDay = addDays(todayISO(), -1); go('cash'); renderCash(); $('#cPer').classList.add('pk')")},
  {name: 'acc-list-m-dark', app: 'acc', vp: MOB, dark: true, go: accEval("tab = 'mkt'; go('home'); renderHome()")},
  {name: 'acc-party-m-dark', app: 'acc', vp: MOB, dark: true, go: accEval(`go('p/' + ${party}.id)`)},
  {name: 'acc-inv-m-dark', app: 'acc', vp: MOB, dark: true, go: accEval(`docModal(${party}, 'inv')`)},
  {name: 'acc-cash-m-dark', app: 'acc', vp: MOB, dark: true, go: accGo('cash')},
  {name: 'acc-party-l-dark', app: 'acc', vp: LAP, dark: true, go: accEval(`go('p/' + ${party}.id)`)},
  /* ورق الـ PDF (لازم ميتغيرش): بيتصور آخر حاجة في كل جهاز لأن الورقة بتتحط قدام الصفحة */
  {name: 'pdf-stmt', app: 'acc', vp: LAP, el: '#render .pg', go: accEval(`go('p/' + ${party}.id); buildStmtPages(${party}, stmtData(${party}.id, '', '')); Object.assign($('#render').style, {left: '0', zIndex: 9999})`)},
  {name: 'pdf-stmt-sup', app: 'acc', vp: LAP, el: '#render .pg', go: accEval(`const sp = liveParties().find(p => p.sec === 'sup'); go('p/' + sp.id); const s = stmtData(sp.id, todayISO().slice(0, 8) + '01', todayISO()); buildStmtPages(sp, s); Object.assign($('#render').style, {left: '0', zIndex: 9999})`)},
  {name: 'pdf-ldg', app: 'acc', vp: LAP, el: '#render .pg', go: accEval(`cashView = 'date'; cashMode = 'range'; cashFrom = addDays(todayISO(), -20); cashTo = todayISO(); cashOpenV = false; go('cash'); renderCash(); buildReportPages(ldgReport(ldgItems(cashRange()[0], cashRange()[1]), cashRange()[0], cashRange()[1])); Object.assign($('#render').style, {left: '0', zIndex: 9999})`)},
  {name: 'pdf-qt', app: 'acc', vp: LAP, el: '#render .pg', go: accEval(`const q = IDX.qt.get('q_shot0'); buildStmtPages(qtParty(q), qtStmt(q)); Object.assign($('#render').style, {left: '0', zIndex: 9999})`)},
  {name: 'pdf-rcv', app: 'acc', vp: LAP, el: '#render .pg', go: accEval(`buildRcvPages(${party}, [...E.values()].filter(e => e.party === ${party}.id && e.kind === 'inv' && !e.del && (e.lines || []).length > 1).pop(), false); Object.assign($('#render').style, {left: '0', zIndex: 9999})`)},
  {name: 'pdf-rcv-plain', app: 'acc', vp: LAP, el: '#render .pg', go: accEval(`buildRcvPages(${party}, [...E.values()].filter(e => e.party === ${party}.id && e.kind === 'inv' && !e.del && (e.lines || []).length > 1).pop(), true); Object.assign($('#render').style, {left: '0', zIndex: 9999})`)},
  {name: 'acc-rcv-m', app: 'acc', vp: MOB, go: accEval(`rcvModal(${party}, [...E.values()].filter(e => e.party === ${party}.id && e.kind === 'inv' && !e.del && (e.lines || []).length > 1).pop())`)},
  {name: 'pdf-rep', app: 'acc', vp: LAP, el: '#render .pg', go: accEval(`go('rep'); buildReportPages(buildReport()); Object.assign($('#render').style, {left: '0', zIndex: 9999})`)},
];

const fixTime = t => { const D = Date, off = t - D.now(); class FD extends D { constructor(...a) { super(...(a.length ? a : [D.now() + off])); } static now() { return D.now() + off; } } window.Date = FD; };
async function newCtx(browser, vp, dark) {
  const ctx = await browser.newContext({viewport: vp, deviceScaleFactor: 2, locale: 'ar-EG', colorScheme: dark ? 'dark' : 'light'});
  await ctx.addInitScript(fixTime, NOW);
  await ctx.addInitScript(() => { window.__meDefault = 'سامح'; });
  return ctx;
}
/* حركات تجريبية لخزنة الحسابات */
function accExtra(iso0, now) {
  ensureVaults();
  const v = defVault(), ce = catsL('exp'), ci = catsL('inc');
  const d = n => new Date(now - n * 86400000).toISOString().slice(0, 10);
  [['exp', 320000, 0, ce[0], 'نقل طلبية'], ['exp', 1800000, 0, ce[1] || ce[0], ''], ['inc', 475000, 0, ci[0], 'بيع نقدي'], ['exp', 95000, 1, ce[2] || ce[0], 'شاي وسكر'], ['inc', 1200000, 1, ci[0], ''], ['exp', 640000, 2, ce[3] || ce[0], 'يومية العمال']]
    .forEach(([type, amt, n, c, note], i) => { const r = {id: 't_shot' + i, at: now, upd: now, del: false, hist: [], type, amt, date: d(n), note, vault: v, to: '', cat: c ? c.id : ''}; db.txs.push(r); IDX.tx.set(r.id, r); });
  /* شريكين ومسحوبات من أول الشهر (للمقارنة) */
  putSet('partners', {on: true, amt: 0, vault: v, start: '', list: [{id: 'pa', name: 'سامح', from: d(40), vault: ''}, {id: 'pb', name: 'كريم', from: d(40), vault: ''}]});
  ensurePartCats();
  [['pa', 500000, 0], ['pb', 300000, 1], ['pa', 250000, 2], ['pb', 150000, 3]]
    .forEach(([pt, amt, n], i) => { const r = {id: 't_pshot' + i, at: now, upd: now, del: false, hist: [], type: 'exp', amt, date: d(n), note: '', pnote: '', pt, vault: v, to: '', cat: 'c_pdraw'}; db.txs.push(r); IDX.tx.set(r.id, r); });
  /* عروض أسعار: اتنين مستنيين (واحد لاسم ملوش حساب)، وواحد اتنفذ، وواحد اتلغى */
  const cu = liveParties().filter(p => p.sec !== 'sup');
  [[cu.find(p => p.name.startsWith('مؤسسة تجربة للمقاولات')).id, '', 'w', 3, 14], ['', 'مؤسسة تجربة الجديدة', 'w', 20, 10], [cu[0].id, '', 'd', 9, 14], [cu[4].id, '', 'x', 30, 14]].forEach(([party, name, st, n, tl], i) => {
    const r = {id: 'q_shot' + i, kind: 'qt', party, name, no: i + 1, st, inv: '', date: d(n), till: new Date(now - (n - tl) * 86400000).toISOString().slice(0, 10), lines: [{name: 'خرطوم تجربة 16 مم', unit: 'لفة', qty: 40, price: 52500}, {name: 'وصلة تجربة', unit: 'كرتونة', qty: 6, price: 18500}].slice(0, i % 2 ? 1 : 2), disc: i === 0 ? 50000 : 0, note: i === 0 ? 'التسليم في المصنع' : '', at: now, upd: now, del: false, hist: []};
    db.qts.push(r); IDX.qt.set(r.id, r); });
  /* طلبات: تلاتة لسه متسلمتش (واحدة متأخرة) وواحدة اتسلمت، وخلطتين تسعير */
  [[cu[3].id, '', 'w', -2, [{name: 'لفة 16 مم أحمر تجربة', rolls: 100, w: 5, kg: 500}], ''], [cu[1].id, '', 'w', 1, [{name: 'لفة 23 مم أسود تجربة', rolls: 60, w: 7, kg: 420}, {name: 'مواسير تجربة', rolls: 0, w: 0, kg: 30}], 'عاوزها ختم تجربة'],
   ['', 'ورشة تجربة جديدة', 'w', 4, [{name: 'لفة 16 مم أحمر تجربة', rolls: 40, w: 4.8, kg: 192}], ''], [cu[2].id, '', 'd', -1, [{name: 'لفة 16 مم أحمر تجربة', rolls: 20, w: 5, kg: 100}], '']].forEach(([party, name, st, n, lines, note], i) => {
    const r = {id: 'o_shot' + i, kind: 'ord', party, name, st, due: d(-n), lines, note, dAt: st === 'd' ? now - 3600000 : 0, at: now - 86400000 * 3, upd: now, del: false, hist: []};
    db.ords.push(r); IDX.ord.set(r.id, r); });
  [['خلطة تجربة', [{name: 'خامة أساسية تجربة', price: 6500, pct: 70}, {name: 'خامة أرخص تجربة', price: 5500, pct: 30}], 600, 10], ['خلطة اقتصادي', [{name: 'خامة أساسية تجربة', price: 6500, pct: 40}, {name: 'خامة أرخص تجربة', price: 5500, pct: 60}], 600, 8]].forEach(([name, rows, run, profit], i) => {
    const r = {id: 'm_shot' + i, kind: 'mix', name, rows, run, profit, at: now + i, upd: now, del: false, hist: []}; db.mixs.push(r); IDX.mix.set(r.id, r); });
  saveDB();
}
async function accPage(browser, base, vp, dark) {
  const ctx = await newCtx(browser, vp, dark);
  await ctx.route('https://script.google.com/**', r => r.abort('failed'));
  const A = await ctx.newPage();
  await A.goto(base + 'accounts.html');
  await A.fill('#suP', PASS); await A.fill('#suP2', PASS); await A.click('#suGo');
  await A.waitForSelector('#lock', {state: 'hidden'});
  await A.evaluate(x => importModal(readImport(x)), accData());
  await A.click('#imGo'); await A.click('#cOk');
  await A.waitForFunction(() => db && db.parties.length >= 14);
  await A.evaluate(`(${accExtra})(${JSON.stringify(iso(0))}, ${NOW})`);
  return A;
}
(async () => {
  if (args.includes('--list')) { SCREENS.forEach(s => console.log(s.name)); return; }
  fs.mkdirSync(OUT, {recursive: true});
  const srv = await serve(), base = `http://localhost:${srv.address().port}/`;
  const browser = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});
  const pages = {};
  try {
    for (const s of SCREENS) {
      if (ONLY && !ONLY.some(o => s.name === o || (o.endsWith('*') && s.name.startsWith(o.slice(0, -1))))) continue;
      const dk = s.dark || (DARK && !s.el), key = s.app + s.vp.width + (dk ? 'd' : '');
      if (DARK && !dk) continue;   // ورق الـ PDF أبيض على طول
      if (!pages[key]) pages[key] = await accPage(browser, base, s.vp, dk);
      const X = pages[key];
      try {
        await s.go(X);
        await X.evaluate(() => document.fonts.ready);
        await X.addStyleTag({content: '#toast{display:none!important}*{caret-color:transparent!important}'});
        await X.waitForTimeout(1300);   // حركة الأرقام (العدّاد) بتخلص
        await X.evaluate(() => window.scrollTo(0, 0));
        if (process.env.SHOT_EVAL) console.log(s.name, await X.evaluate(process.env.SHOT_EVAL));   // للفحص: كود بيتشغل في الصفحة وبيطبع النتيجة
        if (process.env.SHOT_DUMP) fs.writeFileSync(path.join(OUT, s.name + (DARK && !s.dark ? '-dk' : '') + '.json'), await X.evaluate(fs.readFileSync(process.env.SHOT_DUMP, 'utf8')));   // للفحص: نتيجة كود (JSON) جنب كل صورة
        const f = path.join(OUT, s.name + (DARK && !s.dark ? '-dk' : '') + '.png');
        /* الصفحة كلها: الشاشة بتطول على قد الصفحة (علشان الشريط اللي تحت يفضل تحت) وبترجع زي ما كانت */
        if (s.full) { const h = await X.evaluate(() => Math.max(document.documentElement.scrollHeight, innerHeight)); await X.setViewportSize({width: s.vp.width, height: Math.min(h, 6000)}); await X.waitForTimeout(300); }
        if (s.el) await X.locator(s.el).first().screenshot({path: f}); else await X.screenshot({path: f});
        if (s.full) await X.setViewportSize(s.vp);
        console.log('✔', s.name);
      } catch (e) { console.log('✖', s.name, e.message.split('\n')[0]); }
    }
  } finally { await browser.close(); srv.close(); }
})();
