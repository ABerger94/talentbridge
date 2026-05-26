import { appParams } from '@/lib/app-params';

const getBase44AppUrl = () => {
  if (!appParams.appBaseUrl || appParams.appBaseUrl.includes('api.base44.com')) {
    throw new Error('VITE_BASE44_APP_BASE_URL must be set to the Base44 app domain, not the API domain.');
  }

  return appParams.appBaseUrl.replace(/\/$/, '');
};

export const redirectToLogin = (targetUrl = window.location.href) => {
  const base44AppUrl = getBase44AppUrl();
  const target = new URL(targetUrl, window.location.origin);
  const callbackOrigin = window.location.hostname.endsWith('base44.app')
    ? window.location.origin
    : base44AppUrl;
  const callbackUrl = new URL(target.pathname + target.search + target.hash, callbackOrigin);

  window.location.href = `${base44AppUrl}/login?from_url=${encodeURIComponent(callbackUrl.toString())}`;
};

export const logoutLocally = (targetPath = '/') => {
  const tokenKeys = [
    'base44_access_token',
    'token',
    'access_token',
    'base44_token',
    'base44_app_id',
    'base44_app_base_url',
  ];

  tokenKeys.forEach((key) => {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  });

  const logoutUrl = new URL(targetPath, window.location.origin);
  logoutUrl.searchParams.set('clear_access_token', 'true');
  window.location.replace(logoutUrl.toString());
};
