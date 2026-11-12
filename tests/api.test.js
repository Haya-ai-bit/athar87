'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Client, startServer, createAdmin, tmpDir, PNG, PDF, DOCX, PPTX, EXE, multipart } = require('./helpers');

const PORT = 3190 + Math.floor(Math.random() * 200);
const dataDir = tmpDir();
const ADMIN_PW = 'Adm1nStrong9';
let srv;
const admin = () => new Client(srv.base);
const today = () => new Date().toISOString().slice(0, 10);

async function login(c, portal, username, password) {
  return c.post(`/api/auth/login/${portal}`, { username, password });
}
async function adminClient() { const c = admin(); const r = await login(c, 'admin', 'principal1', ADMIN_PW); assert.equal(r.status, 200); return c; }
async function mkStudent(a, name, number, classId) {
  const r = await a.post('/api/admin/students', { full_name: name, school_number: number, class_id: classId });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const c = admin();
  assert.equal((await login(c, 'student', number, r.data.temp_password)).status, 200);
  const nw = `Pass${number}x9`;
  assert.equal((await c.post('/api/auth/change-password', { current_password: r.data.temp_password, new_password: nw })).status, 200);
  return { c, id: r.data.student.id, pw: nw, number };
}
const subForm = (over = {}, files = [{ name: 'proof.png', data: PNG, type: 'image/png' }]) =>
  multipart({ title: 'مشاركة في الخدمة المجتمعية', description: 'وصف المشاركة', activity_date: today(), notes: '', ...over }, files);

let classes; let items;
const itemByName = (n) => items.find((i) => i.name.includes(n));

test.before(async () => {
  createAdmin(dataDir, 'principal1', ADMIN_PW);
  srv = await startServer(PORT, dataDir);
});
test.after(async () => { await srv.stop(); });

test('البنية: المراحل والفصول والبنود والدرجات الرسمية في قاعدة البيانات', async () => {
  const a = await adminClient();
  const st = (await a.get('/api/admin/structure')).data;
  assert.deepEqual(st.grades.map((g) => [g.name, g.classes.length]), [['أول ثانوي', 5], ['ثاني ثانوي', 5], ['ثالث ثانوي', 4]]);
  classes = st.grades.flatMap((g) => g.classes);
  const home = (await admin().get('/api/public/home')).data;
  assert.equal(home.categories.length, 5);
  assert.deepEqual(home.categories.map((c) => c.items.length), [1, 5, 4, 4, 1]);
  items = home.categories.flatMap((c) => c.items);
  assert.equal(items.length, 15);
  const pts = home.categories.map((c) => [...new Set(c.items.map((i) => i.points))]);
  assert.deepEqual(pts, [[6], [6], [4], [2], [6]]);
  assert.equal(home.categories[4].items[0].points_mode, 'up_to');
  assert.equal(home.categories[1].items[0].points_mode, 'per_submission');
  assert.equal(home.categories[0].items[0].points_mode, 'fixed');
  assert.ok(home.categories[2].items.every((i) => i.group_name === 'المشاركة في مجالات الأنشطة المدرسية'));
  // الصفحة العامة لا تعرض بيانات شخصية
  assert.ok(!JSON.stringify(home).includes('principal1'));
});

test('الأمان الأساسي: الصلاحيات، CSRF، البوابات المنفصلة', async () => {
  const anon = admin();
  assert.equal((await anon.get('/api/admin/dashboard')).status, 401);
  assert.equal((await anon.get('/api/student/overview')).status, 401);
  assert.equal((await anon.get('/api/admin/students')).status, 401);
  // CSRF
  const a = await adminClient();
  assert.equal((await a.post('/api/admin/classes', { grade_id: 1, name: 'x' }, { csrf: false })).status, 403);
  assert.equal((await a.req('POST', '/api/auth/logout', { csrf: false })).status, 403);
  // بوابتان منفصلتان
  assert.equal((await login(admin(), 'student', 'principal1', ADMIN_PW)).status, 401);
  const s = await mkStudent(a, 'لمى عبدالله القحطاني', '1001', classes[0].id);
  assert.equal((await login(admin(), 'admin', '1001', s.pw)).status, 401);
  // الطالبة لا تدخل لوحة الإدارة بمعرفة الرابط
  assert.equal((await s.c.get('/api/admin/dashboard')).status, 403);
  assert.equal((await s.c.get('/api/admin/students')).status, 403);
  assert.equal((await s.c.get('/api/admin/reports/students')).status, 403);
  assert.equal((await s.c.post('/api/admin/submissions/1/grade', { points: 6 })).status, 403);
  // مسارات الملفات الثابتة لا تكشف خارج public
  const t1 = await fetch(srv.base + '/../data/athar.db'); assert.equal(t1.status, 404);
  const t2 = await fetch(srv.base + '/%2e%2e/%2e%2e/etc/passwd'); assert.equal(t2.status, 404);
  const t3 = await fetch(srv.base + '/src/db.js'); assert.equal(t3.status, 404);
  const t4 = await fetch(srv.base + '/api/nope'); assert.equal(t4.status, 404);
  const h = (await fetch(srv.base + '/')).headers;
  assert.ok(h.get('content-security-policy').includes("default-src 'self'"));
  assert.equal(h.get('x-content-type-options'), 'nosniff');
});

