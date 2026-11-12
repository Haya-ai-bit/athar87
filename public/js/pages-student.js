import { h, icon, api, state, date, dateTime, empty, confirmDialog, toast, statusChip, pointsText, pts, field } from './lib.js';
import { folderCard, filesList, submissionCard, submissionModal, gradeBadge, crumbs, labelsFor } from './components.js';

const stat = (ic, value, label, cls = '') => h('div', { class: `card stat ${cls}` }, h('span', { class: 'ic' }, icon(ic, 24)), h('div', null, h('b', null, value), h('span', { class: 'l' }, label)));

export async function portal({ root }) {
  const d = await api('/api/student/overview');
  const s = d.stats;
  root.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, `مرحبًا، ${d.student.full_name}`), h('p', null, `${d.student.grade_name} — ${d.student.class_name} • ${d.term}`)),
      h('a', { class: 'btn btn-primary', href: '#/student/folders' }, icon('folder', 20), 'فتح مجلدات البنود')),
    h('div', { class: 'grid grid-4' },
      stat('layers', s.submissions, 'المشاركات المضافة'), stat('upload', s.files, 'الشواهد المرفوعة'),
      stat('check', s.reviewed_files, 'شواهد تمت مراجعتها', 'good'), stat('star', s.approved_total, 'مجموع الدرجات المعتمدة', 'warn')));
  if (d.attention.length) {
    root.append(h('div', { class: 'section', style: { padding: '1.5rem 0 0' } }, h('h2', null, 'مشاركات تحتاج إلى استكمال'),
      h('div', { class: 'grid' }, d.attention.map((x) => submissionCard(x, `#/student/submission/${x.id}`)))));
  }
  root.append(h('div', { style: { marginTop: '1.5rem' } }, h('h2', null, 'آخر التحديثات على ملفي'),
    d.recent.length ? h('div', { class: 'grid grid-2' }, d.recent.map((x) => submissionCard(x, `#/student/submission/${x.id}`)))
      : empty('لا توجد مشاركات بعد. افتحي مجلد أي بند وابدئي بإضافة مشاركتك الأولى.')));
}

export async function profile({ root }) {
  const d = await api('/api/student/overview');
  const st = d.student;
  root.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'ملفي الشخصي'), h('p', null, 'بياناتك المعتمدة من المدرسة وملخص نشاطك.'))),
    h('div', { class: 'grid grid-2' },
      h('div', { class: 'card' }, h('h2', null, 'بيانات الحساب'),
        h('dl', { class: 'kv' }, h('dt', null, 'اسم الطالبة'), h('dd', null, st.full_name), h('dt', null, 'المرحلة الدراسية'), h('dd', null, st.grade_name),
          h('dt', null, 'الفصل'), h('dd', null, st.class_name), h('dt', null, 'اسم المستخدم'), h('dd', null, st.school_number),
          h('dt', null, 'تاريخ إنشاء الحساب'), h('dd', null, date(st.created_at)), h('dt', null, 'حالة الحساب'), h('dd', null, st.active ? 'فعّال' : 'موقوف')),
        h('p', { class: 'hint', style: { marginTop: '.8rem' } }, 'لا يمكن تعديل المرحلة أو الفصل إلا من إدارة المدرسة.'),
        h('a', { class: 'btn btn-ghost btn-sm', href: '#/change-password' }, icon('key', 16), 'تغيير كلمة المرور')),
      h('div', { class: 'card' }, h('h2', null, 'ملخص ملفي'),
        h('dl', { class: 'kv' }, h('dt', null, 'عدد المشاركات'), h('dd', null, d.stats.submissions), h('dt', null, 'الشواهد المرفوعة'), h('dd', null, d.stats.files),
          h('dt', null, 'الشواهد التي تمت مراجعتها'), h('dd', null, d.stats.reviewed_files), h('dt', null, 'قيد المراجعة'), h('dd', null, d.stats.pending),
          h('dt', null, 'مقبولة'), h('dd', null, d.stats.accepted), h('dt', null, 'تحتاج إلى استكمال'), h('dd', null, d.stats.needs_completion),
          h('dt', null, 'مجموع الدرجات المعتمدة'), h('dd', null, h('b', null, d.stats.approved_total))))),
    h('h2', { style: { marginTop: '1.5rem' } }, 'آخر تحديثاتي'),
    d.recent.length ? h('div', { class: 'grid grid-2' }, d.recent.map((x) => submissionCard(x, `#/student/submission/${x.id}`))) : empty('لم تضيفي أي مشاركة حتى الآن.'));
}

