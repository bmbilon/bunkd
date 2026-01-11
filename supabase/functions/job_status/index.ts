import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

Deno.serve(async (req) => {
  try {
    // Get job_id from URL query params
    const url = new URL(req.url);
    const jobId = url.searchParams.get("job_id");

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: "Missing job_id parameter" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
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

    // Verify user is authenticated
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch job details
    const { data: job, error: jobError } = await supabase
      .from("analysis_jobs")
      .select("id, status, error_message, created_at, completed_at")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const response: any = {
      job_id: job.id,
      status: job.status,
      created_at: job.created_at,
    };

    // If job is completed, fetch the result
    if (job.status === "completed") {
      const { data: result, error: resultError } = await supabase
        .from("analysis_results")
        .select("result_data, created_at")
        .eq("job_id", jobId)
        .single();

      if (resultError || !result) {
        // Job is marked complete but no result found
        response.error = "Result not found";
      } else {
        response.result = result.result_data;
        response.result_created_at = result.created_at;
      }

      response.completed_at = job.completed_at;
    }

    // If job failed, include error message
    if (job.status === "failed") {
      response.error_message = job.error_message;
      response.completed_at = job.completed_at;
    }

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in job_status:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
