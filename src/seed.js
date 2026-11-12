'use strict';
// البيانات الأولية الرسمية: المراحل والفصول والفئات والبنود ودرجاتها كما وردت في متطلبات المدرسة.
// لا تُحذف هذه البنود ولا تُعدَّل درجاتها من الواجهة.

const GRADES = [
  { name: 'أول ثانوي', classes: 5 },
  { name: 'ثاني ثانوي', classes: 5 },
  { name: 'ثالث ثانوي', classes: 4 },
];
const CLASS_NAMES = ['الفصل الأول', 'الفصل الثاني', 'الفصل الثالث', 'الفصل الرابع', 'الفصل الخامس'];

const CATEGORIES = [
  { key: 'discipline', name: 'الانضباط', color: '#3B4BA8' },
  { key: 'programs', name: 'المشاركات والبرامج', color: '#0E7C72' },
  { key: 'skills', name: 'المهارات والأنشطة المدرسية', color: '#B86E00' },
  { key: 'initiatives', name: 'المبادرات والممارسات الإيجابية', color: '#B93A58' },
  { key: 'extra', name: 'السلوك المتميز الإضافي', color: '#7A3FB5' },
];

// points_mode: fixed = درجة ثابتة، per_submission = لكل مشاركة، up_to = حتى حد أقصى تقرره المدرسة
const ITEMS = [
  {
    cat: 'discipline', name: 'انضباط الطالبة وعدم غيابها دون عذر خلال الفصل الدراسي',
    description: 'يُوثَّق الانضباط وفق السجلات المعتمدة من المدرسة خلال الفصل الدراسي المعني. لا تُمنح الدرجة برفع ملف، وتعتمدها الإدارة وفق الإجراءات المحددة.',
    instructions: 'إن لزم شاهد أو مستند فتحدده الإدارة وفق ضوابط المدرسة.',
    points: 6, mode: 'fixed', multiple: 0, student_submit: 0, form: 'discipline', icon: 'calendar',
  },
  {
    cat: 'programs', name: 'المشاركة في الخدمة المجتمعية خارج المدرسة',
    description: 'سجّلي كل مشاركة بشكل مستقل وأرفقي ما يثبتها من مستندات أو شهادات أو ملفات مناسبة.',
    points: 6, mode: 'per_submission', multiple: 1, student_submit: 1, form: 'standard', icon: 'heart',
  },
  {
    cat: 'programs', name: 'تقديم فعالية حوارية',
    description: 'أرفقي الشواهد المناسبة التي توضح مشاركتك أو تقديمك للفعالية الحوارية.',
    points: 6, mode: 'per_submission', multiple: 1, student_submit: 1, form: 'standard', icon: 'mic',
  },
  {
    cat: 'programs', name: 'المشاركة في حملة توعوية',
    description: 'اذكري تفاصيل الحملة وتاريخها، وأرفقي الشواهد المتعلقة بها.',
    points: 6, mode: 'per_submission', multiple: 1, student_submit: 1, form: 'standard', icon: 'megaphone',
  },
  {
    cat: 'programs', name: 'عرض تجارب شخصية ناجحة',
    description: 'وثّقي التجربة وأرفقي ملفًا أو عرضًا أو مستندًا داعمًا.',
    points: 6, mode: 'per_submission', multiple: 1, student_submit: 1, form: 'standard', icon: 'star',
  },
  {
    cat: 'programs', name: 'الالتحاق ببرنامج أو دورة',
    description: 'أرفقي شهادة إتمام أو إثبات التحاق أو أي مستند معتمد تقبله المدرسة.',
    points: 6, mode: 'per_submission', multiple: 1, student_submit: 1, form: 'standard', icon: 'book',
  },
  {
    cat: 'skills', group: 'المشاركة في مجالات الأنشطة المدرسية', name: 'مهارات الاتصال',
    description: 'أمثلة: العمل الجماعي، التعلم بالأقران، التواصل الفعّال، المشاركة في الأنشطة التي تنمي مهارات الاتصال.',
    points: 4, mode: 'per_submission', multiple: 1, student_submit: 1, form: 'standard', icon: 'users',
  },
  {
    cat: 'skills', group: 'المشاركة في مجالات الأنشطة المدرسية', name: 'مهارات القيادة والمسؤولية',
    description: 'أمثلة: التخطيط، التحفيز، تحمل المسؤولية، تنظيم العمل، قيادة المبادرات، المشاركة في تنظيم الأنشطة. وثّقي كل مشاركة بصورة مستقلة.',
    points: 4, mode: 'per_submission', multiple: 1, student_submit: 1, form: 'standard', icon: 'crown',
  },
  {
    cat: 'skills', group: 'المشاركة في مجالات الأنشطة المدرسية', name: 'المهارات الرقمية',
    description: 'أمثلة: إعداد العروض التقديمية، تصميم المحتوى الإلكتروني، إنتاج المواد التعليمية الرقمية، إعداد التصاميم الرقمية، المشاركة في المشروعات التقنية.',
    points: 4, mode: 'per_submission', multiple: 1, student_submit: 1, form: 'standard', icon: 'laptop',
  },
  {
    cat: 'skills', group: 'المشاركة في مجالات الأنشطة المدرسية', name: 'مهارة إدارة الوقت',
    description: 'أمثلة: تنظيم الوقت، التخطيط للمهام، الالتزام بالمواعيد، إدارة الوقت أثناء تنفيذ الأنشطة، تنظيم المهام والمسؤوليات.',
    points: 4, mode: 'per_submission', multiple: 1, student_submit: 1, form: 'standard', icon: 'clock',
  },
  {
    cat: 'initiatives', name: 'كتابة رسالة شكر',
    description: 'أمثلة: رسالة شكر للوطن، للقيادة الرشيدة، للأسرة، للمعلمة، أو أي رسائل شكر أخرى معتمدة من المدرسة. أرفقي الرسالة بصيغة PDF أو صورة أو مستند معتمد.',
    points: 2, mode: 'per_submission', multiple: 1, student_submit: 1, form: 'standard', icon: 'mail',
  },
  {
    cat: 'initiatives', name: 'المشاركة في الإذاعة المدرسية',
    description: 'وثّقي مشاركتك في الإذاعة المدرسية وأرفقي الشواهد المناسبة.',
    points: 2, mode: 'per_submission', multiple: 1, student_submit: 1, form: 'standard', icon: 'radio',
  },
  {
    cat: 'initiatives', name: 'تقديم مقترح لصالح المجتمع المدرسي',
    description: 'اكتبي عنوان المقترح ووصف الفكرة والفائدة المتوقعة للمجتمع المدرسي وتاريخ تقديمه، وأرفقي الشواهد إن وجدت.',
    points: 2, mode: 'per_submission', multiple: 1, student_submit: 1, form: 'proposal', icon: 'bulb',
  },
  {
    cat: 'initiatives', name: 'التعاون مع الزميلات والمعلمات وإدارة المدرسة',
    description: 'وثّقي الممارسات والمشاركات التعاونية وفق الضوابط التي تعتمدها المدرسة.',
    points: 2, mode: 'per_submission', multiple: 1, student_submit: 1, form: 'standard', icon: 'link',
  },
  {
    cat: 'extra', name: 'سلوك متميز إضافي',
    description: 'إذا اكتسبت الطالبة سلوكًا متميزًا غير وارد ضمن موضوعات أو ممارسات السلوك المتميز المقترحة، فتقرر المدرسة الدرجة المناسبة لهذا السلوك بناءً على توصية لجنة التوجيه الطلابي في المدرسة، بما لا يتجاوز 6 درجات.',
    points: 6, mode: 'up_to', multiple: 1, student_submit: 1, form: 'extra', icon: 'sparkle',
  },
];

