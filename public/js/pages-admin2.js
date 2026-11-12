import { h, icon, api, state, q, date, dateTime, empty, confirmDialog, toast, pointsText, pts, field, errBox, showErr, pager, modal, loading, downloadText } from './lib.js';
import { credentialsModal } from './components.js';

const th = (arr) => h('thead', null, h('tr', null, arr.map((t) => h('th', null, t))));

// ======================= إدارة الطالبات =======================
export async function students({ root, query }) {
  const struct = await api('/api/admin/structure');
  const classes = struct.grades.flatMap((g) => g.classes.map((c) => ({ ...c, grade: g.name, grade_id: g.id })));
  const f = { q: query.q || '', grade_id: query.grade_id || '', class_id: query.class_id || '', active: query.active || '' };
  const results = h('div');
  const iq = h('input', { type: 'search', value: f.q, placeholder: 'اسم الطالبة أو اسم المستخدم' });
  const ig = h('select', null, h('option', { value: '' }, 'الكل'), struct.grades.map((g) => h('option', { value: g.id, selected: String(f.grade_id) === String(g.id) }, g.name)));
  const ic = h('select'); const ia = h('select', null, h('option', { value: '' }, 'الكل'), h('option', { value: '1', selected: f.active === '1' }, 'فعّالة'), h('option', { value: '0', selected: f.active === '0' }, 'موقوفة'));
  const fill = () => { ic.replaceChildren(h('option', { value: '' }, 'الكل')); classes.filter((c) => !ig.value || String(c.grade_id) === ig.value).forEach((c) => ic.append(h('option', { value: c.id, selected: String(f.class_id) === String(c.id) }, `${c.grade} — ${c.name}`))); };
  ig.addEventListener('change', () => { f.class_id = ''; fill(); }); fill();

  async function load(page = 1) {
    results.replaceChildren(loading());
    try {
      const r = await api('/api/admin/students' + q({ q: iq.value, grade_id: ig.value, class_id: ic.value, active: ia.value, page }));
      results.replaceChildren(r.rows.length ? h('div', { class: 'table-wrap' }, h('table', null, th(['الطالبة', 'اسم المستخدم', 'المرحلة', 'الفصل', 'المشاركات', 'الشواهد', 'الحالة', 'إجراءات']),
        h('tbody', null, r.rows.map((s) => h('tr', null, h('td', null, h('a', { href: `#/admin/student/${s.id}` }, s.full_name)), h('td', null, s.school_number), h('td', null, s.grade_name), h('td', null, s.class_name),
          h('td', { class: 'num' }, s.submissions), h('td', { class: 'num' }, s.files), h('td', null, h('span', { class: `chip ${s.active ? 'chip-accepted' : 'chip-grey'}` }, s.active ? 'فعّالة' : 'موقوفة')),
          h('td', null, h('div', { class: 'row', style: { gap: '.3rem' } },
            h('a', { class: 'btn btn-ghost btn-sm', href: `#/admin/student/${s.id}` }, 'الملف'),
            h('button', { class: 'btn btn-ghost btn-sm', onclick: () => editModal(s, classes, () => load(page)) }, icon('edit', 14), 'تعديل / نقل'),
            h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => {
              if (!(await confirmDialog('إعادة تعيين كلمة المرور', `سيتم إنشاء كلمة مرور مؤقتة جديدة للطالبة ${s.full_name} وإنهاء جلساتها الحالية.`, 'إعادة التعيين'))) return;
              try { const r2 = await api(`/api/admin/students/${s.id}/reset-password`, { method: 'POST' }); credentialsModal('كلمة مرور مؤقتة جديدة', r2.username, r2.temp_password); } catch (e) { toast(e.message, 'error'); }
            } }, icon('key', 14), 'كلمة مرور')))))))) : empty('لا توجد طالبات مطابقات.', 'users'), pager(r, load));
    } catch (e) { results.replaceChildren(h('div', { class: 'form-error' }, e.message)); }
  }
  root.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'إدارة الطالبات'), h('p', null, 'إضافة الطالبات وتعديل بياناتهن ونقلهن بين الفصول. الملفات والشواهد تبقى محفوظة عند النقل.')),
    h('div', { class: 'actions', style: { marginTop: 0 } }, h('button', { class: 'btn btn-primary', onclick: () => addModal(classes, () => load(1)) }, icon('plus', 18), 'إضافة طالبة'),
      h('button', { class: 'btn btn-ghost', onclick: () => importModal(() => load(1)) }, icon('upload', 18), 'استيراد من ملف CSV'),
      h('a', { class: 'btn btn-ghost', href: '/api/admin/reports/students/export' }, icon('download', 18), 'تصدير Excel'))),
    h('form', { class: 'card', onsubmit: (e) => { e.preventDefault(); load(1); } }, h('div', { class: 'filters' }, field('بحث', iq), field('المرحلة', ig), field('الفصل', ic), field('الحساب', ia)),
      h('div', { class: 'actions', style: { marginTop: 0 } }, h('button', { class: 'btn btn-primary' }, icon('search', 18), 'بحث'), h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { location.hash = '#/admin/students'; } }, 'مسح عوامل التصفية'))),
    h('div', { style: { marginTop: '1rem' } }, results));
  load(1);
}

