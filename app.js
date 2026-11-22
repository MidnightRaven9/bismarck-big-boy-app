/* Bismarck Big Boy — menu data + photos from bismarckbigboy.com.
   Pure helpers live in core.js so they can be unit-tested without a DOM. */
const { RESTAURANT, WEEKDAYS, parseHHMM, formatTime, businessNow, addDaysUTC,
        normalizeOverrides, effectiveHours, nextOpening, validateMenu,
        isValidMenuId, isValidWixImageId, normalizeDeals,
        hostnameOf, canEmbed, shouldHandoff } = globalThis.BigBoyCore;

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const money = n => '$' + n.toFixed(2);
// HTML-escape helper for inserting dynamic strings into innerHTML safely.
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;'}[c]));

/* Media ids are allowlisted in core.js, then encoded into the fixed Wix host.
   An invalid id returns '' so callers can omit the <img> entirely. */
const wix = (id, w, h) => {
  if (!isValidWixImageId(id)) return '';
  const media = encodeURIComponent(id);
  return `https://static.wixstatic.com/media/${media}/v1/fill/w_${w},h_${h},al_c,q_85,enc_auto/${media}`;
};

let HOUR_OVERRIDES = new Map();
let MENU = [];

async function loadMenu(){
  const res = await fetch('menu.json', { cache:'no-cache' });
  if (!res.ok) throw new Error('Menu request failed: ' + res.status);
  MENU = validateMenu(await res.json());
}

/* State + nonintrusive, throttled status notices */
const FAV_KEY = 'bb_favs_v1';
const NOTICE_MS = 30000;
const noticeTimes = new Map();
let storageReadBlocked = false, storageReadMalformed = false;

function notifyOnce(key, message){
  const now = Date.now();
  if (noticeTimes.has(key) && now - noticeTimes.get(key) < NOTICE_MS) return;
  noticeTimes.set(key, now);
  let el = document.getElementById('appToast');
  if (!el){
    el = document.createElement('div');
    el.id = 'appToast';
    el.className = 'app-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = message;
  clearTimeout(notifyOnce._timer);
  notifyOnce._timer = setTimeout(() => { el.remove(); }, 6000);
}

const state = { tab:'home', cat:'all', q:'', favs:loadFavs() };

function loadFavs(){
  let raw;
  try { raw = localStorage.getItem(FAV_KEY); }
  catch (e) { storageReadBlocked = true; return new Set(); }
  if (raw === null) return new Set();
  try {
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) throw new Error('Favorites payload is not an array');
    // Keep the existing format; ignore only ids that could never be menu ids.
    return new Set(saved.filter(isValidMenuId));
  } catch (e){
    storageReadMalformed = true;
    return new Set();
  }
}
function saveFavs(){
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify([...state.favs]));
  } catch (e){
    notifyOnce('favorites-write', 'Saved for this visit only — your browser blocked favorite storage.');
  }
}

const BY_ID = Object.create(null);
function buildMenuIndex(){
  MENU.forEach(g => g.items.forEach(it => { it._cat = g.name; BY_ID[it.id] = it; }));
  // A menu update can remove an item saved earlier — drop those stale ids.
  const stale = [...state.favs].filter(id => !BY_ID[id]);
  if (stale.length){ stale.forEach(id => state.favs.delete(id)); saveFavs(); }
  CATS = [{id:'all',name:'ALL'}].concat(MENU.map(g => ({id:g.id, name:g.name})));
}

/* Open / closed status — 10:30 AM to 9:00 PM, 7 days */
function updateStatus(){
  const el = $('#status'), main = $('#statusMain'), sub = $('#statusSub');
  if (!el || !main || !sub) return;
  let now;
  try { now = businessNow(); } catch {
    // If the local clock cannot be resolved, keep the indicator neutral.
  }
  const h = now && effectiveHours(now, HOUR_OVERRIDES);
  if (!h || !Number.isFinite(now.minutes) ||
      (!h.closed && !(Number.isFinite(h.open) && h.close > h.open && h.close <= 1440))){
    el.dataset.state = 'unknown';
    main.textContent = 'Status unavailable';
    sub.textContent = '';
    return;
  }
  if (h.closed){
    el.dataset.state = 'closed';
    main.textContent = 'Closed today';
    sub.textContent = h.note || 'Check our Facebook for updates.';
    return;
  }
  if (now.minutes >= h.open && now.minutes < h.close){
    el.dataset.state = 'open';
    main.textContent = 'Open now';
    sub.textContent = 'Closes ' + formatTime(h.close);
    return;
  }
  el.dataset.state = 'closed';
  main.textContent = 'Closed';
  if (now.minutes < h.open){
    sub.textContent = 'Opens ' + formatTime(h.open);
  } else {
    const nxt = nextOpening(now, HOUR_OVERRIDES);
    sub.textContent = nxt
      ? (nxt.date === addDaysUTC(now.date,1) ? 'Opens ' + formatTime(nxt.open) + ' tomorrow' : 'See Hours for next opening')
      : 'See Hours for details';
  }
}

