'use strict';
const { route, HttpError } = require('../http');
const { get, all, run, tx, nowIso, audit, settings, setSetting, normalizeAr } = require('../db');
const { hashPassword, tempPassword } = require('../crypto');
const { destroyUserSessions } = require('../auth');
const { TYPES } = require('../files');
const { validatePassword } = require('./auth');
const S = require('../services');

const STAFF = { roles: ['admin', 'reviewer'] };
const ADMIN = { roles: ['admin'] };

const like = (q) => '%' + normalizeAr(q).replace(/[\\%_]/g, (m) => '\\' + m) + '%';
const pageParams = (q, def = 25) => {
  const size = Math.min(Math.max(parseInt(q.page_size, 10) || def, 1), 200);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  return { size, page, offset: (page - 1) * size };
};
const detailsOf = (r) => { try { return r.details ? JSON.parse(r.details) : null; } catch { return null; } };

// ======================= لوحة التحكم =======================
route('GET', '/api/admin/dashboard', STAFF, async () => {
  const grades = all(
    `SELECT g.id, g.name,
            (SELECT COUNT(*) FROM classes c WHERE c.grade_id = g.id AND c.active = 1) AS classes,
            (SELECT COUNT(*) FROM students st JOIN classes c ON c.id = st.class_id WHERE c.grade_id = g.id) AS students
       FROM grades g ORDER BY g.sort`
  );
  const students = get('SELECT COUNT(*) AS total, COALESCE(SUM(u.active),0) AS active FROM students st JOIN users u ON u.id = st.user_id');
  const classes = get('SELECT COUNT(*) AS n FROM classes WHERE active = 1').n;
  const subs = get(
    `SELECT COUNT(*) AS total, COALESCE(SUM(status='pending'),0) AS pending, COALESCE(SUM(status='accepted'),0) AS accepted,
            COALESCE(SUM(status='needs_completion'),0) AS needs, COALESCE(SUM(approved_points IS NOT NULL),0) AS graded
       FROM submissions WHERE deleted_at IS NULL`
  );
  const files = get(
    `SELECT COUNT(*) AS total, COALESCE(SUM(s.status='pending'),0) AS pending, COALESCE(SUM(s.status='accepted'),0) AS accepted,
            COALESCE(SUM(s.status='needs_completion'),0) AS needs
       FROM evidence_files f JOIN submissions s ON s.id = f.submission_id WHERE f.deleted_at IS NULL AND s.deleted_at IS NULL`
  );
  const latest = S.hydrate(all(`${S.SUB_SELECT} WHERE s.deleted_at IS NULL ORDER BY s.created_at DESC LIMIT 8`), true);
  return { grades, students, classes, submissions: subs, files, latest, term: settings().current_term };
});

// ======================= المراحل والفصول والطالبات =======================
route('GET', '/api/admin/structure', STAFF, async () => {
  const grades = all('SELECT id, name, sort FROM grades ORDER BY sort');
  const cnt = (extra) => `
    SELECT COUNT(*) FROM submissions s JOIN students st2 ON st2.user_id = s.student_id
     WHERE st2.class_id = c.id AND s.deleted_at IS NULL ${extra}`;
  const classes = all(
    `SELECT c.id, c.grade_id, c.name, c.active,
            (SELECT COUNT(*) FROM students st WHERE st.class_id = c.id) AS students,
            (${cnt('')}) AS submissions,
            (${cnt("AND s.status = 'pending'")}) AS pending,
            (SELECT COUNT(*) FROM evidence_files f JOIN submissions s ON s.id = f.submission_id JOIN students st3 ON st3.user_id = s.student_id
              WHERE st3.class_id = c.id AND f.deleted_at IS NULL AND s.deleted_at IS NULL) AS files
       FROM classes c ORDER BY c.sort`
  );
  return {
    grades: grades.map((g) => {
      const cl = classes.filter((c) => c.grade_id === g.id).map((c) => ({ ...c, active: !!c.active }));
      const sum = (k) => cl.reduce((a, c) => a + c[k], 0);
      return { ...g, classes: cl, students: sum('students'), submissions: sum('submissions'), files: sum('files'), pending: sum('pending') };
    }),
  };
});

route('GET', '/api/admin/classes/:id/students', STAFF, async (ctx) => {
  const cl = get('SELECT c.id, c.name, c.grade_id, g.name AS grade_name FROM classes c JOIN grades g ON g.id = c.grade_id WHERE c.id = ?', S.intId(ctx.params.id));
  if (!cl) throw new HttpError(404, 'لم يتم العثور على الفصل.');
  const rows = all(
    `SELECT u.id, u.full_name, u.active, st.school_number,
            (SELECT COUNT(*) FROM submissions s WHERE s.student_id = u.id AND s.deleted_at IS NULL) AS submissions,
            (SELECT COUNT(*) FROM submissions s WHERE s.student_id = u.id AND s.deleted_at IS NULL AND s.status = 'pending') AS pending,
            (SELECT COUNT(*) FROM evidence_files f JOIN submissions s ON s.id = f.submission_id WHERE f.student_id = u.id AND f.deleted_at IS NULL AND s.deleted_at IS NULL) AS files
       FROM students st JOIN users u ON u.id = st.user_id WHERE st.class_id = ?`, cl.id
  );
  rows.sort((a, b) => a.full_name.localeCompare(b.full_name, 'ar'));
  return { class: cl, students: rows.map((r) => ({ ...r, active: !!r.active })) };
});

