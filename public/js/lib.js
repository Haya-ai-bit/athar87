// أدوات مشتركة: بناء DOM آمن (لا innerHTML للبيانات)، الاتصال بالخادم، الأيقونات، الإشعارات، النوافذ
export const state = { user: null, rules: null };

// ---------- DOM ----------
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (['value', 'checked', 'disabled', 'selected', 'hidden', 'required', 'multiple'].includes(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

// ---------- الأيقونات (SVG ثابتة موثوقة) ----------
const P = {
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  calendar: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z M3 10h18 M8 3v4 M16 3v4',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  mic: 'M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z M5 11a7 7 0 0 0 14 0 M12 18v3',
  megaphone: 'M4 10v4h3l7 4V6L7 10z M18 9a4 4 0 0 1 0 6',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z M4 19V5 M8 7h7',
  users: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20a6 6 0 0 1 12 0 M17 11a2.5 2.5 0 1 0 0-5 M16 14.5a5 5 0 0 1 5 5.5',
  crown: 'M4 8l4 4 4-6 4 6 4-4-1.5 10h-13z',
  laptop: 'M5 6h14v9H5z M3 19h18',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
  mail: 'M4 6h16v12H4z M4 7l8 6 8-6',
  radio: 'M4 9h16v10H4z M8 9l8-5 M8 14h.01 M12 14h6',
  bulb: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  file: 'M7 3h7l5 5v13H7z M14 3v5h5',
  image: 'M4 5h16v14H4z M8 10h.01 M4 17l5-5 4 4 3-3 4 4',
  check: 'M5 12l4.5 4.5L19 7',
  alert: 'M12 4l9 16H3z M12 10v4 M12 17h.01',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  download: 'M12 4v11 M7 11l5 5 5-5 M5 20h14',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16z M14 6l4 4',
  plus: 'M12 5v14 M5 12h14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
  logout: 'M10 4H5v16h5 M15 8l4 4-4 4 M19 12H9',
  home: 'M3 11l9-7 9 7 M5 10v10h14V10',
  settings: 'M4 7h10 M18 7h2 M4 17h2 M10 17h10 M16 5v4 M8 15v4',
  chart: 'M4 20V4 M4 20h16 M8 16v-5 M12 16V8 M16 16v-3',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
  upload: 'M12 16V5 M7 9l5-5 5 5 M5 20h14',
  left: 'M15 6l-6 6 6 6',
  down: 'M6 9l6 6 6-6',
  menu: 'M4 7h16 M4 12h16 M4 17h16',
  x: 'M6 6l12 12 M18 6L6 18',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  print: 'M7 9V4h10v5 M7 17H4v-7h16v7h-3 M7 14h10v6H7z',
  swap: 'M7 7h13 M16 3l4 4-4 4 M17 17H4 M8 13l-4 4 4 4',
  key: 'M14 10a4 4 0 1 0-3.9 4L11 15v2h2v2h2v-3l3-3z',
  up: 'M6 15l6-6 6 6',
  list: 'M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
};
export function icon(name, size = 20) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.8');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', P[name] || P.folder);
  s.append(p);
  const w = document.createElement('span'); w.className = 'icon'; w.append(s);
  return w;
}

// ---------- الاتصال بالخادم ----------
export class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
export async function api(path, { method = 'GET', body, form, onProgress } = {}) {
  if (form && onProgress) return xhr(path, method, form, onProgress);
  const opts = { method, headers: { 'X-Requested-With': 'athar' }, credentials: 'same-origin' };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  if (form) opts.body = form;
  let res;
  try { res = await fetch(path, opts); } catch { throw new ApiError(0, 'تعذّر الاتصال بالخادم. تحققي من اتصالك بالإنترنت ثم حاولي مرة أخرى.', 'OFFLINE'); }
  return handle(res.status, await res.json().catch(() => ({})));
}
function handle(status, data) {
  if (status >= 200 && status < 300) return data;
  if (status === 401 && state.user) { state.user = null; location.hash = '#/'; }
  if (data.code === 'MUST_CHANGE_PASSWORD') location.hash = '#/change-password';
  throw new ApiError(status, data.error || 'حدث خطأ غير متوقع.', data.code);
}
function xhr(path, method, form, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open(method, path);
    x.setRequestHeader('X-Requested-With', 'athar');
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    x.onerror = () => reject(new ApiError(0, 'انقطع الاتصال أثناء الرفع. حاولي مرة أخرى.', 'OFFLINE'));
    x.onload = () => {
      let data = {};
      try { data = JSON.parse(x.responseText); } catch { /* ignore */ }
      try { resolve(handle(x.status, data)); } catch (e) { reject(e); }
    };
    x.send(form);
  });
}
export const q = (obj) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== '' && v != null) p.set(k, v);
  const s = p.toString();
  return s ? '?' + s : '';
};

