import { useEffect } from 'react';
import { appParams } from '@/lib/app-params';
import { getAllowedPublicTarget } from '@/lib/auth-redirect';

const getStoredToken = () => {
  try {
    return window.localStorage.getItem('base44_access_token') || window.localStorage.getItem('token');
  } catch {
    return null;
  }
};

export default function AuthBridge() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = getAllowedPublicTarget(params.get('target'));
    const token = appParams.token || getStoredToken();
    const isNewUser = params.get('is_new_user');

    if (token) {
      target.searchParams.set('access_token', token);
    }

    if (isNewUser != null) {
      target.searchParams.set('is_new_user', isNewUser);
    }

    window.location.replace(target.toString());
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
    </div>
  );
}
