// ════════════════════════════════════════════════════════════
//  MonsterTracker — Serveur Express (API REST + fichiers statiques)
//  Auth : sessions en base + cookie httpOnly, mots de passe bcrypt
// ════════════════════════════════════════════════════════════
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { db, getSetting, setSetting } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// ── Upload d'images (avatars, canettes, pièces jointes) ──
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, crypto.randomBytes(12).toString('hex') + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Format non supporté (JPG, PNG, WEBP, GIF uniquement)'));
  },
});

// ── Rate limiting simple (anti brute-force sur l'auth) ──
const authHits = new Map();
function rateLimitAuth(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const rec = authHits.get(ip) || { count: 0, reset: now + 10 * 60 * 1000 };
  if (now > rec.reset) { rec.count = 0; rec.reset = now + 10 * 60 * 1000; }
  rec.count++;
  authHits.set(ip, rec);
  if (rec.count > 40) return res.status(429).json({ error: 'Trop de tentatives. Réessaie dans quelques minutes.' });
  next();
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of authHits) if (now > rec.reset) authHits.delete(ip);
}, 60 * 1000).unref();

// ── Utilitaires ──
const nowIso = () => new Date().toISOString();
function newToken() { return crypto.randomBytes(24).toString('hex'); }
function newUserCode() { return crypto.randomBytes(4).toString('hex').toUpperCase(); }
function clean(str, max = 200) { return String(str || '').trim().slice(0, max); }
function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }

const publicUser = (u) => u && ({
  id: u.id, username: u.username, email: u.email, role: u.role,
  theme: u.theme, avatar_url: u.avatar_url, user_code: u.user_code, created_at: u.created_at,
});

// ── Auth middleware ──
function getSessionUser(req) {
  const token = req.cookies && req.cookies.mt_sid;
  if (!token) return null;
  const sess = db.prepare(`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?
  `).get(token, nowIso());
  return sess || null;
}
function requireAuth(req, res, next) {
  const u = getSessionUser(req);
  if (!u) return res.status(401).json({ error: 'Session expirée. Reconnecte-toi.' });
  req.user = u;
  next();
}
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès réservé à l’administrateur.' });
    next();
  });
}
// Mode maintenance : bloque l'API pour les non-admins
function maintenanceGate(req, res, next) {
  if (getSetting('maintenance') === '1') {
    const u = getSessionUser(req);
    if (!u || u.role !== 'admin') {
      return res.status(503).json({ error: 'Maintenance en cours', maintenance: true });
    }
  }
  next();
}

function setSessionCookie(res, token) {
  res.cookie('mt_sid', token, {
    httpOnly: true, sameSite: 'lax', secure: false,
    maxAge: 30 * 24 * 3600 * 1000,
  });
}
function createSession(res, userId) {
  const token = newToken();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, userId, new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString());
  setSessionCookie(res, token);
}

// ════════════════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════════════════
app.post('/api/auth/register', rateLimitAuth, (req, res) => {
  const username = clean(req.body.username, 24);
  const email = clean(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || '');
  if (!username || username.length < 3) return res.status(400).json({ error: 'Pseudo : 3 caractères minimum.' });
  if (!/^[a-zA-Z0-9_.\-]+$/.test(username)) return res.status(400).json({ error: 'Pseudo : lettres, chiffres, - _ . uniquement.' });
  if (!isEmail(email)) return res.status(400).json({ error: 'Adresse email invalide.' });
  if (password.length < 6) return res.status(400).json({ error: 'Mot de passe : 6 caractères minimum.' });
  const exists = db.prepare('SELECT id, username, email FROM users WHERE username = ? OR email = ?').get(username, email);
  if (exists) {
    return res.status(409).json({ error: exists.email === email ? 'Cet email est déjà utilisé.' : 'Ce pseudo est déjà pris.' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (username, email, password_hash, user_code) VALUES (?, ?, ?, ?)')
    .run(username, email, hash, newUserCode());
  createSession(res, info.lastInsertRowid);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.json({ user: publicUser(u) });
});

app.post('/api/auth/login', rateLimitAuth, (req, res) => {
  const email = clean(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis.' });
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!u || !bcrypt.compareSync(password, u.password_hash)) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
  }
  createSession(res, u.id);
  res.json({ user: publicUser(u) });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies && req.cookies.mt_sid;
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie('mt_sid');
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const u = getSessionUser(req);
  if (!u) return res.status(401).json({ error: 'Non connecté' });
  res.json({
    user: publicUser(u),
    maintenance: getSetting('maintenance') === '1' && u.role !== 'admin',
  });
});

// ── Vérification de pseudo (public, pour l'inscription) ──
app.get('/api/public/check-username', rateLimitAuth, (req, res) => {
  const q = clean(req.query.q, 24);
  if (!q) return res.json({ taken: false });
  const row = db.prepare('SELECT id FROM users WHERE username = ?').get(q);
  res.json({ taken: !!row });
});

// ════════════════════════════════════════════════════════
//  API (protégée + maintenance)
// ════════════════════════════════════════════════════════
const api = express.Router();
api.use(requireAuth, maintenanceGate);

// ── Upload générique d'image ──
api.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
  res.json({ url: '/uploads/' + req.file.filename });
});