const classSelect = (classes, value) => h('select', null, classes.filter((c) => c.active || c.id === value).map((c) => h('option', { value: c.id, selected: c.id === value }, `${c.grade} — ${c.name}`)));

function addModal(classes, done) {
  modal('إضافة طالبة', (body, close) => {
    const err = errBox(); const name = h('input', { type: 'text', maxlength: 100 }); const cl = classSelect(classes);
    body.append(err, field('الاسم الكامل', name), h('p', { class: 'hint' }, 'يُولَّد اسم المستخدم وكلمة المرور المؤقتة تلقائيًا ويظهران بعد الإنشاء.'), field('المرحلة والفصل', cl),
      h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', onclick: async () => {
        try { const r = await api('/api/admin/students', { method: 'POST', body: { full_name: name.value, class_id: Number(cl.value) } }); close(); credentialsModal('تم إنشاء حساب الطالبة', r.username, r.temp_password); done(); } catch (e) { showErr(err, e); }
      } }, 'إنشاء الحساب'), h('button', { class: 'btn btn-ghost', onclick: close }, 'إلغاء')));
  });
}

function editModal(s, classes, done) {
  modal(`تعديل: ${s.full_name}`, (body, close) => {
    const err = errBox(); const name = h('input', { type: 'text', value: s.full_name }); 
    const active = h('input', { type: 'checkbox', checked: !!s.active }); const cl = classSelect(classes, s.class_id);
    body.append(err, field('الاسم الكامل', name), h('p', { class: 'hint' }, `اسم المستخدم: ${s.school_number}`), h('label', { class: 'checks' }, active, 'الحساب فعّال'),
      h('div', { class: 'actions', style: { marginTop: 0 } }, h('button', { class: 'btn btn-primary', onclick: async () => {
        try { await api(`/api/admin/students/${s.id}`, { method: 'PUT', body: { full_name: name.value, active: active.checked } }); toast('تم حفظ البيانات.'); close(); done(); } catch (e) { showErr(err, e); }
      } }, 'حفظ البيانات')),
      h('hr'), h('h3', null, 'نقل إلى فصل آخر'), h('p', { class: 'hint' }, 'يبقى ملف الطالبة وشواهدها السابقة محفوظة كما هي.'), field('الفصل الجديد', cl),
      h('button', { class: 'btn btn-amber btn-sm', onclick: async () => {
        try { await api(`/api/admin/students/${s.id}/move`, { method: 'POST', body: { class_id: Number(cl.value) } }); toast('تم نقل الطالبة.'); close(); done(); } catch (e) { showErr(err, e); }
      } }, icon('swap', 16), 'نقل الطالبة'));
  });
}

