// Chronos — Date/time helpers and priority definitions
'use strict';

/* ---------- dates & times (events are single-day; times are minutes from midnight) ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const sod = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfWeek = d => addDays(sod(d), -((d.getDay() + 6) % 7));
const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
const todayKey = () => ymd(new Date());
const hhmm = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const fromHhmm = s => { if (!s) return null; const [h, m] = s.split(':').map(Number); return Number.isNaN(h) ? null : h * 60 + (m || 0); };
const DOWS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOWS_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const DOWS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const zhPeriod = h => h < 6 ? '凌晨' : h < 12 ? '上午' : h < 13 ? '中午' : h < 18 ? '下午' : '晚上';
function fmtT(m, short) {
  const h = Math.floor(m / 60) % 24, mi = m % 60, h12 = h % 12 || 12;
  if (lang === 'zh') return short && mi === 0 ? `${zhPeriod(h)}${h12}点` : `${zhPeriod(h)}${h12}:${pad(mi)}`;
  const mer = h < 12 ? 'AM' : 'PM';
  return short && mi === 0 ? `${h12} ${mer}` : `${h12}:${pad(mi)} ${mer}`;
}
const fmtRange = (s, e) => `${fmtT(s)} – ${fmtT(e)}`;
const dowShort = d => lang === 'zh' ? DOWS_ZH[d.getDay()] : DOWS[d.getDay()];
const fmtDate = k => { const d = fromYmd(k); return lang === 'zh' ? `${d.getMonth() + 1}月${d.getDate()}日 ${DOWS_ZH[d.getDay()]}` : `${DOWS[d.getDay()]} ${d.getDate()} ${MONS[d.getMonth()]}`; };
const fmtDateLong = k => { const d = fromYmd(k); return lang === 'zh' ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${'日一二三四五六'[d.getDay()]}` : `${DOWS_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const fmtMonth = d => lang === 'zh' ? `${d.getFullYear()}年${d.getMonth() + 1}月` : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
function fmtDur(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (lang === 'zh') return h && m ? `${h} 小时 ${m} 分钟` : h ? `${h} 小时` : `${m} 分钟`;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
}
const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time'; } catch (e) { return 'Local time'; } })();
const TZ_OFF = (() => { const o = -new Date().getTimezoneOffset(); return `GMT${o >= 0 ? '+' : '−'}${Math.floor(Math.abs(o) / 60)}${Math.abs(o) % 60 ? ':' + pad(Math.abs(o) % 60) : ''}`; })();

/* ---------- priorities & reminders (design report, section 1.2.3) ---------- */
const priName = p => t('pri.names')[p];
const REM_VALUES = [null, 0, 10, 30, 60, 1440];
const remLabel = r => t('rem.labels')[Math.max(REM_VALUES.indexOf(r), 0)];
const CHECK = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m2.5 6.2 2.3 2.3 4.7-5"/></svg>';
const CLOSE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5l10 10M15 5 5 15"/></svg>';
