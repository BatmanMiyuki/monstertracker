// ════════════════════════════════════════════════════════════
//  MonsterTracker v3 — Frontend Firebase (comptes réels + admin)
//  Même schéma Firestore que la v1 → données existantes compatibles.
//  Corrections : anti-XSS (escapeHtml/textContent), images compressées,
//  code mort supprimé, plus d'auth anonyme.
// ════════════════════════════════════════════════════════════
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, deleteUser } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, query, where, orderBy, getDocs, onSnapshot, serverTimestamp, writeBatch, limit } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const app = initializeApp({
  apiKey: 'AIzaSyAlanpPYiUG8tg0P8prqMjYiHH2QmEqKcc',
  authDomain: 'monstertracker-bymiyuki.firebaseapp.com',
  projectId: 'monstertracker-bymiyuki',
  storageBucket: 'monstertracker-bymiyuki.firebasestorage.app',
  messagingSenderId: '714396226229',
  appId: '1:714396226229:web:9fd3fc50d9396ca7a324fc',
});
const auth = getAuth(app);
// URL du serveur Node (version pro : lien de réinitialisation vivant dans l'email type).
// Vide = mode sans serveur : l'email officiel Firebase part en parallèle.
window.MT_RESET_API = '';
const db = getFirestore(app);
const fst = () => serverTimestamp();
const fbatch = () => writeBatch(db);

// ── État global ──
let user = null, allCans = [], pickerMode = null, pickerCans = [];
let _detailCan = null, _cfCat = '', _admMsgs = [], _delCode = '';
let _inboxFilter = 'all', _isMaint = false, _maintUnsub = null;
let _chatPoll = null, _badgePoll = null, _currentChatFriend = null;

// Lien QR ami : ?add=CODE → ajout automatique après connexion
try {
  const _addParam = new URLSearchParams(location.search).get('add');
  if (_addParam) {
    const _clean = _addParam.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (_clean) sessionStorage.setItem('mt_pending_add', _clean);
    history.replaceState(null, '', location.pathname + location.hash);
  }
} catch (e) {}
let _friendSearchTimer = null, _pseudoTimer = null, _installPrompt = null;

// ── Helpers ─
function escapeHtml(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function toast(msg, t) {
  t = t || 'ok';
  const el = document.createElement('div');
  el.className = 'toast ' + t;
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3400);
}
function lHtml() { return '<div class="loading"><div class="spin"></div>Chargement...</div>'; }
function eHtml(i, t, p) { return '<div class="empty"><div class="ei">' + i + '</div><h3>' + escapeHtml(t) + '</h3><p>' + escapeHtml(p) + '</p></div>'; }
function fmtPrice(v) { return (v != null && parseFloat(v) > 0) ? parseFloat(v).toFixed(2) + '€' : '—'; }
function tsToDate(ts) { if (!ts) return null; if (ts.toDate) return ts.toDate(); return new Date(ts); }
function fmtDate(ts) { const d = tsToDate(ts); return d ? d.toLocaleDateString('fr-FR') : ''; }
function timeAgo(ts) {
  const d = tsToDate(ts); if (!d) return '';
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return 'à l\'instant';
  if (s < 3600) return Math.floor(s / 60) + ' min';
  if (s < 86400) return Math.floor(s / 3600) + ' h';
  return Math.floor(s / 86400) + ' j';
}
function hexToRgb(hex) { const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return r ? parseInt(r[1], 16) + ',' + parseInt(r[2], 16) + ',' + parseInt(r[3], 16) : '170,170,170'; }
function setErr(id, text) { const el = document.getElementById(id); if (el) { el.textContent = text || ''; el.classList.toggle('on', !!text); } }
function setOk(id, text) { const el = document.getElementById(id); if (el) { el.textContent = text || ''; el.classList.toggle('on', !!text); } }
window.closeModal = (id) => document.getElementById('modal-' + id).classList.remove('on');
window.tpw = (id, eye) => { const i = document.getElementById(id); i.type = i.type === 'password' ? 'text' : 'password'; eye.textContent = i.type === 'password' ? '👁' : '🙈'; };

// ── Compression d'image (évite d'exploser la limite 1 Mo/doc de Firestore) ──
function compressImage(file, maxDim, quality) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        const c = document.createElement('canvas');
        c.width = Math.round(w * scale); c.height = Math.round(h * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => rej(new Error('Image illisible.'));
      img.src = e.target.result;
    };
    r.onerror = () => rej(new Error('Fichier illisible.'));
    r.readAsDataURL(file);
  });
}

// ── Navigation ──
window.go = (p) => {
  document.querySelectorAll('.page').forEach((x) => x.classList.remove('active'));
  document.getElementById('page-' + p).classList.add('active');
  window.scrollTo(0, 0);
};
window.goLandingApp = () => {
  if (!user) { go('landing'); return; }
  goTab(user.role === 'admin' ? 'adm-cans' : 'home', document.getElementById(user.role === 'admin' ? 'tab-adm-cans' : 'tab-home'));
};
window.goTab = (s, btn) => {
  document.querySelectorAll('.sec').forEach((x) => x.classList.remove('on'));
  document.querySelectorAll('.ntab').forEach((x) => x.classList.remove('on'));
  document.getElementById('sec-' + s).classList.add('on');
  if (btn) btn.classList.add('on');
  const m = { home: loadHome, catalogue: loadCatalogue, collection: loadCollection, friends: loadFriends, updates: loadUpdates, settings: loadSettings, 'adm-cans': loadAdmCans, 'adm-updates': loadAdmUpdates, 'adm-users': loadAdmUsers, 'adm-inbox': loadAdmInbox, 'adm-settings': loadAdmSettings };
  if (m[s]) m[s]();
};
window.showForgot = () => { document.getElementById('forgot-panel').style.display = 'block'; };
window.sendForgotRequest = function () {
  const err = document.getElementById('forgot-err'), ok = document.getElementById('forgot-ok');
  err.textContent = ''; err.classList.remove('on'); ok.textContent = ''; ok.classList.remove('on');
  const email = document.getElementById('forgot-email').value.trim();
  if (!email) { err.textContent = 'Entre ton adresse email.'; err.classList.add('on'); return; }
  addDoc(collection(db, 'messages'), { uid: null, username: 'Compte bloqué', email, category: 'Mot de passe oublié', content: 'Mot de passe oublié — merci de m\'envoyer un lien de réinitialisation.', attachment_url: null, reply: null, replied_at: null, created_at: fst() })
    .then(() => { ok.textContent = 'Demande envoyée à l\'admin ✓ Tu recevras le lien par email.'; ok.classList.add('on'); })
    .catch((e) => { err.textContent = (e && e.code === 'permission-denied') ? 'Envoi impossible : règles Firestore à mettre à jour (README, section Règle oubli).' : (e.message || 'Erreur'); err.classList.add('on'); });
};
window.hideForgot = () => { document.getElementById('forgot-panel').style.display = 'none'; };

// ── Thèmes ──
// Thèmes : noir (défaut) ou blanc — l'accent reste toujours vert
function setThemeLocal(t) {
  document.body.classList.toggle('light', t === 'light');
}
window.setTheme = (t) => {
  if (t !== 'light') t = 'dark';
  document.querySelectorAll('.theme-btn').forEach((b) => b.classList.remove('on'));
  ['th-', 'adm-th-'].forEach((p) => { const b = document.getElementById(p + t); if (b) b.classList.add('on'); });
  setThemeLocal(t);
  if (user) updateDoc(doc(db, 'users', user.uid), { theme: t }).then(() => { user.theme = t; }).catch(() => {});
};

// ── Avatars ──
function letterAvatar(letter, size) {
  size = size || 40;
  return '<div style="width:' + size + 'px;height:' + size + 'px;background:var(--g);border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:\'Bebas Neue\',sans-serif;font-size:' + Math.round(size * .45) + 'px;color:#000;flex-shrink:0;">' + escapeHtml(letter) + '</div>';
}
function avatarHtml(u, size) {
  size = size || 40;
  const s = 'width:' + size + 'px;height:' + size + 'px;flex-shrink:0;border-radius:50%;object-fit:cover;';
  if (u && u.avatar_url) return '<img src="' + escapeHtml(u.avatar_url) + '" alt="" style="' + s + '" data-mt-letter="' + escapeHtml(((u.username || '?')[0]).toUpperCase()) + '" data-mt-size="' + size + '" onerror="mtAvatarFail(this)">';
  return letterAvatar((u && u.username ? u.username[0] : '?').toUpperCase(), size);
}
// Remplacement propre d'un avatar cassé (aucun guillemet dans les attributs)
window.mtAvatarFail = function (img) {
  var w = document.createElement('div');
  w.innerHTML = letterAvatar(img.getAttribute('data-mt-letter') || '?', parseInt(img.getAttribute('data-mt-size'), 10) || 40);
  if (img.parentNode && w.firstChild) img.parentNode.replaceChild(w.firstChild, img);
};


// ── Auth ──
onAuthStateChanged(auth, (fbUser) => {
  if (fbUser) {
    getDoc(doc(db, 'users', fbUser.uid)).then((snap) => {
      if (snap.exists()) {
        user = Object.assign({ uid: fbUser.uid, email: fbUser.email }, snap.data());
        showApp();
      } else {
        const username = fbUser.email.split('@')[0];
        const code = Math.random().toString(36).substr(2, 8).toUpperCase();
        return setDoc(doc(db, 'users', fbUser.uid), { username, email: fbUser.email, role: 'user', theme: 'dark', avatar_url: null, user_code: code, created_at: fst() })
          .then(() => getDoc(doc(db, 'users', fbUser.uid)))
          .then((s2) => { user = Object.assign({ uid: fbUser.uid, email: fbUser.email }, s2.data()); showApp(); });
      }
    }).catch((e) => { toast('Erreur profil : ' + e.message, 'err'); });
  } else {
    user = null;
    stopMaintListen(); stopChatPoll(); stopPolling();
    const ap = document.getElementById('page-app');
    if (ap && ap.classList.contains('active')) go('landing');
  }
});

window.doRegister = () => {
  setErr('rerr', '');
  const username = document.getElementById('ru').value.trim();
  const email = document.getElementById('re').value.trim();
  const pw = document.getElementById('rp').value;
  const pw2 = document.getElementById('rp2').value;
  if (!username) return setErr('rerr', 'Pseudo requis.');
  if (!/^[a-zA-Z0-9_.\-]+$/.test(username)) return setErr('rerr', 'Pseudo : lettres, chiffres, - _ . uniquement.');
  if (!email) return setErr('rerr', 'Email requis.');
  if (pw.length < 6) return setErr('rerr', 'Mot de passe : 6 caractères minimum.');
  if (pw !== pw2) return setErr('rerr', 'Les mots de passe ne correspondent pas.');
  const btn = document.getElementById('register-btn'); btn.disabled = true;
  toast('Création du compte...');
  const code = Math.random().toString(36).substr(2, 8).toUpperCase();
  createUserWithEmailAndPassword(auth, email, pw).then((cred) =>
    setDoc(doc(db, 'users', cred.user.uid), { username, email, role: 'user', theme: 'dark', avatar_url: null, user_code: code, created_at: serverTimestamp() })
  ).then(() => toast('Compte créé ✓'))
    .catch((e) => { const msg = e.code === 'auth/email-already-in-use' ? 'Cet email est déjà utilisé.' : e.code === 'auth/weak-password' ? 'Mot de passe trop faible.' : e.message; setErr('rerr', msg); toast(msg, 'err'); })
    .finally(() => { btn.disabled = false; });
};

