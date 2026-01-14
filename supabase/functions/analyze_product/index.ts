import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Generate unique request ID for tracking
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Normalize input for consistent caching
function normalizeInput(type: string, value: string): string {
  const trimmed = value.trim();

  if (type === 'url') {
    try {
      const url = new URL(trimmed);
      // Lowercase host, remove hash, normalize trailing slash
      url.hostname = url.hostname.toLowerCase();
      url.hash = '';
      let normalized = url.toString();
      // Remove trailing slash unless it's just the domain
      if (normalized.endsWith('/') && url.pathname !== '/') {
        normalized = normalized.slice(0, -1);
      }
      return normalized;
    } catch {
      return trimmed.toLowerCase();
    }
  }

  return trimmed;
}

// Compute cache key
async function computeCacheKey(inputType: string, normalizedInput: string): Promise<string> {
  const text = `${inputType}:${normalizedInput}:v1`;
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const requestId = generateRequestId();
  const startTime = Date.now();

  console.log(`[${requestId}] ========== ANALYZE_PRODUCT INGRESS ==========`);

  try {
    // Parse input
    let body: any;
    try {
      body = await req.json();
    } catch (parseError) {
      return new Response(
        JSON.stringify({
          error: "Invalid JSON",
          request_id: requestId,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Extract input (support multiple naming conventions)
    const url = body.url;
    const text = body.text || body.content;
    const imageUrl = body.image_url || body.imageUrl;
    const forceRefresh = body.force_refresh === true;

    // Determine input type and value
    let inputType: string;
    let inputValue: string;

    if (url) {
      inputType = 'url';
      inputValue = url;
    } else if (text) {
      inputType = 'text';
      inputValue = text;
    } else if (imageUrl) {
      inputType = 'image';
      inputValue = imageUrl;
    } else {
      return new Response(
        JSON.stringify({
          error: "Invalid input",
          details: "Provide one of: url, text, or image_url",
          request_id: requestId,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`[${requestId}] Input type: ${inputType}, length: ${inputValue.length}`);

    // Normalize input
    const normalizedInput = normalizeInput(inputType, inputValue);

    // Compute cache key (add timestamp suffix if force_refresh to ensure new job)
    let cacheKey = await computeCacheKey(inputType, normalizedInput);
    if (forceRefresh) {
      cacheKey = `${cacheKey}_${Date.now()}`;
    }
    console.log(`[${requestId}] Cache key: ${cacheKey.substring(0, 16)}...${forceRefresh ? ' (force refresh)' : ''}`);

    // Create Supabase client with service role (no JWT required)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check cache for existing completed job (skip if force_refresh)
    if (!forceRefresh) {
      const { data: cachedJob, error: cacheError } = await supabase
        .from("analysis_jobs")
        .select("id, job_token, bs_score, result_json, updated_at")
        .eq("cache_key", cacheKey)
        .eq("status", "done")
        .not("result_json", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cacheError) {
        console.error(`[${requestId}] Cache lookup error:`, cacheError);
        // Continue to enqueue
      }

      if (cachedJob && cachedJob.result_json) {
        console.log(`[${requestId}] ✓ Cache hit - job ${cachedJob.id}`);
        const elapsed = Date.now() - startTime;

        return new Response(
          JSON.stringify({
            status: "cached",
            job_id: cachedJob.id,
            job_token: cachedJob.job_token,
            bs_score: cachedJob.bs_score,
            result_json: cachedJob.result_json,
            updated_at: cachedJob.updated_at,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-Response-Time-Ms": elapsed.toString(),
            }
          }
        );
      }
    }

    console.log(`[${requestId}] ${forceRefresh ? 'Force refresh' : 'Cache miss'} - enqueuing new job`);

    // Enqueue new job
    const { data: newJob, error: insertError } = await supabase
      .from("analysis_jobs")
      .insert({
        status: "queued",
        input_type: inputType,
        input_value: inputValue,
        normalized_input: normalizedInput,
        cache_key: cacheKey,
        attempts: 0,
        request_id: requestId,
      })
      .select("id, job_token")
      .single();

    if (insertError) {
      // Check if this is a unique constraint violation on cache_key
      const isDuplicate =
        insertError.code === '23505' ||
        (insertError.message && (
          insertError.message.includes('duplicate key value') ||
          insertError.message.includes('idx_analysis_jobs_cache_key')
        ));

      if (isDuplicate) {
        console.log(`[${requestId}] Duplicate cache_key detected - fetching existing job`);

        // Query for existing job
        const { data: existingJob, error: queryError } = await supabase
          .from("analysis_jobs")
          .select("id, status, job_token, updated_at")
          .eq("cache_key", cacheKey)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (queryError || !existingJob) {
          console.error(`[${requestId}] Failed to fetch existing job:`, queryError);
          return new Response(
            JSON.stringify({
              error: "Failed to fetch existing job",
              details: queryError?.message || "Job not found",
              request_id: requestId,
            }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }

        // If existing job is 'failed', reset it to 'queued' for retry
        let finalStatus = existingJob.status;
        if (existingJob.status === 'failed') {
          console.log(`[${requestId}] Existing job is failed - resetting to queued for retry`);
          const { error: resetError } = await supabase
            .from("analysis_jobs")
            .update({
              status: 'queued',
              attempts: 0,
              last_error_code: null,
              last_error_message: null,
            })
            .eq("id", existingJob.id);

          if (resetError) {
            console.error(`[${requestId}] Failed to reset job:`, resetError);
            // Continue anyway - return failed status
          } else {
            finalStatus = 'queued';
          }
        }

        // If job_token is missing, generate and update
        let jobToken = existingJob.job_token;
        if (!jobToken) {
          console.log(`[${requestId}] Existing job missing job_token - generating one`);
          jobToken = crypto.randomUUID();

          const { error: updateError } = await supabase
            .from("analysis_jobs")
            .update({ job_token: jobToken })
            .eq("id", existingJob.id);

          if (updateError) {
            console.error(`[${requestId}] Failed to update job_token:`, updateError);
            // Continue anyway - better to return without token than fail
          }
        }

        console.log(`[${requestId}] ✓ Returning existing job ${existingJob.id} (status: ${finalStatus})`);
        const elapsed = Date.now() - startTime;

        return new Response(
          JSON.stringify({
            status: finalStatus,
            job_id: existingJob.id,
            job_token: jobToken,
          }),
          {
            status: 202,
            headers: {
              "Content-Type": "application/json",
              "X-Response-Time-Ms": elapsed.toString(),
            }
          }
        );
      }

      // Not a duplicate - genuine error
      console.error(`[${requestId}] Failed to enqueue:`, insertError);
      return new Response(
        JSON.stringify({
          error: "Failed to create job",
          details: insertError.message,
          request_id: requestId,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`[${requestId}] ✓ Enqueued job ${newJob.id}`);
    const elapsed = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        status: "queued",
        job_id: newJob.id,
        job_token: newJob.job_token,
      }),
      {
        status: 202,
        headers: {
          "Content-Type": "application/json",
          "X-Response-Time-Ms": elapsed.toString(),
        }
      }
    );

  } catch (error) {
    console.error(`[${requestId}] ERROR:`, error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        request_id: requestId,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
