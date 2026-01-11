import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = 'https://qmhqfmkbvyeabftpchex.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtaHFmbWtidnllYWJmdHBjaGV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMzMyMzgsImV4cCI6MjA4MzcwOTIzOH0.LEmsl18C1cH3RjAQXC1TMViN7nrXbDgVEALHAYtY6PE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// Export constants for API layer (prevents drift/hardcoding)
export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnonKey;