export async function folders({ root }) {
  const d = await api('/api/student/overview');
  state.rules = d.upload_rules;
  root.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'مجلدات بنود السلوك المتميز'), h('p', null, 'لكل بند مجلد مستقل. افتحيه لعرض مشاركاتك أو أضيفي مشاركة جديدة.'))));
  for (const c of d.categories) {
    let lastGroup = null;
    const sec = h('section', { class: 'cat-sec', style: { '--cat': c.color } },
      h('div', { class: 'cat-title' }, h('h2', null, c.name)));
    const grid = h('div', { class: 'grid grid-3' });
    for (const it of c.items) {
      if (it.group_name && it.group_name !== lastGroup) {
        sec.append(grid.children.length ? '' : '');
        grid.append(h('div', { class: 'grp-title', style: { gridColumn: '1 / -1' } }, icon('folder', 18), it.group_name));
      }
      lastGroup = it.group_name;
      grid.append(folderCard(it, { href: `#/student/item/${it.id}`, color: c.color, onAdd: () => submissionModal(it, d.upload_rules, null, (s) => { location.hash = `#/student/submission/${s.id}`; }) }));
    }
    sec.append(grid);
    root.append(sec);
  }
}

export async function itemPage({ root, params }) {
  const d = await api(`/api/student/items/${params[0]}`);
  const it = d.item;
  root.append(crumbs({ text: 'بوابتي', href: '#/student' }, { text: 'المجلدات', href: '#/student/folders' }, { text: d.category.name }, { text: it.name }),
    h('div', { class: 'card', style: { borderTop: `6px solid ${d.category.color}`, marginBottom: '1.2rem' } },
      h('div', { class: 'page-head', style: { marginBottom: 0 } },
        h('div', null, h('h1', { style: { fontSize: '1.5rem' } }, h('span', { style: { color: d.category.color } }, icon(it.icon, 28)), ' ', it.name),
          it.group_name ? h('p', null, it.group_name) : null, h('p', { style: { color: 'var(--ink)', marginTop: '.5rem' } }, it.description),
          h('span', { class: 'badge-pts' }, pointsText(it))),
        it.active && it.student_submit ? h('button', { class: 'btn btn-amber', onclick: () => submissionModal(it, d.upload_rules, null, (s) => { location.hash = `#/student/submission/${s.id}`; }) }, icon('plus', 18), '+ إضافة مشاركة أو شاهد') : null),
      it.instructions ? h('div', { class: 'note info', style: { marginTop: '1rem' } }, h('b', null, 'تعليمات الشواهد من الإدارة'), it.instructions) : null,
      !it.student_submit ? h('div', { class: 'note warn', style: { marginTop: '1rem' } }, 'يُوثَّق هذا البند من قِبل الإدارة وفق سجلات المدرسة، ولا تُمنح الدرجة برفع ملف.') : null,
      !it.active ? h('div', { class: 'note warn', style: { marginTop: '1rem' } }, 'هذا البند موقوف حاليًا، ولا يمكن إضافة مشاركات جديدة.') : null),
    d.submissions.length ? h('div', { class: 'grid' }, d.submissions.map((s) => submissionCard(s, `#/student/submission/${s.id}`)))
      : empty('لا توجد شواهد مضافة لهذا البند حتى الآن. يمكنك البدء بإضافة مشاركتك الأولى.'));
}

