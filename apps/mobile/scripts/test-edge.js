#!/usr/bin/env node

/**
 * Test script for Edge Function calls
 * Tests analyze_product endpoint with current session
 *
 * Usage: node apps/mobile/scripts/test-edge.js
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://qmhqfmkbvyeabftpchex.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtaHFmbWtidnllYWJmdHBjaGV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMzMyMzgsImV4cCI6MjA4MzcwOTIzOH0.LEmsl18C1cH3RjAQXC1TMViN7nrXbDgVEALHAYtY6PE';

async function testEdgeFunction() {
  console.log('========================================');
  console.log('Edge Function Test: analyze_product');
  console.log('========================================\n');

  // Create Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Sign in anonymously
  console.log('Step 1: Signing in anonymously...');
  const { data: authData, error: authError } = await supabase.auth.signInAnonymously();

  if (authError) {
    console.error('❌ Sign-in failed:', authError.message);
    process.exit(1);
  }

  const session = authData.session;
  if (!session?.access_token) {
    console.error('❌ No access token in session');
    process.exit(1);
  }

  console.log('✅ Signed in');
  console.log('   Token prefix:', session.access_token.slice(0, 12) + '...');
  console.log('   Token length:', session.access_token.length);
  console.log('');

  // Test analyze_product
  console.log('Step 2: Calling analyze_product...');
  const url = `${SUPABASE_URL}/functions/v1/analyze_product`;
  console.log('   URL:', url);

  const testPayload = { text: 'Turkesterone' };
  console.log('   Payload:', JSON.stringify(testPayload));
  console.log('');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(testPayload),
    });

    console.log('Response:');
    console.log('   Status:', response.status, response.statusText);

    const responseText = await response.text();
    console.log('   Body:', responseText.slice(0, 500));

    let responseData;
    try {
      responseData = JSON.parse(responseText);
      console.log('');
      console.log('Parsed Response:');
      console.log(JSON.stringify(responseData, null, 2));
    } catch {
      console.log('   (Could not parse as JSON)');
    }

    console.log('');
    console.log('========================================');
    if (response.ok || response.status === 202) {
      console.log('✅ SUCCESS: Function call completed');
      console.log('   Status:', response.status);
      if (responseData?.status) {
        console.log('   Job status:', responseData.status);
      }
      if (responseData?.job_id) {
        console.log('   Job ID:', responseData.job_id);
      }
      if (responseData?.cached) {
        console.log('   Cached:', responseData.cached);
      }
      console.log('========================================\n');
      process.exit(0);
    } else {
      console.log('❌ FAILURE: Function returned error');
      console.log('   Status:', response.status);
      if (responseData?.error) {
        console.log('   Error:', responseData.error);
      }
      if (responseData?.details) {
        console.log('   Details:', responseData.details);
      }
      console.log('========================================\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testEdgeFunction();