test('كلمة المرور المؤقتة وإلزام التغيير وسياسة كلمة المرور', async () => {
  const a = await adminClient();
  const r = await a.post('/api/admin/students', { full_name: 'ريم سعد الحربي', school_number: '1002', class_id: classes[1].id });
  const c = admin();
  assert.equal((await login(c, 'student', '1002', r.data.temp_password)).status, 200);
  const blocked = await c.get('/api/student/overview');
  assert.equal(blocked.status, 403); assert.equal(blocked.data.code, 'MUST_CHANGE_PASSWORD');
  assert.equal((await c.post('/api/auth/change-password', { current_password: r.data.temp_password, new_password: '12345678' })).status, 400); // بلا أحرف
  assert.equal((await c.post('/api/auth/change-password', { current_password: r.data.temp_password, new_password: 'short1' })).status, 400);
  assert.equal((await c.post('/api/auth/change-password', { current_password: 'wrong', new_password: 'Valid1234pw' })).status, 400);
  assert.equal((await c.post('/api/auth/change-password', { current_password: r.data.temp_password, new_password: 'Valid1234pw' })).status, 200);
  assert.equal((await c.get('/api/student/overview')).status, 200);
  const me = (await c.get('/api/auth/me')).data.user;
  assert.equal(me.role, 'student');
  await c.post('/api/auth/logout');
  assert.equal((await c.get('/api/student/overview')).status, 401);
});

test('قفل الحساب بعد محاولات خاطئة متكررة', async () => {
  const a = await adminClient();
  await a.post('/api/admin/students', { full_name: 'هند ناصر الدوسري', school_number: '1003', class_id: classes[2].id });
  const c = admin();
  let last;
  for (let i = 0; i < 9; i++) last = await login(c, 'student', '1003', 'WrongPass' + i);
  assert.ok([401, 429].includes(last.status));
  assert.equal(last.status, 429);
});

test('حساب الطالبة: مشاركة وشاهد، الاحتفاظ بعد الخروج، العزل بين الطالبات', async () => {
  const a = await adminClient();
  const A = await mkStudent(a, 'نورة خالد العتيبي', '2001', classes[0].id);
  const B = await mkStudent(a, 'سارة فهد الشمري', '2002', classes[0].id);
  const item = itemByName('الخدمة المجتمعية');

  const ov = (await A.c.get('/api/student/overview')).data;
  assert.equal(ov.student.full_name, 'نورة خالد العتيبي');
  assert.equal(ov.student.grade_name, 'أول ثانوي');
  assert.equal(ov.categories.length, 5);
  assert.equal(ov.stats.submissions, 0);

  const cr = await A.c.req('POST', `/api/student/items/${item.id}/submissions`, { form: subForm() });
  assert.equal(cr.status, 200, JSON.stringify(cr.data));
  const sub = cr.data.submission;
  assert.equal(sub.status, 'pending');
  assert.equal(sub.files.length, 1);
  assert.equal(sub.grade_approved, false);
  const fid = sub.files[0].id;

  // المعاينة والتنزيل لصاحبة الملف
  const v = await A.c.get(`/api/files/${fid}/view`);
  assert.equal(v.status, 200); assert.equal(v.headers.get('content-type'), 'image/png');
  assert.ok(v.headers.get('content-disposition').startsWith('inline'));
  assert.ok(Buffer.compare(v.data, PNG) === 0);
  // طالبة أخرى لا تصل للملف أو المشاركة
  assert.equal((await B.c.get(`/api/files/${fid}/view`)).status, 404);
  assert.equal((await B.c.get(`/api/files/${fid}/download`)).status, 404);
  assert.equal((await B.c.get(`/api/student/submissions/${sub.id}`)).status, 404);
  assert.equal((await B.c.put(`/api/student/submissions/${sub.id}`, { title: 'x' })).status, 404);
  assert.equal((await B.c.del(`/api/student/submissions/${sub.id}`)).status, 404);
  assert.equal((await B.c.del(`/api/student/files/${fid}`)).status, 404);
  // بدون تسجيل دخول
  assert.equal((await admin().get(`/api/files/${fid}/view`)).status, 401);
  // مجلد البند الآخر فارغ لـ B
  const bItem = (await B.c.get(`/api/student/items/${item.id}`)).data;
  assert.equal(bItem.submissions.length, 0);

  // الاحتفاظ بعد تسجيل الخروج والدخول
  await A.c.post('/api/auth/logout');
  const again = admin();
  assert.equal((await login(again, 'student', A.number, A.pw)).status, 200);
  const list = (await again.get(`/api/student/items/${item.id}`)).data;
  assert.equal(list.submissions.length, 1);
  assert.equal(list.submissions[0].files[0].id, fid);
  assert.equal((await again.get('/api/student/overview')).data.stats.files, 1);
});

