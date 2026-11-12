import { h, icon, api, state, field, errBox, showErr, pointsText, toast, clear } from './lib.js';

export function notFound() {
  return h('div', { class: 'card', style: { textAlign: 'center', padding: '3rem 1rem' } }, icon('alert', 40), h('h1', null, 'الصفحة غير موجودة'),
    h('p', null, 'الرابط الذي فتحتِه غير صحيح أو لم يعد متاحًا.'), h('a', { class: 'btn btn-primary', href: '#/' }, 'العودة إلى الصفحة الرئيسية'));
}

const CAT_COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)'];

export async function home({ root }) {
  const data = await api('/api/public/home');
  const hero = h('section', { class: 'hero' }, h('div', { class: 'hero-in' },
    h('div', null,
      h('h1', null, 'أَثَر 87'), h('div', { class: 'en' }, 'ATHAR 87'),
      h('p', { class: 'tag' }, '«كل سلوك إيجابي يترك أثرًا، وكل إنجاز يستحق التوثيق».'),
      h('p', { class: 'school' }, 'منصة المدرسة الثانوية 87 لتنظيم وتوثيق السلوك المتميز لدى الطالبات؛ تدخل كل طالبة إلى ملفها الخاص، وترفع شواهد مشاركاتها لكل بند، وتتولى الإدارة مراجعتها واعتماد الدرجات وفق إجراءات المدرسة.'),
      h('div', { class: 'actions' },
        h('a', { class: 'btn btn-amber', href: '#/login/student' }, icon('user', 20), 'بوابة الطالبة'),
        h('a', { class: 'btn btn-ghost', style: { color: '#fff', borderColor: 'rgba(255,255,255,.5)' }, href: '#/login/admin' }, icon('shield', 20), 'بوابة المتحكم'))),
    h('img', { class: 'logo-big', src: '/assets/logo.svg', alt: 'شعار أَثَر 87' })));

  const steps = [
    ['سجّلي الدخول', 'تستلم كل طالبة اسم المستخدم وكلمة مرور مؤقتة من إدارة المدرسة، وتغيّرها عند أول دخول.'],
    ['افتحي مجلد البند', 'ستجدين مجلدًا مستقلًا لكل بند من بنود السلوك المتميز، مع وصفه ودرجته.'],
    ['أضيفي مشاركتك وشواهدها', 'اكتبي عنوان المشاركة ووصفها وتاريخها، وارفعي الصور أو ملفات PDF أو المستندات.'],
    ['تابعي المراجعة', 'تراجع الإدارة الشاهد: قيد المراجعة، أو مقبول، أو يحتاج إلى استكمال مع ملاحظة توضح المطلوب.'],
  ];
  const how = h('section', { class: 'section' }, h('h2', null, 'كيف تعمل المنصة؟'),
    h('div', { class: 'grid grid-4' }, steps.map(([t, d], i) => h('div', { class: 'card step' }, h('span', { class: 'n' }, i + 1), h('h3', null, t), h('p', { class: 'hint' }, d)))));

  const cats = h('section', { class: 'section' }, h('h2', null, 'بنود السلوك المتميز'),
    h('div', { class: 'grid grid-2' }, data.categories.map((c, i) => {
      let lastGroup = null;
      return h('div', { class: 'card cat-card', style: { '--cat': c.color } },
        h('h3', null, c.name),
        h('ul', null, c.items.map((it) => {
          const g = it.group_name && it.group_name !== lastGroup ? h('div', { class: 'grp' }, it.group_name) : null;
          lastGroup = it.group_name;
          return [g, h('li', null, icon(it.icon, 18), h('span', null, it.name, h('br'), h('span', { class: 'hint' }, pointsText(it))))];
        })));
    })));
  root.append(hero, how, cats);
}

