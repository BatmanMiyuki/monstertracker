// ════════════════════════════════════════════════════════════
//  MonsterTracker v2 — Frontend (API REST + sessions cookie)
//  Sécurité : tout contenu dynamique est échappé (escapeHtml)
// ════════════════════════════════════════════════════════════
'use strict';

// ── État global ──
var me = null;                 // utilisateur connecté
var allCans = [];              // catalogue (côté utilisateur)
var pickerMode = null;         // {type:'fav'|'wish', pos}
var pickerCans = [];
var _detailCan = null;         // canette ouverte en détail
var _cfCat = '';               // catégorie du formulaire contact
var _admMsgs = [];             // messages admin (réception)
var _inboxFilter = 'all';
var _chatPoll = null;
var _badgePoll = null;
var _maintPoll = null;
var _currentChatFriend = null;
var _installPrompt = null;
var _friendSearchTimer = null;
var _pseudoCheckTimer = null;

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
function lHtml() { return '<div class="loading"><div class="spin"></div>Chargement...</div>'; }
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
function showMsg(id, text, ok) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('on', !!text);
  if (ok) { /* okmsg : rien de plus */ }
}
function setErr(id, text) { var el = document.getElementById(id); if (el) { el.textContent = text || ''; el.classList.toggle('on', !!text); } }
function setOk(id, text) { var el = document.getElementById(id); if (el) { el.textContent = text || ''; el.classList.toggle('on', !!text); } }

window.tpw = function (id, eye) {
  var i = document.getElementById(id);
  i.type = i.type === 'password' ? 'text' : 'password';
  eye.textContent = i.type === 'password' ? '👁' : '🙈';
};
window.closeModal = function (id) { document.getElementById('modal-' + id).classList.remove('on'); };

// ── Wrapper API ──
function api(method, url, body, isForm) {
  var opts = { method: method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined && body !== null) {
    if (isForm) { opts.body = body; }
    else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  }
  return fetch(url, opts).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (data) {
      if (r.status === 401 && me) { // session expirée
        me = null;
        go('login');
        throw new Error(data.error || 'Session expirée.');
      }
      if (r.status === 503 && data.maintenance) {
        showMaintOverlay();
        throw new Error('Maintenance en cours.');
      }
      if (!r.ok) throw new Error(data.error || ('Erreur ' + r.status));
      return data;
    });
  });
}
function uploadImage(file, maxMb) {
  if (file.size > maxMb * 1024 * 1024) return Promise.reject(new Error('Image trop lourde (max ' + maxMb + ' Mo).'));
  var fd = new FormData();
  fd.append('image', file);
  return api('POST', '/api/upload', fd, true).then(function (r) { return r.url; });
}

// ── Navigation ──
window.go = function (p) {
  document.querySelectorAll('.page').forEach(function (x) { x.classList.remove('active'); });
  document.getElementById('page-' + p).classList.add('active');
  window.scrollTo(0, 0);
};
window.goLandingApp = function () {
  // Le logo ramène à l'accueil de l'app (pas à la landing, comme l'original qui déconnectait visuellement)
  if (me) { goTab(me.role === 'admin' ? 'adm-cans' : 'home', document.getElementById(me.role === 'admin' ? 'tab-adm-cans' : 'tab-home')); }
  else go('landing');
};

window.goTab = function (s, btn) {
  document.querySelectorAll('.sec').forEach(function (x) { x.classList.remove('on'); });
  document.querySelectorAll('.ntab').forEach(function (x) { x.classList.remove('on'); });
  document.getElementById('sec-' + s).classList.add('on');
  if (btn) btn.classList.add('on');
  var m = {
    home: loadHome, catalogue: loadCatalogue, collection: loadCollection,
    friends: loadFriends, updates: loadUpdates, settings: loadSettings,
    'adm-cans': loadAdmCans, 'adm-updates': loadAdmUpdates, 'adm-users': loadAdmUsers,
    'adm-inbox': loadAdmInbox, 'adm-settings': loadAdmSettings,
  };
  if (m[s]) m[s]();
};

// ── Maintenance ──
function showMaintOverlay() { var ov = document.getElementById('maintenance-overlay'); if (ov) ov.style.display = 'flex'; }
function hideMaintOverlay() { var ov = document.getElementById('maintenance-overlay'); if (ov) ov.style.display = 'none'; }

// ── Thèmes ──
// Thèmes : noir (défaut) ou blanc — l'accent reste toujours vert
function setThemeLocal(t) {
  document.body.classList.toggle('light', t === 'light');
}
window.setTheme = function (t) {
  if (t !== 'light') t = 'dark';
  document.querySelectorAll('.theme-btn').forEach(function (b) { b.classList.remove('on'); });
  ['th-', 'adm-th-'].forEach(function (p) { var b = document.getElementById(p + t); if (b) b.classList.add('on'); });
  setThemeLocal(t);
  if (me) api('PATCH', '/api/me', { theme: t }).then(function (r) { me = r.user; }).catch(function () { });
};

// ── Avatar ──
function letterAvatar(letter, size) {
  size = size || 40;
  return '<div style="width:' + size + 'px;height:' + size + 'px;background:var(--g);border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:\'Bebas Neue\',sans-serif;font-size:' + Math.round(size * .45) + 'px;color:#000;flex-shrink:0;">' + escapeHtml(letter) + '</div>';
}
function avatarHtml(u, size) {
  size = size || 40;
  var s = 'width:' + size + 'px;height:' + size + 'px;flex-shrink:0;border-radius:50%;object-fit:cover;';
  if (u && u.avatar_url) return '<img src="' + escapeHtml(u.avatar_url) + '" alt="" style="' + s + '" data-mt-letter="' + escapeHtml(((u.username || '?')[0]).toUpperCase()) + '" data-mt-size="' + size + '" onerror="mtAvatarFail(this)">';
  return letterAvatar((u && u.username ? u.username[0] : '?').toUpperCase(), size);
}
// Remplacement propre d'un avatar cassé (aucun guillemet dans les attributs)
window.mtAvatarFail = function (img) {
  var w = document.createElement('div');
  w.innerHTML = letterAvatar(img.getAttribute('data-mt-letter') || '?', parseInt(img.getAttribute('data-mt-size'), 10) || 40);
  if (img.parentNode && w.firstChild) img.parentNode.replaceChild(w.firstChild, img);
};


// ════════════════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════════════════
window.doRegister = function () {
  setErr('rerr', '');
  var username = document.getElementById('ru').value.trim();
  var email = document.getElementById('re').value.trim();
  var pw = document.getElementById('rp').value;
  var pw2 = document.getElementById('rp2').value;
  if (!username) return setErr('rerr', 'Pseudo requis.');
  if (!email) return setErr('rerr', 'Email requis.');
  if (pw.length < 6) return setErr('rerr', 'Mot de passe : 6 caractères minimum.');
  if (pw !== pw2) return setErr('rerr', 'Les mots de passe ne correspondent pas.');
  var btn = document.getElementById('register-btn');
  btn.disabled = true;
  api('POST', '/api/auth/register', { username: username, email: email, password: pw })
    .then(function (r) { me = r.user; toast('Compte créé ✓'); enterApp(); })
    .catch(function (e) { setErr('rerr', e.message); toast(e.message, 'err'); })
    .finally(function () { btn.disabled = false; });
};

window.doLogin = function () {
  setErr('lerr', '');
  var email = document.getElementById('le').value.trim();
  var pw = document.getElementById('lp').value;
  if (!email || !pw) return setErr('lerr', 'Email et mot de passe requis.');
  var btn = document.getElementById('login-btn');
  btn.disabled = true;
  api('POST', '/api/auth/login', { email: email, password: pw })
    .then(function (r) { me = r.user; toast('Connecté ✓'); enterApp(); })
    .catch(function (e) { setErr('lerr', e.message); toast(e.message, 'err'); })
    .finally(function () { btn.disabled = false; });
};

window.doLogout = function () {
  stopChatPoll();
  api('POST', '/api/auth/logout').catch(function () { }).finally(function () {
    me = null;
    document.body.classList.remove('adminwall');
    stopPolling();
    hideMaintOverlay();
    go('landing');
    toast('Déconnecté.');
  });
};

function enterApp() {
  _setupAppUI();
  go('app');
  startPolling();
  if (me.role === 'admin') goTab('adm-cans', document.getElementById('tab-adm-cans'));
  else goTab('home', document.getElementById('tab-home'));
}

function _setupAppUI() {
  if (!me) return;
  var isAdmin = me.role === 'admin';
  document.body.classList.toggle('adminwall', isAdmin);
  document.getElementById('user-tabs').style.display = isAdmin ? 'none' : 'flex';
  document.getElementById('admin-tabs').style.display = isAdmin ? 'flex' : 'none';
  document.getElementById('nav-name').textContent = isAdmin ? 'Admin' : (me.username || '');
  var nnd = document.getElementById('nav-name-drop'); if (nnd) nnd.textContent = isAdmin ? 'Admin' : (me.username || '');
  document.getElementById('set-name').textContent = me.username || '';
  document.getElementById('set-user').value = me.username || '';
  document.getElementById('set-email').value = me.email || '';
  setThemeLocal(me.theme || 'dark');
  document.querySelectorAll('.theme-btn').forEach(function (b) { b.classList.remove('on'); });
  ['th-', 'adm-th-'].forEach(function (p) { var b = document.getElementById(p + (me.theme || 'dark')); if (b) b.classList.add('on'); });
}