test('رفع الملفات: الأنواع والأحجام والتحقق من المحتوى', async () => {
  const a = await adminClient();
  const S = await mkStudent(a, 'جود ماجد الزهراني', '2003', classes[3].id);
  const item = itemByName('حملة توعوية');
  const post = (files, fields) => S.c.req('POST', `/api/student/items/${item.id}/submissions`, { form: subForm(fields, files) });
  // ملف تنفيذي بامتداد صورة
  assert.equal((await post([{ name: 'virus.png', data: EXE, type: 'image/png' }])).status, 400);
  // ملف نصي
  assert.equal((await post([{ name: 'a.pdf', data: Buffer.from('hello world this is text'), type: 'application/pdf' }])).status, 400);
  // الأنواع المسموحة
  assert.equal((await post([{ name: 'a.pdf', data: PDF }, { name: 'b.docx', data: DOCX }, { name: 'c.pptx', data: PPTX }])).status, 200);
  // عدد الملفات (الحد الافتراضي 5)
  const six = Array.from({ length: 6 }, (_, i) => ({ name: `f${i}.png`, data: PNG }));
  assert.equal((await post(six)).status, 400);
  // الحقول المطلوبة
  assert.equal((await post([], { title: '' })).status, 400);
  assert.equal((await post([], { activity_date: '2999-01-01' })).status, 400);
  assert.equal((await post([], { activity_date: 'abc' })).status, 400);
  // الاسم العربي للملف يُحفظ صحيحًا
  const r = await post([{ name: 'شهادة الحملة.png', data: PNG }]);
  assert.equal(r.status, 200); assert.equal(r.data.submission.files[0].name, 'شهادة الحملة.png');
  // التحكم الإداري في أنواع وأحجام الملفات
  const ad = await adminClient();
  assert.equal((await ad.put('/api/admin/settings', { allowed_types: ['jpg', 'png', 'pdf'], max_file_mb: 1 })).status, 200);
  assert.equal((await post([{ name: 'c.pptx', data: PPTX }])).status, 400);
  assert.equal((await post([{ name: 'big.png', data: Buffer.concat([PNG, Buffer.alloc(1.2 * 1024 * 1024)]) }])).status, 400);
  assert.equal((await post([{ name: 'ok.png', data: PNG }])).status, 200);
  assert.equal((await ad.put('/api/admin/settings', { allowed_types: ['jpg', 'png', 'pdf', 'docx', 'pptx'], max_file_mb: 10 })).status, 200);
  assert.equal((await ad.put('/api/admin/settings', { max_file_mb: 0 })).status, 400);
});

test('البنود: الانضباط من الإدارة فقط، السلوك الإضافي، حدود الدرجات', async () => {
  const a = await adminClient();
  const S = await mkStudent(a, 'ملاك أحمد القرني', '2004', classes[5].id);
  const disc = itemByName('انضباط الطالبة');
  assert.equal((await S.c.req('POST', `/api/student/items/${disc.id}/submissions`, { form: subForm() })).status, 403);
  // الإدارة تنشئ سجل الانضباط وتعتمده
  const d = await a.post(`/api/admin/students/${S.id}/discipline`, { note: 'لا غياب بدون عذر' });
  assert.equal(d.status, 200);
  assert.equal((await a.post(`/api/admin/students/${S.id}/discipline`, {})).status, 400); // مكرر في نفس الفصل الدراسي
  assert.equal((await a.post(`/api/admin/submissions/${d.data.id}/grade`, { points: 6 })).status, 400); // لم يُقبل بعد
  assert.equal((await a.post(`/api/admin/submissions/${d.data.id}/review`, { status: 'accepted' })).status, 200);
  assert.equal((await a.post(`/api/admin/submissions/${d.data.id}/grade`, { points: 7 })).status, 400);
  assert.equal((await a.post(`/api/admin/submissions/${d.data.id}/grade`, { points: 6 })).status, 200);
  let ov = (await S.c.get('/api/student/overview')).data;
  const dc = ov.categories[0].items[0];
  assert.equal(dc.counts.approved_points, 6);
  assert.equal(ov.stats.approved_total, 6);

  // البند الإضافي: لا بد من توصية اللجنة ولا تتجاوز 6
  const extra = itemByName('سلوك متميز إضافي');
  const cr = await S.c.req('POST', `/api/student/items/${extra.id}/submissions`, { form: subForm({ title: 'مبادرة تنظيف الساحة', benefit: 'نظافة البيئة المدرسية' }) });
  assert.equal(cr.status, 200);
  assert.equal((await S.c.req('POST', `/api/student/items/${extra.id}/submissions`, { form: subForm({ title: 'بدون أثر' }) })).status, 400); // الأثر مطلوب
  const sid = cr.data.submission.id;
  assert.equal(cr.data.submission.points_mode, 'up_to');
  await a.post(`/api/admin/submissions/${sid}/review`, { status: 'accepted' });
  assert.equal((await a.post(`/api/admin/submissions/${sid}/grade`, { points: 5 })).status, 400); // بلا توصية
  assert.equal((await a.post(`/api/admin/submissions/${sid}/grade`, { points: 7, committee_recommendation: 'توصي اللجنة' })).status, 400);
  assert.equal((await a.post(`/api/admin/submissions/${sid}/grade`, { points: 5, committee_recommendation: 'توصي اللجنة بخمس درجات' })).status, 200);
  const detail = (await a.get(`/api/admin/submissions/${sid}`)).data.submission;
  assert.equal(detail.committee_recommendation, 'توصي اللجنة بخمس درجات');
  // الطالبة لا ترى توصية اللجنة
  const mine = (await S.c.get(`/api/student/submissions/${sid}`)).data.submission;
  assert.equal(mine.committee_recommendation, undefined);
  assert.equal(mine.approved_points, 5);

  // البند الثالث والرابع: 4 و2
  const skill = itemByName('المهارات الرقمية');
  const s3 = (await S.c.req('POST', `/api/student/items/${skill.id}/submissions`, { form: subForm() })).data.submission;
  await a.post(`/api/admin/submissions/${s3.id}/review`, { status: 'accepted' });
  assert.equal((await a.post(`/api/admin/submissions/${s3.id}/grade`, { points: 5 })).status, 400);
  assert.equal((await a.post(`/api/admin/submissions/${s3.id}/grade`, { points: 4 })).status, 200);
  const radio = itemByName('الإذاعة');
  const s4 = (await S.c.req('POST', `/api/student/items/${radio.id}/submissions`, { form: subForm() })).data.submission;
  await a.post(`/api/admin/submissions/${s4.id}/review`, { status: 'accepted' });
  assert.equal((await a.post(`/api/admin/submissions/${s4.id}/grade`, { points: 3 })).status, 400);
  assert.equal((await a.post(`/api/admin/submissions/${s4.id}/grade`, { points: 2 })).status, 200);
  ov = (await S.c.get('/api/student/overview')).data;
  assert.equal(ov.stats.approved_total, 6 + 5 + 4 + 2); // لا حد إجمالي افتراضي
});

