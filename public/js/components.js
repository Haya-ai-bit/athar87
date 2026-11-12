import { h, icon, api, field, errBox, showErr, modal, confirmDialog, toast, date, dateTime, size, statusChip, pointsText, pts, state } from './lib.js';

const LABELS = {
  standard: { title: 'عنوان المشاركة', description: 'وصف مختصر', date: 'تاريخ المشاركة', benefit: null },
  proposal: { title: 'عنوان المقترح', description: 'وصف الفكرة', date: 'تاريخ تقديم المقترح', benefit: 'الفائدة المتوقعة للمجتمع المدرسي' },
  extra: { title: 'عنوان السلوك المتميز', description: 'وصف السلوك', date: 'تاريخ الممارسة', benefit: 'أثر السلوك أو فائدته' },
  discipline: { title: 'العنوان', description: 'ملاحظات', date: 'التاريخ', benefit: null },
};
export const labelsFor = (ft) => LABELS[ft] || LABELS.standard;

const EXT_ICON = { jpg: 'image', png: 'image', pdf: 'file', docx: 'file', pptx: 'file' };

// ---------- بطاقة المجلد ----------
export function folderCard(item, { href, color, onAdd, admin }) {
  const c = item.counts;
  const meta = [h('span', { class: 'chip chip-grey' }, `المشاركات: ${c.submissions}`), h('span', { class: 'chip chip-grey' }, `الشواهد: ${c.files}`)];
  if (c.pending) meta.push(h('span', { class: 'chip chip-pending' }, `قيد المراجعة: ${c.pending}`));
  if (c.accepted) meta.push(h('span', { class: 'chip chip-accepted' }, `مقبولة: ${c.accepted}`));
  if (c.needs_completion) meta.push(h('span', { class: 'chip chip-needs_completion' }, `تحتاج استكمال: ${c.needs_completion}`));
  const lines = [h('div', { class: 'pts-line' }, 'الدرجة المحددة للبند: ', h('b', null, pointsText(item)))];
  if (c.approved_n) lines.push(h('div', { class: 'pts-line' }, 'الدرجة المعتمدة: ', h('b', { style: { color: 'var(--ok)' } }, pts(c.approved_points))));
  if (c.awaiting_n) lines.push(h('div', { class: 'pts-line' }, 'بانتظار الاعتماد (غير معتمدة بعد): ', h('b', null, c.awaiting_points == null ? 'تقررها المدرسة' : pts(c.awaiting_points))));
  const btns = [h('a', { class: 'btn btn-primary btn-sm', href }, icon('folder', 16), 'فتح المجلد')];
  if (onAdd && item.active && item.student_submit) btns.push(h('button', { class: 'btn btn-amber btn-sm', type: 'button', onclick: onAdd }, icon('plus', 16), '+ إضافة مشاركة أو شاهد'));
  if (!admin && !item.student_submit) btns.push(h('span', { class: 'hint' }, 'يوثَّق من الإدارة'));
  return h('div', { class: `folder${item.active ? '' : ' inactive'}`, style: { '--cat': color } },
    h('div', { class: 'fh' }, h('span', { class: 'fi' }, icon(item.icon, 24)), h('div', null, h('h3', null, item.name), !item.active ? h('span', { class: 'chip chip-grey' }, 'موقوف') : null)),
    h('p', { class: 'desc' }, item.description), h('div', { class: 'meta' }, meta), lines, h('div', { class: 'btns' }, btns));
}

// ---------- الدرجة ----------
export function gradeBadge(sub) {
  if (sub.grade_approved) return h('span', { class: 'chip chip-accepted' }, icon('check', 14), `الدرجة المعتمدة: ${sub.approved_points} من ${sub.defined_points}`);
  if (sub.status === 'needs_completion') return h('span', { class: 'chip chip-grey' }, 'الدرجة: بعد الاستكمال والمراجعة');
  return h('span', { class: 'chip chip-grey' }, `بانتظار الاعتماد (${sub.points_mode === 'up_to' ? 'حتى ' : ''}${pts(sub.defined_points)} — غير معتمدة بعد)`);
}

