import { h, icon, api, state, q, date, dateTime, empty, confirmDialog, toast, statusChip, pointsText, pts, field, errBox, showErr, pager, modal, STATUS, loading } from './lib.js';
import { ACTIONS } from './pages-admin2.js';
import { folderCard, filesList, submissionCard, gradeBadge, crumbs, labelsFor, credentialsModal } from './components.js';

const stat = (ic, value, label, sub, cls = '') => h('div', { class: `card stat ${cls}` }, h('span', { class: 'ic' }, icon(ic, 24)), h('div', null, h('b', null, value), h('span', { class: 'l' }, label), sub ? h('small', null, sub) : null));

// ======================= لوحة التحكم =======================
export async function dashboard({ root }) {
  const d = await api('/api/admin/dashboard');
  const search = h('input', { type: 'search', placeholder: 'ابحثي باسم الطالبة أو اسم المستخدم أو البند أو عنوان المشاركة…', 'aria-label': 'بحث سريع' });
  const maxStudents = Math.max(1, ...d.grades.map((g) => g.students));
  root.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'لوحة التحكم'), h('p', null, `الفصل الدراسي الحالي: ${d.term} — الأرقام من قاعدة البيانات مباشرة`))),
    h('form', { class: 'card no-print', style: { marginBottom: '1rem' }, onsubmit: (e) => { e.preventDefault(); location.hash = `#/admin/review${q({ q: search.value })}`; } },
      h('div', { class: 'row' }, h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'بحث سريع'), search), h('button', { class: 'btn btn-primary', style: { marginBottom: '.5rem' } }, icon('search', 18), 'بحث'))),
    h('div', { class: 'grid grid-4' },
      stat('users', d.students.total, 'إجمالي الطالبات المسجلات', `${d.students.active} حساب فعّال`),
      ...d.grades.map((g) => stat('users', g.students, `طالبات ${g.name}`, `${g.classes} فصول`)),
      stat('layers', d.classes, 'عدد الفصول المسجلة'), stat('list', d.submissions.total, 'إجمالي المشاركات', `${d.submissions.graded} بدرجة معتمدة`),
      stat('upload', d.files.total, 'إجمالي الشواهد (الملفات)'),
      stat('clock', d.files.pending, 'شواهد قيد المراجعة', `${d.submissions.pending} مشاركة`, 'warn'),
      stat('check', d.files.accepted, 'شواهد مقبولة', `${d.submissions.accepted} مشاركة`, 'good'),
      stat('alert', d.files.needs, 'شواهد تحتاج إلى استكمال', `${d.submissions.needs} مشاركة`, 'bad')),
    h('div', { class: 'card', style: { marginTop: '1rem' } }, h('h2', null, 'الطالبات حسب المرحلة'),
      d.grades.map((g) => h('div', { style: { marginBottom: '.7rem' } }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', null, g.name), h('span', null, `${g.students} طالبة`)),
        h('div', { class: 'bar' }, h('i', { style: { width: `${(g.students / maxStudents) * 100}%` } }))))),
    h('h2', { style: { marginTop: '1.5rem' } }, 'أحدث المشاركات المضافة'),
    d.latest.length ? h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['الطالبة', 'المرحلة والفصل', 'البند', 'العنوان', 'الحالة', ''].map((t) => h('th', null, t)))),
      h('tbody', null, d.latest.map((s) => h('tr', null, h('td', null, s.student_name), h('td', null, `${s.grade_name} — ${s.class_name}`), h('td', null, s.item_name), h('td', null, s.title), h('td', null, statusChip(s.status)),
        h('td', null, h('a', { class: 'btn btn-ghost btn-sm', href: `#/admin/submission/${s.id}` }, 'مراجعة')))))))
      : empty('لا توجد مشاركات مضافة حتى الآن. ستظهر هنا فور إضافة الطالبات لمشاركاتهن.'));
}

