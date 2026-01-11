#!/usr/bin/env node

/**
 * Standalone CLI verifier for Supabase Edge Functions JWT authentication
 * Tests anonymous sign-in, token validation, and both functions endpoints
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://qmhqfmkbvyeabftpchex.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtaHFmbWtidnllYWJmdHBjaGV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMzMyMzgsImV4cCI6MjA4MzcwOTIzOH0.LEmsl18C1cH3RjAQXC1TMViN7nrXbDgVEALHAYtY6PE';

// Safe JWT decoder
function decodeJwtPartSafe(part) {
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const json = Buffer.from(b64 + pad, 'base64').toString('utf-8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function decodeJwtSafe(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return { header: null, payload: null };
  return {
    header: decodeJwtPartSafe(parts[0]),
    payload: decodeJwtPartSafe(parts[1]),
  };
}

// Derive alternate functions domain
function getFunctionsDomainBaseUrl(supabaseUrl) {
  try {
    const u = new URL(supabaseUrl);
    const host = u.hostname;
    const ref = host.split('.')[0];
    return `https://${ref}.functions.supabase.co`;
  } catch {
    return null;
  }
}

async function main() {
  console.log('========================================');
  console.log('Supabase Edge Functions JWT Verifier');
  console.log('========================================\n');

  // Create Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  console.log('Step 1: Signing in anonymously...');
  const { data: authData, error: authError } = await supabase.auth.signInAnonymously();

  if (authError) {
    console.error('❌ ANONYMOUS SIGN-IN FAILED');
    console.error('Error:', authError.message);
    console.error('\nPossible causes:');
    console.error('  - Anonymous sign-ins are disabled in Supabase dashboard');
    console.error('  - Network connectivity issues');
    console.error('\nTo fix:');
    console.error('  1. Go to: https://supabase.com/dashboard/project/qmhqfmkbvyeabftpchex/auth/providers');
    console.error('  2. Enable "Anonymous sign-ins"');
    console.error('  3. Save and retry\n');
    process.exit(1);
  }

  const session = authData.session;
  if (!session || !session.access_token) {
    console.error('❌ No session or access token returned after sign-in\n');
    process.exit(1);
  }

  console.log('✅ Signed in anonymously\n');

  // Decode JWT
  const { header, payload } = decodeJwtSafe(session.access_token);

  console.log('Step 2: JWT Token Info');
  console.log('  Token prefix:', session.access_token.slice(0, 12) + '...');
  console.log('  Token length:', session.access_token.length);
  console.log('  JWT Header:');
  console.log('    alg:', header?.alg || 'N/A');
  console.log('    kid:', header?.kid || 'N/A');
  console.log('  JWT Payload:');
  console.log('    iss:', payload?.iss || 'N/A');
  console.log('    aud:', payload?.aud || 'N/A');
  console.log('    role:', payload?.role || 'N/A');
  console.log('    exp:', payload?.exp ? new Date(payload.exp * 1000).toISOString() : 'N/A');
  console.log('');

  // Test auth endpoint
  console.log('Step 3: Verifying token with /auth/v1/user...');
  const authUrl = `${SUPABASE_URL}/auth/v1/user`;
  let authResponse;
  try {
    authResponse = await fetch(authUrl, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    console.log('  Status:', authResponse.status, authResponse.statusText);

    if (authResponse.ok) {
      console.log('  ✅ Token accepted by auth endpoint\n');
    } else {
      const errorBody = await authResponse.text();
      console.log('  ❌ Token rejected by auth endpoint');
      console.log('  Response:', errorBody.slice(0, 200));
      console.log('');
    }
  } catch (error) {
    console.error('  ❌ Failed to call auth endpoint:', error.message);
    console.log('');
  }

  // Test primary functions endpoint
  console.log('Step 4: Testing primary functions endpoint...');
  const primaryUrl = `${SUPABASE_URL}/functions/v1/analyze_product`;
  console.log('  URL:', primaryUrl);

  let primaryResponse;
  let primarySuccess = false;
  try {
    primaryResponse = await fetch(primaryUrl, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: 'test' }),
    });

    const primaryBody = await primaryResponse.text();
    console.log('  Status:', primaryResponse.status, primaryResponse.statusText);
    console.log('  Response body:', primaryBody.slice(0, 200));

    if (primaryResponse.ok || primaryResponse.status === 202) {
      console.log('  ✅ Primary endpoint accepted request\n');
      primarySuccess = true;
    } else if (primaryResponse.status === 401 && primaryBody.includes('Invalid JWT')) {
      console.log('  ⚠️  Primary endpoint returned Invalid JWT\n');
    } else {
      console.log('  ❌ Primary endpoint returned error\n');
    }
  } catch (error) {
    console.error('  ❌ Failed to call primary endpoint:', error.message);
    console.log('');
  }

  // Test alternate functions domain
  console.log('Step 5: Testing alternate functions domain...');
  const functionsDomainBaseUrl = getFunctionsDomainBaseUrl(SUPABASE_URL);
  const fallbackUrl = `${functionsDomainBaseUrl}/analyze_product`;
  console.log('  URL:', fallbackUrl);

  let fallbackSuccess = false;
  try {
    const fallbackResponse = await fetch(fallbackUrl, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: 'test' }),
    });

    const fallbackBody = await fallbackResponse.text();
    console.log('  Status:', fallbackResponse.status, fallbackResponse.statusText);
    console.log('  Response body:', fallbackBody.slice(0, 200));

    if (fallbackResponse.ok || fallbackResponse.status === 202) {
      console.log('  ✅ Fallback endpoint accepted request\n');
      fallbackSuccess = true;
    } else if (fallbackResponse.status === 401 && fallbackBody.includes('Invalid JWT')) {
      console.log('  ⚠️  Fallback endpoint returned Invalid JWT\n');
    } else {
      console.log('  ❌ Fallback endpoint returned error\n');
    }
  } catch (error) {
    console.error('  ❌ Failed to call fallback endpoint:', error.message);
    console.log('');
  }

  // Final result
  console.log('========================================');
  console.log('FINAL RESULT');
  console.log('========================================');

  if (primarySuccess || fallbackSuccess) {
    console.log('✅ SUCCESS: At least one functions endpoint is working');
    console.log('  - Primary endpoint:', primarySuccess ? 'OK' : 'Failed');
    console.log('  - Fallback endpoint:', fallbackSuccess ? 'OK' : 'Failed');
    console.log('\nThe mobile app should work correctly.\n');
    process.exit(0);
  } else {
    console.log('❌ FAILURE: Both functions endpoints returned errors');
    console.log('  - Primary endpoint: Failed');
    console.log('  - Fallback endpoint: Failed');
    console.log('\nPossible causes:');
    console.log('  - Edge Functions not deployed');
    console.log('  - JWT verification misconfigured');
    console.log('  - Project configuration issue');
    console.log('\nNext steps:');
    console.log('  1. Check function deployment: supabase functions list');
    console.log('  2. Check function logs: supabase functions logs analyze_product');
    console.log('  3. Verify project settings in Supabase dashboard\n');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n❌ UNEXPECTED ERROR:', error.message);
  console.error(error.stack);
  process.exit(1);
});
