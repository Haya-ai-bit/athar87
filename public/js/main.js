import { h, clear, icon, api, state, loading, toast, confirmDialog } from './lib.js';
import * as pub from './pages-public.js';
import * as stu from './pages-student.js';
import * as adm from './pages-admin.js';
import * as adm2 from './pages-admin2.js';

const app = document.getElementById('app');

// [نمط المسار، الصلاحية المطلوبة، التخطيط، الدالة]
const ROUTES = [
  [/^\/$/, null, 'public', pub.home],
  [/^\/login\/(student|admin)$/, null, 'public', pub.login],
  [/^\/register$/, null, 'public', pub.register],
  [/^\/privacy$/, null, 'public', pub.privacy],
  [/^\/change-password$/, 'any', 'public', pub.changePassword],
  [/^\/student$/, 'student', 'student', stu.portal],
  [/^\/student\/profile$/, 'student', 'student', stu.profile],
  [/^\/student\/folders$/, 'student', 'student', stu.folders],
  [/^\/student\/item\/(\d+)$/, 'student', 'student', stu.itemPage],
  [/^\/student\/submission\/(\d+)$/, 'student', 'student', stu.submissionPage],
  [/^\/admin$/, 'staff', 'admin', adm.dashboard],
  [/^\/admin\/browse$/, 'staff', 'admin', adm.browse],
  [/^\/admin\/student\/(\d+)$/, 'staff', 'admin', adm.studentProfile],
  [/^\/admin\/student\/(\d+)\/item\/(\d+)$/, 'staff', 'admin', adm.studentItem],
  [/^\/admin\/review$/, 'staff', 'admin', adm.review],
  [/^\/admin\/submission\/(\d+)$/, 'staff', 'admin', adm.submissionReview],
  [/^\/admin\/students$/, 'admin', 'admin', adm2.students],
  [/^\/admin\/items$/, 'staff', 'admin', adm2.items],
  [/^\/admin\/reports$/, 'admin', 'admin', adm2.reports],
  [/^\/admin\/settings$/, 'admin', 'admin', adm2.settings],
  [/^\/admin\/audit$/, 'admin', 'admin', adm2.audit],
];

export function logout() {
  return api('/api/auth/logout', { method: 'POST' }).catch(() => {}).then(() => { state.user = null; location.hash = '#/'; });
}

function footer() {
  return h('footer', { class: 'footer' }, h('div', { class: 'footer-in' },
    h('div', { class: 'fb' }, h('img', { src: '/assets/logo.svg', alt: '' }), h('div', null, h('strong', null, 'أَثَر 87 | ATHAR 87'), h('div', null, 'المدرسة الثانوية 87'))),
    h('div', { class: 'names' }, h('div', null, 'وكيلة شؤون الطلاب: أ. حنان الصقري'), h('div', null, 'مديرة المدرسة: حصة العنزي')),
    h('small', null, 'جميع الحقوق محفوظة © المدرسة الثانوية 87 — ', h('a', { href: '#/privacy', style: { color: '#F3D9A0' } }, 'سياسة الخصوصية'))));
}

function brand(href) {
  return h('a', { class: 'brand', href }, h('img', { src: '/assets/logo.svg', alt: 'شعار أَثَر 87' }), h('div', null, h('b', null, 'أَثَر 87'), h('small', null, 'المدرسة الثانوية 87')));
}

const navLink = (href, ic, text, cur) => h('a', { href, class: cur === href ? 'active' : '', 'aria-current': cur === href ? 'page' : null }, icon(ic, 18), h('span', { class: 't' }, text));

