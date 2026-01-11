import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { request } from 'undici';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables from multiple locations (later sources don't override)
// Priority: process.env > worker/.env > repo/.env > supabase/.env
const envPaths = [
  path.join(__dirname, '..', '.env'),                    // services/perplexity-worker/.env
  path.join(__dirname, '..', '..', '..', '.env'),        // repo root .env
  path.join(__dirname, '..', '..', '..', 'supabase', '.env'), // supabase/.env
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

// Environment configuration
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY || '';
const PERPLEXITY_MODEL = process.env.PERPLEXITY_MODEL || 'llama-3.1-sonar-large-128k-online';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '1500', 10);
const MAX_ATTEMPTS = parseInt(process.env.MAX_ATTEMPTS || '3', 10);

// Validate required env vars
const errors: string[] = [];

if (!SUPABASE_URL) {
  errors.push('  - SUPABASE_URL: Required');
}

if (!SUPABASE_SERVICE_ROLE_KEY || SUPABASE_SERVICE_ROLE_KEY === 'your-service-role-key-here') {
  errors.push('  - SUPABASE_SERVICE_ROLE_KEY: Missing or placeholder');
  errors.push('    Get it from: Supabase Dashboard → Settings → API → service_role');
  errors.push('    Set via: export SUPABASE_SERVICE_ROLE_KEY=<key> OR add to repo .env');
}

if (!PERPLEXITY_API_KEY || PERPLEXITY_API_KEY === 'your-perplexity-api-key-here') {
  errors.push('  - PERPLEXITY_API_KEY: Missing or placeholder');
  errors.push('    Get it from: https://www.perplexity.ai/settings/api');
  errors.push('    Set via: export PERPLEXITY_API_KEY=<key> OR add to repo .env');
}

if (errors.length > 0) {
  console.error('❌ Missing or invalid required environment variables:\n');
  errors.forEach(err => console.error(err));
  console.error('\nEither export the variables or add them to a .env file in:');
  console.error('  - services/perplexity-worker/.env');
  console.error('  - repo root .env (~/bunkd/.env)');
  console.error('  - supabase/.env');
  process.exit(1);
}

// Log safe prefixes (never full keys)
console.log('✅ Environment loaded:');
console.log(`  SUPABASE_URL: ${SUPABASE_URL}`);
console.log(`  SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY.substring(0, 6)}...`);
console.log(`  PERPLEXITY_API_KEY: ${PERPLEXITY_API_KEY.substring(0, 4)}...`);
console.log(`  PERPLEXITY_MODEL: ${PERPLEXITY_MODEL}`);
console.log('');

// Types
interface Job {
  id: string;
  input_type: string;
  input_value: string;
  normalized_input: string;
  cache_key: string;
  attempts: number;
  request_id: string;
}

interface PerplexityResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  citations?: string[];
}

// Initialize Supabase client
const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Sleep utility
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Build prompt for Perplexity
function buildPrompt(inputType: string, normalizedInput: string): string {
  const systemPrompt = `You are a fact-checking assistant. Analyze the given content and provide:
1. A Bunkd Score (0-10 scale where 0 is completely false/misleading, 10 is completely factual)
2. Key factual claims identified
3. Evidence and reasoning for your assessment
4. Any red flags or concerns

Respond in JSON format with this structure:
{
  "bunkd_score": <number 0-10>,
  "summary": "<brief summary>",
  "factual_claims": [{"claim": "...", "verified": true/false, "confidence": 0-1}],
  "bias_indicators": ["indicator1", "indicator2"],
  "reasoning": "<explanation of score>"
}`;

  let userMessage: string;
  if (inputType === 'url') {
    userMessage = `Analyze the content at this URL: ${normalizedInput}`;
  } else if (inputType === 'text') {
    userMessage = `Analyze this text: ${normalizedInput}`;
  } else if (inputType === 'image') {
    userMessage = `[Image analysis not yet implemented] URL: ${normalizedInput}`;
  } else {
    userMessage = normalizedInput;
  }

  return `${systemPrompt}\n\n${userMessage}`;
}

// Call Perplexity API with retries
async function callPerplexity(prompt: string, attempt: number = 1): Promise<{ response: PerplexityResponse, latencyMs: number }> {
  const startTime = Date.now();
  const maxRetries = 2;

  for (let retry = 0; retry <= maxRetries; retry++) {
    try {
      const { statusCode, body } = await request('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: PERPLEXITY_MODEL,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.2,
          max_tokens: 1500,
        }),
        headersTimeout: 30000,
        bodyTimeout: 30000,
      });

      const responseText = await body.text();

      if (statusCode !== 200) {
        throw new Error(`Perplexity API returned ${statusCode}: ${responseText.slice(0, 200)}`);
      }

      const response: PerplexityResponse = JSON.parse(responseText);
      const latencyMs = Date.now() - startTime;

      return { response, latencyMs };

    } catch (error: any) {
      const isLastRetry = retry === maxRetries;

      if (isLastRetry) {
        throw error;
      }

      console.warn(`  ⚠️  Perplexity call failed (retry ${retry + 1}/${maxRetries}):`, error.message);
      await sleep(1000 * (retry + 1)); // Exponential backoff
    }
  }

  throw new Error('Perplexity retries exhausted');
}

