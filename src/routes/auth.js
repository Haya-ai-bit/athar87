'use strict';
const { route, limiter, HttpError } = require('../http');
const { get, run, nowIso, audit } = require('../db');
const { verifyPassword, hashPassword, dummyVerify } = require('../crypto');
const { createSession, destroySession, destroyUserSessions, currentSessionHash } = require('../auth');
const { toLatinDigits } = require('../services');

const loginLimiter = limiter({ windowMs: 15 * 60 * 1000, max: 12 }); // لكل (IP + اسم مستخدم)
const ipLimiter = limiter({ windowMs: 15 * 60 * 1000, max: 300 }); // سقف عام لكل IP (المدارس تشترك غالبًا في IP واحد)
const MAX_FAILS = 8;
const LOCK_MS = 15 * 60 * 1000;
const GENERIC = 'تعذّر تسجيل الدخول. تأكدي من اسم المستخدم وكلمة المرور، أو تواصلي مع إدارة المدرسة.';

const publicUser = (u) => ({ id: u.id, role: u.role, username: u.username, full_name: u.full_name, must_change_password: !!u.must_change_password });

function validatePassword(pw, username) {
  if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(400, 'كلمة المرور يجب ألا تقل عن 8 أحرف.');
  if (pw.length > 128) throw new HttpError(400, 'كلمة المرور طويلة جدًا.');
  if (!/[A-Za-zء-ي]/.test(pw) || !/[0-9٠-٩]/.test(pw)) throw new HttpError(400, 'كلمة المرور يجب أن تحتوي على أحرف وأرقام.');
  if (username && pw.toLowerCase() === String(username).toLowerCase()) throw new HttpError(400, 'لا يجوز أن تكون كلمة المرور مطابقة لاسم المستخدم.');
}

route('POST', '/api/auth/login/:portal', async (ctx) => {
  const portal = ctx.params.portal;
  if (portal !== 'student' && portal !== 'admin') throw new HttpError(404, 'المسار غير موجود.');
  const username = toLatinDigits(String(ctx.body.username || '')).trim();
  const password = String(ctx.body.password || '');
  if (!username || !password || username.length > 80 || password.length > 200) throw new HttpError(400, 'أدخلي اسم المستخدم وكلمة المرور.');

  const lkey = `${ctx.ip}|${username.toLowerCase()}`;
  const wait = Math.max(ipLimiter(ctx.ip), loginLimiter(lkey, false));
  if (wait) throw new HttpError(429, `محاولات كثيرة. حاولي مرة أخرى بعد ${Math.ceil(wait / 60)} دقيقة.`, 'RATE');

  const user = get('SELECT * FROM users WHERE username = ?', username);
  if (user && user.locked_until > Date.now()) {
    throw new HttpError(429, 'تم إيقاف الدخول مؤقتًا بسبب محاولات خاطئة متكررة. حاولي لاحقًا أو تواصلي مع الإدارة.', 'LOCKED');
  }
  const ok = user ? await verifyPassword(password, user.password_hash) : await dummyVerify(password);
  const roleOk = user && (portal === 'student' ? user.role === 'student' : user.role === 'admin' || user.role === 'reviewer');

  if (!user || !ok || !roleOk || !user.active) {
    loginLimiter(lkey); // تُحتسب المحاولات الفاشلة فقط
    if (user && !ok) {
      const fails = user.failed_logins + 1;
      run('UPDATE users SET failed_logins=?, locked_until=? WHERE id=?', fails >= MAX_FAILS ? 0 : fails, fails >= MAX_FAILS ? Date.now() + LOCK_MS : 0, user.id);
    }
    audit({ ip: ctx.ip, user: null }, 'login.fail', 'user', user ? user.id : null, { username, portal });
    throw new HttpError(401, GENERIC, 'BAD_LOGIN');
  }
  run('UPDATE users SET failed_logins=0, locked_until=0, last_login_at=? WHERE id=?', nowIso(), user.id);
  createSession(ctx, user.id);
  ctx.user = user;
  audit(ctx, 'login', 'user', user.id, { portal });
  return { user: publicUser(user) };
});