function importModal(done) {
  modal('استيراد الطالبات من ملف CSV', (body, close) => {
    const err = errBox(); const ta = h('textarea', { style: { minHeight: '140px' }, dir: 'auto', placeholder: 'الاسم,المرحلة,الفصل\nنورة أحمد العتيبي,أول ثانوي,الفصل الأول' });
    const file = h('input', { type: 'file', accept: '.csv,.txt', onchange: async () => { if (file.files[0]) ta.value = await file.files[0].text(); } });
    const out = h('div');
    body.append(err, h('p', { class: 'hint' }, 'الأعمدة: الاسم، المرحلة (أول ثانوي / ثاني ثانوي / ثالث ثانوي أو 1 و2 و3)، الفصل (الفصل الأول… أو رقمه). يمكن تصدير الملف من Excel بصيغة CSV.'),
      field('اختيار ملف', file), field('أو الصقي البيانات هنا', ta), out,
      h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', onclick: async (e) => {
        err.hidden = true; e.target.disabled = true;
        try {
          const r = await api('/api/admin/students/import', { method: 'POST', body: { csv: ta.value } });
          out.replaceChildren(h('div', { class: 'note info' }, h('b', null, `تم إنشاء ${r.created.length} حساب، وتخطي ${r.skipped.length}`), 'كلمات المرور المؤقتة تظهر مرة واحدة؛ نزّلي الملف الآن وسلّميها للطالبات بسرية.'),
            r.created.length ? h('button', { class: 'btn btn-amber btn-sm', style: { margin: '.6rem 0' }, onclick: () => downloadText('athar87-new-accounts.csv', 'الاسم,اسم المستخدم,كلمة المرور المؤقتة,المرحلة,الفصل\n' + r.created.map((c) => [c.full_name, c.school_number, c.temp_password, c.grade, c.class].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')) }, icon('download', 16), 'تنزيل بيانات الدخول (CSV)') : null,
            r.skipped.length ? h('div', null, h('h3', null, 'الصفوف المتخطاة'), h('ul', null, r.skipped.map((s) => h('li', null, `سطر ${s.row}: ${s.name || '—'} (${s.school_number || '—'}) — ${s.reason}`)))) : null);
          done();
        } catch (ex) { showErr(err, ex); } finally { e.target.disabled = false; }
      } }, 'استيراد'), h('button', { class: 'btn btn-ghost', onclick: close }, 'إغلاق')));
  }, { wide: true });
}

// ======================= إدارة البنود =======================
export async function items({ root }) {
  const d = await api('/api/admin/items');
  const isAdmin = state.user.role === 'admin';
  root.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'إدارة بنود السلوك المتميز'), h('p', null, 'البنود الرسمية ودرجاتها ثابتة ولا تُحذف. يمكن تعديل الوصف وتعليمات الشواهد وإيقاف البند وترتيبه.'))));
  for (const c of d.categories) {
    root.append(h('section', { style: { marginBottom: '1.5rem', '--cat': c.color } }, h('div', { class: 'cat-title' }, h('h2', null, c.name)),
      h('div', { class: 'table-wrap' }, h('table', null, th(['', 'البند', 'الدرجة المحددة', 'المشاركات', 'الشواهد', 'الحالة', '']),
        h('tbody', null, c.items.map((i, idx) => h('tr', null,
          h('td', null, isAdmin ? h('div', { class: 'row', style: { gap: 0, flexWrap: 'nowrap' } },
            h('button', { class: 'icon-btn', disabled: idx === 0, 'aria-label': 'تقديم', onclick: () => move(i, 'up') }, icon('up', 16)), h('button', { class: 'icon-btn', disabled: idx === c.items.length - 1, 'aria-label': 'تأخير', onclick: () => move(i, 'down') }, icon('down', 16))) : null),
          h('td', null, h('b', null, i.name), i.group_name ? h('div', { class: 'hint' }, i.group_name) : null, h('div', { class: 'hint' }, i.description), i.instructions ? h('div', { class: 'chip chip-teal' }, 'تعليمات: ' + i.instructions.slice(0, 60)) : null),
          h('td', null, h('span', { class: 'badge-pts' }, pointsText(i))), h('td', { class: 'num' }, i.submissions), h('td', { class: 'num' }, i.files),
          h('td', null, h('span', { class: `chip ${i.active ? 'chip-accepted' : 'chip-grey'}` }, i.active ? 'فعّال' : 'موقوف'), !i.student_submit ? h('div', { class: 'hint' }, 'يوثَّق من الإدارة') : null),
          h('td', null, isAdmin ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => edit(i) }, icon('edit', 14), 'تعديل') : null))))))));
  }
  async function move(i, dir) { try { await api(`/api/admin/items/${i.id}/reorder`, { method: 'POST', body: { direction: dir } }); location.reload(); } catch (e) { toast(e.message, 'error'); }
  }
  function edit(i) {
    modal(`تعديل البند`, (body, close) => {
      const err = errBox(); const desc = h('textarea'); desc.value = i.description; const ins = h('textarea'); ins.value = i.instructions; const act = h('input', { type: 'checkbox', checked: i.active });
      body.append(err, h('p', null, h('b', null, i.name), ' — ', pointsText(i), h('span', { class: 'hint' }, ' (الاسم والدرجة ثابتان)')), field('وصف البند', desc), field('تعليمات خاصة بالشواهد (تظهر للطالبة)', ins),
        h('label', { class: 'checks' }, act, 'البند فعّال (يسمح بإضافة مشاركات جديدة)'),
        i.submissions ? h('div', { class: 'note warn' }, `يوجد ${i.submissions} مشاركة سابقة؛ إيقاف البند لا يحذفها وتبقى ظاهرة للطالبات والإدارة.`) : null,
        h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', onclick: async () => {
          try { await api(`/api/admin/items/${i.id}`, { method: 'PUT', body: { description: desc.value, instructions: ins.value, active: act.checked } }); toast('تم حفظ البند.'); close(); location.reload(); } catch (e) { showErr(err, e); }
        } }, 'حفظ'), h('button', { class: 'btn btn-ghost', onclick: close }, 'إلغاء')));
    });
  }
}

