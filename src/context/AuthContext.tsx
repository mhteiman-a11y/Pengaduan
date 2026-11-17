import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  User as FirebaseUser,
  onIdTokenChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { DbUser } from '../types/sippandu';

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  dbUser: DbUser | null;
  idToken: string | null;
  loading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  getFreshToken: (forceRefresh?: boolean) => Promise<string | null>;
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const syncProfile = useCallback(async (user: FirebaseUser, forceRefresh = false, attempt = 0) => {
    try {
      let token = await user.getIdToken(forceRefresh);
      setIdToken(token);
      let res = await fetch('/api/me', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401 && !forceRefresh) {
        token = await user.getIdToken(true);
        setIdToken(token);
        res = await fetch('/api/me', {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      if (res.status >= 500 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        return syncProfile(user, forceRefresh, attempt + 1);
      }

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'Gagal memuat profil pengguna.');
      }
      const data = await res.json();
      setDbUser(data.user);
      setAuthError(null);
    } catch (err: any) {
      if (attempt < 2 && (!err?.message || err.message.includes('fetch'))) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        return syncProfile(user, forceRefresh, attempt + 1);
      }
      console.error('Auth sync error:', err);
      setAuthError(err.message || 'Gagal menyinkronkan akun.');
      setDbUser(null);
    }
  }, []);

  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        await syncProfile(user);
      } else {
        setIdToken(null);
        setDbUser(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [syncProfile]);

  // Proactively refresh Firebase ID token every 45 minutes while signed in
  useEffect(() => {
    if (!firebaseUser) return;
    const interval = setInterval(async () => {
      try {
        const refreshed = await firebaseUser.getIdToken(true);
        setIdToken(refreshed);
      } catch {
        // Ignore background refresh failures; authFetch will handle on next request
      }
    }, 45 * 60 * 1000);
    return () => clearInterval(interval);
  }, [firebaseUser]);

  const getFreshToken = useCallback(
    async (forceRefresh = false): Promise<string | null> => {
      const current = auth.currentUser;
      if (!current) return null;
      const fresh = await current.getIdToken(forceRefresh);
      setIdToken(fresh);
      return fresh;
    },
    []
  );

  const authFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
      const buildHeaders = (token: string | null) => {
        const headers = new Headers(init.headers);
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        return headers;
      };

      const token = await getFreshToken(false);
      let res = await fetch(input, {
        ...init,
        cache: init.cache ?? 'no-store',
        headers: buildHeaders(token),
      });

      if (res.status === 401 && auth.currentUser) {
        const refreshed = await getFreshToken(true);
        res = await fetch(input, {
          ...init,
          cache: init.cache ?? 'no-store',
          headers: buildHeaders(refreshed),
        });
      }

      return res;
    },
    [getFreshToken]
  );

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      await syncProfile(cred.user, true);
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        setAuthError(err.message || 'Proses masuk Google gagal.');
      }
    }
  };

  const logout = async () => {
    await signOut(auth);
    setIdToken(null);
    setDbUser(null);
  };

  const refreshProfile = async () => {
    if (auth.currentUser) {
      await syncProfile(auth.currentUser, true);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        dbUser,
        idToken,
        loading,
        authError,
        signInWithGoogle,
        logout,
        refreshProfile,
        getFreshToken,
        authFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
