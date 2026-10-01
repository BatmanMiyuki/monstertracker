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
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

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
// Compte une série de documents sans planter si une règle Firestore refuse
function spCount(nom, champ, val) {
  return getDocs(query(collection(db, nom), where(champ, '==', val)))
    .then((s) => s.size)
    .catch(() => -1);   // -1 = pas autorisé, on l'affiche « — » au lieu de tout casser
}

window.spSearch = async function () {
  setErr('sp-search-err', '');
  const q = document.getElementById('sp-search').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!q) return setErr('sp-search-err', 'Entre un code utilisateur.');
  let snap;
  try {
    snap = await getDocs(query(collection(db, 'users'), where('user_code', '==', q)));
  } catch (e) {
    return setErr('sp-search-err', 'Lecture impossible : ' + (e.message || e));
  }
  if (snap.empty) return setErr('sp-search-err', 'Aucun compte associé à ce code.');
  const d = snap.docs[0];
  _found = Object.assign({ uid: d.id }, d.data());
  // Stats (chaque compteur est indépendant : si l'un est refusé, les autres s'affichent)
  const [col, wl, fr, fv, dr] = await Promise.all([
    spCount('collection', 'uid', _found.uid),
    spCount('wishlist', 'uid', _found.uid),
    spCount('friends', 'uid', _found.uid),
    spCount('favorites', 'uid', _found.uid),
    spCount('drinks', 'uid', _found.uid),
  ]);
  const nb = (n) => (n < 0 ? '—' : n);
  document.getElementById('sp-u-name').textContent = _found.username || '?';
  document.getElementById('sp-u-email').textContent = _found.email;
  const av = _found.avatar_url
    ? '<img class="sp-lock-row av" src="' + escapeHtml(_found.avatar_url) + '" alt="" style="width:52px;height:52px;border-radius:50%;object-fit:cover;"/>'
    : '<div style="width:52px;height:52px;background:var(--g);border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:\'Bebas Neue\',sans-serif;font-size:24px;color:#000;">' + escapeHtml((_found.username || '?')[0].toUpperCase()) + '</div>';
  document.getElementById('sp-u-avatar').innerHTML = av;
  const joined = _found.created_at ? new Date((_found.created_at.toDate ? _found.created_at.toDate() : new Date(_found.created_at))).toLocaleDateString('fr-FR') : '—';
  const nDrinks = dr < 0 ? ((Array.isArray(_found.drinks) ? _found.drinks.length : 0) || 0) : dr;
  document.getElementById('sp-u-stats').innerHTML =
    '<div class="sp-stat"><div class="v">' + escapeHtml(joined) + '</div><div class="l">Inscrit le</div></div>'
    + '<div class="sp-stat"><div class="v">' + escapeHtml(_found.user_code || '—') + '</div><div class="l">Code interne</div></div>'
    + '<div class="sp-stat"><div class="v">' + nb(col) + '</div><div class="l">Canettes</div></div>'
    + '<div class="sp-stat"><div class="v">' + nb(nDrinks) + '</div><div class="l">Canettes bues</div></div>'
    + '<div class="sp-stat"><div class="v">' + nb(wl) + '</div><div class="l">Wishlist</div></div>'
    + '<div class="sp-stat"><div class="v">' + nb(fr) + '</div><div class="l">Amis</div></div>'
    + '<div class="sp-stat"><div class="v">' + nb(fv) + '</div><div class="l">Favoris</div></div>'
    + '<div class="sp-stat"><div class="v">' + escapeHtml(_found.role || 'user') + '</div><div class="l">Rôle</div></div>';
  setErr('sp-reset-err', ''); setOk('sp-reset-ok', '');
  spShow('user');
};

// ── RÉINITIALISER LE COMPTE (remise à zéro complète) ──
// Efface collection, canettes bues, wishlist, favoris, amitiés, demandes d'amis
// et discussions. L'identité (pseudo, email, code, rôle) est conservée.
window.spResetUser = async function () {
  setErr('sp-reset-err', ''); setOk('sp-reset-ok', '');
  if (!_found) return;
  const code = String(_found.user_code || '').toUpperCase();
  const nom = _found.username || 'cet utilisateur';
  const saisie = prompt('RÉINITIALISER LE COMPTE DE « ' + nom + ' »\n\n'
    + 'Tout sera effacé : collection, canettes bues, statistiques, wishlist, favoris et amis.\n'
    + 'Le compte repartira à 0 (le pseudo, l\'email et le mot de passe sont conservés).\n\n'
    + 'Tape son code (' + code + ') pour confirmer :');
  if (saisie === null) return;
  if (String(saisie).trim().toUpperCase() !== code) return setErr('sp-reset-err', 'Code incorrect — rien n\'a été effacé.');
  const btn = document.getElementById('sp-reset-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'RÉINITIALISATION…'; }
  try {
    const cibles = [
      ['collection', 'uid'], ['drinks', 'uid'], ['wishlist', 'uid'], ['favorites', 'uid'],
      ['friends', 'uid'], ['friends', 'friendUid'],
      ['friend_requests', 'from_uid'], ['friend_requests', 'to_uid'],
      // « participants » est un TABLEAU : il faut array-contains, pas ==
      ['chats', 'participants', 'array-contains'],
    ];
    const vus = {}; let total = 0; let refuses = 0;
    for (let i = 0; i < cibles.length; i++) {
      const nomCol = cibles[i][0], champ = cibles[i][1], op = cibles[i][2] || '==';
      let snap;
      try { snap = await getDocs(query(collection(db, nomCol), where(champ, op, _found.uid))); }
      catch (e) { refuses++; continue; }
      const refs = snap.docs.filter((d) => !vus[nomCol + '/' + d.id]).map((d) => { vus[nomCol + '/' + d.id] = 1; return d.ref; });
      for (let k = 0; k < refs.length; k += 400) {
        const b = writeBatch(db);
        refs.slice(k, k + 400).forEach((r) => b.delete(r));
        await b.commit();
      }
      total += refs.length;
    }
    // le compteur de canettes bues rangé dans la fiche utilisateur repart à 0
    await updateDoc(doc(db, 'users', _found.uid), { drinks: [] }).catch(() => null);
    setOk('sp-reset-ok', '✓ Compte de ' + nom + ' réinitialisé : ' + total + ' élément(s) supprimé(s). Il repart à 0.'
      + (refuses ? ' (' + refuses + ' catégorie(s) refusée(s) par les règles Firestore)' : ''));
    toast('Compte réinitialisé ✓');
    await spSearch();
    setOk('sp-reset-ok', '✓ Compte de ' + nom + ' réinitialisé : ' + total + ' élément(s) supprimé(s). Il repart à 0.');
  } catch (e) {
    setErr('sp-reset-err', 'Réinitialisation impossible : ' + (e.message || e));
  } finally {
    const b2 = document.getElementById('sp-reset-btn');
    if (b2) { b2.disabled = false; b2.textContent = '⟳ RÉINITIALISER LE COMPTE'; }
  }
};

// ── Email de réinitialisation officiel ──
window.spSendReset = function () {
  setErr('sp-reset-err', ''); setOk('sp-reset-ok', '');
  if (!_found) return;
  sendPasswordResetEmail(auth, _found.email)
    .then(() => setOk('sp-reset-ok', '✓ Email de réinitialisation envoyé à ' + _found.email + '. L\'utilisateur pourra choisir un nouveau mot de passe.'))
    .catch((e) => setErr('sp-reset-err', 'Envoi impossible : ' + e.message));
};