// ======================= المراحل والفصول =======================
const OPEN_KEY = 'athar.open';
const getOpen = () => { try { return new Set(JSON.parse(sessionStorage.getItem(OPEN_KEY) || '[]')); } catch { return new Set(); } };
const setOpen = (set) => { try { sessionStorage.setItem(OPEN_KEY, JSON.stringify([...set])); } catch { /* ignore */ } };

export async function browse({ root, query }) {
  const d = await api('/api/admin/structure');
  const open = getOpen();
  if (query.open) { open.add('c' + query.open); const g = d.grades.find((x) => x.classes.some((c) => String(c.id) === query.open)); if (g) open.add('g' + g.id); setOpen(open); }
  const counts = (o) => h('span', { class: 'counts' }, h('span', { class: 'chip chip-teal' }, `${o.students} طالبة`), h('span', { class: 'chip chip-grey' }, `${o.submissions} مشاركة`), h('span', { class: 'chip chip-grey' }, `${o.files} شاهد`), o.pending ? h('span', { class: 'chip chip-pending' }, `${o.pending} قيد المراجعة`) : null);

  function acc(key, titleNode, countsNode, onOpen, cls = '') {
    const body = h('div', { class: 'acc-b' });
    const box = h('div', { class: `acc ${cls}${open.has(key) ? ' open' : ''}` });
    let loaded = false;
    const toggle = async () => {
      const isOpen = box.classList.toggle('open');
      isOpen ? open.add(key) : open.delete(key); setOpen(open);
      head.setAttribute('aria-expanded', isOpen);
      if (isOpen && onOpen && !loaded) { loaded = true; await onOpen(body); }
    };
    const head = h('button', { class: 'acc-h', type: 'button', 'aria-expanded': open.has(key), onclick: toggle }, titleNode, countsNode, h('span', { class: 'chev' }, icon('down', 18)));
    box.append(head, body);
    if (open.has(key) && onOpen) { loaded = true; onOpen(body); }
    return { box, body };
  }

  async function loadStudents(cls, body) {
    body.append(loading());
    try {
      const r = await api(`/api/admin/classes/${cls.id}/students`);
      body.replaceChildren();
      if (!r.students.length) return body.append(empty('لا توجد طالبات مسجلات في هذا الفصل بعد.', 'users'));
      body.append(h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['الطالبة', 'اسم المستخدم', 'المشاركات', 'الشواهد', 'قيد المراجعة', ''].map((t) => h('th', null, t)))),
        h('tbody', null, r.students.map((s) => h('tr', null, h('td', null, h('a', { href: `#/admin/student/${s.id}?from=${cls.id}` }, s.full_name), s.active ? null : h('span', { class: 'chip chip-grey', style: { marginInlineStart: '.4rem' } }, 'موقوفة')),
          h('td', null, s.school_number), h('td', { class: 'num' }, s.submissions), h('td', { class: 'num' }, s.files), h('td', { class: 'num' }, s.pending),
          h('td', null, h('a', { class: 'btn btn-ghost btn-sm', href: `#/admin/student/${s.id}?from=${cls.id}` }, 'فتح الملف'))))))));
    } catch (e) { body.replaceChildren(h('div', { class: 'form-error' }, e.message)); }
  }

  root.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'المراحل والفصول'), h('p', null, 'المرحلة ← الفصل ← الطالبات ← ملف الطالبة ← مجلدات البنود ← الشواهد'))));
  for (const g of d.grades) {
    const gAcc = acc('g' + g.id, h('span', null, icon('layers', 20), ' ', h('b', null, g.name), h('span', { class: 'hint' }, ` — ${g.classes.length} فصول`)), counts(g), null);
    gAcc.body.append(...g.classes.map((c) => {
      const cAcc = acc('c' + c.id, h('span', null, icon('users', 18), ' ', c.name, c.active ? '' : ' (موقوف)'), counts(c), (b) => loadStudents(c, b));
      return cAcc.box;
    }));
    root.append(gAcc.box);
  }
}