route('GET', '/api/admin/students', STAFF, async (ctx) => {
  const q = ctx.query;
  const where = ['1=1']; const params = [];
  if (q.q) {
    const l = like(q.q);
    where.push("(norm(u.full_name) LIKE ? ESCAPE '\\' OR st.school_number LIKE ? ESCAPE '\\')");
    params.push(l, l);
  }
  if (q.grade_id) { where.push('g.id = ?'); params.push(S.intId(q.grade_id)); }
  if (q.class_id) { where.push('cl.id = ?'); params.push(S.intId(q.class_id)); }
  if (q.active === '1' || q.active === '0') { where.push('u.active = ?'); params.push(Number(q.active)); }
  const from = `FROM students st JOIN users u ON u.id = st.user_id JOIN classes cl ON cl.id = st.class_id JOIN grades g ON g.id = cl.grade_id WHERE ${where.join(' AND ')}`;
  const { size, page, offset } = pageParams(q, 50);
  const total = get(`SELECT COUNT(*) AS n ${from}`, ...params).n;
  const rows = all(
    `SELECT u.id, u.full_name, u.active, st.school_number, cl.id AS class_id, cl.name AS class_name, g.id AS grade_id, g.name AS grade_name,
            (SELECT COUNT(*) FROM submissions s WHERE s.student_id = u.id AND s.deleted_at IS NULL) AS submissions,
            (SELECT COUNT(*) FROM evidence_files f JOIN submissions s ON s.id = f.submission_id WHERE f.student_id = u.id AND f.deleted_at IS NULL AND s.deleted_at IS NULL) AS files
       ${from} ORDER BY g.sort, cl.sort, u.full_name LIMIT ? OFFSET ?`, ...params, size, offset
  );
  return { rows: rows.map((r) => ({ ...r, active: !!r.active })), total, page, pages: Math.max(1, Math.ceil(total / size)) };
});

route('GET', '/api/admin/students/:id', STAFF, async (ctx) => ({ ...S.overview(S.intId(ctx.params.id), { admin: true }) }));

route('GET', '/api/admin/students/:id/items/:itemId', STAFF, async (ctx) => {
  const sid = S.intId(ctx.params.id);
  const student = S.studentRow(sid);
  if (!student) throw new HttpError(404, 'لم يتم العثور على الطالبة.');
  const item = get('SELECT * FROM items WHERE id = ?', S.intId(ctx.params.itemId));
  if (!item) throw new HttpError(404, 'لم يتم العثور على البند.');
  const cat = get('SELECT id, name, color FROM categories WHERE id = ?', item.category_id);
  const rows = all(`${S.SUB_SELECT} WHERE s.student_id = ? AND s.item_id = ? AND s.deleted_at IS NULL ORDER BY s.created_at DESC`, sid, item.id);
  return { student, item: S.itemDto(item), category: cat, submissions: S.hydrate(rows, true) };
});

function validSchoolNumber(v) {
  const n = S.toLatinDigits(String(v || '')).trim();
  if (!/^[0-9A-Za-z._-]{3,20}$/.test(n)) throw new HttpError(400, 'اسم المستخدم يجب أن يتكون من 3 إلى 20 حرفًا أو رقمًا (بدون مسافات).');
  return n;
}
// اسم مستخدم تلقائي: S0001، S0002 ... (يُتخطى أي اسم مستخدم.)
function nextUsernames(count) {
  const row = get("SELECT MAX(CAST(SUBSTR(username, 2) AS INTEGER)) AS m FROM users WHERE role = 'student' AND username GLOB 'S[0-9]*' AND username NOT GLOB 'S*[^0-9]*'");
  let n = (row && row.m) || 0;
  const out = [];
  while (out.length < count) {
    n += 1;
    const u = 'S' + String(n).padStart(4, '0');
    if (!get('SELECT id FROM users WHERE username = ?', u)) out.push(u);
  }
  return out;
}
function activeClass(id) {
  const c = get('SELECT c.*, g.name AS grade_name FROM classes c JOIN grades g ON g.id = c.grade_id WHERE c.id = ?', S.intId(id, 'الفصل'));
  if (!c) throw new HttpError(400, 'الفصل المحدد غير موجود.');
  return c;
}

route('POST', '/api/admin/students', ADMIN, async (ctx) => {
  const full_name = S.text(ctx.body.full_name, { label: 'اسم الطالبة', min: 3, max: 100 });
  const given = ctx.body.school_number;
  const number = given != null && String(given).trim() !== '' ? validSchoolNumber(given) : nextUsernames(1)[0];
  const cl = activeClass(ctx.body.class_id);
  if (!cl.active) throw new HttpError(400, 'لا يمكن التسجيل في فصل موقوف.');
  if (get('SELECT id FROM users WHERE username = ?', number)) throw new HttpError(400, 'اسم المستخدم مستخدم مسبقًا.');
  const pw = tempPassword();
  const hash = await hashPassword(pw);
  const now = nowIso();
  const id = tx(() => {
    const u = run("INSERT INTO users(role, username, password_hash, full_name, active, must_change_password, created_at) VALUES('student',?,?,?,1,1,?)", number, hash, full_name, now);
    run('INSERT INTO students(user_id, school_number, class_id) VALUES(?,?,?)', u.lastInsertRowid, number, cl.id);
    run('INSERT INTO student_class_history(student_id, from_class_id, to_class_id, moved_by, moved_at) VALUES(?,?,?,?,?)', u.lastInsertRowid, null, cl.id, ctx.user.id, now);
    audit(ctx, 'student.create', 'student', u.lastInsertRowid, { school_number: number, class_id: cl.id });
    return Number(u.lastInsertRowid);
  });
  return { student: S.studentRow(id), username: number, temp_password: pw };
});

