import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export async function getActiveRubric() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from("rubrics")
    .select("version, rubric_text")
    .eq("is_active", true)
    .single();

  if (error) {
    throw new Error(`Failed to fetch active rubric: ${error.message}`);
  }

  if (!data) {
    throw new Error("No active rubric found");
  }

  return data;
}

export function buildSystemPrompt(rubricText: string): string {
  return `You are an objective product analysis assistant. Your task is to analyze products (from URLs, text descriptions, or images) based on the following rubric:

${rubricText}

Return your analysis as valid JSON matching this structure:
{
  "objectivity_score": <number 0-10>,
  "bias_indicators": ["indicator1", "indicator2"],
  "factual_claims": [
    {
      "claim": "string",
      "verified": true|false,
      "confidence": 0.0-1.0
    }
  ],
  "summary": "Brief summary of findings",
  "sources": [
    {
      "url": "source url",
      "title": "source title",
      "snippet": "relevant quote or info"
    }
  ],
  "reasoning": "Explanation of your analysis"
}

Ensure all fields are present and properly formatted.`;
}
