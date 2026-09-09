// ════════════════════════════════════════════════════════════
//  MonsterTracker — Mini-app SUPPORT (réservée à l'admin)
//  Accès : compte admin + code à 6 chiffres (empreinte SHA-256
//  stockée dans Firestore settings/support).
//  Rôle : retrouver un compte par email et envoyer l'email
//  officiel de réinitialisation de mot de passe.
//  ⚠ Les mots de passe ne sont JAMAIS lisibles (hash Firebase).
// ════════════════════════════════════════════════════════════
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const app = initializeApp({
  apiKey: 'AIzaSyAlanpPYiUG8tg0P8prqMjYiHH2QmEqKcc',
  authDomain: 'monstertracker-bymiyuki.firebaseapp.com',
  projectId: 'monstertracker-bymiyuki',
  storageBucket: 'monstertracker-bymiyuki.firebasestorage.app',
  messagingSenderId: '714396226229',
  appId: '1:714396226229:web:9fd3fc50d9396ca7a324fc',
});
const auth = getAuth(app);
const db = getFirestore(app);

let _admin = null;        // utilisateur admin connecté
let _found = null;        // fiche utilisateur trouvée
let _unlocked = false;

// ── Helpers ──
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
function setErr(id, text) { const el = document.getElementById(id); if (el) { el.textContent = text || ''; el.classList.toggle('on', !!text); } }
function setOk(id, text) { const el = document.getElementById(id); if (el) { el.textContent = text || ''; el.classList.toggle('on', !!text); } }
function spShow(name) {
  document.querySelectorAll('.sp-screen').forEach((s) => s.classList.remove('on'));
  document.getElementById('sc-' + name).classList.add('on');
}
window.spShow = spShow;

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Verrou anti brute-force (5 essais, 5 min) ──
const LOCK_KEY = 'mt_support_lock';
function lockState() {
  try { return JSON.parse(localStorage.getItem(LOCK_KEY)) || { fails: 0, until: 0 }; }
  catch (e) { return { fails: 0, until: 0 }; }
}
function lockSave(st) { localStorage.setItem(LOCK_KEY, JSON.stringify(st)); }
function isLocked() { const st = lockState(); return Date.now() < (st.until || 0); }
function lockRemainingMin() { return Math.max(1, Math.ceil(((lockState().until || 0) - Date.now()) / 60000)); }

// ── Écrans selon l'état ──
onAuthStateChanged(auth, async (fbUser) => {
  if (!fbUser) { _admin = null; spShow('login'); return; }
  const snap = await getDoc(doc(db, 'users', fbUser.uid));
  const u = snap.exists() ? Object.assign({ uid: fbUser.uid }, snap.data()) : null;
  if (!u || u.role !== 'admin') { _admin = null; spShow('denied'); return; }
  _admin = u;
  if (_unlocked) { spShow('main'); return; }
  const cfg = await getDoc(doc(db, 'settings', 'support')).catch(() => null);
  if (cfg && cfg.exists() && cfg.data().code_hash) spShow('gate');
  else spShow('setup');
});

// ── Connexion admin ──
window.spLogin = function () {
  setErr('sp-login-err', '');
  const email = document.getElementById('sp-email').value.trim();
  const pw = document.getElementById('sp-pass').value;
  if (!email || !pw) return setErr('sp-login-err', 'Email et mot de passe requis.');
  const btn = document.getElementById('sp-login-btn'); btn.disabled = true;
  signInWithEmailAndPassword(auth, email, pw)
    .catch((e) => { setErr('sp-login-err', e.code === 'auth/invalid-credential' ? 'Identifiants incorrects.' : e.message); })
    .finally(() => { btn.disabled = false; });
};
window.spLogout = function () { signOut(auth).then(() => spShow('login')); };

// ── Création du code (1re fois) ──
window.spSetup = async function () {
  setErr('sp-setup-err', '');
  const c1 = document.getElementById('sp-code1').value.trim();
  const c2 = document.getElementById('sp-code2').value.trim();
  if (!/^\d{6}$/.test(c1)) return setErr('sp-setup-err', 'Le code doit contenir exactement 6 chiffres.');
  if (c1 !== c2) return setErr('sp-setup-err', 'Les deux codes ne correspondent pas.');
  try {
    const hash = await sha256(c1);
    await setDoc(doc(db, 'settings', 'support'), { code_hash: hash, created_at: new Date().toISOString(), created_by: _admin.username });
    toast('Code enregistré ✓');
    _unlocked = true;
    spShow('main');
  } catch (e) {
    setErr('sp-setup-err', 'Erreur d\'enregistrement : ' + e.message);
  }
};

