'use strict';
const crypto = require('crypto');
const { promisify } = require('util');
const cfg = require('./config');
const scrypt = promisify(crypto.scrypt);

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = (n = 32) => crypto.randomBytes(n).toString('base64url');

async function hashPassword(password) {
  const N = cfg.SCRYPT_N;
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 32, { N, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  return `scrypt$${N}$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  try {
    const [alg, N, r, p, saltB64, keyB64] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');
    const key = await scrypt(password, salt, expected.length, {
      N: Number(N), r: Number(r), p: Number(p), maxmem: 256 * 1024 * 1024,
    });
    return crypto.timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

let dummy;
async function dummyVerify(password) {
  dummy = dummy || (await hashPassword('dummy-password-for-timing'));
  await verifyPassword(password, dummy);
  return false;
}

// كلمة مرور مؤقتة مقروءة (بدون أحرف متشابهة) تحتوي أحرفًا وأرقامًا
function tempPassword(len = 10) {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = letters + digits;
  const pick = (set) => set[crypto.randomInt(set.length)];
  const chars = [pick(letters), pick(digits)];
  while (chars.length < len) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

module.exports = { sha256, randomToken, hashPassword, verifyPassword, dummyVerify, tempPassword };
