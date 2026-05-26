import { appParams, DEFAULT_BASE44_APP_BASE_URL, DEFAULT_PUBLIC_APP_URL } from '@/lib/app-params';

const getBase44AppUrl = () => {
  if (appParams.appBaseUrl && !appParams.appBaseUrl.includes('api.base44.com')) {
    return appParams.appBaseUrl.replace(/\/$/, '');
  }

  if (window.location.hostname.endsWith('base44.app')) {
    return window.location.origin;
  }

  return DEFAULT_BASE44_APP_BASE_URL;
};

const clearStoredAuth = () => {
  const tokenKeys = [
    'base44_access_token',
    'token',
    'access_token',
    'base44_token',
  ];

  tokenKeys.forEach((key) => {
    try {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    } catch {
      // Storage can be unavailable in restrictive browser modes.
    }
  });
};

export const redirectToLogin = (targetUrl = window.location.href) => {
  if (!window.location.hostname.endsWith('base44.app')) {
    const loginUrl = new URL('/login', window.location.origin);
    loginUrl.searchParams.set('next', new URL(targetUrl, window.location.origin).toString());
    window.location.href = loginUrl.toString();
    return;
  }

  const base44AppUrl = getBase44AppUrl();
  const target = new URL(targetUrl, window.location.origin);
  const callbackUrl = new URL(target.pathname + target.search + target.hash, window.location.origin);

  window.location.href = `${base44AppUrl}/login?from_url=${encodeURIComponent(callbackUrl.toString())}`;
};

export const logoutLocally = (targetPath = '/') => {
  clearStoredAuth();

  const logoutUrl = new URL(targetPath, window.location.origin);
  logoutUrl.searchParams.set('clear_access_token', 'true');

  if (!window.location.hostname.endsWith('base44.app')) {
    window.location.replace(logoutUrl.toString());
    return;
  }

  try {
    const base44AppUrl = getBase44AppUrl();
    const serverLogoutUrl = new URL('/api/apps/auth/logout', base44AppUrl);
    serverLogoutUrl.searchParams.set('from_url', logoutUrl.toString());
    window.location.replace(serverLogoutUrl.toString());
  } catch {
    window.location.replace(logoutUrl.toString());
  }
};

export const getAllowedPublicTarget = (targetUrl = DEFAULT_PUBLIC_APP_URL) => {
  const fallback = new URL(DEFAULT_PUBLIC_APP_URL);
  try {
    const target = new URL(targetUrl, fallback.origin);
    if (target.origin !== fallback.origin) return fallback;
    return target;
  } catch {
    return fallback;
  }
};
