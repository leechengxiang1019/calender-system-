// Chronos — App state, accounts, rendering, event form, reminders and start-up
'use strict';

/* ---------- state ---------- */
const DEMO = { email: 'demo@chronos.app', name: 'Demo Student', pw: 'chronos123' };
const narrowMq = matchMedia('(max-width: 720px)');
const state = {
  user: null, events: [], view: narrowMq.matches ? 'day' : 'week',
  cursor: sod(new Date()), mini: null, hidden: new Set(), draft: null, panel: null
};
const evKey = () => 'chronos.events.' + state.user.email;
const firedKey = () => 'chronos.fired.' + state.user.email;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const persist = () => store.set(evKey(), state.events);
const effView = () => (narrowMq.matches && state.view === 'week') ? 'list' : state.view;
const visible = () => state.events.filter(e => !state.hidden.has(e.priority));
const byTime = (a, b) => a.date.localeCompare(b.date) || a.start - b.start || a.end - b.end;

/* ---------- auth ---------- */
async function sha(s) {
  try {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  } catch (e) { let h = 5381; for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) | 0; return 'x' + (h >>> 0).toString(16); }
}
function salt() { try { return [...crypto.getRandomValues(new Uint8Array(8))].map(x => x.toString(16).padStart(2, '0')).join(''); } catch (e) { return Math.random().toString(16).slice(2); } }
async function ensureDemo() {
  const users = store.get('chronos.users', {});
  if (!users[DEMO.email]) { const s = salt(); users[DEMO.email] = { name: DEMO.name, salt: s, hash: await sha(s + ':' + DEMO.pw) }; store.set('chronos.users', users); }
}
let authMode = 'in';
function setAuthMode(m) {
  authMode = m;
  $('#tabIn').setAttribute('aria-selected', m === 'in'); $('#tabUp').setAttribute('aria-selected', m === 'up');
  $('#nameField').hidden = m === 'in';
  $('#authSubmit').textContent = t(m === 'in' ? 'auth.in' : 'auth.up');
  $('#a-pw').autocomplete = m === 'in' ? 'current-password' : 'new-password';
  $('#authErr').textContent = '';
}
async function submitAuth(e) {
  e.preventDefault();
  const email = $('#a-email').value.trim().toLowerCase(), pw = $('#a-pw').value, name = $('#a-name').value.trim();
  const err = $('#authErr'); const users = store.get('chronos.users', {});
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = t('auth.errEmail'); return; }
  if (authMode === 'up') {
    if (!name) { err.textContent = t('auth.errName'); return; }
    if (pw.length < 8) { err.textContent = t('auth.errPw'); return; }
    if (users[email]) { err.textContent = t('auth.errExists'); return; }
    const s = salt(); users[email] = { name, salt: s, hash: await sha(s + ':' + pw) }; store.set('chronos.users', users);
  } else {
    const u = users[email];
    if (!u || u.hash !== await sha(u.salt + ':' + pw)) { err.textContent = t('auth.errWrong'); return; }
  }
  signIn(email);
}
function signIn(email) {
  const users = store.get('chronos.users', {});
  state.user = { email, name: users[email]?.name || email };
  store.set('chronos.session', email);
  let ev = store.get(evKey(), null);
  if (ev === null) { ev = email === DEMO.email ? seed() : []; store.set(evKey(), ev); }
  state.events = ev;
  localizeSamples();
  $('#auth').hidden = true; $('#app').hidden = false;
  const initials = state.user.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  $('#avatar').textContent = initials; $('#userName').textContent = state.user.name.split(' ')[0];
  $('#menuName').textContent = state.user.name; $('#menuEmail').textContent = email;
  renderAll(); scrollGrid(); checkReminders();
}
function signOut() {
  closeDrawer(); $('#userMenu').hidden = true;
  state.user = null; state.events = []; store.set('chronos.session', '');
  $('#app').hidden = true; $('#auth').hidden = false; setAuthMode('in');
  $('#a-email').value = ''; $('#a-pw').value = ''; $('#a-email').focus();
}

/* ---------- sample data, relative to today, in both languages ---------- */
const SAMPLES = [
  [['Group study: Software Engineering', 'Library, Level 3', ''], ['小组学习：软件工程', '图书馆 3 楼', '']],
  [['Capstone supervisor meeting', 'Block B, Room 3.12', 'Bring the design philosophy report and the updated Gantt chart.'], ['毕业项目导师会议', 'B 座 3.12 室', '带上设计理念报告和更新后的甘特图。']],
  [['Project meeting', 'Meeting room', ''], ['项目会议', '会议室', '']],
  [['Database Systems lecture', 'Lecture Hall 2', ''], ['数据库系统讲课', '第 2 讲堂', '']],
  [['Weekly logbook update', '', 'Fill in this week’s individual logbook entry.'], ['更新每周日志', '', '填写本周的个人日志。']],
  [['Gym', 'Campus gym', ''], ['健身', '校园健身房', '']],
  [['Assignment 2 submission', 'Online portal', 'Final deadline. Submit the PDF and the source code zip.'], ['作业 2 截止提交', '网上系统', '最终截止。提交 PDF 和源代码压缩包。']],
  [['Badminton with friends', 'Sports complex', ''], ['和朋友打羽毛球', '体育馆', '']],
  [['Dinner with family', 'Home', ''], ['家庭晚餐', '家', '']],
  [['Chapter 2 draft review', 'Online (Teams)', ''], ['第二章草稿审阅', '线上（Teams）', '']],
  [['Submit progress report', 'Student portal', 'Upload the Chapter 1 draft and this week’s logbook.'], ['提交进度报告', '学生系统', '上传第一章草稿和本周日志。']]
];
function seed() {
  const tday = sod(new Date()), k = n => ymd(addDays(tday, n)); let n = 0;
  const mk = (d, key, s, e, p, reminder = 30) => ({ id: 's' + (++n), sampleKey: key, title: '', location: '', notes: '', date: k(d), start: s, end: e, priority: p, reminder, sample: true });
  const list = [
    mk(-1, 0, 900, 1020, 2), mk(0, 1, 600, 660, 3), mk(0, 2, 840, 960, 2), mk(1, 3, 540, 660, 1), mk(1, 4, 960, 990, 3),
    mk(2, 5, 1080, 1140, 0, null), mk(3, 6, 1380, 1410, 4, 60), mk(4, 7, 1170, 1260, 1), mk(5, 8, 1140, 1260, 1), mk(8, 9, 600, 690, 3)
  ];
  const soon = Math.ceil((nowMin() + 25) / 5) * 5;
  if (soon + 30 <= 1439 && !list.some(e => e.date === k(0) && soon < e.end && soon + 30 > e.start)) list.push(mk(0, 10, soon, soon + 30, 4));
  return list;
}
function localizeSamples() {
  let changed = false;
  for (const e of state.events) {
    if (e.sampleKey == null || e.edited) continue;
    const [title, location, notes] = SAMPLES[e.sampleKey][li()];
    if (e.title !== title) { Object.assign(e, { title, location, notes }); changed = true; }
  }
  if (changed) persist();
}