// ======================= ملف الطالبة عند المتحكم =======================
export async function studentProfile({ root, params, query }) {
  const d = await api(`/api/admin/students/${params[0]}`);
  const st = d.student;
  const isAdmin = state.user.role === 'admin';
  const back = query.from || st.class_id;
  root.append(crumbs({ text: 'المراحل والفصول', href: '#/admin/browse' }, { text: st.grade_name, href: `#/admin/browse?open=${back}` }, { text: st.class_name, href: `#/admin/browse?open=${back}` }, { text: st.full_name }),
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, st.full_name), h('p', null, `${st.grade_name} — ${st.class_name} • اسم المستخدم ${st.school_number} • ${st.active ? 'حساب فعّال' : 'حساب موقوف'}`)),
      isAdmin ? h('div', { class: 'actions', style: { marginTop: 0 } },
        h('button', { class: 'btn btn-ghost btn-sm', onclick: () => discipline(st) }, icon('calendar', 16), 'تسجيل الانضباط للفصل الحالي'),
        h('a', { class: 'btn btn-ghost btn-sm', href: '#/admin/students?q=' + encodeURIComponent(st.school_number) }, icon('edit', 16), 'تعديل / نقل الطالبة')) : null),
    h('div', { class: 'grid grid-4' }, stat('layers', d.stats.submissions, 'المشاركات'), stat('upload', d.stats.files, 'الشواهد'),
      stat('clock', d.stats.pending, 'قيد المراجعة', null, 'warn'), stat('star', d.stats.approved_total, 'مجموع الدرجات المعتمدة', d.stats.approved_total !== d.stats.approved_raw ? `قبل قواعد الاحتساب: ${d.stats.approved_raw}` : null, 'good')));
  for (const c of d.categories) {
    let last = null;
    const grid = h('div', { class: 'grid grid-3' });
    for (const it of c.items) {
      if (it.group_name && it.group_name !== last) grid.append(h('div', { class: 'grp-title', style: { gridColumn: '1 / -1' } }, icon('folder', 18), it.group_name));
      last = it.group_name;
      grid.append(folderCard(it, { href: `#/admin/student/${st.id}/item/${it.id}`, color: c.color, admin: true }));
    }
    root.append(h('section', { class: 'cat-sec', style: { '--cat': c.color, marginTop: '1.5rem' } }, h('div', { class: 'cat-title' }, h('h2', null, c.name)), grid));
  }
}

function discipline(st) {
  modal('تسجيل الانضباط', (body, close) => {
    const err = errBox(); const note = h('textarea', { placeholder: 'مثال: لا غياب دون عذر وفق سجلات المدرسة' });
    body.append(err, h('p', null, `إنشاء سجل انضباط للطالبة ${st.full_name} في الفصل الدراسي الحالي لمراجعته واعتماده.`), field('ملاحظات (اختياري)', note),
      h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', onclick: async () => {
        try { const r = await api(`/api/admin/students/${st.id}/discipline`, { method: 'POST', body: { note: note.value } }); close(); location.hash = `#/admin/submission/${r.id}`; } catch (e) { showErr(err, e); }
      } }, 'إنشاء السجل'), h('button', { class: 'btn btn-ghost', onclick: close }, 'إلغاء')));
  });
}

export async function studentItem({ root, params }) {
  const d = await api(`/api/admin/students/${params[0]}/items/${params[1]}`);
  const s = d.student;
  root.append(crumbs({ text: 'المراحل والفصول', href: '#/admin/browse' }, { text: s.grade_name, href: `#/admin/browse?open=${s.class_id}` }, { text: s.class_name, href: `#/admin/browse?open=${s.class_id}` },
    { text: s.full_name, href: `#/admin/student/${s.id}` }, { text: d.item.name }),
    h('div', { class: 'card', style: { borderTop: `6px solid ${d.category.color}`, marginBottom: '1.2rem' } },
      h('h1', { style: { fontSize: '1.4rem' } }, d.item.name), h('p', null, d.item.description), h('span', { class: 'badge-pts' }, pointsText(d.item))),
    d.submissions.length ? h('div', { class: 'grid' }, d.submissions.map((x) => submissionCard(x, `#/admin/submission/${x.id}`, { admin: true })))
      : empty('لا توجد شواهد مضافة لهذا البند لدى الطالبة حتى الآن.'));
}