// ── Profil ──
api.patch('/me', (req, res) => {
  const { username, theme, password } = req.body;
  if (username !== undefined) {
    const u = clean(username, 24);
    if (u.length < 3) return res.status(400).json({ error: 'Pseudo : 3 caractères minimum.' });
    if (!/^[a-zA-Z0-9_.\-]+$/.test(u)) return res.status(400).json({ error: 'Caractères non autorisés dans le pseudo.' });
    const clash = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(u, req.user.id);
    if (clash) return res.status(409).json({ error: 'Ce pseudo est déjà pris.' });
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(u, req.user.id);
  }
  if (theme !== undefined && ['dark', 'green', 'red', 'blue'].includes(theme)) {
    db.prepare('UPDATE users SET theme = ? WHERE id = ?').run(theme, req.user.id);
  }
  if (password !== undefined) {
    const p = String(password);
    if (p.length < 6) return res.status(400).json({ error: 'Mot de passe : 6 caractères minimum.' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(p, 10), req.user.id);
  }
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(u) });
});

api.post('/me/avatar', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
  if (req.file.size > 3 * 1024 * 1024) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Image trop lourde (max 3 Mo).' });
  }
  const url = '/uploads/' + req.file.filename;
  const old = req.user.avatar_url;
  db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(url, req.user.id);
  if (old && old.startsWith('/uploads/')) fs.unlink(path.join(UPLOAD_DIR, path.basename(old)), () => {});
  res.json({ avatar_url: url });
});

// Suppression de compte : code généré côté serveur
api.post('/me/delete-code', (req, res) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[crypto.randomInt(chars.length)];
  db.prepare('UPDATE users SET delete_code = ? WHERE id = ?').run(code, req.user.id);
  res.json({ code });
});

