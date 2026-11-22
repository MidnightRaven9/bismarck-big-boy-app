/* Bismarck Big Boy — pure, dependency-free logic shared by the app and tests.
   Exposed as a global so the app stays a plain static script (no build step). */
(function (root) {
  'use strict';

/* ============================================================
   Restaurant facts — SINGLE SOURCE OF TRUTH
   Hours are Bismarck local time. Overrides are opt-in and must be
   supplied by the restaurant; nothing here invents a schedule.
   ============================================================ */
const RESTAURANT = {
  timeZone: 'America/Chicago',
  // Index 0 = Sunday ... 6 = Saturday. Minutes from local midnight.
  hours: Array.from({length:7}, () => ({ open: 10*60+30, close: 21*60, closed: false }))
};
const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

/* Stable identifiers and Wix media ids are allowlisted before they reach a URL
   or a CSS selector. Everything else in menu content is escaped at render time. */
const MENU_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const WIX_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_~.-]{0,159}$/;
function isValidMenuId(v){
  return typeof v === 'string' && MENU_ID_RE.test(v);
}
function isValidWixImageId(v){
  return typeof v === 'string' && WIX_ID_RE.test(v) && !v.includes('..');
}

function parseHHMM(v){
  if (typeof v !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = +m[1], min = +m[2];
  if (h > 23 || min > 59) return null;
  return h*60 + min;
}
function formatTime(mins){
  const h24 = Math.floor(mins/60), m = mins%60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return h12 + ':' + String(m).padStart(2,'0') + ' ' + (h24 < 12 ? 'AM' : 'PM');
}
/* Intl resolves DST for us — never use the visitor's local clock for store hours. */
function businessNow(date = new Date()){
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: RESTAURANT.timeZone, weekday:'short', year:'numeric',
    month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
  });
  const part = {};
  for (const x of fmt.formatToParts(date)) part[x.type] = x.value;
  let hour = parseInt(part.hour, 10);
  if (!Number.isFinite(hour) || hour === 24) hour = 0;
  const minute = parseInt(part.minute, 10);
  const wd = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(part.weekday);
  return {
    date: part.year + '-' + part.month + '-' + part.day,
    weekday: wd < 0 ? 0 : wd,
    minutes: hour*60 + (Number.isFinite(minute) ? minute : 0)
  };
}
function addDaysUTC(iso, n){
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0,10);
}
function normalizeOverrides(data){
  const map = new Map();
  if (!data || !Array.isArray(data.overrides)) return map;
  for (const o of data.overrides){
    if (!o || typeof o.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) continue;
    if (o.closed === true){
      map.set(o.date, { open:0, close:0, closed:true, note: String(o.note||'Closed today — check our Facebook for updates.').slice(0,120) });
      continue;
    }
    const open = parseHHMM(o.open), close = parseHHMM(o.close);
    if (open === null || close === null || close <= open) continue;
    map.set(o.date, { open, close, closed:false, note: String(o.note||'').slice(0,120) });
  }
  return map;
}
function effectiveHours(now, overrides = new Map()){
  return overrides.get(now.date) || RESTAURANT.hours[now.weekday] || RESTAURANT.hours[0];
}
function nextOpening(now, overrides = new Map()){
  for (let i=0; i<8; i++){
    const date = addDaysUTC(now.date, i);
    const wd = new Date(date + 'T00:00:00Z').getUTCDay();
    const h = overrides.get(date) || RESTAURANT.hours[wd];
    if (!h || h.closed) continue;
    if (i === 0 && now.minutes >= h.close) continue;
    return { date, open:h.open };
  }
  return null;
}
/* Validate the local menu file: stable IDs, sane sizes, no duplicates. */
function validateMenu(data){
  if (!Array.isArray(data) || !data.length) throw new Error('Menu data is empty');
  const ids = new Set(), out = [];
  for (const g of data){
    if (!g || !isValidMenuId(g.id) || typeof g.name !== 'string' || !Array.isArray(g.items)) continue;
    const items = [];
    for (const it of g.items){
      if (!it || !isValidMenuId(it.id) || ids.has(it.id)) continue;
      if (typeof it.n !== 'string' || !Array.isArray(it.s) || !it.s.length) continue;
      const sizes = it.s
        .filter(x => {
          if (!Array.isArray(x) || typeof x[0] !== 'string') return false;
          const n = typeof x[1] === 'number' ? x[1]
            : (typeof x[1] === 'string' && x[1].trim() ? Number(x[1]) : NaN);
          return Number.isFinite(n) && n >= 0;
        })
        .map(x => [x[0].slice(0,40), typeof x[1] === 'number' ? x[1] : Number(x[1])]);
      if (!sizes.length) continue;
      ids.add(it.id);
      items.push({
        id:it.id, n:it.n.slice(0,120),
        // Unsafe media ids become an empty value; the renderer shows a local
        // placeholder instead of building a URL from arbitrary data.
        img: isValidWixImageId(it.img) ? it.img : '',
        d: typeof it.d === 'string' ? it.d.slice(0,300) : '',
        s:sizes
      });
    }
    if (items.length) out.push({ id:g.id, name:g.name.slice(0,60), items });
  }
  if (!out.length) throw new Error('No valid menu categories');
  return out;
}
/* Facebook deals are untrusted input. Validate shape, length, URL and dates
   before anything reaches innerHTML; keep the original post link intact. */
