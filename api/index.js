// Vercel serverless entry: the Express app from the self-hosted server,
// exported as a function handler. All /api/* traffic is rewritten here
// (see vercel.json); the static frontend is served by Vercel itself.
// The root package is ESM while server/ is CommonJS — the default import
// below is the Express app (server/src/index.js sets module.exports = app).
import app from '../server/src/index.js';

export default app;
