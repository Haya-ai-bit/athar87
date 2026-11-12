'use strict';
const fs = require('fs');
const { route, HttpError } = require('../http');
const { get, audit } = require('../db');
const { TYPES, PREVIEWABLE, absPath } = require('../files');

const ANY = { roles: ['student', 'admin', 'reviewer'] };

// التحقق من الصلاحية عند كل طلب للملف (عرض أو تنزيل): الطالبة تصل لملفاتها فقط، والإدارة لكل الملفات.
function authorize(ctx) {
  const f = get(
    `SELECT f.*, s.deleted_at AS sub_deleted, s.item_id, u.full_name AS student_name
       FROM evidence_files f JOIN submissions s ON s.id = f.submission_id JOIN users u ON u.id = f.student_id
      WHERE f.id = ?`, String(ctx.params.id)
  );
  if (!f || f.deleted_at || f.sub_deleted) throw new HttpError(404, 'لم يتم العثور على الملف.');
  if (ctx.user.role === 'student' && f.student_id !== ctx.user.id) throw new HttpError(404, 'لم يتم العثور على الملف.'); // 404 لإخفاء وجود ملفات الأخريات
  let abs;
  try { abs = absPath(f.stored_path); fs.accessSync(abs); } catch { throw new HttpError(404, 'الملف غير متوفر في المخزن.'); }
  return { f, abs };
}

route('GET', '/api/files/:id/view', ANY, async (ctx) => {
  const { f, abs } = authorize(ctx);
  const inline = PREVIEWABLE.has(f.ext);
  ctx.sendFile(abs, {
    mime: TYPES[f.ext].mime,
    disposition: inline ? 'inline' : 'attachment',
    filename: f.original_name,
    // الصور: سياسة مقيّدة. ملفات PDF: بدون CSP صارمة حتى يعمل عارض المتصفح، مع nosniff
    csp: f.ext === 'pdf' ? "frame-ancestors 'self'" : "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  });
});

route('GET', '/api/files/:id/download', ANY, async (ctx) => {
  const { f, abs } = authorize(ctx);
  if (ctx.user.role !== 'student') audit(ctx, 'file.download', 'file', f.id, { student: f.student_name, name: f.original_name });
  ctx.sendFile(abs, { mime: TYPES[f.ext].mime, disposition: 'attachment', filename: f.original_name, csp: "default-src 'none'; sandbox" });
});