/* ---------- static text ---------- */
function applyStatic() {
  document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : 'en';
  $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  $$('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  $$('[data-lang-toggle]').forEach(el => { el.innerHTML = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="10" cy="10" r="7.5"/><path d="M2.5 10h15M10 2.5c2.2 2.3 2.2 12.7 0 15M10 2.5c-2.2 2.3-2.2 12.7 0 15"/></svg>${t('lang.btn')}`; el.setAttribute('aria-label', t('lang.aria')); });
  $('#authSubmit').textContent = t(authMode === 'in' ? 'auth.in' : 'auth.up');
  $('#examples').innerHTML = `<span>${t('q.try')}</span>` + t('examples').map(x => `<button type="button" class="ex" data-ex="${esc(x)}">${esc(x)}</button>`).join('');
}
function setLang(l) {
  if (state.draft) syncDraft();
  lang = l; store.set('chronos.lang', l);
  applyStatic();
  if (state.user) { localizeSamples(); renderAll(); }
  const p = state.panel;
  if (p) { if (p.type === 'form') renderForm(); else if (p.type === 'details') openDetails(p.id); else if (p.type === 'help') openHelp(); }
}

/* ---------- rendering ---------- */
function renderAll() { renderTop(); renderMini(); renderSide(); renderCal(); }

function renderTop() {
  const v = effView(), c = state.cursor, zh = lang === 'zh';
  let label;
  if (v === 'day') label = fmtDateLong(ymd(c));
  else if (v === 'week') {
    const a = startOfWeek(c), b = addDays(a, 6), same = a.getMonth() === b.getMonth();
    label = zh ? `${a.getFullYear()}年${a.getMonth() + 1}月${a.getDate()}日 – ${same ? '' : (b.getMonth() + 1) + '月'}${b.getDate()}日`
      : same ? `${a.getDate()} – ${b.getDate()} ${MONS[b.getMonth()]} ${b.getFullYear()}` : `${a.getDate()} ${MONS[a.getMonth()]} – ${b.getDate()} ${MONS[b.getMonth()]} ${b.getFullYear()}`;
  } else if (v === 'month') label = fmtMonth(c);
  else label = `${fmtDate(ymd(c))} – ${fmtDate(ymd(addDays(c, 13)))}`;
  $('#rangeLabel').textContent = label;
  $$('.seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === v));
  $('#sampleBanner').hidden = !state.events.some(e => e.sample);
}

function renderMini() {
  if (!state.mini) state.mini = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1);
  const m = state.mini, start = startOfWeek(m), tk = todayKey();
  const days = new Set(state.events.map(e => e.date));
  const v = effView();
  let selA, selB;
  if (v === 'day') { selA = selB = ymd(state.cursor); }
  else if (v === 'week') { selA = ymd(startOfWeek(state.cursor)); selB = ymd(addDays(startOfWeek(state.cursor), 6)); }
  else if (v === 'list') { selA = ymd(state.cursor); selB = ymd(addDays(state.cursor, 13)); }
  $('#miniLabel').textContent = fmtMonth(m);
  let h = (lang === 'zh' ? ['一', '二', '三', '四', '五', '六', '日'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']).map(x => `<div class="dh">${x}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i), k = ymd(d);
    const cls = [d.getMonth() !== m.getMonth() && 'is-out', k === tk && 'is-today', selA && k >= selA && k <= selB && 'is-sel', days.has(k) && 'has'].filter(Boolean).join(' ');
    h += `<button class="${cls}" data-jump="${k}" aria-label="${fmtDateLong(k)}">${d.getDate()}</button>`;
  }
  $('#mini').innerHTML = h;
}

function renderSide() {
  const tk = todayKey(), nm = nowMin();
  const future = state.events.filter(e => e.date > tk || (e.date === tk && e.end > nm));
  $('#plist').innerHTML = [0, 1, 2, 3, 4].map(i => {
    const n = future.filter(e => e.priority === i).length;
    return `<label class="pl" style="--pc:var(--p${i})"><input type="checkbox" id="pf-${i}" data-pri="${i}" ${state.hidden.has(i) ? '' : 'checked'}><span class="sw">${CHECK}</span>${priName(i)}<span class="pdesc">${t('pri.colors')[i]}</span><span class="cnt" title="${t('side.upcoming')}">${n}</span></label>`;
  }).join('');
  const up = future.filter(e => !state.hidden.has(e.priority)).sort(byTime).slice(0, 5);
  $('#upcoming').innerHTML = up.length ? up.map(e => `<li><button data-id="${e.id}" style="--pc:var(--p${e.priority})"><span class="bar"></span><span><strong>${esc(e.title)}</strong><small>${e.date === tk ? t('today') : fmtDate(e.date)} · <span class="mono">${fmtT(e.start)}</span></small></span></button></li>`).join('')
    : `<li><p class="empty-note">${t('side.empty')}</p></li>`;
  $('#tzNote').innerHTML = `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10" cy="10" r="7.5"/><path d="M2.5 10h15M10 2.5c2.2 2.3 2.2 12.7 0 15M10 2.5c-2.2 2.3-2.2 12.7 0 15"/></svg>${esc(t('side.tz', TZ, TZ_OFF))}`;
}

function renderCal() {
  const v = effView(), cal = $('#cal');
  if (v === 'day') cal.innerHTML = timeGrid([state.cursor]);
  else if (v === 'week') cal.innerHTML = timeGrid(Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(state.cursor), i)));
  else if (v === 'month') cal.innerHTML = monthView();
  else cal.innerHTML = listView();
}

function layoutDay(evs) {
  const sorted = [...evs].sort((a, b) => a.start - b.start || b.end - a.end), out = [];
  let cluster = [], colsEnd = [], clusterEnd = -1;
  const flush = () => { cluster.forEach(o => { o.cols = colsEnd.length; }); cluster = []; colsEnd = []; clusterEnd = -1; };
  for (const ev of sorted) {
    if (cluster.length && ev.start >= clusterEnd) flush();
    let c = colsEnd.findIndex(x => x <= ev.start);
    if (c < 0) { c = colsEnd.length; colsEnd.push(ev.end); } else colsEnd[c] = ev.end;
    const o = { ev, col: c, cols: 1 }; cluster.push(o); out.push(o);
    clusterEnd = Math.max(clusterEnd, ev.end);
  }
  flush();
  return out;
}