api.delete('/me', (req, res) => {
  const code = clean(req.body && req.body.code, 6).toUpperCase();
  if (!req.user.delete_code || code !== req.user.delete_code) {
    return res.status(400).json({ error: 'Code de confirmation incorrect.' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id); // cascade
  res.clearCookie('mt_sid');
  res.json({ ok: true });
});

// ── Dashboard ──
api.get('/dashboard', (req, res) => {
  const uid = req.user.id;
  const stats = db.prepare(`
    SELECT COUNT(*) AS owned, COALESCE(SUM(price), 0) AS value
    FROM collection_items WHERE user_id = ?
  `).get(uid);
  const totalCans = db.prepare('SELECT COUNT(*) AS n FROM cans WHERE is_published = 1').get().n;
  const friends = db.prepare('SELECT COUNT(*) AS n FROM friends WHERE user_id = ?').get(uid).n;
  const recent = db.prepare(`
    SELECT ci.id, ci.added_at, ci.price, c.name, c.series, c.image_url, c.accent_color, c.is_limited
    FROM collection_items ci JOIN cans c ON c.id = ci.can_id
    WHERE ci.user_id = ? ORDER BY ci.added_at DESC LIMIT 5
  `).all(uid);
  const bySeries = db.prepare(`
    SELECT c.series AS label, COUNT(*) AS count
    FROM collection_items ci JOIN cans c ON c.id = ci.can_id
    WHERE ci.user_id = ? AND c.series IS NOT NULL AND c.series != ''
    GROUP BY c.series ORDER BY count DESC LIMIT 8
  `).all(uid);
  const byLang = db.prepare(`
    SELECT c.language AS label, COUNT(*) AS count
    FROM collection_items ci JOIN cans c ON c.id = ci.can_id
    WHERE ci.user_id = ? AND c.language IS NOT NULL AND c.language != ''
    GROUP BY c.language ORDER BY count DESC LIMIT 8
  `).all(uid);
  const friendsList = db.prepare(`
    SELECT u.id, u.username, u.avatar_url FROM friends f JOIN users u ON u.id = f.friend_id
    WHERE f.user_id = ? ORDER BY u.username LIMIT 5
  `).all(uid);
  res.json({
    owned: stats.owned, value: stats.value, totalCans, friends,
    pct: totalCans ? Math.round((stats.owned / totalCans) * 100) : 0,
    recent, bySeries, byLang, friendsList,
  });
});

// ── Catalogue ──
api.get('/cans', (req, res) => {
  const uid = req.user.id;
  const cans = db.prepare('SELECT * FROM cans WHERE is_published = 1 ORDER BY name COLLATE NOCASE').all()
    .map(c => ({ ...c, is_limited: !!c.is_limited, is_published: !!c.is_published }));
  const colIds = new Set(db.prepare('SELECT can_id FROM collection_items WHERE user_id = ?').all(uid).map(r => r.can_id));
  const wlIds = new Set(db.prepare('SELECT can_id FROM wishlist WHERE user_id = ?').all(uid).map(r => r.can_id));
  cans.forEach(c => { c.in_collection = colIds.has(c.id); c.in_wishlist = wlIds.has(c.id); });
  res.json({ cans });
});

api.get('/cans/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM cans WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Canette introuvable.' });
  res.json({ can: { ...c, is_limited: !!c.is_limited } });
});

// ── Ma collection ──
api.get('/collection', (req, res) => {
  const items = db.prepare(`
    SELECT ci.id, ci.can_id, ci.price, ci.purchase_type, ci.added_at,
           c.name, c.series, c.variant, c.country, c.year, c.language,
           c.image_url, c.accent_color, c.is_limited
    FROM collection_items ci JOIN cans c ON c.id = ci.can_id
    WHERE ci.user_id = ? ORDER BY ci.added_at DESC
  `).all(req.user.id).map(r => ({ ...r, is_limited: !!r.is_limited }));
  const totalCans = db.prepare('SELECT COUNT(*) AS n FROM cans WHERE is_published = 1').get().n;
  res.json({ items, totalCans });
});

api.post('/collection', (req, res) => {
  const canId = parseInt(req.body.can_id, 10);
  const can = db.prepare('SELECT * FROM cans WHERE id = ? AND is_published = 1').get(canId);
  if (!can) return res.status(404).json({ error: 'Canette introuvable.' });
  const price = req.body.price !== null && req.body.price !== undefined && req.body.price !== ''
    ? Math.max(0, Math.min(100000, parseFloat(req.body.price) || 0)) : null;
  const purchase = ['store', 'online', 'gift'].includes(req.body.purchase_type) ? req.body.purchase_type : null;
  try {
    const info = db.prepare('INSERT INTO collection_items (user_id, can_id, price, purchase_type) VALUES (?, ?, ?, ?)')
      .run(req.user.id, canId, price, purchase);
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Cette canette est déjà dans ta collection.' });
    throw e;
  }
});

api.delete('/collection/:canId', (req, res) => {
  db.prepare('DELETE FROM collection_items WHERE user_id = ? AND can_id = ?').run(req.user.id, req.params.canId);
  res.json({ ok: true });
});

// Collection d'un ami
api.get('/users/:id/collection', (req, res) => {
  const fid = parseInt(req.params.id, 10);
  const isFriend = db.prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?').get(req.user.id, fid);
  if (!isFriend) return res.status(403).json({ error: 'Cette collection est privée.' });
  const items = db.prepare(`
    SELECT ci.id, ci.price, ci.added_at, c.name, c.series, c.variant, c.country, c.year,
           c.image_url, c.accent_color, c.is_limited
    FROM collection_items ci JOIN cans c ON c.id = ci.can_id
    WHERE ci.user_id = ? ORDER BY ci.added_at DESC
  `).all(fid).map(r => ({ ...r, is_limited: !!r.is_limited }));
  const u = db.prepare('SELECT username FROM users WHERE id = ?').get(fid);
  res.json({ items, username: u ? u.username : '?' });
});

