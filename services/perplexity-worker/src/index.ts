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

interface BunkdAnalysisResult {
  version: "bunkd_v1";
  bunk_score: number;
  confidence: number;
  verdict: "low" | "elevated" | "high";
  summary: string;
  evidence_bullets: string[];
  key_claims: Array<{
    claim: string;
    support_level: "supported" | "mixed" | "weak" | "unsupported";
    why: string;
  }>;
  red_flags: string[];
  subscores: {
    human_evidence: number;
    authenticity_transparency: number;
    marketing_overclaim: number;
    pricing_value: number;
  };
  citations: Array<{ title: string; url: string }>;
}

// Initialize Supabase client
const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Sleep utility
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Round to nearest 0.5
function roundToHalf(num: number): number {
  return Math.round(num * 2) / 2;
}

// Compute deterministic bunk_score from subscores
function computeBunkScore(subscores: {
  human_evidence: number;
  authenticity_transparency: number;
  marketing_overclaim: number;
  pricing_value: number;
}): number {
  return roundToHalf(
    0.4 * subscores.human_evidence +
    0.25 * subscores.authenticity_transparency +
    0.25 * subscores.marketing_overclaim +
    0.10 * subscores.pricing_value
  );
}

// Compute verdict from bunk_score
function verdictFromScore(score: number): "low" | "elevated" | "high" {
  if (score <= 3.5) return "low";
  if (score <= 6.5) return "elevated";
  return "high";
}

// Build Perplexity request body with strict JSON schema
export function buildPerplexityRequestBody(input: {
  input_type: "url" | "text" | "image";
  input_value: string;
  normalized_input?: string;
  cache_key?: string;
}): object {
  const normalizedInput = input.normalized_input || input.input_value;

  const systemMessage = `You are a product analysis research engine for Bunkd. Output a plain-text report using the exact format below.

REQUIRED OUTPUT FORMAT:

BUNKD_V1
SUMMARY:
<1-3 sentences on one line>
EVIDENCE_BULLETS:
- <bullet 1>
- <bullet 2>
- <bullet 3>
- <bullet 4>
- <bullet 5>
SUBSCORES:
human_evidence=<number 0-10>
authenticity_transparency=<number 0-10>
marketing_overclaim=<number 0-10>
pricing_value=<number 0-10>
KEY_CLAIMS:
- <claim> | <supported|mixed|weak|unsupported> | <why>
- <claim> | <supported|mixed|weak|unsupported> | <why>
- <claim> | <supported|mixed|weak|unsupported> | <why>
RED_FLAGS:
- <flag 1>
- <flag 2>
- <flag 3>
CITATIONS:
- <title> | <url>
- <title> | <url>
- <title> | <url>
- <title> | <url>

SCORING RUBRIC (higher = more bunk):
- human_evidence (0-10): 0 = strong RCTs/studies; 10 = no human evidence
- authenticity_transparency (0-10): 0 = COA/third-party tested; 10 = no transparency
- marketing_overclaim (0-10): 0 = claims match evidence; 10 = claims far exceed evidence
- pricing_value (0-10): 0 = fair value; 10 = predatory pricing

RULES:
- Output MUST contain ALL section headers exactly once
- Provide 5-10 evidence bullets
- Provide 3-8 key claims
- Provide 3-8 red flags
- Provide at least 4 citations
- ALL subscores must use 0.5 increments (e.g., 7.5, 8.0, 8.5)
- No JSON. No markdown fences. No extra preamble.
- Start output with BUNKD_V1 on first line`;

  let userMessage: string;
  if (input.input_type === 'url') {
    userMessage = `Analyze this product page URL: ${normalizedInput}`;
  } else if (input.input_type === 'text') {
    userMessage = `Analyze these claims: ${normalizedInput}`;
  } else if (input.input_type === 'image') {
    userMessage = `[Image analysis not yet implemented] URL: ${normalizedInput}`;
  } else {
    userMessage = normalizedInput;
  }

  return {
    model: "sonar-pro",
    messages: [
      {
        role: "system",
        content: systemMessage,
      },
      {
        role: "user",
        content: userMessage,
      },
    ],
    temperature: 0.1,
    max_tokens: 700,
  };
}

// Removed old validateAnalysisResult - now using parseBunkdReport for text-based parsing

