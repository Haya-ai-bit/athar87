'use strict';
const cfg = require('./src/config');
const { setUserLoader, createServer } = require('./src/http');
const auth = require('./src/auth');
require('./src/db');
setUserLoader(auth.loadUser);

require('./src/routes/public');
require('./src/routes/auth');
require('./src/routes/student');
require('./src/routes/files');
require('./src/routes/admin');
require('./src/routes/reports');

const server = createServer();
server.requestTimeout = 120000;
server.listen(cfg.PORT, cfg.HOST, () => {
  console.log(`أَثَر 87 يعمل على: http://${cfg.HOST === '0.0.0.0' ? 'localhost' : cfg.HOST}:${cfg.PORT}  (البيانات: ${cfg.DATA_DIR})`);
  if (!require('./src/db').get("SELECT id FROM users WHERE role='admin' LIMIT 1")) {
    console.log('تنبيه: لا يوجد حساب متحكم بعد. أنشئيه بالأمر: npm run create-admin');
  }
});
setInterval(() => { try { auth.purgeExpiredSessions(); } catch (e) { console.error(e); } }, 3600 * 1000).unref();
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); });
