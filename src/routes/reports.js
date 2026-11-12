'use strict';
const { route, HttpError } = require('../http');
const { get, all, audit, settings } = require('../db');
const { buildWorkbook } = require('../xlsx');
const S = require('../services');

const ADMIN = { roles: ['admin'] };

const STATUS = { pending: 'قيد المراجعة', accepted: 'مقبول', needs_completion: 'يحتاج إلى استكمال' };
const ACTIONS = {
  login: 'تسجيل دخول', 'login.fail': 'محاولة دخول فاشلة', logout: 'تسجيل خروج', 'password.change': 'تغيير كلمة مرور', 'password.reset': 'إعادة تعيين كلمة مرور',
  'submission.create': 'إضافة مشاركة', 'submission.update': 'تعديل مشاركة', 'submission.delete': 'حذف مشاركة', 'submission.review': 'مراجعة شاهد',
  'submission.move': 'نقل مشاركة إلى بند آخر', 'submission.reset_on_edit': 'إعادة المشاركة للمراجعة بعد التعديل',
  'grade.approve': 'اعتماد درجة', 'grade.revoke': 'إلغاء درجة معتمدة', 'grade.revoke_on_status': 'إلغاء درجة بسبب تغيير الحالة',
  'file.upload': 'رفع ملف', 'file.delete': 'حذف ملف', 'file.replace': 'استبدال ملف', 'file.download': 'تنزيل ملف (إدارة)',
  'note.add': 'إضافة ملاحظة', 'student.create': 'إضافة طالبة', 'student.update': 'تعديل بيانات طالبة', 'student.move': 'نقل طالبة',
  'student.import': 'استيراد طالبات', 'discipline.create': 'إنشاء سجل انضباط', 'item.update': 'تعديل بند', 'item.reorder': 'ترتيب البنود',
  'class.create': 'إضافة فصل', 'class.update': 'تعديل فصل', 'settings.update': 'تعديل الإعدادات', 'account.create': 'إضافة حساب إداري',
  'account.update': 'تعديل حساب إداري', 'report.export': 'تصدير تقرير',
};
const IMPORTANT = ['grade.', 'submission.review', 'submission.move', 'student.', 'password.reset', 'settings.', 'item.', 'class.', 'account.', 'discipline.', 'file.download', 'report.export', 'note.add'];

const detailText = (d) => {
  if (!d) return '';
  try { return Object.entries(d).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' | ').slice(0, 300); } catch { return ''; }
};

function filters(q) {
  const f = { grade_id: q.grade_id ? S.intId(q.grade_id) : null, class_id: q.class_id ? S.intId(q.class_id) : null };
  f.from = q.from ? S.dateStr(q.from, { label: 'من تاريخ', allowFuture: true }) : null;
  f.to = q.to ? S.dateStr(q.to, { label: 'إلى تاريخ', allowFuture: true }) : null;
  return f;
}

