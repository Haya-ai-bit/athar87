'use strict';
// حذف نهائي للملفات المحذوفة منطقيًا بعد انقضاء مدة الاحتفاظ (الإعدادات ← مدة الاحتفاظ).
const fs = require('fs');
const { all, run, settings, audit } = require('../src/db');
const { absPath } = require('../src/files');

const days = settings().retention_days || 90;
const cutoff = new Date(Date.now() - days * 86400000).toISOString();
const rows = all('SELECT id, stored_path FROM evidence_files WHERE deleted_at IS NOT NULL AND deleted_at < ?', cutoff);
let n = 0;
for (const r of rows) {
  try { fs.unlinkSync(absPath(r.stored_path)); } catch { /* الملف غير موجود */ }
  run('DELETE FROM evidence_files WHERE id = ?', r.id);
  n++;
}
audit({ user: null, ip: 'cli' }, 'files.purge', 'file', null, { removed: n, retention_days: days });
console.log(`تمت إزالة ${n} ملفًا نهائيًا (المحذوفة منذ أكثر من ${days} يومًا).`);