// ── Wishlist ──
api.get('/wishlist', (req, res) => {
  const items = db.prepare(`
    SELECT w.can_id, w.added_at, c.name, c.image_url, c.accent_color, c.is_limited
    FROM wishlist w JOIN cans c ON c.id = w.can_id
    WHERE w.user_id = ? ORDER BY w.added_at ASC LIMIT 3
  `).all(req.user.id);
  res.json({ items });
});

api.post('/wishlist', (req, res) => {
  const canId = parseInt(req.body.can_id, 10);
  const can = db.prepare('SELECT id FROM cans WHERE id = ?').get(canId);
  if (!can) return res.status(404).json({ error: 'Canette introuvable.' });
  db.prepare('INSERT OR IGNORE INTO wishlist (user_id, can_id) VALUES (?, ?)').run(req.user.id, canId);
  res.json({ ok: true });
});

api.delete('/wishlist/:canId', (req, res) => {
  db.prepare('DELETE FROM wishlist WHERE user_id = ? AND can_id = ?').run(req.user.id, req.params.canId);
  res.json({ ok: true });
});

// ── Favoris (3 slots) ──
api.get('/favorites', (req, res) => {
  const favs = db.prepare(`
    SELECT f.position, f.can_id, c.name, c.image_url, c.accent_color, c.is_limited
    FROM favorites f JOIN cans c ON c.id = f.can_id WHERE f.user_id = ?
  `).all(req.user.id);
  res.json({ favorites: favs });
});

api.put('/favorites/:position', (req, res) => {
  const pos = parseInt(req.params.position, 10);
  if (![1, 2, 3].includes(pos)) return res.status(400).json({ error: 'Position invalide.' });
  const canId = parseInt(req.body.can_id, 10);
  const can = db.prepare('SELECT id FROM cans WHERE id = ?').get(canId);
  if (!can) return res.status(404).json({ error: 'Canette introuvable.' });
  db.prepare(`INSERT INTO favorites (user_id, can_id, position) VALUES (?, ?, ?)
              ON CONFLICT(user_id, position) DO UPDATE SET can_id = excluded.can_id, added_at = datetime('now')`)
    .run(req.user.id, canId, pos);
  res.json({ ok: true });
});

api.delete('/favorites/:position', (req, res) => {
  db.prepare('DELETE FROM favorites WHERE user_id = ? AND position = ?').run(req.user.id, req.params.position);
  res.json({ ok: true });
});

// ── Amis ──
api.get('/users/search', (req, res) => {
  const q = clean(req.query.q, 24);
  if (!q) return res.json({ users: [] });
  const users = db.prepare(`
    SELECT id, username, avatar_url FROM users
    WHERE username LIKE ? AND id != ? AND role != 'admin' ORDER BY username LIMIT 10
  `).all('%' + q + '%', req.user.id);
  const results = users.map(u => {
    const isFriend = !!db.prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?').get(req.user.id, u.id);
    const pending = !!db.prepare(`SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'`).get(req.user.id, u.id);
    const count = db.prepare('SELECT COUNT(*) AS n FROM collection_items WHERE user_id = ?').get(u.id).n;
    return { ...u, isFriend, pending, collection_count: count };
  });
  res.json({ users: results });
});

api.get('/friends', (req, res) => {
  const uid = req.user.id;
  const requests = db.prepare(`
    SELECT fr.id, fr.from_id, u.username, u.avatar_url
    FROM friend_requests fr JOIN users u ON u.id = fr.from_id
    WHERE fr.to_id = ? AND fr.status = 'pending' ORDER BY fr.created_at DESC
  `).all(uid);
  const friends = db.prepare(`
    SELECT u.id, u.username, u.avatar_url,
      (SELECT COUNT(*) FROM collection_items ci WHERE ci.user_id = u.id) AS collection_count,
      (SELECT COUNT(*) FROM chats m WHERE m.to_id = ? AND m.from_id = u.id AND m.read = 0) AS unread_count
    FROM friends f JOIN users u ON u.id = f.friend_id
    WHERE f.user_id = ? ORDER BY u.username
  `).all(uid, uid);
  res.json({ requests, friends });
});