test('المراجعة: الحالات، الملاحظات، إعادة التعيين بعد التعديل، الدرجة المعتمدة منفصلة', async () => {
  const a = await adminClient();
  const S = await mkStudent(a, 'دانة سلطان المطيري', '2005', classes[0].id);
  const item = itemByName('عرض تجارب');
  const sub = (await S.c.req('POST', `/api/student/items/${item.id}/submissions`, { form: subForm({ title: 'تجربتي في التطوع' }) })).data.submission;
  // الشواهد المرفوعة ليست درجات معتمدة تلقائيًا
  assert.equal(sub.grade_approved, false);
  assert.equal(sub.approved_points, null);
  let ov = (await S.c.get('/api/student/overview')).data;
  const ic = ov.categories[1].items.find((i) => i.id === item.id);
  assert.equal(ic.counts.approved_points, 0);
  assert.equal(ic.counts.awaiting_points, 6); // درجة بانتظار الاعتماد (مقترحة) وليست معتمدة
  assert.equal(ov.stats.approved_total, 0);

  assert.equal((await a.post(`/api/admin/submissions/${sub.id}/review`, { status: 'needs_completion' })).status, 400); // الملاحظة مطلوبة
  assert.equal((await a.post(`/api/admin/submissions/${sub.id}/review`, { status: 'bogus' })).status, 400);
  assert.equal((await a.post(`/api/admin/submissions/${sub.id}/review`, { status: 'needs_completion', note: 'أرفقي صورة أوضح للشهادة' })).status, 200);
  let mine = (await S.c.get(`/api/student/submissions/${sub.id}`)).data.submission;
  assert.equal(mine.status, 'needs_completion');
  assert.equal(mine.admin_notes.length, 1);
  assert.equal(mine.admin_notes[0].body, 'أرفقي صورة أوضح للشهادة');
  assert.equal((await S.c.get('/api/student/overview')).data.attention.length, 1);
  // ملاحظة داخلية لا تظهر للطالبة
  await a.post(`/api/admin/submissions/${sub.id}/notes`, { body: 'ملاحظة داخلية للإدارة', visible_to_student: false });
  mine = (await S.c.get(`/api/student/submissions/${sub.id}`)).data.submission;
  assert.equal(mine.admin_notes.length, 1);
  assert.ok(!JSON.stringify(mine).includes('ملاحظة داخلية'));
  // تعديل الطالبة يعيد الحالة إلى قيد المراجعة
  const up = await S.c.req('PUT', `/api/student/submissions/${sub.id}`, { form: subForm({ title: 'تجربتي في التطوع (محدّث)' }, [{ name: 'new.pdf', data: PDF }]) });
  assert.equal(up.status, 200);
  assert.equal(up.data.submission.status, 'pending');
  assert.equal(up.data.submission.files.length, 2);
  // قبول واعتماد ثم تعديل → تُلغى الدرجة
  await a.post(`/api/admin/submissions/${sub.id}/review`, { status: 'accepted' });
  assert.equal((await a.post(`/api/admin/submissions/${sub.id}/grade`, { points: 6 })).status, 200);
  assert.equal((await S.c.get('/api/student/overview')).data.stats.approved_total, 6);
  const fid = up.data.submission.files[0].id;
  const del = await S.c.del(`/api/student/files/${fid}`);
  assert.equal(del.status, 200);
  assert.equal(del.data.submission.status, 'pending');
  assert.equal(del.data.submission.grade_approved, false);
  assert.equal((await S.c.get('/api/student/overview')).data.stats.approved_total, 0);
  assert.equal((await S.c.get(`/api/files/${fid}/view`)).status, 404); // الملف المحذوف لا يُعرض
  // استبدال ملف
  const cur = (await S.c.get(`/api/student/submissions/${sub.id}`)).data.submission;
  const rep = await S.c.req('POST', `/api/student/files/${cur.files[0].id}/replace`, { form: multipart({}, [{ name: 'r.png', data: PNG }]) });
  assert.equal(rep.status, 200); assert.equal(rep.data.submission.files.length, 1);
  // لا يمكن حذف مشاركة معتمدة الدرجة
  await a.post(`/api/admin/submissions/${sub.id}/review`, { status: 'accepted' });
  await a.post(`/api/admin/submissions/${sub.id}/grade`, { points: 3 });
  assert.equal((await S.c.del(`/api/student/submissions/${sub.id}`)).status, 403);
  // إلغاء الدرجة ثم حذف المشاركة
  await a.post(`/api/admin/submissions/${sub.id}/grade`, { points: null });
  assert.equal((await S.c.del(`/api/student/submissions/${sub.id}`)).status, 200);
  assert.equal((await S.c.get(`/api/student/submissions/${sub.id}`)).status, 404);
});