route('PUT', '/api/admin/students/:id', ADMIN, async (ctx) => {
  const id = S.intId(ctx.params.id);
  const cur = S.studentRow(id);
  if (!cur) throw new HttpError(404, 'لم يتم العثور على الطالبة.');
  const full_name = S.text(ctx.body.full_name, { label: 'اسم الطالبة', min: 3, max: 100 });
  const given = ctx.body.school_number;
  const number = given != null && String(given).trim() !== '' ? validSchoolNumber(given) : cur.school_number;
  const active = ctx.body.active === false || ctx.body.active === 0 ? 0 : 1;
  const dup = get('SELECT id FROM users WHERE username = ? AND id <> ?', number, id);
  if (dup) throw new HttpError(400, 'اسم المستخدم مستخدم مسبقًا.');
  tx(() => {
    run('UPDATE users SET full_name=?, username=?, active=? WHERE id=?', full_name, number, active, id);
    run('UPDATE students SET school_number=? WHERE user_id=?', number, id);
    audit(ctx, 'student.update', 'student', id, { before: { full_name: cur.full_name, school_number: cur.school_number, active: cur.active }, after: { full_name, school_number: number, active } });
  });
  if (!active) destroyUserSessions(id);
  return { student: S.studentRow(id) };
});

route('POST', '/api/admin/students/:id/move', ADMIN, async (ctx) => {
  const id = S.intId(ctx.params.id);
  const cur = S.studentRow(id);
  if (!cur) throw new HttpError(404, 'لم يتم العثور على الطالبة.');
  const cl = activeClass(ctx.body.class_id);
  if (!cl.active) throw new HttpError(400, 'لا يمكن النقل إلى فصل موقوف.');
  if (cl.id === cur.class_id) throw new HttpError(400, 'الطالبة مسجلة في هذا الفصل بالفعل.');
  tx(() => {
    run('UPDATE students SET class_id=? WHERE user_id=?', cl.id, id);
    run('INSERT INTO student_class_history(student_id, from_class_id, to_class_id, moved_by, moved_at) VALUES(?,?,?,?,?)', id, cur.class_id, cl.id, ctx.user.id, nowIso());
    audit(ctx, 'student.move', 'student', id, { from_class_id: cur.class_id, to_class_id: cl.id });
  });
  return { student: S.studentRow(id) }; // الملف والشواهد السابقة تبقى مرتبطة بالطالبة كما هي
});

route('POST', '/api/admin/students/:id/reset-password', ADMIN, async (ctx) => {
  const id = S.intId(ctx.params.id);
  const cur = S.studentRow(id);
  if (!cur) throw new HttpError(404, 'لم يتم العثور على الطالبة.');
  const pw = tempPassword();
  const hash = await hashPassword(pw);
  run('UPDATE users SET password_hash=?, must_change_password=1, failed_logins=0, locked_until=0 WHERE id=?', hash, id);
  destroyUserSessions(id);
  audit(ctx, 'password.reset', 'student', id);
  return { username: cur.school_number, temp_password: pw };
});

route('POST', '/api/admin/students/:id/discipline', ADMIN, async (ctx) => {
  const id = S.intId(ctx.params.id);
  if (!S.studentRow(id)) throw new HttpError(404, 'لم يتم العثور على الطالبة.');
  const item = get("SELECT * FROM items WHERE form_type = 'discipline'");
  const term = S.text(ctx.body.term || settings().current_term, { label: 'الفصل الدراسي', min: 2, max: 60 });
  if (get('SELECT id FROM submissions WHERE student_id=? AND item_id=? AND term=? AND deleted_at IS NULL', id, item.id, term)) {
    throw new HttpError(400, 'يوجد سجل انضباط لهذه الطالبة في هذا الفصل الدراسي بالفعل.');
  }
  const note = S.text(ctx.body.note, { label: 'ملاحظات', max: 1500 }) || 'سجل انضباط يُراجع وفق السجلات المعتمدة من المدرسة.';
  const now = nowIso();
  const sid = tx(() => {
    const r = run(
      `INSERT INTO submissions(student_id, item_id, term, title, description, activity_date, status, created_by, created_at, updated_at, edited_at)
       VALUES(?,?,?,?,?,?, 'pending', ?, ?, ?, ?)`, id, item.id, term, `الانضباط — ${term}`, note, now.slice(0, 10), ctx.user.id, now, now, now
    );
    audit(ctx, 'discipline.create', 'submission', r.lastInsertRowid, { student_id: id, term });
    return Number(r.lastInsertRowid);
  });
  return { id: sid };
});

// ---------- استيراد الطالبات من CSV ----------
function parseCsv(input) {
  const t = String(input).replace(/^﻿/, '');
  const first = t.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = []; let cur = ''; let q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()));
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()));
  return rows;
}

const H = {
  name: ['full_name', 'name', 'الاسم', 'اسم الطالبه', 'الاسم الكامل', 'اسم الطالبة'],
  number: ['school_number', 'number', 'id', 'الرقم المدرسي', 'username', 'user', 'اسم المستخدم', 'رقم الطالبه', 'الرقم', 'اسم المستخدم'],
  grade: ['grade', 'stage', 'المرحله', 'الصف', 'المرحلة'],
  cls: ['class', 'section', 'الفصل'],
};
const hmatch = (cell, list) => list.map(normalizeAr).includes(normalizeAr(cell));

