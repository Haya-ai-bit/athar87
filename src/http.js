'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ---------- مسارات API ----------
const routes = [];
function route(method, pattern, opts, handler) {
  if (typeof opts === 'function') { handler = opts; opts = {}; }
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, re, keys, opts, handler });
}

// ---------- محدِّد معدل الطلبات (في الذاكرة) ----------
function limiter({ windowMs, max }) {
  const hits = new Map();
  return (key, count = true) => {
    const now = Date.now();
    if (hits.size > 10000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    let e = hits.get(key);
    if (!e || e.reset < now) { e = { n: 0, reset: now + windowMs }; hits.set(key, e); }
    if (count) e.n++;
    return e.n <= max ? 0 : Math.ceil((e.reset - now) / 1000);
  };
}

function clientIp(req) {
  if (cfg.TRUST_PROXY) {
    const xf = req.headers['x-forwarded-for'];
    if (xf) return String(xf).split(',')[0].trim();
  }
  return req.socket.remoteAddress || '';
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// ---------- قراءة الجسم ----------
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > limit) { reject(new HttpError(413, 'حجم الطلب أكبر من الحد المسموح به.', 'TOO_LARGE')); req.resume(); return; }
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'حجم الطلب أكبر من الحد المسموح به.', 'TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseMultipart(buf, boundary) {
  const delim = Buffer.from('--' + boundary);
  const sep = Buffer.from('\r\n--' + boundary);
  const fields = {};
  const files = [];
  let pos = buf.indexOf(delim);
  if (pos < 0) throw new HttpError(400, 'تنسيق الطلب غير صحيح.');
  let parts = 0;
  for (;;) {
    pos += delim.length;
    if (buf[pos] === 0x2d && buf[pos + 1] === 0x2d) break;
    if (buf[pos] !== 0x0d || buf[pos + 1] !== 0x0a) throw new HttpError(400, 'تنسيق الطلب غير صحيح.');
    pos += 2;
    const hEnd = buf.indexOf('\r\n\r\n', pos);
    if (hEnd < 0) throw new HttpError(400, 'تنسيق الطلب غير صحيح.');
    const headers = buf.subarray(pos, hEnd).toString('utf8');
    const start = hEnd + 4;
    const next = buf.indexOf(sep, start);
    if (next < 0) throw new HttpError(400, 'تنسيق الطلب غير صحيح.');
    const data = buf.subarray(start, next);
    if (++parts > 60) throw new HttpError(400, 'عدد أجزاء الطلب كبير جدًا.');
    const cd = /content-disposition:[^\r\n]*/i.exec(headers);
    const nm = cd && /[; ]name="((?:[^"\\]|\\.)*)"/i.exec(cd[0]);
    const fn = cd && /filename="((?:[^"\\]|\\.)*)"/i.exec(cd[0]);
    const ct = /content-type:\s*([^\r\n]+)/i.exec(headers);
    if (nm) {
      const name = nm[1];
      if (fn !== null && fn !== undefined && fn) {
        if (fn[1] !== '' || data.length) files.push({ field: name, filename: fn[1].replace(/%22/g, '"'), contentType: ct ? ct[1].trim() : '', data });
      } else {
        if (data.length > 30000) throw new HttpError(400, 'أحد الحقول طويل جدًا.');
        fields[name] = data.toString('utf8');
      }
    }
    pos = next + 2;
  }
  return { fields, files };
}

// ---------- ترويسات الأمان ----------
function securityHeaders(res) {
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (cfg.PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

// ---------- الملفات الثابتة ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/font', '.ttf': 'font/ttf', '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { rel = '/'; }
  if (rel.includes('\0')) rel = '/__bad__';
  if (rel.endsWith('/')) rel += 'index.html';
  const abs = path.resolve(cfg.PUBLIC_DIR, '.' + rel);
  const insidePublic = abs === cfg.PUBLIC_DIR || abs.startsWith(cfg.PUBLIC_DIR + path.sep);
  let st;
  try { st = insidePublic ? fs.statSync(abs) : null; } catch { st = null; }
  if (!st || !st.isFile()) {
    const nf = path.join(cfg.PUBLIC_DIR, '404.html');
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'HEAD') return res.end();
    return fs.existsSync(nf) ? fs.createReadStream(nf).pipe(res) : res.end('الصفحة غير موجودة');
  }
  const ext = path.extname(abs).toLowerCase();
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('Content-Length', st.size);
  res.setHeader('Cache-Control', ['.woff2', '.png', '.jpg', '.svg'].includes(ext) ? 'public, max-age=86400' : 'no-cache');
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(abs).pipe(res);
}