// ---------- تقارير الطالبات ----------
function studentsReport(f) {
  const where = ['1=1']; const params = [];
  if (f.grade_id) { where.push('g.id = ?'); params.push(f.grade_id); }
  if (f.class_id) { where.push('cl.id = ?'); params.push(f.class_id); }
  const W = where.join(' AND ');

  const byGrade = all(
    `SELECT g.name, COUNT(st.user_id) AS total, COALESCE(SUM(u.active),0) AS active
       FROM grades g LEFT JOIN classes cl ON cl.grade_id = g.id LEFT JOIN students st ON st.class_id = cl.id LEFT JOIN users u ON u.id = st.user_id
      WHERE ${f.grade_id ? 'g.id = ?' : '1=1'} GROUP BY g.id ORDER BY g.sort`, ...(f.grade_id ? [f.grade_id] : [])
  );
  const byClass = all(
    `SELECT g.name AS grade_name, cl.name AS class_name, cl.active AS cl_active,
            (SELECT COUNT(*) FROM students s2 WHERE s2.class_id = cl.id) AS students,
            (SELECT COUNT(*) FROM submissions s JOIN students s3 ON s3.user_id = s.student_id WHERE s3.class_id = cl.id AND s.deleted_at IS NULL) AS subs,
            (SELECT COUNT(*) FROM evidence_files f JOIN submissions s ON s.id = f.submission_id JOIN students s4 ON s4.user_id = s.student_id WHERE s4.class_id = cl.id AND f.deleted_at IS NULL AND s.deleted_at IS NULL) AS files
       FROM classes cl JOIN grades g ON g.id = cl.grade_id WHERE ${W.replace(/st\./g, 'st.')} ORDER BY g.sort, cl.sort`.replace('WHERE 1=1', 'WHERE 1=1'), ...params
  );
  const rows = all(
    `SELECT u.id, u.full_name, st.school_number, g.name AS grade_name, cl.name AS class_name,
            (SELECT COUNT(*) FROM submissions s WHERE s.student_id = u.id AND s.deleted_at IS NULL) AS subs,
            (SELECT COUNT(*) FROM evidence_files f JOIN submissions s ON s.id = f.submission_id WHERE f.student_id = u.id AND f.deleted_at IS NULL AND s.deleted_at IS NULL) AS files,
            (SELECT COUNT(*) FROM submissions s WHERE s.student_id = u.id AND s.deleted_at IS NULL AND s.status='pending') AS pending,
            (SELECT COUNT(*) FROM submissions s WHERE s.student_id = u.id AND s.deleted_at IS NULL AND s.status='accepted') AS accepted,
            (SELECT COUNT(*) FROM submissions s WHERE s.student_id = u.id AND s.deleted_at IS NULL AND s.status='needs_completion') AS needs
       FROM students st JOIN users u ON u.id = st.user_id JOIN classes cl ON cl.id = st.class_id JOIN grades g ON g.id = cl.grade_id
      WHERE ${W} ORDER BY g.sort, cl.sort, u.full_name`, ...params
  );
  const totals = S.approvedTotals();
  return {
    title: 'تقرير الطالبات',
    sections: [
      { key: 'by_grade', title: 'عدد الطالبات في كل مرحلة', columns: ['المرحلة', 'الطالبات (حسابات فعّالة)', 'إجمالي الحسابات'], rows: byGrade.map((r) => [r.name, r.active, r.total]) },
      { key: 'by_class', title: 'عدد الطالبات في كل فصل', columns: ['المرحلة', 'الفصل', 'عدد الطالبات', 'المشاركات', 'الشواهد المرفوعة'], rows: byClass.map((r) => [r.grade_name, r.class_name + (r.cl_active ? '' : ' (موقوف)'), r.students, r.subs, r.files]) },
      {
        key: 'students', title: 'ملخص الطالبات',
        note: 'عدد المشاركات والشواهد لا يمثل تقييمًا شاملًا لسلوك الطالبة، ولا يُستخدم لتصنيف الطالبات. الدرجات الظاهرة هي المعتمدة فقط، وفق قواعد الاحتساب المحددة في الإعدادات.',
        columns: ['الطالبة', 'اسم المستخدم', 'المرحلة', 'الفصل', 'المشاركات', 'الشواهد', 'قيد المراجعة', 'مقبولة', 'تحتاج استكمال', 'مجموع الدرجات المعتمدة'],
        rows: rows.map((r) => [r.full_name, r.school_number, r.grade_name, r.class_name, r.subs, r.files, r.pending, r.accepted, r.needs, (totals.get(r.id) || { total: 0 }).total]),
        links: rows.map((r) => `/admin/student/${r.id}`),
      },
    ],
  };
}