// Call Perplexity API with request body
async function callPerplexity(requestBody: object): Promise<{ response: PerplexityResponse, latencyMs: number }> {
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
        body: JSON.stringify(requestBody),
        headersTimeout: 60000,
        bodyTimeout: 60000,
      });

      const responseText = await body.text();

      if (statusCode !== 200) {
        throw new Error(`Perplexity API returned ${statusCode}: ${responseText.slice(0, 200)}`);
      }

      const response: PerplexityResponse = JSON.parse(responseText);
      const latencyMs = Date.now() - startTime;

      return { response, latencyMs };

    } catch (error: any) {
      const isTimeoutError = error.message?.includes('Timeout') ||
                            error.message?.includes('timeout') ||
                            error.name === 'AbortError' ||
                            error.code === 'UND_ERR_HEADERS_TIMEOUT' ||
                            error.code === 'UND_ERR_BODY_TIMEOUT';

      const isLastRetry = retry === maxRetries;

      // Timeout errors are retryable once
      if (isLastRetry && !isTimeoutError) {
        throw error;
      }

      // If timeout on last retry, give it one more chance
      if (isTimeoutError && isLastRetry) {
        console.warn(`  ⚠️  Timeout detected on retry ${retry + 1}/${maxRetries}, retrying once more:`, error.message);
        await sleep(2000);
        continue;
      }

      console.warn(`  ⚠️  Perplexity call failed (retry ${retry + 1}/${maxRetries}):`, error.message);
      await sleep(1000 * (retry + 1)); // Exponential backoff
    }
  }

  throw new Error('Perplexity retries exhausted');
}

// Parse Bunkd report format
function parseBunkdReport(text: string): {
  valid: boolean;
  result?: any;
  errors: string[];
  missingHeaders?: string[];
} {
  const errors: string[] = [];
  const missingHeaders: string[] = [];

  // Required headers
  const requiredHeaders = [
    'BUNKD_V1',
    'SUMMARY:',
    'EVIDENCE_BULLETS:',
    'SUBSCORES:',
    'KEY_CLAIMS:',
    'RED_FLAGS:',
    'CITATIONS:'
  ];

  // Check for all required headers
  for (const header of requiredHeaders) {
    if (!text.includes(header)) {
      missingHeaders.push(header);
    }
  }

  if (missingHeaders.length > 0) {
    return {
      valid: false,
      errors: [`Missing required headers: ${missingHeaders.join(', ')}`],
      missingHeaders
    };
  }

  try {
    // Extract sections
    const lines = text.split('\n').map(l => l.trim());

    // Extract SUMMARY
    const summaryIdx = lines.findIndex(l => l.startsWith('SUMMARY:'));
    const evidenceIdx = lines.findIndex(l => l === 'EVIDENCE_BULLETS:');

    let summary = '';
    if (summaryIdx >= 0) {
      // Check if summary is on the same line as the header
      const summaryLine = lines[summaryIdx];
      if (summaryLine.length > 'SUMMARY:'.length) {
        summary = summaryLine.substring('SUMMARY:'.length).trim();
      }

      // Also capture any following lines until the next header
      if (evidenceIdx > summaryIdx + 1) {
        const extraLines = lines.slice(summaryIdx + 1, evidenceIdx)
          .filter(l => l.length > 0 && !l.endsWith(':'))
          .join(' ')
          .trim();
        if (extraLines) {
          summary = summary ? `${summary} ${extraLines}` : extraLines;
        }
      }
    }

    if (!summary) {
      errors.push('SUMMARY section is empty');
    }

    // Extract EVIDENCE_BULLETS
    const subscoresIdx = lines.findIndex(l => l === 'SUBSCORES:');
    const evidenceBullets = evidenceIdx >= 0 && subscoresIdx > evidenceIdx
      ? lines.slice(evidenceIdx + 1, subscoresIdx)
          .filter(l => l.startsWith('-'))
          .map(l => l.substring(1).trim())
      : [];

    if (evidenceBullets.length < 5 || evidenceBullets.length > 10) {
      errors.push(`EVIDENCE_BULLETS must have 5-10 items (got ${evidenceBullets.length})`);
    }

    // Extract SUBSCORES
    const keyClaimsIdx = lines.findIndex(l => l === 'KEY_CLAIMS:');
    const subscoreLines = subscoresIdx >= 0 && keyClaimsIdx > subscoresIdx
      ? lines.slice(subscoresIdx + 1, keyClaimsIdx)
      : [];

    const subscores: any = {};
    const subscoreNames = ['human_evidence', 'authenticity_transparency', 'marketing_overclaim', 'pricing_value'];

    for (const line of subscoreLines) {
      for (const name of subscoreNames) {
        if (line.startsWith(name + '=')) {
          const value = parseFloat(line.split('=')[1]);
          if (isNaN(value) || value < 0 || value > 10) {
            errors.push(`${name} must be 0-10 (got ${line.split('=')[1]})`);
          } else if ((value * 2) % 1 !== 0) {
            errors.push(`${name} must use 0.5 increments (got ${value})`);
          } else {
            subscores[name] = value;
          }
        }
      }
    }

    if (Object.keys(subscores).length !== 4) {
      errors.push(`SUBSCORES must have all 4 values (got ${Object.keys(subscores).length})`);
    }

    // Extract KEY_CLAIMS
    const redFlagsIdx = lines.findIndex(l => l === 'RED_FLAGS:');
    const keyClaimLines = keyClaimsIdx >= 0 && redFlagsIdx > keyClaimsIdx
      ? lines.slice(keyClaimsIdx + 1, redFlagsIdx)
          .filter(l => l.startsWith('-'))
      : [];

    const keyClaims = keyClaimLines.map(line => {
      const parts = line.substring(1).split('|').map(p => p.trim());
      if (parts.length >= 3) {
        return {
          claim: parts[0],
          support_level: parts[1],
          why: parts[2]
        };
      }
      return null;
    }).filter(c => c !== null);

    if (keyClaims.length < 3 || keyClaims.length > 8) {
      errors.push(`KEY_CLAIMS must have 3-8 items (got ${keyClaims.length})`);
    }

    // Extract RED_FLAGS
    const citationsIdx = lines.findIndex(l => l === 'CITATIONS:');
    const redFlags = redFlagsIdx >= 0 && citationsIdx > redFlagsIdx
      ? lines.slice(redFlagsIdx + 1, citationsIdx)
          .filter(l => l.startsWith('-'))
          .map(l => l.substring(1).trim())
      : [];

    if (redFlags.length < 3 || redFlags.length > 8) {
      errors.push(`RED_FLAGS must have 3-8 items (got ${redFlags.length})`);
    }

    // Extract CITATIONS
    const citationLines = citationsIdx >= 0
      ? lines.slice(citationsIdx + 1)
          .filter(l => l.startsWith('-'))
      : [];

    const citations = citationLines.map(line => {
      const parts = line.substring(1).split('|').map(p => p.trim());
      if (parts.length >= 2) {
        return { title: parts[0], url: parts[1] };
      }
      return null;
    }).filter(c => c !== null);

    // Note: citations can be 0+, but low citation count will reduce confidence
    // This is handled in parseAndValidateResponse

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return {
      valid: true,
      result: {
        version: 'bunkd_v1',
        summary,
        evidence_bullets: evidenceBullets,
        subscores,
        key_claims: keyClaims,
        red_flags: redFlags,
        citations
      },
      errors: []
    };

  } catch (error: any) {
    return {
      valid: false,
      errors: [`Parse error: ${error.message}`]
    };
  }
}

