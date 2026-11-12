'use strict';
const cfg = require('./config');
const { get, run, all } = require('./db');
const { sha256, randomToken } = require('./crypto');
const { parseCookies } = require('./http');

const IDLE_MS = cfg.SESSION_IDLE_HOURS * 3600 * 1000;
const MAX_MS = cfg.SESSION_MAX_DAYS * 86400 * 1000;

function createSession(ctx, userId) {
  const token = randomToken(32);
  const now = Date.now();
  run(
    'INSERT INTO sessions(id_hash, user_id, created_at, expires_at, last_seen, ip, ua) VALUES(?,?,?,?,?,?,?)',
    sha256(token), userId, now, now + IDLE_MS, now, ctx.ip, String(ctx.req.headers['user-agent'] || '').slice(0, 200)
  );
  ctx.cookie(cfg.COOKIE_NAME, token, { maxAge: Math.floor(IDLE_MS / 1000) });
}

function destroySession(ctx) {
  const tok = parseCookies(ctx.req.headers.cookie)[cfg.COOKIE_NAME];
  if (tok) run('DELETE FROM sessions WHERE id_hash=?', sha256(tok));
  ctx.cookie(cfg.COOKIE_NAME, '', { maxAge: 0 });
}

function destroyUserSessions(userId, exceptHash) {
  if (exceptHash) run('DELETE FROM sessions WHERE user_id=? AND id_hash<>?', userId, exceptHash);
  else run('DELETE FROM sessions WHERE user_id=?', userId);
}

function currentSessionHash(req) {
  const tok = parseCookies(req.headers.cookie)[cfg.COOKIE_NAME];
  return tok ? sha256(tok) : null;
}

// تحميل المستخدم من الجلسة عند كل طلب (التحقق دائمًا على الخادم)
function loadUser(req) {
  const hash = currentSessionHash(req);
  if (!hash) return null;
  const row = get(
    `SELECT s.created_at AS sc, s.expires_at, s.last_seen,
            u.id, u.role, u.username, u.full_name, u.active, u.must_change_password
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?`, hash
  );
  if (!row) return null;
  const now = Date.now();
  if (row.expires_at < now || row.sc + MAX_MS < now || !row.active) {
    run('DELETE FROM sessions WHERE id_hash=?', hash);
    return null;
  }
  if (now - row.last_seen > 5 * 60 * 1000) {
    run('UPDATE sessions SET last_seen=?, expires_at=? WHERE id_hash=?', now, now + IDLE_MS, hash);
  }
  return { id: row.id, role: row.role, username: row.username, full_name: row.full_name, must_change_password: !!row.must_change_password };
}

function purgeExpiredSessions() {
  run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
}

module.exports = { createSession, destroySession, destroyUserSessions, currentSessionHash, loadUser, purgeExpiredSessions };