// ======================= قائمة المراجعة والبحث =======================
export async function review({ root, query }) {
  const struct = await api('/api/admin/structure');
  const items = (await api('/api/admin/items')).categories;
  const f = { q: query.q || '', grade_id: query.grade_id || '', class_id: query.class_id || '', item_id: query.item_id || '', status: query.status || '', grade_state: query.grade_state || '', from: query.from || '', to: query.to || '', page: query.page || 1 };
  const results = h('div');
  const inputs = {};
  const sel = (key, label, opts) => { const s = h('select', { onchange: () => { if (key === 'grade_id') fillClasses(); } }, h('option', { value: '' }, 'الكل'), opts.map(([v, t]) => h('option', { value: v, selected: String(f[key]) === String(v) }, t))); inputs[key] = s; return field(label, s); };
  inputs.q = h('input', { type: 'search', value: f.q, placeholder: 'اسم الطالبة، اسم المستخدم، البند، عنوان المشاركة…' });
  inputs.from = h('input', { type: 'date', value: f.from }); inputs.to = h('input', { type: 'date', value: f.to });
  const classSel = h('select'); inputs.class_id = classSel;
  function fillClasses() {
    const gid = inputs.grade_id.value;
    classSel.replaceChildren(h('option', { value: '' }, 'الكل'));
    for (const g of struct.grades) if (!gid || String(g.id) === gid) for (const c of g.classes) classSel.append(h('option', { value: c.id, selected: String(f.class_id) === String(c.id) }, gid ? c.name : `${g.name} — ${c.name}`));
  }
  const gradeField = sel('grade_id', 'المرحلة', struct.grades.map((g) => [g.id, g.name]));
  fillClasses();
  const itemField = sel('item_id', 'البند', items.flatMap((c) => c.items.map((i) => [i.id, i.name])));
  const statusField = sel('status', 'حالة المراجعة', Object.entries(STATUS));
  const gsField = sel('grade_state', 'الدرجة', [['approved', 'معتمدة'], ['unapproved', 'غير معتمدة']]);
  const read = () => Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value]));
  const form = h('form', { class: 'card no-print', onsubmit: (e) => { e.preventDefault(); go(1); } },
    h('div', { class: 'filters' }, field('بحث', inputs.q), gradeField, field('الفصل', classSel), itemField, statusField, gsField, field('من تاريخ', inputs.from), field('إلى تاريخ', inputs.to)),
    h('div', { class: 'actions', style: { marginTop: 0 } }, h('button', { class: 'btn btn-primary' }, icon('search', 18), 'بحث'),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { location.hash = '#/admin/review'; } }, 'مسح عوامل التصفية')));
  async function go(page) {
    const params = { ...read(), page };
    history.replaceState(null, '', `#/admin/review${q(params)}`);
    results.replaceChildren(loading());
    try {
      const r = await api('/api/admin/submissions' + q({ ...params, page_size: 20 }));
      const chips = h('div', { class: 'tabs', style: { marginTop: '1rem' } }, [['', 'الكل', Object.values(r.counts).reduce((a, b) => a + b, 0)], ...Object.entries(STATUS).map(([k, v]) => [k, v, r.counts[k] || 0])].map(([k, v, n]) =>
        h('button', { class: `tab${params.status === k ? ' active' : ''}`, type: 'button', onclick: () => { inputs.status.value = k; go(1); } }, `${v} (${n})`)));
      results.replaceChildren(chips, r.rows.length ? h('div', { class: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, ['الطالبة', 'المرحلة والفصل', 'البند', 'عنوان المشاركة', 'التاريخ', 'الشواهد', 'الحالة', 'الدرجة', ''].map((t) => h('th', null, t)))),
        h('tbody', null, r.rows.map((s) => h('tr', null,
          h('td', null, h('a', { href: `#/admin/student/${s.student_id}` }, s.student_name), h('div', { class: 'hint' }, s.school_number)),
          h('td', null, `${s.grade_name} — ${s.class_name}`), h('td', null, s.item_name), h('td', null, s.title), h('td', null, date(s.activity_date)),
          h('td', { class: 'num' }, s.files.length), h('td', null, statusChip(s.status)),
          h('td', null, s.grade_approved ? h('span', { class: 'chip chip-accepted' }, `${s.approved_points} / ${s.defined_points}`) : h('span', { class: 'chip chip-grey' }, 'غير معتمدة')),
          h('td', null, h('a', { class: 'btn btn-primary btn-sm', href: `#/admin/submission/${s.id}` }, 'فتح')))))))
        : empty('لا توجد نتائج مطابقة. جرّبي تغيير عوامل التصفية أو مسحها.', 'search'),
      pager(r, go));
    } catch (e) { results.replaceChildren(h('div', { class: 'form-error' }, e.message)); }
  }
  root.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'مراجعة الشواهد'), h('p', null, 'ابحثي وصفّي، ثم افتحي المشاركة لمراجعتها واعتماد الدرجة. المشاركات التي تنتظر المراجعة تظهر أولًا.'))), form, results);
  go(Number(f.page) || 1);
}

