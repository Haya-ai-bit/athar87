'use strict';
const { route, HttpError } = require('../http');
const { get, all, run, tx, nowIso, audit, settings } = require('../db');
const files = require('../files');
const S = require('../services');

const STUDENT = { roles: ['student'] };
const UPLOAD = { roles: ['student'], multipart: () => files.maxBodyBytes() };

function ownSubmission(ctx, id) {
  const sub = get('SELECT * FROM submissions WHERE id=? AND student_id=? AND deleted_at IS NULL', S.intId(id), ctx.user.id);
  if (!sub) throw new HttpError(404, 'لم يتم العثور على المشاركة.');
  return sub;
}

function loadOne(id) {
  return S.hydrate(all(`${S.SUB_SELECT} WHERE s.id = ?`, id), false)[0];
}

function insertFiles(studentId, submissionId, records) {
  const now = nowIso();
  for (const r of records) {
    run(
      `INSERT INTO evidence_files(id, submission_id, student_id, original_name, stored_path, ext, mime, size, sha256, uploaded_at)
       VALUES(?,?,?,?,?,?,?,?,?,?)`,
      r.id, submissionId, studentId, r.original_name, r.stored_path, r.ext, r.mime, r.size, r.sha256, now
    );
  }
}

const activeFileCount = (subId) => get('SELECT COUNT(*) AS n FROM evidence_files WHERE submission_id=? AND deleted_at IS NULL', subId).n;

route('GET', '/api/student/overview', STUDENT, async (ctx) => ({ ...S.overview(ctx.user.id, { admin: false }), upload_rules: files.uploadRules() }));

route('GET', '/api/student/items/:id', STUDENT, async (ctx) => {
  const item = get('SELECT * FROM items WHERE id=?', S.intId(ctx.params.id));
  if (!item) throw new HttpError(404, 'لم يتم العثور على البند.');
  const cat = get('SELECT id, name, color FROM categories WHERE id=?', item.category_id);
  const rows = all(`${S.SUB_SELECT} WHERE s.student_id=? AND s.item_id=? AND s.deleted_at IS NULL ORDER BY s.created_at DESC`, ctx.user.id, item.id);
  return { item: S.itemDto(item), category: cat, submissions: S.hydrate(rows, false), upload_rules: files.uploadRules() };
});

route('POST', '/api/student/items/:id/submissions', UPLOAD, async (ctx) => {
  const item = get('SELECT * FROM items WHERE id=?', S.intId(ctx.params.id));
  if (!item || !item.active) throw new HttpError(404, 'هذا البند غير متاح حاليًا.');
  if (!item.student_submit) throw new HttpError(403, 'يُوثَّق هذا البند من قِبل الإدارة، ولا يمكن إضافة مشاركة له من حسابك.');
  const fields = S.submissionFields(item, ctx.fields);
  const stored = files.validateAndStore(ctx.user.id, ctx.files, 0);
  const now = nowIso();
  let id;
  try {
    id = tx(() => {
      const r = run(
        `INSERT INTO submissions(student_id, item_id, term, title, description, activity_date, notes, benefit, status, created_by, created_at, updated_at, edited_at)
         VALUES(?,?,?,?,?,?,?,?, 'pending', ?, ?, ?, ?)`,
        ctx.user.id, item.id, settings().current_term || '', fields.title, fields.description, fields.activity_date, fields.notes, fields.benefit,
        ctx.user.id, now, now, now
      );
      insertFiles(ctx.user.id, r.lastInsertRowid, stored);
      audit(ctx, 'submission.create', 'submission', r.lastInsertRowid, { item_id: item.id, files: stored.length });
      return Number(r.lastInsertRowid);
    });
  } catch (e) { files.discardStored(stored); throw e; }
  return { submission: loadOne(id) };
});

route('GET', '/api/student/submissions/:id', STUDENT, async (ctx) => {
  const sub = ownSubmission(ctx, ctx.params.id);
  const item = get('SELECT * FROM items WHERE id=?', sub.item_id);
  return { submission: loadOne(sub.id), item: S.itemDto(item), upload_rules: files.uploadRules() };
});

