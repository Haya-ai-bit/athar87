'use strict';
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');

class Client {
  constructor(base) { this.base = base; this.cookie = ''; }
  async req(method, url, { json, form, headers = {}, csrf = true } = {}) {
    const h = { ...headers };
    if (csrf) h['X-Requested-With'] = 'athar';
    if (this.cookie) h.Cookie = this.cookie;
    let body;
    if (json !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (form) body = form;
    const res = await fetch(this.base + url, { method, headers: h, body, redirect: 'manual' });
    const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of sc) {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      if (/Max-Age=0/i.test(c) || v === '') this.cookie = ''; else this.cookie = `${k}=${v}`;
    }
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  }
  get(u, o) { return this.req('GET', u, o); }
  post(u, json, o) { return this.req('POST', u, { json, ...o }); }
  put(u, json, o) { return this.req('PUT', u, { json, ...o }); }
  del(u, o) { return this.req('DELETE', u, o); }
}

async function startServer(port, dataDir) {
  const env = { ...process.env, DATA_DIR: dataDir, PORT: String(port), SCRYPT_N: '1024', HOST: '127.0.0.1' };
  const proc = spawn(process.execPath, ['--no-warnings', path.join(ROOT, 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server start timeout')), 10000);
    proc.stdout.on('data', (d) => { if (String(d).includes('يعمل على')) { clearTimeout(t); resolve(); } });
    proc.stderr.on('data', (d) => process.stderr.write(d));
    proc.on('exit', (c) => reject(new Error('server exited ' + c)));
  });
  return { proc, base: `http://127.0.0.1:${port}`, stop: () => new Promise((r) => { proc.removeAllListeners('exit'); proc.once('exit', r); proc.kill('SIGTERM'); }) };
}

function createAdmin(dataDir, username, password, name = 'مديرة اختبار') {
  const r = spawnSync(process.execPath, ['--no-warnings', path.join(ROOT, 'scripts', 'create-admin.js')], {
    env: { ...process.env, DATA_DIR: dataDir, SCRYPT_N: '1024', ADMIN_USERNAME: username, ADMIN_PASSWORD: password, ADMIN_FULL_NAME: name },
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error('create-admin failed: ' + r.stderr + r.stdout);
}

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'athar-'));

// ملفات اختبار
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(20), Buffer.from('word/document.xml'), Buffer.alloc(40)]);
const PPTX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(20), Buffer.from('ppt/presentation.xml'), Buffer.alloc(40)]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100, 7)]);

function multipart(fields, files = []) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const f of files) fd.append('files', new Blob([f.data], { type: f.type || 'application/octet-stream' }), f.name);
  return fd;
}

module.exports = { Client, startServer, createAdmin, tmpDir, PNG, PDF, DOCX, PPTX, EXE, multipart, ROOT };