test('المراجِعة: تراجع وتضيف ملاحظات لكن لا تعتمد الدرجات ولا تدير', async () => {
  const a = await adminClient();
  const mk = await a.post('/api/admin/accounts', { username: 'reviewer1', full_name: 'مراجعة اختبار', role: 'reviewer' });
  assert.equal(mk.status, 200);
  const r = admin();
  assert.equal((await login(r, 'admin', 'reviewer1', mk.data.temp_password)).status, 200);
  assert.equal((await r.get('/api/admin/dashboard')).status, 403); // يجب تغيير كلمة المرور أولًا
  assert.equal((await r.post('/api/auth/change-password', { current_password: mk.data.temp_password, new_password: 'Reviewer123pw' })).status, 200);
  assert.equal((await r.get('/api/admin/dashboard')).status, 200);
  const list = (await r.get('/api/admin/submissions?status=pending')).data;
  assert.ok(list.rows.length > 0);
  const id = list.rows[0].id;
  assert.equal((await r.post(`/api/admin/submissions/${id}/review`, { status: 'accepted' })).status, 200);
  assert.equal((await r.post(`/api/admin/submissions/${id}/grade`, { points: 2 })).status, 403);
  assert.equal((await r.post('/api/admin/students', { full_name: 'x y z', school_number: '99999', class_id: classes[0].id })).status, 403);
  assert.equal((await r.put('/api/admin/settings', { max_file_mb: 20 })).status, 403);
  assert.equal((await r.get('/api/admin/reports/students')).status, 403);
  assert.equal((await r.get('/api/admin/accounts')).status, 403);
});

test('بوابة المتحكم: لوحة التحكم، الهيكل، قوائم الطالبات، البحث والتصفية', async () => {
  const a = await adminClient();
  const dash = (await a.get('/api/admin/dashboard')).data;
  assert.equal(dash.grades.length, 3);
  assert.equal(dash.classes, 14);
  assert.ok(dash.students.total >= 7);
  const g1 = dash.grades[0];
  const cnt = (await a.get(`/api/admin/students?grade_id=${g1.id}`)).data.total;
  assert.equal(g1.students, cnt);
  // الأرقام حقيقية: مجموع الحالات = إجمالي المشاركات
  assert.equal(dash.submissions.pending + dash.submissions.accepted + dash.submissions.needs, dash.submissions.total);
  const total = (await a.get('/api/admin/submissions?page_size=200')).data;
  assert.equal(total.total, dash.submissions.total);
  // الفصل ← الطالبات
  const cl = (await a.get(`/api/admin/classes/${classes[0].id}/students`)).data;
  assert.ok(cl.students.some((s) => s.full_name === 'نورة خالد العتيبي'));
  assert.ok(!cl.students.some((s) => s.full_name === 'ملاك أحمد القرني')); // فصل مختلف
  // البحث بالاسم (مع توحيد الهمزة/التاء)
  assert.ok((await a.get('/api/admin/students?q=' + encodeURIComponent('نوره'))).data.rows.some((s) => s.school_number === '2001'));
  assert.ok((await a.get('/api/admin/students?q=2002')).data.rows.some((s) => s.full_name === 'سارة فهد الشمري'));
  assert.equal((await a.get('/api/admin/students?q=' + encodeURIComponent('%'))).data.total, 0); // لا يعمل كمحرف بدل
  // بحث المشاركات: اسم الطالبة / البند / العنوان / الحالة / المرحلة / الفصل
  const s1 = (await a.get('/api/admin/submissions?q=' + encodeURIComponent('نورة خالد'))).data;
  assert.ok(s1.total >= 1 && s1.rows.every((r) => r.student_name === 'نورة خالد العتيبي'));
  assert.ok((await a.get('/api/admin/submissions?q=' + encodeURIComponent('الخدمة المجتمعية'))).data.total >= 1);
  assert.ok((await a.get('/api/admin/submissions?q=' + encodeURIComponent('تجربتي'))).data.total >= 0);
  assert.ok((await a.get('/api/admin/submissions?q=' + encodeURIComponent('أول ثانوي'))).data.total >= 1);
  assert.ok((await a.get(`/api/admin/submissions?class_id=${classes[0].id}`)).data.rows.every((r) => r.class_id === classes[0].id));
  assert.ok((await a.get('/api/admin/submissions?status=accepted')).data.rows.every((r) => r.status === 'accepted'));
  assert.ok((await a.get('/api/admin/submissions?grade_state=approved')).data.rows.every((r) => r.grade_approved));
  assert.equal((await a.get('/api/admin/submissions?from=' + today() + '&to=' + today())).status, 200);
  assert.equal((await a.get('/api/admin/submissions?from=2000-01-01&to=2000-01-02')).data.total, 0);
  assert.equal((await a.get('/api/admin/submissions?item_id=abc')).status, 400);
  // ملف الطالبة عند المتحكم: لا تختلط الشواهد
  const nora = (await a.get('/api/admin/students?q=2001')).data.rows[0];
  const prof = (await a.get(`/api/admin/students/${nora.id}`)).data;
  assert.equal(prof.stats.submissions, 1);
  const folder = (await a.get(`/api/admin/students/${nora.id}/items/${itemByName('الخدمة المجتمعية').id}`)).data;
  assert.equal(folder.submissions.length, 1);
  assert.equal(folder.submissions[0].student_id, nora.id);
  const other = (await a.get(`/api/admin/students/${nora.id}/items/${itemByName('حملة توعوية').id}`)).data;
  assert.equal(other.submissions.length, 0);
  // معاينة وتنزيل من الإدارة
  const fid = folder.submissions[0].files[0].id;
  assert.equal((await a.get(`/api/files/${fid}/view`)).status, 200);
  const dl = await a.get(`/api/files/${fid}/download`);
  assert.equal(dl.status, 200); assert.ok(dl.headers.get('content-disposition').startsWith('attachment'));
  assert.equal(dl.headers.get('x-content-type-options'), 'nosniff');
});