// Vérification de la maintenance côté utilisateur connecté
function checkMaintenance() {
  if (!me || me.role === 'admin') return;
  fetch('/api/auth/me', { credentials: 'same-origin' }).then(function (r) { return r.json(); })
    .then(function (d) { if (d && d.maintenance) showMaintOverlay(); else hideMaintOverlay(); })
    .catch(function () { });
}

// ── Polling badges + maintenance ──
function startPolling() {
  stopPolling();
  updateBadges();
  _badgePoll = setInterval(updateBadges, 20000);
  _maintPoll = setInterval(checkMaintenance, 30000);
}
function stopPolling() {
  if (_badgePoll) { clearInterval(_badgePoll); _badgePoll = null; }
  if (_maintPoll) { clearInterval(_maintPoll); _maintPoll = null; }
}
function updateBadges() {
  if (!me) return;
  api('GET', '/api/badges').then(function (b) {
    setBadge('friends-badge', b.friendRequests, '#ff9600');
    setBadge('notif-badge', b.friendRequests + b.messageReplies);
    setBadge('chat-badge', b.unreadChats);
    setBadge('inbox-badge', b.inboxPending);
  }).catch(function () { });
}
function setBadge(id, n, bg) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = n;
  if (bg) el.style.background = bg;
  el.style.display = n > 0 ? 'inline-flex' : 'none';
}

// ════════════════════════════════════════════════════════
//  CHARTS (SVG, comme l'original)
// ════════════════════════════════════════════════════════
function drawChart(data, cid) {
  var ct = document.getElementById(cid); if (!ct) return;
  if (!data || !data.length) { ct.innerHTML = '<p style="color:var(--mu);font-size:12px;">Pas encore de données.</p>'; return; }
  var maxV = Math.max.apply(null, data.map(function (d) { return parseInt(d.count, 10); }));
  var W = 500, H = 110, bw = Math.max(12, Math.floor((W - 20) / data.length) - 6), gap = 6, pad = 10, bars = '';
  data.forEach(function (d, i) {
    var cnt = parseInt(d.count, 10);
    var bh = Math.max(2, Math.floor((cnt / maxV) * (H - 28)));
    var x = pad + i * (bw + gap), y = H - bh - 18;
    var mo = d.month ? d.month.substring(5) : '';
    bars += '<rect fill="rgba(var(--g-r),var(--g-g),var(--g-b),.25)" x="' + x + '" y="' + y + '" width="' + bw + '" height="' + bh + '" rx="2"/>';
    if (cnt > 0) bars += '<text font-family="Bebas Neue,sans-serif" font-size="11" style="fill:var(--g)" text-anchor="middle" x="' + (x + bw / 2) + '" y="' + (y - 3) + '">' + cnt + '</text>';
    bars += '<text font-family="Barlow Condensed,sans-serif" font-size="9" style="fill:var(--mu)" text-anchor="middle" x="' + (x + bw / 2) + '" y="' + (H - 4) + '">' + escapeHtml(mo) + '</text>';
  });
  ct.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-height:115px;overflow:visible;">' + bars + '</svg>';
}
function drawPieChart(data, cid) {
  var el = document.getElementById(cid); if (!el) return;
  if (!data || !data.length) { el.innerHTML = '<div style="text-align:center;color:var(--mu);font-size:12px;padding:20px;">Pas de données</div>'; return; }
  var themeG = getComputedStyle(document.documentElement).getPropertyValue('--g').trim() || '#39ff14';
  var colors = [themeG, '#00cfff', '#ff9600', '#ff3535', '#ffc800', '#bf5fff', '#00e5a0', '#ff6ec7', '#7fff6e', '#5599ff'];
  var max = Math.max.apply(null, data.map(function (d) { return parseInt(d.count, 10); }));
  var html = '<div style="display:flex;flex-direction:column;gap:6px;">';
  data.slice(0, 8).forEach(function (d, i) {
    var pct = max > 0 ? Math.round((parseInt(d.count, 10) / max) * 100) : 0;
    html += '<div style="display:flex;align-items:center;gap:8px;"><div style="width:80px;font-size:11px;color:var(--tx);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(d.label) + '</div><div style="flex:1;height:16px;background:var(--br);"><div style="height:100%;width:' + pct + '%;background:' + colors[i % colors.length] + ';transition:width .5s;"></div></div><div style="width:24px;font-size:11px;color:var(--mu);text-align:right;">' + escapeHtml(d.count) + '</div></div>';
  });
  el.innerHTML = html + '</div>';
}

// ════════════════════════════════════════════════════════
//  CARTE CANETTE
// ════════════════════════════════════════════════════════
const MT_BAKED = /monster-(apex|original|original-blackops7|ultra-blackops7)\.png/;
function accentBg(color) {
  color = color || getComputedStyle(document.documentElement).getPropertyValue('--g').trim() || '#39ff14';
  var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
  if (!m) return 'var(--bk)';
  var r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
  return 'radial-gradient(ellipse at 50% 65%, rgba(' + r + ',' + g + ',' + b + ',0.16) 0%, rgba(8,8,8,1) 68%)';
}
function canCardHtml(can, btnsHtml) {
  var accent = can.is_limited ? '#ff9600' : (can.accent_color || (getComputedStyle(document.documentElement).getPropertyValue('--g').trim() || '#39ff14'));
  var img = can.image_url
    ? '<img src="' + escapeHtml(can.image_url) + '" alt="' + escapeHtml(can.name) + '" onerror="this.style.display=\'none\'">'
    : '<span style="font-size:52px;">&#129371;</span>';
  var lim = can.is_limited ? '<div class="lim-tag">Limitée</div>' : '';
  var owned = can.in_collection ? '<div class="owned-ov"><div class="owned-tag">✓ Possédée</div></div>' : '';
  var price = can.price ? '<div class="cprice">' + fmtPrice(can.price) + '</div>' : '';
  var sub = [can.series, can.variant, can.country, can.year].filter(Boolean).map(escapeHtml).join(' · ') || '—';
  var cardBorder = can.is_limited ? 'border:2px solid #ff9600;border-bottom:3px solid #ff9600;' : 'border-bottom:3px solid ' + accent + ';';
  return '<div class="ccard" style="' + cardBorder + '">'
    + '<div class="cthumb' + (can.image_url ? ' has-img' + (MT_BAKED.test(can.image_url) ? ' baked' : '') : '') + '" style="' + (can.image_url ? '' : 'background:' + accentBg(accent)) + '">' + img + lim + owned + '</div>'
    + '<div class="cbody">'
    + '<div class="cname">' + escapeHtml(can.name) + '</div>'
    + '<div class="csub">' + sub + '</div>'
    + price
    + (btnsHtml ? '<div class="cbtns">' + btnsHtml + '</div>' : '')
    + '</div></div>';
}

// ════════════════════════════════════════════════════════
//  ACCUEIL
// ════════════════════════════════════════════════════════
window.loadHome = function () {
  ['h-owned', 'h-total', 'h-value', 'h-friends'].forEach(function (id) { var el = document.getElementById(id); if (el) el.textContent = '...'; });
  ['chart-series', 'chart-lang', 'h-recent', 'h-friends-act'].forEach(function (id) { var el = document.getElementById(id); if (el) el.innerHTML = lHtml(); });
  api('GET', '/api/dashboard').then(function (d) {
    document.getElementById('h-owned').textContent = d.owned;
    document.getElementById('h-total').textContent = d.totalCans;
    document.getElementById('h-value').textContent = d.value > 0 ? d.value.toFixed(2) + '€' : '—';
    document.getElementById('h-friends').textContent = d.friends;
    document.getElementById('h-pct').textContent = d.pct + '%';
    document.getElementById('h-prog').style.width = d.pct + '%';
    drawPieChart(d.bySeries, 'chart-series');
    drawPieChart(d.byLang, 'chart-lang');
    var elRec = document.getElementById('h-recent');
    if (d.recent.length) {
      var rhtml = '<div class="rec-list">';
      d.recent.forEach(function (r) {
        var thumb = r.image_url ? '<img src="' + escapeHtml(r.image_url) + '" alt="" onerror="this.style.display=\'none\'"/>' : '&#129371;';
        rhtml += '<div class="rec-item"><div class="rec-thumb">' + thumb + '</div><div><div class="rec-name">' + escapeHtml(r.name) + '</div><div class="rec-date">' + fmtDate(r.added_at) + '</div></div><div class="rec-ago">' + timeAgo(r.added_at) + '</div></div>';
      });
      elRec.innerHTML = rhtml + '</div>';
    } else elRec.innerHTML = eHtml('&#129371;', 'Aucune canette ajoutée', 'Commence à ajouter des canettes à ta collection !');
    var elFr = document.getElementById('h-friends-act');
    if (d.friendsList.length) {
      var fhtml = '<div class="fr-list">';
      d.friendsList.forEach(function (f) {
        fhtml += '<div class="fr-card"><div class="fr-av">' + escapeHtml((f.username || '?')[0].toUpperCase()) + '</div><div><div class="fr-name">' + escapeHtml(f.username) + '</div></div></div>';
      });
      elFr.innerHTML = fhtml + '</div>';
    } else elFr.innerHTML = eHtml('👥', 'Pas encore d\'amis', 'Ajoute des amis depuis l\'onglet Amis !');
  }).catch(function (e) { console.error('loadHome', e); });
};

