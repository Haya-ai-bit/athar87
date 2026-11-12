'use strict';
const { get, all, run, nowIso, settings, audit } = require('./db');
const { HttpError } = require('./http');
const { PREVIEWABLE } = require('./files');

// ---------- التحقق من المدخلات ----------
const AR_DIGITS = /[٠-٩]/g;
const toLatinDigits = (s) => String(s).replace(AR_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

function text(v, { label, min = 0, max = 2000, required = false } = {}) {
  const s = v == null ? '' : String(v).replace(/\r\n/g, '\n').trim();
  if (!s) {
    if (required || min > 0) throw new HttpError(400, `حقل «${label}» مطلوب.`);
    return '';
  }
  if (s.length < min) throw new HttpError(400, `حقل «${label}» قصير جدًا (الحد الأدنى ${min} أحرف).`);
  if (s.length > max) throw new HttpError(400, `حقل «${label}» طويل جدًا (الحد الأقصى ${max} حرفًا).`);
  return s;
}

function dateStr(v, { label, required = true, allowFuture = false } = {}) {
  const s = v == null ? '' : toLatinDigits(String(v).trim());
  if (!s) {
    if (required) throw new HttpError(400, `حقل «${label}» مطلوب.`);
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s + 'T00:00:00Z'))) throw new HttpError(400, `تاريخ «${label}» غير صحيح.`);
  if (!allowFuture) {
    const tomorrow = new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 10);
    if (s > tomorrow) throw new HttpError(400, `تاريخ «${label}» لا يمكن أن يكون في المستقبل.`);
  }
  return s;
}