function renderHours(){
  const today = businessNow();
  const rows = [];
  for (let i=0; i<7; i++){
    const date = addDaysUTC(today.date, i);
    const wd = new Date(date + 'T00:00:00Z').getUTCDay();
    const h = HOUR_OVERRIDES.get(date) || RESTAURANT.hours[wd];
    rows.push({ name:WEEKDAYS[wd], date, h, isToday:i===0 });
  }
  const card = $('#hoursCard');
  if (card){
    card.innerHTML = rows.map(r => {
      const hours = r.h && !r.h.closed
        ? formatTime(r.h.open) + ' – ' + formatTime(r.h.close)
        : 'Closed';
      return '<div class="hours-row ' + (r.isToday?'today':'') + '">' +
        '<span class="d">' + r.name + (r.isToday?' · TODAY':'') + '</span>' +
        '<span class="h">' + hours + '</span></div>';
    }).join('');
  }
  const d = RESTAURANT.hours[0];
  const uniform = RESTAURANT.hours.every(x => x.open===d.open && x.close===d.close && !x.closed) && HOUR_OVERRIDES.size === 0;
  const summary = uniform
    ? 'Seven days a week · ' + formatTime(d.open) + ' – ' + formatTime(d.close) + ' (CT)'
    : 'Hours vary — see the list below';
  $$('[data-hours-summary]').forEach(el => { el.textContent = summary; });
}

/* Facebook deals (from the auto-packager cron's scrape) */
async function renderFbDeals(){
  const el = $('#fbDealsList');
  if (!el) return;
  const empty = '<span class="fb-deals-empty">No current deals — check back soon.</span>';
  try {
    const res = await fetch('facebook_deals.json', { cache:'no-cache' });
    if (!res.ok) throw new Error('Deals request failed: ' + res.status);
    const live = normalizeDeals(await res.json());
    if (!live.length){ el.innerHTML = empty; return; }
    el.innerHTML = live.map(d => `
      <div class="fb-deal-card">
        <div class="fb-deal-head">
          <strong>${escapeHtml(d.title)}</strong>
          <svg class="fb-deal-chevron" aria-hidden="true"><use href="#i-chevron"/></svg>
        </div>
        <p>${escapeHtml(d.text)}</p>
        <button class="fb-deal-more" type="button">READ MORE</button>
        <a class="fb-deal-open" href="${escapeHtml(d.url)}" data-title="${escapeHtml(d.title)}">
          <svg aria-hidden="true"><use href="#i-external"/></svg> OPEN ON FACEBOOK
        </a>
        <span class="fb-deal-caveat">Details may change — confirm on the original post.</span>
      </div>`).join('');
  } catch(e){
    el.innerHTML = '<span class="fb-deals-empty">Deals are unavailable right now. Check back soon.</span>';
  }
}

/* Expand/collapse Facebook deal cards. The "Open on Facebook" link is left to
   the global external-link handler; it never toggles the card. */
document.addEventListener('click', e => {
  if (!(e.target instanceof Element)) return;
  const card = e.target.closest('.fb-deal-card');
  if (!card) return;
  if (e.target.closest('a')) return;
  card.classList.toggle('open');
  const more = card.querySelector('.fb-deal-more');
  if (more) more.textContent = card.classList.contains('open') ? 'SHOW LESS' : 'READ MORE';
});

/* Notifications — menu updates + open status alerts */
/* Storage can be blocked (private mode, strict settings). Never let an alert
   preference stop the rest of the app from initialising. */