const registerLimiter = limiter({ windowMs: 60 * 60 * 1000, max: 20 }); // محاولات إنشاء حساب لكل IP في الساعة

route('POST', '/api/auth/register', async (ctx) => {
  const { settings, tx, all } = require('../db');
  const S = require('../services');
  const s = settings();
  if (s.self_registration === false) throw new HttpError(403, 'إنشاء الحسابات الذاتي متوقف حاليًا. تواصلي مع إدارة المدرسة.');
  const wait = registerLimiter(ctx.ip);
  if (wait) throw new HttpError(429, `محاولات كثيرة. حاولي بعد ${Math.ceil(wait / 60)} دقيقة.`, 'RATE');

  const code = String(s.registration_code || '').trim();
  if (code && String(ctx.body.code || '').trim() !== code) throw new HttpError(400, 'رمز التسجيل غير صحيح. اطلبيه من إدارة المدرسة.');
  const full_name = S.text(ctx.body.full_name, { label: 'الاسم الكامل', min: 3, max: 100 });
  const username = toLatinDigits(String(ctx.body.username || '')).trim();
  if (!/^[0-9A-Za-z._-]{3,20}$/.test(username)) throw new HttpError(400, 'اسم المستخدم يجب أن يتكون من 3 إلى 20 حرفًا إنجليزيًا أو رقمًا (بدون مسافات).');
  const password = String(ctx.body.password || '');
  validatePassword(password, username);
  if (password !== String(ctx.body.password2 ?? password)) throw new HttpError(400, 'كلمتا المرور غير متطابقتين.');
  const cl = get('SELECT c.id, c.active FROM classes c WHERE c.id = ?', S.intId(ctx.body.class_id, 'الفصل'));
  if (!cl || !cl.active) throw new HttpError(400, 'اختاري المرحلة والفصل.');
  if (get('SELECT id FROM users WHERE username = ?', username)) throw new HttpError(400, 'اسم المستخدم مستخدم مسبقًا، اختاري اسمًا آخر.');

  const hash = await hashPassword(password);
  const now = nowIso();
  const id = tx(() => {
    const u = run("INSERT INTO users(role, username, password_hash, full_name, active, must_change_password, created_at) VALUES('student',?,?,?,1,0,?)", username, hash, full_name, now);
    run('INSERT INTO students(user_id, school_number, class_id) VALUES(?,?,?)', u.lastInsertRowid, username, cl.id);
    run('INSERT INTO student_class_history(student_id, from_class_id, to_class_id, moved_by, moved_at) VALUES(?,?,?,?,?)', u.lastInsertRowid, null, cl.id, null, now);
    audit({ ip: ctx.ip, user: null }, 'student.register', 'student', u.lastInsertRowid, { class_id: cl.id });
    return Number(u.lastInsertRowid);
  });
  const user = get('SELECT * FROM users WHERE id = ?', id);
  createSession(ctx, id);
  ctx.user = user;
  return { user: publicUser(user) };
});

route('POST', '/api/auth/logout', async (ctx) => {
  if (ctx.user) audit(ctx, 'logout', 'user', ctx.user.id);
  destroySession(ctx);
  return { ok: true };
});

route('GET', '/api/auth/me', async (ctx) => ({ user: ctx.user ? publicUser(ctx.user) : null }));

route('POST', '/api/auth/change-password', { roles: ['student', 'admin', 'reviewer'], allowMustChange: true }, async (ctx) => {
  const current = String(ctx.body.current_password || '');
  const next = String(ctx.body.new_password || '');
  const row = get('SELECT * FROM users WHERE id=?', ctx.user.id);
  if (!(await verifyPassword(current, row.password_hash))) throw new HttpError(400, 'كلمة المرور الحالية غير صحيحة.');
  validatePassword(next, row.username);
  if (next === current) throw new HttpError(400, 'يجب أن تختلف كلمة المرور الجديدة عن الحالية.');
  run('UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?', await hashPassword(next), ctx.user.id);
  destroyUserSessions(ctx.user.id, currentSessionHash(ctx.req)); // إنهاء الجلسات الأخرى
  audit(ctx, 'password.change', 'user', ctx.user.id);
  return { ok: true };
});

module.exports = { validatePassword, publicUser };