function layout(kind, path) {
  clear(app);
  const cur = '#' + path;
  const main = h('main', { class: kind === 'admin' ? 'main' : 'main', id: 'main', tabindex: '-1' });
  const out = h('button', { type: 'button', onclick: logout }, icon('logout', 18), h('span', { class: 't' }, 'خروج'));
  if (kind === 'public') {
    const nav = h('nav', { class: 'nav', 'aria-label': 'التنقل' },
      navLink('#/', 'home', 'الرئيسية', cur), navLink('#/login/student', 'user', 'بوابة الطالبة', cur), navLink('#/login/admin', 'shield', 'بوابة المتحكم', cur));
    if (state.user) nav.append(navLink(state.user.role === 'student' ? '#/student' : '#/admin', 'layers', 'لوحتي', cur), out);
    app.append(h('header', { class: 'topbar' }, h('div', { class: 'topbar-in' }, brand('#/'), nav)), main, footer());
  } else if (kind === 'student') {
    app.append(h('header', { class: 'topbar' }, h('div', { class: 'topbar-in' }, brand('#/student'),
      h('nav', { class: 'nav', 'aria-label': 'التنقل' },
        navLink('#/student', 'home', 'بوابتي', cur), navLink('#/student/folders', 'folder', 'المجلدات', cur), navLink('#/student/profile', 'user', 'ملفي الشخصي', cur), out))), main, footer());
  } else {
    const staffAdmin = state.user.role === 'admin';
    const side = h('aside', { class: 'side', id: 'side', 'aria-label': 'القائمة الإدارية' },
      h('div', { class: 'who' }, h('b', null, state.user.full_name), h('div', null, staffAdmin ? 'متحكم' : 'مراجِعة')),
      navLink('#/admin', 'chart', 'لوحة التحكم', cur), navLink('#/admin/browse', 'layers', 'المراحل والفصول', cur),
      navLink('#/admin/review', 'check', 'مراجعة الشواهد', cur),
      staffAdmin ? navLink('#/admin/students', 'users', 'إدارة الطالبات', cur) : null,
      navLink('#/admin/items', 'list', 'إدارة البنود', cur),
      staffAdmin ? navLink('#/admin/reports', 'print', 'التقارير والإحصاءات', cur) : null,
      staffAdmin ? navLink('#/admin/settings', 'settings', 'إعدادات المنصة', cur) : null,
      staffAdmin ? navLink('#/admin/audit', 'shield', 'سجل العمليات', cur) : null,
      h('a', { href: '#/' }, icon('home', 18), 'الصفحة الرئيسية'));
    side.addEventListener('click', (e) => { if (e.target.closest('a')) side.classList.remove('open'); });
    const menu = h('button', { class: 'icon-btn menu-btn', type: 'button', 'aria-label': 'القائمة', style: { color: '#fff' }, onclick: () => side.classList.toggle('open') }, icon('menu', 24));
    app.append(h('header', { class: 'topbar' }, h('div', { class: 'topbar-in' }, menu, brand('#/admin'), h('nav', { class: 'nav' }, out))),
      h('div', { class: 'admin-wrap' }, side, h('div', null, main, footer())));
  }
  return main;
}

let navToken = 0;
async function render() {
  const token = ++navToken;
  const raw = location.hash.slice(1) || '/';
  const [path, qs] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  let found = null;
  for (const r of ROUTES) { const m = r[0].exec(path); if (m) { found = { r, params: m.slice(1) }; break; } }

  if (!found) { const main = layout('public', path); main.append(pub.notFound()); document.title = 'الصفحة غير موجودة — أَثَر 87'; return; }
  const [, need, kind, fn] = found.r;
  if (need) {
    if (!state.user) { location.hash = need === 'student' ? '#/login/student' : need === 'any' ? '#/login/student' : '#/login/admin'; return; }
    const role = state.user.role;
    if (need === 'student' && role !== 'student') { location.hash = '#/admin'; return; }
    if (need === 'staff' && role === 'student') { location.hash = '#/student'; return; }
    if (need === 'admin' && role !== 'admin') { toast('هذه الصفحة للمتحكم فقط.', 'error'); location.hash = '#/admin'; return; }
    if (state.user.must_change_password && path !== '/change-password') { location.hash = '#/change-password'; return; }
  }
  const main = layout(kind, path);
  main.append(loading());
  window.scrollTo(0, 0);
  document.title = 'أَثَر 87 | ATHAR 87 — المدرسة الثانوية 87';
  try {
    const content = h('div', { class: 'fade' });
    await fn({ root: content, params: found.params, query, path });
    if (token !== navToken) return;
    clear(main).append(content);
    main.focus({ preventScroll: true });
  } catch (e) {
    if (token !== navToken) return;
    clear(main).append(h('div', { class: 'card' }, h('h2', null, 'تعذّر تحميل الصفحة'), h('p', null, e.message || 'حدث خطأ.'),
      h('button', { class: 'btn btn-ghost', onclick: render }, 'إعادة المحاولة')));
  }
}

window.addEventListener('hashchange', render);
window.addEventListener('offline', () => toast('انقطع الاتصال بالإنترنت. ستعمل الصفحة عند عودته.', 'error'));
(async () => {
  try { state.user = (await api('/api/auth/me')).user; } catch { state.user = null; }
  if (state.user && state.user.must_change_password) location.hash = '#/change-password';
  render();
})();
