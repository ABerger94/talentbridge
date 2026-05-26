import { useEffect } from 'react';
import { getAllowedPublicTarget } from '@/lib/auth-redirect';

export default function LogoutBridge() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = getAllowedPublicTarget(params.get('target'));
    target.searchParams.set('clear_access_token', 'true');
    window.location.replace(target.toString());
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
    </div>
  );
}