function timeGrid(days) {
  const tk = todayKey(), H = 52, nm = nowMin(), hasToday = days.some(d => ymd(d) === tk);
  const head = `<div class="tg-head" style="--cols:${days.length}"><div class="tg-tz">${TZ_OFF}</div>` + days.map(d => {
    const k = ymd(d);
    return `<button class="tg-day${k === tk ? ' is-today' : ''}" data-goto="${k}" aria-label="${t('a.open', fmtDateLong(k))}"><span class="dow">${dowShort(d)}</span><span class="dnum">${d.getDate()}</span></button>`;
  }).join('') + '</div>';
  let gutter = '<div class="tg-gutter">';
  for (let h = 1; h < 24; h++) if (!(hasToday && Math.abs(nm - h * 60) < 14)) gutter += `<span style="top:${h * H}px">${fmtT(h * 60, true)}</span>`;
  if (hasToday) gutter += `<span class="now-lbl" style="top:${nm / 60 * H}px">${fmtT(nm)}</span>`;
  gutter += '</div>';
  const cols = days.map(d => {
    const k = ymd(d);
    const blocks = layoutDay(visible().filter(e => e.date === k)).map(({ ev, col, cols }) => {
      const top = ev.start / 60 * H, ht = Math.max((ev.end - ev.start) / 60 * H - 2, 20);
      const compact = ht < 40;
      return `<button class="ev${compact ? ' compact' : ''}" data-id="${ev.id}" style="--pc:var(--p${ev.priority});top:${top + 1}px;height:${ht}px;left:calc(${col / cols * 100}% + 3px);width:calc(${100 / cols}% - 6px)" aria-label="${esc(ev.title)}, ${fmtRange(ev.start, ev.end)}, ${t('pri.full', priName(ev.priority))}"><span class="ev-t">${esc(ev.title)}</span><span class="ev-m">${compact ? fmtT(ev.start, true) : fmtRange(ev.start, ev.end)}</span>${ev.priority >= 3 && ht >= 66 ? `<span class="ptag">${priName(ev.priority)}</span>` : ''}</button>`;
    }).join('');
    return `<div class="tg-col${k === tk ? ' is-today' : ''}" data-date="${k}">${blocks}${k === tk ? `<div class="nowline" style="top:${nm / 60 * H}px"></div>` : ''}</div>`;
  }).join('');
  return `<div class="tg" style="--cols:${days.length}">${head}<div class="tg-body" id="tgBody"><div class="tg-grid" style="--cols:${days.length}">${gutter}${cols}</div></div></div>`;
}

function monthView() {
  const c = state.cursor, first = new Date(c.getFullYear(), c.getMonth(), 1), start = startOfWeek(first), tk = todayKey();
  const vis = visible();
  const heads = lang === 'zh' ? ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  let h = '<div class="mh">' + heads.map(x => `<div>${x}</div>`).join('') + '</div><div class="mgrid">';
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i), k = ymd(d);
    const evs = vis.filter(e => e.date === k).sort(byTime), shown = evs.slice(0, 3), more = evs.length - shown.length;
    h += `<div class="mc${d.getMonth() !== c.getMonth() ? ' is-out' : ''}${k === tk ? ' is-today' : ''}"><div class="mc-top"><button class="mc-num" data-goto="${k}" aria-label="${t('a.open', fmtDateLong(k))}">${d.getDate()}</button><button class="mc-add" data-add="${k}" aria-label="${t('a.add', fmtDateLong(k))}">+</button></div><div class="mc-evs">`
      + shown.map(e => `<button class="chip" data-id="${e.id}" style="--pc:var(--p${e.priority})" aria-label="${esc(e.title)}, ${fmtRange(e.start, e.end)}, ${t('pri.full', priName(e.priority))}"><span class="chip-time">${fmtT(e.start, true)}</span><span class="chip-title">${esc(e.title)}</span>${e.priority ? `<span class="pmark" title="${t('pri.full', priName(e.priority))}">${t('pri.short')[e.priority]}</span>` : ''}</button>`).join('')
      + (more ? `<button class="mc-more" data-goto="${k}">+${more}</button>` : '') + '</div></div>';
  }
  return h + '</div>';
}

function listView() {
  const tk = todayKey(), vis = visible();
  let h = '', any = false;
  for (let i = 0; i < 14; i++) {
    const d = addDays(state.cursor, i), k = ymd(d), evs = vis.filter(e => e.date === k).sort(byTime);
    if (!evs.length) continue;
    any = true;
    const mon = lang === 'zh' ? `${d.getFullYear()}年${d.getMonth() + 1}月` : `${MONS[d.getMonth()]} ${d.getFullYear()}`;
    h += `<section class="ag-day${k === tk ? ' is-today' : ''}"><div class="ag-date"><span class="dow">${k === tk ? t('today') : dowShort(d)}</span><span class="dnum">${d.getDate()}</span><span class="mon">${mon}</span></div><ul class="ag-list">`
      + evs.map(e => `<li><button class="ag-ev" data-id="${e.id}" style="--pc:var(--p${e.priority})"><span class="ag-time">${fmtT(e.start)}<br>${fmtT(e.end)}</span><span class="ag-bar"></span><span class="ag-main"><strong>${esc(e.title)}</strong>${e.location ? `<span>${esc(e.location)}</span>` : ''}</span>${e.priority ? `<span class="ptag">${priName(e.priority)}</span>` : ''}</button></li>`).join('')
      + '</ul></section>';
  }
  return any ? `<div class="agenda">${h}</div>` : `<div class="cal-empty"><h3>${t('l.emptyH')}</h3><p>${t('l.emptyP')}</p></div>`;
}

function scrollGrid() {
  const b = $('#tgBody'); if (!b) return;
  const days = $$('.tg-col', b).map(c => c.dataset.date);
  const target = days.includes(todayKey()) ? Math.max(nowMin() - 120, 0) : 7 * 60;
  b.scrollTop = target / 60 * 52;
}
function tickNow() {
  const nm = nowMin(), line = $('.nowline'), lbl = $('.now-lbl');
  if (line) line.style.top = nm / 60 * 52 + 'px';
  if (lbl) { lbl.style.top = nm / 60 * 52 + 'px'; lbl.textContent = fmtT(nm); }
}

/* ---------- drawer: review / create / edit ---------- */
let lastFocus = null;
function openDrawer(wide) { if ($('#drawer').hidden) lastFocus = document.activeElement; $('#drawer').classList.toggle('wide', !!wide); $('#drawer').hidden = false; $('#scrim').hidden = false; }
function closeDrawer() { $('#drawer').hidden = true; $('#scrim').hidden = true; $('#drawer').innerHTML = ''; state.draft = null; state.panel = null; if (lastFocus && document.contains(lastFocus)) lastFocus.focus(); }
const drHead = (eyebrow, title) => `<div class="dr-head"><div>${eyebrow}<h2>${title}</h2></div><button class="icon-btn plain" data-close aria-label="${t('dr.close')}">${CLOSE}</button></div>`;

