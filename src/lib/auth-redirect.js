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
  window.localStorage.removeItem('base44_access_token');
  window.localStorage.removeItem('token');
  window.location.href = new URL(targetPath, window.location.origin).toString();
};
