import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Input validation schemas
export const AnalyzeInputSchema = z.object({
  url: z.string().url().optional(),
  text: z.string().optional(),
  image_url: z.string().url().optional(),
}).refine(
  (data) => data.url || data.text || data.image_url,
  { message: "At least one of url, text, or image_url must be provided" }
);

export type AnalyzeInput = z.infer<typeof AnalyzeInputSchema>;

// Analysis result validation schemas
export const SourceSchema = z.object({
  url: z.string().url().optional(),
  title: z.string().optional(),
  snippet: z.string().optional(),
});

export const AnalysisResultSchema = z.object({
  bunkd_score: z.number().min(0).max(10),
  bias_indicators: z.array(z.string()),
  factual_claims: z.array(z.object({
    claim: z.string(),
    verified: z.boolean().optional(),
    confidence: z.number().min(0).max(1).optional(),
  })),
  summary: z.string(),
  sources: z.array(SourceSchema).optional(),
  reasoning: z.string().optional(),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type Source = z.infer<typeof SourceSchema>;

// Create fingerprint from input for caching
export function createFingerprint(input: AnalyzeInput, rubricVersion: string): string {
  const normalized = {
    url: input.url?.toLowerCase().trim(),
    text: input.text?.trim(),
    image_url: input.image_url?.toLowerCase().trim(),
    rubric: rubricVersion,
  };

  const sortedKeys = Object.keys(normalized).sort();
  const canonicalString = sortedKeys
    .map(key => `${key}:${normalized[key as keyof typeof normalized] || ''}`)
    .join('|');

  return hashString(canonicalString);
}

// Simple hash function for fingerprinting
async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
