import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { reportClientError } from '@/api/base44Client'

// Send uncaught browser errors to the server so admins see them on the
// System tab. A few per page load at most, each message once.
const reported = new Set();
const report = (message, stack) => {
  const key = String(message);
  if (!message || reported.has(key) || reported.size >= 5) return;
  // Errors thrown by browser extensions aren't ours.
  if (/extension:\/\//.test(String(stack || ''))) return;
  reported.add(key);
  reportClientError(message, stack);
};
window.addEventListener('error', (e) => report(e.message, e.error?.stack));
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  // API errors (4xx) are expected outcomes the UI already shows.
  if (r && typeof r.status === 'number' && r.status < 500) return;
  report(r?.message || String(r), r?.stack);
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