api.post('/friend-requests', (req, res) => {
  const toUsername = clean(req.body.username, 24);
  const target = db.prepare('SELECT * FROM users WHERE username = ?').get(toUsername);
  if (!target || target.role === 'admin') return res.status(404).json({ error: 'Aucun utilisateur trouvé avec ce pseudo.' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'C’est toi !' });
  if (db.prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?').get(req.user.id, target.id)) {
    return res.status(409).json({ error: target.username + ' est déjà ton ami.' });
  }
  const pending = db.prepare(`SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'`).get(req.user.id, target.id);
  if (pending) return res.status(409).json({ error: 'Demande déjà envoyée.' });
  // Demande inverse en attente → accepter directement
  const reverse = db.prepare(`SELECT id FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'`).get(target.id, req.user.id);
  if (reverse) {
    const tx = db.transaction(() => {
      db.prepare(`UPDATE friend_requests SET status = 'accepted' WHERE id = ?`).run(reverse.id);
      db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?, ?), (?, ?)')
        .run(req.user.id, target.id, target.id, req.user.id);
    });
    tx();
    return res.json({ ok: true, autoAccepted: true });
  }
  db.prepare('INSERT INTO friend_requests (from_id, to_id) VALUES (?, ?)').run(req.user.id, target.id);
  res.json({ ok: true });
});

api.post('/friend-requests/:id/accept', (req, res) => {
  const r = db.prepare(`SELECT * FROM friend_requests WHERE id = ? AND to_id = ? AND status = 'pending'`).get(req.params.id, req.user.id);
  if (!r) return res.status(404).json({ error: 'Demande introuvable.' });
  const tx = db.transaction(() => {
    db.prepare(`UPDATE friend_requests SET status = 'accepted' WHERE id = ?`).run(r.id);
    db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?, ?), (?, ?)')
      .run(req.user.id, r.from_id, r.from_id, req.user.id);
  });
  tx();
  res.json({ ok: true });
});

api.post('/friend-requests/:id/reject', (req, res) => {
  db.prepare(`UPDATE friend_requests SET status = 'rejected' WHERE id = ? AND to_id = ?`).run(req.params.id, req.user.id);
  res.json({ ok: true });
});

api.delete('/friends/:id', (req, res) => {
  const fid = parseInt(req.params.id, 10);
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)')
      .run(req.user.id, fid, fid, req.user.id);
    db.prepare('DELETE FROM chats WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)')
      .run(req.user.id, fid, fid, req.user.id);
  });
  tx();
  res.json({ ok: true });
});

// ── Chat ──
api.get('/chats/:friendId', (req, res) => {
  const fid = parseInt(req.params.friendId, 10);
  const isFriend = db.prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?').get(req.user.id, fid);
  if (!isFriend) return res.status(403).json({ error: 'Vous n’êtes pas amis.' });
  const msgs = db.prepare(`
    SELECT * FROM chats
    WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)
    ORDER BY created_at ASC, id ASC LIMIT 200
  `).all(req.user.id, fid, fid, req.user.id);
  db.prepare('UPDATE chats SET read = 1 WHERE to_id = ? AND from_id = ? AND read = 0').run(req.user.id, fid);
  res.json({ messages: msgs.map(m => ({ ...m, mine: m.from_id === req.user.id, read: !!m.read })) });
});

api.post('/chats/:friendId', (req, res) => {
  const fid = parseInt(req.params.friendId, 10);
  const content = clean(req.body.content, 1000);
  if (!content) return res.status(400).json({ error: 'Message vide.' });
  const isFriend = db.prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?').get(req.user.id, fid);
  if (!isFriend) return res.status(403).json({ error: 'Vous n’êtes pas amis.' });
  db.prepare('INSERT INTO chats (from_id, to_id, sender_name, content) VALUES (?, ?, ?, ?)')
    .run(req.user.id, fid, req.user.username, content);
  res.json({ ok: true });
});