// ---------- قائمة الملفات ----------
export function filesList(files, { canEdit, onDelete, onReplace, canDownload = true } = {}) {
  if (!files.length) return h('p', { class: 'hint' }, 'لا توجد ملفات مرفوعة لهذه المشاركة.');
  return h('div', { class: 'files' }, files.map((f) => {
    const holder = h('div');
    let shown = false;
    const toggle = () => {
      shown = !shown;
      holder.replaceChildren();
      if (shown) holder.append(h('div', { class: 'preview' }, f.ext === 'pdf'
        ? h('iframe', { src: `/api/files/${f.id}/view`, title: f.name })
        : h('img', { src: `/api/files/${f.id}/view`, alt: f.name })));
    };
    const tools = h('div', { class: 'tools' });
    if (f.previewable) tools.append(h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: toggle }, icon('eye', 16), 'معاينة'));
    if (canDownload) tools.append(h('a', { class: 'btn btn-ghost btn-sm', href: `/api/files/${f.id}/download` }, icon('download', 16), 'تنزيل'));
    if (canEdit && onReplace) {
      const inp = h('input', { type: 'file', hidden: true, accept: '.jpg,.jpeg,.png,.pdf,.docx,.pptx', onchange: () => inp.files[0] && onReplace(f, inp.files[0]) });
      tools.append(inp, h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => inp.click() }, icon('swap', 16), 'استبدال'));
    }
    if (canEdit && onDelete) tools.append(h('button', { class: 'btn btn-ghost btn-sm', type: 'button', style: { color: 'var(--danger)' }, onclick: () => onDelete(f) }, icon('trash', 16), 'حذف'));
    return h('div', null, h('div', { class: 'file' }, icon(EXT_ICON[f.ext] || 'file', 24),
      h('div', { class: 'fn' }, f.name, h('small', null, `${f.ext.toUpperCase()} • ${size(f.size)} • رُفع في ${dateTime(f.uploaded_at)}`)), tools), holder);
  }));
}

// ---------- بطاقة المشاركة ----------
export function submissionCard(sub, href, { admin } = {}) {
  const notes = sub.admin_notes.filter((n) => admin || true);
  return h('div', { class: `card sub s-${sub.status}` },
    h('div', { class: 'sub-head' }, h('div', null, h('h3', null, h('a', { href, style: { textDecoration: 'none' } }, sub.title)),
      admin ? h('div', { class: 'hint' }, `${sub.student_name} — ${sub.grade_name} / ${sub.class_name} — ${sub.item_name}`) : null),
      h('div', { class: 'row', style: { gap: '.4rem' } }, statusChip(sub.status), gradeBadge(sub))),
    h('dl', { class: 'kv' }, h('dt', null, 'تاريخ المشاركة'), h('dd', null, date(sub.activity_date)),
      h('dt', null, 'الشواهد المرفقة'), h('dd', null, `${sub.files.length} ملف`),
      h('dt', null, 'آخر تعديل'), h('dd', null, dateTime(sub.edited_at))),
    !admin && sub.status === 'needs_completion' && notes.length ? h('div', { class: 'note' }, h('b', null, 'ملاحظة المتحكم:'), notes[notes.length - 1].body) : null,
    h('div', null, h('a', { class: 'btn btn-ghost btn-sm', href }, 'فتح التفاصيل')));
}

