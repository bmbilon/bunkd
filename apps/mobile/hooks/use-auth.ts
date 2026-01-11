import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function useAuth() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        console.log('[Auth] Initializing authentication...');

        // Check if user is already signed in
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('[Auth] Error getting session:', sessionError);
          throw sessionError;
        }

        if (session) {
          console.log('[Auth] ✓ User already authenticated:', session.user.id);
          if (mounted) {
            setIsInitialized(true);
          }
          return;
        }

        // No session, sign in anonymously
        console.log('[Auth] No session found, signing in anonymously...');
        const { data, error: signInError } = await supabase.auth.signInAnonymously();

        if (signInError) {
          console.error('[Auth] Error signing in anonymously:', signInError);
          throw signInError;
        }

        if (data.session) {
          console.log('[Auth] ✓ Signed in anonymously:', data.user?.id);
          if (mounted) {
            setIsInitialized(true);
          }
        } else {
          throw new Error('No session returned from anonymous sign in');
        }
      } catch (err) {
        console.error('[Auth] Failed to initialize:', err);
        if (mounted) {
          setError(err instanceof Error ? err.message : String(err));
          setIsInitialized(true); // Still mark as initialized to not block app
        }
      }
    };

    initAuth();

    return () => {
      mounted = false;
    };
  }, []);

  return { isInitialized, error };
}