// ── Badges (requêtes légères pour le polling) ──
api.get('/badges', (req, res) => {
  const uid = req.user.id;
  const friendRequests = db.prepare(`SELECT COUNT(*) AS n FROM friend_requests WHERE to_id = ? AND status = 'pending'`).get(uid).n;
  const unreadChats = db.prepare('SELECT COUNT(*) AS n FROM chats WHERE to_id = ? AND read = 0').get(uid).n;
  const messageReplies = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND reply IS NOT NULL').get(uid).n;
  let inboxPending = 0;
  if (req.user.role === 'admin') {
    inboxPending = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE reply IS NULL').get().n;
  }
  res.json({ friendRequests, unreadChats, messageReplies, inboxPending });
});

// ── Notifications utilisateur ──
api.get('/updates', (req, res) => {
  const updates = db.prepare('SELECT * FROM updates ORDER BY created_at DESC LIMIT 30').all();
  const replies = db.prepare(`
    SELECT id, category, content, attachment_url, reply, replied_at FROM messages
    WHERE user_id = ? AND reply IS NOT NULL ORDER BY replied_at DESC LIMIT 20
  `).all(req.user.id);
  res.json({ updates, replies });
});

// ── Contact ──
api.post('/messages', (req, res) => {
  const category = clean(req.body.category, 60);
  const content = clean(req.body.content, 5000);
  const attachment = clean(req.body.attachment_url, 300);
  if (!content) return res.status(400).json({ error: 'Le message ne peut pas être vide.' });
  db.prepare('INSERT INTO messages (user_id, username, category, content, attachment_url) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, req.user.username, category || 'Message', content, attachment || null);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════
//  ADMIN
// ════════════════════════════════════════════════════════
const admin = express.Router();
admin.use(requireAdmin);

admin.get('/cans', (req, res) => {
  const q = clean(req.query.q, 60).toLowerCase();
  let cans = db.prepare('SELECT * FROM cans ORDER BY name COLLATE NOCASE').all();
  if (q) cans = cans.filter(c => (c.name || '').toLowerCase().includes(q) || (c.series || '').toLowerCase().includes(q));
  const counts = {};
  db.prepare('SELECT can_id, COUNT(*) AS n FROM collection_items GROUP BY can_id').all()
    .forEach(r => { counts[r.can_id] = r.n; });
  cans.forEach(c => { c.owned_count = counts[c.id] || 0; c.is_limited = !!c.is_limited; c.is_published = !!c.is_published; });
  res.json({ cans });
});

function canBody(b) {
  return {
    name: clean(b.name, 120),
    series: clean(b.series, 80) || null,
    variant: clean(b.variant, 80) || null,
    language: clean(b.language, 30) || null,
    cap_color: clean(b.cap_color, 40) || null,
    full_color: clean(b.full_color, 40) || null,
    volume: clean(b.volume, 30) || null,
    country: clean(b.country, 60) || null,
    year: b.year ? Math.min(2100, Math.max(1900, parseInt(b.year, 10) || null)) : null,
    description: clean(b.description, 2000) || null,
    is_limited: b.is_limited ? 1 : 0,
    image_url: clean(b.image_url, 500) || null,
    accent_color: /^#[0-9a-fA-F]{6}$/.test(b.accent_color || '') ? b.accent_color : null,
  };
}

admin.post('/cans', (req, res) => {
  const b = canBody(req.body);
  if (!b.name) return res.status(400).json({ error: 'Nom requis.' });
  const info = db.prepare(`INSERT INTO cans (name, series, variant, language, cap_color, full_color, volume, country, year,
    description, is_limited, image_url, accent_color) VALUES
    (@name, @series, @variant, @language, @cap_color, @full_color, @volume, @country, @year, @description, @is_limited, @image_url, @accent_color)`).run(b);
  res.json({ id: info.lastInsertRowid });
});

admin.put('/cans/:id', (req, res) => {
  const b = canBody(req.body);
  if (!b.name) return res.status(400).json({ error: 'Nom requis.' });
  db.prepare(`UPDATE cans SET name=@name, series=@series, variant=@variant, language=@language, cap_color=@cap_color,
    full_color=@full_color, volume=@volume, country=@country, year=@year, description=@description,
    is_limited=@is_limited, image_url=@image_url, accent_color=@accent_color, updated_at=@updated_at WHERE id=@id`)
    .run({ ...b, updated_at: nowIso(), id: parseInt(req.params.id, 10) });
  res.json({ ok: true });
});

admin.post('/cans/:id/publish', (req, res) => {
  db.prepare('UPDATE cans SET is_published = ?, updated_at = ? WHERE id = ?')
    .run(req.body.published ? 1 : 0, nowIso(), req.params.id);
  res.json({ ok: true });
});

admin.delete('/cans/:id', (req, res) => {
  db.prepare('DELETE FROM cans WHERE id = ?').run(req.params.id); // cascade collection/wishlist/favorites
  res.json({ ok: true });
});

// Annonces
admin.get('/updates', (req, res) => {
  res.json({ updates: db.prepare('SELECT * FROM updates ORDER BY created_at DESC').all() });
});
admin.post('/updates', (req, res) => {
  const title = clean(req.body.title, 120);
  const content = clean(req.body.content, 5000);
  if (!title || !content) return res.status(400).json({ error: 'Titre et contenu requis.' });
  const info = db.prepare('INSERT INTO updates (title, content) VALUES (?, ?)').run(title, content);
  res.json({ id: info.lastInsertRowid });
});
admin.delete('/updates/:id', (req, res) => {
  db.prepare('DELETE FROM updates WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Utilisateurs
admin.get('/users', (req, res) => {
  const q = clean(req.query.q, 60).toLowerCase();
  let users = db.prepare(`
    SELECT u.id, u.username, u.email, u.role, u.user_code, u.created_at, u.avatar_url,
      (SELECT COUNT(*) FROM collection_items ci WHERE ci.user_id = u.id) AS col_count
    FROM users u ORDER BY u.username COLLATE NOCASE
  `).all();
  if (q) users = users.filter(u => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  res.json({ users });
});

admin.delete('/users/:id', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  if (target.role === 'admin') return res.status(403).json({ error: 'Impossible de supprimer un administrateur.' });
  // Supprime aussi les fichiers uploadés
  if (target.avatar_url && target.avatar_url.startsWith('/uploads/')) {
    fs.unlink(path.join(UPLOAD_DIR, path.basename(target.avatar_url)), () => {});
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(target.id); // cascade
  res.json({ ok: true });
});

// Boîte de réception
admin.get('/messages', (req, res) => {
  res.json({ messages: db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 200').all() });
});
admin.post('/messages/:id/reply', (req, res) => {
  const reply = clean(req.body.reply, 5000);
  if (!reply) return res.status(400).json({ error: 'La réponse ne peut pas être vide.' });
  db.prepare(`UPDATE messages SET reply = ?, replied_at = ? WHERE id = ?`).run(reply, nowIso(), req.params.id);
  res.json({ ok: true });
});
admin.delete('/messages/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (m && m.attachment_url && m.attachment_url.startsWith('/uploads/')) {
    fs.unlink(path.join(UPLOAD_DIR, path.basename(m.attachment_url)), () => {});
  }
  db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Maintenance
admin.get('/maintenance', (req, res) => {
  res.json({ active: getSetting('maintenance') === '1' });
});
admin.post('/maintenance', (req, res) => {
  setSetting('maintenance', req.body.active ? '1' : '0');
  res.json({ active: !!req.body.active });
});

// Collection admin (stats mois)
admin.get('/collection-stats', (req, res) => {
  const uid = req.user.id;
  const months = db.prepare(`
    SELECT substr(added_at, 1, 7) AS month, COUNT(*) AS count
    FROM collection_items WHERE user_id = ? GROUP BY month ORDER BY month DESC LIMIT 12
  `).all(uid).reverse();
  const stats = db.prepare('SELECT COUNT(*) AS owned, COALESCE(SUM(price),0) AS value FROM collection_items WHERE user_id = ?').get(uid);
  const total = db.prepare('SELECT COUNT(*) AS n FROM cans').get().n;
  res.json({ months, ...stats, total });
});

app.use('/api/admin', admin);
app.use('/api', api);

// ── Fichiers statiques ──
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Gestion des erreurs ──
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Fichier trop lourd (max 5 Mo).' });
  }
  console.error(err);
  res.status(err.message ? 400 : 500).json({ error: err.message || 'Erreur serveur.' });
});

// ── Purge des sessions expirées (1x/heure) ──
setInterval(() => {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowIso());
}, 3600 * 1000).unref();

app.listen(PORT, '0.0.0.0', () => {
  console.log('MonsterTracker v2 — http://0.0.0.0:' + PORT);
});
