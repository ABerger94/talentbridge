import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const disableSdkAnalytics = () => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (url.searchParams.has('analytics-enable')) return;

  url.searchParams.set('analytics-enable', 'false');
  window.history.replaceState({}, document.title, url.toString());
};

disableSdkAnalytics();

const { appId, token, functionsVersion, appBaseUrl } = appParams;
export const base44ServerUrl = appBaseUrl || 'https://base44.app';

//Create a client with authentication required
export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: base44ServerUrl,
  requiresAuth: false,
  appBaseUrl
});
