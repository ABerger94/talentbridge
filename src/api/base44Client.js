// Self-hosted client — drop-in replacement for the Base44 SDK client.
// Exposes the exact surface the app already uses (auth, entities, functions,
// integrations.Core) but talks to the TalentBridge server in /server.
// Set VITE_TB_API_URL when the API lives on a different origin than the page;
// leave it unset for same-origin hosting (the server serves the built app).
const API_BASE = (import.meta.env.VITE_TB_API_URL || '').replace(/\/$/, '');
export const base44ServerUrl = API_BASE;

const TOKEN_KEY = 'base44_access_token';

function getToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
function setToken(token) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage unavailable */ }
}

// Capture a token handed back by the Google OAuth redirect (#tb_token=...).
try {
  if (window.location.hash.includes('tb_token=')) {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const t = params.get('tb_token');
    if (t) {
      setToken(t);
      params.delete('tb_token');
      const rest = params.toString();
      window.history.replaceState(null, '', window.location.pathname + window.location.search + (rest ? `#${rest}` : ''));
    }
  }
} catch { /* not in a browser */ }

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error(payload?.error || `Request failed (${res.status})`);
    err.status = res.status;
    if (payload?.code) err.code = payload.code;
    throw err;
  }
  return payload;
}

const auth = {
  async me() {
    const { user } = await request('/api/auth/me');
    return user;
  },
  async isAuthenticated() {
    if (!getToken()) return false;
    try {
      await auth.me();
      return true;
    } catch {
      return false;
    }
  },
  async register({ email, password }) {
    return request('/api/auth/register', { method: 'POST', body: { email, password } });
  },
  async loginViaEmailPassword(email, password) {
    const data = await request('/api/auth/login', { method: 'POST', body: { email, password } });
    setToken(data.access_token);
    return data.user;
  },
  async verifyOtp({ email, otpCode }) {
    return request('/api/auth/verify-otp', { method: 'POST', body: { email, otpCode } });
  },
  async resendOtp(email) {
    return request('/api/auth/resend-otp', { method: 'POST', body: { email } });
  },
  async resetPasswordRequest(email) {
    return request('/api/auth/reset-password-request', { method: 'POST', body: { email } });
  },
  async resetPassword({ email, otpCode, newPassword }) {
    return request('/api/auth/reset-password', { method: 'POST', body: { email, otpCode, newPassword } });
  },
  loginWithProvider(provider, fromUrl) {
    if (provider !== 'google') throw new Error(`Provider ${provider} is not supported`);
    const returnTo = fromUrl || window.location.href;
    window.location.href = `${API_BASE}/api/auth/google?return_to=${encodeURIComponent(returnTo)}`;
  },
  logout() {
    setToken(null);
  },
  // Signed-in password change; other devices are signed out and this one
  // switches to the fresh token the server returns.
  async changePassword({ currentPassword, newPassword }) {
    const data = await request('/api/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
    if (data.access_token) setToken(data.access_token);
    return data;
  },
  async signOutOtherDevices() {
    const data = await request('/api/auth/sign-out-others', { method: 'POST' });
    if (data.access_token) setToken(data.access_token);
    return data;
  },
};

// Account self-service (server/src/account.js).
const account = {
  // Downloads the JSON export through the browser (the request needs the
  // session token, so it can't be a plain link).
  async downloadExport() {
    const token = getToken();
    const res = await fetch(`${API_BASE}/api/account/export`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) {
      let msg = `Export failed (${res.status})`;
      try { msg = (await res.json()).error || msg; } catch { /* not json */ }
      throw new Error(msg);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `talentbridge-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  async deleteAccount({ password, confirm }) {
    const data = (await request('/api/account/delete', { method: 'POST', body: { password, confirm } })).data;
    setToken(null);
    return data;
  },
};

// Job board search and per-seeker suggestions (server/src/jobsapi.js).
const jobs = {
  async search(params = {}) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    return request(`/api/jobs/search?${qs}`);
  },
  // Roles relevant to the signed-in seeker. With filters, returns
  // { data: jobs, pool: open roles fitting the filters }.
  async suggested(limit = 25, filters) {
    const params = new URLSearchParams({ limit: String(limit) });
    for (const [k, v] of Object.entries(filters || {})) if (v) params.set(k, String(v));
    const r = await request(`/api/jobs/suggested?${params}`);
    return filters ? r : r.data;
  },
};

// Job alert emails (server/src/alerts.js).
const alerts = {
  async preferences() {
    return (await request('/api/alerts/preferences')).data;
  },
  async save(changes) {
    return (await request('/api/alerts/preferences', { method: 'PUT', body: changes })).data;
  },
};

// Reports browser errors to the server (admin System tab). Fire-and-forget.
export function reportClientError(message, stack) {
  try {
    const token = getToken();
    fetch(`${API_BASE}/api/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ message: String(message).slice(0, 500), stack: String(stack || '').slice(0, 4000), url: window.location.href }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* never throw from the error reporter */ }
}

function entityApi(name) {
  return {
    async create(data) {
      const { data: record } = await request(`/api/entities/${name}`, { method: 'POST', body: data });
      return record;
    },
    async update(id, data) {
      const { data: record } = await request(`/api/entities/${name}/${id}`, { method: 'PUT', body: data });
      return record;
    },
    async read(id) {
      const { data: record } = await request(`/api/entities/${name}/${id}`);
      return record;
    },
    async get(id) {
      return entityApi(name).read(id);
    },
    async filter(criteria = {}) {
      const qs = new URLSearchParams({ filter: JSON.stringify(criteria) });
      const { data } = await request(`/api/entities/${name}?${qs}`);
      return data;
    },
    async list(sort, limit = 1000) {
      const qs = new URLSearchParams({ limit: String(limit) });
      const { data } = await request(`/api/entities/${name}?${qs}`);
      return data;
    },
    async delete(id) {
      return request(`/api/entities/${name}/${id}`, { method: 'DELETE' });
    },
  };
}

const entities = {
  SeekerProfile: entityApi('SeekerProfile'),
  Job: entityApi('Job'),
  JobApplication: entityApi('JobApplication'),
  Invitation: entityApi('Invitation'),
};

const functions = {
  // Base44's invoke resolved to an axios-like { data } — callers read
  // res.data.<field>, so return the server body ({ data }) untouched.
  async invoke(name, args = {}) {
    return request(`/api/functions/${name}`, { method: 'POST', body: args });
  },
};

const integrations = {
  Core: {
    async InvokeLLM({ prompt, response_json_schema, file_urls }) {
      const { data } = await request('/api/integrations/llm', {
        method: 'POST',
        body: {
          prompt,
          response_json_schema,
          ...(Array.isArray(file_urls) && file_urls.length ? { file_urls } : {}),
        },
      });
      return data;
    },
    async UploadFile({ file }) {
      const form = new FormData();
      form.append('file', file);
      const { data } = await request('/api/files/upload', { method: 'POST', body: form });
      return data;
    },
    async ExtractDataFromUploadedFile({ file_url, json_schema }) {
      const { data } = await request('/api/integrations/extract', {
        method: 'POST',
        body: { file_url, json_schema },
      });
      return data;
    },
  },
};

// Messaging (application-scoped conversations; see server/src/messages.js).
const messages = {
  async inbox() {
    return (await request('/api/messages')).data;
  },
  async unreadCount() {
    return (await request('/api/messages/unread-count')).data.unread;
  },
  async thread(applicationId) {
    return (await request(`/api/messages/${encodeURIComponent(applicationId)}`)).data;
  },
  async send(applicationId, body) {
    return (await request(`/api/messages/${encodeURIComponent(applicationId)}`, { method: 'POST', body: { body } })).data;
  },
  async setBlocked(applicationId, blocked) {
    return (await request(`/api/messages/${encodeURIComponent(applicationId)}/block`, { method: 'POST', body: { blocked } })).data;
  },
  async report(applicationId, reason) {
    return (await request(`/api/messages/${encodeURIComponent(applicationId)}/report`, { method: 'POST', body: { reason } })).data;
  },
};

// Employer company profile + verification (server/src/employers.js).
const employer = {
  async profile() {
    return (await request('/api/employer/profile')).data;
  },
  async saveProfile(company) {
    return (await request('/api/employer/profile', { method: 'PUT', body: company })).data;
  },
  async jobStats() {
    return (await request('/api/employer/job-stats')).data;
  },
};

// Admin-only review endpoints.
const admin = {
  // Admin API keys (for AI agents and scripts); see server/src/apikeys.js.
  async apiKeys() {
    return (await request('/api/admin/api-keys')).data;
  },
  async createApiKey(body) {
    return (await request('/api/admin/api-keys', { method: 'POST', body })).data;
  },
  async revokeApiKey(id) {
    return (await request(`/api/admin/api-keys/${id}/revoke`, { method: 'POST' })).data;
  },
  async employers(status = 'pending') {
    return (await request(`/api/admin/employers?status=${encodeURIComponent(status)}`)).data;
  },
  async decide(employerId, decision, note) {
    return (await request(`/api/admin/employers/${encodeURIComponent(employerId)}/decision`, { method: 'POST', body: { decision, note } })).data;
  },
  async reports() {
    return (await request('/api/admin/reports')).data;
  },
  async incompleteSignups() {
    return (await request('/api/admin/incomplete-signups')).data;
  },
  async remind(userId) {
    return (await request(`/api/admin/incomplete-signups/${encodeURIComponent(userId)}/remind`, { method: 'POST' })).data;
  },
  async system({ resolved = false } = {}) {
    return (await request(`/api/admin/system${resolved ? '?resolved=1' : ''}`)).data;
  },
  async resolveError(signature) {
    return (await request(`/api/admin/errors/${encodeURIComponent(signature)}/resolve`, { method: 'POST' })).data;
  },
  async fairnessCheck(jobId) {
    return (await request('/api/admin/ai/fairness', { method: 'POST', body: jobId ? { job_id: jobId } : {} })).data;
  },
  async jobSources() {
    return (await request('/api/admin/job-sources')).data;
  },
  async addJobSource(source) {
    return (await request('/api/admin/job-sources', { method: 'POST', body: source })).data;
  },
  async updateJobSource(id, changes) {
    return (await request(`/api/admin/job-sources/${encodeURIComponent(id)}`, { method: 'PUT', body: changes })).data;
  },
  async removeJobSource(id) {
    return (await request(`/api/admin/job-sources/${encodeURIComponent(id)}`, { method: 'DELETE' })).data;
  },
  async runJobImports(sourceIds) {
    return (await request('/api/admin/job-sources/run', { method: 'POST', body: sourceIds ? { source_ids: sourceIds } : {} })).data;
  },
  async runJobAlerts() {
    return (await request('/api/admin/alerts/run', { method: 'POST' })).data;
  },
  async migrateStorage() {
    return (await request('/api/admin/storage/migrate', { method: 'POST' })).data;
  },
};

export const base44 = { auth, account, alerts, jobs, entities, functions, integrations, messages, employer, admin };