route('POST', '/api/admin/students/import', { ...ADMIN, jsonLimit: 4 * 1024 * 1024 }, async (ctx) => {
  const raw = String(ctx.body.csv || '');
  if (!raw.trim()) throw new HttpError(400, 'لم يتم إدخال بيانات.');
  let rows = parseCsv(raw);
  let idx = { name: 0, number: 1, grade: 2, cls: 3 };
  const head = rows[0] || [];
  const hasHeader = head.some((c) => hmatch(c, H.name)) || head.some((c) => hmatch(c, H.number));
  if (!hasHeader && head.length === 3) idx = { name: 0, number: -1, grade: 1, cls: 2 };
  if (hasHeader) {
    idx = {
      name: head.findIndex((c) => hmatch(c, H.name)), number: head.findIndex((c) => hmatch(c, H.number)),
      grade: head.findIndex((c) => hmatch(c, H.grade)), cls: head.findIndex((c) => hmatch(c, H.cls)),
    };
    if (idx.name < 0 || idx.grade < 0 || idx.cls < 0) throw new HttpError(400, 'أعمدة الملف غير مكتملة. المطلوب: الاسم، المرحلة، الفصل.');
    rows = rows.slice(1);
  }
  if (rows.length > 1500) throw new HttpError(400, 'الحد الأقصى 1500 طالبة في الاستيراد الواحد.');

  const grades = all('SELECT * FROM grades ORDER BY sort');
  const classes = all('SELECT * FROM classes WHERE active = 1');
  const findGrade = (v) => {
    const n = normalizeAr(v);
    if (/^[1-3]$/.test(n)) return grades[Number(n) - 1];
    return grades.find((g) => normalizeAr(g.name) === n) || grades.find((g) => normalizeAr(g.name).startsWith(n.split(' ')[0]) && n.length >= 3);
  };
  const ORD = ['الاول', 'الثاني', 'الثالث', 'الرابع', 'الخامس'];
  const findClass = (g, v) => {
    const n = normalizeAr(v).replace(/^ال?فصل\s*/, '').trim();
    const list = classes.filter((c) => c.grade_id === g.id);
    if (/^[1-9]$/.test(n)) return list.find((c) => c.sort === Number(n));
    return list.find((c) => normalizeAr(c.name) === normalizeAr(v)) || list.find((c, i) => ORD.map(normalizeAr)[c.sort - 1] === n);
  };

  const created = []; const skipped = []; const seen = new Set();
  const prepared = [];
  rows.forEach((r, i) => {
    const line = i + 1 + (hasHeader ? 1 : 0);
    try {
      const name = S.text(r[idx.name], { label: 'اسم الطالبة', min: 3, max: 100 });
      const rawNum = idx.number >= 0 ? String(r[idx.number] || '').trim() : '';
      const number = rawNum ? validSchoolNumber(rawNum) : null;
      const g = findGrade(r[idx.grade] || '');
      if (!g) throw new HttpError(400, 'المرحلة غير معروفة');
      const cl = findClass(g, r[idx.cls] || '');
      if (!cl) throw new HttpError(400, 'الفصل غير معروف');
      if (number) {
        if (seen.has(number)) throw new HttpError(400, 'اسم المستخدم مكرر داخل الملف');
        if (get('SELECT id FROM users WHERE username = ?', number)) throw new HttpError(400, 'اسم المستخدم مسجل مسبقًا');
        seen.add(number);
      }
      prepared.push({ name, number, g, cl });
    } catch (e) {
      skipped.push({ row: line, name: r[idx.name] || '', school_number: idx.number >= 0 ? (r[idx.number] || '') : '', reason: e.message });
    }
  });
  const autos = nextUsernames(prepared.filter((p) => !p.number).length + seen.size + 5).filter((u) => !seen.has(u));
  let ai = 0;
  prepared.forEach((p) => { if (!p.number) p.number = autos[ai++]; });
  const withPw = await Promise.all(prepared.map(async (p) => {
    const pw = tempPassword();
    return { ...p, pw, hash: await hashPassword(pw) };
  }));
  const now = nowIso();
  tx(() => {
    for (const p of withPw) {
      const u = run("INSERT INTO users(role, username, password_hash, full_name, active, must_change_password, created_at) VALUES('student',?,?,?,1,1,?)", p.number, p.hash, p.name, now);
      run('INSERT INTO students(user_id, school_number, class_id) VALUES(?,?,?)', u.lastInsertRowid, p.number, p.cl.id);
      run('INSERT INTO student_class_history(student_id, from_class_id, to_class_id, moved_by, moved_at) VALUES(?,?,?,?,?)', u.lastInsertRowid, null, p.cl.id, ctx.user.id, now);
      created.push({ full_name: p.name, school_number: p.number, grade: p.g.name, class: p.cl.name, temp_password: p.pw });
    }
    audit(ctx, 'student.import', 'student', null, { created: created.length, skipped: skipped.length });
  });
  return { created, skipped };
});