const DEFAULT_PRIVACY = `## الجهة المسؤولة
منصة «أَثَر 87» تابعة للمدرسة الثانوية 87، وتُستخدم لتنظيم وتوثيق السلوك المتميز لدى الطالبات ومراجعة شواهدهن واعتماد الدرجات وفق إجراءات المدرسة.

## البيانات التي تُجمع
- بيانات الحساب: اسم الطالبة، اسم المستخدم، المرحلة والفصل، وحالة الحساب.
- بيانات المشاركات: العناوين والأوصاف والتواريخ والملاحظات التي تكتبها الطالبة.
- الملفات التي ترفعها الطالبة كشواهد (صور، مستندات، عروض).
- سجلات تقنية محدودة: أوقات الدخول وعمليات المراجعة والاعتماد لأغراض الأمان والمساءلة.

## الغرض من الاستخدام
تُستخدم البيانات حصرًا لتوثيق السلوك المتميز ومراجعته واعتماد درجاته داخل المدرسة، ولا تُستخدم لأي غرض تجاري ولا تُنشر في الصفحات العامة.

## من يمكنه الاطلاع على البيانات
- الطالبة: على ملفها وشواهدها فقط.
- المتحكم والمراجعات المخوّلات في إدارة المدرسة: على ملفات الطالبات اللازمة للمراجعة والاعتماد.
- لا تُشارك بيانات الطالبات مع جهات خارجية إلا بتعليمات رسمية من الجهات المختصة.

## حماية البيانات
تُحفظ الملفات في مخزن خاص غير متاح للعامة، ولا يُسمح بتنزيلها إلا بعد التحقق من صلاحية المستخدم على الخادم. تُحمى الحسابات بكلمات مرور مشفّرة، وتُسجَّل العمليات الإدارية المهمة، وتُنسخ البيانات احتياطيًا دوريًا.

## الاحتفاظ والحذف
تُحفظ الشواهد طوال مدة استخدامها في التقييم. عند حذف شاهد تُخفى الملفات فورًا ثم تُزال نهائيًا بعد مدة الاحتفاظ المحددة في إعدادات المنصة. يمكن للإدارة حذف بيانات طالبة عند الحاجة وفق الأنظمة المعمول بها.

## حقوق الطالبة وولي الأمر
يحق للطالبة وولي أمرها الاطلاع على البيانات المسجلة، وطلب تصحيحها أو حذفها، وذلك بالتواصل مع وكيلة شؤون الطلاب.

## التواصل
لأي استفسار حول الخصوصية تواصلي مع وكيلة شؤون الطلاب أو مديرة المدرسة.`;

