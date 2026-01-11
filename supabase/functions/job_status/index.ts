import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

Deno.serve(async (req) => {
  try {
    // Parse query params
    const url = new URL(req.url);
    const jobId = url.searchParams.get("job_id");
    const jobToken = url.searchParams.get("job_token");

    if (!jobId || !jobToken) {
      return new Response(
        JSON.stringify({
          error: "Missing required parameters",
          details: "Both job_id and job_token are required",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`[job_status] Checking job ${jobId.substring(0, 8)}...`);

    // Create Supabase client with service role (no JWT required)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch job by ID
    const { data: job, error: jobError } = await supabase
      .from("analysis_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      console.error(`[job_status] Job not found:`, jobError);
      return new Response(
        JSON.stringify({
          error: "Job not found",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify job_token matches
    if (job.job_token !== jobToken) {
      console.warn(`[job_status] Token mismatch for job ${jobId}`);
      return new Response(
        JSON.stringify({
          error: "Invalid job_token",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`[job_status] Job ${jobId.substring(0, 8)}... status: ${job.status}`);

    // Build response
    const response: any = {
      status: job.status,
      job_id: job.id,
      updated_at: job.updated_at,
    };

    // Include results if done
    if (job.status === 'done' && job.result_json) {
      response.bs_score = job.bs_score;
      response.result_json = job.result_json;
    }

    // Include error if failed
    if (job.status === 'failed') {
      response.last_error_code = job.last_error_code;
      response.last_error_message = job.last_error_message;
    }

    // Include metadata
    if (job.attempts) {
      response.attempts = job.attempts;
    }
    if (job.model_used) {
      response.model_used = job.model_used;
    }
    if (job.perplexity_latency_ms) {
      response.perplexity_latency_ms = job.perplexity_latency_ms;
    }

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[job_status] ERROR:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