// ════════════════════════════════════════════════════════
//  CATALOGUE
// ════════════════════════════════════════════════════════
window.loadCatalogue = function () {
  document.getElementById('cat-ct').innerHTML = lHtml();
  api('GET', '/api/cans').then(function (d) {
    allCans = d.cans;
    renderSerieChips();
    renderCat(allCans);
  }).catch(function (e) { document.getElementById('cat-ct').innerHTML = eHtml('⚠️', 'ERREUR', e.message); });
};

var _catSerie = 'Toutes';
window.setCatSerie = function (serie) { _catSerie = serie; window.filterCans(); };
window.filterCans = function () {
  var q = (document.getElementById('search').value || '').toLowerCase();
  var list = allCans.filter(function (c) {
    return (c.name || '').toLowerCase().includes(q) || (c.series || '').toLowerCase().includes(q) || (c.variant || '').toLowerCase().includes(q);
  });
  if (_catSerie !== 'Toutes') list = list.filter(function (c) { return (c.series || 'Autres') === _catSerie; });
  renderCat(list);
};
function renderSerieChips() {
  var el = document.getElementById('cat-series'); if (!el) return;
  var map = {};
  allCans.forEach(function (c) { var sr = c.series || 'Autres'; map[sr] = (map[sr] || 0) + 1; });
  var html = '<button class="schip' + (_catSerie === 'Toutes' ? ' on' : '') + '" onclick="setCatSerie(\'Toutes\')">Toutes (' + allCans.length + ')</button>';
  Object.keys(map).sort(function (a, b) { return a.localeCompare(b, 'fr'); }).forEach(function (sr) {
    html += '<button class="schip' + (_catSerie === sr ? ' on' : '') + '" onclick="setCatSerie(\'' + sr.replace(/'/g, "\\'") + '\')">' + escapeHtml(sr) + ' (' + map[sr] + ')</button>';
  });
  el.innerHTML = html;
}

function renderCat(cans) {
  var el = document.getElementById('cat-ct');
  if (!cans.length) { el.innerHTML = eHtml('&#129371;', 'AUCUNE CANETTE TROUVÉE', 'Aucun résultat.'); return; }
  var html = '<div class="cgrid">';
  cans.forEach(function (can) {
    var colBtn = '<button class="cbtn ' + (can.in_collection ? 'on' : '') + '" onclick="event.stopPropagation();toggleCol(' + can.id + ',' + can.in_collection + ')">' + (can.in_collection ? '✓ Possédée' : '+ Collection') + '</button>';
    var wlBtn = '<button class="cbtn wl ' + (can.in_wishlist ? 'on' : '') + '" onclick="event.stopPropagation();toggleWl(' + can.id + ',' + can.in_wishlist + ')">' + (can.in_wishlist ? '♥' : '♡') + ' Wish</button>';
    html += '<div onclick="openCanDetailById(' + can.id + ')">' + canCardHtml(can, colBtn + wlBtn) + '</div>';
  });
  el.innerHTML = html + '</div>';
}

window.openCanDetailById = function (id) { openCanDetail(allCans.find(function (x) { return x.id === id; })); };

window.toggleCol = function (id, owned) {
  if (owned) {
    api('DELETE', '/api/collection/' + id).then(function () { toast('Retirée ✓'); loadCatalogue(); }).catch(function (e) { toast(e.message, 'err'); });
    return;
  }
  var can = allCans.find(function (x) { return x.id === id; });
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

window.toggleWl = function (id, inWl) {
  var p = inWl ? api('DELETE', '/api/wishlist/' + id) : api('POST', '/api/wishlist', { can_id: id });
  p.then(function () { toast(inWl ? 'Retirée de la wishlist' : 'Ajoutée à la wishlist ♥'); loadCatalogue(); }).catch(function (e) { toast(e.message, 'err'); });
};

window.selectPurchase = function (type) {
  document.getElementById('ac-purchase-type').value = type;
  var map = { store: 'ac-btn-store', online: 'ac-btn-online', gift: 'ac-btn-gift' };
  Object.keys(map).forEach(function (k) {
    var b = document.getElementById(map[k]);
    if (b) { b.style.background = k === type ? 'var(--g)' : ''; b.style.color = k === type ? '#000' : ''; }
  });
};

window.confirmAddCol = function () {
  var canId = document.getElementById('ac-can-id').value;
  var price = document.getElementById('ac-price').value;
  var pt = document.getElementById('ac-purchase-type').value;
  api('POST', '/api/collection', { can_id: parseInt(canId, 10), price: price || null, purchase_type: pt || null })
    .then(function () { closeModal('add-col'); toast('Ajoutée à ta collection ✓'); loadCatalogue(); })
    .catch(function (e) { toast(e.message, 'err'); });
};

// ── Détail canette ──
function openCanDetail(can) {
  if (!can) return;
  _detailCan = can;
  document.getElementById('cd-title').textContent = can.name;
  document.getElementById('cd-name').textContent = can.name;
  document.getElementById('cd-series').textContent = [can.series, can.variant].filter(Boolean).join(' · ') || '';
  document.getElementById('cd-limited').style.display = can.is_limited ? 'block' : 'none';
  var imgWrap = document.getElementById('cd-img-wrap');
  imgWrap.style.backgroundImage = can.image_url ? 'radial-gradient(ellipse 42% 12% at 50% 84%,rgba(255,255,255,.30),rgba(255,255,255,.12) 55%,transparent 78%),radial-gradient(ellipse 75% 30% at 50% 93%,rgba(255,255,255,.10),transparent 72%)' : '';
  imgWrap.innerHTML = can.image_url
    ? '<img src="' + escapeHtml(can.image_url) + '" alt="" class="' + (MT_BAKED.test(can.image_url) ? '' : 'cut-refl') + '" style="width:160px;height:180px;object-fit:contain;background:transparent;" onerror="this.parentElement.innerHTML=\'&#129371;\'">'
    : "<span style='font-size:60px;'>&#129371;</span>";
  var meta = document.getElementById('cd-meta');
  var fields = [
    { label: 'Pays', val: can.country }, { label: 'Année', val: can.year },
    { label: 'Volume', val: can.volume }, { label: 'Langue', val: can.language },
    { label: 'Couleur capsule', val: can.cap_color }, { label: 'Couleur dominante', val: can.full_color },
  ];
  var mh = '';
  fields.forEach(function (f) {
    if (f.val) mh += '<div><span style="color:var(--mu);font-size:11px;text-transform:uppercase;letter-spacing:1px;">' + f.label + '</span><div style="font-weight:700;font-size:13px;margin-top:2px;">' + escapeHtml(f.val) + '</div></div>';
  });
  meta.innerHTML = mh || '<div style="color:var(--mu);font-size:12px;">Pas de métadonnées</div>';
  var descWrap = document.getElementById('cd-desc-wrap'), desc = document.getElementById('cd-desc');
  if (can.description) { desc.textContent = can.description; descWrap.style.display = 'block'; }
  else descWrap.style.display = 'none';
  document.getElementById('cd-add-btn').style.display = can.in_collection ? 'none' : 'inline-flex';
  document.getElementById('modal-can-detail').classList.add('on');
}
window.openAddModal = function () {
  if (!_detailCan) return;
  closeModal('can-detail');
  openAddColModal(_detailCan);
};

// ════════════════════════════════════════════════════════
//  MA COLLECTION
// ════════════════════════════════════════════════════════
window.loadCollection = function () {
  document.getElementById('col-ct').innerHTML = lHtml();
  api('GET', '/api/collection').then(function (d) {
    var items = d.items;
    var totalValue = items.reduce(function (s, c) { return s + (parseFloat(c.price) || 0); }, 0);
    var pct = d.totalCans > 0 ? Math.round((items.length / d.totalCans) * 100) : 0;
    document.getElementById('c-owned').textContent = items.length;
    document.getElementById('c-total').textContent = d.totalCans;
    document.getElementById('c-pct').textContent = pct + '%';
    document.getElementById('c-value').textContent = totalValue > 0 ? totalValue.toFixed(2) + '€' : '—';
    if (!items.length) {
      document.getElementById('col-ct').innerHTML = eHtml('&#129371;', 'COLLECTION VIDE', 'Va dans le catalogue pour ajouter tes premières canettes !');
      return;
    }
    var html = '<div class="cgrid">';
    items.forEach(function (c) {
      var rmBtn = '<button class="cbtn rm" onclick="removeCol(' + c.can_id + ')">✕ Retirer</button>';
      html += '<div>' + canCardHtml(c, rmBtn) + '</div>';
    });
    document.getElementById('col-ct').innerHTML = html + '</div>';
  }).catch(function (e) { document.getElementById('col-ct').innerHTML = eHtml('⚠️', 'ERREUR', e.message); });
};
window.removeCol = function (canId) {
  api('DELETE', '/api/collection/' + canId).then(function () { toast('Retirée'); loadCollection(); }).catch(function (e) { toast(e.message, 'err'); });
};

// ════════════════════════════════════════════════════════
//  AMIS
// ════════════════════════════════════════════════════════
window.loadFriends = function () {
  document.getElementById('friends-ct').innerHTML = lHtml();
  setErr('friend-err', ''); setOk('friend-ok', '');
  api('GET', '/api/friends').then(function (d) {
    var html = '';
    if (d.requests.length) {
      html += '<div style="margin-bottom:20px;"><div style="font-family:\'Barlow Condensed\',sans-serif;font-size:10px;font-weight:700;letter-spacing:3px;color:#ff9600;margin-bottom:10px;">DEMANDES REÇUES</div>';
      d.requests.forEach(function (r) {
        html += '<div style="background:rgba(255,150,0,.07);border:1px solid rgba(255,150,0,.25);padding:14px;margin-bottom:8px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">'
          + avatarHtml({ username: r.username, avatar_url: r.avatar_url }, 36)
          + '<div style="flex:1;min-width:120px;"><div style="font-weight:700;">' + escapeHtml(r.username) + '</div><div style="font-size:12px;color:var(--mu);">veut être ton ami</div></div>'
          + '<button class="btn-add" onclick="acceptRequest(' + r.id + ')" style="padding:7px 14px;font-size:12px;">✓ Accepter</button>'
          + '<button class="btn-ghost" onclick="rejectRequest(' + r.id + ')" style="padding:7px 14px;font-size:12px;">✕</button></div>';
      });
      html += '</div>';
    }
    if (!d.friends.length && !d.requests.length) {
      html += eHtml('👥', 'Pas encore d\'amis', 'Recherche des amis par pseudo ci-dessus !');
    } else if (d.friends.length) {
      html += '<div style="font-family:\'Barlow Condensed\',sans-serif;font-size:10px;font-weight:700;letter-spacing:3px;color:var(--mu);margin-bottom:10px;">MES AMIS (' + d.friends.length + ')</div><div style="display:flex;flex-direction:column;gap:8px;">';
      d.friends.forEach(function (f) {
        var dot = f.unread_count > 0 ? '<span style="background:var(--g);color:#000;border-radius:50%;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;margin-left:4px;">' + f.unread_count + '</span>' : '';
        html += '<div style="display:flex;align-items:center;gap:12px;background:var(--c1);border:1px solid var(--br);padding:14px;flex-wrap:wrap;">'
          + avatarHtml(f, 40)
          + '<div style="flex:1;min-width:120px;"><div class="fr-name">' + escapeHtml(f.username) + dot + '</div><div class="fr-sub">' + f.collection_count + ' canette' + (f.collection_count !== 1 ? 's' : '') + '</div></div>'
          + '<button class="btn-ghost" onclick="openFriendView(' + f.id + ')" style="padding:7px 14px;font-size:12px;">👁 Voir</button>'
          + '<button class="btn-ghost" onclick="openChat(' + f.id + ')" style="padding:7px 14px;font-size:12px;">💬</button>'
          + '<button class="tdel" onclick="removeFriend(' + f.id + ')" style="padding:7px 12px;font-size:12px;">✕</button></div>';
      });
      html += '</div>';
    }
    document.getElementById('friends-ct').innerHTML = html;
  }).catch(function (e) { document.getElementById('friends-ct').innerHTML = eHtml('⚠️', 'ERREUR', e.message); });
};

window.friendSearch = function () {
  clearTimeout(_friendSearchTimer);
  _friendSearchTimer = setTimeout(doFriendSearch, 400);
};
function doFriendSearch() {
  var q = document.getElementById('friend-input').value.trim();
  setErr('friend-err', '');
  var ok = document.getElementById('friend-ok');
  ok.classList.remove('on'); ok.innerHTML = '';
  if (!q) return;
  api('GET', '/api/users/search?q=' + encodeURIComponent(q)).then(function (d) {
    if (!d.users.length) { setErr('friend-err', 'Aucun utilisateur trouvé avec ce pseudo.'); return; }
    var html = '';
    d.users.forEach(function (u) {
      html += '<div style="background:var(--c1);border:1px solid var(--g);padding:14px;display:flex;align-items:center;gap:12px;margin-top:8px;flex-wrap:wrap;">'
        + avatarHtml(u, 40)
        + '<div style="flex:1;min-width:120px;"><div style="font-weight:700;">' + escapeHtml(u.username) + '</div><div style="font-size:12px;color:var(--mu);">' + u.collection_count + ' canette' + (u.collection_count !== 1 ? 's' : '') + '</div></div>';
      if (u.isFriend) html += '<span style="color:var(--g);font-size:12px;font-weight:700;">✓ Déjà ami</span>';
      else if (u.pending) html += '<span style="color:#ff9600;font-size:12px;font-weight:700;">Demande envoyée</span>';
      else html += '<button class="btn-add" onclick="sendFriendRequest(\'' + escapeHtml(u.username) + '\')" style="padding:8px 16px;">+ Envoyer une demande</button>';
      html += '</div>';
    });
    ok.innerHTML = html; ok.classList.add('on');
  }).catch(function (e) { setErr('friend-err', e.message); });
}

window.sendFriendRequest = function (username) {
  api('POST', '/api/friend-requests', { username: username }).then(function (r) {
    toast(r.autoAccepted ? 'Vous êtes maintenant amis ✓' : 'Demande envoyée ✓');
    document.getElementById('friend-input').value = '';
    document.getElementById('friend-ok').classList.remove('on');
    loadFriends(); updateBadges();
  }).catch(function (e) { toast(e.message, 'err'); });
};
window.acceptRequest = function (id) {
  api('POST', '/api/friend-requests/' + id + '/accept').then(function () { toast('Ami ajouté ✓'); loadFriends(); updateBadges(); }).catch(function (e) { toast(e.message, 'err'); });
};
window.rejectRequest = function (id) {
  api('POST', '/api/friend-requests/' + id + '/reject').then(function () { toast('Demande refusée'); loadFriends(); updateBadges(); }).catch(function (e) { toast(e.message, 'err'); });
};
window.removeFriend = function (fid) {
  if (!confirm('Retirer cet ami ? La conversation sera aussi supprimée.')) return;
  api('DELETE', '/api/friends/' + fid).then(function () { toast('Ami retiré'); loadFriends(); updateBadges(); }).catch(function (e) { toast(e.message, 'err'); });
};

// ── Vue collection d'un ami ──
window.openFriendView = function (fid) {
  document.querySelectorAll('.sec').forEach(function (x) { x.classList.remove('on'); });
  document.querySelectorAll('.ntab').forEach(function (x) { x.classList.remove('on'); });
  document.getElementById('sec-friend-view').classList.add('on');
  document.getElementById('friend-view-ct').innerHTML = lHtml();
  api('GET', '/api/users/' + fid + '/collection').then(function (d) {
    document.getElementById('friend-view-name').textContent = d.username.toUpperCase() + ' — COLLECTION';
    if (!d.items.length) { document.getElementById('friend-view-ct').innerHTML = eHtml('&#129371;', 'Collection vide', 'Ton ami n\'a pas encore de canettes !'); return; }
    var html = '<div class="cgrid">';
    d.items.forEach(function (c) { html += '<div>' + canCardHtml(c, '') + '</div>'; });
    document.getElementById('friend-view-ct').innerHTML = html + '</div>';
  }).catch(function (e) { document.getElementById('friend-view-ct').innerHTML = eHtml('⚠️', 'ERREUR', e.message); });
};
window.backFromFriendView = function () {
  stopChatPoll(); _currentChatFriend = null;
  goTab('friends', document.getElementById('tab-friends'));
};

// ════════════════════════════════════════════════════════
//  CHAT (rendu DOM sécurisé — anti XSS)
// ════════════════════════════════════════════════════════
window.openChat = function (fid) {
  var btns = document.querySelectorAll('#friends-ct .fr-name');
  var name = 'Ami';
  api('GET', '/api/friends').then(function (d) {
    var f = d.friends.find(function (x) { return x.id === fid; });
    name = f ? f.username : 'Ami';
    _currentChatFriend = { id: fid, name: name };
    document.querySelectorAll('.sec').forEach(function (x) { x.classList.remove('on'); });
    document.querySelectorAll('.ntab').forEach(function (x) { x.classList.remove('on'); });
    document.getElementById('sec-chat').classList.add('on');
    document.getElementById('chat-title').textContent = '💬 ' + name;
    document.getElementById('chat-msg-inp').value = '';
    loadChatMessages();
    startChatPoll();
    updateBadges();
  });
};
function loadChatMessages() {
  if (!_currentChatFriend) return;
  api('GET', '/api/chats/' + _currentChatFriend.id).then(function (d) {
    var ct = document.getElementById('chat-messages');
    if (!ct) return;
    ct.innerHTML = '';
    if (!d.messages.length) {
      ct.innerHTML = '<div style="text-align:center;color:var(--mu);padding:40px;font-size:13px;">Envoie ton premier message !</div>';
      return;
    }
    d.messages.forEach(function (m) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:' + (m.mine ? 'flex-end' : 'flex-start') + ';margin-bottom:10px;';
      if (!m.mine && m.sender_name) {
        var who = document.createElement('div');
        who.style.cssText = 'font-size:11px;color:var(--mu);margin-bottom:3px;';
        who.textContent = m.sender_name;
        wrap.appendChild(who);
      }
      var bub = document.createElement('div');
      bub.style.cssText = 'max-width:85%;padding:10px 14px;font-size:13px;border-radius:4px;word-break:break-word;background:' + (m.mine ? 'var(--g)' : 'var(--c1)') + ';color:' + (m.mine ? '#000' : 'var(--tx)') + ';';
      bub.textContent = m.content; // textContent = anti XSS
      wrap.appendChild(bub);
      var ts = document.createElement('div');
      ts.style.cssText = 'font-size:10px;color:var(--mu);margin-top:3px;';
      ts.textContent = new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      wrap.appendChild(ts);
      ct.appendChild(wrap);
    });
    ct.scrollTop = ct.scrollHeight;
    updateBadges();
  }).catch(function (e) { console.error('chat', e); });
}
window.sendChatMsg = function () {
  var inp = document.getElementById('chat-msg-inp');
  var content = inp.value.trim();
  if (!content || !_currentChatFriend) return;
  inp.value = '';
  api('POST', '/api/chats/' + _currentChatFriend.id, { content: content })
    .then(loadChatMessages)
    .catch(function (e) { toast(e.message, 'err'); });
};
function startChatPoll() { stopChatPoll(); _chatPoll = setInterval(loadChatMessages, 3000); }
function stopChatPoll() { if (_chatPoll) { clearInterval(_chatPoll); _chatPoll = null; } }

// ════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ════════════════════════════════════════════════════════
window.loadUpdates = function () {
  document.getElementById('updates-ct').innerHTML = lHtml();
  api('GET', '/api/updates').then(function (d) {
    var html = '';
    if (d.replies.length) {
      html += '<div style="margin-bottom:22px;"><div style="font-family:\'Barlow Condensed\',sans-serif;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#4af;margin-bottom:12px;">RÉPONSES À TES MESSAGES</div>';
      d.replies.forEach(function (r) {
        html += '<div style="background:rgba(68,170,255,.07);border:1px solid rgba(68,170,255,.2);padding:18px;margin-bottom:10px;">'
          + '<div style="font-size:11px;color:#4af;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">' + escapeHtml(r.category) + '</div>'
          + '<div style="font-size:13px;color:#999;margin-bottom:12px;padding:12px;background:rgba(0,0,0,.3);border-left:3px solid #333;white-space:pre-wrap;word-break:break-word;">' + escapeHtml(r.content) + '</div>';
        if (r.attachment_url) html += '<div style="margin-bottom:12px;"><img src="' + escapeHtml(r.attachment_url) + '" alt="" style="max-width:100%;max-height:300px;object-fit:contain;border:1px solid var(--br);cursor:pointer;" onclick="window.open(this.src)"/></div>';
        html += '<div style="font-size:13px;color:#ddd;white-space:pre-wrap;word-break:break-word;">' + escapeHtml(r.reply) + '</div>'
          + '<div style="font-size:11px;color:var(--mu);margin-top:10px;">Répondu le ' + fmtDate(r.replied_at) + '</div></div>';
      });
      html += '</div>';
    }
    if (d.updates.length) {
      html += '<div style="font-family:\'Barlow Condensed\',sans-serif;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--mu);margin-bottom:12px;">ANNONCES</div>';
      d.updates.forEach(function (u) {
        html += '<div class="upd-card" style="margin-bottom:10px;"><div class="upd-title">' + escapeHtml(u.title) + '</div><div class="upd-content">' + escapeHtml(u.content) + '</div><div class="upd-meta">' + fmtDate(u.created_at) + '</div></div>';
      });
    }
    if (!html) html = eHtml('🔔', 'AUCUNE NOTIFICATION', 'Rien de neuf pour le moment.');
    document.getElementById('updates-ct').innerHTML = html;
  }).catch(function (e) { document.getElementById('updates-ct').innerHTML = eHtml('⚠️', 'ERREUR', e.message); });
};

// ════════════════════════════════════════════════════════
//  PARAMÈTRES
// ════════════════════════════════════════════════════════
window.loadSettings = function () {
  document.getElementById('set-name').textContent = (me && me.username) || '';
  document.getElementById('set-user').value = (me && me.username) || '';
  document.getElementById('set-email').value = (me && me.email) || '';
  var avEl = document.getElementById('avatar-current');
  if (avEl) avEl.innerHTML = avatarHtml(me, 64);
  var ap = document.getElementById('avatar-preview');
  if (ap) ap.style.display = 'none';
  Promise.all([api('GET', '/api/favorites'), api('GET', '/api/wishlist')]).then(function (res) {
    renderFavSlots(res[0].favorites);
    renderWishSlots(res[1].items);
  }).catch(function (e) { console.error('loadSettings', e); });
};
function renderFavSlots(favs) {
  [1, 2, 3].forEach(function (pos) {
    var slot = document.getElementById('fav-' + pos);
    var fav = favs.find(function (f) { return f.position === pos; });
    if (fav) {
      slot.innerHTML = (fav.image_url ? '<img src="' + escapeHtml(fav.image_url) + '" alt=""/>' : "<span style='font-size:30px;'>&#129371;</span>")
        + '<div class="fav-ov"><span style="color:#fff;font-size:12px;">✕ Retirer</span></div><div class="fav-nm">' + escapeHtml(fav.name) + '</div>';
      slot.onclick = function () { removeFav(pos); };
    } else {
      slot.innerHTML = '<span class="fav-num">' + pos + '</span><div class="fav-ov"><span style="color:var(--g);font-size:20px;">+</span></div>';
      slot.onclick = function () { openPicker('fav', pos); };
    }
  });
}
function renderWishSlots(cans) {
  [0, 1, 2].forEach(function (i) {
    var slot = document.getElementById('wish-' + (i + 1));
    var c = cans[i];
    if (c) {
      slot.innerHTML = (c.image_url ? '<img src="' + escapeHtml(c.image_url) + '" alt=""/>' : "<span style='font-size:30px;'>&#129371;</span>")
        + '<div class="fav-ov"><span style="color:#fff;font-size:12px;">✕ Retirer</span></div><div class="fav-nm">' + escapeHtml(c.name) + '</div>';
      slot.onclick = function () {
        if (confirm('Retirer de la wishlist ?')) {
          api('DELETE', '/api/wishlist/' + c.can_id).then(function () { toast('Retirée de la wishlist'); loadSettings(); });
        }
      };
    } else {
      slot.innerHTML = '<span class="fav-num">' + (i + 1) + '</span><div class="fav-ov"><span style="color:#4af;font-size:20px;">+</span></div>';
      slot.onclick = function () { openPicker('wish', i + 1); };
    }
  });
}
function removeFav(pos) {
  api('DELETE', '/api/favorites/' + pos).then(function () { toast('Favori retiré'); loadSettings(); }).catch(function (e) { toast(e.message, 'err'); });
}
window.saveProfile = function () {
  setErr('set-err', ''); setOk('set-ok', '');
  var username = document.getElementById('set-user').value.trim();
  api('PATCH', '/api/me', { username: username }).then(function (r) {
    me = r.user;
    document.getElementById('nav-name').textContent = me.username;
    var nnd2 = document.getElementById('nav-name-drop'); if (nnd2) nnd2.textContent = me.username;
    document.getElementById('set-name').textContent = me.username;
    setOk('set-ok', 'Profil mis à jour ✓');
  }).catch(function (e) { setErr('set-err', e.message); });
};
window.savePw = function () {
  setErr('pw-err', ''); setOk('pw-ok', '');
  var np = document.getElementById('pw-new').value;
  api('PATCH', '/api/me', { password: np }).then(function () {
    setOk('pw-ok', 'Mot de passe mis à jour ✓');
    document.getElementById('pw-new').value = '';
  }).catch(function (e) { setErr('pw-err', e.message); });
};
window.avatarFileChange = function () {
  var fi = document.getElementById('avatar-file');
  if (fi && fi.files && fi.files[0]) {
    var r = new FileReader();
    r.onload = function (e) {
      var pr = document.getElementById('avatar-preview');
      pr.src = e.target.result; pr.style.display = 'block';
    };
    r.readAsDataURL(fi.files[0]);
  }
};
window.saveAvatar = function () {
  var fi = document.getElementById('avatar-file');
  if (!fi || !fi.files || !fi.files[0]) { toast('Sélectionne une image', 'err'); return; }
  var file = fi.files[0];
  if (file.size > 3 * 1024 * 1024) { toast('Image trop lourde (max 3 Mo).', 'err'); return; }
  var fd = new FormData();
  fd.append('image', file);
  api('POST', '/api/me/avatar', fd, true).then(function (r) {
    me.avatar_url = r.avatar_url;
    document.getElementById('avatar-current').innerHTML = avatarHtml(me, 64);
    fi.value = '';
    document.getElementById('avatar-preview').style.display = 'none';
    toast('Photo mise à jour ✓');
  }).catch(function (e) { toast(e.message, 'err'); });
};

// ── Picker favoris / wishlist ──
window.openPicker = function (type, pos) {
  pickerMode = { type: type, pos: pos };
  document.getElementById('picker-title').textContent = type === 'fav' ? 'FAVORI #' + pos : 'WISHLIST #' + pos;
  document.getElementById('picker-search').value = '';
  var render = function () { pickerCans = allCans; renderPickerGrid(pickerCans); };
  if (!allCans.length) {
    api('GET', '/api/cans').then(function (d) { allCans = d.cans; render(); }).catch(function (e) { toast(e.message, 'err'); });
  } else render();
  document.getElementById('modal-picker').classList.add('on');
};
window.filterPicker = function () {
  var q = document.getElementById('picker-search').value.toLowerCase();
  renderPickerGrid(pickerCans.filter(function (c) { return (c.name || '').toLowerCase().includes(q); }));
};
function renderPickerGrid(cans) {
  document.getElementById('picker-grid').innerHTML = cans.slice(0, 60).map(function (c) {
    return '<div class="pk-item" onclick="pickCan(' + c.id + ')"><div class="pk-thumb">' + (c.image_url ? '<img src="' + escapeHtml(c.image_url) + '" alt="" onerror="this.parentElement.innerHTML=\'&#129371;\'">' : '&#129371;') + '</div><div class="pk-name">' + escapeHtml(c.name) + '</div></div>';
  }).join('');
}
window.pickCan = function (canId) {
  if (!pickerMode) return;
  var p = pickerMode.type === 'fav'
    ? api('PUT', '/api/favorites/' + pickerMode.pos, { can_id: canId })
    : api('POST', '/api/wishlist', { can_id: canId });
  p.then(function () {
    toast(pickerMode.type === 'fav' ? 'Favori mis à jour ✓' : 'Ajoutée à la wishlist ♥');
    closeModal('picker');
    loadSettings();
  }).catch(function (e) { toast(e.message, 'err'); });
};

// ════════════════════════════════════════════════════════
//  CONTACT
// ════════════════════════════════════════════════════════
window.goContact = function () {
  document.querySelectorAll('.sec').forEach(function (x) { x.classList.remove('on'); });
  document.querySelectorAll('.ntab').forEach(function (x) { x.classList.remove('on'); });
  document.getElementById('sec-contact').classList.add('on');
  ctBack();
};
window.ctBack = function () {
  document.getElementById('ct-menu').style.display = 'block';
  document.getElementById('ct-form').style.display = 'none';
  document.getElementById('ct-delete').style.display = 'none';
  document.getElementById('ct-legal').style.display = 'none';
};
window.ctShow = function (cat) {
  _cfCat = cat;
  document.getElementById('ctf-title').textContent = cat.toUpperCase();
  document.getElementById('cf-pseudo').value = (me && me.username) || '';
  document.getElementById('cf-cat').value = cat;
  document.getElementById('cf-msg').value = '';
  setErr('cf-err', ''); setOk('cf-ok', '');
  document.getElementById('ct-menu').style.display = 'none';
  document.getElementById('ct-form').style.display = 'block';
};
window.ctShowDel = function () {
  api('POST', '/api/me/delete-code').then(function (r) {
    document.getElementById('del-captcha-display').textContent = r.code;
    document.getElementById('del-captcha-inp').value = '';
    setErr('del-err', '');
    document.getElementById('ct-menu').style.display = 'none';
    document.getElementById('ct-delete').style.display = 'block';
  }).catch(function (e) { toast(e.message, 'err'); });
};
window.ctShowLegal = function () {
  document.getElementById('ct-menu').style.display = 'none';
  document.getElementById('ct-legal').style.display = 'block';
};
window.cfFileChange = function () {
  var f = document.getElementById('cf-file'), prev = document.getElementById('cf-preview'), img = document.getElementById('cf-preview-img');
  if (f && f.files && f.files[0]) {
    var r = new FileReader();
    r.onload = function (e) { img.src = e.target.result; prev.style.display = 'block'; };
    r.readAsDataURL(f.files[0]);
  } else prev.style.display = 'none';
};
window.sendContact = function () {
  var msg = document.getElementById('cf-msg').value.trim();
  setErr('cf-err', ''); setOk('cf-ok', '');
  if (!msg) return setErr('cf-err', 'Le message ne peut pas être vide.');
  var fileInput = document.getElementById('cf-file');
  var send = function (attachment_url) {
    api('POST', '/api/messages', { category: _cfCat, content: msg, attachment_url: attachment_url })
      .then(function () {
        setOk('cf-ok', 'Message envoyé ✓ L\'admin te répondra dès que possible.');
        document.getElementById('cf-msg').value = '';
        fileInput.value = '';
        document.getElementById('cf-preview').style.display = 'none';
        setTimeout(ctBack, 2500);
      })
      .catch(function (e) { setErr('cf-err', e.message); });
  };
  if (fileInput.files && fileInput.files[0]) {
    uploadImage(fileInput.files[0], 4).then(function (url) { send(url); }).catch(function (e) { setErr('cf-err', e.message); });
  } else send(null);
};
window.confirmDelete = function () {
  var inp = document.getElementById('del-captcha-inp').value.trim().toUpperCase();
  setErr('del-err', '');
  if (!inp) return setErr('del-err', 'Recopie le code de confirmation.');
  api('DELETE', '/api/me', { code: inp }).then(function () {
    me = null; stopPolling();
    toast('Compte supprimé.');
    go('landing');
  }).catch(function (e) { setErr('del-err', e.message); });
};

// ════════════════════════════════════════════════════════
//  ADMIN — CANETTES
// ════════════════════════════════════════════════════════
var _admCansTimer = null;
window.loadAdmCans = function () {
  clearTimeout(_admCansTimer);
  _admCansTimer = setTimeout(function () {
    document.getElementById('adm-cans-ct').innerHTML = lHtml();
    var q = (document.getElementById('adm-search') || {}).value || '';
    api('GET', '/api/admin/cans?q=' + encodeURIComponent(q)).then(function (d) {
      if (!d.cans.length) { document.getElementById('adm-cans-ct').innerHTML = eHtml('&#129371;', 'AUCUNE CANETTE', 'Ajoute ta première canette !'); return; }
      var rows = '';
      d.cans.forEach(function (c) {
        var img = c.image_url
          ? '<img src="' + escapeHtml(c.image_url) + '" alt="" style="width:40px;height:40px;object-fit:contain;border-radius:3px;" onerror="this.style.display=\'none\'">'
          : '<div style="width:40px;height:40px;background:var(--br);display:flex;align-items:center;justify-content:center;font-size:18px;">&#129371;</div>';
        var accentDot = c.accent_color ? '<div style="display:inline-block;width:12px;height:12px;border-radius:50%;background:' + escapeHtml(c.accent_color) + ';margin-left:6px;vertical-align:middle;border:1px solid rgba(255,255,255,.2);"></div>' : '';
        var badge = c.is_published ? '<span class="tbadge pub">Publiée</span>' : '<span class="tbadge draft">Brouillon</span>';
        var lim = c.is_limited ? ' <span class="tbadge lim">Limitée</span>' : '';
        var pubBtn = c.is_published
          ? '<button class="tedit" onclick="publishCan(' + c.id + ',false)">Dépublier</button>'
          : '<button class="tedit" onclick="publishCan(' + c.id + ',true)">Publier</button>';
        rows += '<tr><td>' + img + '</td>'
          + '<td><div class="tname">' + escapeHtml(c.name) + accentDot + '</div></td>'
          + '<td style="color:var(--mu);font-size:12px;">' + escapeHtml(c.series || '—') + (c.variant ? ' · ' + escapeHtml(c.variant) : '') + lim + '</td>'
          + '<td>' + badge + '</td>'
          + '<td><span class="tstat">' + c.owned_count + '</span></td>'
          + '<td><div class="tacts"><button class="tedit" onclick="openCanModal(' + c.id + ')">Éditer</button>' + pubBtn + '<button class="tdel" onclick="deleteCan(' + c.id + ')">Suppr.</button></div></td></tr>';
      });
      document.getElementById('adm-cans-ct').innerHTML = '<div class="atbl-w"><table class="atbl"><thead><tr><th>Photo</th><th>Nom</th><th>Série</th><th>Statut</th><th>Possédée par</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }).catch(function (e) { document.getElementById('adm-cans-ct').innerHTML = eHtml('⚠️', 'ERREUR', e.message); });
  }, 300);
};

window.openCanModal = function (canId) {
  var setup = function (c) {
    document.getElementById('can-modal-title').textContent = c ? 'MODIFIER LA CANETTE' : 'AJOUTER UNE CANETTE';
    document.getElementById('cm-id').value = (c && c.id) || '';
    var map = { name: 'name', series: 'series', variant: 'variant', lang: 'language', cap: 'cap_color', fc: 'full_color', vol: 'volume', country: 'country', year: 'year', desc: 'description', 'img-url': 'image_url' };
    Object.keys(map).forEach(function (f) { document.getElementById('cm-' + f).value = (c && c[map[f]]) || ''; });
    document.getElementById('cm-color').value = (c && c.accent_color) || '#39ff14';
    document.getElementById('cm-limited').checked = !!(c && c.is_limited);
    document.getElementById('cm-img-file').value = '';
    var prev = document.getElementById('img-prev'), lbl = document.getElementById('img-lbl');
    if (c && c.image_url) { prev.src = c.image_url; prev.style.display = 'block'; lbl.style.display = 'none'; }
    else { prev.style.display = 'none'; lbl.style.display = 'block'; }
    document.getElementById('modal-can').classList.add('on');
  };
  if (canId) api('GET', '/api/admin/cans').then(function (d) { setup(d.cans.find(function (c) { return c.id === canId; }) || null); });
  else setup(null);
};
window.handleImgFile = function (input) {
  var file = input.files[0]; if (!file) return;
  var prev = document.getElementById('img-prev'), lbl = document.getElementById('img-lbl');
  var rd = new FileReader();
  rd.onload = function (e) { prev.src = e.target.result; prev.style.display = 'block'; lbl.style.display = 'none'; };
  rd.readAsDataURL(file);
  document.getElementById('cm-img-url').value = '';
};
window.previewUrl = function (url) {
  var prev = document.getElementById('img-prev'), lbl = document.getElementById('img-lbl');
  if (url) { prev.src = url; prev.style.display = 'block'; lbl.style.display = 'none'; document.getElementById('cm-img-file').value = ''; }
  else { prev.style.display = 'none'; lbl.style.display = 'block'; }
};
window.saveCan = function () {
  var name = document.getElementById('cm-name').value.trim();
  if (!name) { toast('Nom requis', 'err'); return; }
  var body = {
    name: name,
    series: document.getElementById('cm-series').value,
    variant: document.getElementById('cm-variant').value,
    language: document.getElementById('cm-lang').value,
    cap_color: document.getElementById('cm-cap').value,
    full_color: document.getElementById('cm-fc').value,
    volume: document.getElementById('cm-vol').value,
    country: document.getElementById('cm-country').value,
    year: document.getElementById('cm-year').value,
    description: document.getElementById('cm-desc').value,
    is_limited: document.getElementById('cm-limited').checked,
    image_url: document.getElementById('cm-img-url').value.trim(),
    accent_color: document.getElementById('cm-color').value,
  };
  var fi = document.getElementById('cm-img-file');
  var id = document.getElementById('cm-id').value;
  var finish = function () {
    var p = id ? api('PUT', '/api/admin/cans/' + id, body) : api('POST', '/api/admin/cans', body);
    p.then(function () { toast(id ? 'Modifiée ✓' : 'Ajoutée (brouillon)'); closeModal('can'); loadAdmCans(); })
      .catch(function (e) { toast(e.message, 'err'); });
  };
  if (fi.files && fi.files[0]) {
    uploadImage(fi.files[0], 5).then(function (url) { body.image_url = url; finish(); })
      .catch(function (e) { toast(e.message, 'err'); });
  } else finish();
};
window.publishCan = function (id, published) {
  api('POST', '/api/admin/cans/' + id + '/publish', { published: published })
    .then(function () { toast(published ? 'Publiée ✓' : 'Dépubliée'); loadAdmCans(); })
    .catch(function (e) { toast(e.message, 'err'); });
};
window.deleteCan = function (id) {
  if (!confirm('Supprimer cette canette ? Elle sera aussi retirée des collections et wishlists.')) return;
  api('DELETE', '/api/admin/cans/' + id).then(function () { toast('Supprimée ✓'); loadAdmCans(); }).catch(function (e) { toast(e.message, 'err'); });
};

// ════════════════════════════════════════════════════════
//  ADMIN — ANNONCES
// ════════════════════════════════════════════════════════
window.loadAdmUpdates = function () {
  document.getElementById('adm-updates-ct').innerHTML = lHtml();
  api('GET', '/api/admin/updates').then(function (d) {
    if (!d.updates.length) { document.getElementById('adm-updates-ct').innerHTML = eHtml('📢', 'AUCUNE ANNONCE', 'Crée ta première annonce !'); return; }
    var rows = '';
    d.updates.forEach(function (u) {
      rows += '<tr><td><div class="tname">' + escapeHtml(u.title) + '</div></td>'
        + '<td style="color:var(--mu);font-size:12px;max-width:300px;">' + escapeHtml(u.content.substring(0, 100)) + (u.content.length > 100 ? '...' : '') + '</td>'
        + '<td style="color:var(--mu);font-size:11px;">' + fmtDate(u.created_at) + '</td>'
        + '<td><button class="tdel" onclick="delUpdate(' + u.id + ')">Suppr.</button></td></tr>';
    });
    document.getElementById('adm-updates-ct').innerHTML = '<div class="atbl-w"><table class="atbl"><thead><tr><th>Titre</th><th>Contenu</th><th>Date</th><th>Action</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }).catch(function (e) { document.getElementById('adm-updates-ct').innerHTML = eHtml('⚠️', 'ERREUR', e.message); });
};
window.openUpdateModal = function () {
  document.getElementById('um-title').value = '';
  document.getElementById('um-content').value = '';
  document.getElementById('modal-update').classList.add('on');
};
window.saveUpdate = function () {
  var t = document.getElementById('um-title').value.trim();
  var ct = document.getElementById('um-content').value.trim();
  if (!t || !ct) { toast('Titre et contenu requis', 'err'); return; }
  api('POST', '/api/admin/updates', { title: t, content: ct })
    .then(function () { toast('Annonce publiée ✓'); closeModal('update'); loadAdmUpdates(); })
    .catch(function (e) { toast(e.message, 'err'); });
};
window.delUpdate = function (id) {
  if (!confirm('Supprimer cette annonce ?')) return;
  api('DELETE', '/api/admin/updates/' + id).then(function () { toast('Supprimée ✓'); loadAdmUpdates(); }).catch(function (e) { toast(e.message, 'err'); });
};

// ════════════════════════════════════════════════════════
//  ADMIN — UTILISATEURS
// ════════════════════════════════════════════════════════
var _admUsersTimer = null;
window.loadAdmUsers = function () {
  clearTimeout(_admUsersTimer);
  _admUsersTimer = setTimeout(function () {
    document.getElementById('adm-users-ct').innerHTML = lHtml();
    var q = (document.getElementById('user-search') || {}).value || '';
    api('GET', '/api/admin/users?q=' + encodeURIComponent(q)).then(function (d) {
      var rows = '';
      d.users.forEach(function (u) {
        var delBtn = u.role !== 'admin' ? '<button class="tdel" onclick="delUser(' + u.id + ')">Suppr.</button>' : '—';
        rows += '<tr>'
          + '<td><div style="display:flex;align-items:center;gap:9px;">' + avatarHtml(u, 30) + '<div class="tname">' + escapeHtml(u.username) + '</div></div></td>'
          + '<td style="font-family:monospace;font-size:11px;color:var(--mu);">' + escapeHtml(u.user_code || '—') + '</td>'
          + '<td><span class="tbadge ' + (u.role === 'admin' ? 'lim' : 'std') + '">' + escapeHtml(u.role) + '</span></td>'
          + '<td><span class="tstat">' + u.col_count + '</span></td>'
          + '<td style="color:var(--mu);font-size:11px;">' + fmtDate(u.created_at) + '</td>'
          + '<td>' + delBtn + '</td></tr>';
      });
      document.getElementById('adm-users-ct').innerHTML = '<div class="atbl-w"><table class="atbl"><thead><tr><th>Utilisateur</th><th>Code</th><th>Rôle</th><th>Canettes</th><th>Inscrit le</th><th>Action</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }).catch(function (e) { document.getElementById('adm-users-ct').innerHTML = eHtml('⚠️', 'ERREUR', e.message); });
  }, 300);
};
window.delUser = function (id) {
  if (!confirm('Supprimer ce compte et toutes ses données ?')) return;
  api('DELETE', '/api/admin/users/' + id).then(function () { toast('Utilisateur supprimé ✓'); loadAdmUsers(); }).catch(function (e) { toast(e.message, 'err'); });
};

// ════════════════════════════════════════════════════════
//  ADMIN — RÉCEPTION
// ════════════════════════════════════════════════════════
window.loadAdmInbox = function () {
  document.getElementById('inbox-ct').innerHTML = lHtml();
  api('GET', '/api/admin/messages').then(function (d) {
    _admMsgs = d.messages;
    var pending = _admMsgs.filter(function (m) { return !m.reply; }).length;
    var replied = _admMsgs.filter(function (m) { return m.reply; }).length;
    var filterHtml = '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">'
      + '<button class="ntab' + (_inboxFilter === 'all' ? ' on' : '') + '" onclick="setInboxFilter(\'all\')" style="flex:0;padding:6px 16px;font-size:12px;height:auto;">Tous (' + _admMsgs.length + ')</button>'
      + '<button class="ntab' + (_inboxFilter === 'pending' ? ' on' : '') + '" onclick="setInboxFilter(\'pending\')" style="flex:0;padding:6px 16px;font-size:12px;height:auto;">En attente (' + pending + ')</button>'
      + '<button class="ntab' + (_inboxFilter === 'replied' ? ' on' : '') + '" onclick="setInboxFilter(\'replied\')" style="flex:0;padding:6px 16px;font-size:12px;height:auto;">Répondus (' + replied + ')</button></div>';
    var filtered = _admMsgs.filter(function (m) {
      if (_inboxFilter === 'pending') return !m.reply;
      if (_inboxFilter === 'replied') return !!m.reply;
      return true;
    });
    if (!filtered.length) { document.getElementById('inbox-ct').innerHTML = filterHtml + eHtml('📭', 'AUCUN MESSAGE', 'Aucun message dans cette catégorie.'); return; }
    var cats = { 'Signaler un bug': '#ff3535', 'Poser une question': '#4af', 'Problème de compte': '#ff9600', 'Suggestion': '#39ff14', 'Canette manquante': '#ffc800', 'Erreur de données': '#ff9600' };
    var rows = '';
    filtered.forEach(function (m) {
      var col = cats[m.category] || '#aaa';
      var ts = fmtDate(m.created_at);
      var badge = '<span class="tbadge" style="background:' + col + '22;color:' + col + ';border:1px solid ' + col + '44;">' + escapeHtml(m.category) + '</span>';
      var statusBadge = m.reply ? '<span class="tbadge pub">Répondu</span>' : '<span class="tbadge draft">En attente</span>';
      var attachIcon = m.attachment_url ? '<span title="Photo jointe" style="margin-left:4px;font-size:12px;">📎</span>' : '';
      rows += '<tr><td><div class="tname">' + escapeHtml(m.username || 'Invité') + '</div></td>'
        + '<td>' + badge + '</td>'
        + '<td style="max-width:220px;font-size:12px;color:#bbb;word-break:break-word;">' + escapeHtml(m.content.substring(0, 80)) + (m.content.length > 80 ? '...' : '') + attachIcon + '</td>'
        + '<td style="color:var(--mu);font-size:11px;white-space:nowrap;">' + ts + '</td>'
        + '<td>' + statusBadge + '</td>'
        + '<td><div class="tacts"><button class="tedit" onclick="openReply(' + m.id + ')">Répondre</button><button class="tdel" onclick="delMsg(' + m.id + ')">Suppr.</button></div></td></tr>';
    });
    document.getElementById('inbox-ct').innerHTML = filterHtml + '<div class="atbl-w"><table class="atbl"><thead><tr><th>Pseudo</th><th>Objet</th><th>Message</th><th>Date</th><th>Statut</th><th>Action</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }).catch(function (e) { document.getElementById('inbox-ct').innerHTML = eHtml('⚠️', 'ERREUR', e.message); });
};
window.setInboxFilter = function (f) { _inboxFilter = f; loadAdmInbox(); };
window.openReply = function (id) {
  var m = _admMsgs.find(function (x) { return x.id === id; });
  if (!m) { toast('Message introuvable', 'err'); return; }
  document.getElementById('reply-id').value = id;
  document.getElementById('reply-meta').textContent = (m.username || 'Invité') + ' — ' + m.category;
  document.getElementById('reply-msg').textContent = m.content;
  var imgEl = document.getElementById('reply-attach');
  if (m.attachment_url) { imgEl.src = m.attachment_url; imgEl.style.display = 'block'; }
  else imgEl.style.display = 'none';
  document.getElementById('reply-txt').value = '';
  document.getElementById('modal-reply').classList.add('on');
};
window.sendReply = function () {
  var id = document.getElementById('reply-id').value;
  var txt = document.getElementById('reply-txt').value.trim();
  if (!txt) { toast('La réponse ne peut pas être vide', 'err'); return; }
  api('POST', '/api/admin/messages/' + id + '/reply', { reply: txt })
    .then(function () { toast('Réponse envoyée ✓'); closeModal('reply'); loadAdmInbox(); updateBadges(); })
    .catch(function (e) { toast(e.message, 'err'); });
};
window.delMsg = function (id) {
  if (!confirm('Supprimer ce message ?')) return;
  api('DELETE', '/api/admin/messages/' + id).then(function () { toast('Message supprimé ✓'); loadAdmInbox(); updateBadges(); }).catch(function (e) { toast(e.message, 'err'); });
};

// ════════════════════════════════════════════════════════
//  ADMIN — RÉGLAGES
// ════════════════════════════════════════════════════════
window.loadAdmSettings = function () {
  document.getElementById('adm-set-user').value = (me && me.username) || '';
  document.getElementById('adm-set-email').value = (me && me.email) || '';
  loadMaintStatus();
};
window.saveAdmProfile = function () {
  var username = document.getElementById('adm-set-user').value.trim();
  setErr('adm-set-err', ''); setOk('adm-set-ok', '');
  if (!username) return setErr('adm-set-err', 'Le pseudo ne peut pas être vide.');
  api('PATCH', '/api/me', { username: username }).then(function (r) {
    me = r.user; setOk('adm-set-ok', 'Profil mis à jour ✓');
  }).catch(function (e) { setErr('adm-set-err', e.message); });
};
window.saveAdmPassword = function () {
  var np = document.getElementById('adm-pw-new').value;
  var cp = document.getElementById('adm-pw-conf').value;
  setErr('adm-pw-err', ''); setOk('adm-pw-ok', '');
  if (!np) return setErr('adm-pw-err', 'Entre un nouveau mot de passe.');
  if (np !== cp) return setErr('adm-pw-err', 'Les mots de passe ne correspondent pas.');
  api('PATCH', '/api/me', { password: np }).then(function () {
    setOk('adm-pw-ok', 'Mot de passe changé ✓');
    document.getElementById('adm-pw-new').value = '';
    document.getElementById('adm-pw-conf').value = '';
  }).catch(function (e) { setErr('adm-pw-err', e.message); });
};
window.setMaintenance = function (active) {
  api('POST', '/api/admin/maintenance', { active: active })
    .then(function () { toast(active ? '🔴 Maintenance activée' : '🟢 Application relancée'); loadMaintStatus(); })
    .catch(function (e) { toast(e.message, 'err'); });
};
function loadMaintStatus() {
  api('GET', '/api/admin/maintenance').then(function (d) {
    var el = document.getElementById('maint-status');
    el.innerHTML = d.active
      ? '<span style="color:#ff9600;font-weight:700;">⚠ MAINTENANCE ACTIVE</span>'
      : '<span style="color:var(--g);font-weight:700;">● APPLICATION EN LIGNE</span>';
    document.getElementById('maint-on-btn').style.opacity = d.active ? '0.4' : '1';
    document.getElementById('maint-off-btn').style.opacity = d.active ? '1' : '0.4';
  }).catch(function () { });
}

// ════════════════════════════════════════════════════════
//  PWA
// ════════════════════════════════════════════════════════
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () { });
  });
}
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  _installPrompt = e;
  var btn = document.getElementById('pwa-install-btn');
  if (btn && me) btn.style.display = 'block';
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
    toast('Utilise le menu de ton navigateur : « Installer l\'application » ou « Ajouter à l\'écran d\'accueil ».', 'err');
  }
};

// ── Vérification pseudo à l'inscription ──
(function () {
  var ru = document.getElementById('ru');
  if (!ru) return;
  ru.addEventListener('input', function () {
    var val = ru.value.trim(), el = document.getElementById('pst');
    clearTimeout(_pseudoCheckTimer);
    if (!val) { el.textContent = ''; return; }
    el.className = 'pst pst-chk'; el.textContent = 'Vérification...';
    _pseudoCheckTimer = setTimeout(function () {
      fetch('/api/public/check-username?q=' + encodeURIComponent(val))
        .then(function (r) { return r.json(); })
        .then(function (d) {
          el.className = 'pst ' + (d.taken ? 'pst-err' : 'pst-ok');
          el.textContent = d.taken ? '✗ Déjà pris' : '✓ Disponible !';
        })
        .catch(function () { el.textContent = ''; });
    }, 500);
  });
})();

// ── Clavier : Entrée sur login/register ──
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter') return;
  var a = document.querySelector('.page.active');
  if (!a) return;
  if (a.id === 'page-login') doLogin();
  if (a.id === 'page-register') doRegister();
});

// ── Fermer les modales en cliquant le fond ──
document.querySelectorAll('.moverlay').forEach(function (ov) {
  ov.addEventListener('click', function (e) { if (e.target === ov) ov.classList.remove('on'); });
});

// ── Démarrage : session existante ? ──
(function boot() {
  fetch('/api/auth/me', { credentials: 'same-origin' })
    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
    .then(function (res) {
      if (res.ok && res.d.user) {
        me = res.d.user;
        if (res.d.maintenance) { _setupAppUI(); go('app'); showMaintOverlay(); return; }
        enterApp();
      } else {
        go('landing');
      }
    })
    .catch(function () { go('landing'); });
})();

// ════════════════════ MENU MOBILE (BURGER) ════════════════════
window.toggleNavMenu = function () {
  var d = document.getElementById('nav-drop');
  if (!d) return;
  if (d.classList.contains('open')) { window.closeNavMenu(); return; }
  var anchor = document.getElementById('drop-tabs-anchor');
  document.querySelectorAll('.app-nav .ntabs').forEach(function (t) {
    if (t.style.display !== 'none') d.insertBefore(t, anchor);
  });
  d.classList.add('open');
};
window.closeNavMenu = function () {
  var d = document.getElementById('nav-drop');
  if (!d) return;
  d.classList.remove('open');
  var back = document.getElementById('nav-tabs-anchor');
  if (!back) return;
  d.querySelectorAll('.ntabs').forEach(function (t) { back.parentNode.insertBefore(t, back); });
};
document.addEventListener('click', function (e) {
  var d = document.getElementById('nav-drop'), b = document.getElementById('nav-burger');
  if (d && d.classList.contains('open') && b && !d.contains(e.target) && !b.contains(e.target)) window.closeNavMenu();
});
window.addEventListener('resize', function () { if (window.innerWidth > 860) window.closeNavMenu(); });
// Ferme le menu après sélection d'un onglet
(function () {
  var _gt = window.goTab;
  if (typeof _gt === 'function') window.goTab = function (t, b) { _gt(t, b); window.closeNavMenu(); };
})();