function seed(db, helpers) {
  const { get, run, tx } = helpers;
  const now = new Date().toISOString();
  tx(() => {
    if (!get('SELECT id FROM grades LIMIT 1')) {
      GRADES.forEach((g, gi) => {
        const r = run('INSERT INTO grades(name, sort) VALUES(?,?)', g.name, gi + 1);
        for (let i = 0; i < g.classes; i++) {
          run('INSERT INTO classes(grade_id, name, sort) VALUES(?,?,?)', r.lastInsertRowid, CLASS_NAMES[i], i + 1);
        }
      });
    }
    if (!get('SELECT id FROM categories LIMIT 1')) {
      const catIds = {};
      CATEGORIES.forEach((c, i) => {
        catIds[c.key] = run('INSERT INTO categories(name, color, sort) VALUES(?,?,?)', c.name, c.color, i + 1).lastInsertRowid;
      });
      ITEMS.forEach((it, i) => {
        run(
          `INSERT INTO items(category_id, group_name, name, description, instructions, points, points_mode, multiple, student_submit, form_type, icon, official, active, sort)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,1,1,?)`,
          catIds[it.cat], it.group || null, it.name, it.description, it.instructions || '',
          it.points, it.mode, it.multiple, it.student_submit, it.form, it.icon, i + 1
        );
      });
    }
    const defaults = {
      school_name: 'المدرسة الثانوية 87',
      platform_name: 'أَثَر 87',
      current_term: 'الفصل الدراسي الأول',
      allowed_types: ['jpg', 'png', 'pdf', 'docx', 'pptx'],
      max_file_mb: 10,
      max_files_per_submission: 5,
      retention_days: 90,
      self_registration: true,
      registration_code: '',
      // قواعد احتساب المجموع النهائي: لا يوجد حد أقصى إلا إذا أدخلته الإدارة بعد اعتماده رسميًا
      total_rule: { overall_cap: null, category_caps: {} },
      privacy_policy: DEFAULT_PRIVACY,
    };
    for (const [k, v] of Object.entries(defaults)) {
      run('INSERT OR IGNORE INTO settings(key, value) VALUES(?,?)', k, JSON.stringify(v));
    }
  });
  return now;
}

module.exports = { seed, GRADES, CATEGORIES, ITEMS };