test('إدارة الطالبات: إضافة، تعديل، نقل مع بقاء الشواهد، إيقاف، استيراد CSV', async () => {
  const a = await adminClient();
  const S = await mkStudent(a, 'عهود صالح البقمي', '3001', classes[0].id);
  const item = itemByName('الإذاعة');
  const sub = (await S.c.req('POST', `/api/student/items/${item.id}/submissions`, { form: subForm({ title: 'إذاعة الصباح' }) })).data.submission;
  assert.equal((await a.post('/api/admin/students', { full_name: 'مكررة', school_number: '3001', class_id: classes[0].id })).status, 400);
  assert.equal((await a.post('/api/admin/students', { full_name: 'رقم سيء', school_number: 'a b', class_id: classes[0].id })).status, 400);
  assert.equal((await a.post(`/api/admin/students/${S.id}/move`, { class_id: classes[0].id })).status, 400);
  const mv = await a.post(`/api/admin/students/${S.id}/move`, { class_id: classes[11].id });
  assert.equal(mv.status, 200); assert.equal(mv.data.student.grade_name, 'ثالث ثانوي');
  // الملف والشواهد السابقة محفوظة
  const ov = (await S.c.get('/api/student/overview')).data;
  assert.equal(ov.student.grade_name, 'ثالث ثانوي'); assert.equal(ov.stats.submissions, 1);
  assert.equal((await S.c.get(`/api/student/submissions/${sub.id}`)).status, 200);
  // الطالبة لا تعدّل مرحلتها بنفسها
  assert.equal((await S.c.post(`/api/admin/students/${S.id}/move`, { class_id: 1 })).status, 403);
  assert.equal((await S.c.put(`/api/admin/students/${S.id}`, { full_name: 'x y z', school_number: '3001' })).status, 403);
  // تعديل البيانات
  assert.equal((await a.put(`/api/admin/students/${S.id}`, { full_name: 'عهود صالح البقمي (م)', school_number: '3001', active: true })).status, 200);
  // إيقاف الحساب ينهي الجلسة ويمنع الدخول
  assert.equal((await a.put(`/api/admin/students/${S.id}`, { full_name: 'عهود صالح البقمي', school_number: '3001', active: false })).status, 200);
  assert.equal((await S.c.get('/api/student/overview')).status, 401);
  assert.equal((await login(admin(), 'student', '3001', S.pw)).status, 401);
  await a.put(`/api/admin/students/${S.id}`, { full_name: 'عهود صالح البقمي', school_number: '3001', active: true });
  assert.equal((await login(admin(), 'student', '3001', S.pw)).status, 200);
  // إعادة تعيين كلمة المرور
  const rp = await a.post(`/api/admin/students/${S.id}/reset-password`, {});
  assert.equal((await login(admin(), 'student', '3001', rp.data.temp_password)).status, 200);
  // استيراد CSV
  const csv = 'الاسم,الرقم المدرسي,المرحلة,الفصل\nأمل سعيد الغامدي,4001,أول ثانوي,الفصل الثاني\nرهف علي الحارثي,4002,2,3\nمكررة,4001,أول ثانوي,الفصل الأول\nخطأ,4003,رابع ثانوي,1\nريم أحمد,3001,أول ثانوي,1';
  const imp = await a.post('/api/admin/students/import', { csv });
  assert.equal(imp.status, 200, JSON.stringify(imp.data));
  assert.equal(imp.data.created.length, 2);
  assert.equal(imp.data.skipped.length, 3);
  assert.equal(imp.data.created[1].grade, 'ثاني ثانوي'); assert.equal(imp.data.created[1].class, 'الفصل الثالث');
  assert.equal((await login(admin(), 'student', '4001', imp.data.created[0].temp_password)).status, 200);
});

