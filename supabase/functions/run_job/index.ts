import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { AnalysisResultSchema, type AnalyzeInput } from "../_shared/validate.ts";
import { getActiveRubric, buildSystemPrompt } from "../_shared/rubric.ts";
import { fetchPageText } from "../_shared/fetch_page_text.ts";
import { PerplexityProvider } from "../_shared/providers/perplexity.ts";

Deno.serve(async (_req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Pick next queued job using FOR UPDATE SKIP LOCKED pattern
    // Note: Supabase JS client doesn't directly support FOR UPDATE SKIP LOCKED
    // We'll use a direct SQL query via RPC for proper job locking
    const { data: jobs, error: fetchError } = await supabase
      .rpc('acquire_next_job')
      .single();

    if (fetchError) {
      // If no jobs available, that's OK
      if (fetchError.code === 'PGRST116') {
        return new Response(
          JSON.stringify({ message: "No jobs available" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw fetchError;
    }

    const job = jobs;
    console.log(`Processing job ${job.id}`);

    // Update job status to processing
    await supabase
      .from("analysis_jobs")
      .update({
        status: "processing",
        started_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    try {
      // Get input data
      const input: AnalyzeInput = job.input_data;

      // Build content to analyze
      let contentToAnalyze = "";

      if (input.url) {
        console.log(`Fetching page text from ${input.url}`);
        contentToAnalyze = await fetchPageText(input.url);
      } else if (input.text) {
        contentToAnalyze = input.text;
      } else if (input.image_url) {
        // For MVP, we'll treat image_url as a placeholder
        // In future, integrate vision API
        contentToAnalyze = `[Image URL: ${input.image_url}]\nNote: Image analysis not yet implemented.`;
      }

      // Get active rubric
      const rubric = await getActiveRubric();
      const systemPrompt = buildSystemPrompt(rubric.rubric_text);

      // Prepare user message
      const userMessage = `Please analyze the following product information:\n\n${contentToAnalyze}`;

      // Get provider configuration
      const providerName = Deno.env.get("PROVIDER") || "perplexity";
      const apiKey = Deno.env.get("PPLX_API_KEY");

      if (!apiKey) {
        throw new Error("PPLX_API_KEY not configured");
      }

      // Call provider
      let responseText: string;

      if (providerName === "perplexity") {
        const provider = new PerplexityProvider(apiKey);
        responseText = await provider.analyze(systemPrompt, userMessage);
      } else {
        throw new Error(`Unsupported provider: ${providerName}`);
      }

      console.log("Raw response:", responseText);

      // Parse and validate JSON response
      let resultData;
      try {
        // Try to extract JSON from markdown code blocks if present
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
        const jsonText = jsonMatch ? jsonMatch[1] : responseText;

        const parsed = JSON.parse(jsonText);
        resultData = AnalysisResultSchema.parse(parsed);
      } catch (parseError) {
        console.error("Failed to parse/validate response:", parseError);
        throw new Error(`Invalid response format: ${parseError.message}`);
      }

      // Calculate expiration (30 days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      // Write result
      const { data: insertedResult, error: resultError } = await supabase
        .from("analysis_results")
        .insert({
          job_id: job.id,
          fingerprint: job.fingerprint,
          result_data: resultData,
          rubric_version: rubric.version,
          expires_at: expiresAt.toISOString(),
        })
        .select("id")
        .single();

      if (resultError) {
        throw new Error(`Failed to insert result: ${resultError.message}`);
      }

      // Write sources if present
      if (resultData.sources && resultData.sources.length > 0) {
        const sourcesToInsert = resultData.sources.map((source, index) => ({
          result_id: insertedResult.id,
          source_url: source.url || null,
          source_title: source.title || null,
          source_snippet: source.snippet || null,
          source_order: index,
        }));

        const { error: sourcesError } = await supabase
          .from("analysis_sources")
          .insert(sourcesToInsert);

        if (sourcesError) {
          console.error("Failed to insert sources:", sourcesError);
          // Don't fail the job if sources fail to insert
        }
      }

      // Mark job as completed
      await supabase
        .from("analysis_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      console.log(`Job ${job.id} completed successfully`);

      return new Response(
        JSON.stringify({
          success: true,
          job_id: job.id,
          result_id: insertedResult.id,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (processingError) {
      // Mark job as failed
      console.error(`Job ${job.id} failed:`, processingError);

      await supabase
        .from("analysis_jobs")
        .update({
          status: "failed",
          error_message: processingError.message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      return new Response(
        JSON.stringify({
          success: false,
          job_id: job.id,
          error: processingError.message,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("Error in run_job:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
