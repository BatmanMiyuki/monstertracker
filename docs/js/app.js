// ════════════════════════════════════════════════════════════
//  MonsterTracker v2.1 — Version 100 % statique (GitHub Pages)
//  Toutes les données vivent dans le navigateur (localStorage).
//  Aucun serveur, aucun compte, aucun envoi de données.
// ════════════════════════════════════════════════════════════
'use strict';

var STORAGE_KEY = 'mt_static_v1';
var state = null;
var pickerMode = null;
var _detailCan = null;
var _resetCode = '';
var _installPrompt = null;

// ── Helpers ──
function escapeHtml(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function toast(msg, t) {
  t = t || 'ok';
  var el = document.createElement('div');
  el.className = 'toast ' + t;
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(function () { el.remove(); }, 3400);
}
function eHtml(i, t, p) { return '<div class="empty"><div class="ei">' + i + '</div><h3>' + escapeHtml(t) + '</h3><p>' + escapeHtml(p) + '</p></div>'; }
function fmtPrice(v) { return (v != null && parseFloat(v) > 0) ? parseFloat(v).toFixed(2) + '€' : '—'; }
function fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString('fr-FR') : ''; }
function timeAgo(iso) {
  var s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'à l\'instant';
  if (s < 3600) return Math.floor(s / 60) + ' min';
  if (s < 86400) return Math.floor(s / 3600) + ' h';
  return Math.floor(s / 86400) + ' j';
}
function setErr(id, text) { var el = document.getElementById(id); if (el) { el.textContent = text || ''; el.classList.toggle('on', !!text); } }
function setOk(id, text) { var el = document.getElementById(id); if (el) { el.textContent = text || ''; el.classList.toggle('on', !!text); } }
window.closeModal = function (id) { document.getElementById('modal-' + id).classList.remove('on'); };
window.tpw = function (id, eye) {
  var i = document.getElementById(id);
  i.type = i.type === 'password' ? 'text' : 'password';
  eye.textContent = i.type === 'password' ? '👁' : '🙈';
};

// ════════════════════════════════════════════════════════
//  PERSISTANCE (localStorage)
// ════════════════════════════════════════════════════════
var DEMO_CANS = [
  { name: 'Monster Energy Original', series: 'Original', variant: null, language: 'FR', cap_color: 'Noir', full_color: 'Noir', volume: '500ml', country: 'France', year: 2020, description: 'La canette iconique, celle par qui tout a commencé.', is_limited: 0, accent_color: '#39ff14' },
  { name: 'Monster Ultra White', series: 'Ultra', variant: 'Zero Sugar', language: 'FR', cap_color: 'Blanc', full_color: 'Blanc', volume: '500ml', country: 'France', year: 2021, description: 'Sans sucre, goût citronné léger.', is_limited: 0, accent_color: '#e8e8e8' },
  { name: 'Monster Ultra Red', series: 'Ultra', variant: 'Sans sucre', language: 'FR', cap_color: 'Rouge', full_color: 'Rouge', volume: '500ml', country: 'France', year: 2021, description: 'Notes de fruits rouges sans sucre.', is_limited: 0, accent_color: '#ff3535' },
  { name: 'Monster Ultra Violet', series: 'Ultra', variant: 'Grape', language: 'EN', cap_color: 'Violet', full_color: 'Violet', volume: '500ml', country: 'Royaume-Uni', year: 2022, description: 'Raisin pétillant, très populaire au Royaume-Uni.', is_limited: 0, accent_color: '#bf5fff' },
  { name: 'Monster Mango Loco', series: 'Juice', variant: 'Mango Loco', language: 'EN', cap_color: 'Jaune', full_color: 'Jaune', volume: '500ml', country: 'Espagne', year: 2019, description: 'Jus de mangue exotique, la plus recherchée en France.', is_limited: 0, accent_color: '#ffc800' },
  { name: 'Monster Pacific Punch', series: 'Juice', variant: 'Pacific Punch', language: 'EN', cap_color: 'Orange', full_color: 'Orange', volume: '500ml', country: 'USA', year: 2020, description: 'Punch tropical importé des États-Unis.', is_limited: 0, accent_color: '#ff9600' },
  { name: 'Monster Khaotic', series: 'Juice', variant: 'Khaotic', language: 'EN', cap_color: 'Orange', full_color: 'Orange', volume: '473ml', country: 'USA', year: 2018, description: 'Agrumes en pagaille. Rare en Europe.', is_limited: 1, accent_color: '#ff9600' },
  { name: 'Monster Pipeline Punch', series: 'Juice', variant: 'Pipeline Punch', language: 'EN', cap_color: 'Rose', full_color: 'Rose', volume: '500ml', country: 'Royaume-Uni', year: 2021, description: 'Fruit de la passion, orange et goyave.', is_limited: 0, accent_color: '#ff6ec7' },
  { name: 'Monster Rehab Tea + Lemonade', series: 'Rehab', variant: 'Tea + Lemonade', language: 'EN', cap_color: 'Vert', full_color: 'Blanc', volume: '458ml', country: 'USA', year: 2019, description: 'Thé glacé et limonade, faible en calories.', is_limited: 0, accent_color: '#00e5a0' },
  { name: 'Monster Ultra Paradise', series: 'Ultra', variant: 'Paradise', language: 'FR', cap_color: 'Vert', full_color: 'Vert clair', volume: '500ml', country: 'France', year: 2022, description: 'Kiwi, citron vert et concombre.', is_limited: 0, accent_color: '#7fff6e' },
  { name: 'Monster Ultra Watermelon', series: 'Ultra', variant: 'Watermelon', language: 'FR', cap_color: 'Vert', full_color: 'Rouge', volume: '500ml', country: 'France', year: 2022, description: 'Pastèque sans sucre.', is_limited: 0, accent_color: '#ff5566' },
  { name: 'Monster Lewis Hamilton #44', series: 'Édition Spéciale', variant: 'F1 Collaboration', language: 'EN', cap_color: 'Noir', full_color: 'Noir/Rouge', volume: '500ml', country: 'Royaume-Uni', year: 2023, description: 'Édition limitée en l’honneur de Lewis Hamilton.', is_limited: 1, accent_color: '#ff3535' },
  { name: 'Monster Ultra Gold', series: 'Ultra', variant: 'Gold', language: 'FR', cap_color: 'Doré', full_color: 'Doré', volume: '500ml', country: 'France', year: 2023, description: 'Notes d’ananas doré, sans sucre.', is_limited: 0, accent_color: '#ffd700' },
  { name: 'Monster Ultra Blue', series: 'Ultra', variant: 'Blueberry', language: 'FR', cap_color: 'Bleu', full_color: 'Bleu', volume: '500ml', country: 'France', year: 2023, description: 'Myrtille sans sucre.', is_limited: 0, accent_color: '#44aaff' },
  { name: 'Monster Java Vanilla Light', series: 'Java', variant: 'Vanilla Light', language: 'EN', cap_color: 'Beige', full_color: 'Beige', volume: '473ml', country: 'USA', year: 2017, description: 'Café latte vanille, rarissime en Europe.', is_limited: 1, accent_color: '#d8c9a3' },
  { name: 'Monster The Doctor VR46', series: 'Édition Spéciale', variant: 'Valentino Rossi', language: 'IT', cap_color: 'Jaune', full_color: 'Jaune/Bleu', volume: '500ml', country: 'Italie', year: 2022, description: 'Collaboration Valentino Rossi, introuvable en France.', is_limited: 1, accent_color: '#ffc800' },
];