// ======================= المشاركات والمراجعة =======================
route('GET', '/api/admin/submissions', STAFF, async (ctx) => {
  const q = ctx.query;
  const where = ['s.deleted_at IS NULL']; const params = [];
  if (q.q) {
    const l = like(q.q);
    where.push("(norm(u.full_name) LIKE ? ESCAPE '\\' OR st.school_number LIKE ? ESCAPE '\\' OR norm(s.title) LIKE ? ESCAPE '\\' OR norm(i.name) LIKE ? ESCAPE '\\' OR norm(g.name) LIKE ? ESCAPE '\\' OR norm(cl.name) LIKE ? ESCAPE '\\')");
    params.push(l, l, l, l, l, l);
  }
  if (q.grade_id) { where.push('g.id = ?'); params.push(S.intId(q.grade_id)); }
  if (q.class_id) { where.push('cl.id = ?'); params.push(S.intId(q.class_id)); }
  if (q.item_id) { where.push('i.id = ?'); params.push(S.intId(q.item_id)); }
  if (q.category_id) { where.push('i.category_id = ?'); params.push(S.intId(q.category_id)); }
  if (q.grade_state === 'approved') where.push('s.approved_points IS NOT NULL');
  if (q.grade_state === 'unapproved') where.push('s.approved_points IS NULL');
  if (q.from) { where.push('s.activity_date >= ?'); params.push(S.dateStr(q.from, { label: 'من تاريخ', allowFuture: true })); }
  if (q.to) { where.push('s.activity_date <= ?'); params.push(S.dateStr(q.to, { label: 'إلى تاريخ', allowFuture: true })); }
  const counts = {};
  for (const r of all(`SELECT s.status AS k, COUNT(*) AS n ${S.SUB_FROM} WHERE ${where.join(' AND ')} GROUP BY s.status`, ...params)) counts[r.k] = r.n;
  const w2 = [...where]; const p2 = [...params];
  if (['pending', 'accepted', 'needs_completion'].includes(q.status)) { w2.push('s.status = ?'); p2.push(q.status); }
  const total = get(`SELECT COUNT(*) AS n ${S.SUB_FROM} WHERE ${w2.join(' AND ')}`, ...p2).n;
  const { size, page, offset } = pageParams(q, 25);
  const rows = all(
    `${S.SUB_SELECT} WHERE ${w2.join(' AND ')}
      ORDER BY CASE s.status WHEN 'pending' THEN 0 WHEN 'needs_completion' THEN 1 ELSE 2 END, s.edited_at DESC LIMIT ? OFFSET ?`, ...p2, size, offset
  );
  return { rows: S.hydrate(rows, true), total, page, pages: Math.max(1, Math.ceil(total / size)), counts };
});

function loadSub(id) {
  const row = get(`${S.SUB_SELECT} WHERE s.id = ? AND s.deleted_at IS NULL`, S.intId(id));
  if (!row) throw new HttpError(404, 'لم يتم العثور على المشاركة.');
  return row;
}

route('GET', '/api/admin/submissions/:id', STAFF, async (ctx) => {
  const row = loadSub(ctx.params.id);
  const item = get('SELECT * FROM items WHERE id = ?', row.item_id);
  const history = all("SELECT id, user_name, action, details, created_at FROM audit_log WHERE entity = 'submission' AND entity_id = ? ORDER BY id DESC LIMIT 50", String(row.id))
    .map((h) => ({ ...h, details: detailsOf(h) }));
  const items = all('SELECT i.id, i.name, c.name AS category_name FROM items i JOIN categories c ON c.id = i.category_id WHERE i.active = 1 ORDER BY i.sort');
  return { submission: S.hydrate([row], true)[0], item: S.itemDto(item), history, items };
});

route('POST', '/api/admin/submissions/:id/review', STAFF, async (ctx) => {
  const row = loadSub(ctx.params.id);
  const status = ctx.body.status;
  if (!['pending', 'accepted', 'needs_completion'].includes(status)) throw new HttpError(400, 'حالة المراجعة غير صحيحة.');
  const note = S.text(ctx.body.note, { label: 'الملاحظة', max: 1000 });
  if (status === 'needs_completion' && note.length < 3) throw new HttpError(400, 'اكتبي ملاحظة توضح ما المطلوب استكماله.');
  const visible = status === 'needs_completion' ? 1 : (ctx.body.visible ? 1 : 0);
  const now = nowIso();
  tx(() => {
    run('UPDATE submissions SET status=?, reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=?', status, ctx.user.id, now, now, row.id);
    if (status !== 'accepted' && row.approved_points != null) {
      run('UPDATE submissions SET approved_points=NULL, approved_by=NULL, approved_at=NULL WHERE id=?', row.id);
      audit(ctx, 'grade.revoke_on_status', 'submission', row.id, { previous_points: row.approved_points });
    }
    if (note) run('INSERT INTO admin_notes(submission_id, author_id, body, visible_to_student, created_at) VALUES(?,?,?,?,?)', row.id, ctx.user.id, note, visible, now);
    audit(ctx, 'submission.review', 'submission', row.id, { from: row.status, to: status, note: note || undefined });
  });
  return { submission: S.hydrate([loadSub(row.id)], true)[0] };
});

route('POST', '/api/admin/submissions/:id/notes', STAFF, async (ctx) => {
  const row = loadSub(ctx.params.id);
  const body = S.text(ctx.body.body, { label: 'الملاحظة', min: 2, max: 1000 });
  run('INSERT INTO admin_notes(submission_id, author_id, body, visible_to_student, created_at) VALUES(?,?,?,?,?)', row.id, ctx.user.id, body, ctx.body.visible_to_student ? 1 : 0, nowIso());
  audit(ctx, 'note.add', 'submission', row.id, { visible_to_student: !!ctx.body.visible_to_student });
  return { submission: S.hydrate([loadSub(row.id)], true)[0] };
});

