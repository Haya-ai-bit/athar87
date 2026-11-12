'use strict';
const { route } = require('../http');
const { all, settings } = require('../db');
const { itemDto } = require('../services');
const { uploadRules } = require('../files');

// بيانات عامة غير شخصية: الفئات والبنود ودرجاتها وقواعد الرفع وسياسة الخصوصية
route('GET', '/api/public/home', async () => {
  const s = settings();
  const cats = all('SELECT * FROM categories ORDER BY sort');
  const items = all('SELECT * FROM items WHERE active = 1 ORDER BY sort');
  return {
    school_name: s.school_name,
    platform_name: s.platform_name,
    categories: cats.map((c) => ({ id: c.id, name: c.name, color: c.color, items: items.filter((i) => i.category_id === c.id).map(itemDto) })),
    upload_rules: uploadRules(),
  };
});

route('GET', '/api/public/register-info', async () => {
  const s = settings();
  const grades = all('SELECT id, name FROM grades ORDER BY sort');
  const classes = all('SELECT id, grade_id, name FROM classes WHERE active = 1 ORDER BY grade_id, sort');
  return {
    open: s.self_registration !== false,
    code_required: !!String(s.registration_code || '').trim(),
    grades: grades.map((g) => ({ id: g.id, name: g.name, classes: classes.filter((c) => c.grade_id === g.id).map((c) => ({ id: c.id, name: c.name })) })),
  };
});

route('GET', '/api/public/privacy', async () => ({ text: settings().privacy_policy || '' }));
route('GET', '/api/public/upload-rules', async () => uploadRules());
