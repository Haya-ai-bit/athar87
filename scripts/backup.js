'use strict';
// نسخة احتياطية: قاعدة البيانات (نسخة متسقة) + مجلد الملفات المرفوعة. الاستعادة موضحة في README.md
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { backup } = require('node:sqlite');
const cfg = require('../src/config');
const { db } = require('../src/db');

(async () => {
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const dir = path.join(cfg.BACKUP_DIR, `athar87-${stamp}`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  await backup(db, path.join(dir, 'athar.db'));
  const r = spawnSync('tar', ['-czf', path.join(dir, 'uploads.tar.gz'), '-C', cfg.DATA_DIR, 'uploads']);
  if (r.status !== 0) { fs.cpSync(cfg.UPLOAD_DIR, path.join(dir, 'uploads'), { recursive: true }); }
  // الاحتفاظ بآخر 14 نسخة
  const all = fs.readdirSync(cfg.BACKUP_DIR).filter((n) => n.startsWith('athar87-')).sort();
  for (const old of all.slice(0, Math.max(0, all.length - 14))) fs.rmSync(path.join(cfg.BACKUP_DIR, old), { recursive: true, force: true });
  console.log('تم إنشاء النسخة الاحتياطية في:', dir);
})().catch((e) => { console.error('فشل النسخ الاحتياطي:', e.message); process.exit(1); });