export async function submissionPage({ root, params }) {
  let d = await api(`/api/student/submissions/${params[0]}`);
  const body = h('div');
  const rerender = () => {
    const s = d.submission; const it = d.item; const L = labelsFor(s.form_type);
    body.replaceChildren(
      h('div', { class: `card sub s-${s.status}` },
        h('div', { class: 'sub-head' }, h('div', null, h('h1', { style: { fontSize: '1.4rem' } }, s.title), h('p', { class: 'hint' }, `${s.category_name} › ${s.item_name}`)),
          h('div', { class: 'row', style: { gap: '.4rem' } }, statusChip(s.status), gradeBadge(s))),
        s.status === 'needs_completion' ? h('div', { class: 'note' }, h('b', null, 'مطلوب استكمال الشاهد'),
          ...s.admin_notes.slice(-1).map((n) => h('div', null, n.body, h('div', { class: 'hint' }, dateTime(n.created_at))))) : null,
        h('dl', { class: 'kv' }, h('dt', null, L.description), h('dd', null, s.description), L.benefit ? [h('dt', null, L.benefit), h('dd', null, s.benefit)] : null,
          h('dt', null, L.date), h('dd', null, date(s.activity_date)), s.notes ? [h('dt', null, 'ملاحظات'), h('dd', null, s.notes)] : null,
          h('dt', null, 'الفصل الدراسي'), h('dd', null, s.term || '—'), h('dt', null, 'تاريخ الإضافة'), h('dd', null, dateTime(s.created_at)), h('dt', null, 'آخر تعديل'), h('dd', null, dateTime(s.edited_at))),
        s.grade_approved ? h('div', { class: 'note info' }, `الدرجة المعتمدة من الإدارة: ${s.approved_points} من ${pointsText(it)}`) : h('div', { class: 'hint' }, 'الدرجة تُعتمد من الإدارة بعد المراجعة، وما يظهر قبل ذلك هو الدرجة المحددة للبند فقط.'),
        s.admin_notes.length > 1 || (s.admin_notes.length === 1 && s.status !== 'needs_completion') ? h('div', { class: 'timeline' }, h('h3', null, 'ملاحظات الإدارة'),
          s.admin_notes.map((n) => h('div', { class: 'tl' }, n.body, h('br'), h('small', null, dateTime(n.created_at))))) : null,
        h('div', { class: 'actions' },
          h('button', { class: 'btn btn-primary', onclick: () => submissionModal(it, d.upload_rules, s, (ns) => { d.submission = ns; rerender(); }) }, icon('edit', 18), 'تعديل المشاركة'),
          h('button', { class: 'btn btn-ghost', style: { color: 'var(--danger)' }, onclick: del }, icon('trash', 18), 'حذف المشاركة'))),
      h('div', { class: 'card', style: { marginTop: '1rem' } }, h('h2', null, `الشواهد المرفقة (${s.files.length})`),
        filesList(s.files, { canEdit: true, onDelete: delFile, onReplace: replaceFile }),
        s.files.length < d.upload_rules.max_files_per_submission ? addFiles() : h('p', { class: 'hint' }, 'وصلتِ إلى الحد الأقصى لعدد الملفات في هذه المشاركة.')));
  };
  function addFiles() {
    const rules = d.upload_rules;
    const inp = h('input', { type: 'file', multiple: true, accept: rules.allowed_types.map((t) => (t === 'jpg' ? '.jpg,.jpeg' : '.' + t)).join(',') });
    const bar = h('i'); const prog = h('div', { class: 'progress', hidden: true }, bar);
    const btn = h('button', { class: 'btn btn-amber btn-sm', type: 'button', onclick: async () => {
      if (!inp.files.length) return toast('اختاري ملفًا أولًا.', 'error');
      const fd = new FormData(); for (const f of inp.files) fd.append('files', f, f.name);
      btn.disabled = true; prog.hidden = false;
      try {
        const r = await api(`/api/student/submissions/${d.submission.id}/files`, { method: 'POST', form: fd, onProgress: (p) => { bar.style.width = p + '%'; } });
        d.submission = r.submission; toast('تم رفع الشاهد بنجاح، ويمكنك متابعة حالة مراجعته من ملفك الشخصي.'); rerender();
      } catch (e) { toast(e.message, 'error'); btn.disabled = false; prog.hidden = true; }
    } }, icon('upload', 16), 'رفع');
    return h('div', { class: 'dropzone', style: { marginTop: '1rem' } }, h('b', null, 'إضافة شواهد'), h('div', { class: 'row', style: { marginTop: '.5rem' } }, inp, btn),
      h('div', { class: 'hint' }, `${rules.labels.join('، ')} — حتى ${rules.max_file_mb} ميجابايت للملف.`), prog);
  }
  async function delFile(f) {
    const extra = d.submission.status !== 'pending' || d.submission.grade_approved ? ' وستعود المشاركة إلى «قيد المراجعة».' : '';
    if (!(await confirmDialog('حذف الملف', `هل تريدين حذف الملف «${f.name}»؟${extra}`, 'حذف', true))) return;
    try { d.submission = (await api(`/api/student/files/${f.id}`, { method: 'DELETE' })).submission; toast('تم حذف الملف.'); rerender(); } catch (e) { toast(e.message, 'error'); }
  }
  async function replaceFile(f, file) {
    const fd = new FormData(); fd.append('files', file, file.name);
    try { d.submission = (await api(`/api/student/files/${f.id}/replace`, { method: 'POST', form: fd })).submission; toast('تم استبدال الملف.'); rerender(); } catch (e) { toast(e.message, 'error'); }
  }
  async function del() {
    if (!(await confirmDialog('حذف المشاركة', 'سيتم حذف هذه المشاركة وشواهدها من ملفك. هل أنتِ متأكدة؟', 'حذف المشاركة', true))) return;
    try { await api(`/api/student/submissions/${d.submission.id}`, { method: 'DELETE' }); toast('تم حذف المشاركة.'); location.hash = `#/student/item/${d.submission.item_id}`; } catch (e) { toast(e.message, 'error'); }
  }
  rerender();
  root.append(crumbs({ text: 'بوابتي', href: '#/student' }, { text: 'المجلدات', href: '#/student/folders' }, { text: d.submission.item_name, href: `#/student/item/${d.submission.item_id}` }, { text: d.submission.title }), body);
}