// ---------- تقارير البنود ----------
function itemsReport(f) {
  const where = ['s.deleted_at IS NULL']; const params = [];
  if (f.grade_id) { where.push('g.id = ?'); params.push(f.grade_id); }
  if (f.class_id) { where.push('cl.id = ?'); params.push(f.class_id); }
  const W = where.join(' AND ');
  const base = `FROM submissions s JOIN students st ON st.user_id = s.student_id JOIN classes cl ON cl.id = st.class_id JOIN grades g ON g.id = cl.grade_id WHERE ${W}`;
  const items = all('SELECT i.id, i.name, c.name AS cat FROM items i JOIN categories c ON c.id = i.category_id ORDER BY i.sort');
  const subCounts = new Map(all(`SELECT s.item_id, COUNT(*) AS n, SUM(s.status='accepted') AS acc, SUM(s.status='needs_completion') AS needs, SUM(s.status='pending') AS pend ${base} GROUP BY s.item_id`, ...params).map((r) => [r.item_id, r]));
  const fileCounts = new Map(all(
    `SELECT s.item_id, COUNT(f.id) AS n, SUM(s.status='accepted') AS acc, SUM(s.status='needs_completion') AS needs, SUM(s.status='pending') AS pend
       FROM evidence_files f JOIN submissions s ON s.id = f.submission_id JOIN students st ON st.user_id = s.student_id JOIN classes cl ON cl.id = st.class_id JOIN grades g ON g.id = cl.grade_id
      WHERE f.deleted_at IS NULL AND ${W} GROUP BY s.item_id`, ...params).map((r) => [r.item_id, r]));
  const grades = all('SELECT id, name FROM grades ORDER BY sort');
  const byGrade = new Map(all(`SELECT s.item_id, g.id AS gid, COUNT(*) AS n ${base} GROUP BY s.item_id, g.id`, ...params).map((r) => [`${r.item_id}:${r.gid}`, r.n]));
  const byClass = all(`SELECT s.item_id, g.name AS gname, cl.name AS cname, g.sort AS gs, cl.sort AS cs, COUNT(*) AS n ${base} GROUP BY s.item_id, cl.id ORDER BY s.item_id, g.sort, cl.sort`, ...params);
  const itemName = new Map(items.map((i) => [i.id, i.name]));
  const num = (v) => v || 0;
  return {
    title: 'تقرير البنود',
    sections: [
      {
        key: 'items', title: 'ملخص البنود',
        columns: ['الفئة', 'البند', 'عدد المشاركات', 'الشواهد المرفوعة', 'الشواهد المقبولة', 'الشواهد التي تحتاج إلى استكمال', 'الشواهد قيد المراجعة'],
        rows: items.map((i) => [i.cat, i.name, num((subCounts.get(i.id) || {}).n), num((fileCounts.get(i.id) || {}).n), num((fileCounts.get(i.id) || {}).acc), num((fileCounts.get(i.id) || {}).needs), num((fileCounts.get(i.id) || {}).pend)]),
      },
      {
        key: 'by_grade', title: 'توزيع المشاركات حسب المرحلة', columns: ['البند', ...grades.map((g) => g.name)],
        rows: items.map((i) => [i.name, ...grades.map((g) => byGrade.get(`${i.id}:${g.id}`) || 0)]),
      },
      {
        key: 'by_class', title: 'توزيع المشاركات حسب الفصل', note: 'تظهر فقط الفصول التي سُجّلت فيها مشاركات.',
        columns: ['البند', 'المرحلة', 'الفصل', 'عدد المشاركات'], rows: byClass.map((r) => [itemName.get(r.item_id), r.gname, r.cname, r.n]),
      },
    ],
  };
}

