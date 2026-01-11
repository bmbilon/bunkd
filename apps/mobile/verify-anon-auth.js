#!/usr/bin/env node

/**
 * Verification script for anonymous authentication
 * Run this to verify that anonymous sign-ins are working in your Supabase project
 *
 * Usage: node verify-anon-auth.js
 */

const { createClient } = require('@supabase/supabase-js');

// Read from environment or hardcoded values
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://qmhqfmkbvyeabftpchex.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtaHFmbWtidnllYWJmdHBjaGV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMzMyMzgsImV4cCI6MjA4MzcwOTIzOH0.LEmsl18C1cH3RjAQXC1TMViN7nrXbDgVEALHAYtY6PE';

console.log('========================================');
console.log('  ANONYMOUS AUTH VERIFICATION');
console.log('========================================');
console.log('');
console.log('Supabase URL:', SUPABASE_URL);
console.log('Anon Key:', SUPABASE_ANON_KEY.substring(0, 20) + '...');
console.log('');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ ERROR: Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  console.error('');
  console.error('Set environment variables:');
  console.error('  export EXPO_PUBLIC_SUPABASE_URL="your-url"');
  console.error('  export EXPO_PUBLIC_SUPABASE_ANON_KEY="your-key"');
  console.error('');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function verify() {
  try {
    console.log('Attempting anonymous sign-in...');
    console.log('');

    const { data, error } = await supabase.auth.signInAnonymously();

    if (error) {
      console.error('❌ ANONYMOUS SIGN-IN FAILED');
      console.error('');
      console.error('Error:', error.message);
      console.error('Status:', error.status || 'unknown');
      console.error('');

      if (error.message.includes('Anonymous sign-ins are disabled')) {
        console.error('🔧 FIX REQUIRED:');
        console.error('');
        console.error('1. Open your Supabase Dashboard:');
        console.error('   https://supabase.com/dashboard/project/qmhqfmkbvyeabftpchex/auth/providers');
        console.error('');
        console.error('2. Find "Anonymous sign-ins" in the providers list');
        console.error('');
        console.error('3. Toggle it ON');
        console.error('');
        console.error('4. Click "Save"');
        console.error('');
        console.error('5. Run this script again to verify');
        console.error('');
      }

      process.exit(1);
    }

    if (!data.session || !data.user) {
      console.error('❌ SIGN-IN SUCCEEDED BUT NO SESSION RETURNED');
      console.error('');
      console.error('This is unexpected. Check your Supabase configuration.');
      console.error('');
      process.exit(1);
    }

    console.log('✅ ANONYMOUS SIGN-IN SUCCESSFUL!');
    console.log('');
    console.log('Session details:');
    console.log('  User ID:', data.user.id);
    console.log('  Access token length:', data.session.access_token.length);
    console.log('  Token expires at:', new Date(data.session.expires_at * 1000).toISOString());
    console.log('  Provider:', data.user.app_metadata?.provider || 'anonymous');
    console.log('');
    console.log('Your Supabase project is correctly configured for anonymous auth.');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Start your Expo app: npm start');
    console.log('  2. Check console logs for [Auth] ✓ Signed in anonymously');
    console.log('  3. Try analyzing a product with TEXT input');
    console.log('');

    // Clean up - sign out
    await supabase.auth.signOut();
    console.log('(Test session cleaned up)');
    console.log('');

  } catch (err) {
    console.error('❌ UNEXPECTED ERROR');
    console.error('');
    console.error('Error:', err.message || String(err));
    console.error('');
    console.error('This might be a network issue or incorrect Supabase URL/key.');
    console.error('');
    process.exit(1);
  }
}

verify();