function normalizeDeals(data){
  if (!Array.isArray(data)) throw new Error('Deals payload is not an array');
  const seen = new Set(), out = [];
  for (const d of data){
    if (!d || typeof d !== 'object') continue;
    const title = typeof d.title === 'string' ? d.title.trim().slice(0,120) : '';
    const text  = typeof d.text  === 'string' ? d.text.trim().slice(0,700)  : '';
    if (!title && !text) continue;
    let url = 'https://www.facebook.com/bismarckbigboy/';
    if (typeof d.url === 'string'){
      try {
        const u = new URL(d.url);
        // An explicitly supplied URL to anywhere else is rejected, not rewritten.
        if (u.protocol !== 'https:' || (u.hostname !== 'facebook.com' && u.hostname !== 'www.facebook.com')) continue;
        url = u.href;
      } catch(e){ continue; }
    }
    let expires = null;
    if (d.expires !== null && d.expires !== undefined){
      const t = Date.parse(d.expires);
      if (Number.isFinite(t)) expires = t;
    }
    if (expires !== null && expires <= Date.now()) continue;
    const key = (url + '|' + title).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title:title || 'Big Boy special', text, url, expires });
  }
  return out.slice(0,20);
}
/* Stricter gate for generated/cached data. normalizeDeals() filters bad records
   so one stale post cannot break the page; this assertion is used before a
   payload is written to disk or promoted to a service-worker cache, so a bad
   deployment is rejected instead of silently becoming "last known good". */
function assertDealsPayload(data){
  if (!Array.isArray(data)) throw new Error('Deals payload is not an array');
  for (const d of data){
    if (!d || typeof d !== 'object') throw new Error('Malformed deal record');
    if (typeof d.title !== 'string' || typeof d.text !== 'string'){
      throw new Error('Deal title and text must be strings');
    }
    if (d.url !== undefined && d.url !== null){
      if (typeof d.url !== 'string') throw new Error('Deal URL must be a string');
      let u;
      try { u = new URL(d.url); } catch (e) { throw new Error('Deal URL is invalid'); }
      if (u.protocol !== 'https:' || (u.hostname !== 'facebook.com' && u.hostname !== 'www.facebook.com')){
        throw new Error('Deal URL host is not allowlisted');
      }
    }
    if (d.expires !== undefined && d.expires !== null && !Number.isFinite(Date.parse(d.expires))){
      throw new Error('Deal expiry is invalid');
    }
  }
  return normalizeDeals(data);
}

/* Only these origins may be framed. Everything else is a handoff. */
const EMBED_HOSTS = new Set([
  'www.openstreetmap.org', 'openstreetmap.org',
  'fooddudesdelivery.com', 'www.fooddudesdelivery.com'
]);
/* Payments, ordering, accounts and social logins must leave the app cleanly. */
const HAND_OFF_HOSTS = new Set([
  'order.toasttab.com', 'www.toasttab.com', 'toasttab.com',
  'www.facebook.com', 'facebook.com', 'www.instagram.com', 'instagram.com',
  'www.bismarckbigboy.com', 'bismarckbigboy.com',
  'www.ubereats.com', 'ubereats.com', 'www.doordash.com', 'doordash.com'
]);
function hostnameOf(url){
  try { const u = new URL(url); return { host:u.hostname.toLowerCase(), protocol:u.protocol }; }
  catch(e){ return { host:'', protocol:'' }; }
}
function canEmbed(url){
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.port && !parsed.username && !parsed.password
      && EMBED_HOSTS.has(parsed.hostname);
  } catch (e) {
    return false;
  }
}
function shouldHandoff(url){
  const { host, protocol } = hostnameOf(url);
  if (protocol !== 'http:' && protocol !== 'https:') return true;
  return HAND_OFF_HOSTS.has(host);
}
  root.BigBoyCore = {
    RESTAURANT, WEEKDAYS, parseHHMM, formatTime, businessNow, addDaysUTC,
    normalizeOverrides, effectiveHours, nextOpening, validateMenu,
    isValidMenuId, isValidWixImageId, normalizeDeals, assertDealsPayload,
    hostnameOf, canEmbed, shouldHandoff
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