function openNew(pre = {}) {
  state.draft = { mode: 'new', id: null, title: '', date: pre.date || ymd(state.cursor), start: pre.start ?? null, end: pre.end ?? null, location: '', priority: 0, reminder: 30, notes: '', ctx: {}, sentence: null, spans: [], tried: false };
  renderForm(); openDrawer(); $('#f-title').focus();
}
function openFromSentence(text) {
  const p = parseSentence(text);
  state.draft = { mode: 'new', id: null, title: p.title, date: p.date, start: p.start, end: p.end, location: p.location, priority: p.priority, reminder: 30, notes: '', ctx: p.ctx, sentence: text, spans: p.spans, tried: false };
  renderForm(); openDrawer();
  ($('#qs .qchip') || $('#saveBtn')).focus();
}
function openEdit(id) {
  const ev = state.events.find(e => e.id === id); if (!ev) return;
  state.draft = { ...ev, mode: 'edit', ctx: {}, sentence: null, spans: [], tried: false };
  renderForm(); openDrawer(); $('#f-title').focus();
}

function heardHtml(d) {
  let h = '', i = 0;
  for (const sp of d.spans) { h += esc(d.sentence.slice(i, sp.s)) + `<mark class="hl-${sp.type}">${esc(d.sentence.slice(sp.s, sp.e))}</mark>`; i = sp.e; }
  h += esc(d.sentence.slice(i));
  const types = [...new Set(d.spans.map(s => s.type))];
  return `<div class="heard"><p class="eyebrow">${t('heard.t')}</p><p class="s">${h}</p><div class="legend">${types.map(x => `<span class="hl-${x}"><i></i>${t('hl.' + x)}</span>`).join('')}<span>${types.length ? t('heard.rest') : t('heard.none')}</span></div></div>`;
}

function renderForm() {
  const d = state.draft;
  state.panel = { type: 'form' };
  const head = d.mode === 'edit' ? [t('dr.edit'), esc(d.title || '—')] : d.sentence ? [t('dr.review'), t('dr.reviewH')] : [t('dr.new'), t('dr.newH')];
  $('#drawer').setAttribute('aria-label', head[0]);
  $('#drawer').innerHTML = drHead(`<p class="eyebrow">${head[0]}</p>`, head[1]) + `
  <div class="dr-body">
    ${d.sentence ? heardHtml(d) : ''}
    <div id="qs"></div>
    <form class="ev-form" id="evForm" novalidate>
      <div class="field"><label for="f-title">${t('f.title')}</label><input id="f-title" maxlength="120" autocomplete="off" value="${esc(d.title)}"><p class="ferr" id="e-title"></p></div>
      <div class="row3">
        <div class="field"><label for="f-date">${t('f.date')}</label><input type="date" id="f-date" value="${d.date || ''}"><p class="ferr" id="e-date"></p></div>
        <div class="field"><label for="f-start">${t('f.start')}</label><input type="time" id="f-start" value="${d.start != null ? hhmm(d.start) : ''}"><p class="ferr" id="e-start"></p></div>
        <div class="field"><label for="f-end">${t('f.end')}</label><input type="time" id="f-end" value="${d.end != null && d.end <= 1439 ? hhmm(d.end) : ''}"><p class="ferr" id="e-end"></p></div>
      </div>
      <div class="field"><label for="f-loc">${t('f.loc')} <span class="opt">${t('f.opt')}</span></label><input id="f-loc" autocomplete="off" value="${esc(d.location)}"></div>
      <fieldset class="field"><legend>${t('f.pri')}</legend>
        <div class="prio">${[0, 1, 2, 3, 4].map(i => `<label class="pr" style="--pc:var(--p${i})"><input type="radio" name="priority" id="pr-${i}" value="${i}" ${d.priority === i ? 'checked' : ''}><span class="dot"></span>${priName(i)}</label>`).join('')}</div>
        <p class="hint" id="prioHint"></p>
      </fieldset>
      <div class="field"><label for="f-rem">${t('f.rem')}</label><select id="f-rem">${REM_VALUES.map((v, i) => `<option value="${v ?? ''}" ${d.reminder === v ? 'selected' : ''}>${t('rem.labels')[i]}</option>`).join('')}</select></div>
      <div class="field"><label for="f-notes">${t('f.notes')} <span class="opt">${t('f.opt')}</span></label><textarea id="f-notes" rows="3">${esc(d.notes)}</textarea></div>
    </form>
    <div id="check" aria-live="polite"></div>
  </div>
  <div class="dr-foot"><button class="btn ghost" data-close>${t('f.cancel')}</button><button class="btn primary" id="saveBtn">${d.mode === 'edit' ? t('f.saveEdit') : t('f.save')}</button></div>`;
  const form = $('#evForm');
  form.addEventListener('input', onFormInput);
  form.addEventListener('change', onFormInput);
  form.addEventListener('submit', e => { e.preventDefault(); save(); });
  $('#saveBtn').addEventListener('click', save);
  refreshForm();
}
function syncDraft() {
  const d = state.draft; if (!d || !$('#evForm')) return;
  d.title = $('#f-title').value; d.date = $('#f-date').value || null;
  d.start = fromHhmm($('#f-start').value); d.end = fromHhmm($('#f-end').value);
  d.location = $('#f-loc').value.trim(); d.notes = $('#f-notes').value.trim();
  d.priority = +($('input[name="priority"]:checked')?.value || 0);
  const r = $('#f-rem').value; d.reminder = r === '' ? null : +r;
}
function onFormInput(e) {
  const d = state.draft; syncDraft();
  if (e.target.id === 'f-start' && d.start != null) {
    d.ctx.ambig = null; d.ctx.vague = null;
    if (d.end == null && d.ctx.dur) setTime('end', d.start + d.ctx.dur);
  }
  refreshForm();
}
function setTime(which, m) { $(which === 'start' ? '#f-start' : '#f-end').value = m <= 1439 ? hhmm(m) : ''; state.draft[which] = m; }

function refreshForm() {
  const d = state.draft;
  renderQuestions(); renderErrors();
  $('#prioHint').textContent = t('pri.shows')[d.priority] + (lang === 'zh' ? '。' : '.');
  clearTimeout(refreshForm.t); refreshForm.t = setTimeout(runCheck, 120);
}