// ---------- التقارير الإدارية ----------
function adminReport(f) {
  const from = f.from || '0000-01-01';
  const to = (f.to || '9999-12-31') + 'T99';
  const sum = {
    files: get("SELECT COUNT(*) AS n FROM evidence_files f JOIN submissions s ON s.id=f.submission_id WHERE s.deleted_at IS NULL AND f.uploaded_at >= ? AND f.uploaded_at < ?", from, to).n,
    subs: get('SELECT COUNT(*) AS n FROM submissions WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?', from, to).n,
    graded: get('SELECT COUNT(*) AS n FROM submissions WHERE deleted_at IS NULL AND approved_at >= ? AND approved_at < ?', from, to).n,
    pending: get("SELECT COUNT(*) AS n FROM submissions WHERE deleted_at IS NULL AND status='pending'").n,
  };
  const q = (extra, lim, ...p) => all(`${S.SUB_SELECT} WHERE s.deleted_at IS NULL ${extra} LIMIT ${lim}`, ...p);
  const latest = q('AND s.created_at >= ? AND s.created_at < ? ORDER BY s.created_at DESC', 100, from, to);
  const pending = q("AND s.status='pending' ORDER BY s.edited_at ASC", 200);
  const approved = q('AND s.approved_points IS NOT NULL AND s.approved_at >= ? AND s.approved_at < ? ORDER BY s.approved_at DESC', 300, from, to);
  const day = (iso) => (iso ? iso.slice(0, 10) : '');
  const logRows = all('SELECT * FROM audit_log WHERE created_at >= ? AND created_at < ? ORDER BY id DESC LIMIT 600', from, to)
    .filter((r) => IMPORTANT.some((p) => r.action.startsWith(p))).slice(0, 200);
  const subRow = (r) => [r.student_name, `${r.grade_name} - ${r.class_name}`, r.item_name, r.title, STATUS[r.status], day(r.created_at)];
  const subCols = ['الطالبة', 'المرحلة والفصل', 'البند', 'عنوان المشاركة', 'الحالة', 'تاريخ الإضافة'];
  return {
    title: 'التقرير الإداري',
    period: { from: f.from, to: f.to },
    sections: [
      {
        key: 'summary', title: 'ملخص الفترة', columns: ['المؤشر', 'القيمة'],
        rows: [['الشواهد (الملفات) المرفوعة خلال الفترة', sum.files], ['المشاركات المضافة خلال الفترة', sum.subs], ['الدرجات المعتمدة خلال الفترة (عدد المشاركات)', sum.graded], ['المشاركات التي تنتظر المراجعة حاليًا', sum.pending]],
      },
      { key: 'latest', title: 'أحدث المشاركات', columns: subCols, rows: latest.map(subRow), links: latest.map((r) => `/admin/submission/${r.id}`) },
      { key: 'pending', title: 'الشواهد التي تنتظر المراجعة', columns: subCols, rows: pending.map(subRow), links: pending.map((r) => `/admin/submission/${r.id}`) },
      {
        key: 'approved', title: 'المشاركات المعتمدة', columns: ['الطالبة', 'المرحلة والفصل', 'البند', 'عنوان المشاركة', 'الدرجة المعتمدة', 'اعتمدها', 'تاريخ الاعتماد'],
        rows: approved.map((r) => [r.student_name, `${r.grade_name} - ${r.class_name}`, r.item_name, r.title, r.approved_points, r.approved_by_name || '', day(r.approved_at)]),
        links: approved.map((r) => `/admin/submission/${r.id}`),
      },
      {
        key: 'audit', title: 'سجل العمليات الإدارية المهمة', columns: ['الوقت', 'المستخدم', 'العملية', 'التفاصيل'],
        rows: logRows.map((r) => [r.created_at.replace('T', ' ').slice(0, 16), r.user_name || '—', ACTIONS[r.action] || r.action, detailText(r.details ? JSON.parse(r.details) : null)]),
      },
    ],
  };
}

const BUILDERS = { students: studentsReport, items: itemsReport, admin: adminReport };

route('GET', '/api/admin/reports/:type', ADMIN, async (ctx) => {
  const b = BUILDERS[ctx.params.type];
  if (!b) throw new HttpError(404, 'نوع التقرير غير موجود.');
  const rep = b(filters(ctx.query));
  return { ...rep, generated_at: new Date().toISOString(), school_name: settings().school_name, platform_name: 'أَثَر 87 | ATHAR 87' };
});

route('GET', '/api/admin/reports/:type/export', ADMIN, async (ctx) => {
  const b = BUILDERS[ctx.params.type];
  if (!b) throw new HttpError(404, 'نوع التقرير غير موجود.');
  const rep = b(filters(ctx.query));
  const date = new Date().toISOString().slice(0, 10);
  const head = (t) => [
    { cells: [`أَثَر 87 | ATHAR 87 — ${settings().school_name}`], style: 'title' },
    { cells: [`${t} — تاريخ الإصدار: ${date}`], style: 'note' },
    [],
  ];
  const sheets = rep.sections.map((sec) => {
    const rows = [...head(`${rep.title}: ${sec.title}`)];
    if (sec.note) rows.push({ cells: [sec.note], style: 'note' }, []);
    rows.push({ cells: sec.columns, style: 'header' }, ...sec.rows);
    return { name: sec.title, rows, widths: sec.columns.map((c, i) => Math.min(40, Math.max(12, c.length + 4, ...sec.rows.slice(0, 40).map((r) => String(r[i] ?? '').length + 2)))) };
  });
  audit(ctx, 'report.export', 'report', ctx.params.type, { filters: ctx.query });
  ctx.sendBuffer(buildWorkbook(sheets), { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: `athar87-${ctx.params.type}-${date}.xlsx` });
});
