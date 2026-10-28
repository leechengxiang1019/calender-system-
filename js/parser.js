// Chronos — Rule-based natural-language extraction (English + Chinese)
'use strict';

/* ---------- rule-based natural-language extraction (design report, section 1.2.1) ---------- */
const B = '(?<![\\w/]|\\d:)', E = '(?![\\w/]|:\\d)';
const MER = '(?:a\\.?m\\.?|p\\.?m\\.?)';
const T = `(noon|midnight|\\d{1,2}(?::\\d{2})?(?:\\s*${MER})?)`;
const TS = `(noon|midnight|\\d{1,2}:\\d{2}(?:\\s*${MER})?|\\d{1,2}\\s*${MER})`;
const MON_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DOW_RE = '(monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun)';
const NUMW = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
const rx = s => new RegExp(s, 'i');

function scanner(text) {
  const sc = { rest: text, spans: [] };
  sc.mark = (m, type) => { sc.spans.push({ s: m.index, e: m.index + m[0].length, type }); sc.rest = sc.rest.slice(0, m.index) + ' '.repeat(m[0].length) + sc.rest.slice(m.index + m[0].length); return m; };
  sc.take = (re, type) => { const m = re.exec(sc.rest); return m ? sc.mark(m, type) : null; };
  return sc;
}
function parseTimeTok(raw) {
  const s = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  if (s === 'noon') return { h: 12, m: 0, sure: true, h24: 12, mer: 'pm', raw };
  if (s === 'midnight') return { h: 0, m: 0, sure: true, h24: 0, mer: 'am', raw };
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/);
  if (!m) return null;
  const h = +m[1], mi = +(m[2] || 0);
  if (mi > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    const mer = m[3][0] === 'a' ? 'am' : 'pm';
    return { h, m: mi, mer, sure: true, h24: (h % 12) + (mer === 'pm' ? 12 : 0), raw };
  }
  if (h > 23) return null;
  if (h === 0 || h >= 13 || (m[1].length === 2 && m[1][0] === '0')) return { h, m: mi, sure: true, h24: h, mer: null, raw };
  return { h, m: mi, sure: false, mer: null, raw };
}
// kind: morning | noon | afternoon | evening — decides AM/PM for a clock time that doesn't say
function resolveT(tk, kind) {
  if (tk.sure) return tk.h24 * 60 + tk.m;
  if (!kind) return null;
  let h = tk.h;
  if (kind === 'morning') h = h % 12;
  else if (kind === 'noon') h = h >= 11 ? h : h + 12;
  else h = h < 12 ? h + 12 : h;
  return h * 60 + tk.m;
}
function pairTimes(a, b, kA, kB) {
  let A = resolveT(a, kA), Bm = resolveT(b, kB);
  if (A != null && Bm == null) { const o = [b.h % 12, b.h % 12 + 12].map(x => x * 60 + b.m).filter(x => x > A); if (o.length) Bm = Math.min(...o); }
  if (Bm != null && A == null) { const o = [a.h % 12, a.h % 12 + 12].map(x => x * 60 + a.m).filter(x => x < Bm); if (o.length) A = Math.max(...o); }
  return [A, Bm];
}
function mkDate(y, mo, d, explicitYear, today) {
  const dt = new Date(y, mo, d);
  if (dt.getMonth() !== mo || dt.getDate() !== d) return null;
  if (!explicitYear && dt < today) dt.setFullYear(y + 1);
  return dt;
}
// English clock times; the Chinese parser reuses this for inputs like “明天 2pm 开会”
function enTimes(sc, out, kind) {
  const rm = sc.take(rx(`${B}(?:from\\s+|between\\s+)?${T}\\s*(?:-|–|to|until|till|and)\\s*${T}${E}`), 'time');
  if (rm) {
    const a = parseTimeTok(rm[1]), b = parseTimeTok(rm[2]);
    if (a && b) {
      const [A, Bm] = pairTimes(a, b, kind, kind);
      if (A != null && Bm != null) { out.start = A; out.end = Bm; }
      else out.ctx.ambig = { raw: rm[0].trim(), s: { h: a.h % 12, m: a.m }, e: { h: b.h % 12, m: b.m } };
    }
    return true;
  }
  const sm = sc.take(rx(`${B}(?:(?:at|@|by)\\s*${T}|${TS})${E}`), 'time');
  if (sm) {
    const tk = parseTimeTok(sm[1] || sm[2]);
    if (tk) { const v = resolveT(tk, kind); if (v != null) out.start = v; else out.ctx.ambig = { raw: sm[0].trim(), s: { h: tk.h % 12, m: tk.m } }; }
    return true;
  }
  return false;
}
function parseSentence(text) {
  const out = /[㐀-鿿]/.test(text) ? parseZh(text) : parseEn(text);
  out.spans.sort((x, y) => x.s - y.s);
  return out;
}