// اعتماد الدرجة: منفصل عن حالة قبول الشاهد، للمتحكم فقط، ولا يتجاوز الدرجة المحددة للبند
route('POST', '/api/admin/submissions/:id/grade', ADMIN, async (ctx) => {
  const row = loadSub(ctx.params.id);
  const now = nowIso();
  if (ctx.body.points === null || ctx.body.points === undefined || ctx.body.points === '') {
    run('UPDATE submissions SET approved_points=NULL, approved_by=NULL, approved_at=NULL, updated_at=? WHERE id=?', now, row.id);
    audit(ctx, 'grade.revoke', 'submission', row.id, { previous_points: row.approved_points });
    return { submission: S.hydrate([loadSub(row.id)], true)[0] };
  }
  if (row.status !== 'accepted') throw new HttpError(400, 'يجب قبول الشاهد أولًا قبل اعتماد الدرجة.');
  const pts = Number(ctx.body.points);
  if (!Number.isInteger(pts) || pts < 0) throw new HttpError(400, 'الدرجة يجب أن تكون عددًا صحيحًا لا يقل عن صفر.');
  if (pts > row.item_points) throw new HttpError(400, `لا يمكن أن تتجاوز الدرجة ${row.item_points} درجات لهذا البند.`);
  let rec = row.committee_recommendation;
  if (row.form_type === 'extra') {
    rec = S.text(ctx.body.committee_recommendation, { label: 'توصية لجنة التوجيه الطلابي', min: 3, max: 1000 });
  }
  run('UPDATE submissions SET approved_points=?, approved_by=?, approved_at=?, committee_recommendation=?, updated_at=? WHERE id=?', pts, ctx.user.id, now, rec, now, row.id);
  audit(ctx, 'grade.approve', 'submission', row.id, { points: pts, previous_points: row.approved_points, committee: rec || undefined });
  return { submission: S.hydrate([loadSub(row.id)], true)[0] };
});

// نقل مشاركة إلى بند آخر (للمتحكم فقط، ويُسجَّل في السجل)
route('POST', '/api/admin/submissions/:id/move', ADMIN, async (ctx) => {
  const row = loadSub(ctx.params.id);
  const item = get('SELECT * FROM items WHERE id = ? AND active = 1', S.intId(ctx.body.item_id, 'البند'));
  if (!item) throw new HttpError(400, 'البند المحدد غير موجود أو موقوف.');
  if (item.id === row.item_id) throw new HttpError(400, 'المشاركة موجودة في هذا البند بالفعل.');
  const now = nowIso();
  tx(() => {
    run("UPDATE submissions SET item_id=?, status='pending', approved_points=NULL, approved_by=NULL, approved_at=NULL, updated_at=? WHERE id=?", item.id, now, row.id);
    audit(ctx, 'submission.move', 'submission', row.id, { from_item: row.item_id, to_item: item.id, previous_points: row.approved_points });
  });
  return { submission: S.hydrate([loadSub(row.id)], true)[0] };
});

// ======================= إدارة البنود =======================
route('GET', '/api/admin/items', STAFF, async () => {
  const cats = all('SELECT * FROM categories ORDER BY sort');
  const items = all('SELECT * FROM items ORDER BY sort');
  const agg = new Map(all(
    `SELECT s.item_id, COUNT(DISTINCT s.id) AS subs, COUNT(f.id) AS files
       FROM submissions s LEFT JOIN evidence_files f ON f.submission_id = s.id AND f.deleted_at IS NULL
      WHERE s.deleted_at IS NULL GROUP BY s.item_id`
  ).map((r) => [r.item_id, r]));
  return {
    categories: cats.map((c) => ({
      id: c.id, name: c.name, color: c.color,
      items: items.filter((i) => i.category_id === c.id).map((i) => ({ ...S.itemDto(i), submissions: (agg.get(i.id) || {}).subs || 0, files: (agg.get(i.id) || {}).files || 0 })),
    })),
  };
});

route('PUT', '/api/admin/items/:id', ADMIN, async (ctx) => {
  const item = get('SELECT * FROM items WHERE id = ?', S.intId(ctx.params.id));
  if (!item) throw new HttpError(404, 'لم يتم العثور على البند.');
  // الدرجات والاسم الرسمي والفئة لا تتغير من الواجهة
  const description = S.text(ctx.body.description, { label: 'وصف البند', min: 3, max: 1500 });
  const instructions = S.text(ctx.body.instructions, { label: 'تعليمات الشواهد', max: 1500 });
  const active = ctx.body.active === false || ctx.body.active === 0 ? 0 : 1;
  run('UPDATE items SET description=?, instructions=?, active=? WHERE id=?', description, instructions, active, item.id);
  audit(ctx, 'item.update', 'item', item.id, { name: item.name, active, changed_description: description !== item.description, changed_instructions: instructions !== item.instructions });
  const used = get('SELECT COUNT(*) AS n FROM submissions WHERE item_id = ? AND deleted_at IS NULL', item.id).n;
  return { item: S.itemDto(get('SELECT * FROM items WHERE id = ?', item.id)), existing_submissions: used };
});