// ======================= التقارير =======================
export async function reports({ root, query }) {
  const struct = await api('/api/admin/structure');
  const tab = query.tab || 'students';
  const f = { grade_id: query.grade_id || '', class_id: query.class_id || '', from: query.from || '', to: query.to || '' };
  const TABS = { students: 'تقارير الطالبات', items: 'تقارير البنود', admin: 'التقارير الإدارية' };
  const out = h('div');
  const ig = h('select', null, h('option', { value: '' }, 'كل المراحل'), struct.grades.map((g) => h('option', { value: g.id, selected: String(f.grade_id) === String(g.id) }, g.name)));
  const ic = h('select'); const fill = () => { ic.replaceChildren(h('option', { value: '' }, 'كل الفصول')); struct.grades.filter((g) => !ig.value || String(g.id) === ig.value).forEach((g) => g.classes.forEach((c) => ic.append(h('option', { value: c.id, selected: String(f.class_id) === String(c.id) }, `${g.name} — ${c.name}`)))); };
  ig.addEventListener('change', () => { f.class_id = ''; fill(); }); fill();
  const from = h('input', { type: 'date', value: f.from }); const to = h('input', { type: 'date', value: f.to });
  const params = () => (tab === 'admin' ? { from: from.value, to: to.value } : { grade_id: ig.value, class_id: ic.value });
  const dl = h('a', { class: 'btn btn-ghost', href: '#' });
  async function load() {
    out.replaceChildren(loading());
    dl.href = `/api/admin/reports/${tab}/export${q(params())}`;
    history.replaceState(null, '', `#/admin/reports${q({ tab, ...params() })}`);
    try {
      const r = await api(`/api/admin/reports/${tab}` + q(params()));
      out.replaceChildren(h('div', { class: 'print-only print-head' }, h('h1', null, `${r.platform_name} — ${r.school_name}`), h('p', null, `${r.title} — تاريخ الإصدار: ${date(r.generated_at)}`)),
        ...r.sections.map((s) => h('section', { style: { marginTop: '1.4rem' } }, h('h2', null, s.title), s.note ? h('div', { class: 'note info', style: { marginBottom: '.6rem' } }, s.note) : null,
          s.rows.length ? h('div', { class: 'table-wrap' }, h('table', null, th(s.columns), h('tbody', null, s.rows.map((row, i) => h('tr', null, row.map((c, j) => h('td', { class: typeof c === 'number' ? 'num' : '' },
            j === 0 && s.links && s.links[i] ? h('a', { href: '#' + s.links[i] }, String(c)) : (c === null || c === undefined ? '' : String(c))))))))) : empty('لا توجد بيانات لعرضها في هذا القسم.', 'chart'))));
    } catch (e) { out.replaceChildren(h('div', { class: 'form-error' }, e.message)); }
  }
  root.append(h('div', { class: 'page-head no-print' }, h('div', null, h('h1', null, 'التقارير والإحصاءات'), h('p', null, 'تُحسب جميع الأرقام من قاعدة البيانات مباشرة. عدد الملفات لا يمثل تقييمًا شاملًا لسلوك الطالبة.'))),
    h('div', { class: 'tabs no-print' }, Object.entries(TABS).map(([k, v]) => h('a', { class: `tab${k === tab ? ' active' : ''}`, href: `#/admin/reports?tab=${k}`, style: { textDecoration: 'none' } }, v))),
    h('form', { class: 'card no-print', onsubmit: (e) => { e.preventDefault(); load(); } }, h('div', { class: 'filters' },
      tab === 'admin' ? [field('من تاريخ', from), field('إلى تاريخ', to)] : [field('المرحلة', ig), field('الفصل', ic)]),
      h('div', { class: 'actions', style: { marginTop: 0 } }, h('button', { class: 'btn btn-primary' }, 'عرض التقرير'), dl, ...[h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => window.print() }, icon('print', 18), 'حفظ PDF / طباعة')],
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { location.hash = `#/admin/reports?tab=${tab}`; } }, 'مسح عوامل التصفية'))),
    out);
  dl.prepend(icon('download', 18)); dl.append('تصدير Excel');
  load();
}