// ======================= مراجعة مشاركة واحدة =======================
export async function submissionReview({ root, params }) {
  let d = await api(`/api/admin/submissions/${params[0]}`);
  const isAdmin = state.user.role === 'admin';
  const body = h('div');
  const apply = (r) => { d.submission = r.submission; };
  const acts = { review: 'مراجعة', 'grade.approve': 'اعتماد درجة', 'grade.revoke': 'إلغاء درجة' };
  function draw() {
    const s = d.submission; const L = labelsFor(s.form_type);
    // ---- نموذج المراجعة
    const status = h('select'); Object.entries(STATUS).forEach(([k, v]) => status.append(h('option', { value: k, selected: s.status === k }, v)));
    const note = h('textarea', { placeholder: 'ملاحظة توضيحية (مطلوبة عند «يحتاج إلى استكمال» وتظهر للطالبة)' });
    const vis = h('input', { type: 'checkbox', checked: true });
    const err = errBox();
    const saveReview = h('button', { class: 'btn btn-primary', type: 'submit' }, 'حفظ المراجعة');
    const reviewForm = h('form', { onsubmit: async (e) => {
      e.preventDefault(); err.hidden = true; saveReview.disabled = true;
      try { apply(await api(`/api/admin/submissions/${s.id}/review`, { method: 'POST', body: { status: status.value, note: note.value, visible: vis.checked } })); toast('تم حفظ المراجعة.'); draw(); } catch (ex) { showErr(err, ex); saveReview.disabled = false; }
    } }, err, field('حالة المراجعة', status), field('الملاحظة', note),
      h('label', { class: 'checks' }, vis, 'تظهر الملاحظة للطالبة'), h('div', { class: 'actions', style: { marginTop: 0 } }, saveReview));

    // ---- اعتماد الدرجة
    let gradeBox;
    if (isAdmin) {
      const pInput = h('input', { type: 'number', min: 0, max: s.defined_points, step: 1, value: s.grade_approved ? s.approved_points : '', placeholder: `من 0 إلى ${s.defined_points}` });
      const rec = s.form_type === 'extra' ? h('textarea', { placeholder: 'توصية لجنة التوجيه الطلابي' }) : null;
      if (rec) rec.value = s.committee_recommendation || '';
      const gErr = errBox();
      const approve = h('button', { class: 'btn btn-amber', type: 'button', disabled: s.status !== 'accepted', onclick: async () => {
        gErr.hidden = true;
        try { apply(await api(`/api/admin/submissions/${s.id}/grade`, { method: 'POST', body: { points: pInput.value === '' ? undefined : Number(pInput.value), committee_recommendation: rec ? rec.value : undefined } })); toast('تم اعتماد الدرجة.'); draw(); } catch (ex) { showErr(gErr, ex); }
      } }, icon('check', 18), s.grade_approved ? 'تحديث الدرجة المعتمدة' : 'اعتماد الدرجة');
      gradeBox = h('div', { class: 'card' }, h('h2', null, 'اعتماد الدرجة'),
        h('dl', { class: 'kv' }, h('dt', null, 'الدرجة المحددة للبند'), h('dd', null, pointsText(d.item)), h('dt', null, 'الدرجة المعتمدة'),
          h('dd', null, s.grade_approved ? h('b', { style: { color: 'var(--ok)' } }, `${s.approved_points} (اعتمدها ${s.approved_by_name || '—'} • ${dateTime(s.approved_at)})`) : 'لم تُعتمد بعد (بانتظار الاعتماد)')),
        s.status !== 'accepted' ? h('div', { class: 'note warn', style: { margin: '.8rem 0' } }, 'اقبلي الشاهد أولًا (حفظ المراجعة بحالة «مقبول») ثم اعتمدي الدرجة. اعتماد الدرجة منفصل عن قبول الملف.') : null,
        gErr, field('الدرجة المعتمدة', pInput, s.form_type === 'extra' ? 'تقررها المدرسة بتوصية لجنة التوجيه الطلابي، ولا تتجاوز 6 درجات.' : null), rec ? field('توصية لجنة التوجيه الطلابي', rec) : null,
        h('div', { class: 'actions', style: { marginTop: 0 } }, approve, s.grade_approved ? h('button', { class: 'btn btn-ghost', type: 'button', onclick: async () => {
          if (!(await confirmDialog('إلغاء الدرجة المعتمدة', 'ستعود الدرجة إلى «غير معتمدة». هل تريدين المتابعة؟', 'إلغاء الاعتماد', true))) return;
          try { apply(await api(`/api/admin/submissions/${s.id}/grade`, { method: 'POST', body: { points: null } })); toast('تم إلغاء اعتماد الدرجة.'); draw(); } catch (ex) { toast(ex.message, 'error'); }
        } }, 'إلغاء الاعتماد') : null));
    } else gradeBox = h('div', { class: 'card' }, h('h2', null, 'الدرجة'), h('p', null, s.grade_approved ? `الدرجة المعتمدة: ${s.approved_points}` : 'غير معتمدة بعد.'), h('p', { class: 'hint' }, 'اعتماد الدرجات للمتحكم فقط.'));

    // ---- الملاحظات
    const noteTxt = h('textarea', { placeholder: 'أضيفي ملاحظة إدارية' }); const noteVis = h('input', { type: 'checkbox' });
    const notes = h('div', { class: 'card' }, h('h2', null, 'الملاحظات الإدارية'),
      s.admin_notes.length ? h('div', { class: 'timeline' }, s.admin_notes.map((n) => h('div', { class: 'tl' }, n.body, h('br'), h('small', null, `${n.author_name} • ${dateTime(n.created_at)} • ${n.visible_to_student ? 'ظاهرة للطالبة' : 'داخلية'}`)))) : h('p', { class: 'hint' }, 'لا توجد ملاحظات.'),
      h('div', { style: { marginTop: '.8rem' } }, noteTxt, h('label', { class: 'checks', style: { marginTop: '.4rem' } }, noteVis, 'تظهر للطالبة'),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async () => {
          try { apply(await api(`/api/admin/submissions/${s.id}/notes`, { method: 'POST', body: { body: noteTxt.value, visible_to_student: noteVis.checked } })); toast('تمت إضافة الملاحظة.'); draw(); } catch (ex) { toast(ex.message, 'error'); }
        } }, 'إضافة ملاحظة')));

    // ---- السجل + النقل
    const hist = h('div', { class: 'card' }, h('h2', null, 'سجل المشاركة'),
      d.history.length ? h('div', { class: 'timeline' }, d.history.map((x) => h('div', { class: 'tl' }, ACTIONS[x.action] || x.action, x.details && x.details.to ? ` → ${STATUS[x.details.to] || x.details.to}` : '', h('br'), h('small', null, `${x.user_name || 'النظام'} • ${dateTime(x.created_at)}`)))) : h('p', { class: 'hint' }, 'لا توجد عمليات مسجلة.'));
    let moveBox = null;
    if (isAdmin) {
      const target = h('select', null, d.items.filter((i) => i.id !== s.item_id).map((i) => h('option', { value: i.id }, `${i.category_name} › ${i.name}`)));
      moveBox = h('div', { class: 'card' }, h('h2', null, 'نقل المشاركة إلى بند آخر'), h('p', { class: 'hint' }, 'يُسجَّل النقل في السجل، وتعود المشاركة إلى «قيد المراجعة» وتُلغى الدرجة المعتمدة.'), field('البند الجديد', target),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => {
          if (!(await confirmDialog('نقل المشاركة', 'هل تريدين نقل هذه المشاركة إلى البند المحدد؟', 'نقل'))) return;
          try { apply(await api(`/api/admin/submissions/${s.id}/move`, { method: 'POST', body: { item_id: Number(target.value) } })); toast('تم نقل المشاركة.'); draw(); } catch (ex) { toast(ex.message, 'error'); }
        } }, icon('swap', 16), 'نقل'));
    }

    body.replaceChildren(h('div', { class: 'review-grid' },
      h('div', { class: 'grid' },
        h('div', { class: `card sub s-${s.status}` },
          h('div', { class: 'sub-head' }, h('div', null, h('h1', { style: { fontSize: '1.4rem' } }, s.title), h('p', { class: 'hint' }, `${s.category_name} › ${s.item_name}`)), h('div', { class: 'row', style: { gap: '.4rem' } }, statusChip(s.status), gradeBadge(s))),
          h('dl', { class: 'kv' }, h('dt', null, 'الطالبة'), h('dd', null, h('a', { href: `#/admin/student/${s.student_id}` }, s.student_name)),
            h('dt', null, 'المرحلة والفصل'), h('dd', null, `${s.grade_name} — ${s.class_name}`), h('dt', null, 'اسم المستخدم'), h('dd', null, s.school_number),
            h('dt', null, L.description), h('dd', null, s.description), s.benefit ? [h('dt', null, L.benefit), h('dd', null, s.benefit)] : null,
            h('dt', null, L.date), h('dd', null, date(s.activity_date)), s.notes ? [h('dt', null, 'ملاحظات الطالبة'), h('dd', null, s.notes)] : null,
            h('dt', null, 'الفصل الدراسي'), h('dd', null, s.term || '—'), h('dt', null, 'تاريخ الإضافة'), h('dd', null, dateTime(s.created_at)), h('dt', null, 'آخر تعديل للطالبة'), h('dd', null, dateTime(s.edited_at)),
            s.reviewed_at ? [h('dt', null, 'آخر مراجعة'), h('dd', null, `${s.reviewed_by_name || ''} • ${dateTime(s.reviewed_at)}`)] : null),
          d.item.instructions ? h('div', { class: 'note info' }, h('b', null, 'تعليمات الشواهد لهذا البند'), d.item.instructions) : null),
        h('div', { class: 'card' }, h('h2', null, `الشواهد (${s.files.length})`), filesList(s.files, {})), hist),
      h('div', { class: 'grid' }, h('div', { class: 'card' }, h('h2', null, 'مراجعة الشاهد'), reviewForm), gradeBox, notes, moveBox)));
  }
  draw();
  root.append(crumbs({ text: 'مراجعة الشواهد', href: '#/admin/review' }, { text: d.submission.student_name, href: `#/admin/student/${d.submission.student_id}` }, { text: d.submission.item_name, href: `#/admin/student/${d.submission.student_id}/item/${d.submission.item_id}` }, { text: d.submission.title }), body);
}