function parseEn(text) {
  const today = sod(new Date()), sc = scanner(text);
  const out = { title: '', date: null, start: null, end: null, location: '', priority: 0, ctx: {}, spans: sc.spans };

  for (const [re, p] of [[`${B}(?:urgent(?:ly)?|asap)${E}`, 4], [`${B}(?:high[\\s-]priority|important)${E}`, 3], [`${B}(?:medium|normal)[\\s-]priority${E}`, 2], [`${B}low[\\s-]priority${E}`, 1]])
    if (sc.take(rx(re), 'prio')) { out.priority = p; break; }

  // part-of-day words only hint at AM/PM; they never become a start time on their own
  const vm = rx(`${B}(morning|afternoon|evening|tonight)${E}`).exec(text);
  const kind = vm ? (vm[1].toLowerCase() === 'tonight' ? 'evening' : vm[1].toLowerCase()) : null;

  const dateRules = [
    [`${B}(?:on\\s+)?(\\d{4})-(\\d{1,2})-(\\d{1,2})${E}`, m => mkDate(+m[1], +m[2] - 1, +m[3], true, today)],
    [`${B}(?:on\\s+)?(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?${E}`, m => mkDate(m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : today.getFullYear(), +m[2] - 1, +m[1], !!m[3], today)],
    [`${B}(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+${MON_RE}\\.?(?:,?\\s+(\\d{4}))?${E}`, m => mkDate(m[3] ? +m[3] : today.getFullYear(), MONS.findIndex(x => m[2].toLowerCase().startsWith(x.toLowerCase())), +m[1], !!m[3], today)],
    [`${B}(?:on\\s+)?${MON_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?${E}`, m => mkDate(m[3] ? +m[3] : today.getFullYear(), MONS.findIndex(x => m[1].toLowerCase().startsWith(x.toLowerCase())), +m[2], !!m[3], today)],
    [`${B}(?:the\\s+)?day\\s+after\\s+(?:tomorrow|tmr)${E}`, () => addDays(today, 2)],
    [`${B}(?:tomorrow|tmrw?)${E}`, () => addDays(today, 1)],
    [`${B}(?:today|tonight)${E}`, () => today],
    [`${B}in\\s+(\\d+|a|an|one|two|three|four|five)\\s+(days?|weeks?)${E}`, m => { const n = NUMW[m[1].toLowerCase()] || +m[1]; return addDays(today, m[2].toLowerCase().startsWith('w') ? n * 7 : n); }],
    [`${B}(?:on\\s+)?(?:(next|this|coming)\\s+)?${DOW_RE}${E}`, m => {
      const idx = DOWS.findIndex(x => m[2].toLowerCase().startsWith(x.toLowerCase()));
      if (m[1] && m[1].toLowerCase() === 'next') return addDays(startOfWeek(today), 7 + (idx + 6) % 7);
      let diff = (idx - today.getDay() + 7) % 7;
      if (diff === 0 && !(m[1] && m[1].toLowerCase() === 'this')) diff = 7;
      return addDays(today, diff);
    }]
  ];
  for (const [re, fn] of dateRules) {
    const m = rx(re).exec(sc.rest); if (!m) continue;
    const dt = fn(m); if (!dt) continue;
    sc.mark(m, 'date'); out.date = ymd(dt); break;
  }

  let dur = null;
  for (const [re, fn] of [
    [`${B}for\\s+(?:an?|one)\\s+hour\\s+and\\s+a\\s+half${E}`, () => 90],
    [`${B}for\\s+half\\s+an?\\s+hour${E}`, () => 30],
    [`${B}for\\s+(?:an?|one)\\s+hour${E}`, () => 60],
    [`${B}for\\s+(\\d+(?:\\.\\d+)?)\\s*(?:hours?|hrs?|h)${E}`, m => Math.round(parseFloat(m[1]) * 60)],
    [`${B}for\\s+(\\d+)\\s*(?:minutes?|mins?|m)${E}`, m => +m[1]]
  ]) { const m = sc.take(rx(re), 'time'); if (m) { dur = fn(m); break; } }

  enTimes(sc, out, kind);
  sc.take(rx(`${B}(?:in\\s+the\\s+|this\\s+)?(?:morning|afternoon|evening|tonight)${E}`), 'time');
  if (out.start == null && !out.ctx.ambig && kind) { out.ctx.vague = vm[1].toLowerCase(); out.ctx.vagueKind = kind; }
  if (dur) { if (out.start != null && out.end == null) out.end = out.start + dur; else out.ctx.dur = dur; }

  const lm = sc.take(rx(`${B}(?:(?:in|at)\\s+|@\\s*)(?!(?:with|for|to|about|and)${E})(?:the\\s+)?([A-Za-z0-9][^,;!?\\n]*?)\\s*(?=$|[,;!?]|\\.(?:\\s|$)|\\s+(?:with|for|to|about|regarding)${E})`), 'loc');
  if (lm) out.location = cap(lm[1].replace(/\s+/g, ' ').trim());

  let tt = sc.rest.replace(/\s+/g, ' ').trim(), prev;
  const lead = /^(?:(?:i|we)\s+(?:have|got|need to|want to|will|must|should|am going to|are going to|plan to|'ve got|'m going to)\s+(?:to\s+)?|i've got\s+|i'm\s+|i am\s+|there(?:'s| is)\s+|please\s+|remind me (?:to|about|of)\s+|(?:schedule|add|book|set up|create|plan|put)\s+)/i;
  do { prev = tt; tt = tt.replace(/^[\s,.:;!\-–]+/, '').replace(lead, '').replace(/^(?:a|an|the|my|our)\s+/i, ''); } while (tt !== prev);
  do { prev = tt; tt = tt.replace(/[\s,.:;!\-–]+$/, '').replace(/\s+(?:on|at|from|in|by|for|to|between|and|with|this|next)$/i, ''); } while (tt !== prev);
  out.title = cap(tt);
  return out;
}

/* Chinese: 今天/明天/后天、周五/下周一、12月25日、3天后；下午2点到4点、2点半、14:00；一个小时、半小时；在会议室；紧急/重要 */
const CN = '[零〇一二两三四五六七八九十]{1,3}';
const NUMX = `(?:\\d{1,2}|${CN})`;
const CN_D = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function cnNum(s) {
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  if (s.includes('十')) { const [a, b] = s.split('十'); return (a ? CN_D[a] : 1) * 10 + (b ? CN_D[b] : 0); }
  return s.length === 1 ? CN_D[s] : NaN;
}
const ZH_KIND = { 凌晨: 'morning', 早上: 'morning', 早晨: 'morning', 清晨: 'morning', 上午: 'morning', 今早: 'morning', 明早: 'morning', 中午: 'noon', 下午: 'afternoon', 傍晚: 'evening', 晚上: 'evening', 夜里: 'evening', 今晚: 'evening', 明晚: 'evening' };
const HW = '(凌晨|早上|早晨|清晨|上午|中午|下午|傍晚|晚上|夜里)';
const TOKZH = `${NUMX}(?:[:：]\\d{2}|[点時时](?:半|一刻|三刻|(?:\\d{1,2}|${CN})分?)?钟?)`;
function parseZhTok(tok) {
  const m = tok.match(new RegExp(`^(\\d{1,2}|${CN})(?:([:：])(\\d{2})|[点時时](半|一刻|三刻|(\\d{1,2}|${CN})分?)?钟?)?$`));
  if (!m) return null;
  const h = cnNum(m[1]);
  const mi = m[3] ? +m[3] : m[4] === '半' ? 30 : m[4] === '一刻' ? 15 : m[4] === '三刻' ? 45 : m[5] ? cnNum(m[5]) : 0;
  if (!(h >= 0 && h <= 23 && mi >= 0 && mi <= 59)) return null;
  const sure = h === 0 || h >= 13 || (!!m[2] && /^0\d/.test(m[1]));
  return { h, m: mi, sure, h24: sure ? h : null, raw: tok };
}
function parseZh(text) {
  const today = sod(new Date()), sc = scanner(text);
  const out = { title: '', date: null, start: null, end: null, location: '', priority: 0, ctx: {}, spans: sc.spans };

  for (const [re, p] of [['不重要', 1], ['紧急|很急|急事|十万火急|urgent', 4], ['重要|高优先级?', 3], ['(?:中|普通)优先级?', 2], ['低优先级?', 1]])
    if (sc.take(rx(re), 'prio')) { out.priority = p; break; }

  const hm = /(凌晨|早上|早晨|清晨|上午|中午|下午|傍晚|晚上|夜里|今晚|明晚|今早|明早)/.exec(text);
  const kind = hm ? ZH_KIND[hm[1]] : null;

  const WD = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 0 };
  const dateRules = [
    [`(?:(\\d{4})年)?(\\d{1,2}|${CN})月(\\d{1,2}|${CN})[日号號]`, m => mkDate(m[1] ? +m[1] : today.getFullYear(), cnNum(m[2]) - 1, cnNum(m[3]), !!m[1], today)],
    ['(\\d{4})-(\\d{1,2})-(\\d{1,2})', m => mkDate(+m[1], +m[2] - 1, +m[3], true, today)],
    ['(?<!\\d)(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?(?!\\d)', m => mkDate(m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : today.getFullYear(), +m[2] - 1, +m[1], !!m[3], today)],
    ['大后天', () => addDays(today, 3)],
    ['后天', () => addDays(today, 2)],
    ['明天|明日|明早|明晚', () => addDays(today, 1)],
    ['今天|今日|今早|今晚', () => today],
    ['(下|这|本)?个?(?:周|星期|礼拜|禮拜)([一二三四五六日天1-7])', m => {
      const idx = WD[m[2]];
      if (m[1] === '下') return addDays(startOfWeek(today), 7 + (idx + 6) % 7);
      if (m[1]) return addDays(startOfWeek(today), (idx + 6) % 7);
      return addDays(today, (idx - today.getDay() + 7) % 7 || 7);
    }],
    [`(\\d+|${CN})天(?:之)?后`, m => addDays(today, cnNum(m[1]))]
  ];
  for (const [re, fn] of dateRules) {
    const m = rx(re).exec(sc.rest); if (!m) continue;
    const dt = fn(m); if (!dt) continue;
    sc.mark(m, 'date'); out.date = ymd(dt); break;
  }

  let dur = null;
  const DP = '(?:持续|用时|用|花|共|大概|大约)?\\s*';
  for (const [re, fn] of [
    [`${DP}(${NUMX})个半(?:小时|钟头)`, m => cnNum(m[1]) * 60 + 30],
    [`${DP}半个?(?:小时|钟头)`, () => 30],
    [`${DP}(\\d+(?:\\.\\d+)?|${CN})\\s*个?(?:小时|钟头)`, m => Math.round(cnNum(m[1]) * 60)],
    [`${DP}(\\d+|${CN})\\s*分钟`, m => cnNum(m[1])]
  ]) { const m = sc.take(rx(re), 'time'); if (m) { const v = fn(m); if (v > 0) dur = v; break; } }

  let found = false;
  const rm = sc.take(rx(`${HW}?\\s*(${TOKZH}|\\d{1,2}|${CN})\\s*(?:到|至|-|–|—|~|～)\\s*${HW}?\\s*(${TOKZH})`), 'time');
  if (rm) {
    found = true;
    const a = parseZhTok(rm[2]), b = parseZhTok(rm[4]);
    if (a && b) {
      const kA = (rm[1] && ZH_KIND[rm[1]]) || kind, kB = (rm[3] && ZH_KIND[rm[3]]) || kA;
      let [A, Bm] = pairTimes(a, b, kA, kB);
      if (A != null && Bm != null && Bm <= A && !rm[3] && Bm + 720 <= 1439) Bm += 720;
      if (A != null && Bm != null) { out.start = A; out.end = Bm; }
      else out.ctx.ambig = { raw: rm[0].trim(), s: { h: a.h % 12, m: a.m }, e: { h: b.h % 12, m: b.m } };
    }
  } else {
    const sm = sc.take(rx(`${HW}?\\s*(${TOKZH})`), 'time');
    if (sm) {
      found = true;
      const tk = parseZhTok(sm[2]);
      if (tk) { const v = resolveT(tk, (sm[1] && ZH_KIND[sm[1]]) || kind); if (v != null) out.start = v; else out.ctx.ambig = { raw: sm[0].trim(), s: { h: tk.h % 12, m: tk.m } }; }
    }
  }
  if (!found) enTimes(sc, out, kind);
  while (sc.take(rx(HW), 'time'));
  if (out.start == null && !out.ctx.ambig && kind) { out.ctx.vague = hm[1]; out.ctx.vagueKind = kind; }
  if (dur) { if (out.start != null && out.end == null) out.end = out.start + dur; else out.ctx.dur = dur; }

  const lm = rx('(?<![现正实存好还自])(?:在|于|地点[:：]?|@)\\s*([^\\s，,。；;！!？?、]{1,24}?)(?=\\s|开会|开|举行|上课|见面|见|吃|喝|集合|进行|参加|讨论|做|和|跟|与|，|,|。|；|;|！|!|$)').exec(sc.rest);
  if (lm) {
    // “在图书馆小组讨论”: stop the place at a place-type word so the rest stays in the title
    const cut = lm[1].match(/^(.+?(?:中心|宿舍|教室|课室|馆|室|厅|楼|堂|房|场|店|院|园|家|站|座))(.+)$/);
    const loc = cut ? cut[1] : lm[1];
    sc.mark({ index: lm.index, 0: lm[0].slice(0, lm[0].indexOf(lm[1]) + loc.length) }, 'loc');
    out.location = loc;
  }

  let tt = sc.rest.replace(/\s+/g, ' ').replace(/\s*([㐀-鿿，。、：；！？])\s*/g, '$1').trim(), prev;
  do { prev = tt; tt = tt.replace(/^[\s,.:;!\-–，。、：；！？]+/, '').replace(/^(?:我们|我|需要|要|得|记得|提醒我|帮我|安排|有个|有一个|有)/, ''); } while (tt !== prev);
  do { prev = tt; tt = tt.replace(/[\s,.:;!\-–，。、：；！？]+$/, '').replace(/(?:的|了|吧|呢)$/, ''); } while (tt !== prev);
  if (/^开.+会议?$/.test(tt)) tt = tt.slice(1);
  out.title = tt;
  return out;
}
