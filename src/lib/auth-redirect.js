import { appParams } from '@/lib/app-params';

const getBase44AppUrl = () => {
  if (appParams.appBaseUrl && !appParams.appBaseUrl.includes('api.base44.com')) {
    return appParams.appBaseUrl.replace(/\/$/, '');
  }

  if (window.location.hostname.endsWith('base44.app')) {
    return window.location.origin;
  }

  if (!appParams.appBaseUrl || appParams.appBaseUrl.includes('api.base44.com')) {
    throw new Error('VITE_BASE44_APP_BASE_URL must be set to the Base44 app domain, not the API domain.');
  }
};

const clearStoredAuth = () => {
  const tokenKeys = [
    'base44_access_token',
    'token',
    'access_token',
    'base44_token',
    'base44_app_id',
    'base44_app_base_url',
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
  const base44AppUrl = getBase44AppUrl();
  const target = new URL(targetUrl, window.location.origin);
  const callbackUrl = new URL(target.pathname + target.search + target.hash, window.location.origin);

  window.location.href = `${base44AppUrl}/login?from_url=${encodeURIComponent(callbackUrl.toString())}`;
};

export const logoutLocally = (targetPath = '/') => {
  clearStoredAuth();

  const logoutUrl = new URL(targetPath, window.location.origin);
  logoutUrl.searchParams.set('clear_access_token', 'true');

  try {
    const base44AppUrl = getBase44AppUrl();
    const serverLogoutUrl = new URL('/api/apps/auth/logout', base44AppUrl);
    serverLogoutUrl.searchParams.set('from_url', logoutUrl.toString());
    window.location.replace(serverLogoutUrl.toString());
  } catch {
    window.location.replace(logoutUrl.toString());
  }
};