const VAGUE_OPTS = { morning: [8, 9, 10, 11], noon: [11, 12, 13], afternoon: [13, 14, 15, 16], evening: [18, 19, 20, 21] };
function renderQuestions() {
  const d = state.draft, qs = [], chip = (val, label) => `<button type="button" class="qchip" data-set="${val}">${label}</button>`;
  if (!d.title.trim()) qs.push(`<div class="q"><p>${t('qs.title')}</p><button type="button" class="link" data-focus="f-title">${t('qs.titleBtn')}</button></div>`);
  if (!d.date) {
    const td = sod(new Date());
    qs.push(`<div class="q"><p>${t('qs.date')}</p><div class="q-chips">${[0, 1, 2, 3, 4].map(n => { const k = ymd(addDays(td, n)); return chip('date:' + k, n === 0 ? t('today') : n === 1 ? t('tomorrow') : fmtDate(k)); }).join('')}</div></div>`);
  }
  if (d.start == null) {
    const a = d.ctx.ambig;
    if (a) {
      if (a.e) {
        const am = [a.s.h * 60 + a.s.m, a.e.h * 60 + a.e.m]; if (am[1] <= am[0]) am[1] += 720;
        const pm = [am[0] + 720, am[1] + 720];
        qs.push(`<div class="q"><p>${esc(t('qs.ambig', a.raw))}</p><div class="q-chips">${chip(`range:${am[0]}-${am[1]}`, fmtRange(am[0], am[1]))}${pm[1] <= 1439 ? chip(`range:${pm[0]}-${pm[1]}`, fmtRange(pm[0], pm[1])) : ''}</div></div>`);
      } else {
        const s = a.s.h * 60 + a.s.m;
        qs.push(`<div class="q"><p>${esc(t('qs.ambig', a.raw))}</p><div class="q-chips">${chip('start:' + s, fmtT(s))}${chip('start:' + (s + 720), fmtT(s + 720))}</div></div>`);
      }
    } else if (d.ctx.vague) {
      qs.push(`<div class="q"><p>${esc(t('qs.vague', d.ctx.vague))}</p><div class="q-chips">${VAGUE_OPTS[d.ctx.vagueKind].map(h => chip('start:' + h * 60, fmtT(h * 60, true))).join('')}</div></div>`);
    } else {
      qs.push(`<div class="q"><p>${t('qs.start')}</p><div class="q-chips">${[9, 10, 14, 16].map(h => chip('start:' + h * 60, fmtT(h * 60, true))).join('')}</div></div>`);
    }
  }
  if (d.start != null && d.end == null) qs.push(`<div class="q"><p>${t('qs.dur')}</p><div class="q-chips">${[30, 60, 90, 120].filter(m => d.start + m <= 1439).map(m => chip('dur:' + m, fmtDur(m))).join('')}</div></div>`);
  $('#qs').innerHTML = qs.length ? `<div class="qs"><p class="qs-h">${t('qs.head', qs.length)}</p>${qs.join('')}</div>` : '';
  $('#f-title').classList.toggle('missing', !d.title.trim());
  $('#f-date').classList.toggle('missing', !d.date);
  $('#f-start').classList.toggle('missing', d.start == null);
  $('#f-end').classList.toggle('missing', d.end == null);
}
function applySet(v) {
  const d = state.draft, i = v.indexOf(':'), k = v.slice(0, i), val = v.slice(i + 1);
  if (k === 'date') { $('#f-date').value = val; d.date = val; }
  if (k === 'start') { setTime('start', +val); d.ctx.ambig = null; d.ctx.vague = null; if (d.end == null && d.ctx.dur) setTime('end', +val + d.ctx.dur); }
  if (k === 'range') { const [s, e] = val.split('-').map(Number); setTime('start', s); setTime('end', e); d.ctx.ambig = null; }
  if (k === 'dur') setTime('end', d.start + +val);
  syncDraft(); refreshForm();
  ($('#qs .qchip') || $('#saveBtn')).focus();
}
function renderErrors() {
  const d = state.draft, errs = validate(d);
  for (const f of ['title', 'date', 'start', 'end']) {
    const show = errs[f] && (d.tried || (f === 'end' && d.start != null && d.end != null));
    $('#e-' + f).textContent = show ? errs[f] : '';
    $('#f-' + f).setAttribute('aria-invalid', show ? 'true' : 'false');
  }
}
function runCheck() {
  const d = state.draft, box = $('#check'); if (!d || !box) return { ok: false };
  const errs = validate(d);
  if (Object.keys(errs).length) {
    box.innerHTML = d.tried ? `<div class="status err">${t('c.blocked')}</div>` : `<div class="status">${t('c.idle')}</div>`;
    return { ok: false };
  }
  const cl = clashes(d.date, d.start, d.end, d.id);
  const past = fromYmd(d.date).getTime() + d.end * 60000 < Date.now();
  if (!cl.length) {
    box.innerHTML = `<div class="status ok">${t('c.ok', fmtDate(d.date), fmtRange(d.start, d.end))}${past ? `<span class="warn">${t('c.past')}</span>` : ''}</div>`;
    return { ok: true };
  }
  const alts = findAlts(d.date, d.start, d.end, d.id), dur = d.end - d.start;
  const btn = d.mode === 'edit' ? t('f.saveEdit') : t('f.save');
  box.innerHTML = `<div class="clash" role="alert">
    <p class="clash-h">${t('c.clash', fmtRange(d.start, d.end), fmtDate(d.date), cl.length)}</p>
    <ul class="clash-list">${cl.map(c => `<li><span class="dot" style="--pc:var(--p${c.priority})"></span><span><strong>${esc(c.title)}</strong><br><span class="mono">${fmtRange(c.start, c.end)}</span></span><span class="ov">${t('c.overlap', fmtDur(Math.min(d.end, c.end) - Math.max(d.start, c.start)))}</span></li>`).join('')}</ul>
    ${alts.length ? `<p class="alts-h">${t('c.free', fmtDur(dur))}</p><div class="alts">${alts.map(a => `<button type="button" class="alt" data-alt="${a.date}|${a.start}|${a.end}"><span class="alt-d">${fmtDate(a.date)}</span><span class="alt-t mono">${fmtRange(a.start, a.end)}</span><span class="alt-why">${whyLabel(a.off)}</span></button>`).join('')}</div><p class="hint">${t('c.pick', btn)}</p>`
      : `<p class="hint">${t('c.none', fmtDur(dur))}</p>`}
  </div>`;
  return { ok: false, clash: true };
}
function save() {
  const d = state.draft; if (!d) return;
  syncDraft(); d.tried = true; renderErrors();
  clearTimeout(refreshForm.t);
  const r = runCheck();
  if (!r.ok) {
    if (r.clash) { toast({ kind: 'err', title: t('t.clashT'), text: t('t.clashX') }); $('#check').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    else { const bad = $('#evForm [aria-invalid="true"]'); if (bad) bad.focus(); }
    return;
  }
  const ev = { id: d.id || uid(), title: d.title.trim(), date: d.date, start: d.start, end: d.end, location: d.location, notes: d.notes, priority: d.priority, reminder: d.reminder };
  if (d.mode === 'edit') { const i = state.events.findIndex(e => e.id === d.id); if (i >= 0) state.events[i] = { ...ev, sample: state.events[i].sample, sampleKey: state.events[i].sampleKey, edited: true }; }
  else state.events.push(ev);
  persist();
  const id = ev.id, wasEdit = d.mode === 'edit';
  closeDrawer();
  state.cursor = fromYmd(ev.date); state.mini = null;
  renderAll(); scrollToEvent(ev);
  toast({ kind: 'ok', title: wasEdit ? t('t.changed') : t('t.saved'), text: `${ev.title} · ${fmtDate(ev.date)}${lang === 'zh' ? ' ' : ', '}${fmtRange(ev.start, ev.end)}`, action: { label: t('t.open'), fn: () => openDetails(id) } });
}
function scrollToEvent(ev) { const b = $('#tgBody'); if (b) b.scrollTop = Math.max(ev.start - 90, 0) / 60 * 52; }

/* ---------- details ---------- */
function reminderLines(ev) {
  const p = ev.priority, l = [];
  if (p >= 2) l.push(`${ev.date === todayKey() ? t('today') : fmtDate(ev.date)}${lang === 'zh' ? ' ' : ', '}${fmtRange(ev.start, ev.end)}`);
  if (p >= 3 && ev.location) l.push(ev.location);
  if (p >= 4 && ev.notes) l.push(ev.notes);
  return l;
}
function openDetails(id) {
  const ev = state.events.find(e => e.id === id); if (!ev) return;
  const p = ev.priority;
  state.draft = null; state.panel = { type: 'details', id };
  $('#drawer').setAttribute('aria-label', t('dr.details'));
  $('#drawer').innerHTML = drHead(`<span class="ptag" style="--pc:var(--p${p})">${t('pri.full', priName(p))}</span>`, esc(ev.title)) + `
  <div class="dr-body">
    <dl class="facts">
      <div><dt>${t('d.when')}</dt><dd>${fmtDateLong(ev.date)}<br><span class="mono">${fmtRange(ev.start, ev.end)}</span> · ${fmtDur(ev.end - ev.start)}</dd></div>
      <div><dt>${t('d.where')}</dt><dd>${ev.location ? esc(ev.location) : `<span class="hint">${t('d.noloc')}</span>`}</dd></div>
      <div><dt>${t('d.rem')}</dt><dd>${remLabel(ev.reminder)}</dd></div>
      ${ev.notes ? `<div><dt>${t('d.notes')}</dt><dd>${esc(ev.notes)}</dd></div>` : ''}
    </dl>
    <div class="preview"><p class="eyebrow">${t('d.preview')}</p>
      ${p ? `<div class="toast rem" style="--pc:var(--p${p});box-shadow:none;animation:none"><div class="tb"><div class="rh"><span class="ptag" style="--pc:var(--p${p})">${priName(p)}</span>${t('d.reminder')}</div><strong>${esc(ev.title)}</strong>${reminderLines(ev).map(x => `<p>${esc(x)}</p>`).join('')}</div></div><p class="hint">${t('pri.shows')[p]}${lang === 'zh' ? '。' : '.'} ${ev.reminder == null ? t('d.off') : t('d.appears', remLabel(ev.reminder))}</p>`
        : `<p class="hint">${t('d.none')}</p>`}
    </div>
    <div id="delZone"></div>
  </div>
  <div class="dr-foot"><button class="btn danger-ghost" id="delBtn">${t('d.del')}</button><span class="spacer"></span><button class="btn primary" id="editBtn">${t('d.edit')}</button></div>`;
  $('#editBtn').addEventListener('click', () => openEdit(id));
  $('#delBtn').addEventListener('click', () => {
    $('#delZone').innerHTML = `<div class="confirm" role="alert"><p>${esc(t('d.confirm', ev.title))}</p><div><button class="btn" id="keepBtn">${t('d.keep')}</button><button class="btn danger" id="reallyDel">${t('d.really')}</button></div></div>`;
    $('#keepBtn').addEventListener('click', () => { $('#delZone').innerHTML = ''; $('#delBtn').focus(); });
    $('#reallyDel').addEventListener('click', () => deleteEvent(id));
    $('#reallyDel').focus();
  });
  openDrawer();
  $('#editBtn').focus();
}
function deleteEvent(id) {
  const i = state.events.findIndex(e => e.id === id); if (i < 0) return;
  const [ev] = state.events.splice(i, 1); persist(); closeDrawer(); renderAll();
  toast({ kind: 'ok', title: t('t.deleted'), text: ev.title, action: { label: t('t.undo'), fn: () => { state.events.push(ev); persist(); renderAll(); toast({ kind: 'ok', title: t('t.restored'), text: ev.title }); } } });
}

/* ---------- help ---------- */
function helpHtml() {
  const ex = t('examples').map(x => `<button type="button" class="ex" data-ex="${esc(x)}">${esc(x)}</button>`).join('');
  const priRows = [0, 1, 2, 3, 4].map(i => `<tr><td><span class="ptag" style="--pc:var(--p${i})">${priName(i)}</span></td><td>${t('pri.colors')[i]}</td><td>${t('pri.shows')[i]}</td></tr>`).join('');
  const c = s => s.split('|').map(x => `<code>${esc(x)}</code>`).join(' ');
  const fmtRows = [
    ['Dates', '日期', 'today|tomorrow|day after tomorrow|Friday|next Monday|25 Dec|25/12|in 3 days', '今天|明天|后天|大后天|周五|下周一|12月25日|3天后'],
    ['Times', '时间', '2pm|2:30 pm|14:00|from 2 to 4pm|2-4pm|noon', '下午2点|2点半|14:00|下午2点到4点|中午12点'],
    ['Length', '时长', 'for an hour|for 90 minutes|for half an hour', '一个小时|半小时|90分钟|一个半小时'],
    ['Place', '地点', 'in the meeting room|at Pavilion', '在会议室|在图书馆'],
    ['Priority', '优先级', 'urgent|important|low priority', '紧急|重要|低优先级'],
    ['Unclear', '不明确', 'tomorrow evening|at 3', '明晚|3点']
  ].map(r => `<tr><td><strong>${lang === 'zh' ? r[1] : r[0]}</strong></td><td>${c(r[2])}</td><td>${c(r[3])}</td></tr>`).join('');
  const zh = lang === 'zh';
  const sec = (n, h, body) => `<section><span class="step">${n}</span><h3>${h}</h3>${body}</section>`;
  return `<div class="help">` + (zh ? [
    sec(1, '用一句话新增活动', `<p>在页面顶部的输入框里用中文或英文输入一句话，然后按 Enter 或“检查活动”。Chronos 会找出日期、时间、地点和优先级，并在保存之前先给你确认。点下面的例子试试：</p><div class="exs">${ex}</div>`),
    sec(2, '补充缺少的信息', `<p>如果句子里缺了什么（例如“明晚”没有具体时间、“3点”没说上午还是下午），Chronos 会直接问你，而不会自己猜。点选一个答案，或直接在表单里填写。</p>`),
    sec(3, '时间冲突和空档建议', `<p>你一边编辑，Chronos 就一边把时间和你的其他活动比对。如果有重叠，它会告诉你和哪个活动冲突、重叠多久，并推荐同样长度的空档。点选空档只会填进表单，按“保存活动”才会真正保存。有冲突的时间无法保存。</p>`),
    sec(4, '保存、查看、编辑、删除', `<p>按“保存活动”即可。点日历上的任何活动可以查看详情、编辑或删除。删除前会请你确认，删除后也可以从提示里按“撤销”恢复。你也可以按“使用表单”手动填写，或在日／周视图里点空白时段直接新增。</p>`),
    sec(5, '优先级和提醒', `<p>每个活动可以设定五种优先级之一。颜色之外一定会附上文字标签。优先级越高，提醒显示的内容越详细；没有优先级的活动不会弹出提醒。</p><div class="tbl"><table><thead><tr><th>优先级</th><th>颜色</th><th>提醒内容</th></tr></thead><tbody>${priRows}</tbody></table></div>`),
    sec(6, '视图和快捷键', `<ul><li>日／周／月／列表 视图在右上角切换；左侧小月历可以快速跳到某一天。</li><li>左侧“优先级”可以显示或隐藏某个优先级的活动。</li><li>手机上“周”视图会换成“列表”，编辑面板会从底部弹出。</li><li>快捷键：<kbd>/</kbd> 输入句子，<kbd>N</kbd> 新增活动，<kbd>T</kbd> 回到今天，<kbd>Esc</kbd> 关闭面板。</li><li>右上角的“EN／中文”按钮可以随时切换语言。</li></ul>`),
    sec(7, 'Chronos 能理解的写法', `<p>中文和英文句子都可以，系统会自动判断。</p><div class="tbl"><table><thead><tr><th></th><th>English</th><th>中文</th></tr></thead><tbody>${fmtRows}</tbody></table></div>`),
    sec(8, '账号', `<p>可以注册新账号，或用示例账号 <code>demo@chronos.app</code> / <code>chronos123</code> 登录。每个账号只能看到自己的活动。这个原型把资料保存在你的浏览器里。</p>`)
  ] : [
    sec(1, 'Add an event by typing', `<p>Type a sentence in English or Chinese in the box at the top, then press Enter or <strong>Review event</strong>. Chronos picks out the date, time, place and priority and shows you what it found before anything is saved. Try one of these:</p><div class="exs">${ex}</div>`),
    sec(2, 'Answer what’s missing', `<p>If the sentence leaves something out (“tomorrow evening” has no exact time, “at 3” could be AM or PM), Chronos asks instead of guessing. Tap an answer or type it into the form.</p>`),
    sec(3, 'Clashes and free slots', `<p>As you edit, Chronos compares your times with your other events. If they overlap, it shows which event clashes and by how much, and suggests free slots of the same length. Picking a slot only fills in the form. A clashing time can’t be saved.</p>`),
    sec(4, 'Save, view, edit, delete', `<p>Press <strong>Save event</strong>. Click any event on the calendar to see its details, edit it or delete it. Deleting asks you to confirm, and you can undo it from the message that appears. You can also use <strong>Use form</strong> for manual entry, or click an empty slot in Day or Week view.</p>`),
    sec(5, 'Priorities and reminders', `<p>Each event has one of five priorities. Colour always comes with a text label. Higher priorities show more detail in the reminder; events with no priority don’t pop up.</p><div class="tbl"><table><thead><tr><th>Priority</th><th>Colour</th><th>Reminder shows</th></tr></thead><tbody>${priRows}</tbody></table></div>`),
    sec(6, 'Views and shortcuts', `<ul><li>Switch between Day, Week, Month and List at the top right. The small calendar on the left jumps to any date.</li><li>Use <strong>Priorities</strong> on the left to show or hide events by priority.</li><li>On a phone, Week becomes List and the editing panel slides up from the bottom.</li><li>Shortcuts: <kbd>/</kbd> type a sentence, <kbd>N</kbd> new event, <kbd>T</kbd> today, <kbd>Esc</kbd> close the panel.</li><li>The <strong>中文 / EN</strong> button switches the language at any time.</li></ul>`),
    sec(7, 'What Chronos understands', `<p>Both English and Chinese sentences work; Chronos detects the language on its own.</p><div class="tbl"><table><thead><tr><th></th><th>English</th><th>中文</th></tr></thead><tbody>${fmtRows}</tbody></table></div>`),
    sec(8, 'Your account', `<p>Create an account, or sign in with the demo account <code>demo@chronos.app</code> / <code>chronos123</code>. Each account sees only its own events. This prototype keeps data in your browser.</p>`)
  ]).join('') + '</div>';
}
function openHelp() {
  state.draft = null; state.panel = { type: 'help' };
  $('#drawer').setAttribute('aria-label', t('menu.help'));
  $('#drawer').innerHTML = drHead(`<p class="eyebrow">Chronos</p>`, t('menu.help')) + `<div class="dr-body">${helpHtml()}</div>`;
  openDrawer(true);
  $('#drawer [data-close]').focus();
}

/* ---------- toasts & reminders ---------- */
function toast({ kind = 'ok', title, text = '', action, timeout = 6000, style = '', html }) {
  const el = document.createElement('div');
  el.className = 'toast ' + kind; if (style) el.setAttribute('style', style);
  el.innerHTML = `<div class="tb">${html || `<strong>${esc(title)}</strong>${text ? `<p>${esc(text)}</p>` : ''}`}</div>${action ? `<button class="tact">${esc(action.label)}</button>` : ''}<button class="tx" aria-label="${t('dr.close')}">×</button>`;
  const kill = () => el.remove();
  el.querySelector('.tx').addEventListener('click', kill);
  if (action) el.querySelector('.tact').addEventListener('click', () => { kill(); action.fn(); });
  $('#toasts').appendChild(el);
  if (timeout) setTimeout(kill, timeout);
}
function checkReminders() {
  if (!state.user) return;
  const fired = new Set(store.get(firedKey(), [])), now = Date.now(); let changed = false;
  for (const ev of state.events) {
    if (ev.reminder == null || !ev.priority) continue;
    const base = fromYmd(ev.date).getTime(), startTs = base + ev.start * 60000, endTs = base + ev.end * 60000;
    const key = `${ev.id}@${ev.date}@${ev.start}@${ev.reminder}`;
    if (now >= startTs - ev.reminder * 60000 && now < endTs && !fired.has(key)) {
      fired.add(key); changed = true;
      const mins = Math.round((startTs - now) / 60000);
      toast({
        kind: 'rem', style: `--pc:var(--p${ev.priority})`, timeout: ev.priority >= 3 ? 0 : 10000,
        html: `<div class="rh"><span class="ptag" style="--pc:var(--p${ev.priority})">${priName(ev.priority)}</span>${mins > 0 ? t('r.in', fmtDur(mins)) : t('r.now')}</div><strong>${esc(ev.title)}</strong>${reminderLines(ev).map(x => `<p>${esc(x)}</p>`).join('')}`,
        action: { label: t('t.open'), fn: () => openDetails(ev.id) }
      });
      sendReminderEmail(ev, mins);
    }
  }
  if (changed) store.set(firedKey(), [...fired].slice(-300));
}

/* ---------- navigation & events ---------- */
function move(dir) {
  const v = effView(), c = state.cursor;
  state.cursor = v === 'day' ? addDays(c, dir) : v === 'week' ? addDays(c, 7 * dir) : v === 'list' ? addDays(c, 14 * dir) : new Date(c.getFullYear(), c.getMonth() + dir, 1);
  state.mini = null; renderAll(); scrollGrid();
}
function setView(v) { state.view = v; state.mini = null; renderAll(); scrollGrid(); }

document.addEventListener('click', e => {
  const tg = e.target.closest('button, .tg-col, [data-focus]');
  if (!tg) { if (!e.target.closest('.user')) $('#userMenu').hidden = true; return; }
  if (!tg.closest('.user')) { $('#userMenu').hidden = true; $('#userBtn').setAttribute('aria-expanded', 'false'); }
  const ds = tg.dataset;
  if (tg.hasAttribute('data-lang-toggle')) return setLang(lang === 'zh' ? 'en' : 'zh');
  if (tg.hasAttribute('data-help')) { $('#userMenu').hidden = true; return openHelp(); }
  if (ds.id) return openDetails(ds.id);
  if (ds.goto) { state.cursor = fromYmd(ds.goto); return setView('day'); }
  if (ds.jump) { state.cursor = fromYmd(ds.jump); state.mini = null; renderAll(); return scrollGrid(); }
  if (ds.add) return openNew({ date: ds.add });
  if (ds.view) return setView(ds.view);
  if (ds.set) return applySet(ds.set);
  if (ds.focus) return $('#' + ds.focus).focus();
  if (ds.ex) { $('#quick').value = ds.ex; return openFromSentence(ds.ex); }
  if (ds.alt) {
    const [date, s, en] = ds.alt.split('|'); $('#f-date').value = date; setTime('start', +s); setTime('end', +en);
    syncDraft(); refreshForm(); toast({ kind: 'ok', title: t('t.applied'), text: t('t.appliedX', fmtDate(date), fmtRange(+s, +en)), timeout: 3500 });
    return;
  }
  if (tg.hasAttribute('data-close')) return closeDrawer();
  if (tg.classList.contains('tg-col') && e.target === tg) {
    const r = tg.getBoundingClientRect(), m = Math.min(Math.floor((e.clientY - r.top) / 52 * 2) * 30, 1410);
    return openNew({ date: tg.dataset.date, start: m, end: Math.min(m + 60, 1439) });
  }
});
$('#plist').addEventListener('change', e => { const p = +e.target.dataset.pri; e.target.checked ? state.hidden.delete(p) : state.hidden.add(p); renderSide(); renderCal(); });
$('#quickForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('#quick').value.trim();
  if (!v) { toast({ kind: 'err', title: t('t.typeFirst'), text: t('t.typeFirstX'), timeout: 4000 }); $('#quick').focus(); return; }
  openFromSentence(v); $('#quick').value = '';
});
$('#newBtn').addEventListener('click', () => openNew());
$('#newBtn2').addEventListener('click', () => { $('#userMenu').hidden = true; openNew(); });
$('#todayBtn').addEventListener('click', () => { state.cursor = sod(new Date()); state.mini = null; renderAll(); scrollGrid(); });
$('#prevBtn').addEventListener('click', () => move(-1));
$('#nextBtn').addEventListener('click', () => move(1));
$('#miniPrev').addEventListener('click', () => { state.mini = new Date(state.mini.getFullYear(), state.mini.getMonth() - 1, 1); renderMini(); });
$('#miniNext').addEventListener('click', () => { state.mini = new Date(state.mini.getFullYear(), state.mini.getMonth() + 1, 1); renderMini(); });
$('#userBtn').addEventListener('click', () => { const m = $('#userMenu'); m.hidden = !m.hidden; $('#userBtn').setAttribute('aria-expanded', String(!m.hidden)); });
$('#signOutBtn').addEventListener('click', signOut);
$('#scrim').addEventListener('click', closeDrawer);
$('#clearSamples').addEventListener('click', () => {
  const removed = state.events.filter(e => e.sample); state.events = state.events.filter(e => !e.sample); persist(); renderAll();
  toast({ kind: 'ok', title: t('t.samples', removed.length), action: { label: t('t.undo'), fn: () => { state.events.push(...removed); persist(); renderAll(); } } });
});
$('#tabIn').addEventListener('click', () => setAuthMode('in'));
$('#tabUp').addEventListener('click', () => setAuthMode('up'));
$('#authForm').addEventListener('submit', submitAuth);
$('#useDemo').addEventListener('click', () => { setAuthMode('in'); $('#a-email').value = DEMO.email; $('#a-pw').value = DEMO.pw; $('#authSubmit').focus(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#drawer').hidden) return closeDrawer();
  if (!state.user || !$('#drawer').hidden || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  if (e.key === '/') { e.preventDefault(); $('#quick').focus(); }
  else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openNew(); }
  else if (e.key === 't' || e.key === 'T') $('#todayBtn').click();
  else if (e.key === '?') openHelp();
});
narrowMq.addEventListener('change', () => { if (state.user) { renderAll(); scrollGrid(); } });
setInterval(() => { if (state.user) { tickNow(); checkReminders(); } }, 20000);

/* ---------- boot: first visit opens the demo account so the calendar is never empty ---------- */
applyStatic();
(async () => {
  await ensureDemo();
  const session = store.get('chronos.session', undefined);
  const users = store.get('chronos.users', {});
  if (session === undefined) signIn(DEMO.email);
  else if (session && users[session]) signIn(session);
  else { $('#auth').hidden = false; }
})();
