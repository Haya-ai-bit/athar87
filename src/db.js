'use strict';
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const cfg = require('./config');
const { seed } = require('./seed');

for (const d of [cfg.DATA_DIR, cfg.UPLOAD_DIR]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });

const db = new DatabaseSync(cfg.DB_PATH);
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;');

// توحيد النص العربي للبحث: إزالة التشكيل والتطويل وتوحيد الألف والياء والتاء المربوطة والأرقام
function normalizeAr(v) {
  if (v == null) return '';
  return String(v)
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .trim();
}
db.function('norm', { deterministic: true }, normalizeAr);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('student','admin','reviewer')),
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS grades (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, sort INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY,
  grade_id INTEGER NOT NULL REFERENCES grades(id),
  name TEXT NOT NULL, sort INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (grade_id, name)
);
CREATE TABLE IF NOT EXISTS students (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  school_number TEXT NOT NULL UNIQUE,
  class_id INTEGER NOT NULL REFERENCES classes(id)
);
CREATE TABLE IF NOT EXISTS student_class_history (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(user_id),
  from_class_id INTEGER, to_class_id INTEGER NOT NULL,
  moved_by INTEGER, moved_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, sort INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  group_name TEXT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  points INTEGER NOT NULL,
  points_mode TEXT NOT NULL CHECK (points_mode IN ('fixed','per_submission','up_to')),
  multiple INTEGER NOT NULL DEFAULT 1,
  student_submit INTEGER NOT NULL DEFAULT 1,
  form_type TEXT NOT NULL DEFAULT 'standard',
  icon TEXT NOT NULL DEFAULT 'folder',
  official INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(user_id),
  item_id INTEGER NOT NULL REFERENCES items(id),
  term TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  activity_date TEXT,
  notes TEXT NOT NULL DEFAULT '',
  benefit TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','needs_completion')),
  committee_recommendation TEXT NOT NULL DEFAULT '',
  approved_points INTEGER CHECK (approved_points IS NULL OR approved_points >= 0),
  approved_by INTEGER REFERENCES users(id),
  approved_at TEXT,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  edited_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sub_student_item ON submissions(student_id, item_id);
CREATE INDEX IF NOT EXISTS idx_sub_status ON submissions(status, deleted_at);
CREATE TABLE IF NOT EXISTS evidence_files (
  id TEXT PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id),
  student_id INTEGER NOT NULL REFERENCES students(user_id),
  original_name TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  ext TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  deleted_at TEXT,
  deleted_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_files_sub ON evidence_files(submission_id);
CREATE TABLE IF NOT EXISTS admin_notes (
  id INTEGER PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  visible_to_student INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  user_id INTEGER, user_name TEXT,
  action TEXT NOT NULL, entity TEXT, entity_id TEXT,
  details TEXT, ip TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_seen INTEGER NOT NULL,
  ip TEXT, ua TEXT
);
`);

// ---------- مغلّفات مريحة فوق node:sqlite ----------
const cache = new Map();
function stmt(sql) {
  let s = cache.get(sql);
  if (!s) { s = db.prepare(sql); cache.set(sql, s); }
  return s;
}
const clean = (a) => a.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
const get = (sql, ...a) => stmt(sql).get(...clean(a));
const all = (sql, ...a) => stmt(sql).all(...clean(a));
const run = (sql, ...a) => stmt(sql).run(...clean(a));

function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  }
}

const nowIso = () => new Date().toISOString();

function settings() {
  const o = {};
  for (const r of all('SELECT key, value FROM settings')) {
    try { o[r.key] = JSON.parse(r.value); } catch { o[r.key] = r.value; }
  }
  return o;
}
function setSetting(key, value) {
  run('INSERT INTO settings(key, value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, JSON.stringify(value));
}

function audit(ctx, action, entity, entityId, details) {
  const u = ctx && ctx.user;
  run(
    'INSERT INTO audit_log(user_id, user_name, action, entity, entity_id, details, ip, created_at) VALUES(?,?,?,?,?,?,?,?)',
    u ? u.id : null, u ? u.full_name : null, action, entity || null,
    entityId == null ? null : String(entityId),
    details ? JSON.stringify(details) : null,
    ctx && ctx.ip ? ctx.ip : null, nowIso()
  );
}

seed(db, { get, run, tx });

module.exports = { db, get, all, run, tx, nowIso, settings, setSetting, audit, normalizeAr };