test('اسم المستخدم يُولَّد تلقائيًا عند الإضافة وفي الاستيراد', async () => {
  const a = await adminClient();
  const r1 = await a.post('/api/admin/students', { full_name: 'لمى فهد الزهراني', class_id: classes[0].id });
  assert.equal(r1.status, 200, JSON.stringify(r1.data));
  assert.match(r1.data.username, /^S\d{4}$/);
  const r2 = await a.post('/api/admin/students', { full_name: 'جود خالد المطيري', class_id: classes[0].id });
  assert.notEqual(r1.data.username, r2.data.username);
  const imp = await a.post('/api/admin/students/import', { csv: 'الاسم,المرحلة,الفصل\nسلمى عمر القحطاني,أول ثانوي,1\nدانة ماجد الشهري,1,2' });
  assert.equal(imp.status, 200, JSON.stringify(imp.data));
  assert.equal(imp.data.created.length, 2);
  const names = [r1.data.username, r2.data.username, ...imp.data.created.map((c) => c.school_number)];
  assert.equal(new Set(names).size, 4);
  assert.equal((await login(admin(), 'student', r1.data.username, r1.data.temp_password)).status, 200);
});

test('تسجيل الطالبة حسابها بنفسها: رمز، تحقق، إيقاف', async () => {
  const a = await adminClient();
  const info = await admin().get('/api/public/register-info');
  assert.equal(info.status, 200); assert.equal(info.data.open, true); assert.equal(info.data.grades.length, 3);
  const body = { full_name: 'غادة سالم العمري', username: 'ghada87', password: 'Secret2026x', password2: 'Secret2026x', class_id: classes[0].id };
  assert.equal((await admin().post('/api/auth/register', { ...body, password2: 'x' })).status, 400);
  assert.equal((await admin().post('/api/auth/register', { ...body, password: 'short1', password2: 'short1' })).status, 400);
  const c = admin();
  const ok = await c.post('/api/auth/register', body);
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal((await c.get('/api/student/overview')).status, 200); // دخلت تلقائيًا بلا تغيير كلمة مرور
  assert.equal((await admin().post('/api/auth/register', body)).status, 400); // اسم مكرر
  assert.equal((await login(admin(), 'student', 'ghada87', 'Secret2026x')).status, 200);
  // رمز التسجيل
  assert.equal((await a.put('/api/admin/settings', { registration_code: 'MY-CODE-7' })).status, 200);
  assert.equal((await admin().get('/api/public/register-info')).data.code_required, true);
  const b2 = { ...body, username: 'ghada88' };
  assert.equal((await admin().post('/api/auth/register', b2)).status, 400);
  assert.equal((await admin().post('/api/auth/register', { ...b2, code: 'MY-CODE-7' })).status, 200);
  // الإيقاف
  assert.equal((await a.put('/api/admin/settings', { self_registration: false })).status, 200);
  assert.equal((await admin().post('/api/auth/register', { ...b2, username: 'ghada89', code: 'MY-CODE-7' })).status, 403);
  await a.put('/api/admin/settings', { self_registration: true, registration_code: '' });
});

test('إدارة البنود والفصول والإعدادات وقواعد احتساب المجموع', async () => {
  const a = await adminClient();
  const it = (await a.get('/api/admin/items')).data.categories;
  assert.equal(it.flatMap((c) => c.items).length, 15);
  const target = it[1].items[0];
  assert.ok(target.official);
  // تعديل الوصف، لا تتغير الدرجة
  const up = await a.put(`/api/admin/items/${target.id}`, { description: 'وصف محدّث', instructions: 'تعليمات الشواهد الخاصة', active: true });
  assert.equal(up.status, 200); assert.equal(up.data.item.points, 6); assert.equal(up.data.item.name, target.name);
  assert.equal((await a.put(`/api/admin/items/${target.id}`, { description: 'وصف محدّث', points: 99, name: 'x', active: true })).data.item.points, 6);
  // إيقاف بند يبقي الشواهد السابقة
  const S = await mkStudent(a, 'غادة مشعل السبيعي', '5001', classes[0].id);
  const sub = (await S.c.req('POST', `/api/student/items/${target.id}/submissions`, { form: subForm() })).data.submission;
  await a.put(`/api/admin/items/${target.id}`, { description: 'وصف محدّث', instructions: '', active: false });
  assert.equal((await S.c.req('POST', `/api/student/items/${target.id}/submissions`, { form: subForm() })).status, 404);
  assert.equal((await S.c.get(`/api/student/submissions/${sub.id}`)).status, 200);
  await a.put(`/api/admin/items/${target.id}`, { description: 'وصف محدّث', instructions: '', active: true });
  // ترتيب
  const second = it[1].items[1];
  await a.post(`/api/admin/items/${second.id}/reorder`, { direction: 'up' });
  const after = (await a.get('/api/admin/items')).data.categories[1].items;
  assert.equal(after[0].id, second.id);
  await a.post(`/api/admin/items/${second.id}/reorder`, { direction: 'down' });
  // فصل جديد، ولا يوقَف فصل فيه طالبات
  const nc = await a.post('/api/admin/classes', { grade_id: 1, name: 'الفصل السادس' });
  assert.equal(nc.status, 200);
  assert.equal((await a.post('/api/admin/classes', { grade_id: 1, name: 'الفصل السادس' })).status, 400);
  assert.equal((await a.put(`/api/admin/classes/${classes[0].id}`, { name: 'الفصل الأول', active: false })).status, 400);
  assert.equal((await a.put(`/api/admin/classes/${nc.data.id}`, { name: 'الفصل السادس', active: false })).status, 200);
  // قواعد احتساب المجموع
  const mine = (await S.c.get('/api/student/overview')).data;
  assert.equal(mine.stats.approved_total, 0);
  await a.post(`/api/admin/submissions/${sub.id}/review`, { status: 'accepted' });
  await a.post(`/api/admin/submissions/${sub.id}/grade`, { points: 6 });
  const sub2 = (await S.c.req('POST', `/api/student/items/${itemByName('الإذاعة').id}/submissions`, { form: subForm() })).data.submission;
  await a.post(`/api/admin/submissions/${sub2.id}/review`, { status: 'accepted' });
  await a.post(`/api/admin/submissions/${sub2.id}/grade`, { points: 2 });
  assert.equal((await S.c.get('/api/student/overview')).data.stats.approved_total, 8);
  const cats = (await a.get('/api/admin/settings')).data.categories;
  assert.equal((await a.put('/api/admin/settings', { total_rule: { overall_cap: null, category_caps: { [cats[3].id]: 1 } } })).status, 200);
  assert.equal((await S.c.get('/api/student/overview')).data.stats.approved_total, 7); // سقف الفئة الرابعة 1
  assert.equal((await a.put('/api/admin/settings', { total_rule: { overall_cap: 5, category_caps: {} } })).status, 200);
  const o = (await S.c.get('/api/student/overview')).data.stats;
  assert.equal(o.approved_total, 5); assert.equal(o.approved_raw, 8); // الدرجات الأصلية لا تتغير
  assert.equal((await a.put('/api/admin/settings', { total_rule: { overall_cap: -2, category_caps: {} } })).status, 400);
  await a.put('/api/admin/settings', { total_rule: { overall_cap: null, category_caps: {} } });
  assert.equal((await a.put('/api/admin/settings', { current_term: 'الفصل الدراسي الثاني' })).status, 200);
  assert.equal((await a.put('/api/admin/settings', { privacy_policy: 'قصير' })).status, 400);
  assert.equal((await admin().get('/api/public/privacy')).status, 200);
});