// Parse and extract Bunkd Score from response
function extractBunkdScore(content: string): { score: number; resultJson: any } {
  try {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : content;

    const parsed = JSON.parse(jsonText);

    // Extract bunkd_score (validate it's 0-10)
    let score = parsed.bunkd_score || parsed.score || 5.0;
    score = Math.max(0, Math.min(10, parseFloat(score)));

    return {
      score: Math.round(score * 10) / 10, // Round to 1 decimal
      resultJson: parsed,
    };
  } catch (error) {
    console.error('  Failed to parse Perplexity response as JSON:', error);

    // Fallback: simple keyword-based scoring
    const lower = content.toLowerCase();
    let score = 5.0; // Default neutral

    if (lower.includes('false') || lower.includes('misleading') || lower.includes('unverified')) {
      score -= 2.0;
    }
    if (lower.includes('true') || lower.includes('verified') || lower.includes('accurate')) {
      score += 2.0;
    }
    if (lower.includes('partially') || lower.includes('some truth')) {
      score = 5.0;
    }

    score = Math.max(0, Math.min(10, score));

    return {
      score: Math.round(score * 10) / 10,
      resultJson: {
        summary: content.slice(0, 500),
        bunkd_score: score,
        factual_claims: [],
        bias_indicators: [],
        reasoning: 'Fallback scoring due to parse error',
      },
    };
  }
}

// Process a single job
async function processJob(job: Job): Promise<void> {
  console.log(`[${job.id.substring(0, 8)}] Processing job (attempt ${job.attempts})`);
  console.log(`  Input type: ${job.input_type}`);
  console.log(`  Input length: ${job.normalized_input.length}`);

  try {
    // Build prompt
    const prompt = buildPrompt(job.input_type, job.normalized_input);

    // Call Perplexity
    console.log(`  Calling Perplexity (model: ${PERPLEXITY_MODEL})...`);
    const { response, latencyMs } = await callPerplexity(prompt, job.attempts);

    console.log(`  ✓ Perplexity responded in ${latencyMs}ms`);

    // Extract content
    const content = response.choices[0]?.message?.content || '';
    if (!content) {
      throw new Error('Empty response from Perplexity');
    }

    // Parse and score
    const { score, resultJson } = extractBunkdScore(content);
    console.log(`  ✓ Bunkd Score: ${score}`);

    // Update job to done
    const { error: updateError } = await supabase
      .from('analysis_jobs')
      .update({
        status: 'done',
        bs_score: score,
        result_json: resultJson,
        model_used: response.model,
        perplexity_latency_ms: latencyMs,
      })
      .eq('id', job.id);

    if (updateError) {
      console.error(`  ❌ Failed to update job:`, updateError);
      throw updateError;
    }

    console.log(`  ✓ Job completed successfully`);

  } catch (error: any) {
    console.error(`  ❌ Job failed:`, error.message);

    // Determine if should retry
    const shouldRetry = job.attempts < MAX_ATTEMPTS;
    const newStatus = shouldRetry ? 'queued' : 'failed';

    console.log(`  Setting status to: ${newStatus} (attempts: ${job.attempts}/${MAX_ATTEMPTS})`);

    const { error: updateError } = await supabase
      .from('analysis_jobs')
      .update({
        status: newStatus,
        last_error_code: error.code || 'UNKNOWN',
        last_error_message: error.message || String(error),
      })
      .eq('id', job.id);

    if (updateError) {
      console.error(`  ❌ Failed to update job status:`, updateError);
    }
  }
}

// Main poll loop
async function pollLoop(): Promise<void> {
  console.log('🚀 Perplexity Worker started');
  console.log(`   Model: ${PERPLEXITY_MODEL}`);
  console.log(`   Poll interval: ${POLL_INTERVAL_MS}ms`);
  console.log(`   Max attempts: ${MAX_ATTEMPTS}`);
  console.log('');

  while (true) {
    try {
      // Claim next job
      const { data, error } = await supabase.rpc('claim_next_job', {
        p_max_attempts: MAX_ATTEMPTS,
      });

      if (error) {
        console.error('Failed to claim job:', error);
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      // If no job, sleep and continue
      if (!data || data.length === 0) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      const job: Job = Array.isArray(data) ? data[0] : data;

      // Process the job
      await processJob(job);

      // Small delay before next poll
      await sleep(500);

    } catch (error) {
      console.error('Poll loop error:', error);
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

// Start worker
pollLoop().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
