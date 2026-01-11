#!/usr/bin/env node
/**
 * Job Processing Script
 *
 * This script triggers the run_job edge function to process queued analysis jobs.
 * Can be run as a cron job from any environment (local, CI/CD, serverless cron service).
 *
 * Usage:
 *   node scripts/process-jobs.js
 *
 * Environment Variables Required:
 *   SUPABASE_URL - Your Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key (NOT anon key)
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qmhqfmkbvyeabftpchex.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

async function processJobs() {
  const url = `${SUPABASE_URL}/functions/v1/run_job`;

  console.log(`[${new Date().toISOString()}] Triggering job processing...`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({})
    });

    const data = await response.json();

    if (response.ok) {
      if (data.message === 'No jobs available') {
        console.log(`[${new Date().toISOString()}] No jobs in queue`);
      } else if (data.success) {
        console.log(`[${new Date().toISOString()}] ✅ Processed job: ${data.job_id}`);
      } else {
        console.log(`[${new Date().toISOString()}] ⚠️  Job failed: ${data.job_id} - ${data.error}`);
      }
    } else {
      console.error(`[${new Date().toISOString()}] ❌ HTTP ${response.status}:`, data);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error:`, error.message);
  }
}

// Run immediately
processJobs();