route('PUT', '/api/student/submissions/:id', UPLOAD, async (ctx) => {
  const sub = ownSubmission(ctx, ctx.params.id);
  const item = get('SELECT * FROM items WHERE id=?', sub.item_id);
  const fields = S.submissionFields(item, ctx.fields);
  const stored = files.validateAndStore(ctx.user.id, ctx.files, activeFileCount(sub.id));
  try {
    tx(() => {
      run('UPDATE submissions SET title=?, description=?, activity_date=?, notes=?, benefit=? WHERE id=?',
        fields.title, fields.description, fields.activity_date, fields.notes, fields.benefit, sub.id);
      insertFiles(ctx.user.id, sub.id, stored);
      S.markEdited(ctx, sub);
      audit(ctx, 'submission.update', 'submission', sub.id, { files_added: stored.length });
    });
  } catch (e) { files.discardStored(stored); throw e; }
  return { submission: loadOne(sub.id) };
});

route('DELETE', '/api/student/submissions/:id', STUDENT, async (ctx) => {
  const sub = ownSubmission(ctx, ctx.params.id);
  if (sub.approved_points != null) throw new HttpError(403, 'لا يمكن حذف مشاركة اعتُمدت درجتها. تواصلي مع إدارة المدرسة إن احتجتِ إلى ذلك.');
  const now = nowIso();
  tx(() => {
    run('UPDATE submissions SET deleted_at=?, updated_at=? WHERE id=?', now, now, sub.id);
    run("UPDATE evidence_files SET deleted_at=?, deleted_reason='submission_deleted' WHERE submission_id=? AND deleted_at IS NULL", now, sub.id);
    audit(ctx, 'submission.delete', 'submission', sub.id);
  });
  return { ok: true };
});

route('POST', '/api/student/submissions/:id/files', UPLOAD, async (ctx) => {
  const sub = ownSubmission(ctx, ctx.params.id);
  if (!ctx.files.length) throw new HttpError(400, 'اختاري ملفًا واحدًا على الأقل.');
  const stored = files.validateAndStore(ctx.user.id, ctx.files, activeFileCount(sub.id));
  try {
    tx(() => {
      insertFiles(ctx.user.id, sub.id, stored);
      S.markEdited(ctx, sub);
      audit(ctx, 'file.upload', 'submission', sub.id, { files: stored.map((f) => f.id) });
    });
  } catch (e) { files.discardStored(stored); throw e; }
  return { submission: loadOne(sub.id) };
});

function ownFile(ctx, id) {
  const f = get(
    `SELECT f.*, s.deleted_at AS sub_deleted FROM evidence_files f JOIN submissions s ON s.id=f.submission_id
      WHERE f.id=? AND f.student_id=? AND f.deleted_at IS NULL`, String(id), ctx.user.id
  );
  if (!f || f.sub_deleted) throw new HttpError(404, 'لم يتم العثور على الملف.');
  return f;
}

route('DELETE', '/api/student/files/:id', STUDENT, async (ctx) => {
  const f = ownFile(ctx, ctx.params.id);
  const sub = get('SELECT * FROM submissions WHERE id=?', f.submission_id);
  tx(() => {
    run("UPDATE evidence_files SET deleted_at=?, deleted_reason='student' WHERE id=?", nowIso(), f.id);
    S.markEdited(ctx, sub);
    audit(ctx, 'file.delete', 'file', f.id, { submission_id: sub.id });
  });
  return { submission: loadOne(sub.id) };
});

route('POST', '/api/student/files/:id/replace', UPLOAD, async (ctx) => {
  const f = ownFile(ctx, ctx.params.id);
  if (ctx.files.length !== 1) throw new HttpError(400, 'اختاري ملفًا واحدًا للاستبدال.');
  const sub = get('SELECT * FROM submissions WHERE id=?', f.submission_id);
  const stored = files.validateAndStore(ctx.user.id, ctx.files, activeFileCount(sub.id) - 1);
  try {
    tx(() => {
      run("UPDATE evidence_files SET deleted_at=?, deleted_reason='replaced' WHERE id=?", nowIso(), f.id);
      insertFiles(ctx.user.id, sub.id, stored);
      S.markEdited(ctx, sub);
      audit(ctx, 'file.replace', 'file', f.id, { new_file: stored[0].id });
    });
  } catch (e) { files.discardStored(stored); throw e; }
  return { submission: loadOne(sub.id) };
});

module.exports = { insertFiles, activeFileCount };
