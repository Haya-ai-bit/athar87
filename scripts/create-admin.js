'use strict';
// إنشاء حساب المتحكم الأول بأمان. لا توجد كلمة مرور افتراضية في المنصة.
// تفاعلي:   npm run create-admin
// غير تفاعلي: ADMIN_USERNAME=... ADMIN_FULL_NAME="..." ADMIN_PASSWORD=... npm run create-admin
const readline = require('readline');
const { get, run, nowIso, audit } = require('../src/db');
const { hashPassword } = require('../src/crypto');
const { validatePassword } = require('../src/routes/auth');

function ask(q, hidden) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => { if (s.includes(q)) rl.output.write(s); else rl.output.write(''); };
    }
    rl.question(q, (a) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a.trim()); });
  });
}

(async () => {
  const username = process.env.ADMIN_USERNAME || (await ask('اسم المستخدم (أحرف إنجليزية وأرقام): '));
  const full_name = process.env.ADMIN_FULL_NAME || (await ask('الاسم الكامل: '));
  const password = process.env.ADMIN_PASSWORD || (await ask('كلمة المرور (8 أحرف على الأقل، أحرف وأرقام): ', true));
  if (!/^[A-Za-z0-9._@-]{4,40}$/.test(username)) throw new Error('اسم المستخدم غير صالح (4–40 حرفًا إنجليزيًا/أرقام/._@-).');
  if (full_name.length < 3) throw new Error('الاسم الكامل قصير.');
  validatePassword(password, username);
  if (get('SELECT id FROM users WHERE username = ?', username)) throw new Error('اسم المستخدم موجود مسبقًا.');
  const r = run("INSERT INTO users(role, username, password_hash, full_name, active, must_change_password, created_at) VALUES('admin',?,?,?,1,0,?)",
    username, await hashPassword(password), full_name, nowIso());
  audit({ user: null, ip: 'cli' }, 'account.create', 'user', r.lastInsertRowid, { username, role: 'admin', via: 'cli' });
  console.log(`تم إنشاء حساب المتحكم «${username}» بنجاح.`);
})().catch((e) => { console.error('خطأ:', e.message); process.exit(1); });
