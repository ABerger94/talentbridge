import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Landing from './pages/Landing';
import JobBoard from './pages/JobBoard';
import JobDetail from './pages/JobDetail';
import PostJob from './pages/PostJob';
import SeekerDashboard from './pages/SeekerDashboard';
import EmployerDashboard from './pages/EmployerDashboard';
import AppLayout from './components/layout/AppLayout';

// Wraps protected routes — redirects to login if not authenticated, optionally checks role
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isLoadingAuth, isAuthenticated, authError, navigateToLogin, user } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError?.type === 'user_not_registered') {
    return <UserNotRegisteredError />;
  }

  if (!isAuthenticated) {
    navigateToLogin();
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    // Redirect to their appropriate dashboard
    const redirectTo = user?.role === 'employer' ? '/employer' : '/dashboard';
    window.location.replace(redirectTo);
    return null;
  }

  return children;
};

const AuthenticatedApp = () => {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        {/* Public routes — no login required */}
        <Route path="/" element={<Landing />} />
        <Route path="/jobs" element={<JobBoard />} />
        <Route path="/jobs/:id" element={<JobDetail />} />

        {/* Protected routes — login + role required */}
        <Route path="/post-job" element={<ProtectedRoute allowedRoles={['employer', 'admin']}><PostJob /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['job_seeker', 'admin']}><SeekerDashboard /></ProtectedRoute>} />
        <Route path="/employer" element={<ProtectedRoute allowedRoles={['employer', 'admin']}><EmployerDashboard /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App