function defaultState() {
  var cans = DEMO_CANS.map(function (c, i) {
    return Object.assign({ id: i + 1, image_url: null, created_at: new Date().toISOString() }, c);
  });
  return {
    version: 1,
    profile: { username: 'Collectionneur', theme: 'dark', avatar: null },
    cans: cans,
    collection: [],   // [{can_id, price, purchase_type, added_at}]
    wishlist: [],     // [can_id]
    favorites: {},    // {1: can_id, 2: can_id, 3: can_id}
    nextCanId: cans.length + 1,
  };
}

function loadState() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.cans && parsed.profile) return parsed;
    }
  } catch (e) { console.warn('État illisible, réinitialisation.', e); }
  return defaultState();
}
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    toast('Stockage plein ! Supprime des canettes avec photo ou exporte tes données.', 'err');
    return false;
  }
}

// ── Redimensionnement d'image (évite de saturer le localStorage) ──
function resizeImage(file, maxDim, quality, cb) {
  var r = new FileReader();
  r.onload = function (e) {
    var img = new Image();
    img.onload = function () {
      var w = img.width, h = img.height;
      var scale = Math.min(1, maxDim / Math.max(w, h));
      var c = document.createElement('canvas');
      c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      cb(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = function () { cb(null); };
    img.src = e.target.result;
  };
  r.onerror = function () { cb(null); };
  r.readAsDataURL(file);
}

// ════════════════════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════════════════════
window.go = function (p) {
  document.querySelectorAll('.page').forEach(function (x) { x.classList.remove('active'); });
  document.getElementById('page-' + p).classList.add('active');
  window.scrollTo(0, 0);
};
window.enterApp = function () {
  applyThemeUI(state.profile.theme || 'dark');
  document.getElementById('nav-name').textContent = state.profile.username || 'Collectionneur';
  go('app');
  goTab('home', document.getElementById('tab-home'));
};
window.goTab = function (s, btn) {
  document.querySelectorAll('.sec').forEach(function (x) { x.classList.remove('on'); });
  document.querySelectorAll('.ntab').forEach(function (x) { x.classList.remove('on'); });
  document.getElementById('sec-' + s).classList.add('on');
  if (btn) btn.classList.add('on');
  var m = { home: renderHome, catalogue: renderCatalogue, collection: renderCollection, manage: renderManage, settings: renderSettings };
  if (m[s]) m[s]();
};

// ── Thèmes ──
var THEMES = {
  dark: '',
  green: ':root{--g:#39ff14;--glow:rgba(57,255,20,.18);--g-r:57;--g-g:255;--g-b:20;--g-hov:#50ff2a;}',
  red: ':root{--g:#ff3535;--glow:rgba(255,53,53,.18);--g-r:255;--g-g:53;--g-b:53;--g-hov:#ff5555;}',
  blue: ':root{--g:#44aaff;--glow:rgba(68,170,255,.18);--g-r:68;--g-g:170;--g-b:255;--g-hov:#66bbff;}',
};
function applyThemeUI(t) {
  var s = document.getElementById('th-ov');
  if (!s) { s = document.createElement('style'); s.id = 'th-ov'; document.head.appendChild(s); }
  s.textContent = THEMES[t] || '';
  document.querySelectorAll('.theme-btn').forEach(function (b) { b.classList.remove('on'); });
  var tb = document.getElementById('th-' + t);
  if (tb) tb.classList.add('on');
}
window.setTheme = function (t) {
  state.profile.theme = t;
  applyThemeUI(t);
  save();
};

// ════════════════════════════════════════════════════════
//  ACCÈS DONNÉES
// ════════════════════════════════════════════════════════
function canById(id) { return state.cans.find(function (c) { return c.id === id; }); }
function inCollection(canId) { return state.collection.some(function (x) { return x.can_id === canId; }); }
function inWishlist(canId) { return state.wishlist.indexOf(canId) !== -1; }
function collectionValue() {
  return state.collection.reduce(function (s, x) { return s + (parseFloat(x.price) || 0); }, 0);
}

// ════════════════════════════════════════════════════════
//  CHARTS
// ════════════════════════════════════════════════════════
function drawBarChart(data, cid) {
  var el = document.getElementById(cid);
  if (!data || !data.length) { el.innerHTML = '<div style="text-align:center;color:var(--mu);font-size:12px;padding:20px;">Pas de données</div>'; return; }
  var themeG = getComputedStyle(document.documentElement).getPropertyValue('--g').trim() || '#39ff14';
  var colors = [themeG, '#00cfff', '#ff9600', '#ff3535', '#ffc800', '#bf5fff', '#00e5a0', '#ff6ec7', '#7fff6e', '#5599ff'];
  var max = Math.max.apply(null, data.map(function (d) { return d.count; }));
  var html = '<div style="display:flex;flex-direction:column;gap:6px;">';
  data.slice(0, 8).forEach(function (d, i) {
    var pct = max > 0 ? Math.round((d.count / max) * 100) : 0;
    html += '<div style="display:flex;align-items:center;gap:8px;"><div style="width:80px;font-size:11px;color:#bbb;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(d.label) + '</div><div style="flex:1;height:16px;background:var(--br);"><div style="height:100%;width:' + pct + '%;background:' + colors[i % colors.length] + ';transition:width .5s;"></div></div><div style="width:24px;font-size:11px;color:var(--mu);text-align:right;">' + d.count + '</div></div>';
  });
  el.innerHTML = html + '</div>';
}

// ════════════════════════════════════════════════════════
//  CARTE CANETTE
// ════════════════════════════════════════════════════════
function accentBg(color) {
  color = color || getComputedStyle(document.documentElement).getPropertyValue('--g').trim() || '#39ff14';
  var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
  if (!m) return 'var(--bk)';
  var r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
  return 'radial-gradient(ellipse at 50% 65%, rgba(' + r + ',' + g + ',' + b + ',0.16) 0%, rgba(8,8,8,1) 68%)';
}
function canCardHtml(can, btnsHtml) {
  var accent = can.is_limited ? '#ff9600' : (can.accent_color || '#39ff14');
  var img = can.image_url
    ? '<img src="' + escapeHtml(can.image_url) + '" alt="' + escapeHtml(can.name) + '" onerror="this.style.display=\'none\'">'
    : '<span style="font-size:52px;">&#129371;</span>';
  var lim = can.is_limited ? '<div class="lim-tag">Limitée</div>' : '';
  var owned = inCollection(can.id) ? '<div class="owned-ov"><div class="owned-tag">✓ Possédée</div></div>' : '';
  var sub = [can.series, can.variant, can.country, can.year].filter(Boolean).map(escapeHtml).join(' · ') || '—';
  var cardBorder = can.is_limited ? 'border:2px solid #ff9600;border-bottom:3px solid #ff9600;' : 'border-bottom:3px solid ' + accent + ';';
  return '<div class="ccard" style="' + cardBorder + '">'
    + '<div class="cthumb" style="background:' + accentBg(accent) + '">' + img + lim + owned + '</div>'
    + '<div class="cbody">'
    + '<div class="cname">' + escapeHtml(can.name) + '</div>'
    + '<div class="csub">' + sub + '</div>'
    + (btnsHtml ? '<div class="cbtns">' + btnsHtml + '</div>' : '')
    + '</div></div>';
}

// ════════════════════════════════════════════════════════
//  ACCUEIL
// ════════════════════════════════════════════════════════
function renderHome() {
  var owned = state.collection.length;
  var total = state.cans.length;
  var value = collectionValue();
  var pct = total ? Math.round((owned / total) * 100) : 0;
  document.getElementById('h-owned').textContent = owned;
  document.getElementById('h-total').textContent = total;
  document.getElementById('h-value').textContent = value > 0 ? value.toFixed(2) + '€' : '—';
  document.getElementById('h-wish').textContent = state.wishlist.length;
  document.getElementById('h-pct').textContent = pct + '%';
  document.getElementById('h-prog').style.width = pct + '%';

  var seriesMap = {}, langMap = {};
  state.collection.forEach(function (x) {
    var c = canById(x.can_id);
    if (!c) return;
    if (c.series) seriesMap[c.series] = (seriesMap[c.series] || 0) + 1;
    if (c.language) langMap[c.language] = (langMap[c.language] || 0) + 1;
  });
  drawBarChart(Object.keys(seriesMap).map(function (k) { return { label: k, count: seriesMap[k] }; }).sort(function (a, b) { return b.count - a.count; }), 'chart-series');
  drawBarChart(Object.keys(langMap).map(function (k) { return { label: k, count: langMap[k] }; }).sort(function (a, b) { return b.count - a.count; }), 'chart-lang');

  var recent = state.collection.slice().sort(function (a, b) { return new Date(b.added_at) - new Date(a.added_at); }).slice(0, 5);
  var elRec = document.getElementById('h-recent');
  if (recent.length) {
    var rhtml = '<div class="rec-list">';
    recent.forEach(function (x) {
      var c = canById(x.can_id); if (!c) return;
      var thumb = c.image_url ? '<img src="' + escapeHtml(c.image_url) + '" alt="" onerror="this.style.display=\'none\'"/>' : '&#129371;';
      rhtml += '<div class="rec-item"><div class="rec-thumb">' + thumb + '</div><div><div class="rec-name">' + escapeHtml(c.name) + '</div><div class="rec-date">' + fmtDate(x.added_at) + '</div></div><div class="rec-ago">' + timeAgo(x.added_at) + '</div></div>';
    });
    elRec.innerHTML = rhtml + '</div>';
  } else elRec.innerHTML = eHtml('&#129371;', 'Aucune canette ajoutée', 'Commence ta collection depuis le catalogue !');

  var elWish = document.getElementById('h-wishlist');
  var wishCans = state.wishlist.map(canById).filter(Boolean).slice(0, 5);
  if (wishCans.length) {
    var whtml = '<div class="rec-list">';
    wishCans.forEach(function (c) {
      var thumb = c.image_url ? '<img src="' + escapeHtml(c.image_url) + '" alt="" onerror="this.style.display=\'none\'"/>' : '&#129371;';
      whtml += '<div class="rec-item"><div class="rec-thumb">' + thumb + '</div><div><div class="rec-name">' + escapeHtml(c.name) + '</div><div class="rec-date">' + escapeHtml(c.series || '') + '</div></div></div>';
    });
    elWish.innerHTML = whtml + '</div>';
  } else elWish.innerHTML = eHtml('💚', 'Wishlist vide', 'Ajoute des canettes à ta wishlist depuis le catalogue !');
}

// ════════════════════════════════════════════════════════
//  CATALOGUE
// ════════════════════════════════════════════════════════
window.renderCatalogue = function () {
  var q = (document.getElementById('search').value || '').toLowerCase();
  var cans = state.cans.filter(function (c) {
    return !q || (c.name || '').toLowerCase().includes(q) || (c.series || '').toLowerCase().includes(q) || (c.variant || '').toLowerCase().includes(q);
  });
  var el = document.getElementById('cat-ct');
  if (!cans.length) { el.innerHTML = eHtml('&#129371;', 'AUCUNE CANETTE TROUVÉE', 'Aucun résultat.'); return; }
  var html = '<div class="cgrid">';
  cans.forEach(function (can) {
    var owned = inCollection(can.id);
    var wished = inWishlist(can.id);
    var colBtn = '<button class="cbtn ' + (owned ? 'on' : '') + '" onclick="event.stopPropagation();toggleCol(' + can.id + ')">' + (owned ? '✓ Possédée' : '+ Collection') + '</button>';
    var wlBtn = '<button class="cbtn wl ' + (wished ? 'on' : '') + '" onclick="event.stopPropagation();toggleWl(' + can.id + ')">' + (wished ? '♥' : '♡') + ' Wish</button>';
    html += '<div onclick="openCanDetailById(' + can.id + ')">' + canCardHtml(can, colBtn + wlBtn) + '</div>';
  });
  el.innerHTML = html + '</div>';
};

window.openCanDetailById = function (id) {
  var can = canById(id);
  if (!can) return;
  _detailCan = can;
  document.getElementById('cd-title').textContent = can.name;
  document.getElementById('cd-name').textContent = can.name;
  document.getElementById('cd-series').textContent = [can.series, can.variant].filter(Boolean).join(' · ') || '';
  document.getElementById('cd-limited').style.display = can.is_limited ? 'block' : 'none';
  var imgWrap = document.getElementById('cd-img-wrap');
  imgWrap.innerHTML = can.image_url
    ? '<img src="' + escapeHtml(can.image_url) + '" alt="" style="width:160px;height:180px;object-fit:contain;background:' + accentBg(can.accent_color) + '" onerror="this.parentElement.innerHTML=\'&#129371;\'">'
    : "<span style='font-size:60px;'>&#129371;</span>";
  var fields = [
    { label: 'Pays', val: can.country }, { label: 'Année', val: can.year },
    { label: 'Volume', val: can.volume }, { label: 'Langue', val: can.language },
    { label: 'Couleur capsule', val: can.cap_color }, { label: 'Couleur dominante', val: can.full_color },
  ];
  var mh = '';
  fields.forEach(function (f) {
    if (f.val) mh += '<div><span style="color:var(--mu);font-size:11px;text-transform:uppercase;letter-spacing:1px;">' + f.label + '</span><div style="font-weight:700;font-size:13px;margin-top:2px;">' + escapeHtml(f.val) + '</div></div>';
  });
  document.getElementById('cd-meta').innerHTML = mh || '<div style="color:var(--mu);font-size:12px;">Pas de métadonnées</div>';
  var descWrap = document.getElementById('cd-desc-wrap');
  if (can.description) { document.getElementById('cd-desc').textContent = can.description; descWrap.style.display = 'block'; }
  else descWrap.style.display = 'none';
  document.getElementById('cd-add-btn').style.display = inCollection(can.id) ? 'none' : 'inline-flex';
  document.getElementById('modal-can-detail').classList.add('on');
};
window.openAddModal = function () {
  if (!_detailCan) return;
  closeModal('can-detail');
  openAddColModal(_detailCan);
};

window.toggleCol = function (id) {
  if (inCollection(id)) {
    state.collection = state.collection.filter(function (x) { return x.can_id !== id; });
    save(); toast('Retirée ✓'); refreshCurrentTab();
    return;
  }
  var can = canById(id);
  if (can) openAddColModal(can);
};
function openAddColModal(can) {
  document.getElementById('ac-can-id').value = can.id;
  document.getElementById('ac-can-name').textContent = can.name;
  document.getElementById('ac-price').value = '';
  document.getElementById('ac-purchase-type').value = '';
  ['ac-btn-store', 'ac-btn-online', 'ac-btn-gift'].forEach(function (bid) {
    var b = document.getElementById(bid); if (b) { b.style.background = ''; b.style.color = ''; }
  });
  document.getElementById('modal-add-col').classList.add('on');
}
window.selectPurchase = function (type) {
  document.getElementById('ac-purchase-type').value = type;
  var map = { store: 'ac-btn-store', online: 'ac-btn-online', gift: 'ac-btn-gift' };
  Object.keys(map).forEach(function (k) {
    var b = document.getElementById(map[k]);
    if (b) { b.style.background = k === type ? 'var(--g)' : ''; b.style.color = k === type ? '#000' : ''; }
  });
};
window.confirmAddCol = function () {
  var canId = parseInt(document.getElementById('ac-can-id').value, 10);
  var price = document.getElementById('ac-price').value;
  var pt = document.getElementById('ac-purchase-type').value;
  if (inCollection(canId)) { toast('Déjà dans ta collection.', 'err'); return; }
  state.collection.push({
    can_id: canId,
    price: price ? Math.max(0, parseFloat(price) || 0) : null,
    purchase_type: pt || null,
    added_at: new Date().toISOString(),
  });
  if (save()) { closeModal('add-col'); toast('Ajoutée à ta collection ✓'); refreshCurrentTab(); }
};
window.toggleWl = function (id) {
  if (inWishlist(id)) {
    state.wishlist = state.wishlist.filter(function (x) { return x !== id; });
    save(); toast('Retirée de la wishlist');
  } else {
    state.wishlist.push(id);
    save(); toast('Ajoutée à la wishlist ♥');
  }
  refreshCurrentTab();
};
function refreshCurrentTab() {
  var on = document.querySelector('.sec.on');
  if (!on) return;
  var m = { 'sec-home': renderHome, 'sec-catalogue': renderCatalogue, 'sec-collection': renderCollection, 'sec-manage': renderManage, 'sec-settings': renderSettings };
  if (m[on.id]) m[on.id]();
}

// ════════════════════════════════════════════════════════
//  MA COLLECTION
// ════════════════════════════════════════════════════════
function renderCollection() {
  var items = state.collection.slice().sort(function (a, b) { return new Date(b.added_at) - new Date(a.added_at); });
  var value = collectionValue();
  var total = state.cans.length;
  var pct = total ? Math.round((items.length / total) * 100) : 0;
  document.getElementById('c-owned').textContent = items.length;
  document.getElementById('c-total').textContent = total;
  document.getElementById('c-pct').textContent = pct + '%';
  document.getElementById('c-value').textContent = value > 0 ? value.toFixed(2) + '€' : '—';
  var el = document.getElementById('col-ct');
  if (!items.length) { el.innerHTML = eHtml('&#129371;', 'COLLECTION VIDE', 'Va dans le catalogue pour ajouter tes premières canettes !'); return; }
  var html = '<div class="cgrid">';
  items.forEach(function (x) {
    var c = canById(x.can_id); if (!c) return;
    var shown = Object.assign({}, c, { price: x.price });
    var rmBtn = '<button class="cbtn rm" onclick="removeCol(' + c.id + ')">✕ Retirer</button>';
    html += '<div onclick="openCanDetailById(' + c.id + ')">' + canCardHtml(shown, rmBtn) + '</div>';
  });
  el.innerHTML = html + '</div>';
}
window.removeCol = function (canId) {
  state.collection = state.collection.filter(function (x) { return x.can_id !== canId; });
  save(); toast('Retirée'); renderCollection();
};

// ════════════════════════════════════════════════════════
//  GÉRER LE CATALOGUE
// ════════════════════════════════════════════════════════
function renderManage() {
  var q = (document.getElementById('manage-search').value || '').toLowerCase();
  var cans = state.cans.filter(function (c) {
    return !q || (c.name || '').toLowerCase().includes(q) || (c.series || '').toLowerCase().includes(q);
  });
  var el = document.getElementById('manage-ct');
  if (!cans.length) { el.innerHTML = eHtml('&#129371;', 'AUCUNE CANETTE', 'Ajoute ta première canette !'); return; }
  var rows = '';
  cans.forEach(function (c) {
    var img = c.image_url
      ? '<img src="' + escapeHtml(c.image_url) + '" alt="" style="width:40px;height:40px;object-fit:contain;border-radius:3px;" onerror="this.style.display=\'none\'">'
      : '<div style="width:40px;height:40px;background:var(--br);display:flex;align-items:center;justify-content:center;font-size:18px;">&#129371;</div>';
    var accentDot = c.accent_color ? '<div style="display:inline-block;width:12px;height:12px;border-radius:50%;background:' + escapeHtml(c.accent_color) + ';margin-left:6px;vertical-align:middle;border:1px solid rgba(255,255,255,.2);"></div>' : '';
    var lim = c.is_limited ? ' <span class="tbadge lim">Limitée</span>' : '';
    var ownedCount = inCollection(c.id) ? '<span class="tstat">✓</span>' : '<span style="color:var(--mu);">—</span>';
    rows += '<tr><td>' + img + '</td>'
      + '<td><div class="tname">' + escapeHtml(c.name) + accentDot + '</div></td>'
      + '<td style="color:var(--mu);font-size:12px;">' + escapeHtml(c.series || '—') + (c.variant ? ' · ' + escapeHtml(c.variant) : '') + lim + '</td>'
      + '<td>' + ownedCount + '</td>'
      + '<td><div class="tacts"><button class="tedit" onclick="openCanModal(' + c.id + ')">Éditer</button><button class="tdel" onclick="deleteCan(' + c.id + ')">Suppr.</button></div></td></tr>';
  });
  el.innerHTML = '<div class="atbl-w"><table class="atbl"><thead><tr><th>Photo</th><th>Nom</th><th>Série</th><th>Possédée</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

var _pendingImg = null;    // nouvelle image (dataURL) en attente dans la modale
var _existingImg = null;   // image actuelle de la canette (conservée si l'utilisateur n'y touche pas)
window.openCanModal = function (canId) {
  var c = canId ? canById(canId) : null;
  _pendingImg = null;
  _existingImg = (c && c.image_url) || null;
  document.getElementById('can-modal-title').textContent = c ? 'MODIFIER LA CANETTE' : 'AJOUTER UNE CANETTE';
  document.getElementById('cm-id').value = (c && c.id) || '';
  var map = { name: 'name', series: 'series', variant: 'variant', lang: 'language', cap: 'cap_color', fc: 'full_color', vol: 'volume', country: 'country', year: 'year', desc: 'description' };
  Object.keys(map).forEach(function (f) { document.getElementById('cm-' + f).value = (c && c[map[f]]) || ''; });
  // Le champ URL n'est pré-rempli que pour les URLs http (pas les dataURL uploadées)
  document.getElementById('cm-img-url').value = (c && c.image_url && /^https?:/i.test(c.image_url)) ? c.image_url : '';
  document.getElementById('cm-color').value = (c && c.accent_color) || '#39ff14';
  document.getElementById('cm-limited').checked = !!(c && c.is_limited);
  document.getElementById('cm-img-file').value = '';
  var prev = document.getElementById('img-prev'), lbl = document.getElementById('img-lbl');
  if (c && c.image_url) { prev.src = c.image_url; prev.style.display = 'block'; lbl.style.display = 'none'; }
  else { prev.style.display = 'none'; lbl.style.display = 'block'; }
  document.getElementById('modal-can').classList.add('on');
};
window.handleImgFile = function (input) {
  var file = input.files[0]; if (!file) return;
  if (file.size > 8 * 1024 * 1024) { toast('Image trop lourde (max 8 Mo).', 'err'); return; }
  resizeImage(file, 400, 0.8, function (dataUrl) {
    if (!dataUrl) { toast('Image illisible.', 'err'); return; }
    _pendingImg = dataUrl;
    var prev = document.getElementById('img-prev'), lbl = document.getElementById('img-lbl');
    prev.src = dataUrl; prev.style.display = 'block'; lbl.style.display = 'none';
    document.getElementById('cm-img-url').value = '';
  });
};
window.previewUrl = function (url) {
  var prev = document.getElementById('img-prev'), lbl = document.getElementById('img-lbl');
  _pendingImg = null;
  if (url) { _existingImg = null; prev.src = url; prev.style.display = 'block'; lbl.style.display = 'none'; document.getElementById('cm-img-file').value = ''; }
  else { _existingImg = null; prev.style.display = 'none'; lbl.style.display = 'block'; }
};
window.saveCan = function () {
  var name = document.getElementById('cm-name').value.trim();
  if (!name) { toast('Nom requis', 'err'); return; }
  var id = document.getElementById('cm-id').value;
  var imgUrl = document.getElementById('cm-img-url').value.trim();
  var fields = {
    name: name.slice(0, 120),
    series: document.getElementById('cm-series').value.trim().slice(0, 80) || null,
    variant: document.getElementById('cm-variant').value.trim().slice(0, 80) || null,
    language: document.getElementById('cm-lang').value.trim().slice(0, 30) || null,
    cap_color: document.getElementById('cm-cap').value.trim().slice(0, 40) || null,
    full_color: document.getElementById('cm-fc').value.trim().slice(0, 40) || null,
    volume: document.getElementById('cm-vol').value.trim().slice(0, 30) || null,
    country: document.getElementById('cm-country').value.trim().slice(0, 60) || null,
    year: document.getElementById('cm-year').value ? parseInt(document.getElementById('cm-year').value, 10) : null,
    description: document.getElementById('cm-desc').value.trim().slice(0, 2000) || null,
    is_limited: document.getElementById('cm-limited').checked ? 1 : 0,
    image_url: _pendingImg || imgUrl || _existingImg || null,
    accent_color: document.getElementById('cm-color').value || '#39ff14',
  };
  if (id) {
    var c = canById(parseInt(id, 10));
    if (c) Object.assign(c, fields);
    if (save()) { toast('Modifiée ✓'); closeModal('can'); renderManage(); }
  } else {
    fields.id = state.nextCanId++;
    fields.created_at = new Date().toISOString();
    state.cans.push(fields);
    if (save()) { toast('Ajoutée ✓'); closeModal('can'); renderManage(); }
    else state.cans.pop(); // rollback si stockage plein
  }
};
window.deleteCan = function (id) {
  var c = canById(id);
  if (!c) return;
  if (!confirm('Supprimer « ' + c.name + ' » ? Elle sera aussi retirée de ta collection et wishlist.')) return;
  state.cans = state.cans.filter(function (x) { return x.id !== id; });
  state.collection = state.collection.filter(function (x) { return x.can_id !== id; });
  state.wishlist = state.wishlist.filter(function (x) { return x !== id; });
  Object.keys(state.favorites).forEach(function (k) { if (state.favorites[k] === id) delete state.favorites[k]; });
  save(); toast('Supprimée ✓'); renderManage();
};

// ════════════════════════════════════════════════════════
//  PARAMÈTRES
// ════════════════════════════════════════════════════════
function letterAvatar(letter, size) {
  size = size || 40;
  return '<div style="width:' + size + 'px;height:' + size + 'px;background:var(--g);border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:\'Bebas Neue\',sans-serif;font-size:' + Math.round(size * .45) + 'px;color:#000;flex-shrink:0;">' + escapeHtml(letter) + '</div>';
}
function avatarHtml(size) {
  var p = state.profile;
  var s = 'width:' + size + 'px;height:' + size + 'px;flex-shrink:0;border-radius:50%;object-fit:cover;';
  if (p.avatar) return '<img src="' + p.avatar + '" alt="" style="' + s + '">';
  return letterAvatar((p.username || '?')[0].toUpperCase(), size);
}

function renderSettings() {
  document.getElementById('set-user').value = state.profile.username || '';
  document.getElementById('avatar-current').innerHTML = avatarHtml(64);
  applyThemeUI(state.profile.theme || 'dark');
  renderFavSlots();
  renderWishSlots();
}
window.saveProfile = function () {
  setErr('set-err', ''); setOk('set-ok', '');
  var u = document.getElementById('set-user').value.trim().slice(0, 24);
  if (u.length < 3) return setErr('set-err', 'Pseudo : 3 caractères minimum.');
  state.profile.username = u;
  save();
  document.getElementById('nav-name').textContent = u;
  setOk('set-ok', 'Profil mis à jour ✓');
};
window.saveAvatar = function () {
  var fi = document.getElementById('avatar-file');
  if (!fi || !fi.files || !fi.files[0]) { toast('Sélectionne une image', 'err'); return; }
  resizeImage(fi.files[0], 160, 0.8, function (dataUrl) {
    if (!dataUrl) { toast('Image illisible.', 'err'); return; }
    state.profile.avatar = dataUrl;
    if (save()) {
      document.getElementById('avatar-current').innerHTML = avatarHtml(64);
      fi.value = '';
      toast('Photo mise à jour ✓');
    } else state.profile.avatar = null;
  });
};

function renderFavSlots() {
  [1, 2, 3].forEach(function (pos) {
    var slot = document.getElementById('fav-' + pos);
    var fav = state.favorites[pos] ? canById(state.favorites[pos]) : null;
    if (fav) {
      slot.innerHTML = (fav.image_url ? '<img src="' + escapeHtml(fav.image_url) + '" alt=""/>' : "<span style='font-size:30px;'>&#129371;</span>")
        + '<div class="fav-ov"><span style="color:#fff;font-size:12px;">✕ Retirer</span></div><div class="fav-nm">' + escapeHtml(fav.name) + '</div>';
      slot.onclick = function () { delete state.favorites[pos]; save(); toast('Favori retiré'); renderFavSlots(); };
    } else {
      slot.innerHTML = '<span class="fav-num">' + pos + '</span><div class="fav-ov"><span style="color:var(--g);font-size:20px;">+</span></div>';
      slot.onclick = function () { openPicker('fav', pos); };
    }
  });
}
function renderWishSlots() {
  var cans = state.wishlist.map(canById).filter(Boolean).slice(0, 3);
  [0, 1, 2].forEach(function (i) {
    var slot = document.getElementById('wish-' + (i + 1));
    var c = cans[i];
    if (c) {
      slot.innerHTML = (c.image_url ? '<img src="' + escapeHtml(c.image_url) + '" alt=""/>' : "<span style='font-size:30px;'>&#129371;</span>")
        + '<div class="fav-ov"><span style="color:#fff;font-size:12px;">✕ Retirer</span></div><div class="fav-nm">' + escapeHtml(c.name) + '</div>';
      slot.onclick = function () { toggleWl(c.id); };
    } else {
      slot.innerHTML = '<span class="fav-num">' + (i + 1) + '</span><div class="fav-ov"><span style="color:#4af;font-size:20px;">+</span></div>';
      slot.onclick = function () { openPicker('wish', i + 1); };
    }
  });
}

// ── Picker ──
window.openPicker = function (type, pos) {
  pickerMode = { type: type, pos: pos };
  document.getElementById('picker-title').textContent = type === 'fav' ? 'FAVORI #' + pos : 'WISHLIST #' + pos;
  document.getElementById('picker-search').value = '';
  renderPickerGrid(state.cans);
  document.getElementById('modal-picker').classList.add('on');
};
window.filterPicker = function () {
  var q = document.getElementById('picker-search').value.toLowerCase();
  renderPickerGrid(state.cans.filter(function (c) { return (c.name || '').toLowerCase().includes(q); }));
};
function renderPickerGrid(cans) {
  document.getElementById('picker-grid').innerHTML = cans.slice(0, 60).map(function (c) {
    return '<div class="pk-item" onclick="pickCan(' + c.id + ')"><div class="pk-thumb">' + (c.image_url ? '<img src="' + escapeHtml(c.image_url) + '" alt="" onerror="this.parentElement.innerHTML=\'&#129371;\'">' : '&#129371;') + '</div><div class="pk-name">' + escapeHtml(c.name) + '</div></div>';
  }).join('');
}
window.pickCan = function (canId) {
  if (!pickerMode) return;
  if (pickerMode.type === 'fav') {
    state.favorites[pickerMode.pos] = canId;
    save(); toast('Favori mis à jour ✓'); renderFavSlots();
  } else {
    if (!inWishlist(canId)) { state.wishlist.push(canId); save(); toast('Ajoutée à la wishlist ♥'); renderWishSlots(); }
    else toast('Déjà dans la wishlist.', 'err');
  }
  closeModal('picker');
};

// ════════════════════════════════════════════════════════
//  EXPORT / IMPORT / RESET
// ════════════════════════════════════════════════════════
window.exportData = function () {
  var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'monstertracker-sauvegarde-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  toast('Sauvegarde exportée ✓');
};
window.importData = function (input) {
  var file = input.files && input.files[0];
  if (!file) return;
  var r = new FileReader();
  r.onload = function (e) {
    try {
      var parsed = JSON.parse(e.target.result);
      if (!parsed || !Array.isArray(parsed.cans) || !parsed.profile) throw new Error('format');
      if (!confirm('Importer cette sauvegarde ? Tes données actuelles seront remplacées.')) { input.value = ''; return; }
      parsed.version = parsed.version || 1;
      parsed.collection = parsed.collection || [];
      parsed.wishlist = parsed.wishlist || [];
      parsed.favorites = parsed.favorites || {};
      parsed.nextCanId = parsed.nextCanId || (Math.max.apply(null, parsed.cans.map(function (c) { return c.id; }).concat([0])) + 1);
      state = parsed;
      save();
      applyThemeUI(state.profile.theme || 'dark');
      document.getElementById('nav-name').textContent = state.profile.username || 'Collectionneur';
      toast('Sauvegarde importée ✓');
      refreshCurrentTab();
    } catch (err) {
      toast('Fichier invalide — ce n\'est pas une sauvegarde MonsterTracker.', 'err');
    }
    input.value = '';
  };
  r.readAsText(file);
};
window.confirmReset = function () {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  _resetCode = '';
  for (var i = 0; i < 6; i++) _resetCode += chars[Math.floor(Math.random() * chars.length)];
  document.getElementById('reset-code-display').textContent = _resetCode;
  document.getElementById('reset-code-inp').value = '';
  setErr('reset-err', '');
  document.getElementById('modal-reset').classList.add('on');
};
window.doReset = function () {
  var inp = document.getElementById('reset-code-inp').value.trim().toUpperCase();
  if (inp !== _resetCode) return setErr('reset-err', 'Code incorrect.');
  state = defaultState();
  save();
  closeModal('reset');
  applyThemeUI('dark');
  document.getElementById('nav-name').textContent = state.profile.username;
  toast('Données réinitialisées.');
  refreshCurrentTab();
};

// ════════════════════════════════════════════════════════
//  PWA
// ════════════════════════════════════════════════════════
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () { });
  });
}
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  _installPrompt = e;
  var btn = document.getElementById('pwa-install-btn');
  if (btn) btn.style.display = 'block';
});
window.addEventListener('appinstalled', function () {
  _installPrompt = null;
  var btn = document.getElementById('pwa-install-btn');
  if (btn) btn.style.display = 'none';
  toast('Application installée ✓');
});
window.doInstall = function () {
  if (_installPrompt) {
    _installPrompt.prompt();
    _installPrompt.userChoice.then(function (r) { if (r.outcome !== 'accepted') _installPrompt = null; });
  } else {
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    toast(isIOS
      ? 'Sur iPhone : Partager ⬆ puis « Sur l\'écran d\'accueil ».'
      : 'Utilise le menu de ton navigateur : « Installer l\'application ».', 'err');
  }
};

// ── Fermer les modales en cliquant le fond ──
document.querySelectorAll('.moverlay').forEach(function (ov) {
  ov.addEventListener('click', function (e) { if (e.target === ov) ov.classList.remove('on'); });
});

// ── Démarrage ──
state = loadState();
applyThemeUI(state.profile.theme || 'dark');