// ---------- نموذج إضافة/تعديل مشاركة (للطالبة) ----------
export function submissionModal(item, rules, existing, onDone) {
  const L = labelsFor(item.form_type);
  modal(existing ? 'تعديل المشاركة' : `إضافة مشاركة — ${item.name}`, (body, close) => {
    const err = errBox();
    const today = new Date().toISOString().slice(0, 10);
    const title = h('input', { type: 'text', value: existing ? existing.title : '', maxlength: 150, required: true });
    const desc = h('textarea', { required: true, maxlength: 3000 }); desc.value = existing ? existing.description : '';
    const dt = h('input', { type: 'date', value: existing ? existing.activity_date : today, max: today, required: true });
    const benefit = L.benefit ? h('textarea', { required: true, maxlength: 2000 }) : null;
    if (benefit && existing) benefit.value = existing.benefit;
    const notes = h('textarea', { maxlength: 1500 }); notes.value = existing ? existing.notes : '';
    const accept = rules.allowed_types.map((t) => (t === 'jpg' ? '.jpg,.jpeg' : '.' + t)).join(',');
    const files = h('input', { type: 'file', multiple: true, accept });
    const bar = h('i'); const progress = h('div', { class: 'progress', hidden: true }, bar);
    const save = h('button', { class: 'btn btn-primary', type: 'submit' }, 'حفظ');
    const limit = existing ? rules.max_files_per_submission - existing.files.length : rules.max_files_per_submission;
    const form = h('form', { onsubmit: async (e) => {
      e.preventDefault(); err.hidden = true;
      if (files.files.length > Math.max(limit, 0)) return showErr(err, new Error(`يمكنك إضافة ${Math.max(limit, 0)} ملفات فقط في هذه المشاركة (الحد الأقصى ${rules.max_files_per_submission}).`));
      for (const f of files.files) if (f.size > rules.max_file_mb * 1048576) return showErr(err, new Error(`حجم الملف «${f.name}» أكبر من ${rules.max_file_mb} ميجابايت.`));
      const fd = new FormData();
      fd.append('title', title.value); fd.append('description', desc.value); fd.append('activity_date', dt.value); fd.append('notes', notes.value);
      if (benefit) fd.append('benefit', benefit.value);
      for (const f of files.files) fd.append('files', f, f.name);
      save.disabled = true; progress.hidden = !files.files.length;
      try {
        const url = existing ? `/api/student/submissions/${existing.id}` : `/api/student/items/${item.id}/submissions`;
        const r = await api(url, { method: existing ? 'PUT' : 'POST', form: fd, onProgress: (p) => { bar.style.width = p + '%'; } });
        toast(existing ? 'تم حفظ التعديلات. أُعيدت المشاركة إلى قيد المراجعة.' : 'تم رفع الشاهد بنجاح، ويمكنك متابعة حالة مراجعته من ملفك الشخصي.');
        close(); onDone(r.submission);
      } catch (ex) { showErr(err, ex); save.disabled = false; progress.hidden = true; }
    } },
      existing && (existing.status !== 'pending' || existing.grade_approved)
        ? h('div', { class: 'note warn' }, h('b', null, 'تنبيه'), 'عند تعديل مشاركة تمت مراجعتها تعود إلى «قيد المراجعة» وتُلغى الدرجة المعتمدة حتى تُراجع من جديد.') : null,
      err, field(L.title, title), field(L.description, desc), L.benefit ? field(L.benefit, benefit) : null, field(L.date, dt),
      field('ملاحظات إضافية (اختياري)', notes),
      field(existing ? 'إضافة ملفات جديدة (اختياري)' : 'رفع الشواهد (اختياري ويمكن إضافتها لاحقًا)', files,
        `الأنواع المسموحة: ${rules.labels.join('، ')}. الحد الأقصى ${rules.max_file_mb} ميجابايت للملف، و${rules.max_files_per_submission} ملفات للمشاركة.`),
      progress, h('div', { class: 'actions' }, save, h('button', { class: 'btn btn-ghost', type: 'button', onclick: close }, 'إلغاء')));
    body.append(form);
  });
}

export async function copyable(text) {
  try { await navigator.clipboard.writeText(text); toast('تم النسخ.', 'info'); } catch { /* ignore */ }
}

// نافذة عرض بيانات دخول مؤقتة (تظهر مرة واحدة)
export function credentialsModal(title, username, password) {
  modal(title, (body, close) => {
    body.append(
      h('div', { class: 'note warn' }, h('b', null, 'احفظي هذه البيانات الآن'), 'كلمة المرور المؤقتة تظهر مرة واحدة فقط، وسيُطلب من المستخدم تغييرها عند أول دخول.'),
      h('p', null, 'اسم المستخدم:'), h('div', { class: 'cred' }, username), h('p', { style: { marginTop: '.8rem' } }, 'كلمة المرور المؤقتة:'), h('div', { class: 'cred' }, password),
      h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', onclick: () => copyable(`${username}\n${password}`) }, 'نسخ'), h('button', { class: 'btn btn-ghost', onclick: close }, 'إغلاق')));
  });
}

export const crumbs = (...parts) => h('nav', { class: 'crumbs', 'aria-label': 'مسار التنقل' }, parts.flatMap((p, i) => {
  const el = p.href ? h('a', { href: p.href }, p.text) : h('span', null, p.text);
  return i ? [h('span', { class: 'sep' }, '›'), el] : [el];
}));
