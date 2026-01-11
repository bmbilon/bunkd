import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface AuthState {
  isInitialized: boolean;
  isAuthenticated: boolean;
  userId: string | null;
  error: string | null;
  isAnonymousDisabled: boolean;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    isInitialized: false,
    isAuthenticated: false,
    userId: null,
    error: null,
    isAnonymousDisabled: false,
  });

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        console.log('[Auth] ========== INITIALIZING AUTHENTICATION ==========');

        // Check if user is already signed in
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('[Auth] Error getting session:', sessionError);
          throw sessionError;
        }

        if (session) {
          console.log('[Auth] ✓ User already authenticated');
          console.log('[Auth]   User ID:', session.user.id);
          console.log('[Auth]   Access token present:', !!session.access_token);
          console.log('[Auth]   Token length:', session.access_token?.length || 0);

          if (mounted) {
            setState({
              isInitialized: true,
              isAuthenticated: true,
              userId: session.user.id,
              error: null,
              isAnonymousDisabled: false,
            });
          }
          return;
        }

        // No session, sign in anonymously
        console.log('[Auth] No session found, attempting anonymous sign-in...');
        const { data, error: signInError } = await supabase.auth.signInAnonymously();

        if (signInError) {
          // Check if anonymous sign-ins are disabled
          const isAnonDisabled =
            signInError.message.includes('Anonymous sign-ins are disabled') ||
            signInError.message.includes('anonymous') ||
            signInError.status === 400;

          if (isAnonDisabled) {
            console.error('[Auth] ⚠️  ANONYMOUS SIGN-INS ARE DISABLED');
            console.error('[Auth]    Error:', signInError.message);
            console.error('[Auth]    The app will run in unauthenticated mode.');
            console.error('[Auth]    Analysis requests will likely fail until you enable anonymous auth.');
            console.error('[Auth] ');
            console.error('[Auth] TO FIX:');
            console.error('[Auth]   1. Go to Supabase Dashboard → Auth → Providers');
            console.error('[Auth]   2. Enable "Anonymous sign-ins"');
            console.error('[Auth]   3. Save and restart the app');

            if (mounted) {
              setState({
                isInitialized: true,
                isAuthenticated: false,
                userId: null,
                error: 'Anonymous sign-ins are disabled. Enable in Supabase Dashboard → Auth → Providers.',
                isAnonymousDisabled: true,
              });
            }
            return;
          }

          // Other error
          console.error('[Auth] Sign-in error:', signInError);
          throw signInError;
        }

        if (data.session && data.user) {
          console.log('[Auth] ✓ Signed in anonymously successfully!');
          console.log('[Auth]   User ID:', data.user.id);
          console.log('[Auth]   Access token present:', !!data.session.access_token);
          console.log('[Auth]   Token length:', data.session.access_token?.length || 0);
          console.log('[Auth]   Token expires at:', new Date(data.session.expires_at! * 1000).toISOString());

          if (mounted) {
            setState({
              isInitialized: true,
              isAuthenticated: true,
              userId: data.user.id,
              error: null,
              isAnonymousDisabled: false,
            });
          }
        } else {
          throw new Error('No session returned from anonymous sign in');
        }
      } catch (err) {
        console.error('[Auth] ========== AUTH FAILED ==========');
        console.error('[Auth] Error:', err instanceof Error ? err.message : String(err));
        console.error('[Auth] The app will continue but API calls may fail.');

        if (mounted) {
          setState({
            isInitialized: true,
            isAuthenticated: false,
            userId: null,
            error: err instanceof Error ? err.message : String(err),
            isAnonymousDisabled: false,
          });
        }
      }
    };

    initAuth();

    return () => {
      mounted = false;
    };
  }, []);

  return state;
}