export async function login({ root, params }) {
  const portal = params[0];
  if (state.user) { location.hash = state.user.role === 'student' ? '#/student' : '#/admin'; return; }
  const isStudent = portal === 'student';
  const err = errBox();
  const user = h('input', { type: 'text', name: 'username', autocomplete: 'username', required: true, dir: 'ltr', style: { textAlign: 'start' } });
  const pass = h('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: true, dir: 'ltr', style: { textAlign: 'start' } });
  const btn = h('button', { class: 'btn btn-primary', type: 'submit', style: { width: '100%' } }, 'تسجيل الدخول');
  const form = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.hidden = true; btn.disabled = true;
    try {
      const r = await api(`/api/auth/login/${portal}`, { method: 'POST', body: { username: user.value, password: pass.value } });
      state.user = r.user;
      location.hash = r.user.must_change_password ? '#/change-password' : isStudent ? '#/student' : '#/admin';
    } catch (ex) { showErr(err, ex); } finally { btn.disabled = false; }
  } }, err,
    field(isStudent ? 'اسم المستخدم' : 'اسم المستخدم', user),
    field('كلمة المرور', pass), btn);
  root.append(h('div', { class: 'auth' }, h('div', { class: 'card' },
    h('div', { class: 'auth-head' }, h('img', { src: '/assets/logo.svg', alt: '' }), h('h1', { style: { fontSize: '1.5rem' } }, isStudent ? 'بوابة الطالبة' : 'بوابة المتحكم'),
      h('p', { class: 'hint' }, isStudent ? 'أدخلي اسم المستخدم وكلمة المرور الخاصين بك.' : 'الدخول للحسابات الإدارية المعتمدة فقط.')),
    form,
    h('p', { class: 'hint', style: { marginTop: '1rem', textAlign: 'center' } }, isStudent ? 'نسيتِ كلمة المرور؟ تواصلي مع وكيلة شؤون الطلاب.' : 'لا يمكن إنشاء حسابات الإدارة إلا من متحكم موجود أو من خادم المنصة.'),
    isStudent ? h('p', { style: { textAlign: 'center' } }, 'ليس لديك حساب؟ ', h('a', { href: '#/register', style: { fontWeight: 700 } }, 'إنشاء حساب جديد')) : null,
    h('p', { style: { textAlign: 'center', marginBottom: 0 } }, h('a', { href: isStudent ? '#/login/admin' : '#/login/student' }, isStudent ? 'الانتقال إلى بوابة المتحكم' : 'الانتقال إلى بوابة الطالبة')))));
}

export async function changePassword({ root }) {
  const err = errBox();
  const forced = state.user.must_change_password;
  const cur = h('input', { type: 'password', autocomplete: 'current-password', required: true, dir: 'ltr' });
  const nw = h('input', { type: 'password', autocomplete: 'new-password', required: true, dir: 'ltr' });
  const nw2 = h('input', { type: 'password', autocomplete: 'new-password', required: true, dir: 'ltr' });
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault(); err.hidden = true;
    if (nw.value !== nw2.value) return showErr(err, new Error('كلمتا المرور الجديدتان غير متطابقتين.'));
    try {
      await api('/api/auth/change-password', { method: 'POST', body: { current_password: cur.value, new_password: nw.value } });
      state.user.must_change_password = false;
      toast('تم تغيير كلمة المرور بنجاح.');
      location.hash = state.user.role === 'student' ? '#/student' : '#/admin';
    } catch (ex) { showErr(err, ex); }
  } }, err,
    field(forced ? 'كلمة المرور المؤقتة' : 'كلمة المرور الحالية', cur), field('كلمة المرور الجديدة', nw, '8 أحرف على الأقل، وتحتوي أحرفًا وأرقامًا.'),
    field('تأكيد كلمة المرور الجديدة', nw2), h('button', { class: 'btn btn-primary', type: 'submit' }, 'حفظ كلمة المرور'));
  root.append(h('div', { class: 'auth' }, h('div', { class: 'card' }, h('h1', { style: { fontSize: '1.4rem' } }, 'تغيير كلمة المرور'),
    forced ? h('div', { class: 'note warn' }, 'هذه كلمة مرور مؤقتة؛ يجب تغييرها قبل المتابعة.') : null, form)));
}

export async function privacy({ root }) {
  const { text } = await api('/api/public/privacy');
  const body = h('div', { class: 'card policy' }, h('h1', null, 'سياسة الخصوصية'));
  let list = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) { list = null; body.append(h('h2', null, line.slice(3))); }
    else if (line.startsWith('- ')) { if (!list) { list = h('ul'); body.append(list); } list.append(h('li', null, line.slice(2))); }
    else if (line.trim()) { list = null; body.append(h('p', null, line)); }
  }
  root.append(h('div', { style: { maxWidth: '820px', margin: 'auto' } }, body));
}