function intId(v, label = 'المعرّف') {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${label} غير صحيح.`);
  return n;
}

const LABELS = {
  standard: { title: 'عنوان المشاركة', description: 'وصف مختصر', date: 'تاريخ المشاركة', benefit: null },
  proposal: { title: 'عنوان المقترح', description: 'وصف الفكرة', date: 'تاريخ تقديم المقترح', benefit: 'الفائدة المتوقعة للمجتمع المدرسي' },
  extra: { title: 'عنوان السلوك المتميز', description: 'وصف السلوك', date: 'تاريخ الممارسة', benefit: 'أثر السلوك أو فائدته' },
  discipline: { title: 'عنوان السجل', description: 'ملاحظات', date: 'التاريخ', benefit: null },
};

function submissionFields(item, f) {
  const L = LABELS[item.form_type] || LABELS.standard;
  const out = {
    title: text(f.title, { label: L.title, min: 3, max: 150 }),
    description: text(f.description, { label: L.description, min: 3, max: 3000 }),
    activity_date: dateStr(f.activity_date, { label: L.date }),
    notes: text(f.notes, { label: 'ملاحظات إضافية', max: 1500 }),
    benefit: '',
  };
  if (L.benefit) out.benefit = text(f.benefit, { label: L.benefit, min: 3, max: 2000 });
  return out;
}

// ---------- تسلسل البيانات ----------
const SUB_FROM = `
    FROM submissions s
    JOIN items i ON i.id = s.item_id
    JOIN categories c ON c.id = i.category_id
    JOIN users u ON u.id = s.student_id
    JOIN students st ON st.user_id = s.student_id
    JOIN classes cl ON cl.id = st.class_id
    JOIN grades g ON g.id = cl.grade_id
    LEFT JOIN users ru ON ru.id = s.reviewed_by
    LEFT JOIN users au ON au.id = s.approved_by`;
const SUB_SELECT = `
  SELECT s.*, i.name AS item_name, i.points AS item_points, i.points_mode, i.category_id, i.icon, i.form_type, i.group_name,
         c.name AS category_name, c.color AS category_color,
         u.full_name AS student_name, st.school_number, st.class_id, cl.name AS class_name, g.id AS grade_id, g.name AS grade_name,
         ru.full_name AS reviewed_by_name, au.full_name AS approved_by_name ${SUB_FROM}`;

const fileDto = (f) => ({
  id: f.id, name: f.original_name, ext: f.ext, mime: f.mime, size: f.size,
  uploaded_at: f.uploaded_at, previewable: PREVIEWABLE.has(f.ext),
});

function hydrate(rows, admin) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const ph = ids.map(() => '?').join(',');
  const files = all(`SELECT * FROM evidence_files WHERE submission_id IN (${ph}) AND deleted_at IS NULL ORDER BY uploaded_at`, ...ids);
  const notes = all(
    `SELECT n.*, u.full_name AS author_name FROM admin_notes n JOIN users u ON u.id = n.author_id
      WHERE n.submission_id IN (${ph}) ${admin ? '' : 'AND n.visible_to_student = 1'} ORDER BY n.id`, ...ids
  );
  const fBy = new Map(); const nBy = new Map();
  files.forEach((f) => { if (!fBy.has(f.submission_id)) fBy.set(f.submission_id, []); fBy.get(f.submission_id).push(fileDto(f)); });
  notes.forEach((n) => { if (!nBy.has(n.submission_id)) nBy.set(n.submission_id, []); nBy.get(n.submission_id).push(n); });
  return rows.map((r) => {
    const d = {
      id: r.id, item_id: r.item_id, item_name: r.item_name, category_id: r.category_id, category_name: r.category_name,
      category_color: r.category_color, icon: r.icon, form_type: r.form_type, group_name: r.group_name,
      title: r.title, description: r.description, activity_date: r.activity_date, notes: r.notes, benefit: r.benefit,
      status: r.status, term: r.term, created_at: r.created_at, updated_at: r.updated_at, edited_at: r.edited_at,
      defined_points: r.item_points, points_mode: r.points_mode,
      grade_approved: r.approved_points != null, approved_points: r.approved_points,
      files: fBy.get(r.id) || [],
      admin_notes: (nBy.get(r.id) || []).map((n) => (admin
        ? { id: n.id, body: n.body, created_at: n.created_at, author_name: n.author_name, visible_to_student: !!n.visible_to_student }
        : { id: n.id, body: n.body, created_at: n.created_at })),
    };
    if (admin) {
      Object.assign(d, {
        student_id: r.student_id, student_name: r.student_name, school_number: r.school_number,
        class_id: r.class_id, class_name: r.class_name, grade_id: r.grade_id, grade_name: r.grade_name,
        committee_recommendation: r.committee_recommendation,
        reviewed_by_name: r.reviewed_by_name, reviewed_at: r.reviewed_at,
        approved_by_name: r.approved_by_name, approved_at: r.approved_at,
      });
    }
    return d;
  });
}

const itemDto = (i) => ({
  id: i.id, category_id: i.category_id, group_name: i.group_name, name: i.name, description: i.description,
  instructions: i.instructions, points: i.points, points_mode: i.points_mode, multiple: !!i.multiple,
  student_submit: !!i.student_submit, form_type: i.form_type, icon: i.icon, active: !!i.active, official: !!i.official, sort: i.sort,
});

// ---------- قواعد احتساب المجموع (تحددها المدرسة؛ لا يوجد حد أقصى افتراضي) ----------
function applyTotalRule(byCat, rule) {
  rule = rule || {};
  let total = 0;
  for (const [cid, sum] of Object.entries(byCat)) {
    const cap = rule.category_caps ? rule.category_caps[cid] : null;
    total += cap !== null && cap !== undefined && cap !== '' ? Math.min(sum, Number(cap)) : sum;
  }
  if (rule.overall_cap !== null && rule.overall_cap !== undefined && rule.overall_cap !== '') total = Math.min(total, Number(rule.overall_cap));
  return total;
}

// Map(studentId -> {raw, total, byCat})
function approvedTotals(studentId) {
  const rule = settings().total_rule;
  const rows = all(
    `SELECT s.student_id, i.category_id, SUM(s.approved_points) AS pts
       FROM submissions s JOIN items i ON i.id = s.item_id
      WHERE s.approved_points IS NOT NULL AND s.deleted_at IS NULL ${studentId ? 'AND s.student_id = ?' : ''}
      GROUP BY s.student_id, i.category_id`, ...(studentId ? [studentId] : [])
  );
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.student_id)) m.set(r.student_id, { raw: 0, byCat: {} });
    const e = m.get(r.student_id);
    e.byCat[r.category_id] = r.pts; e.raw += r.pts;
  }
  for (const e of m.values()) e.total = applyTotalRule(e.byCat, rule);
  return m;
}

// ---------- ملف الطالبة ----------
function studentRow(id) {
  return get(
    `SELECT u.id, u.full_name, u.active, u.created_at, st.school_number, cl.id AS class_id, cl.name AS class_name, g.id AS grade_id, g.name AS grade_name
       FROM students st JOIN users u ON u.id = st.user_id JOIN classes cl ON cl.id = st.class_id JOIN grades g ON g.id = cl.grade_id
      WHERE st.user_id = ?`, id
  );
}

function pointsPending(item, n) {
  return item.points_mode === 'up_to' ? null : n * item.points;
}

function overview(studentId, { admin }) {
  const student = studentRow(studentId);
  if (!student) throw new HttpError(404, 'لم يتم العثور على الطالبة.');
  const aggRows = all(
    `SELECT item_id, COUNT(*) AS n,
            SUM(status='pending') AS pending, SUM(status='accepted') AS accepted, SUM(status='needs_completion') AS needs,
            SUM(approved_points IS NOT NULL) AS approved_n, COALESCE(SUM(approved_points),0) AS approved_pts,
            SUM(approved_points IS NULL AND status <> 'needs_completion') AS awaiting_n, MAX(edited_at) AS last_edit
       FROM submissions WHERE student_id = ? AND deleted_at IS NULL GROUP BY item_id`, studentId
  );
  const fileRows = all(
    `SELECT s.item_id, COUNT(f.id) AS n FROM evidence_files f JOIN submissions s ON s.id = f.submission_id
      WHERE s.student_id = ? AND s.deleted_at IS NULL AND f.deleted_at IS NULL GROUP BY s.item_id`, studentId
  );
  const agg = new Map(aggRows.map((r) => [r.item_id, r]));
  const fcount = new Map(fileRows.map((r) => [r.item_id, r.n]));

  const cats = all('SELECT * FROM categories ORDER BY sort');
  const items = all('SELECT * FROM items ORDER BY sort');
  const categories = cats.map((c) => ({
    id: c.id, name: c.name, color: c.color,
    items: items.filter((i) => i.category_id === c.id && (i.active || agg.has(i.id) || admin)).map((i) => {
      const a = agg.get(i.id) || {};
      return {
        ...itemDto(i),
        counts: {
          submissions: a.n || 0, files: fcount.get(i.id) || 0, pending: a.pending || 0, accepted: a.accepted || 0,
          needs_completion: a.needs || 0, approved_n: a.approved_n || 0, approved_points: a.approved_pts || 0,
          awaiting_n: a.awaiting_n || 0, awaiting_points: pointsPending(i, a.awaiting_n || 0), last_edit: a.last_edit || null,
        },
      };
    }),
  }));

  const tot = get(
    `SELECT COUNT(*) AS subs, SUM(status='pending') AS pending, SUM(status='accepted') AS accepted,
            SUM(status='needs_completion') AS needs, SUM(approved_points IS NOT NULL) AS approved
       FROM submissions WHERE student_id = ? AND deleted_at IS NULL`, studentId
  );
  const files = get(
    `SELECT COUNT(f.id) AS n, SUM(s.status <> 'pending') AS reviewed
       FROM evidence_files f JOIN submissions s ON s.id = f.submission_id
      WHERE s.student_id = ? AND s.deleted_at IS NULL AND f.deleted_at IS NULL`, studentId
  );
  const totals = approvedTotals(studentId).get(studentId) || { raw: 0, total: 0 };

  const recentRows = all(`${SUB_SELECT} WHERE s.student_id = ? AND s.deleted_at IS NULL ORDER BY s.edited_at DESC LIMIT 8`, studentId);
  const attentionRows = all(`${SUB_SELECT} WHERE s.student_id = ? AND s.deleted_at IS NULL AND s.status = 'needs_completion' ORDER BY s.updated_at DESC`, studentId);
  const mini = (rows) => hydrate(rows, admin);

  return {
    student: { id: student.id, full_name: student.full_name, school_number: student.school_number, grade_id: student.grade_id, grade_name: student.grade_name, class_id: student.class_id, class_name: student.class_name, active: !!student.active, created_at: student.created_at },
    stats: {
      submissions: tot.subs || 0, files: files.n || 0, reviewed_files: files.reviewed || 0,
      pending: tot.pending || 0, accepted: tot.accepted || 0, needs_completion: tot.needs || 0, approved: tot.approved || 0,
      approved_total: totals.total, approved_raw: totals.raw,
    },
    categories,
    recent: mini(recentRows),
    attention: mini(attentionRows),
    term: settings().current_term,
  };
}

// ---------- تعديل الطالبة للمحتوى: إعادة المشاركة إلى «قيد المراجعة» وإلغاء الدرجة المعتمدة ----------
function markEdited(ctx, sub) {
  const now = nowIso();
  const reset = sub.status !== 'pending' || sub.approved_points != null;
  if (reset) {
    run(
      `UPDATE submissions SET status='pending', approved_points=NULL, approved_by=NULL, approved_at=NULL, edited_at=?, updated_at=? WHERE id=?`,
      now, now, sub.id
    );
    audit(ctx, 'submission.reset_on_edit', 'submission', sub.id, { previous_status: sub.status, previous_approved_points: sub.approved_points });
  } else {
    run('UPDATE submissions SET edited_at=?, updated_at=? WHERE id=?', now, now, sub.id);
  }
}

module.exports = {
  text, dateStr, intId, toLatinDigits, submissionFields, SUB_SELECT, SUB_FROM, hydrate, itemDto, fileDto,
  applyTotalRule, approvedTotals, studentRow, overview, markEdited, LABELS,
};