test('نقل مشاركة بين البنود (للمتحكم فقط وبسجل)', async () => {
  const a = await adminClient();
  const S = await mkStudent(a, 'لجين راشد العمري', '5002', classes[1].id);
  const sub = (await S.c.req('POST', `/api/student/items/${itemByName('حملة توعوية').id}/submissions`, { form: subForm() })).data.submission;
  assert.equal((await S.c.post(`/api/admin/submissions/${sub.id}/move`, { item_id: itemByName('تقديم فعالية').id })).status, 403);
  const mv = await a.post(`/api/admin/submissions/${sub.id}/move`, { item_id: itemByName('تقديم فعالية').id });
  assert.equal(mv.status, 200); assert.equal(mv.data.submission.item_name, 'تقديم فعالية حوارية');
  const hist = (await a.get(`/api/admin/submissions/${sub.id}`)).data.history;
  assert.ok(hist.some((h) => h.action === 'submission.move'));
});

test('التقارير والتصدير وسجل العمليات', async () => {
  const a = await adminClient();
  const st = (await a.get('/api/admin/reports/students')).data;
  assert.equal(st.sections.length, 3);
  assert.deepEqual(st.sections[0].rows.map((r) => r[0]), ['أول ثانوي', 'ثاني ثانوي', 'ثالث ثانوي']);
  const nora = st.sections[2].rows.find((r) => r[0] === 'نورة خالد العتيبي');
  assert.equal(nora[4], 1); assert.equal(nora[5], 1);
  assert.ok(st.sections[2].note.includes('لا يمثل تقييمًا شاملًا'));
  const it = (await a.get('/api/admin/reports/items')).data;
  assert.equal(it.sections[0].rows.length, 15);
  const ad = (await a.get(`/api/admin/reports/admin?from=${today()}&to=${today()}`)).data;
  assert.ok(ad.sections.find((s) => s.key === 'summary').rows[0][1] > 0);
  assert.ok(ad.sections.find((s) => s.key === 'audit').rows.length > 0);
  const f1 = (await a.get(`/api/admin/reports/students?grade_id=1`)).data;
  assert.ok(f1.sections[2].rows.every((r) => r[2] === 'أول ثانوي'));
  for (const t of ['students', 'items', 'admin']) {
    const x = await a.get(`/api/admin/reports/${t}/export`);
    assert.equal(x.status, 200);
    assert.ok(x.headers.get('content-type').includes('spreadsheetml'));
    assert.equal(x.data.subarray(0, 2).toString(), 'PK');
  }
  assert.equal((await a.get('/api/admin/reports/zzz')).status, 404);
  const log = (await a.get('/api/admin/audit?action=grade.')).data;
  assert.ok(log.total > 0 && log.rows.every((r) => r.action.startsWith('grade.')));
});

test('استمرار البيانات بعد إعادة تشغيل الخادم', async () => {
  const before = (await (await adminClient()).get('/api/admin/dashboard')).data;
  await srv.stop();
  srv = await startServer(PORT, dataDir);
  const a = await adminClient();
  const after = (await a.get('/api/admin/dashboard')).data;
  assert.equal(after.submissions.total, before.submissions.total);
  assert.equal(after.files.total, before.files.total);
  const c = admin();
  assert.equal((await login(c, 'student', '2001', 'Pass2001x9')).status, 200);
  const items2 = (await c.get('/api/student/items/' + itemByName('الخدمة المجتمعية').id)).data;
  assert.equal(items2.submissions.length, 1);
  assert.equal((await c.get(`/api/files/${items2.submissions[0].files[0].id}/view`)).status, 200);
});