// Parse and validate response content using report format
function parseAndValidateResponse(rawContent: string): {
  valid: boolean;
  result?: BunkdAnalysisResult;
  errors: string[];
  extractedContent?: string;
  missingHeaders?: string[];
} {
  try {
    // Step 1: Try to extract content from envelope if present
    let content = rawContent;
    try {
      const envelope = JSON.parse(rawContent);
      if (envelope.choices && envelope.choices[0]?.message?.content) {
        content = envelope.choices[0].message.content;
      }
    } catch {
      // Not a JSON envelope, use rawContent as-is
      content = rawContent;
    }

    // Step 2: Parse Bunkd report format
    const parseResult = parseBunkdReport(content);

    if (!parseResult.valid) {
      return {
        valid: false,
        errors: parseResult.errors,
        extractedContent: content,
        missingHeaders: parseResult.missingHeaders
      };
    }

    // Step 3: Compute bunk_score and verdict deterministically
    const computedScore = computeBunkScore(parseResult.result.subscores);
    const computedVerdict = verdictFromScore(computedScore);

    // Step 4: Adjust confidence and red_flags based on citation count
    let confidence = 0.7; // Default confidence
    let redFlags = [...parseResult.result.red_flags];

    if (parseResult.result.citations.length < 2) {
      confidence = Math.min(confidence, 0.6);
      redFlags.push('Limited citations returned; treat evidence strength cautiously.');
    }

    // Step 5: Build final result with computed values
    const finalResult: BunkdAnalysisResult = {
      version: 'bunkd_v1',
      bunk_score: computedScore,
      confidence: confidence,
      verdict: computedVerdict,
      summary: parseResult.result.summary,
      evidence_bullets: parseResult.result.evidence_bullets,
      subscores: parseResult.result.subscores,
      key_claims: parseResult.result.key_claims,
      red_flags: redFlags,
      citations: parseResult.result.citations
    };

    return {
      valid: true,
      result: finalResult,
      errors: [],
      extractedContent: content
    };

  } catch (error: any) {
    return {
      valid: false,
      errors: [`Unexpected error: ${error.message}`],
      extractedContent: rawContent.substring(0, 200)
    };
  }
}