// ── Déverrouillage ──
window.spUnlock = async function () {
  const err = document.getElementById('sp-gate-err');
  setErr('sp-gate-err', '');
  if (isLocked()) return setErr('sp-gate-err', 'Trop de tentatives. Réessaie dans ' + lockRemainingMin() + ' min.');
  const code = document.getElementById('sp-gate-inp').value.trim();
  if (!/^\d{6}$/.test(code)) return setErr('sp-gate-err', '6 chiffres requis.');
  const cfg = await getDoc(doc(db, 'settings', 'support'));
  if (!cfg.exists()) return spShow('setup');
  const hash = await sha256(code);
  if (hash === cfg.data().code_hash) {
    const st = lockState(); st.fails = 0; st.until = 0; lockSave(st);
    _unlocked = true;
    document.getElementById('sp-gate-inp').value = '';
    spShow('main');
    toast('Espace support ouvert ✓');
  } else {
    const st = lockState();
    st.fails = (st.fails || 0) + 1;
    if (st.fails >= 5) { st.until = Date.now() + 5 * 60 * 1000; st.fails = 0; setErr('sp-gate-err', 'Trop de tentatives. Espace verrouillé 5 minutes.'); }
    else setErr('sp-gate-err', 'Code incorrect. Essais restants : ' + (5 - st.fails));
    lockSave(st);
  }
};

// ── Recherche par email ──
window.spSearch = async function () {
  setErr('sp-search-err', '');
  const q = document.getElementById('sp-search').value.trim();
  if (!q) return setErr('sp-search-err', 'Entre une adresse email.');
  let snap = await getDocs(query(collection(db, 'users'), where('email', '==', q)));
  if (snap.empty && q !== q.toLowerCase()) snap = await getDocs(query(collection(db, 'users'), where('email', '==', q.toLowerCase())));
  if (snap.empty) return setErr('sp-search-err', 'Aucun compte inscrit avec cette adresse email.');
  const d = snap.docs[0];
  _found = Object.assign({ uid: d.id }, d.data());
  // Stats
  const [col, wl, fr, fv] = await Promise.all([
    getDocs(query(collection(db, 'collection'), where('uid', '==', _found.uid))),
    getDocs(query(collection(db, 'wishlist'), where('uid', '==', _found.uid))),
    getDocs(query(collection(db, 'friends'), where('uid', '==', _found.uid))),
    getDocs(query(collection(db, 'favorites'), where('uid', '==', _found.uid))),
  ]);
  document.getElementById('sp-u-name').textContent = _found.username || '?';
  document.getElementById('sp-u-email').textContent = _found.email;
  const av = _found.avatar_url
    ? '<img class="sp-lock-row av" src="' + escapeHtml(_found.avatar_url) + '" alt="" style="width:52px;height:52px;border-radius:50%;object-fit:cover;"/>'
    : '<div style="width:52px;height:52px;background:var(--g);border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:\'Bebas Neue\',sans-serif;font-size:24px;color:#000;">' + escapeHtml((_found.username || '?')[0].toUpperCase()) + '</div>';
  document.getElementById('sp-u-avatar').innerHTML = av;
  const joined = _found.created_at ? new Date((_found.created_at.toDate ? _found.created_at.toDate() : new Date(_found.created_at))).toLocaleDateString('fr-FR') : '—';
  document.getElementById('sp-u-stats').innerHTML =
    '<div class="sp-stat"><div class="v">' + escapeHtml(joined) + '</div><div class="l">Inscrit le</div></div>'
    + '<div class="sp-stat"><div class="v">' + escapeHtml(_found.user_code || '—') + '</div><div class="l">Code interne</div></div>'
    + '<div class="sp-stat"><div class="v">' + col.size + '</div><div class="l">Canettes</div></div>'
    + '<div class="sp-stat"><div class="v">' + wl.size + '</div><div class="l">Wishlist</div></div>'
    + '<div class="sp-stat"><div class="v">' + fr.size + '</div><div class="l">Amis</div></div>'
    + '<div class="sp-stat"><div class="v">' + escapeHtml(_found.role || 'user') + '</div><div class="l">Rôle</div></div>';
  setErr('sp-reset-err', ''); setOk('sp-reset-ok', '');
  spShow('user');
};

// ── Email de réinitialisation officiel ──
window.spSendReset = function () {
  setErr('sp-reset-err', ''); setOk('sp-reset-ok', '');
  if (!_found) return;
  sendPasswordResetEmail(auth, _found.email)
    .then(() => setOk('sp-reset-ok', '✓ Email de réinitialisation envoyé à ' + _found.email + '. L\'utilisateur pourra choisir un nouveau mot de passe.'))
    .catch((e) => setErr('sp-reset-err', 'Envoi impossible : ' + e.message));
};
