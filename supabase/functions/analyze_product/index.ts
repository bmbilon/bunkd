import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { AnalyzeInputSchema, createFingerprint } from "../_shared/validate.ts";
import { getActiveRubric } from "../_shared/rubric.ts";

// Generate unique request ID for tracking
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

Deno.serve(async (req) => {
  const requestId = generateRequestId();
  const startTime = Date.now();

  console.log(`[${requestId}] ========== NEW REQUEST ==========`);
  console.log(`[${requestId}] Method: ${req.method}`);
  console.log(`[${requestId}] URL: ${req.url}`);

  try {
    // Parse and validate input
    let body: any;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error(`[${requestId}] Failed to parse JSON body:`, parseError);
      return new Response(
        JSON.stringify({
          error: "Invalid JSON in request body",
          details: parseError instanceof Error ? parseError.message : String(parseError),
          where: "analyze_product",
          request_id: requestId,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`[${requestId}] Request body:`, JSON.stringify(body, null, 2));

    // Normalize input keys (support both naming conventions)
    const normalizedBody = {
      url: body.url,
      text: body.text || body.content,
      image_url: body.image_url || body.imageUrl,
    };

    // Determine input type for logging
    let inputType = "unknown";
    let contentLength = 0;
    if (normalizedBody.url) {
      inputType = "url";
      contentLength = normalizedBody.url.length;
    } else if (normalizedBody.text) {
      inputType = "text";
      contentLength = normalizedBody.text.length;
    } else if (normalizedBody.image_url) {
      inputType = "image";
      contentLength = normalizedBody.image_url.length;
    }

    console.log(`[${requestId}] Input type: ${inputType}, content length: ${contentLength}`);

    // Validate input
    let input;
    try {
      input = AnalyzeInputSchema.parse(normalizedBody);
      console.log(`[${requestId}] Input validation passed`);
    } catch (validationError) {
      console.error(`[${requestId}] Input validation failed:`, validationError);
      return new Response(
        JSON.stringify({
          error: "Invalid input",
          details: validationError instanceof Error ? validationError.message : String(validationError),
          hint: "Provide at least one of: url, text, or image_url",
          where: "analyze_product",
          input_type: inputType,
          request_id: requestId,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get auth header
    const authHeader = req.headers.get("Authorization");
    const hasAuth = !!authHeader;
    console.log(`[${requestId}] Auth present: ${hasAuth}`);

    if (!authHeader) {
      console.error(`[${requestId}] Missing authorization header`);
      return new Response(
        JSON.stringify({
          error: "Missing authorization header",
          details: "Authentication is required to use this function",
          hint: "Ensure you are signed in (anonymous auth is supported)",
          where: "analyze_product",
          input_type: inputType,
          request_id: requestId,
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with user's auth
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Get current user (works with anonymous auth)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error(`[${requestId}] Auth failed:`, userError);
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          details: userError?.message || "Failed to authenticate user",
          hint: "Your session may have expired. Try signing in again.",
          where: "analyze_product",
          input_type: inputType,
          request_id: requestId,
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;
    console.log(`[${requestId}] User authenticated: ${userId}`);

    // Get active rubric
    const rubric = await getActiveRubric();
    console.log(`[${requestId}] Using rubric version: ${rubric.version}`);

    // Create fingerprint for caching
    const fingerprint = await createFingerprint(input, rubric.version);
    console.log(`[${requestId}] Generated fingerprint: ${fingerprint.substring(0, 16)}...`);

    // Check for cached result
    const { data: cachedResult, error: cacheError } = await supabase
      .from("analysis_results")
      .select("id, result_data, created_at, expires_at")
      .eq("fingerprint", fingerprint)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (cacheError && cacheError.code !== "PGRST116") {
      // PGRST116 is "no rows returned", which is expected
      console.warn(`[${requestId}] Cache lookup error:`, cacheError);
    }

    if (cachedResult) {
      console.log(`[${requestId}] ✓ Cache hit! Returning cached result`);
      const elapsed = Date.now() - startTime;
      console.log(`[${requestId}] Request completed in ${elapsed}ms`);

      return new Response(
        JSON.stringify({
          status: "completed",
          cached: true,
          result: cachedResult.result_data,
          created_at: cachedResult.created_at,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`[${requestId}] Cache miss - checking for existing job`);

    // Check for existing queued or processing job
    const { data: existingJob, error: jobLookupError } = await supabase
      .from("analysis_jobs")
      .select("id, status")
      .eq("fingerprint", fingerprint)
      .in("status", ["queued", "processing"])
      .single();

    if (jobLookupError && jobLookupError.code !== "PGRST116") {
      console.warn(`[${requestId}] Job lookup error:`, jobLookupError);
    }

    if (existingJob) {
      console.log(`[${requestId}] ✓ Found existing job: ${existingJob.id} (${existingJob.status})`);
      const elapsed = Date.now() - startTime;
      console.log(`[${requestId}] Request completed in ${elapsed}ms`);

      return new Response(
        JSON.stringify({
          status: existingJob.status,
          job_id: existingJob.id,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`[${requestId}] Creating new analysis job`);

    // Create new job
    const { data: newJob, error: jobError } = await supabase
      .from("analysis_jobs")
      .insert({
        user_id: userId,
        fingerprint,
        input_data: input,
        rubric_version: rubric.version,
        status: "queued",
      })
      .select("id")
      .single();

    if (jobError) {
      console.error(`[${requestId}] Failed to create job:`, jobError);
      return new Response(
        JSON.stringify({
          error: "Failed to create analysis job",
          details: jobError.message,
          hint: jobError.hint || "Check database permissions and RLS policies",
          where: "analyze_product",
          input_type: inputType,
          request_id: requestId,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`[${requestId}] ✓ Created job: ${newJob.id}`);

    // Optionally log input to product_inputs table
    let inputTypeForLog: "url" | "text" | "image" = "text";
    let inputValue = "";

    if (input.url) {
      inputTypeForLog = "url";
      inputValue = input.url;
    } else if (input.image_url) {
      inputTypeForLog = "image";
      inputValue = input.image_url;
    } else if (input.text) {
      inputTypeForLog = "text";
      inputValue = input.text;
    }

    const { error: inputLogError } = await supabase.from("product_inputs").insert({
      user_id: userId,
      input_type: inputTypeForLog,
      input_value: inputValue,
      job_id: newJob.id,
    });

    if (inputLogError) {
      console.warn(`[${requestId}] Failed to log input:`, inputLogError);
      // Don't fail the request if input logging fails
    } else {
      console.log(`[${requestId}] ✓ Logged input to product_inputs`);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[${requestId}] Request completed in ${elapsed}ms`);

    return new Response(
      JSON.stringify({
        status: "queued",
        job_id: newJob.id,
      }),
      { status: 202, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error(`[${requestId}] ========== ERROR ==========`);
    console.error(`[${requestId}] Error type:`, error?.constructor?.name);
    console.error(`[${requestId}] Error message:`, error instanceof Error ? error.message : String(error));
    console.error(`[${requestId}] Error stack:`, error instanceof Error ? error.stack : "N/A");

    const elapsed = Date.now() - startTime;
    console.log(`[${requestId}] Request failed after ${elapsed}ms`);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
        details: error instanceof Error ? error.stack : String(error),
        where: "analyze_product",
        request_id: requestId,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
