import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { redirectToLogin, logoutLocally } from '@/lib/auth-redirect';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    if (!appParams.token) {
      setUser(null);
      setIsAuthenticated(false);
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
      setAuthChecked(true);
      setAuthError(null);
      return;
    }

    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      await checkUserAuth();
      setIsLoadingPublicSettings(false);
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      // Now check if the user is authenticated
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);
      
      // If user auth fails, it might be an expired token
      if (error.status === 401 || error.status === 403) {
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required'
        });
      }
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    
    if (shouldRedirect) {
      logoutLocally('/');
    } else {
      window.localStorage.removeItem('base44_access_token');
      window.localStorage.removeItem('token');
    }
  };

  const navigateToLogin = () => {
    redirectToLogin(window.location.href);
  };

  const loginWithGoogle = (targetUrl = window.location.href) => {
    base44.auth.loginWithProvider('google', targetUrl);
  };

  const loginWithEmailPassword = async (email, password) => {
    setIsLoadingAuth(true);
    setAuthError(null);

    try {
      await base44.auth.loginViaEmailPassword(email, password);
      await checkUserAuth();
    } catch (error) {
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthError({
        type: 'auth_failed',
        message: error.message || 'Unable to sign in'
      });
      throw error;
    }
  };

  const registerWithEmailPassword = async (email, password) => {
    setIsLoadingAuth(true);
    setAuthError(null);

    try {
      await base44.auth.register({ email, password });
      setIsLoadingAuth(false);
    } catch (error) {
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthError({
        type: 'auth_failed',
        message: error.message || 'Unable to create account'
      });
      throw error;
    }
  };

  const verifyEmailOtpAndLogin = async (email, password, otpCode) => {
    setIsLoadingAuth(true);
    setAuthError(null);

    try {
      await base44.auth.verifyOtp({ email, otpCode });
      await base44.auth.loginViaEmailPassword(email, password);
      await checkUserAuth();
    } catch (error) {
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthError({
        type: 'auth_failed',
        message: error.message || 'Unable to verify email'
      });
      throw error;
    }
  };

  const resendVerificationCode = async (email) => {
    await base44.auth.resendOtp(email);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      loginWithGoogle,
      loginWithEmailPassword,
      registerWithEmailPassword,
      verifyEmailOtpAndLogin,
      resendVerificationCode,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
