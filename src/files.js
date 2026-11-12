'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const cfg = require('./config');
const { HttpError } = require('./http');
const { settings } = require('./db');

const TYPES = {
  jpg: { mime: 'image/jpeg', label: 'صور JPG' },
  png: { mime: 'image/png', label: 'صور PNG' },
  pdf: { mime: 'application/pdf', label: 'ملفات PDF' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'مستندات Word (DOCX)' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', label: 'عروض PowerPoint (PPTX)' },
};
const PREVIEWABLE = new Set(['jpg', 'png', 'pdf']);

// التحقق من نوع الملف الحقيقي من محتواه (وليس من امتداده أو نوعه المعلن)
function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    const s = buf.toString('latin1');
    if (s.includes('word/document.xml')) return 'docx';
    if (s.includes('ppt/presentation.xml')) return 'pptx';
  }
  return null;
}

function uploadRules() {
  const s = settings();
  return {
    allowed_types: (s.allowed_types || []).filter((t) => TYPES[t]),
    max_file_mb: s.max_file_mb,
    max_files_per_submission: s.max_files_per_submission,
    labels: (s.allowed_types || []).filter((t) => TYPES[t]).map((t) => TYPES[t].label),
  };
}

// حد حجم الطلب = أقصى عدد ملفات × أقصى حجم + هامش للحقول
function maxBodyBytes() {
  const s = settings();
  return (s.max_files_per_submission * s.max_file_mb + 1) * 1024 * 1024;
}

function cleanName(name) {
  const n = String(name || 'ملف').replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
  return n.slice(0, 150) || 'ملف';
}

function clamScan(filePath) {
  if (!cfg.CLAMSCAN) return;
  const r = spawnSync(cfg.CLAMSCAN, ['--no-summary', filePath], { timeout: 60000 });
  if (r.status === 1) throw new HttpError(400, 'تم رفض الملف لأن الفحص الأمني اكتشف فيه محتوى ضارًا.');
}

// يتحقق من كل الملفات ثم يكتبها في المخزن الخاص. يعيد قائمة بيانات للإدراج في قاعدة البيانات.
// existingCount = عدد الملفات الحالية غير المحذوفة في المشاركة.
function validateAndStore(studentId, parts, existingCount = 0) {
  if (!parts.length) return [];
  const s = settings();
  const maxBytes = s.max_file_mb * 1024 * 1024;
  const allowed = new Set(s.allowed_types || []);
  if (existingCount + parts.length > s.max_files_per_submission) {
    throw new HttpError(400, `الحد الأقصى لعدد الملفات في المشاركة الواحدة هو ${s.max_files_per_submission}.`);
  }
  const checked = parts.map((p) => {
    const name = cleanName(p.filename);
    if (p.data.length === 0) throw new HttpError(400, `الملف «${name}» فارغ.`);
    if (p.data.length > maxBytes) throw new HttpError(400, `حجم الملف «${name}» أكبر من الحد المسموح به (${s.max_file_mb} ميجابايت).`);
    const ext = sniff(p.data);
    if (!ext || !allowed.has(ext)) {
      const labels = [...allowed].map((t) => TYPES[t] && TYPES[t].label).filter(Boolean).join('، ');
      throw new HttpError(400, `نوع الملف «${name}» غير مسموح به. الأنواع المسموحة: ${labels}.`);
    }
    return { name, ext, data: p.data };
  });

  const dir = path.join(cfg.UPLOAD_DIR, String(studentId));
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const written = [];
  try {
    for (const c of checked) {
      const id = crypto.randomUUID();
      const rel = path.join(String(studentId), `${id}.${c.ext}`);
      const abs = path.join(cfg.UPLOAD_DIR, rel);
      fs.writeFileSync(abs, c.data, { mode: 0o600, flag: 'wx' });
      written.push(abs);
      clamScan(abs);
      written[written.length - 1] = abs;
      c.id = id; c.rel = rel;
    }
  } catch (e) {
    for (const w of written) { try { fs.unlinkSync(w); } catch { /* ignore */ } }
    throw e;
  }
  return checked.map((c) => ({
    id: c.id, original_name: c.name, stored_path: c.rel, ext: c.ext, mime: TYPES[c.ext].mime,
    size: c.data.length, sha256: crypto.createHash('sha256').update(c.data).digest('hex'),
  }));
}

function discardStored(records) {
  for (const r of records) { try { fs.unlinkSync(path.join(cfg.UPLOAD_DIR, r.stored_path)); } catch { /* ignore */ } }
}

function absPath(rel) {
  const abs = path.resolve(cfg.UPLOAD_DIR, rel);
  if (!abs.startsWith(path.resolve(cfg.UPLOAD_DIR) + path.sep)) throw new HttpError(400, 'مسار غير صالح.');
  return abs;
}

module.exports = { TYPES, PREVIEWABLE, sniff, uploadRules, maxBodyBytes, validateAndStore, discardStored, absPath };
