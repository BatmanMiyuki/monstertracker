// ════════════════════════════════════════════════════════════
//  MonsterTracker — Base de données SQLite (better-sqlite3)
// ════════════════════════════════════════════════════════════
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'monstertracker.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  theme         TEXT NOT NULL DEFAULT 'dark',
  avatar_url    TEXT,
  user_code     TEXT,
  delete_code   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cans (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  series        TEXT,
  variant       TEXT,
  language      TEXT,
  cap_color     TEXT,
  full_color    TEXT,
  volume        TEXT,
  country       TEXT,
  year          INTEGER,
  description   TEXT,
  is_limited    INTEGER NOT NULL DEFAULT 0,
  image_url     TEXT,
  accent_color  TEXT,
  is_published  INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT
);

CREATE TABLE IF NOT EXISTS collection_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  can_id        INTEGER NOT NULL REFERENCES cans(id) ON DELETE CASCADE,
  price         REAL,
  purchase_type TEXT,
  added_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, can_id)
);

CREATE TABLE IF NOT EXISTS wishlist (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  can_id     INTEGER NOT NULL REFERENCES cans(id) ON DELETE CASCADE,
  added_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, can_id)
);

CREATE TABLE IF NOT EXISTS favorites (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  can_id   INTEGER NOT NULL REFERENCES cans(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 3),
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, position)
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS friends (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, friend_id)
);

CREATE TABLE IF NOT EXISTS chats (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_name TEXT,
  content     TEXT NOT NULL,
  read        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS updates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username       TEXT,
  category       TEXT NOT NULL,
  content        TEXT NOT NULL,
  attachment_url TEXT,
  reply          TEXT,
  replied_at     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_col_user         ON collection_items(user_id);
CREATE INDEX IF NOT EXISTS idx_wish_user        ON wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_fav_user         ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_fr_to            ON friend_requests(to_id, status);
CREATE INDEX IF NOT EXISTS idx_chats_to         ON chats(to_id, read);
CREATE INDEX IF NOT EXISTS idx_chats_conv       ON chats(from_id, to_id);
CREATE INDEX IF NOT EXISTS idx_cans_published   ON cans(is_published);
`);

// ── Helpers ──
function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}

module.exports = { db, getSetting, setSetting };
