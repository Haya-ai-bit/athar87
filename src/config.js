'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const PROD = process.env.NODE_ENV === 'production';

module.exports = {
  ROOT,
  DATA_DIR,
  DB_PATH: path.join(DATA_DIR, 'athar.db'),
  UPLOAD_DIR: path.join(DATA_DIR, 'uploads'),
  BACKUP_DIR: path.resolve(process.env.BACKUP_DIR || path.join(ROOT, 'backups')),
  PUBLIC_DIR: path.join(ROOT, 'public'),
  PORT: Number(process.env.PORT) || 3000,
  HOST: process.env.HOST || '0.0.0.0',
  PROD,
  // فعّلي TRUST_PROXY=1 فقط عند التشغيل خلف وكيل عكسي موثوق (Nginx/Render/…) ليُقرأ عنوان IP الحقيقي
  TRUST_PROXY: process.env.TRUST_PROXY === '1',
  COOKIE_NAME: PROD ? '__Host-athar_sid' : 'athar_sid',
  SESSION_IDLE_HOURS: 12,
  SESSION_MAX_DAYS: 7,
  SCRYPT_N: Number(process.env.SCRYPT_N) || 16384,
  // مسار اختياري لبرنامج ClamAV لفحص الملفات المرفوعة (clamscan)
  CLAMSCAN: process.env.CLAMSCAN_PATH || '',
};
