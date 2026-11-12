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
};

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

export const base44 = { auth, entities, functions, integrations, messages };