// ======================= الإعدادات =======================
export async function settings({ root }) {
  const d = await api('/api/admin/settings');
  const s = d.settings;
  const struct = await api('/api/admin/structure');
  const accounts = (await api('/api/admin/accounts')).accounts;
  const save = async (body, msg = 'تم حفظ الإعدادات.') => { try { await api('/api/admin/settings', { method: 'PUT', body }); toast(msg); } catch (e) { toast(e.message, 'error'); } };

  // عام
  const term = h('input', { type: 'text', value: s.current_term }); const ret = h('input', { type: 'number', min: 7, max: 3650, value: s.retention_days });
  const general = h('div', { class: 'card' }, h('h2', null, 'الإعدادات العامة'), field('الفصل الدراسي الحالي', term, 'يُسجَّل مع كل مشاركة جديدة، ويُستخدم لسجل الانضباط.'),
    field('مدة الاحتفاظ بالملفات المحذوفة (أيام)', ret, 'بعدها تُزال نهائيًا بالأمر: npm run purge'), h('button', { class: 'btn btn-primary', onclick: () => save({ current_term: term.value, retention_days: Number(ret.value) }) }, 'حفظ'));

  // تسجيل الطالبات الذاتي
  const regOn = h('input', { type: 'checkbox', checked: s.self_registration !== false });
  const regCode = h('input', { type: 'text', value: s.registration_code || '', maxlength: 40, dir: 'ltr', style: { textAlign: 'start' }, placeholder: 'بدون رمز' });
  const reg = h('div', { class: 'card' }, h('h2', null, 'تسجيل الطالبات بأنفسهن'),
    h('p', { class: 'hint' }, 'عند التفعيل تنشئ الطالبة حسابها من صفحة «إنشاء حساب جديد». يُنصح بوضع رمز تسجيل تعطينه لطالبات المدرسة فقط، حتى لا يستطيع أي شخص يعرف رابط الموقع إنشاء حساب.'),
    h('label', { class: 'checks' }, regOn, 'السماح للطالبات بإنشاء حساباتهن'), field('رمز التسجيل (اختياري)', regCode, 'تُطلب من الطالبة كتابته عند إنشاء الحساب.'),
    h('button', { class: 'btn btn-primary', onclick: () => save({ self_registration: regOn.checked, registration_code: regCode.value }) }, 'حفظ'));

  // الملفات
  const checks = d.types.map((t) => { const c = h('input', { type: 'checkbox', checked: s.allowed_types.includes(t.key), value: t.key }); return [c, t.label]; });
  const mb = h('input', { type: 'number', min: 1, max: 50, value: s.max_file_mb }); const mf = h('input', { type: 'number', min: 1, max: 20, value: s.max_files_per_submission });
  const files = h('div', { class: 'card' }, h('h2', null, 'قواعد رفع الملفات'), h('div', { class: 'checks' }, checks.map(([c, l]) => h('label', null, c, l))),
    h('div', { class: 'row' }, field('الحد الأقصى لحجم الملف (ميجابايت)', mb), field('الحد الأقصى لعدد الملفات في المشاركة', mf)),
    h('button', { class: 'btn btn-primary', onclick: () => save({ allowed_types: checks.filter(([c]) => c.checked).map(([c]) => c.value), max_file_mb: Number(mb.value), max_files_per_submission: Number(mf.value) }) }, 'حفظ'));

  // قواعد المجموع
  const overall = h('input', { type: 'number', min: 0, value: s.total_rule.overall_cap ?? '', placeholder: 'بلا حد' });
  const caps = d.categories.map((c) => [c, h('input', { type: 'number', min: 0, value: (s.total_rule.category_caps || {})[c.id] ?? '', placeholder: 'بلا حد' })]);
  const rules = h('div', { class: 'card' }, h('h2', null, 'قواعد احتساب المجموع النهائي'),
    h('p', { class: 'hint' }, 'لا يوجد أي حد أقصى افتراضي. أدخلي الحدود فقط بعد اعتمادها رسميًا من المدرسة. لا تغيّر هذه القواعد الدرجات الأصلية لكل بند، وإنما طريقة جمعها في التقارير وملف الطالبة.'),
    field('الحد الأقصى للمجموع الكلي (اختياري)', overall), h('div', { class: 'row' }, caps.map(([c, i]) => field(`حد فئة «${c.name}»`, i))),
    h('button', { class: 'btn btn-primary', onclick: () => save({ total_rule: { overall_cap: overall.value === '' ? null : Number(overall.value), category_caps: Object.fromEntries(caps.filter(([, i]) => i.value !== '').map(([c, i]) => [c.id, Number(i.value)])) } }) }, 'حفظ القواعد'));

  // الفصول
  const classesCard = h('div', { class: 'card' }, h('h2', null, 'المراحل والفصول'), h('p', { class: 'hint' }, 'الفصول الرسمية: أول ثانوي (5)، ثاني ثانوي (5)، ثالث ثانوي (4). يمكن إضافة فصل جديد عند الحاجة فقط.'),
    struct.grades.map((g) => h('div', { style: { marginBottom: '.8rem' } }, h('b', null, g.name), h('div', { class: 'row', style: { gap: '.4rem', marginTop: '.3rem', alignItems: 'center' } },
      g.classes.map((c) => h('button', { class: `chip ${c.active ? 'chip-teal' : 'chip-grey'}`, style: { border: 0, cursor: 'pointer' }, title: 'تعديل الفصل', onclick: () => editClass(c) }, `${c.name} (${c.students})${c.active ? '' : ' — موقوف'}`)),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => addClass(g) }, icon('plus', 14), 'إضافة فصل')))));
  function addClass(g) { modal(`إضافة فصل إلى ${g.name}`, (b, close) => { const err = errBox(); const n = h('input', { type: 'text', placeholder: 'مثال: الفصل السادس' });
    b.append(err, field('اسم الفصل', n), h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', onclick: async () => { try { await api('/api/admin/classes', { method: 'POST', body: { grade_id: g.id, name: n.value } }); toast('تمت إضافة الفصل.'); close(); location.reload(); } catch (e) { showErr(err, e); } } }, 'إضافة'))); }); }
  function editClass(c) { modal(`تعديل ${c.name}`, (b, close) => { const err = errBox(); const n = h('input', { type: 'text', value: c.name }); const a = h('input', { type: 'checkbox', checked: c.active });
    b.append(err, field('اسم الفصل', n), h('label', { class: 'checks' }, a, 'الفصل فعّال'), h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', onclick: async () => { try { await api(`/api/admin/classes/${c.id}`, { method: 'PUT', body: { name: n.value, active: a.checked } }); toast('تم الحفظ.'); close(); location.reload(); } catch (e) { showErr(err, e); } } }, 'حفظ'))); }); }

  // حسابات الإدارة
  const accCard = h('div', { class: 'card' }, h('h2', null, 'حسابات الإدارة'),
    h('p', { class: 'hint' }, 'المتحكم: كل الصلاحيات. المراجِعة: تعاين الشواهد وتراجعها وتضيف ملاحظات، دون اعتماد الدرجات أو إدارة الحسابات.'),
    h('div', { class: 'table-wrap' }, h('table', null, th(['الاسم', 'اسم المستخدم', 'الدور', 'الحالة', 'آخر دخول', '']), h('tbody', null, accounts.map((a) => h('tr', null, h('td', null, a.full_name), h('td', { dir: 'ltr', style: { textAlign: 'start' } }, a.username), h('td', null, a.role === 'admin' ? 'متحكم' : 'مراجِعة'),
      h('td', null, a.active ? 'فعّال' : 'موقوف'), h('td', null, dateTime(a.last_login_at)),
      h('td', null, h('div', { class: 'row', style: { gap: '.3rem' } }, h('button', { class: 'btn btn-ghost btn-sm', onclick: () => accEdit(a) }, 'تعديل'),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { if (!(await confirmDialog('إعادة تعيين كلمة المرور', `لحساب ${a.full_name}`, 'إعادة التعيين'))) return; try { const r = await api(`/api/admin/accounts/${a.id}/reset-password`, { method: 'POST' }); credentialsModal('كلمة مرور مؤقتة', r.username, r.temp_password); } catch (e) { toast(e.message, 'error'); } } }, 'كلمة مرور')))))))),
    h('button', { class: 'btn btn-ghost btn-sm', style: { marginTop: '.8rem' }, onclick: accAdd }, icon('plus', 14), 'إضافة حساب إداري'));
  function accAdd() { modal('إضافة حساب إداري', (b, close) => { const err = errBox(); const n = h('input', { type: 'text' }); const u = h('input', { type: 'text', dir: 'ltr', style: { textAlign: 'start' } }); const r = h('select', null, h('option', { value: 'reviewer' }, 'مراجِعة'), h('option', { value: 'admin' }, 'متحكم'));
    b.append(err, field('الاسم الكامل', n), field('اسم المستخدم', u), field('الدور', r), h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', onclick: async () => { try { const x = await api('/api/admin/accounts', { method: 'POST', body: { full_name: n.value, username: u.value, role: r.value } }); close(); credentialsModal('تم إنشاء الحساب', x.username, x.temp_password); } catch (e) { showErr(err, e); } } }, 'إنشاء'))); }); }
  function accEdit(a) { modal('تعديل الحساب', (b, close) => { const err = errBox(); const n = h('input', { type: 'text', value: a.full_name }); const r = h('select', null, h('option', { value: 'reviewer', selected: a.role === 'reviewer' }, 'مراجِعة'), h('option', { value: 'admin', selected: a.role === 'admin' }, 'متحكم')); const ac = h('input', { type: 'checkbox', checked: a.active });
    b.append(err, field('الاسم', n), field('الدور', r), h('label', { class: 'checks' }, ac, 'الحساب فعّال'), h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', onclick: async () => { try { await api(`/api/admin/accounts/${a.id}`, { method: 'PUT', body: { full_name: n.value, role: r.value, active: ac.checked } }); toast('تم الحفظ.'); close(); location.reload(); } catch (e) { showErr(err, e); } } }, 'حفظ'))); }); }

  // الخصوصية
  const pol = h('textarea', { style: { minHeight: '260px' } }); pol.value = s.privacy_policy;
  const policy = h('div', { class: 'card' }, h('h2', null, 'سياسة الخصوصية'), h('div', { class: 'note warn', style: { marginBottom: '.8rem' } }, 'النص الافتراضي مقترح للتنظيم الداخلي. يجب مراجعته واعتماده من إدارة المدرسة والجهة المختصة بحماية البيانات الشخصية (نظام حماية البيانات الشخصية في المملكة) قبل الاستخدام الفعلي. صيغة العناوين: ## عنوان، والقوائم: - بند.'),
    field('نص السياسة', pol), h('button', { class: 'btn btn-primary', onclick: () => save({ privacy_policy: pol.value }, 'تم حفظ سياسة الخصوصية.') }, 'حفظ السياسة'));

  root.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'إعدادات المنصة'))), h('div', { class: 'grid grid-2' }, general, reg, files, rules, classesCard), h('div', { class: 'grid', style: { marginTop: '1rem' } }, accCard, policy));
}

// ======================= سجل العمليات =======================
export const ACTIONS = { 'student.register': 'تسجيل طالبة بنفسها', login: 'تسجيل دخول', 'login.fail': 'محاولة دخول فاشلة', logout: 'تسجيل خروج', 'password.change': 'تغيير كلمة مرور', 'password.reset': 'إعادة تعيين كلمة مرور', 'submission.create': 'إضافة مشاركة', 'submission.update': 'تعديل مشاركة', 'submission.delete': 'حذف مشاركة', 'submission.review': 'مراجعة شاهد', 'submission.move': 'نقل مشاركة', 'submission.reset_on_edit': 'إعادة للمراجعة بعد التعديل', 'grade.approve': 'اعتماد درجة', 'grade.revoke': 'إلغاء درجة', 'grade.revoke_on_status': 'إلغاء درجة بسبب تغيير الحالة', 'file.upload': 'رفع ملف', 'file.delete': 'حذف ملف', 'file.replace': 'استبدال ملف', 'file.download': 'تنزيل ملف (إدارة)', 'note.add': 'إضافة ملاحظة', 'student.create': 'إضافة طالبة', 'student.update': 'تعديل طالبة', 'student.move': 'نقل طالبة', 'student.import': 'استيراد طالبات', 'discipline.create': 'سجل انضباط', 'item.update': 'تعديل بند', 'item.reorder': 'ترتيب البنود', 'class.create': 'إضافة فصل', 'class.update': 'تعديل فصل', 'settings.update': 'تعديل الإعدادات', 'account.create': 'إضافة حساب إداري', 'account.update': 'تعديل حساب إداري', 'report.export': 'تصدير تقرير', 'files.purge': 'إزالة نهائية للملفات' };
export async function audit({ root, query }) {
  const out = h('div');
  const group = h('select', null, h('option', { value: '' }, 'كل العمليات'), ['login', 'grade.', 'submission.', 'student.', 'file.', 'password.', 'settings.', 'account.', 'report.'].map((g) => h('option', { value: g, selected: query.action === g }, g)));
  const from = h('input', { type: 'date', value: query.from || '' }); const to = h('input', { type: 'date', value: query.to || '' });
  async function load(page = 1) {
    out.replaceChildren(loading());
    try {
      const r = await api('/api/admin/audit' + q({ action: group.value, from: from.value, to: to.value, page }));
      out.replaceChildren(r.rows.length ? h('div', { class: 'table-wrap' }, h('table', null, th(['الوقت', 'المستخدم', 'العملية', 'التفاصيل', 'IP']),
        h('tbody', null, r.rows.map((x) => h('tr', null, h('td', null, dateTime(x.created_at)), h('td', null, x.user_name || '—'), h('td', null, ACTIONS[x.action] || x.action),
          h('td', { style: { maxWidth: '420px', overflowWrap: 'anywhere' } }, x.entity ? `${x.entity} #${x.entity_id ?? ''} ` : '', x.details ? JSON.stringify(x.details) : ''), h('td', { dir: 'ltr' }, x.ip || '')))))) : empty('لا توجد عمليات مسجلة.', 'shield'), pager(r, load));
    } catch (e) { out.replaceChildren(h('div', { class: 'form-error' }, e.message)); }
  }
  root.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'سجل العمليات'), h('p', null, 'تُسجَّل العمليات المهمة: الدخول، المراجعة، اعتماد الدرجات، الإدارة، التنزيل والتصدير.'))),
    h('form', { class: 'card', onsubmit: (e) => { e.preventDefault(); load(1); } }, h('div', { class: 'filters' }, field('نوع العملية', group), field('من', from), field('إلى', to)), h('button', { class: 'btn btn-primary' }, 'تصفية')), h('div', { style: { marginTop: '1rem' } }, out));
  load(1);
}