route('POST', '/api/admin/items/:id/reorder', ADMIN, async (ctx) => {
  const item = get('SELECT * FROM items WHERE id = ?', S.intId(ctx.params.id));
  if (!item) throw new HttpError(404, 'لم يتم العثور على البند.');
  const up = ctx.body.direction === 'up';
  const other = up
    ? get('SELECT * FROM items WHERE category_id = ? AND sort < ? ORDER BY sort DESC LIMIT 1', item.category_id, item.sort)
    : get('SELECT * FROM items WHERE category_id = ? AND sort > ? ORDER BY sort ASC LIMIT 1', item.category_id, item.sort);
  if (other) {
    tx(() => {
      run('UPDATE items SET sort = ? WHERE id = ?', other.sort, item.id);
      run('UPDATE items SET sort = ? WHERE id = ?', item.sort, other.id);
      audit(ctx, 'item.reorder', 'item', item.id, { direction: up ? 'up' : 'down' });
    });
  }
  return { ok: true };
});

// ======================= الفصول الدراسية (من الإعدادات) =======================
route('POST', '/api/admin/classes', ADMIN, async (ctx) => {
  const g = get('SELECT * FROM grades WHERE id = ?', S.intId(ctx.body.grade_id, 'المرحلة'));
  if (!g) throw new HttpError(400, 'المرحلة غير موجودة.');
  const name = S.text(ctx.body.name, { label: 'اسم الفصل', min: 2, max: 40 });
  if (get('SELECT id FROM classes WHERE grade_id = ? AND name = ?', g.id, name)) throw new HttpError(400, 'يوجد فصل بهذا الاسم في المرحلة.');
  const sort = (get('SELECT COALESCE(MAX(sort),0) AS m FROM classes WHERE grade_id = ?', g.id).m) + 1;
  const r = run('INSERT INTO classes(grade_id, name, sort) VALUES(?,?,?)', g.id, name, sort);
  audit(ctx, 'class.create', 'class', r.lastInsertRowid, { grade: g.name, name });
  return { id: Number(r.lastInsertRowid) };
});

route('PUT', '/api/admin/classes/:id', ADMIN, async (ctx) => {
  const c = get('SELECT * FROM classes WHERE id = ?', S.intId(ctx.params.id));
  if (!c) throw new HttpError(404, 'لم يتم العثور على الفصل.');
  const name = S.text(ctx.body.name, { label: 'اسم الفصل', min: 2, max: 40 });
  const active = ctx.body.active === false || ctx.body.active === 0 ? 0 : 1;
  if (get('SELECT id FROM classes WHERE grade_id = ? AND name = ? AND id <> ?', c.grade_id, name, c.id)) throw new HttpError(400, 'يوجد فصل بهذا الاسم في المرحلة.');
  if (!active && get('SELECT COUNT(*) AS n FROM students WHERE class_id = ?', c.id).n > 0) throw new HttpError(400, 'لا يمكن إيقاف فصل فيه طالبات. انقلي الطالبات إلى فصل آخر أولًا.');
  run('UPDATE classes SET name=?, active=? WHERE id=?', name, active, c.id);
  audit(ctx, 'class.update', 'class', c.id, { name, active });
  return { ok: true };
});

// ======================= الإعدادات =======================
route('GET', '/api/admin/settings', ADMIN, async () => {
  const s = settings();
  return {
    settings: s,
    types: Object.entries(TYPES).map(([k, v]) => ({ key: k, label: v.label })),
    categories: all('SELECT id, name FROM categories ORDER BY sort'),
  };
});

route('PUT', '/api/admin/settings', { ...ADMIN, jsonLimit: 256 * 1024 }, async (ctx) => {
  const b = ctx.body; const out = {};
  const cur = settings();
  if (b.current_term !== undefined) out.current_term = S.text(b.current_term, { label: 'الفصل الدراسي الحالي', min: 2, max: 60 });
  if (b.allowed_types !== undefined) {
    if (!Array.isArray(b.allowed_types) || !b.allowed_types.length || b.allowed_types.some((t) => !TYPES[t])) throw new HttpError(400, 'اختاري نوعًا واحدًا على الأقل من الأنواع المدعومة.');
    out.allowed_types = [...new Set(b.allowed_types)];
  }
  if (b.max_file_mb !== undefined) {
    const n = Number(b.max_file_mb);
    if (!Number.isInteger(n) || n < 1 || n > 50) throw new HttpError(400, 'الحد الأقصى لحجم الملف يجب أن يكون بين 1 و50 ميجابايت.');
    out.max_file_mb = n;
  }
  if (b.max_files_per_submission !== undefined) {
    const n = Number(b.max_files_per_submission);
    if (!Number.isInteger(n) || n < 1 || n > 20) throw new HttpError(400, 'عدد الملفات لكل مشاركة يجب أن يكون بين 1 و20.');
    out.max_files_per_submission = n;
  }
  if (b.retention_days !== undefined) {
    const n = Number(b.retention_days);
    if (!Number.isInteger(n) || n < 7 || n > 3650) throw new HttpError(400, 'مدة الاحتفاظ يجب أن تكون بين 7 و3650 يومًا.');
    out.retention_days = n;
  }
  if (b.total_rule !== undefined) {
    const capOf = (v, label) => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 10000) throw new HttpError(400, `${label}: قيمة غير صحيحة.`);
      return n;
    };
    const rule = { overall_cap: capOf(b.total_rule.overall_cap, 'الحد الأقصى الإجمالي'), category_caps: {} };
    const catIds = all('SELECT id FROM categories').map((c) => String(c.id));
    for (const [k, v] of Object.entries(b.total_rule.category_caps || {})) {
      if (!catIds.includes(String(k))) continue;
      const n = capOf(v, 'حد الفئة');
      if (n !== null) rule.category_caps[k] = n;
    }
    out.total_rule = rule;
  }
  if (b.self_registration !== undefined) out.self_registration = b.self_registration === true;
  if (b.registration_code !== undefined) {
    const c = String(b.registration_code || '').trim();
    if (c.length > 40) throw new HttpError(400, 'رمز التسجيل طويل (الحد 40 حرفًا).');
    out.registration_code = c;
  }
  if (b.privacy_policy !== undefined) out.privacy_policy = S.text(b.privacy_policy, { label: 'سياسة الخصوصية', min: 20, max: 20000 });
  tx(() => {
    for (const [k, v] of Object.entries(out)) setSetting(k, v);
    audit(ctx, 'settings.update', 'settings', null, Object.fromEntries(Object.keys(out).map((k) => [k, (k === 'privacy_policy' || k === 'registration_code') ? '(تم التعديل)' : { من: cur[k], إلى: out[k] }])));
  });
  return { settings: settings() };
});