// ---------- معالجة الطلب ----------
function makeCtx(req, res, url) {
  const ctx = {
    req, res, url,
    query: Object.fromEntries(url.searchParams),
    params: {}, body: {}, fields: {}, files: [],
    user: null, ip: clientIp(req), responded: false,
    json(status, obj) {
      if (ctx.responded) return;
      ctx.responded = true;
      const data = Buffer.from(JSON.stringify(obj));
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Length', data.length);
      res.end(data);
    },
    cookie(name, value, opts = {}) {
      const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
      if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
      if (cfg.PROD) parts.push('Secure');
      const prev = res.getHeader('Set-Cookie');
      res.setHeader('Set-Cookie', prev ? [].concat(prev, parts.join('; ')) : parts.join('; '));
    },
    // بث ملف خاص (بعد التحقق من الصلاحية) مع ترويسات آمنة
    sendFile(absPath, { mime, disposition, filename, csp }) {
      ctx.responded = true;
      const st = fs.statSync(absPath);
      res.statusCode = 200;
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Length', st.size);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (csp) res.setHeader('Content-Security-Policy', csp); else res.removeHeader('Content-Security-Policy');
      const safe = encodeURIComponent(filename).replace(/['()]/g, escape).replace(/\*/g, '%2A');
      res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${safe}`);
      fs.createReadStream(absPath).pipe(res);
    },
    sendBuffer(buf, { mime, filename }) {
      ctx.responded = true;
      res.statusCode = 200;
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Length', buf.length);
      res.setHeader('Cache-Control', 'private, no-store');
      const safe = encodeURIComponent(filename).replace(/['()]/g, escape).replace(/\*/g, '%2A');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safe}`);
      res.end(buf);
    },
  };
  return ctx;
}

// يتم ضبط هذه الدالة من server.js (تحميل المستخدم من الجلسة)
let loadUser = () => null;
function setUserLoader(fn) { loadUser = fn; }

async function handleApi(req, res, url) {
  const ctx = makeCtx(req, res, url);
  try {
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    let matched = null;
    let pathMatched = false;
    for (const r of routes) {
      const m = r.re.exec(url.pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      matched = r;
      r.keys.forEach((k, i) => { ctx.params[k] = decodeURIComponent(m[i + 1]); });
      break;
    }
    if (!matched) throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'طريقة الطلب غير مسموحة.' : 'المسار غير موجود.');

    // حماية CSRF: الطلبات المغيّرة للبيانات تتطلب ترويسة مخصصة + نفس الأصل
    if (method !== 'GET') {
      if (req.headers['x-requested-with'] !== 'athar') throw new HttpError(403, 'طلب غير مصرح به.', 'CSRF');
      const origin = req.headers.origin;
      if (origin) {
        let ok = false;
        try { ok = new URL(origin).host === req.headers.host; } catch { ok = false; }
        if (!ok) throw new HttpError(403, 'طلب غير مصرح به.', 'CSRF');
      }
    }

    ctx.user = loadUser(req, ctx);
    const { roles, allowMustChange, multipart } = matched.opts;
    if (roles) {
      if (!ctx.user) throw new HttpError(401, 'يجب تسجيل الدخول للمتابعة.', 'UNAUTH');
      if (!roles.includes(ctx.user.role)) throw new HttpError(403, 'ليست لديك صلاحية للوصول إلى هذه الصفحة.', 'FORBIDDEN');
      if (ctx.user.must_change_password && !allowMustChange) {
        throw new HttpError(403, 'يجب تغيير كلمة المرور المؤقتة أولًا.', 'MUST_CHANGE_PASSWORD');
      }
    }

    // قراءة الجسم بعد التحقق من الصلاحية (حتى لا تُقبل رفوعات كبيرة من غير المصرح لهم)
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      const ct = String(req.headers['content-type'] || '');
      if (multipart && /^multipart\/form-data/i.test(ct)) {
        const bm = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ct);
        if (!bm) throw new HttpError(400, 'تنسيق الطلب غير صحيح.');
        const limit = typeof multipart === 'function' ? multipart(ctx) : multipart;
        const buf = await readBody(req, limit);
        const parsed = parseMultipart(buf, bm[1] || bm[2]);
        ctx.fields = parsed.fields;
        ctx.files = parsed.files;
      } else if (/^application\/json/i.test(ct)) {
        const buf = await readBody(req, matched.opts.jsonLimit || 1024 * 1024);
        try { ctx.body = buf.length ? JSON.parse(buf.toString('utf8')) : {}; } catch { throw new HttpError(400, 'تنسيق البيانات غير صحيح.'); }
        if (ctx.body === null || typeof ctx.body !== 'object') ctx.body = {};
      } else {
        await readBody(req, 1024);
      }
    }

    const result = await matched.handler(ctx);
    if (!ctx.responded) ctx.json(200, result === undefined ? { ok: true } : result);
  } catch (e) {
    if (ctx.responded) return;
    if (e instanceof HttpError) {
      ctx.json(e.status, { error: e.message, code: e.code });
    } else {
      console.error('[خطأ داخلي]', req.method, url.pathname, e);
      ctx.json(500, { error: 'حدث خطأ غير متوقع. حاولي مرة أخرى، وإن استمرت المشكلة فتواصلي مع الإدارة.' });
    }
  }
}

function createServer() {
  return http.createServer((req, res) => {
    securityHeaders(res);
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { res.statusCode = 400; return res.end(); }
    if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; return res.end(); }
    return serveStatic(req, res, url.pathname);
  });
}

module.exports = { HttpError, route, limiter, createServer, parseCookies, setUserLoader, clientIp };