// Process a single job with validation and retry
async function processJob(job: Job): Promise<void> {
  console.log(`[${job.id.substring(0, 8)}] Processing job (attempt ${job.attempts})`);
  console.log(`  Input type: ${job.input_type}`);
  console.log(`  Input length: ${job.normalized_input.length}`);

  try {
    // Build request body
    const requestBody = buildPerplexityRequestBody({
      input_type: job.input_type as "url" | "text" | "image",
      input_value: job.input_value,
      normalized_input: job.normalized_input,
      cache_key: job.cache_key,
    });

    // Log first 120 chars of user message to verify it's the target (not schema text)
    const userMsg = (requestBody as any).messages?.find((m: any) => m.role === 'user')?.content || '';
    console.log(`  User message preview: ${userMsg.substring(0, 120)}...`);

    // Call Perplexity (initial attempt)
    console.log(`  Calling Perplexity (model: sonar-pro)...`);
    let { response, latencyMs } = await callPerplexity(requestBody);
    console.log(`  ✓ Perplexity responded in ${latencyMs}ms`);

    // Extract content
    let content = response.choices[0]?.message?.content || '';
    if (!content) {
      throw new Error('Empty response from Perplexity');
    }

    // Parse and validate
    let parseResult = parseAndValidateResponse(content);

    // If validation failed, retry ONCE with replacement message
    if (!parseResult.valid) {
      console.warn(`  ⚠️  Schema validation failed (${parseResult.errors.length} errors):`);
      parseResult.errors.forEach(err => console.warn(`     - ${err}`));

      // Log extracted content and missing headers
      if (parseResult.extractedContent) {
        console.warn(`  Content preview (first 200 chars): ${parseResult.extractedContent.substring(0, 200)}`);
      }
      if (parseResult.missingHeaders && parseResult.missingHeaders.length > 0) {
        console.warn(`  Missing headers: ${parseResult.missingHeaders.join(', ')}`);
      }

      console.log(`  Retrying with strict replacement message...`);

      // Replace the user message entirely (do NOT append)
      const originalMessages = (requestBody as any).messages || [];
      const systemMessage = originalMessages.find((m: any) => m.role === 'system');

      const strictUserMessage = job.input_type === 'url'
        ? `RETRY: Output the exact BUNKD_V1 format with all required headers. No extra text. Analyze this URL: ${job.normalized_input}`
        : `RETRY: Output the exact BUNKD_V1 format with all required headers. No extra text. Analyze these claims: ${job.normalized_input}`;

      const retryBody = {
        ...requestBody,
        messages: [
          systemMessage,
          {
            role: "user",
            content: strictUserMessage,
          },
        ],
      };

      const retryResponse = await callPerplexity(retryBody);
      response = retryResponse.response;
      latencyMs = retryResponse.latencyMs;
      content = response.choices[0]?.message?.content || '';

      console.log(`  ✓ Retry response received in ${latencyMs}ms`);

      // Validate retry response
      parseResult = parseAndValidateResponse(content);

      if (!parseResult.valid) {
        console.error(`  ❌ Retry validation failed (${parseResult.errors.length} errors):`);
        parseResult.errors.forEach(err => console.error(`     - ${err}`));

        // Log extracted content on retry failure
        if (parseResult.extractedContent) {
          console.error(`  Retry content preview (first 200 chars): ${parseResult.extractedContent.substring(0, 200)}`);
        }

        // Mark job as failed (do NOT requeue endlessly)
        const errorMessage = `Schema validation failed after retry: ${parseResult.errors.join('; ')}`;
        await supabase
          .from('analysis_jobs')
          .update({
            status: 'failed',
            last_error_code: 'SCHEMA_VALIDATION_FAILED',
            last_error_message: errorMessage,
          })
          .eq('id', job.id);

        throw new Error(errorMessage);
      }
    }

    const result = parseResult.result!;
    console.log(`  ✓ Subscores received: HE=${result.subscores.human_evidence}, AT=${result.subscores.authenticity_transparency}, MO=${result.subscores.marketing_overclaim}, PV=${result.subscores.pricing_value}`);
    console.log(`  ✓ Computed Bunk Score: ${result.bunk_score} | Verdict: ${result.verdict}`);

    // Update job to done
    const { error: updateError } = await supabase
      .from('analysis_jobs')
      .update({
        status: 'done',
        bs_score: result.bunk_score,
        result_json: result,
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

    // Check if job was already marked as failed (e.g., by schema validation)
    const { data: currentJob } = await supabase
      .from('analysis_jobs')
      .select('status')
      .eq('id', job.id)
      .single();

    if (currentJob?.status === 'failed') {
      console.log(`  Job already marked as failed, skipping update`);
      return;
    }

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
  console.log(`   Model: sonar-pro (strict JSON mode)`);
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
