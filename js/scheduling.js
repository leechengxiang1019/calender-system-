// Chronos — Validation, conflict detection and alternative time slots
'use strict';

/* ---------- validation, conflicts, alternatives (sections 1.2.2, 1.2.4, 1.4.2) ---------- */
function validate(d) {
  const e = {};
  if (!d.title.trim()) e.title = t('v.title');
  if (!d.date) e.date = t('v.date');
  if (d.start == null) e.start = t('v.start');
  if (d.end == null) e.end = t('v.end');
  else if (d.start != null && d.end <= d.start) e.end = t('v.order');
  else if (d.end > 1439) e.end = t('v.late');
  return e;
}
const clashes = (date, s, e, exId) => state.events.filter(ev => ev.id !== exId && ev.date === date && s < ev.end && e > ev.start).sort(byTime);
function findAlts(date, s, e, exId) {
  const dur = e - s, out = [], tk = todayKey(), nm = nowMin();
  for (let off = 0; off < 7 && out.length < 3; off++) {
    const k = ymd(addDays(fromYmd(date), off));
    if (k < tk) continue;
    const cands = [];
    for (let x = 480; x + dur <= 1320; x += 30) {
      if (k === tk && x < nm) continue;
      if (!clashes(k, x, x + dur, exId).length) cands.push(x);
    }
    cands.sort((x, y) => Math.abs(x - s) - Math.abs(y - s));
    const picked = [];
    for (const x of cands) {
      if (picked.length >= (off === 0 ? 2 : 1) || out.length + picked.length >= 3) break;
      if (picked.every(p => Math.abs(p - x) >= 60)) picked.push(x);
    }
    picked.sort((x, y) => x - y).forEach(x => out.push({ date: k, start: x, end: x + dur, off }));
  }
  return out;
}
const whyLabel = off => off === 0 ? t('w.same') : off === 1 ? t('w.next') : t('w.later', off);