const store = {
  get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } },
  set(k,v){
    try { localStorage.setItem(k,v); }
    catch(e){
      notifyOnce('prefs-write', 'Preferences are available for this visit only — your browser blocked storage.');
    }
  }
};
const NOTIF = {
  get on(){ return store.get('bb_notif') === '1'; },
  set on(v){ store.set('bb_notif', v ? '1' : '0'); },
  hasPermission(){
    return typeof Notification !== 'undefined' && Notification.permission === 'granted';
  },
  async ask(){
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    try { return await Notification.requestPermission() === 'granted'; }
    catch(e){ return false; }
  },
  show(title, body){
    if (!this.hasPermission()) return;
    try {
      const n = new Notification(title, { body, icon: 'icons/icon-512.png?v=2' });
      n.onclick = () => window.focus();
    } catch(e){}
  },
  menuHash(){
    if (this._h) return this._h;
    let h = 1469598103934665603;
    const str = MENU.map(g => g.name + '|' + g.items.map(i =>
      i.n + ';' + (i.d||'') + ';' + (i.s||[]).map(s => s[0]+'='+s[1]).join(',')
    ).join('&')).join('~');
    for (let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    this._h = h >>> 0;
    return this._h;
  },
  checkMenuChanged(){
    const h = String(this.menuHash());
    const prev = store.get('bb_menu_hash');
    if (prev !== h){
      store.set('bb_menu_hash', h);
      if (prev !== null && this.on && state.tab === 'home'){
        setTimeout(() => this.show('New menu items!', 'Your menu is updated — check out the new items.'), 1200);
      }
    }
  },
  maybeAlertOpen(){
    if (state.tab !== 'menu' || !this.on) return;
    if (!this.isOpen()) return;
    const today = businessNow().date;
    if (store.get('bb_open_alert_day') === today) return;
    store.set('bb_open_alert_day', today);
    setTimeout(() => this.show('Big Boy is OPEN!', 'The grill is hot — hop in for a burger!'), 1200);
  },
  isOpen(){
    const now = businessNow();
    const h = effectiveHours(now, HOUR_OVERRIDES);
    return !h.closed && now.minutes >= h.open && now.minutes < h.close;
  },
  renderToggle(){
    const b = $('#notifToggle');
    if (!b) return;
    b.classList.toggle('on', this.on);
    b.setAttribute('data-state', this.on ? 'on' : 'off');
    b.textContent = this.on ? 'Turn off' : 'Turn on';
    b.title = this.on ? 'Tap to disable alerts' : 'Tap to enable alerts';
  },
  init(){
    this.renderToggle();
    this.checkMenuChanged();
    $('#notifToggle')?.addEventListener('click', async () => {
      const on = !this.on;
      this.on = on;
      this.renderToggle();
      if (on){
        const granted = await this.ask();
        if (granted){
          setTimeout(() => this.show('Big Boy alerts', 'You’ll be notified when the menu updates or the grill turns on.'), 900);
        } else {
          this.on = false;   // don't leave the toggle implying alerts are enabled
          this.renderToggle();
        }
      }
    });
  }
};

/* Navigation */
const SCREENS = { home:'#s-home', menu:'#s-menu', favs:'#s-favs', rewards:'#s-rewards', info:'#s-info' };
function go(tab){
  if (!Object.hasOwn(SCREENS, tab)) return;
  state.tab = tab;
  Object.entries(SCREENS).forEach(([k,sel]) => $(sel).classList.toggle('active', k===tab));
  $$('.tab').forEach(t => {
    const on = t.dataset.tab === tab;
    t.classList.toggle('on', on);
    if (on) t.setAttribute('aria-current','page'); else t.removeAttribute('aria-current');
  });
  $('#orderbar').classList.toggle('show', tab==='menu');
  if (tab==='favs') renderFavs();
  if (tab==='menu') renderMenu();
  if (tab==='menu') NOTIF.maybeAlertOpen();
  if (tab==='info') renderFbDeals();
  window.scrollTo({top:0, behavior:'instant'});
  // Keep the URL in sync for PWA shortcuts. replaceState adds no history entry,
  // so the in-app browser's pushState/back flow stays intact.
  if (location.hash !== '#' + tab){
    try { history.replaceState(history.state, '', '#' + tab); } catch(e){}
  }
}
$$('.tab').forEach(t => t.addEventListener('click', () => go(t.dataset.tab)));

/* Menu rendering */
let CATS = [{id:'all',name:'ALL'}];

function renderChips(){
  // Build image map: category id -> first item image
  const imgMap = Object.create(null);
  MENU.forEach(g => {
    if (g.items && g.items.length) {
      imgMap[g.id] = g.items[0].img;
    }
  });
  $('#chips').innerHTML = CATS.map(c => {
    const imgSrc = wix(imgMap[c.id], 40, 40);
    const imgHtml = imgSrc
      ? `<img class="chip-thumb" src="${escapeHtml(imgSrc)}" alt="">`
      : '';
    return `<button class="chip ${state.cat===c.id?'on':''}" data-cat="${escapeHtml(c.id)}" aria-pressed="${state.cat===c.id}">${imgHtml}${escapeHtml(c.name)}</button>`;
  }).join('');
  $$('.chip').forEach(ch => ch.addEventListener('click', () => {
    state.cat = ch.dataset.cat;
    $$('.chip').forEach(chip => {
      const selected = chip === ch;
      chip.classList.toggle('on', selected);
      chip.setAttribute('aria-pressed', selected);
    });
    renderMenu();
  }));
}

// Edited thumbnails keyed by their exact original media ID, including sources
// already shared by multiple menu items. Unlisted sources keep their Wix URL.
const MENU_PHOTO_EDITS = {
  '063b6c_aecb05600db84f9183a638aed1785c79~mv2.jpg': 'big-boy-original-warm-studio.webp',
  '063b6c_b5d3ae991ff048fa82f72a223eb45bce~mv2.jpg': 'jr-big-boy-original-cool-studio.webp',
  '063b6c_a91baf12ad30489d9feeb1cd3ea44b43~mv2.jpg': 'hamburger-original-warm-studio.webp',
  '063b6c_329cdc6d6cb84fc7ba8dd21b6556241b~mv2.jpg': 'cheeseburger-original-warm-studio.webp',
  '063b6c_c609940490a44ab3b857a752eb0b07f9~mv2.jpg': 'alpine-burger-original-cool-studio.webp',
  '063b6c_724df592c7b34899bdc6fe94152f2e40~mv2.jpg': 'big-chicken-original-warm-studio.webp',
  '063b6c_13cfa18e944d48f8879049bbec783023~mv2.jpg': 'big-boy-fish-original-cool-studio.webp',
  '063b6c_a273ac51740b4045ab24f873a4bb544e~mv2.jpg': 'ham-cheese-original-warm-studio.webp',
  '063b6c_c7fd0a3f44c643f59a2b375188707dd6~mv2.jpg': 'bbq-beef-original-cool-studio.webp',
  '063b6c_2a3c6722badb40eaa6b5d41802de046f~mv2.jpg': 'hot-dog-6-original-warm-studio.webp',
  '063b6c_9e7fb4ef685046da98bdfad0db331acf~mv2.jpg': 'coney-6-original-warm-studio.webp',
  '063b6c_1e0367619e0141c4ac785f1740449126~mv2.jpg': 'chicken-1-breast-original-cool-studio.webp',
  '063b6c_ee203b2eef6844d199588095521955f7~mv2.jpg': 'strips-3-original-warm-studio.webp',
  '063b6c_3553570521ab43128da2cb05a425de8f~mv2.jpg': 'kids-nugget-original-cool-studio.webp',
  '063b6c_9ef2785b1857457e9a1c97e0e72bd0dc~mv2.jpg': 'onion-rings-original-warm-studio.webp',
  '063b6c_1628e15369d9490486927b9e715cf616~mv2.jpg': 'cheese-stix-original-cool-studio.webp',
  '063b6c_f7e53295af2247d582c54b8a44c1c996~mv2.jpg': 'poppers-original-warm-studio.webp',
  '063b6c_8f19006d857a4e9991d70ac70dd64c32~mv2.jpg': 'coleslaw-original-cool-studio.webp',
  '063b6c_713795ad8a4e4ca38e410a91370330a9~mv2.jpg': 'mac-salad-original-warm-studio.webp',
  '063b6c_b2b5d9bf38d5493aaf55391eac0553f9~mv2.jpg': 'potato-salad-original-warm-studio.webp',
  '063b6c_bd3567683a66429799a82c3780ed8851~mv2.jpg': 'gravy-original-cool-studio.webp',
  '063b6c_0ee0e0c4e19e4d2e86ba36be7b5d75a4~mv2.jpg': 'baked-beans-original-warm-studio.webp',
  '063b6c_daa1906f875d432e923207f603970489~mv2.jpg': 'pizza-burger-flying-style-white-studio.webp',
};

function picHTML(it, photoOverride){
  const original = wix(it.img, 300, 300);
  const edited = original && Object.hasOwn(MENU_PHOTO_EDITS, it.img) ? MENU_PHOTO_EDITS[it.img] : '';
  const filename = photoOverride || edited;
  const src = filename ? 'assets/menu/' + filename : original;
  const fallback = filename ? ` data-original-src="${escapeHtml(original)}"` : '';
  const img = src
    ? `<img alt="${escapeHtml(it.n)}" loading="lazy" decoding="async" src="${escapeHtml(src)}"${fallback}>`
    : '';
  return `<div class="pic ph"><span class="fb" aria-hidden="true"></span>${img}</div>`;
}

function itemHTML(it, photoOverride){
  const id = escapeHtml(it.id);
  const name = escapeHtml(it.n);
  const sizes = it.s.map((s,i) =>
    `<button class="size ${i===0?'on':''}" data-price="${s[1]}" aria-pressed="${i===0}">${escapeHtml(s[0])} ${money(s[1])}</button>`
  ).join('');
  const fav = state.favs.has(it.id);
  return `
  <div class="item" data-id="${id}">
    <div class="top">
      ${picHTML(it, photoOverride)}
      <div class="body">
        <h4>${name}</h4>
        ${it.d ? `<p class="desc">${escapeHtml(it.d)}</p>` : ''}
      </div>
      <button class="fav ${fav?'on':''}" data-fav="${id}" aria-label="Save ${name}" aria-pressed="${fav}"><svg aria-hidden="true"><use href="#i-heart"/></svg></button>
    </div>
    <div class="item-options">
      <div class="sizes">${sizes}</div>
      <div class="price-row" ${it.s.length===1?'hidden':''}>
        <span class="price-label">Selected</span>
        <span class="price" aria-live="polite">${money(it.s[0][1])}</span>
      </div>
    </div>
  </div>`;
}

function renderMenu(){
  $('#menuSkeleton')?.classList.remove('hidden');
  const q = state.q.trim().toLowerCase();
  let html = '';
  let shown = 0;
  MENU.forEach(g => {
    if (state.cat !== 'all' && state.cat !== g.id) return;
    const items = g.items.filter(it =>
      !q || it.n.toLowerCase().includes(q) || (it.d||'').toLowerCase().includes(q)
    );
    if (!items.length) return;
    shown += items.length;
    html += `<div class="cat-head">${escapeHtml(g.name)}<span>${items.length} ITEM${items.length>1?'S':''}</span></div>`;
    html += items.map(it => itemHTML(it, it.id === 'pizza-burger' ? 'pizza-burger-2056.jpg' : '')).join('');
  });
  if (!shown){
    html = `<div class="empty">
      <div class="big">Search</div>
      <h3>Nothing found</h3>
      <p>We couldn't match “${escapeHtml(state.q)}”. Try “fries”, “shake”, or “dog”.</p>
      <button class="btn ghost" id="clearSearchEmpty" data-action="clearSearch">CLEAR SEARCH</button>
    </div>`;
  }
  $('#menuSkeleton')?.classList.add('hidden');
  $('#menuList').innerHTML = html;
}

function clearSearch(){
  state.q = ''; $('#search').value = ''; $('#searchWrap').classList.remove('has'); renderMenu();
}

/* size chips + favorites (delegated) */
document.addEventListener('click', e => {
  const sizeBtn = e.target.closest('.size');
  if (sizeBtn){
    const wrap = sizeBtn.closest('.item');
    wrap.querySelectorAll('.size').forEach(button => {
      const selected = button === sizeBtn;
      button.classList.toggle('on', selected);
      button.setAttribute('aria-pressed', selected);
    });
    wrap.querySelector('.price').textContent = money(parseFloat(sizeBtn.dataset.price));
    return;
  }
  const favBtn = e.target.closest('[data-fav]');
  if (favBtn){
    const id = favBtn.dataset.fav;
    if (state.favs.has(id)) state.favs.delete(id); else state.favs.add(id);
    saveFavs(); updateBadge();
    // Compare dataset values instead of interpolating an id into a CSS selector.
    $$('[data-fav]').forEach(b => {
      if (b.dataset.fav !== id) return;
      const saved = state.favs.has(id);
      b.classList.toggle('on', saved);
      b.setAttribute('aria-pressed', saved);
    });
    if (state.tab==='favs') renderFavs();
  }
});

function updateBadge(){
  const n = state.favs.size;
  const b = $('#favBadge');
  b.textContent = n;
  b.classList.toggle('show', n>0);
}

/* Favorites screen */
function renderFavs(){
  const ids = [...state.favs];
  const box = $('#favList');
  if (!ids.length){
    box.innerHTML = `<div class="favorites-empty">
      <span class="favorites-mark" aria-hidden="true"><svg><use href="#i-heart"/></svg></span>
      <h2>No favorites yet</h2>
      <p>Tap the heart on a menu item to save it here.</p>
      <button class="btn" data-goto="menu">Browse Menu</button>
    </div>`;
    return;
  }
  const groups = Object.create(null);
  ids.forEach(id => {
    const it = BY_ID[id];
    if (!it) return;
    (groups[it._cat] = groups[it._cat] || []).push(it);
  });
  box.innerHTML = Object.entries(groups).map(([cat, items]) =>
    `<div class="cat-head">${escapeHtml(cat)}<span>${items.length} SAVED</span></div>` + items.map(it => itemHTML(it)).join('')
  ).join('') + `<div class="mt-18">
      <a class="btn block" href="https://order.toasttab.com/online/big-boy-2511-east-main-avenue" data-title="Order Online">ORDER THESE ONLINE →</a>
    </div>`;
}

/* Search */
$('#search').addEventListener('input', e => {
  state.q = e.target.value;
  $('#searchWrap').classList.toggle('has', !!state.q);
  renderMenu();
});
$('#searchClear').addEventListener('click', clearSearch);

/* In-app browser.
   Sites that refuse to be framed get a handoff card instead of a blank
   iframe, so the app always explains what happened. */
/* Anchor-based open keeps the click user-initiated and strips opener/referrer. */
function openExternal(url){
  const { protocol } = hostnameOf(url);
  if (protocol !== 'http:' && protocol !== 'https:') return;
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  a.setAttribute('data-raw', ''); // do not let the global interceptor re-open this link
  a.hidden = true;
  document.body.appendChild(a);
  try { a.click(); } finally { a.remove(); }
}

const iab = $('#iab'), iabBody = $('#iabBody'), iabFrame = $('#iabFrame');
let iabUrl = '', iabIsOpen = false, iabReturnFocus = null;

function openIAB({src, url, title}){
  iabUrl = url;
  let host = '', hostRaw = '';
  try {
    const u = new URL(url);
    hostRaw = u.hostname;
    host = u.hostname.replace(/^www\./,'');
  } catch(e){ host = url; }

  // Escape every dynamic value before it reaches innerHTML. Deal titles come
  // from the scraped Facebook JSON, so they must not be treated as markup.
  const escTitle = escapeHtml(title || ''), escHost = escapeHtml(host);
  $('#iabHost').innerHTML = escTitle
    ? `${escTitle}<small>${escHost}</small>`
    : `<span>${escHost}</span>`;
  const fav = $('#iabFav');
  delete fav.dataset.bbFallback;
  fav.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostRaw)}&sz=64`;
  fav.alt = (title || host) + ' website favicon';
  fav.hidden = false;
  fav.onerror = () => { fav.hidden = true; };

  if (src){
    iabBody.className = 'iab-body web';
    iab.classList.add('loading');
    iabFrame.src = src;
  } else {
    iabFrame.src = 'about:blank';
    iabBody.className = 'iab-body handoff';
    $('#hoInner').innerHTML = `
      <img class="site-img" alt="" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostRaw)}&sz=128">
      <h3>${escTitle || escHost}</h3>
      <div class="host">${escHost}</div>
      <p>This site blocks being displayed inside other apps. Continue to open it — your spot in the app is saved.</p>
      <a class="btn block" id="hoGo" data-raw target="_blank" rel="noopener noreferrer" href="${escapeHtml(url)}">CONTINUE TO ${escapeHtml(host.toUpperCase())} →</a>
      <button class="btn dark block" id="hoCancel">GO BACK TO THE APP</button>
      <div class="why">Your place in the app is kept — just tap Back to return.</div>`;
    $('#hoGo').addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();          // stop the global link interceptor re-opening the overlay
      openExternal(url);
      closeIAB();
    });
    $('#hoCancel').addEventListener('click', closeIAB);
  }

  if (!iabIsOpen){
    iabIsOpen = true;
    iabReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    try { history.pushState({iab:true}, ''); } catch(e){}
  }
  iab.classList.add('open');
  document.body.classList.add('locked');
  iab.focus();
}

function hideIAB(){
  iabIsOpen = false;
  iab.classList.remove('open');
  document.body.classList.remove('locked');
  iab.classList.remove('loading');
  iabFrame.src = 'about:blank';
  if (iabReturnFocus && document.contains(iabReturnFocus)) iabReturnFocus.focus();
  iabReturnFocus = null;
}
function closeIAB(){
  if (history.state && history.state.iab) history.back();   // triggers popstate → hideIAB
  else hideIAB();
}
window.addEventListener('popstate', () => { if (iabIsOpen) hideIAB(); });

$('#iabBack').addEventListener('click', closeIAB);
$('#iabExt').addEventListener('click', () => {
  if (!iabUrl) return;
  openExternal(iabUrl);
});
iabFrame.addEventListener('load', () => iab.classList.remove('loading'));

/* Keep keyboard focus inside the modal while it is open. */
function trapIabFocus(e){
  if (e.key !== 'Tab' || !iabIsOpen) return;
  const list = [...iab.querySelectorAll('button:not([disabled]), a[href], iframe, [tabindex]:not([tabindex="-1"])')]
    .filter(n => n.getClientRects().length);
  if (!list.length) return;
  const first = list[0], last = list[list.length-1];
  if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
}
document.addEventListener('keydown', e => {
  if (!iabIsOpen) return;
  if (e.key === 'Escape') closeIAB();
  else trapIabFocus(e);
});

/* intercept every external link so nothing silently leaves the app */
document.addEventListener('click', e => {
  if (!(e.target instanceof Element)) return;
  const a = e.target.closest('a[href]');
  if (!a) return;
  if (a.hasAttribute('data-raw')) return;   // handoff buttons handle themselves
  const forced = a.getAttribute('data-iab');
  const href = a.getAttribute('href') || '';
  if (!forced && !/^https?:/i.test(href)) return;   // tel:, #, mailto: → native behaviour
  e.preventDefault();
  const url = forced || href;
  if (shouldHandoff(url)){ openExternal(href); return; }
  openIAB({
    src: canEmbed(url) ? url : null,
    url: href,
    title: a.dataset.title || ''
  });
}, false);

/* internal navigation via data-goto + data-action (replaces inline onclick handlers) */
document.addEventListener('click', e => {
  if (!(e.target instanceof Element)) return;
  const nav = e.target.closest('[data-goto]');
  if (nav){ e.preventDefault(); go(nav.dataset.goto); return; }
  const act = e.target.closest('[data-action]');
  if (act){
    e.preventDefault();
    if (act.dataset.action === 'clearSearch') clearSearch();
  }
});

/* Image-load failures swap in a local, CSP-allowed SVG instead of hiding the
   image. The tile keeps its fixed size and the original alt text stays in the
   accessibility tree; the dataset flag prevents retry loops. */
const IMAGE_PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<rect width="64" height="64" fill="#2A2A2A"/>' +
  '<text x="32" y="41" text-anchor="middle" font-family="system-ui,sans-serif" ' +
  'font-size="26" font-weight="700" fill="#C8102E">BB</text></svg>'
);
document.addEventListener('error', e => {
  const t = e.target;
  if (!(t instanceof HTMLImageElement) || t.id === 'iabFav' || t.dataset.bbFallback) return;
  if (t.dataset.originalSrc){
    const original = t.dataset.originalSrc;
    delete t.dataset.originalSrc;
    t.src = original;
    return;
  }
  t.dataset.bbFallback = '1';
  t.removeAttribute('loading');
  t.src = IMAGE_PLACEHOLDER;
}, true);

/* Init */
async function initApp(){
  let menuOk = true;
  try { await loadMenu(); }
  catch(e){ menuOk = false; console.warn('Menu unavailable:', e.message); }
  try {
    const r = await fetch('hours_overrides.json', { cache:'no-cache' });
    HOUR_OVERRIDES = normalizeOverrides(r.ok ? await r.json() : null);
  } catch(e){ HOUR_OVERRIDES = new Map(); }
  if (menuOk) buildMenuIndex();
  renderChips();
  renderMenu();
  if (!menuOk){
    const list = $('#menuList');
    if (list) list.innerHTML = '<div class="empty"><h3>Menu unavailable</h3><p>The menu could not be loaded. Check your connection and try again.</p></div>';
  }
  renderHours();
  updateStatus();
  updateBadge();
  if (storageReadBlocked){
    notifyOnce('favorites-read', 'Favorites could not be read — your browser blocked storage. New picks are kept for this visit only.');
  } else if (storageReadMalformed){
    notifyOnce('favorites-read', 'Saved favorites could not be read and were reset. New picks can still be used for this visit.');
  }
  setInterval(updateStatus, 30000);
  NOTIF.init();
  renderFbDeals();
  window.addEventListener('hashchange', applyHash);
  applyHash();
}
initApp()
  .catch(error => {
    console.error('App startup did not finish:', error.message);
    notifyOnce('startup', 'Some parts of the app could not load. Reload to try again.');
  })
  .finally(() => window.BigBoyStartup?.finish());

/* PWA shortcuts deep-link into a screen or action. */
function applyHash(){
  const h = location.hash.slice(1);
  if (Object.hasOwn(SCREENS, h)){ go(h); return; }
  if (h === 'order' || h === 'directions'){
    go('home');
    const sel = h === 'order' ? '.qa a.primary' : '.qa a[data-title="Directions"]';
    const link = document.querySelector(sel);
    if (link) setTimeout(() => link.click(), 120);
  }
}

/* PWA — installable + offline shell */
if ('serviceWorker' in navigator) {
  /* A failed install is never activated, so it cannot always message the page.
     The marker in Cache Storage is the reliable cross-reload source of truth. */
  const SHELL_NOTICE_KEY = 'bb_shell_notice_v1';
  const RETRY_KEY = 'bb_sw_retry_v1';
  const FAILURE_KEY = './__shell_install_failed';
  const shellNoticePending = () => {
    try { return sessionStorage.getItem(SHELL_NOTICE_KEY) === '1'; } catch (e) { return false; }
  };
  const retryCount = () => {
    try { return Math.max(0, parseInt(sessionStorage.getItem(RETRY_KEY) || '0', 10) || 0); }
    catch (e) { return 0; }
  };
  const clearShellFailure = async () => {
    try { await (await caches.open('bb-shell-state')).delete(FAILURE_KEY); } catch (e) {}
  };
  const checkShellFailure = async (tries = 40) => {
    // The install attempt may still be in flight when this script runs, so
    // watch the persisted marker briefly instead of assuming it exists yet.
    for (let i = 0; i < tries; i++){
      try {
        const state = await caches.open('bb-shell-state');
        if (await state.match(FAILURE_KEY)){ showShellInstallNotice(); return true; }
      } catch (e) {}
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    return false;
  };

  const showShellInstallNotice = () => {
    try { sessionStorage.setItem(SHELL_NOTICE_KEY, '1'); } catch (e) {}
    const el = $('#appNotice');
    if (!el || !el.hidden) return;
    el.hidden = false;
    el.textContent = 'Offline setup did not finish. Some pages may not load without a connection. ';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.textContent = 'RETRY';
    btn.addEventListener('click', async () => {
      try { sessionStorage.removeItem(SHELL_NOTICE_KEY); } catch (e) {}
      await clearShellFailure();
      // A new script URL forces the browser to run install again even when
      // sw.js bytes and the shell hash are unchanged.
      try { sessionStorage.setItem(RETRY_KEY, String(retryCount() + 1)); } catch (e) {}
      location.reload();
    });
    el.appendChild(btn);
  };
  if (shellNoticePending()) showShellInstallNotice();
  checkShellFailure();

  navigator.serviceWorker.addEventListener('message', e => {
    if (!e.data) return;
    if (e.data.type === 'SHELL_INSTALL_FAILED'){
      showShellInstallNotice();
      return;
    }
    if (e.data.type === 'SHELL_INSTALL_OK'){
      try { sessionStorage.removeItem(SHELL_NOTICE_KEY); } catch (err) {}
      const el = $('#appNotice');
      if (el){ el.hidden = true; el.textContent = ''; }
      return;
    }
    if (e.data.type === 'CONTENT_FALLBACK'){
      const file = String(e.data.url || 'content').split('/').pop().replace(/\.json$/, '');
      notifyOnce('content-' + file,
        'Showing saved ' + file + ' because the latest copy could not be validated.');
    }
  });

  /* The committed app-shell hash changes whenever any shipped asset changes.
     Adding its derived version to the script URL makes the browser treat the
     same static sw.js as a new worker, so a menu/icon/markup change still
     triggers a fresh, content-addressed cache install. */
  async function swScriptUrl(){
    try {
      const res = await fetch('APP_SHELL_HASH.txt', { cache:'no-store' });
      if (res.ok){
        const hash = (await res.text()).trim();
        if (/^[a-f0-9]{960}$/.test(hash)){
          // Derive from the full hash: a prefix would ignore later inputs such
          // as sw.js, manifest and icons.
          const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hash));
          const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
          const retry = retryCount();
          return 'sw.js?v=' + hex.slice(0, 16) + (retry ? '&retry=' + retry : '');
        }
      }
    } catch (e) {}
    return 'sw.js';
  }

  window.addEventListener('load', () => {
    // Register the listener before activation can claim this tab.
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.BigBoyStartup?.skipNextReload();
      location.reload();
    });
    swScriptUrl()
      .then(url => navigator.serviceWorker.register(url, { updateViaCache:'none' }))
      .catch(() => {});
  });
  // Ask an existing active worker for any failure from this session.
  navigator.serviceWorker.ready
    .then(reg => reg.active && reg.active.postMessage({ type:'CHECK_SHELL' }))
    .catch(() => {});
}