// ---------- التنسيق ----------
const fmtDate = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtTime = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const date = (v) => { if (!v) return '—'; const d = new Date(v.length === 10 ? v + 'T12:00:00' : v); return Number.isNaN(+d) ? '—' : fmtDate.format(d); };
export const dateTime = (v) => { if (!v) return '—'; const d = new Date(v); return Number.isNaN(+d) ? '—' : fmtTime.format(d); };
export const size = (b) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} ك.ب` : `${(b / 1048576).toFixed(1)} م.ب`);
export const STATUS = { pending: 'قيد المراجعة', accepted: 'مقبول', needs_completion: 'يحتاج إلى استكمال' };
export function pts(n) {
  if (n === 2) return 'درجتان';
  if (n === 1) return 'درجة واحدة';
  return `${n} ${n >= 3 && n <= 10 ? 'درجات' : 'درجة'}`;
}
export function pointsText(i) {
  if (i.points_mode === 'per_submission') return `${pts(i.points)} لكل مشاركة`;
  if (i.points_mode === 'up_to') return `حتى ${pts(i.points)} وفق قرار المدرسة`;
  return pts(i.points);
}
export const statusChip = (s) => h('span', { class: `chip chip-${s}` }, icon(s === 'accepted' ? 'check' : s === 'needs_completion' ? 'alert' : 'clock', 14), STATUS[s]);

// ---------- إشعارات ونوافذ ----------
let toastBox;
export function toast(msg, kind = 'ok') {
  if (!toastBox) { toastBox = h('div', { class: 'toasts', 'aria-live': 'polite' }); document.body.append(toastBox); }
  const t = h('div', { class: `toast toast-${kind}`, role: kind === 'error' ? 'alert' : 'status' }, msg);
  toastBox.append(t);
  setTimeout(() => t.remove(), kind === 'error' ? 7000 : 4500);
}

export function modal(title, build, { wide = false } = {}) {
  const dlg = h('dialog', { class: `modal${wide ? ' modal-wide' : ''}`, 'aria-label': title });
  const close = () => { dlg.close(); dlg.remove(); };
  const body = h('div', { class: 'modal-body' });
  dlg.append(h('div', { class: 'modal-head' }, h('h2', null, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'إغلاق', onclick: close }, icon('x'))), body);
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  document.body.append(dlg);
  build(body, close);
  dlg.showModal();
  return close;
}

export function confirmDialog(title, message, okLabel = 'تأكيد', danger = false) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const close = modal(title, (body, c) => {
      body.append(h('p', null, message), h('div', { class: 'actions' },
        h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'button', onclick: () => { finish(true); c(); } }, okLabel),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { finish(false); c(); } }, 'إلغاء')));
    });
    document.querySelector('dialog.modal:last-of-type')?.addEventListener('close', () => finish(false));
    return close;
  });
}

export function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint ? h('span', { class: 'hint' }, hint) : null);
}
export const errBox = () => h('div', { class: 'form-error', role: 'alert', hidden: true });
export function showErr(box, e) { box.textContent = e.message || String(e); box.hidden = false; }

export function pager(data, go) {
  if (!data || data.pages <= 1) return null;
  return h('div', { class: 'pager' },
    h('button', { class: 'btn btn-ghost btn-sm', disabled: data.page <= 1, onclick: () => go(data.page - 1) }, 'السابق'),
    h('span', null, `صفحة ${data.page} من ${data.pages} — ${data.total} نتيجة`),
    h('button', { class: 'btn btn-ghost btn-sm', disabled: data.page >= data.pages, onclick: () => go(data.page + 1) }, 'التالي'));
}

export function loading() { return h('div', { class: 'loading', role: 'status' }, h('span', { class: 'spinner' }), 'جارٍ التحميل…'); }
export function empty(msg, ic = 'folder') { return h('div', { class: 'empty' }, icon(ic, 36), h('p', null, msg)); }

export function downloadText(filename, text) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click(); a.remove();
}
