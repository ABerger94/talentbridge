'use strict';
// Browser security headers. On Vercel the static app gets the same headers
// from vercel.json (kept identical; server/test/security.test.js checks);
// this middleware covers the API and self-hosted deployments.
//
// CSP: scripts only from our own origin (no inline scripts, no eval), so an
// injected <script> can't run and read the session token; styles allow
// inline because React style props and the chart component need it; fonts
// from Google Fonts; images from anywhere over https (company logos).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self'",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const HEADERS = {
  'Content-Security-Policy': CSP,
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

function securityHeaders(req, res, next) {
  for (const [k, v] of Object.entries(HEADERS)) {
    if (k === 'Strict-Transport-Security' && !req.secure) continue;
    res.setHeader(k, v);
  }
  next();
}

module.exports = { securityHeaders, HEADERS, CSP };
