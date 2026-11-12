'use strict';
const path = require('path');
const fs = require('fs');
// Minimal .env loader (server/.env), no dependency needed.
try {
  const envFile = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2];
      }
    }
  }
} catch { /* env file optional */ }
const express = require('express');
const { registerAuthRoutes, secretStatus } = require('./auth');
const { registerEntityRoutes } = require('./entities');
const { registerLlmRoutes, providerStatus } = require('./llm');
const { registerFileRoutes } = require('./files');
const { registerFunctionRoutes } = require('./functions');
const { registerMessageRoutes } = require('./messages');
const { registerEmployerRoutes } = require('./employers');
const { registerSignupRoutes } = require('./signups');
const { mailStatus } = require('./mailer');
const { registerSystemRoutes } = require('./system');
const { registerAccountRoutes } = require('./account');
const { registerSeoRoutes } = require('./seo');
const { registerAlertRoutes } = require('./alerts');
const { registerJobStatsRoutes } = require('./jobstats');
const { securityHeaders } = require('./security');

const app = express();
app.set('trust proxy', true); // correct https host behind Vercel's proxy (OAuth redirects)
app.use(securityHeaders);
app.use(express.json({ limit: '2mb' }));

// CORS for the separately-hosted frontend (Vercel) during transition.
// Same-origin deployments don't need it; TB_CORS_ORIGIN=* by default in dev.
app.use((req, res, next) => {
  const origin = process.env.TB_CORS_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'talentbridge-server',
    ai: providerStatus(),
    mail: mailStatus(),
    auth_secret: secretStatus(), // 'ok' | 'short' | 'missing' | 'default' | 'dev-default'
    google_auth_configured: !!process.env.TB_GOOGLE_CLIENT_ID,
  });
});

registerAuthRoutes(app);
registerEntityRoutes(app);
registerLlmRoutes(app);
registerFileRoutes(app);
registerFunctionRoutes(app);
registerMessageRoutes(app);
registerEmployerRoutes(app);
registerSignupRoutes(app);
registerSystemRoutes(app);
registerAccountRoutes(app);
registerAlertRoutes(app);
registerJobStatsRoutes(app);
registerSeoRoutes(app); // before the static app below, so job pages get their real <head>

// Uploaded files are served only through files.js (access-checked); there
// is deliberately no static route for the uploads directory.

// In production the server also serves the built frontend (../dist) so the
// whole product is one process on the ASUS.
const DIST = path.join(__dirname, '..', '..', 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  if (!err.status || err.status >= 500) require('./monitor').captureServerError(err, req);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

module.exports = app;

// Standalone mode (ASUS / local): listen. On Vercel the app is exported to
// the serverless entry (api/index.js) and never listens.
if (require.main === module) {
  const PORT = parseInt(process.env.TB_PORT || '8787', 10);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TalentBridge server listening on http://0.0.0.0:${PORT}`);
    if (!providerStatus().configured) console.log('NOTE: no AI provider keys set — AI features will return 503 until at least one is (see server/src/llm.js).');
    if (!process.env.TB_JWT_SECRET) console.log('NOTE: TB_JWT_SECRET not set — using a dev secret. Set it before real deployment.');
  });
}