export async function register({ root }) {
  if (state.user) { location.hash = state.user.role === 'student' ? '#/student' : '#/admin'; return; }
  const info = await api('/api/public/register-info');
  if (!info.open) {
    root.append(h('div', { class: 'auth' }, h('div', { class: 'card' }, h('h1', { style: { fontSize: '1.4rem' } }, 'إنشاء حساب'),
      h('div', { class: 'note warn' }, 'إنشاء الحسابات الذاتي متوقف حاليًا. تواصلي مع وكيلة شؤون الطلاب.'),
      h('p', { style: { marginBottom: 0 } }, h('a', { href: '#/login/student' }, 'العودة إلى تسجيل الدخول')))));
    return;
  }
  const err = errBox();
  const name = h('input', { type: 'text', maxlength: 100, autocomplete: 'name', required: true });
  const user = h('input', { type: 'text', maxlength: 20, autocomplete: 'username', required: true, dir: 'ltr', style: { textAlign: 'start' } });
  const pw = h('input', { type: 'password', autocomplete: 'new-password', required: true, dir: 'ltr', style: { textAlign: 'start' } });
  const pw2 = h('input', { type: 'password', autocomplete: 'new-password', required: true, dir: 'ltr', style: { textAlign: 'start' } });
  const code = h('input', { type: 'text', maxlength: 40, dir: 'ltr', style: { textAlign: 'start' } });
  const grade = h('select', null, h('option', { value: '' }, 'اختاري المرحلة'), info.grades.map((g) => h('option', { value: g.id }, g.name)));
  const cls = h('select', { disabled: true }, h('option', { value: '' }, 'اختاري المرحلة أولًا'));
  grade.onchange = () => {
    const g = info.grades.find((x) => String(x.id) === grade.value);
    cls.replaceChildren(h('option', { value: '' }, 'اختاري الفصل'), ...(g ? g.classes.map((c) => h('option', { value: c.id }, c.name)) : []));
    cls.disabled = !g;
  };
  const btn = h('button', { class: 'btn btn-primary', type: 'submit', style: { width: '100%' } }, 'إنشاء الحساب');
  const form = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.hidden = true;
    if (pw.value !== pw2.value) return showErr(err, new Error('كلمتا المرور غير متطابقتين.'));
    btn.disabled = true;
    try {
      const r = await api('/api/auth/register', { method: 'POST', body: { full_name: name.value, username: user.value, password: pw.value, password2: pw2.value, class_id: Number(cls.value) || 0, code: code.value } });
      state.user = r.user;
      toast('تم إنشاء حسابك بنجاح. أهلًا بك!');
      location.hash = '#/student';
    } catch (ex) { showErr(err, ex); } finally { btn.disabled = false; }
  } }, err,
    field('الاسم الكامل', name), field('اسم المستخدم', user, 'من 3 إلى 20 حرفًا إنجليزيًا أو أرقامًا بدون مسافات، وبه تدخلين لاحقًا.'),
    field('المرحلة', grade), field('الفصل', cls),
    field('كلمة المرور', pw, '8 أحرف على الأقل، وتحتوي أحرفًا وأرقامًا.'), field('تأكيد كلمة المرور', pw2),
    info.code_required ? field('رمز التسجيل', code, 'تحصلين عليه من إدارة المدرسة.') : null, btn);
  root.append(h('div', { class: 'auth' }, h('div', { class: 'card' },
    h('div', { class: 'auth-head' }, h('img', { src: '/assets/logo.svg', alt: '' }), h('h1', { style: { fontSize: '1.5rem' } }, 'إنشاء حساب طالبة'),
      h('p', { class: 'hint' }, 'أنشئي حسابك بنفسك لتبدئي توثيق مشاركاتك وشواهدك.')),
    form, h('p', { style: { textAlign: 'center', marginBottom: 0, marginTop: '1rem' } }, 'لديك حساب؟ ', h('a', { href: '#/login/student', style: { fontWeight: 700 } }, 'تسجيل الدخول')))));
}