window.doLogin = () => {
  setErr('lerr', '');
  const email = document.getElementById('le').value.trim();
  const pw = document.getElementById('lp').value;
  if (!email || !pw) return setErr('lerr', 'Email et mot de passe requis.');
  const btn = document.getElementById('login-btn'); btn.disabled = true;
  toast('Connexion...');
  signInWithEmailAndPassword(auth, email, pw)
    .then(() => toast('Connecté ✓'))
    .catch((e) => { const msg = (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found') ? 'Email ou mot de passe incorrect.' : e.message; setErr('lerr', msg); toast(msg, 'err'); })
    .finally(() => { btn.disabled = false; });
};

window.doLogout = () => {
  stopMaintListen(); stopChatPoll(); stopPolling();
  signOut(auth).then(() => go('landing'));
};

// ── Vérif pseudo dispo ──
window.checkPseudo = () => {
  const val = document.getElementById('ru').value.trim(), el = document.getElementById('pst');
  clearTimeout(_pseudoTimer);
  if (!val) { el.textContent = ''; return; }
  el.className = 'pst pst-chk'; el.textContent = 'Vérification...';
  _pseudoTimer = setTimeout(() => {
    getDocs(query(collection(db, 'users'), where('username', '==', val)))
      .then((snap) => { el.className = 'pst ' + (snap.empty ? 'pst-ok' : 'pst-err'); el.textContent = snap.empty ? '✓ Disponible !' : '✗ Déjà pris'; })
      .catch(() => { el.textContent = ''; });
  }, 600);
};

function _setupAppUI() {
  if (!user) return;
  const isAdmin = user.role === 'admin';
  document.getElementById('user-tabs').style.display = isAdmin ? 'none' : 'flex';
  document.getElementById('admin-tabs').style.display = isAdmin ? 'flex' : 'none';
  const sb = document.getElementById('support-btn'); if (sb) sb.style.display = isAdmin ? 'inline-block' : 'none';
  const dsb = document.getElementById('drop-support'); if (dsb) dsb.style.display = isAdmin ? 'block' : 'none';
  document.getElementById('nav-name').textContent = isAdmin ? 'Admin' : (user.username || '');
  const nnd = document.getElementById('nav-name-drop'); if (nnd) nnd.textContent = isAdmin ? 'Admin' : (user.username || '');
  if (!isAdmin) {
    document.getElementById('set-name').textContent = user.username || '';
    document.getElementById('set-user').value = user.username || '';
    document.getElementById('set-email').value = user.email || '';
  }
  setThemeLocal(user.theme || 'dark');
  document.querySelectorAll('.theme-btn').forEach((b) => b.classList.remove('on'));
  ['th-', 'adm-th-'].forEach((p) => { const b = document.getElementById(p + (user.theme || 'dark')); if (b) b.classList.add('on'); });
}
function showApp() {
  _setupAppUI();
  go('app');
  startPolling();
  startMaintListen();
  if (user.role === 'admin') goTab('adm-cans', document.getElementById('tab-adm-cans'));
  else goTab('home', document.getElementById('tab-home'));
  processPendingAdd();
}

// ── Maintenance ─
function startMaintListen() {
  stopMaintListen();
  _maintUnsub = onSnapshot(doc(db, 'settings', 'maintenance'), (snap) => {
    const active = snap.exists() ? snap.data().active : false;
    if (user && user.role === 'admin') return;
    if (active && !_isMaint) { _isMaint = true; document.getElementById('maintenance-overlay').style.display = 'flex'; }
    else if (!active && _isMaint) { _isMaint = false; document.getElementById('maintenance-overlay').style.display = 'none'; }
  }, () => {});
}
function stopMaintListen() { if (_maintUnsub) { _maintUnsub(); _maintUnsub = null; } }

// ── Badges ──
function startPolling() { stopPolling(); updateBadges(); _badgePoll = setInterval(updateBadges, 20000); }
function stopPolling() { if (_badgePoll) { clearInterval(_badgePoll); _badgePoll = null; } }
function setBadge(id, n, bg) { const el = document.getElementById(id); if (!el) return; el.textContent = n; if (bg) el.style.background = bg; el.style.display = n > 0 ? 'inline-flex' : 'none'; }
function updateBadges() {
  if (!user) return;
  getDocs(query(collection(db, 'friend_requests'), where('to_uid', '==', user.uid), where('status', '==', 'pending'))).then((s) => {
    setBadge('friends-badge', s.size, '#ff9600');
    setBadge('notif-badge', s.size);
  }).catch(() => {});
  getDocs(query(collection(db, 'chats'), where('participants', 'array-contains', user.uid), limit(500))).then((s) => {
    let n = 0; s.docs.forEach((d) => { const m = d.data(); if (m.to_uid === user.uid && !m.read) n++; });
    setBadge('chat-badge', n);
  }).catch(() => {});
  updateUpdatesBadge();
  if (user.role === 'admin') {
    getDocs(query(collection(db, 'messages'), where('reply', '==', null))).then((s) => setBadge('inbox-badge', s.size)).catch(() => {});
  }
}

// ── Charts ──
function drawChart(data, cid) {
  const ct = document.getElementById(cid); if (!ct) return;
  if (!data || !data.length) { ct.innerHTML = '<p style="color:var(--mu);font-size:12px;">Pas encore de données.</p>'; return; }
  const maxV = Math.max.apply(null, data.map((d) => parseInt(d.count, 10)));
  const W = 500, H = 110, bw = Math.max(12, Math.floor((W - 20) / data.length) - 6), gap = 6, pad = 10;
  let bars = '';
  data.forEach((d, i) => {
    const cnt = parseInt(d.count, 10);
    const bh = Math.max(2, Math.floor((cnt / maxV) * (H - 28)));
    const x = pad + i * (bw + gap), y = H - bh - 18;
    const mo = d.month ? d.month.substring(5) : '';
    bars += '<rect fill="rgba(var(--g-r),var(--g-g),var(--g-b),.25)" x="' + x + '" y="' + y + '" width="' + bw + '" height="' + bh + '" rx="2"/>';
    if (cnt > 0) bars += '<text font-family="Bebas Neue,sans-serif" font-size="11" style="fill:var(--g)" text-anchor="middle" x="' + (x + bw / 2) + '" y="' + (y - 3) + '">' + cnt + '</text>';
    bars += '<text font-family="Barlow Condensed,sans-serif" font-size="9" style="fill:var(--mu)" text-anchor="middle" x="' + (x + bw / 2) + '" y="' + (H - 4) + '">' + escapeHtml(mo) + '</text>';
  });
  ct.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-height:115px;overflow:visible;">' + bars + '</svg>';
}
function drawPieChart(data, cid) {
  const el = document.getElementById(cid); if (!el) return;
  if (!data || !data.length) { el.innerHTML = '<div style="text-align:center;color:var(--mu);font-size:12px;padding:20px;">Pas de données</div>'; return; }
  const themeG = getComputedStyle(document.documentElement).getPropertyValue('--g').trim() || '#39ff14';
  const colors = [themeG, '#00cfff', '#ff9600', '#ff3535', '#ffc800', '#bf5fff', '#00e5a0', '#ff6ec7', '#7fff6e', '#5599ff'];
  const max = Math.max.apply(null, data.map((d) => parseInt(d.count, 10)));
  let html = '<div style="display:flex;flex-direction:column;gap:6px;">';
  data.slice(0, 8).forEach((d, i) => {
    const pct = max > 0 ? Math.round((parseInt(d.count, 10) / max) * 100) : 0;
    html += '<div style="display:flex;align-items:center;gap:8px;"><div style="width:80px;font-size:11px;color:var(--tx);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(d.label) + '</div><div style="flex:1;height:16px;background:var(--br);"><div style="height:100%;width:' + pct + '%;background:' + colors[i % colors.length] + ';transition:width .5s;"></div></div><div style="width:24px;font-size:11px;color:var(--mu);text-align:right;">' + escapeHtml(d.count) + '</div></div>';
  });
  el.innerHTML = html + '</div>';
}

// ── Carte canette ──
function accentBg(color) {
  color = color || getComputedStyle(document.documentElement).getPropertyValue('--g').trim() || '#39ff14';
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
  if (!m) return 'var(--bk)';
  const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
  return 'radial-gradient(ellipse at 50% 65%, rgba(' + r + ',' + g + ',' + b + ',0.16) 0%, rgba(8,8,8,1) 68%)';
}
function canCardHtml(can, btnsHtml) {
  const accent = can.is_limited ? '#ff9600' : (can.accent_color || '#39ff14');
  const img = can.image_url ? '<img src="' + escapeHtml(can.image_url) + '" alt="' + escapeHtml(can.name) + '" onerror="this.style.display=\'none\'">' : '<span style="font-size:52px;">&#129371;</span>';
  const lim = can.is_limited ? '<div class="lim-tag">Limitée</div>' : '';
  const owned = can.in_collection ? '<div class="owned-ov"><div class="owned-tag">✓ Possédée</div></div>' : '';
  const price = can.price ? '<div class="cprice">' + fmtPrice(can.price) + '</div>' : '';
  const sub = [can.series, can.variant, can.country, can.year].filter(Boolean).map(escapeHtml).join(' · ') || '—';
  const cardBorder = can.is_limited ? 'border:2px solid #ff9600;border-bottom:3px solid #ff9600;' : 'border-bottom:3px solid ' + accent + ';';
  return '<div class="ccard" style="' + cardBorder + '">'
    + '<div class="cthumb" style="background:' + accentBg(accent) + '">' + img + lim + owned + '</div>'
    + '<div class="cbody"><div class="cname">' + escapeHtml(can.name) + '</div><div class="csub">' + sub + '</div>' + price
    + (btnsHtml ? '<div class="cbtns">' + btnsHtml + '</div>' : '')
    + '</div></div>';
}

// ════════════════════ ACCUEIL ════════════════════
window.loadHome = function () {
  ['h-owned', 'h-total', 'h-value', 'h-friends'].forEach((id) => { const el = document.getElementById(id); if (el) el.textContent = '...'; });
  ['chart-series', 'chart-lang', 'h-recent', 'h-friends-act'].forEach((id) => { const el = document.getElementById(id); if (el) el.innerHTML = lHtml(); });
  getDocs(query(collection(db, 'collection'), where('uid', '==', user.uid))).then((colSnap) => {
    const colItems = colSnap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    const totalValue = colItems.reduce((s, c) => s + (parseFloat(c.price) || 0), 0);
    getDocs(query(collection(db, 'cans'), where('is_published', '==', true))).then((cansSnap) => {
      const pct = cansSnap.size > 0 ? Math.round((colItems.length / cansSnap.size) * 100) : 0;
      document.getElementById('h-owned').textContent = colItems.length;
      document.getElementById('h-total').textContent = cansSnap.size;
      document.getElementById('h-value').textContent = totalValue > 0 ? totalValue.toFixed(2) + '€' : '—';
      document.getElementById('h-pct').textContent = pct + '%';
      document.getElementById('h-prog').style.width = pct + '%';
    });
    getDocs(query(collection(db, 'friends'), where('uid', '==', user.uid), where('status', '==', 'accepted'))).then((frSnap) => {
      document.getElementById('h-friends').textContent = frSnap.size;
      const friendUids = frSnap.docs.map((d) => d.data().friendUid);
      const el = document.getElementById('h-friends-act');
      if (!friendUids.length) { el.innerHTML = eHtml('👥', 'Pas encore d\'amis', 'Ajoute des amis depuis l\'onglet Amis !'); return; }
      Promise.all(friendUids.slice(0, 5).map((uid) => getDoc(doc(db, 'users', uid)))).then((docs) => {
        let fhtml = '<div class="fr-list">';
        docs.forEach((fd) => { if (!fd.exists()) return; const f = fd.data(); fhtml += '<div class="fr-card">' + avatarHtml(f, 38) + '<div><div class="fr-name">' + escapeHtml(f.username) + '</div></div></div>'; });
        el.innerHTML = fhtml + '</div>';
      });
    });
    const recent = colItems.sort((a, b) => (tsToDate(b.added_at) || 0) - (tsToDate(a.added_at) || 0)).slice(0, 5);
    const elRec = document.getElementById('h-recent');
    if (recent.length) {
      let rhtml = '<div class="rec-list">';
      recent.forEach((r) => {
        const thumb = r.image_url ? '<img src="' + escapeHtml(r.image_url) + '" alt="" onerror="this.style.display=\'none\'"/>' : '&#129371;';
        rhtml += '<div class="rec-item"><div class="rec-thumb">' + thumb + '</div><div><div class="rec-name">' + escapeHtml(r.name) + '</div><div class="rec-date">' + fmtDate(r.added_at) + '</div></div><div class="rec-ago">' + timeAgo(r.added_at) + '</div></div>';
      });
      elRec.innerHTML = rhtml + '</div>';
    } else elRec.innerHTML = eHtml('&#129371;', 'Aucune canette ajoutée', 'Commence à ajouter des canettes à ta collection !');
    const seriesMap = {}, langMap = {};
    colItems.forEach((c) => { if (c.series) seriesMap[c.series] = (seriesMap[c.series] || 0) + 1; if (c.language) langMap[c.language] = (langMap[c.language] || 0) + 1; });
    drawPieChart(Object.entries(seriesMap).map((e) => ({ label: e[0], count: e[1] })).sort((a, b) => b.count - a.count), 'chart-series');
    drawPieChart(Object.entries(langMap).map((e) => ({ label: e[0], count: e[1] })).sort((a, b) => b.count - a.count), 'chart-lang');
  }).catch((e) => console.error('loadHome', e));
};

// ════════════════════ CATALOGUE ════════════════════
window.loadCatalogue = function () {
  document.getElementById('cat-ct').innerHTML = lHtml();
  const colIds = new Set(), wlIds = new Set();
  getDocs(query(collection(db, 'collection'), where('uid', '==', user.uid))).then((s) => {
    s.docs.forEach((d) => colIds.add(d.data().can_id));
    return getDocs(query(collection(db, 'wishlist'), where('uid', '==', user.uid)));
  }).then((s) => {
    s.docs.forEach((d) => wlIds.add(d.data().can_id));
    return getDocs(query(collection(db, 'cans'), where('is_published', '==', true)));
  }).then((snap) => {
    allCans = snap.docs.map((d) => Object.assign({ id: d.id }, d.data(), { in_collection: colIds.has(d.id), in_wishlist: wlIds.has(d.id) }));
    allCans.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
    renderSerieChips();
    renderCat(allCans);
  }).catch((e) => { document.getElementById('cat-ct').innerHTML = eHtml('⚠️', 'ERREUR', e.message); });
};
let _catSerie = 'Toutes';
window.setCatSerie = function (serie) { _catSerie = serie; window.filterCans(); };
window.filterCans = function () {
  const q = (document.getElementById('search').value || '').toLowerCase();
  let list = allCans.filter((c) => (c.name || '').toLowerCase().includes(q) || (c.series || '').toLowerCase().includes(q) || (c.variant || '').toLowerCase().includes(q));
  if (_catSerie !== 'Toutes') list = list.filter((c) => (c.series || 'Autres') === _catSerie);
  renderCat(list);
};
function renderSerieChips() {
  const el = document.getElementById('cat-series'); if (!el) return;
  const map = {};
  allCans.forEach((c) => { const sr = c.series || 'Autres'; map[sr] = (map[sr] || 0) + 1; });
  let html = '<button class="schip' + (_catSerie === 'Toutes' ? ' on' : '') + '" onclick="setCatSerie(\'Toutes\')">Toutes (' + allCans.length + ')</button>';
  Object.keys(map).sort((a, b) => a.localeCompare(b, 'fr')).forEach((sr) => {
    html += '<button class="schip' + (_catSerie === sr ? ' on' : '') + '" onclick="setCatSerie(\'' + sr.replace(/'/g, "\\'") + '\')">' + escapeHtml(sr) + ' (' + map[sr] + ')</button>';
  });
  el.innerHTML = html;
}
function renderCat(cans) {
  const el = document.getElementById('cat-ct');
  if (!cans.length) { el.innerHTML = eHtml('&#129371;', 'AUCUNE CANETTE TROUVÉE', 'Aucun résultat.'); return; }
  let html = '<div class="cgrid">';
  cans.forEach((can) => {
    const colBtn = '<button class="cbtn ' + (can.in_collection ? 'on' : '') + '" onclick="event.stopPropagation();toggleCol(\'' + can.id + '\',' + can.in_collection + ')">' + (can.in_collection ? '✓ Possédée' : '+ Collection') + '</button>';
    const wlBtn = '<button class="cbtn wl ' + (can.in_wishlist ? 'on' : '') + '" onclick="event.stopPropagation();toggleWl(\'' + can.id + '\',' + can.in_wishlist + ')">' + (can.in_wishlist ? '♥' : '♡') + ' Wish</button>';
    html += '<div onclick="openCanDetailById(\'' + can.id + '\')">' + canCardHtml(can, colBtn + wlBtn) + '</div>';
  });
  el.innerHTML = html + '</div>';
}
window.openCanDetailById = (id) => openCanDetail(allCans.find((x) => x.id === id));
window.toggleCol = function (id, owned) {
  if (owned) {
    getDocs(query(collection(db, 'collection'), where('uid', '==', user.uid), where('can_id', '==', id))).then((snap) => {
      const b = fbatch(); snap.docs.forEach((d) => b.delete(d.ref)); return b.commit();
    }).then(() => { toast('Retirée ✓'); loadCatalogue(); });
    return;
  }
  const can = allCans.find((x) => x.id === id);
  if (can) openAddColModal(can);
};
function openAddColModal(can) {
  document.getElementById('ac-can-id').value = can.id;
  document.getElementById('ac-can-name').textContent = can.name;
  document.getElementById('ac-price').value = '';
  document.getElementById('ac-purchase-type').value = '';
  ['ac-btn-store', 'ac-btn-online', 'ac-btn-gift'].forEach((bid) => { const b = document.getElementById(bid); if (b) { b.style.background = ''; b.style.color = ''; } });
  document.getElementById('modal-add-col').classList.add('on');
}
window.toggleWl = function (id, inWl) {
  if (inWl) {
    getDocs(query(collection(db, 'wishlist'), where('uid', '==', user.uid), where('can_id', '==', id))).then((snap) => {
      const b = fbatch(); snap.docs.forEach((d) => b.delete(d.ref)); return b.commit();
    }).then(() => { toast('Retirée de la wishlist'); loadCatalogue(); });
  } else {
    addDoc(collection(db, 'wishlist'), { uid: user.uid, can_id: id, added_at: fst() }).then(() => { toast('Ajoutée à la wishlist ♥'); loadCatalogue(); });
  }
};
window.selectPurchase = function (type) {
  document.getElementById('ac-purchase-type').value = type;
  const map = { store: 'ac-btn-store', online: 'ac-btn-online', gift: 'ac-btn-gift' };
  Object.keys(map).forEach((k) => { const b = document.getElementById(map[k]); if (b) { b.style.background = k === type ? 'var(--g)' : ''; b.style.color = k === type ? '#000' : ''; } });
};
window.confirmAddCol = function () {
  const canId = document.getElementById('ac-can-id').value;
  const price = document.getElementById('ac-price').value;
  const pt = document.getElementById('ac-purchase-type').value;
  getDoc(doc(db, 'cans', canId)).then((canDoc) => {
    const cd = canDoc.exists() ? canDoc.data() : {};
    return addDoc(collection(db, 'collection'), {
      uid: user.uid, can_id: canId, name: cd.name || '', series: cd.series || null, variant: cd.variant || null,
      country: cd.country || null, year: cd.year || null, image_url: cd.image_url || null, is_limited: cd.is_limited || false,
      language: cd.language || null, accent_color: cd.accent_color || null,
      price: price ? parseFloat(price) : null, purchase_type: pt || null, added_at: fst(),
    });
  }).then(() => { closeModal('add-col'); toast('Ajoutée à ta collection ✓'); loadCatalogue(); }).catch((e) => toast(e.message, 'err'));
};

// ── Détail ──
function openCanDetail(can) {
  if (!can) return;
  _detailCan = can;
  document.getElementById('cd-title').textContent = can.name;
  document.getElementById('cd-name').textContent = can.name;
  document.getElementById('cd-series').textContent = [can.series, can.variant].filter(Boolean).join(' · ') || '';
  document.getElementById('cd-limited').style.display = can.is_limited ? 'block' : 'none';
  const imgWrap = document.getElementById('cd-img-wrap');
  imgWrap.innerHTML = can.image_url
    ? '<img src="' + escapeHtml(can.image_url) + '" alt="" style="width:160px;height:180px;object-fit:contain;background:' + accentBg(can.accent_color) + '" onerror="this.parentElement.innerHTML=\'&#129371;\'">'
    : "<span style='font-size:60px;'>&#129371;</span>";
  const fields = [{ label: 'Pays', val: can.country }, { label: 'Année', val: can.year }, { label: 'Volume', val: can.volume }, { label: 'Langue', val: can.language }, { label: 'Couleur capsule', val: can.cap_color }, { label: 'Couleur dominante', val: can.full_color }];
  let mh = '';
  fields.forEach((f) => { if (f.val) mh += '<div><span style="color:var(--mu);font-size:11px;text-transform:uppercase;letter-spacing:1px;">' + f.label + '</span><div style="font-weight:700;font-size:13px;margin-top:2px;">' + escapeHtml(f.val) + '</div></div>'; });
  document.getElementById('cd-meta').innerHTML = mh || '<div style="color:var(--mu);font-size:12px;">Pas de métadonnées</div>';
  const descWrap = document.getElementById('cd-desc-wrap');
  if (can.description) { document.getElementById('cd-desc').textContent = can.description; descWrap.style.display = 'block'; }
  else descWrap.style.display = 'none';
  document.getElementById('cd-add-btn').style.display = can.in_collection ? 'none' : 'inline-flex';
  document.getElementById('modal-can-detail').classList.add('on');
}
window.openAddModal = function () { if (_detailCan) { closeModal('can-detail'); openAddColModal(_detailCan); } };

// ════════════════════ MA COLLECTION ════════════════════
window.loadCollection = function () {
  document.getElementById('col-ct').innerHTML = lHtml();
  getDocs(query(collection(db, 'collection'), where('uid', '==', user.uid))).then((colSnap) => {
    const colItems = colSnap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    colItems.sort((a, b) => (tsToDate(b.added_at) || 0) - (tsToDate(a.added_at) || 0));
    const totalValue = colItems.reduce((s, c) => s + (parseFloat(c.price) || 0), 0);
    getDocs(query(collection(db, 'cans'), where('is_published', '==', true))).then((s) => {
      const pct = s.size > 0 ? Math.round((colItems.length / s.size) * 100) : 0;
      document.getElementById('c-owned').textContent = colItems.length;
      document.getElementById('c-total').textContent = s.size;
      document.getElementById('c-pct').textContent = pct + '%';
      document.getElementById('c-value').textContent = totalValue > 0 ? totalValue.toFixed(2) + '€' : '—';
    });
    if (!colItems.length) { document.getElementById('col-ct').innerHTML = eHtml('&#129371;', 'COLLECTION VIDE', 'Va dans le catalogue pour ajouter tes premières canettes !'); return; }
    let html = '<div class="cgrid">';
    colItems.forEach((c) => { html += '<div>' + canCardHtml(c, '<button class="cbtn rm" onclick="removeCol(\'' + c.id + '\')">✕ Retirer</button>') + '</div>'; });
    document.getElementById('col-ct').innerHTML = html + '</div>';
  }).catch((e) => { document.getElementById('col-ct').innerHTML = eHtml('⚠️', 'ERREUR', e.message); });
};
window.removeCol = (docId) => deleteDoc(doc(db, 'collection', docId)).then(() => { toast('Retirée'); loadCollection(); }).catch((e) => toast(e.message, 'err'));

// ════════════════════ AMIS ════════════════════
window.loadFriends = function () {
  document.getElementById('friends-ct').innerHTML = lHtml();
  setErr('friend-err', ''); setOk('friend-ok', '');
  Promise.all([
    getDocs(query(collection(db, 'friends'), where('uid', '==', user.uid), where('status', '==', 'accepted'))),
    getDocs(query(collection(db, 'friend_requests'), where('to_uid', '==', user.uid), where('status', '==', 'pending'))),
    getDocs(query(collection(db, 'chats'), where('participants', 'array-contains', user.uid), limit(500))),
  ]).then((results) => {
    const frSnap = results[0], reqSnap = results[1];
    const myChats = results[2].docs.map((d) => d.data());
    const requests = reqSnap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    const friendUids = frSnap.docs.map((d) => d.data().friendUid);
    const p1 = requests.map((r) => getDoc(doc(db, 'users', r.from_uid)).then((fd) => Object.assign({}, r, { fromName: fd.exists() ? fd.data().username : '?' })));
    const p2 = friendUids.map((uid) => Promise.all([
      getDoc(doc(db, 'users', uid)),
      getDocs(query(collection(db, 'collection'), where('uid', '==', uid))),
    ]).then((res) => {
      if (!res[0].exists()) return null;
      const f = res[0].data();
      const unread = myChats.filter((m) => m.from_uid === uid && m.to_uid === user.uid && !m.read).length;
      return { uid, username: f.username, avatar_url: f.avatar_url, collection_count: res[1].size, unread_count: unread };
    }));
    return Promise.all([Promise.all(p1), Promise.all(p2)]);
  }).then((res) => {
    const enrichedReqs = res[0], friends = res[1].filter(Boolean);
    let html = '';
    if (enrichedReqs.length) {
      html += '<div style="margin-bottom:20px;"><div style="font-family:\'Barlow Condensed\',sans-serif;font-size:10px;font-weight:700;letter-spacing:3px;color:#ff9600;margin-bottom:10px;">DEMANDES REÇUES</div>';
      enrichedReqs.forEach((r) => {
        html += '<div style="background:rgba(255,150,0,.07);border:1px solid rgba(255,150,0,.25);padding:14px;margin-bottom:8px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">'
          + '<div style="width:36px;height:36px;background:var(--c1);border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:\'Bebas Neue\',sans-serif;font-size:18px;color:#ff9600;">' + escapeHtml((r.fromName || '?')[0].toUpperCase()) + '</div>'
          + '<div style="flex:1;min-width:120px;"><div style="font-weight:700;">' + escapeHtml(r.fromName) + '</div><div style="font-size:12px;color:var(--mu);">veut être ton ami</div></div>'
          + '<button class="btn-add" onclick="acceptRequest(\'' + r.id + '\',\'' + r.from_uid + '\')" style="padding:7px 14px;font-size:12px;">✓ Accepter</button>'
          + '<button class="btn-ghost" onclick="rejectRequest(\'' + r.id + '\')" style="padding:7px 14px;font-size:12px;">✕</button></div>';
      });
      html += '</div>';
    }
    if (!friends.length && !enrichedReqs.length) html += eHtml('👥', 'Pas encore d\'amis', 'Recherche des amis par pseudo ci-dessus !');
    else if (friends.length) {
      html += '<div style="font-family:\'Barlow Condensed\',sans-serif;font-size:10px;font-weight:700;letter-spacing:3px;color:var(--mu);margin-bottom:10px;">MES AMIS (' + friends.length + ')</div><div style="display:flex;flex-direction:column;gap:8px;">';
      friends.forEach((f) => {
        const dot = f.unread_count > 0 ? '<span style="background:var(--g);color:#000;border-radius:50%;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;margin-left:4px;">' + f.unread_count + '</span>' : '';
        const safeName = escapeHtml(f.username).replace(/'/g, '&#39;');
        html += '<div style="display:flex;align-items:center;gap:12px;background:var(--c1);border:1px solid var(--br);padding:14px;flex-wrap:wrap;">' + avatarHtml(f, 40)
          + '<div style="flex:1;min-width:120px;"><div class="fr-name">' + escapeHtml(f.username) + dot + '</div><div class="fr-sub">' + f.collection_count + ' canette' + (f.collection_count !== 1 ? 's' : '') + '</div></div>'
          + '<button class="btn-ghost" onclick="openFriendView(\'' + f.uid + '\',\'' + safeName + '\')" style="padding:7px 14px;font-size:12px;">👁 Voir</button>'
          + '<button class="btn-ghost" onclick="openChat(\'' + f.uid + '\',\'' + safeName + '\')" style="padding:7px 14px;font-size:12px;">💬</button>'
          + '<button class="tdel" onclick="removeFriend(\'' + f.uid + '\',\'' + safeName + '\')" style="padding:7px 12px;font-size:12px;">✕</button></div>';
      });
      html += '</div>';
    }
    document.getElementById('friends-ct').innerHTML = html;
  }).catch((e) => { document.getElementById('friends-ct').innerHTML = eHtml('⚠️', 'ERREUR', e.message); });
};
window.friendSearch = function () { clearTimeout(_friendSearchTimer); _friendSearchTimer = setTimeout(doFriendSearch, 400); };
function doFriendSearch() {
  const pseudo = document.getElementById('friend-input').value.trim();
  setErr('friend-err', '');
  const ok = document.getElementById('friend-ok');
  ok.classList.remove('on'); ok.innerHTML = '';
  if (!pseudo) return;
  const _isCode = /^[A-Za-z0-9]{6,10}$/.test(pseudo);
  getDocs(_isCode ? query(collection(db, 'users'), where('user_code', '==', pseudo.toUpperCase())) : query(collection(db, 'users'), where('username', '==', pseudo))).then((snap) => {
    if (snap.empty && _isCode) return getDocs(query(collection(db, 'users'), where('username', '==', pseudo))).then(_friendResult);
    return _friendResult(snap);
  }).catch((e) => setErr('friend-err', e.message));
}
function _friendResult(snap) {
    if (snap.empty) { setErr('friend-err', 'Aucun utilisateur trouvé avec ce pseudo ou ce code ami.'); return; }
    const uDoc = snap.docs[0];
    const u = Object.assign({ uid: uDoc.id }, uDoc.data());
    if (u.uid === user.uid) { setErr('friend-err', 'C\'est toi !'); return; }
    return Promise.all([
      getDocs(query(collection(db, 'friends'), where('uid', '==', user.uid), where('friendUid', '==', u.uid))),
      getDocs(query(collection(db, 'friend_requests'), where('from_uid', '==', user.uid), where('to_uid', '==', u.uid), where('status', '==', 'pending'))),
      getDocs(query(collection(db, 'collection'), where('uid', '==', u.uid))),
    ]).then((res) => {
      if (!res[0].empty) { setErr('friend-err', u.username + ' est déjà ton ami.'); return; }
      let preview = '<div style="background:var(--c1);border:1px solid var(--g);padding:14px;display:flex;align-items:center;gap:12px;margin-top:8px;flex-wrap:wrap;">'
        + '<div style="width:40px;height:40px;background:var(--bk);border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:\'Bebas Neue\',sans-serif;font-size:20px;color:var(--g);">' + escapeHtml(u.username[0].toUpperCase()) + '</div>'
        + '<div style="flex:1;min-width:120px;"><div style="font-weight:700;">' + escapeHtml(u.username) + '</div><div style="font-size:12px;color:var(--mu);">' + res[2].size + ' canette' + (res[2].size !== 1 ? 's' : '') + '</div></div>';
      if (!res[1].empty) preview += '<span style="color:#ff9600;font-size:12px;font-weight:700;">Demande envoyée</span>';
      else preview += '<button class="btn-add" onclick="sendFriendRequest(\'' + u.uid + '\')" style="padding:8px 16px;">+ Envoyer une demande</button>';
      ok.innerHTML = preview + '</div>'; ok.classList.add('on');
    });
}
window.sendFriendRequest = (toUid) => addDoc(collection(db, 'friend_requests'), { from_uid: user.uid, to_uid: toUid, status: 'pending', created_at: fst() }).then(() => { toast('Demande envoyée ✓'); document.getElementById('friend-input').value = ''; document.getElementById('friend-ok').classList.remove('on'); loadFriends(); }).catch((e) => toast(e.message, 'err'));
window.acceptRequest = function (reqId, fromUid) {
  const batch = fbatch();
  batch.update(doc(db, 'friend_requests', reqId), { status: 'accepted' });
  batch.set(doc(collection(db, 'friends')), { uid: user.uid, friendUid: fromUid, status: 'accepted', created_at: fst() });
  batch.set(doc(collection(db, 'friends')), { uid: fromUid, friendUid: user.uid, status: 'accepted', created_at: fst() });
  batch.commit().then(() => { toast('Ami ajouté ✓'); loadFriends(); updateBadges(); }).catch((e) => toast(e.message, 'err'));
};
window.rejectRequest = (reqId) => updateDoc(doc(db, 'friend_requests', reqId), { status: 'rejected' }).then(() => { toast('Demande refusée'); loadFriends(); updateBadges(); });
window.removeFriend = function (friendUid, name) {
  if (!confirm('Retirer ' + name + ' ?')) return;
  Promise.all([
    getDocs(query(collection(db, 'friends'), where('uid', '==', user.uid), where('friendUid', '==', friendUid))),
    getDocs(query(collection(db, 'friends'), where('uid', '==', friendUid), where('friendUid', '==', user.uid))),
  ]).then((res) => { const b = fbatch(); res[0].docs.forEach((d) => b.delete(d.ref)); res[1].docs.forEach((d) => b.delete(d.ref)); return b.commit(); })
    .then(() => { toast('Ami retiré'); loadFriends(); }).catch((e) => toast(e.message, 'err'));
};
window.openFriendView = function (friendUid, friendName) {
  document.querySelectorAll('.sec').forEach((x) => x.classList.remove('on'));
  document.querySelectorAll('.ntab').forEach((x) => x.classList.remove('on'));
  document.getElementById('sec-friend-view').classList.add('on');
  document.getElementById('friend-view-name').textContent = friendName.toUpperCase() + ' — COLLECTION';
  document.getElementById('friend-view-ct').innerHTML = lHtml();
  getDocs(query(collection(db, 'collection'), where('uid', '==', friendUid))).then((snap) => {
    const cans = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    if (!cans.length) { document.getElementById('friend-view-ct').innerHTML = eHtml('&#129371;', 'Collection vide', 'Ton ami n\'a pas encore de canettes !'); return; }
    let html = '<div class="cgrid">';
    cans.forEach((c) => { html += '<div>' + canCardHtml(c, '') + '</div>'; });
    document.getElementById('friend-view-ct').innerHTML = html + '</div>';
  }).catch((e) => { document.getElementById('friend-view-ct').innerHTML = eHtml('⚠️', 'ERREUR', e.message); });
};
window.backFromFriendView = function () { stopChatPoll(); _currentChatFriend = null; goTab('friends', document.getElementById('tab-friends')); };

// ════════════════════ CHAT (rendu sécurisé) ════════════════════
window.openChat = function (friendUid, friendName) {
  _currentChatFriend = { uid: friendUid, name: friendName };
  document.querySelectorAll('.sec').forEach((x) => x.classList.remove('on'));
  document.querySelectorAll('.ntab').forEach((x) => x.classList.remove('on'));
  document.getElementById('sec-chat').classList.add('on');
  document.getElementById('chat-title').textContent = '💬 ' + friendName;
  document.getElementById('chat-msg-inp').value = '';
  loadChatMessages(); startChatPoll(); updateBadges();
};
function loadChatMessages() {
  if (!_currentChatFriend) return;
  // Pas d'orderBy composite : filtre + tri côté client
  getDocs(query(collection(db, 'chats'), where('participants', 'array-contains', user.uid), limit(200))).then((snap) => {
    const msgs = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()))
      .filter((m) => (m.from_uid === user.uid && m.to_uid === _currentChatFriend.uid) || (m.from_uid === _currentChatFriend.uid && m.to_uid === user.uid))
      .sort((a, b) => (tsToDate(a.created_at) || 0) - (tsToDate(b.created_at) || 0));
    const unread = msgs.filter((m) => m.to_uid === user.uid && !m.read);
    if (unread.length) { const b = fbatch(); unread.forEach((m) => b.update(doc(db, 'chats', m.id), { read: true })); b.commit(); }
    const ct = document.getElementById('chat-messages'); if (!ct) return;
    ct.innerHTML = '';
    if (!msgs.length) { ct.innerHTML = '<div style="text-align:center;color:var(--mu);padding:40px;font-size:13px;">Envoie ton premier message !</div>'; return; }
    msgs.forEach((m) => {
      const mine = m.from_uid === user.uid;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:' + (mine ? 'flex-end' : 'flex-start') + ';margin-bottom:10px;';
      if (!mine && m.sender_name) { const who = document.createElement('div'); who.style.cssText = 'font-size:11px;color:var(--mu);margin-bottom:3px;'; who.textContent = m.sender_name; wrap.appendChild(who); }
      const bub = document.createElement('div');
      bub.style.cssText = 'max-width:85%;padding:10px 14px;font-size:13px;border-radius:4px;word-break:break-word;background:' + (mine ? 'var(--g)' : 'var(--c1)') + ';color:' + (mine ? '#000' : 'var(--tx)') + ';';
      bub.textContent = m.content;
      wrap.appendChild(bub);
      const ts = document.createElement('div');
      ts.style.cssText = 'font-size:10px;color:var(--mu);margin-top:3px;';
      const d = tsToDate(m.created_at);
      ts.textContent = d ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
      wrap.appendChild(ts);
      ct.appendChild(wrap);
    });
    ct.scrollTop = ct.scrollHeight;
  }).catch((e) => console.error('chat', e));
}
window.sendChatMsg = function () {
  const inp = document.getElementById('chat-msg-inp');
  const content = inp.value.trim();
  if (!content || !_currentChatFriend) return;
  inp.value = '';
  addDoc(collection(db, 'chats'), { from_uid: user.uid, to_uid: _currentChatFriend.uid, sender_name: user.username, participants: [user.uid, _currentChatFriend.uid], content, read: false, created_at: fst() })
    .then(loadChatMessages).catch((e) => toast(e.message, 'err'));
};
function startChatPoll() { stopChatPoll(); _chatPoll = setInterval(loadChatMessages, 3000); }
function stopChatPoll() { if (_chatPoll) { clearInterval(_chatPoll); _chatPoll = null; } }

// ════════════════════ NOTIFICATIONS ════════════════════
let _viewUpdates = [], _viewReplies = [];
window.loadUpdates = function () {
  document.getElementById('updates-ct').innerHTML = lHtml();
  Promise.all([
    getDocs(query(collection(db, 'updates'), orderBy('created_at', 'desc'))),
    getDocs(query(collection(db, 'messages'), where('uid', '==', user.uid))),
  ]).then((res) => {
    const updates = res[0].docs.map((d) => Object.assign({ id: d.id }, d.data()));
    const replies = res[1].docs.map((d) => Object.assign({ id: d.id }, d.data())).filter((m) => !!m.reply);
    _viewUpdates = updates; _viewReplies = replies;
    let html = '';
    if (replies.length) {
      html += '<div style="margin-bottom:22px;"><div style="font-family:\'Barlow Condensed\',sans-serif;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#4af;margin-bottom:12px;">RÉPONSES À TES MESSAGES</div>';
      replies.forEach((r) => {
        html += '<div style="background:rgba(68,170,255,.07);border:1px solid rgba(68,170,255,.2);padding:18px;margin-bottom:10px;cursor:pointer;" onclick="viewReply(\'' + r.id + '\')">'
          + '<div style="font-size:11px;color:#4af;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">' + escapeHtml(r.category) + '</div>'
          + '<div style="font-size:13px;color:#999;margin-bottom:12px;padding:12px;background:rgba(0,0,0,.3);border-left:3px solid #333;white-space:pre-wrap;word-break:break-word;">' + escapeHtml(r.content) + '</div>';
        if (r.attachment_url) html += '<div style="margin-bottom:12px;"><img src="' + escapeHtml(r.attachment_url) + '" alt="" style="max-width:100%;max-height:300px;object-fit:contain;border:1px solid var(--br);cursor:pointer;" onclick="window.open(this.src)"/></div>';
        html += '<div style="font-size:13px;color:#ddd;white-space:pre-wrap;word-break:break-word;">' + escapeHtml(r.reply) + '</div><div style="font-size:11px;color:var(--mu);margin-top:10px;">Répondu le ' + fmtDate(r.replied_at) + '</div></div>';
      });
      html += '</div>';
    }
    if (updates.length) {
      html += '<div style="font-family:\'Barlow Condensed\',sans-serif;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--mu);margin-bottom:12px;">ANNONCES</div>';
      updates.forEach((u) => { html += '<div class="upd-card" style="margin-bottom:10px;cursor:pointer;" onclick="viewUpdate(\'' + u.id + '\')"><div class="upd-title">' + escapeHtml(u.title) + '</div><div class="upd-content">' + escapeHtml(u.content) + '</div><div class="upd-meta">' + fmtDate(u.created_at) + '</div></div>'; });
    }
    if (!html) html = eHtml('🔔', 'AUCUNE NOTIFICATION', 'Rien de neuf pour le moment.');
    document.getElementById('updates-ct').innerHTML = html;
  }).catch((e) => { document.getElementById('updates-ct').innerHTML = eHtml('⚠️', 'ERREUR', e.message); });
};
window.viewUpdate = function (id) {
  const u = _viewUpdates.find((x) => x.id === id); if (!u) return;
  document.getElementById('mview-title').textContent = u.title || 'ANNONCE';
  document.getElementById('mview-body').innerHTML = '<div style="font-size:11px;color:var(--mu);letter-spacing:2px;text-transform:uppercase;margin-bottom:14px;">Annonce · ' + fmtDate(u.created_at) + '</div>'
    + '<div style="font-size:14px;line-height:1.75;color:var(--tx);white-space:pre-wrap;word-break:break-word;">' + escapeHtml(u.content) + '</div>';
  document.getElementById('modal-view').classList.add('on');
};
window.viewReply = function (id) {
  const r = _viewReplies.find((x) => x.id === id); if (!r) return;
  document.getElementById('mview-title').textContent = 'RÉPONSE — ' + (r.category || '');
  let b = '<div style="font-size:11px;color:var(--mu);letter-spacing:2px;text-transform:uppercase;margin-bottom:14px;">Répondu le ' + fmtDate(r.replied_at) + '</div>';
  b += '<div style="font-size:12px;color:#999;margin-bottom:12px;padding:12px;background:rgba(0,0,0,.3);border-left:3px solid #333;white-space:pre-wrap;word-break:break-word;">' + escapeHtml(r.content) + '</div>';
  if (r.attachment_url) b += '<img src="' + escapeHtml(r.attachment_url) + '" style="max-width:100%;max-height:260px;object-fit:contain;border:1px solid var(--br);margin-bottom:12px;cursor:pointer;" onclick="window.open(this.src)"/>';
  b += '<div style="font-size:14px;line-height:1.7;color:var(--tx);white-space:pre-wrap;word-break:break-word;border-left:3px solid #4af;padding-left:14px;">' + escapeHtml(r.reply) + '</div>';
  document.getElementById('mview-body').innerHTML = b;
  document.getElementById('modal-view').classList.add('on');
};

// ════════════════════ PARAMÈTRES ════════════════════
window.loadSettings = function () {
  document.getElementById('set-name').textContent = (user && user.username) || '';
  document.getElementById('set-user').value = (user && user.username) || '';
  document.getElementById('set-email').value = (user && user.email) || '';
  const scEl = document.getElementById('set-code'); if (scEl) scEl.textContent = (user && user.user_code) || '—';
  const avEl = document.getElementById('avatar-current'); if (avEl) avEl.innerHTML = avatarHtml(user, 64);
  const ap = document.getElementById('avatar-preview'); if (ap) ap.style.display = 'none';
  Promise.all([
    getDocs(query(collection(db, 'favorites'), where('uid', '==', user.uid))),
    getDocs(query(collection(db, 'wishlist'), where('uid', '==', user.uid))),
  ]).then((res) => {
    renderFavSlots(res[0].docs.map((d) => Object.assign({ id: d.id }, d.data())));
    const wlIds = res[1].docs.map((d) => d.data().can_id).slice(0, 3);
    return Promise.all(wlIds.map((id) => getDoc(doc(db, 'cans', id)).then((s) => s.exists() ? Object.assign({ id: s.id }, s.data()) : null)));
  }).then((wlCans) => { if (wlCans) renderWishSlots(wlCans.filter(Boolean)); }).catch((e) => console.error('loadSettings', e));
};
function renderFavSlots(favs) {
  [1, 2, 3].forEach((pos) => {
    const slot = document.getElementById('fav-' + pos);
    const fav = favs.find((f) => f.position === pos);
    if (fav) {
      slot.innerHTML = (fav.image_url ? '<img src="' + escapeHtml(fav.image_url) + '" alt=""/>' : "<span style='font-size:30px;'>&#129371;</span>") + '<div class="fav-ov"><span style="color:#fff;font-size:12px;">✕ Retirer</span></div><div class="fav-nm">' + escapeHtml(fav.name) + '</div>';
      slot.onclick = () => removeFav(fav.id);
    } else {
      slot.innerHTML = '<span class="fav-num">' + pos + '</span><div class="fav-ov"><span style="color:var(--g);font-size:20px;">+</span></div>';
      slot.onclick = () => openPicker('fav', pos);
    }
  });
}
function renderWishSlots(cans) {
  [0, 1, 2].forEach((i) => {
    const slot = document.getElementById('wish-' + (i + 1));
    const c = cans[i];
    if (c) {
      slot.innerHTML = (c.image_url ? '<img src="' + escapeHtml(c.image_url) + '" alt=""/>' : "<span style='font-size:30px;'>&#129371;</span>") + '<div class="fav-ov"><span style="color:#fff;font-size:12px;">✕ Retirer</span></div><div class="fav-nm">' + escapeHtml(c.name) + '</div>';
      slot.onclick = () => { if (confirm('Retirer de la wishlist ?')) toggleWl(c.id, true); };
    } else {
      slot.innerHTML = '<span class="fav-num">' + (i + 1) + '</span><div class="fav-ov"><span style="color:#4af;font-size:20px;">+</span></div>';
      slot.onclick = () => openPicker('wish', i + 1);
    }
  });
}
function removeFav(favDocId) { deleteDoc(doc(db, 'favorites', favDocId)).then(() => { toast('Favori retiré'); loadSettings(); }).catch((e) => toast(e.message, 'err')); }
window.saveProfile = function () {
  setErr('set-err', ''); setOk('set-ok', '');
  const username = document.getElementById('set-user').value.trim();
  updateDoc(doc(db, 'users', user.uid), { username }).then(() => {
    user.username = username;
    document.getElementById('nav-name').textContent = username;
    const nnd2 = document.getElementById('nav-name-drop'); if (nnd2) nnd2.textContent = username;
    document.getElementById('set-name').textContent = username;
    setOk('set-ok', 'Profil mis à jour ✓');
  }).catch((e) => setErr('set-err', e.message));
};
window.savePw = function () {
  setErr('pw-err', ''); setOk('pw-ok', '');
  const np = document.getElementById('pw-new').value;
  updatePassword(auth.currentUser, np).then(() => { setOk('pw-ok', 'Mot de passe mis à jour ✓'); document.getElementById('pw-new').value = ''; }).catch((e) => setErr('pw-err', e.message));
};
window.avatarFileChange = function () {
  const fi = document.getElementById('avatar-file');
  if (fi && fi.files && fi.files[0]) {
    const r = new FileReader();
    r.onload = (e) => { const pr = document.getElementById('avatar-preview'); pr.src = e.target.result; pr.style.display = 'block'; };
    r.readAsDataURL(fi.files[0]);
  }
};
window.saveAvatar = function () {
  const fi = document.getElementById('avatar-file');
  if (!fi || !fi.files || !fi.files[0]) { toast('Sélectionne une image', 'err'); return; }
  const file = fi.files[0];
  if (file.size > 3 * 1024 * 1024) { toast('Image trop lourde (max 3 Mo).', 'err'); return; }
  compressImage(file, 160, 0.8).then((b64) => updateDoc(doc(db, 'users', user.uid), { avatar_url: b64 }).then(() => {
    user.avatar_url = b64;
    document.getElementById('avatar-current').innerHTML = avatarHtml(user, 64);
    fi.value = ''; document.getElementById('avatar-preview').style.display = 'none';
    toast('Photo mise à jour ✓');
  })).catch((e) => toast(e.message, 'err'));
};

// ── Picker ──
window.openPicker = function (type, pos) {
  pickerMode = { type, pos };
  document.getElementById('picker-title').textContent = type === 'fav' ? 'FAVORI #' + pos : 'WISHLIST #' + pos;
  document.getElementById('picker-search').value = '';
  const render = () => { pickerCans = allCans; renderPickerGrid(pickerCans); };
  if (!allCans.length) getDocs(query(collection(db, 'cans'), where('is_published', '==', true))).then((snap) => { allCans = snap.docs.map((d) => Object.assign({ id: d.id }, d.data())); allCans.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr')); render(); });
  else render();
  document.getElementById('modal-picker').classList.add('on');
};
window.filterPicker = function () { const q = document.getElementById('picker-search').value.toLowerCase(); renderPickerGrid(pickerCans.filter((c) => (c.name || '').toLowerCase().includes(q))); };
function renderPickerGrid(cans) {
  document.getElementById('picker-grid').innerHTML = cans.slice(0, 60).map((c) => '<div class="pk-item" onclick="pickCan(\'' + c.id + '\')"><div class="pk-thumb">' + (c.image_url ? '<img src="' + escapeHtml(c.image_url) + '" alt="" onerror="this.parentElement.innerHTML=\'&#129371;\'">' : '&#129371;') + '</div><div class="pk-name">' + escapeHtml(c.name) + '</div></div>').join('');
}
window.pickCan = function (canId) {
  if (!pickerMode) return;
  getDoc(doc(db, 'cans', canId)).then((canDoc) => {
    const cd = canDoc.exists() ? canDoc.data() : {};
    if (pickerMode.type === 'fav') {
      return getDocs(query(collection(db, 'favorites'), where('uid', '==', user.uid), where('position', '==', pickerMode.pos))).then((snap) => {
        const b = fbatch();
        snap.docs.forEach((d) => b.delete(d.ref));
        b.set(doc(collection(db, 'favorites')), { uid: user.uid, can_id: canId, position: pickerMode.pos, name: cd.name, image_url: cd.image_url || null, added_at: fst() });
        return b.commit();
      }).then(() => { toast('Favori mis à jour ✓'); closeModal('picker'); loadSettings(); });
    }
    return addDoc(collection(db, 'wishlist'), { uid: user.uid, can_id: canId, added_at: fst() }).then(() => { toast('Ajoutée à la wishlist ♥'); closeModal('picker'); loadSettings(); loadCatalogue(); });
  }).catch((e) => toast(e.message, 'err'));
};

// ════════════════════ CONTACT ════════════════════
window.goContact = function () {
  document.querySelectorAll('.sec').forEach((x) => x.classList.remove('on'));
  document.querySelectorAll('.ntab').forEach((x) => x.classList.remove('on'));
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
  document.getElementById('cf-pseudo').value = (user && user.username) || '';
  document.getElementById('cf-cat').value = cat;
  document.getElementById('cf-msg').value = '';
  setErr('cf-err', ''); setOk('cf-ok', '');
  document.getElementById('ct-menu').style.display = 'none';
  document.getElementById('ct-form').style.display = 'block';
};
window.ctShowDel = function () {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  _delCode = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  document.getElementById('del-captcha-display').textContent = _delCode;
  document.getElementById('del-captcha-inp').value = '';
  setErr('del-err', '');
  document.getElementById('ct-menu').style.display = 'none';
  document.getElementById('ct-delete').style.display = 'block';
};
window.ctShowLegal = function () {
  document.getElementById('ct-menu').style.display = 'none';
  document.getElementById('ct-legal').style.display = 'block';
};
window.cfFileChange = function () {
  const f = document.getElementById('cf-file'), prev = document.getElementById('cf-preview'), img = document.getElementById('cf-preview-img');
  if (f && f.files && f.files[0]) {
    const r = new FileReader();
    r.onload = (e) => { img.src = e.target.result; prev.style.display = 'block'; };
    r.readAsDataURL(f.files[0]);
  } else prev.style.display = 'none';
};
window.sendContact = function () {
  const msg = document.getElementById('cf-msg').value.trim();
  setErr('cf-err', ''); setOk('cf-ok', '');
  if (!msg) return setErr('cf-err', 'Le message ne peut pas être vide.');
  const fileInput = document.getElementById('cf-file');
  const send = (attachment) => {
    addDoc(collection(db, 'messages'), { uid: user.uid, username: user.username, category: _cfCat, content: msg, attachment_url: attachment || null, reply: null, replied_at: null, created_at: fst() })
      .then(() => {
        setOk('cf-ok', 'Message envoyé ✓ L\'admin te répondra dès que possible.');
        document.getElementById('cf-msg').value = '';
        fileInput.value = ''; document.getElementById('cf-preview').style.display = 'none';
        setTimeout(ctBack, 2500);
      }).catch((e) => setErr('cf-err', e.message));
  };
  if (fileInput.files && fileInput.files[0]) {
    const file = fileInput.files[0];
    if (file.size > 4 * 1024 * 1024) { setErr('cf-err', 'Image trop lourde (max 4 Mo).'); return; }
    compressImage(file, 800, 0.75).then(send).catch((e) => setErr('cf-err', e.message));
  } else send(null);
};
window.confirmDelete = function () {
  const inp = document.getElementById('del-captcha-inp').value.trim().toUpperCase();
  setErr('del-err', '');
  if (inp !== _delCode) return setErr('del-err', 'Code incorrect.');
  const uid = user.uid;
  const colls = ['collection', 'wishlist', 'favorites', 'friends', 'messages'];
  const batch = fbatch();
  const p = colls.map((c) => getDocs(query(collection(db, c), where('uid', '==', uid))).then((snap) => { snap.forEach((d) => batch.delete(d.ref)); }));
  p.push(getDocs(query(collection(db, 'friend_requests'), where('from_uid', '==', uid))).then((s) => { s.forEach((d) => batch.delete(d.ref)); }));
  p.push(getDocs(query(collection(db, 'friend_requests'), where('to_uid', '==', uid))).then((s) => { s.forEach((d) => batch.delete(d.ref)); }));
  p.push(getDocs(query(collection(db, 'chats'), where('participants', 'array-contains', uid))).then((s) => { s.forEach((d) => batch.delete(d.ref)); }));
  p.push(getDocs(query(collection(db, 'friends'), where('friendUid', '==', uid))).then((s) => { s.forEach((d) => batch.delete(d.ref)); }));
  Promise.all(p).then(() => { batch.delete(doc(db, 'users', uid)); return batch.commit(); })
    .then(() => auth.currentUser.delete())
    .then(() => { toast('Compte supprimé.'); go('landing'); })
    .catch((e) => setErr('del-err', e.message));
};

// ════════════════════ ADMIN : CANETTES ════════════════════
window.loadAdmCans = function () {
  document.getElementById('adm-cans-ct').innerHTML = lHtml();
  const q = ((document.getElementById('adm-search') || {}).value || '').toLowerCase();
  getDocs(query(collection(db, 'cans'), orderBy('name'))).then((snap) => {
    let cans = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    const _totEl = document.getElementById('adm-cans-total');
    if (_totEl) { const _np = cans.filter((c) => c.is_published).length; _totEl.textContent = cans.length + ' canette' + (cans.length > 1 ? 's' : '') + ' au total — ' + _np + ' publiée' + (_np > 1 ? 's' : '') + ' · ' + (cans.length - _np) + ' brouillon' + ((cans.length - _np) > 1 ? 's' : ''); }
    if (q) cans = cans.filter((c) => (c.name || '').toLowerCase().includes(q) || (c.series || '').toLowerCase().includes(q));
    if (!cans.length) { document.getElementById('adm-cans-ct').innerHTML = eHtml('&#129371;', 'AUCUNE CANETTE', 'Ajoute ta première canette !'); return; }
    let rows = '';
    cans.forEach((c) => {
      const img = c.image_url ? '<img src="' + escapeHtml(c.image_url) + '" alt="" style="width:40px;height:40px;object-fit:contain;border-radius:3px;" onerror="this.style.display=\'none\'">' : '<div style="width:40px;height:40px;background:var(--br);display:flex;align-items:center;justify-content:center;font-size:18px;">&#129371;</div>';
      const accentDot = c.accent_color ? '<div style="display:inline-block;width:12px;height:12px;border-radius:50%;background:' + escapeHtml(c.accent_color) + ';margin-left:6px;vertical-align:middle;border:1px solid rgba(255,255,255,.2);"></div>' : '';
      const badge = c.is_published ? '<span class="tbadge pub">Publiée</span>' : '<span class="tbadge draft">Brouillon</span>';
      const lim = c.is_limited ? ' <span class="tbadge lim">Limitée</span>' : '';
      const pubBtn = c.is_published ? '<button class="tedit" onclick="publishCan(\'' + c.id + '\',false)">Dépublier</button>' : '<button class="tedit" onclick="publishCan(\'' + c.id + '\',true)">Publier</button>';
      rows += '<tr><td>' + img + '</td><td><div class="tname">' + escapeHtml(c.name) + accentDot + '</div></td><td style="color:var(--mu);font-size:12px;">' + escapeHtml(c.series || '—') + (c.variant ? ' · ' + escapeHtml(c.variant) : '') + lim + '</td><td>' + badge + '</td><td><div class="tacts"><button class="tedit" onclick="openCanModal(\'' + c.id + '\')">Éditer</button>' + pubBtn + '<button class="tdel" onclick="deleteCan(\'' + c.id + '\')">Suppr.</button></div></td></tr>';
    });
    document.getElementById('adm-cans-ct').innerHTML = '<div class="atbl-w"><table class="atbl"><thead><tr><th>Photo</th><th>Nom</th><th>Série</th><th>Statut</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }).catch((e) => { document.getElementById('adm-cans-ct').innerHTML = eHtml('⚠️', 'ERREUR', e.message); });
};
window.openCanModal = function (canId) {
  const setup = (c) => {
    document.getElementById('can-modal-title').textContent = c ? 'MODIFIER LA CANETTE' : 'AJOUTER UNE CANETTE';
    document.getElementById('cm-id').value = (c && c.id) || '';
    const map = { name: 'name', series: 'series', variant: 'variant', lang: 'language', cap: 'cap_color', fc: 'full_color', vol: 'volume', country: 'country', year: 'year', desc: 'description', 'img-url': 'image_url' };
    Object.keys(map).forEach((f) => { document.getElementById('cm-' + f).value = (c && c[map[f]]) || ''; });
    document.getElementById('cm-color').value = (c && c.accent_color) || '#39ff14';
    document.getElementById('cm-limited').checked = !!(c && c.is_limited);
    document.getElementById('cm-img-file').value = '';
    const prev = document.getElementById('img-prev'), lbl = document.getElementById('img-lbl');
    if (c && c.image_url) { prev.src = c.image_url; prev.style.display = 'block'; lbl.style.display = 'none'; }
    else { prev.style.display = 'none'; lbl.style.display = 'block'; }
    document.getElementById('modal-can').classList.add('on');
  };
  if (canId) getDoc(doc(db, 'cans', canId)).then((snap) => setup(snap.exists() ? Object.assign({ id: snap.id }, snap.data()) : null));
  else setup(null);
};
window.handleImgFile = function (input) {
  const file = input.files[0]; if (!file) return;
  if (file.size > 5 * 1024 * 1024) { toast('Image trop lourde (max 5 Mo).', 'err'); input.value = ''; return; }
  compressImage(file, 400, 0.8).then((dataUrl) => {
    const prev = document.getElementById('img-prev'), lbl = document.getElementById('img-lbl');
    prev.src = dataUrl; prev.style.display = 'block'; lbl.style.display = 'none';
    document.getElementById('cm-img-url').value = '';
    input.dataset.compressed = dataUrl;
  });
};
window.previewUrl = function (url) {
  const prev = document.getElementById('img-prev'), lbl = document.getElementById('img-lbl');
  if (url) { prev.src = url; prev.style.display = 'block'; lbl.style.display = 'none'; document.getElementById('cm-img-file').value = ''; }
  else { prev.style.display = 'none'; lbl.style.display = 'block'; }
};
window.saveCan = function () {
  const name = document.getElementById('cm-name').value.trim();
  if (!name) { toast('Nom requis', 'err'); return; }
  const fi = document.getElementById('cm-img-file');
  const imageUrl = (fi.dataset && fi.dataset.compressed) || document.getElementById('cm-img-url').value.trim();
  const body = {
    name, series: document.getElementById('cm-series').value || null, variant: document.getElementById('cm-variant').value || null,
    language: document.getElementById('cm-lang').value || null, cap_color: document.getElementById('cm-cap').value || null,
    full_color: document.getElementById('cm-fc').value || null, volume: document.getElementById('cm-vol').value || null,
    country: document.getElementById('cm-country').value || null,
    year: document.getElementById('cm-year').value ? parseInt(document.getElementById('cm-year').value, 10) : null,
    description: document.getElementById('cm-desc').value || null,
    is_limited: document.getElementById('cm-limited').checked,
    image_url: imageUrl || null,
    accent_color: document.getElementById('cm-color').value || '#39ff14',
    updated_at: fst(),
  };
  const id = document.getElementById('cm-id').value;
  const p = id ? updateDoc(doc(db, 'cans', id), body) : addDoc(collection(db, 'cans'), Object.assign({}, body, { is_published: false, created_at: fst() }));
  p.then(() => { toast(id ? 'Modifiée ✓' : 'Ajoutée (brouillon)'); fi.dataset.compressed = ''; closeModal('can'); loadAdmCans(); }).catch((e) => toast(e.message, 'err'));
};
window.publishCan = (id, pub) => updateDoc(doc(db, 'cans', id), { is_published: pub }).then(() => { toast(pub ? 'Publiée ✓' : 'Dépubliée'); loadAdmCans(); }).catch((e) => toast(e.message, 'err'));
window.deleteCan = (id) => { if (!confirm('Supprimer cette canette ?')) return; deleteDoc(doc(db, 'cans', id)).then(() => { toast('Supprimée ✓'); loadAdmCans(); }).catch((e) => toast(e.message, 'err')); };

// ════════════════════ ADMIN : ANNONCES ════════════════════
window.loadAdmUpdates = function () {
  document.getElementById('adm-updates-ct').innerHTML = lHtml();
  getDocs(query(collection(db, 'updates'), orderBy('created_at', 'desc'))).then((snap) => {
    const upds = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    _viewUpdates = upds;
    if (!upds.length) { document.getElementById('adm-updates-ct').innerHTML = eHtml('📢', 'AUCUNE ANNONCE', 'Crée ta première annonce !'); return; }
    let rows = '';
    upds.forEach((u) => {
      rows += '<tr style="cursor:pointer;" onclick="if(event.target.closest(\'button\'))return;viewUpdate(\'' + u.id + '\')"><td><div class="tname">' + escapeHtml(u.title) + '</div></td><td style="color:var(--mu);font-size:12px;max-width:300px;">' + escapeHtml(u.content.substring(0, 100)) + (u.content.length > 100 ? '...' : '') + '</td><td style="color:var(--mu);font-size:11px;">' + fmtDate(u.created_at) + '</td><td><button class="tdel" onclick="delUpdate(\'' + u.id + '\')">Suppr.</button></td></tr>';
    });
    document.getElementById('adm-updates-ct').innerHTML = '<div class="atbl-w"><table class="atbl"><thead><tr><th>Titre</th><th>Contenu</th><th>Date</th><th>Action</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }).catch((e) => { document.getElementById('adm-updates-ct').innerHTML = eHtml('⚠️', 'ERREUR', e.message); });
};
window.openUpdateModal = function () { document.getElementById('um-title').value = ''; document.getElementById('um-content').value = ''; document.getElementById('modal-update').classList.add('on'); };
window.saveUpdate = function () {
  const t = document.getElementById('um-title').value.trim(), ct = document.getElementById('um-content').value.trim();
  if (!t || !ct) { toast('Titre et contenu requis', 'err'); return; }
  addDoc(collection(db, 'updates'), { title: t, content: ct, created_at: fst() }).then(() => { toast('Annonce publiée ✓'); closeModal('update'); loadAdmUpdates(); }).catch((e) => toast(e.message, 'err'));
};
window.delUpdate = (id) => { if (!confirm('Supprimer cette annonce ?')) return; deleteDoc(doc(db, 'updates', id)).then(() => { toast('Supprimée ✓'); loadAdmUpdates(); }).catch((e) => toast(e.message, 'err')); };

// ════════════════════ ADMIN : UTILISATEURS ════════════════════
window.loadAdmUsers = function () {
  document.getElementById('adm-users-ct').innerHTML = lHtml();
  const q = ((document.getElementById('user-search') || {}).value || '').toLowerCase();
  getDocs(query(collection(db, 'users'), orderBy('username'))).then((snap) => {
    let users = snap.docs.map((d) => Object.assign({ uid: d.id }, d.data()));
    if (q) users = users.filter((u) => (u.username || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
    return Promise.all(users.map((u) => getDocs(query(collection(db, 'collection'), where('uid', '==', u.uid))).then((s) => Object.assign({}, u, { col_count: s.size }))));
  }).then((users) => {
    let rows = '';
    users.forEach((u) => {
      const delBtn = u.role !== 'admin' ? '<button class="tdel" onclick="delUser(\'' + u.uid + '\',\'' + escapeHtml(u.username).replace(/'/g, '&#39;') + '\')">Suppr.</button>' : '—';
      rows += '<tr><td><div style="display:flex;align-items:center;gap:9px;">' + avatarHtml(u, 30) + '<div class="tname">' + escapeHtml(u.username) + '</div></div></td>'
        + '<td style="font-family:monospace;font-size:11px;color:var(--mu);">' + escapeHtml(u.user_code || '—') + '</td>'
        + '<td><span class="tbadge ' + (u.role === 'admin' ? 'lim' : 'std') + '">' + escapeHtml(u.role) + '</span></td>'
        + '<td><span class="tstat">' + u.col_count + '</span></td>'
        + '<td style="color:var(--mu);font-size:11px;">' + fmtDate(u.created_at) + '</td><td>' + delBtn + '</td></tr>';
    });
    document.getElementById('adm-users-ct').innerHTML = '<div class="atbl-w"><table class="atbl"><thead><tr><th>Utilisateur</th><th>Code</th><th>Rôle</th><th>Canettes</th><th>Inscrit le</th><th>Action</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }).catch((e) => { document.getElementById('adm-users-ct').innerHTML = eHtml('⚠️', 'ERREUR', e.message); });
};
window.delUser = function (uid, name) {
  if (!confirm('Supprimer le compte de ' + name + ' et toutes ses données ?')) return;
  const colls = ['collection', 'wishlist', 'favorites', 'messages'];
  const batch = fbatch();
  const p = colls.map((c) => getDocs(query(collection(db, c), where('uid', '==', uid))).then((snap) => { snap.forEach((d) => batch.delete(d.ref)); }));
  p.push(getDocs(query(collection(db, 'friends'), where('uid', '==', uid))).then((s) => { s.forEach((d) => batch.delete(d.ref)); }));
  p.push(getDocs(query(collection(db, 'friends'), where('friendUid', '==', uid))).then((s) => { s.forEach((d) => batch.delete(d.ref)); }));
  p.push(getDocs(query(collection(db, 'friend_requests'), where('from_uid', '==', uid))).then((s) => { s.forEach((d) => batch.delete(d.ref)); }));
  p.push(getDocs(query(collection(db, 'friend_requests'), where('to_uid', '==', uid))).then((s) => { s.forEach((d) => batch.delete(d.ref)); }));
  p.push(getDocs(query(collection(db, 'chats'), where('participants', 'array-contains', uid))).then((s) => { s.forEach((d) => batch.delete(d.ref)); }));
  Promise.all(p).then(() => { batch.delete(doc(db, 'users', uid)); return batch.commit(); })
    .then(() => { toast('Utilisateur supprimé ✓'); loadAdmUsers(); }).catch((e) => toast(e.message, 'err'));
};

// ════════════════════ ADMIN : RÉCEPTION ════════════════════
window.loadAdmInbox = function () {
  document.getElementById('inbox-ct').innerHTML = lHtml();
  getDocs(query(collection(db, 'messages'), orderBy('created_at', 'desc'))).then((snap) => {
    _admMsgs = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    const pending = _admMsgs.filter((m) => !m.reply).length;
    const replied = _admMsgs.filter((m) => m.reply).length;
    const filterHtml = '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">'
      + '<button class="ntab' + (_inboxFilter === 'all' ? ' on' : '') + '" onclick="setInboxFilter(\'all\')" style="flex:0;padding:6px 16px;font-size:12px;height:auto;">Tous (' + _admMsgs.length + ')</button>'
      + '<button class="ntab' + (_inboxFilter === 'pending' ? ' on' : '') + '" onclick="setInboxFilter(\'pending\')" style="flex:0;padding:6px 16px;font-size:12px;height:auto;">En attente (' + pending + ')</button>'
      + '<button class="ntab' + (_inboxFilter === 'replied' ? ' on' : '') + '" onclick="setInboxFilter(\'replied\')" style="flex:0;padding:6px 16px;font-size:12px;height:auto;">Répondus (' + replied + ')</button></div>';
    const filtered = _admMsgs.filter((m) => { if (_inboxFilter === 'pending') return !m.reply; if (_inboxFilter === 'replied') return !!m.reply; return true; });
    if (!filtered.length) { document.getElementById('inbox-ct').innerHTML = filterHtml + eHtml('📭', 'AUCUN MESSAGE', 'Aucun message dans cette catégorie.'); return; }
    const cats = { 'Signaler un bug': '#ff3535', 'Poser une question': '#4af', 'Problème de compte': '#ff9600', 'Suggestion': '#39ff14', 'Canette manquante': '#ffc800', 'Erreur de données': '#ff9600', 'Mot de passe oublié': '#ff3535' };
    let rows = '';
    filtered.forEach((m) => {
      const col = cats[m.category] || '#aaa';
      const rgb = hexToRgb(col);
      const badge = '<span class="tbadge" style="background:rgba(' + rgb + ',0.12);color:' + col + ';border:1px solid ' + col + '44;">' + escapeHtml(m.category) + '</span>';
      const statusBadge = m.reply ? '<span class="tbadge pub">Répondu</span>' : '<span class="tbadge draft">En attente</span>';
      const attachIcon = m.attachment_url ? '<span title="Photo jointe" style="margin-left:4px;font-size:12px;">📎</span>' : '';
      rows += '<tr style="cursor:pointer;" onclick="if(event.target.closest(\'button\'))return;viewMsg(\'' + m.id + '\')"><td><div class="tname">' + escapeHtml(m.username || 'Invité') + '</div></td><td>' + badge + '</td><td style="max-width:220px;font-size:12px;color:#bbb;word-break:break-word;">' + escapeHtml(m.content.substring(0, 80)) + (m.content.length > 80 ? '...' : '') + attachIcon + '</td><td style="color:var(--mu);font-size:11px;white-space:nowrap;">' + fmtDate(m.created_at) + '</td><td>' + statusBadge + '</td><td><div class="tacts"><button class="tedit" onclick="openReply(\'' + m.id + '\')">Répondre</button><button class="tdel" onclick="delMsg(\'' + m.id + '\')">Suppr.</button></div></td></tr>';
    });
    document.getElementById('inbox-ct').innerHTML = filterHtml + '<div class="atbl-w"><table class="atbl"><thead><tr><th>Pseudo</th><th>Objet</th><th>Message</th><th>Date</th><th>Statut</th><th>Action</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }).catch((e) => { document.getElementById('inbox-ct').innerHTML = eHtml('⚠️', 'ERREUR', e.message); });
};
window.setInboxFilter = (f) => { _inboxFilter = f; loadAdmInbox(); };
function forgotEmailTemplate(m, link) {
  const pseudo = (m.username && m.username !== 'Compte bloqué') ? m.username : '(pseudo du compte)';
  const pwLine = link
    ? 'Mot de passe : cliquez sur ce lien pour définir votre nouveau mot de passe :\n' + link
    : 'Mot de passe : un lien sécurisé de réinitialisation vient de vous être envoyé dans un email séparé (objet : « Réinitialisation du mot de passe »). Cliquez sur ce lien pour définir votre nouveau mot de passe.';
  return 'Bonjour,\n\nVous avez demandé la récupération de votre mot de passe pour votre compte sur notre application Monster Tracker.\n\nVoici vos informations de connexion :\n\nPseudo : ' + pseudo + '\nEmail : ' + (m.email || '') + '\n\n' + pwLine + '\n\nVous aurez toujours la possibilité de changer votre mot de passe directement sur l\'application.\n\nSi vous n\'êtes pas à l\'origine de cette demande, vous pouvez ignorer cet email.\n\nMerci d\'utiliser notre application.\n\nL\'équipe administrative.';
}
async function fetchResetLink(email) {
  if (!window.MT_RESET_API) return null;
  try {
    const tok = await auth.currentUser.getIdToken();
    const r = await fetch(window.MT_RESET_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: tok, email }) });
    const j = await r.json();
    return j.link || null;
  } catch (e) { return null; }
}
window.copyForgotCode = function () {
  const c = window._forgotCode || '';
  if (!c) { toast('Code indisponible', 'err'); return; }
  if (navigator.clipboard) navigator.clipboard.writeText(c).then(() => toast('Code copié ✓ Colle-le dans le Support')).catch(() => toast('Copie impossible', 'err'));
  else toast('Copie impossible', 'err');
};
window.copyForgotEmail = async function (id) {
  const m = _admMsgs.find((x) => x.id === id); if (!m) return;
  let link = await fetchResetLink(m.email);
  if (!link) sendPasswordResetEmail(auth, m.email).then(() => toast('Lien officiel envoyé à ' + m.email + ' ✓')).catch(() => {});
  const txt = forgotEmailTemplate(m, link);
  if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast(link ? 'Email type copié AVEC le lien ✓' : 'Email type copié ✓ (joins le logo à l\'envoi)')).catch(() => toast('Copie impossible', 'err'));
  else toast('Copie impossible', 'err');
};
window.mailtoForgot = async function (id) {
  const m = _admMsgs.find((x) => x.id === id); if (!m) return;
  let link = await fetchResetLink(m.email);
  if (!link) sendPasswordResetEmail(auth, m.email).then(() => toast('Lien officiel envoyé à ' + m.email + ' ✓')).catch(() => {});
  location.href = 'mailto:' + encodeURIComponent(m.email || '') + '?subject=' + encodeURIComponent('Récupération de votre mot de passe — Monster Tracker') + '&body=' + encodeURIComponent(forgotEmailTemplate(m, link));
};
window.viewMsg = function (id) {
  const m = _admMsgs.find((x) => x.id === id); if (!m) return;
  document.getElementById('mview-title').textContent = 'MESSAGE — ' + (m.category || '');
  let b = '<div style="font-size:12px;color:var(--mu);margin-bottom:12px;">De <b style="color:var(--tx);">' + escapeHtml(m.username || 'Invité') + '</b> · ' + fmtDate(m.created_at) + '</div>';
  b += '<div style="font-size:14px;line-height:1.7;white-space:pre-wrap;word-break:break-word;background:var(--c1);border:1px solid var(--br);padding:14px;margin-bottom:12px;">' + escapeHtml(m.content) + '</div>';
  if (m.attachment_url) b += '<img src="' + escapeHtml(m.attachment_url) + '" style="max-width:100%;max-height:280px;object-fit:contain;border:1px solid var(--br);margin-bottom:12px;cursor:pointer;" onclick="window.open(this.src)"/>';
  if (m.reply) b += '<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--g);margin-bottom:6px;">Réponse envoyée</div><div style="font-size:13px;line-height:1.6;white-space:pre-wrap;border-left:3px solid var(--g);padding:10px 14px;background:var(--c1);">' + escapeHtml(m.reply) + '</div>';
  if (m.category === 'Mot de passe oublié' && m.email) {
    b += '<div style="margin-top:16px;background:var(--c1);border:1px solid var(--br);padding:14px;">'
      + '<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--mu);margin-bottom:10px;">Compte concerné</div>'
      + '<div style="font-size:13px;margin-bottom:8px;">Pseudo : <b id="forgot-pseudo-val">…</b></div>'
      + '<div style="font-size:13px;margin-bottom:8px;">Email : <b>' + escapeHtml(m.email) + '</b></div>'
      + '<div style="font-size:13px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">Code utilisateur : <code id="forgot-code-val" style="font-family:monospace;font-size:14px;letter-spacing:2px;color:var(--g);">…</code>'
      + '<button class="btn-ghost" style="padding:7px 12px;" onclick="copyForgotCode()">Copier</button></div>'
      + '<div style="font-size:11px;color:var(--mu);margin-top:10px;line-height:1.6;">Copie ce code, ouvre la mini-app SUPPORT et colle-le dans la recherche : la fiche du compte s\'affiche avec le bouton d\'envoi du lien de réinitialisation.</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">'
      + '<button class="btn-o" style="flex:1;min-width:150px;font-size:12px;padding:10px;" onclick="copyForgotEmail(\'' + m.id + '\')">COPIER L\'EMAIL TYPE</button>'
      + '<button class="btn-ghost" style="flex:1;min-width:150px;padding:10px;" onclick="mailtoForgot(\'' + m.id + '\')">OUVRIR DANS MA MESSAGERIE</button></div></div>';
    getDocs(query(collection(db, 'users'), where('email', '==', m.email))).then((snap) => {
      const el = document.getElementById('forgot-code-val');
      if (!el) return;
      if (!snap.empty) {
        const u = snap.docs[0].data();
        const c = u.user_code || '—'; window._forgotCode = c; el.textContent = c;
        const ps = document.getElementById('forgot-pseudo-val'); if (ps) ps.textContent = u.username || '—';
      } else { window._forgotCode = ''; el.textContent = 'compte introuvable'; const ps = document.getElementById('forgot-pseudo-val'); if (ps) ps.textContent = 'compte introuvable'; }
    }).catch(() => {});
  }
  document.getElementById('mview-body').innerHTML = b;
  document.getElementById('modal-view').classList.add('on');
};
window.openReply = function (id) {
  const m = _admMsgs.find((x) => x.id === id);
  if (!m) { toast('Message introuvable', 'err'); return; }
  document.getElementById('reply-id').value = id;
  document.getElementById('reply-meta').textContent = (m.username || 'Invité') + ' — ' + m.category;
  document.getElementById('reply-msg').textContent = m.content;
  const imgEl = document.getElementById('reply-attach');
  if (m.attachment_url) { imgEl.src = m.attachment_url; imgEl.style.display = 'block'; }
  else imgEl.style.display = 'none';
  document.getElementById('reply-txt').value = '';
  document.getElementById('modal-reply').classList.add('on');
};
window.sendReply = function () {
  const id = document.getElementById('reply-id').value;
  const txt = document.getElementById('reply-txt').value.trim();
  if (!txt) { toast('La réponse ne peut pas être vide', 'err'); return; }
  updateDoc(doc(db, 'messages', id), { reply: txt, replied_at: fst() }).then(() => { toast('Réponse envoyée ✓'); closeModal('reply'); loadAdmInbox(); updateBadges(); }).catch((e) => toast(e.message, 'err'));
};
window.delMsg = (id) => { if (!confirm('Supprimer ce message ?')) return; deleteDoc(doc(db, 'messages', id)).then(() => { toast('Message supprimé ✓'); loadAdmInbox(); updateBadges(); }).catch((e) => toast(e.message, 'err')); };

// ════════════════════ ADMIN : RÉGLAGES ════════════════════
window.loadAdmSettings = function () {
  document.getElementById('adm-set-user').value = (user && user.username) || '';
  document.getElementById('adm-set-email').value = (user && user.email) || '';
  loadMaintStatus();
};
window.saveAdmProfile = function () {
  const username = document.getElementById('adm-set-user').value.trim();
  setErr('adm-set-err', ''); setOk('adm-set-ok', '');
  if (!username) return setErr('adm-set-err', 'Le pseudo ne peut pas être vide.');
  updateDoc(doc(db, 'users', user.uid), { username }).then(() => { user.username = username; setOk('adm-set-ok', 'Profil mis à jour ✓'); }).catch((e) => setErr('adm-set-err', e.message));
};
window.saveAdmPassword = function () {
  const np = document.getElementById('adm-pw-new').value, cp = document.getElementById('adm-pw-conf').value;
  setErr('adm-pw-err', ''); setOk('adm-pw-ok', '');
  if (!np) return setErr('adm-pw-err', 'Entre un nouveau mot de passe.');
  if (np !== cp) return setErr('adm-pw-err', 'Les mots de passe ne correspondent pas.');
  updatePassword(auth.currentUser, np).then(() => { setOk('adm-pw-ok', 'Mot de passe changé ✓'); document.getElementById('adm-pw-new').value = ''; document.getElementById('adm-pw-conf').value = ''; }).catch((e) => setErr('adm-pw-err', e.message));
};
window.setMaintenance = function (active) {
  setDoc(doc(db, 'settings', 'maintenance'), { active }).then(() => { toast(active ? '🔴 Maintenance activée' : '🟢 Application relancée'); loadMaintStatus(); }).catch((e) => toast(e.message, 'err'));
};
function loadMaintStatus() {
  getDoc(doc(db, 'settings', 'maintenance')).then((snap) => {
    const active = snap.exists() ? snap.data().active : false;
    document.getElementById('maint-status').innerHTML = active ? '<span style="color:#ff9600;font-weight:700;">⚠ MAINTENANCE ACTIVE</span>' : '<span style="color:var(--g);font-weight:700;">● APPLICATION EN LIGNE</span>';
    document.getElementById('maint-on-btn').style.opacity = active ? '0.4' : '1';
    document.getElementById('maint-off-btn').style.opacity = active ? '1' : '0.4';
  }).catch(() => {});
}

// ── PWA ──
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); _installPrompt = e; const btn = document.getElementById('pwa-install-btn'); if (btn && user) btn.style.display = 'block'; });
window.addEventListener('appinstalled', () => { _installPrompt = null; const btn = document.getElementById('pwa-install-btn'); if (btn) btn.style.display = 'none'; toast('Application installée ✓'); });
window.doInstall = function () {
  if (_installPrompt) { _installPrompt.prompt(); _installPrompt.userChoice.then((r) => { if (r.outcome !== 'accepted') _installPrompt = null; }); }
  else {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    toast(isIOS ? 'Sur iPhone : Partager ⬆ puis « Sur l\'écran d\'accueil ».' : 'Utilise le menu du navigateur : « Installer l\'application ».', 'err');
  }
};

// ── Vérif pseudo dispo à la saisie ──
const _ruEl = document.getElementById('ru');
if (_ruEl) _ruEl.addEventListener('input', () => window.checkPseudo());

// ── Clavier ──
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const a = document.querySelector('.page.active');
  if (!a) return;
  if (a.id === 'page-login' && document.getElementById('forgot-panel').style.display !== 'block') doLogin();
  if (a.id === 'page-register') doRegister();
});

// ── Fermer modales au clic sur le fond ──
document.querySelectorAll('.moverlay').forEach((ov) => ov.addEventListener('click', (e) => { if (e.target === ov) ov.classList.remove('on'); }));

// ── Démarrage : landing par défaut ──
go('landing');

// ════════════════════ BADGE ANNONCES (NOTIFICATIONS) ════════════════════
function updSeenKey() { return 'mt_upd_seen_' + ((user && user.uid) || 'anon'); }
window.updateUpdatesBadge = function () {
  if (!user || !user.uid) return;
  let seen = localStorage.getItem(updSeenKey());
  if (!seen) { seen = new Date().toISOString(); localStorage.setItem(updSeenKey(), seen); }
  getDocs(query(collection(db, 'updates'), orderBy('created_at', 'desc'))).then((s) => {
    let n = 0;
    s.docs.forEach((d) => { const dt = tsToDate(d.data().created_at); if (dt && dt.toISOString() > seen) n++; });
    setBadge('updates-badge', n);
    const bb = document.getElementById('burger-badge');
    if (bb) { bb.textContent = n; bb.style.display = n > 0 ? 'flex' : 'none'; }
  }).catch(() => {});
};
window.copyMyCode = function () {
  const c = (user && user.user_code) || '';
  if (!c) return;
  if (navigator.clipboard) navigator.clipboard.writeText(c).then(() => toast('Code copié ✓')).catch(() => toast('Copie impossible', 'err'));
  else toast(c, 'ok');
};

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
  if (typeof _gt === 'function') window.goTab = function (t, b) {
    _gt(t, b);
    window.closeNavMenu();
    if (t === 'updates') { localStorage.setItem(updSeenKey(), new Date().toISOString()); window.updateUpdatesBadge(); }
  };
})();

// ════════════════════ QR CODE AMI (AJOUT DIRECT) ════════════════════
window.showMyQR = function () {
  const c = (user && user.user_code) || '';
  if (!c) { toast('Code introuvable', 'err'); return; }
  const link = location.origin + location.pathname + '?add=' + encodeURIComponent(c);
  let svg = '<div style="color:var(--rd);font-size:13px;">QR indisponible</div>';
  try {
    const qr = qrcode(0, 'M');
    qr.addData(link);
    qr.make();
    svg = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  } catch (e) { console.error('QR', e); }
  document.getElementById('mview-title').textContent = 'MON QR CODE AMI';
  document.getElementById('mview-body').innerHTML = '<div style="text-align:center;">'
    + '<div style="background:#fff;display:inline-block;padding:16px;width:250px;border:1px solid var(--br);">' + svg + '</div>'
    + '<p style="font-size:13px;color:var(--tx);margin-top:16px;line-height:1.6;">Fais scanner ce QR par un ami : la demande d\'amitié part toute seule.</p>'
    + '<p style="font-size:11px;color:var(--mu);word-break:break-all;margin-top:10px;">' + escapeHtml(link) + '</p></div>';
  document.getElementById('modal-view').classList.add('on');
};
function processPendingAdd() {
  let code = null;
  try { code = sessionStorage.getItem('mt_pending_add'); if (code) sessionStorage.removeItem('mt_pending_add'); } catch (e) {}
  if (!code || !user || !user.uid) return;
  getDocs(query(collection(db, 'users'), where('user_code', '==', code))).then((snap) => {
    if (snap.empty) { toast('Code ami introuvable', 'err'); return; }
    const u = Object.assign({ uid: snap.docs[0].id }, snap.docs[0].data());
    if (u.uid === user.uid) { toast('C\'est ton propre code !', 'err'); return; }
    return getDocs(query(collection(db, 'friends'), where('uid', '==', user.uid), where('friendUid', '==', u.uid))).then((fr) => {
      if (!fr.empty) { toast(u.username + ' est déjà ton ami ✓'); return; }
      // Demande reçue de sa part ? → acceptation directe
      return getDocs(query(collection(db, 'friend_requests'), where('to_uid', '==', user.uid), where('from_uid', '==', u.uid), where('status', '==', 'pending'))).then((inc) => {
        if (!inc.empty) { window.acceptRequest(inc.docs[0].id, u.uid); return; }
        // Demande déjà envoyée ?
        return getDocs(query(collection(db, 'friend_requests'), where('from_uid', '==', user.uid), where('to_uid', '==', u.uid), where('status', '==', 'pending'))).then((out) => {
          if (!out.empty) { toast('Demande déjà envoyée à ' + u.username); return; }
          return addDoc(collection(db, 'friend_requests'), { from_uid: user.uid, to_uid: u.uid, status: 'pending', created_at: fst() })
            .then(() => { toast('Demande d\'ami envoyée à ' + u.username + ' ✓'); updateBadges(); });
        });
      });
    });
  }).catch((e) => toast(e.message, 'err'));
}