// ======================= حسابات الإدارة =======================
route('GET', '/api/admin/accounts', ADMIN, async () => ({
  accounts: all("SELECT id, role, username, full_name, active, last_login_at, created_at FROM users WHERE role IN ('admin','reviewer') ORDER BY role, full_name")
    .map((a) => ({ ...a, active: !!a.active })),
}));

route('POST', '/api/admin/accounts', ADMIN, async (ctx) => {
  const full_name = S.text(ctx.body.full_name, { label: 'الاسم', min: 3, max: 100 });
  const username = S.toLatinDigits(S.text(ctx.body.username, { label: 'اسم المستخدم', min: 4, max: 40 }));
  if (!/^[A-Za-z0-9._@-]+$/.test(username)) throw new HttpError(400, 'اسم المستخدم يتكون من أحرف إنجليزية وأرقام و . _ - @ فقط.');
  const role = ctx.body.role === 'reviewer' ? 'reviewer' : 'admin';
  if (get('SELECT id FROM users WHERE username = ?', username)) throw new HttpError(400, 'اسم المستخدم مستخدم مسبقًا.');
  const pw = tempPassword(12);
  const r = run("INSERT INTO users(role, username, password_hash, full_name, active, must_change_password, created_at) VALUES(?,?,?,?,1,1,?)", role, username, await hashPassword(pw), full_name, nowIso());
  audit(ctx, 'account.create', 'user', r.lastInsertRowid, { username, role });
  return { id: Number(r.lastInsertRowid), username, temp_password: pw };
});

route('PUT', '/api/admin/accounts/:id', ADMIN, async (ctx) => {
  const id = S.intId(ctx.params.id);
  const acc = get("SELECT * FROM users WHERE id = ? AND role IN ('admin','reviewer')", id);
  if (!acc) throw new HttpError(404, 'لم يتم العثور على الحساب.');
  const full_name = S.text(ctx.body.full_name, { label: 'الاسم', min: 3, max: 100 });
  const role = ctx.body.role === 'reviewer' ? 'reviewer' : 'admin';
  const active = ctx.body.active === false || ctx.body.active === 0 ? 0 : 1;
  const remainingAdmins = get("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND active=1 AND id <> ?", id).n;
  if ((role !== 'admin' || !active) && acc.role === 'admin' && acc.active && remainingAdmins === 0) throw new HttpError(400, 'لا يمكن إيقاف أو تخفيض آخر حساب متحكم فعّال.');
  if (id === ctx.user.id && (!active || role !== 'admin')) throw new HttpError(400, 'لا يمكنك إيقاف حسابك أو تخفيض صلاحياتك بنفسك.');
  run('UPDATE users SET full_name=?, role=?, active=? WHERE id=?', full_name, role, active, id);
  if (!active || role !== acc.role) destroyUserSessions(id);
  audit(ctx, 'account.update', 'user', id, { role, active });
  return { ok: true };
});

route('POST', '/api/admin/accounts/:id/reset-password', ADMIN, async (ctx) => {
  const id = S.intId(ctx.params.id);
  const acc = get("SELECT * FROM users WHERE id = ? AND role IN ('admin','reviewer')", id);
  if (!acc) throw new HttpError(404, 'لم يتم العثور على الحساب.');
  const pw = tempPassword(12);
  run('UPDATE users SET password_hash=?, must_change_password=1, failed_logins=0, locked_until=0 WHERE id=?', await hashPassword(pw), id);
  destroyUserSessions(id);
  audit(ctx, 'password.reset', 'user', id);
  return { username: acc.username, temp_password: pw };
});

// ======================= سجل العمليات =======================
route('GET', '/api/admin/audit', ADMIN, async (ctx) => {
  const q = ctx.query; const where = ['1=1']; const params = [];
  if (q.action) { where.push('action LIKE ?'); params.push(`${String(q.action).replace(/[%_]/g, '')}%`); }
  if (q.from) { where.push('created_at >= ?'); params.push(S.dateStr(q.from, { label: 'من', allowFuture: true })); }
  if (q.to) { where.push('created_at < ?'); params.push(S.dateStr(q.to, { label: 'إلى', allowFuture: true }) + 'T99'); }
  const { size, page, offset } = pageParams(q, 50);
  const total = get(`SELECT COUNT(*) AS n FROM audit_log WHERE ${where.join(' AND ')}`, ...params).n;
  const rows = all(`SELECT * FROM audit_log WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`, ...params, size, offset);
  return { rows: rows.map((r) => ({ ...r, details: detailsOf(r) })), total, page, pages: Math.max(1, Math.ceil(total / size)) };
});
