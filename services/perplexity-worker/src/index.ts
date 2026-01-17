import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { request } from 'undici';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// New scoring schema v2.0
import {
  CategoryId,
  PrimitiveScores,
  Signal,
  BUNKD_SCORING_CONFIG,
  scoreBSMeter,
  extractPrimitivesFromText,
  detectCategoryCandidates,
  extractSignalsForCategory,
  mapToLegacySubscores,
} from './scoring-schema';

// Claim archetypes for tiered routing (v2.1)
import {
  determineRoutingTier,
  buildCommodityResult as buildCommodityResultV2,
  buildArchetypeResult,
  buildUnableToAssessResult,
  detectClaimArchetype,
  RoutingResult,
} from './claim_archetypes';

// Verdict-score alignment system
import {
  getVerdictFields,
  sanitizeSummary,
  sanitizeContentText,
  deduplicateRedFlags,
  stripMarkdown,
} from './verdict-mapping';

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
  // Disambiguation fields
  selected_candidate_id?: string;
  interpreted_as?: string;
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
  scoring_version?: string; // "2.0" for new schema, optional for legacy fallback
  bunk_score?: number; // Now ALWAYS set - we no longer refuse to score
  confidence: number;
  confidence_level?: "low" | "medium" | "high"; // User-friendly confidence label
  confidence_explanation?: string; // Explanation of confidence level
  verdict?: "low" | "elevated" | "high"; // Now ALWAYS set - no longer optional
  verdict_label?: string; // Human-readable verdict label (e.g., "Well Supported", "Questionable")
  secondary_verdict?: string; // Secondary verdict subline for additional context
  verdict_text?: string;  // Longer verdict explanation
  meter_label?: string;   // Label for BS Meter display (e.g., "Low BS", "High BS")
  unable_to_score?: boolean; // DEPRECATED: kept for backward compat, always false
  insufficient_data_reason?: string; // DEPRECATED: kept for backward compat
  summary: string;
  evidence_bullets: string[];
  key_claims: Array<{
    claim: string;
    support_level: "supported" | "mixed" | "weak" | "unsupported";
    why: string;
  }>;
  red_flags: string[];
  // Phase 3 UX Polish: structured risk signals with severity
  risk_signals?: Array<{
    text: string;
    severity: number; // 1-4 scale (1=minor, 4=critical)
  }>;
  // Phase 3 UX Polish: claims summary for quick overview
  claims_summary?: {
    claims: string[];
    status: string; // e.g., "2 supported, 1 weak, 1 unsupported"
  };
  subscores: { // LEGACY - kept for backward compat with mobile app
    human_evidence: number;
    authenticity_transparency: number;
    marketing_overclaim: number;
    pricing_value: number;
  };
  // NEW FIELDS for v2.0 scoring
  category?: string; // Detected category ID
  category_confidence?: number; // 0-1 confidence in category
  pillar_scores?: PrimitiveScores; // New primitive breakdown
  score_breakdown?: {
    baseRisk01: number;
    harmMultiplier: number;
    penalties01: number;
    credits01: number;
    confidenceAdjusted01: number;
  };
  citations: Array<{ title: string; url: string }>;
  product_details?: {
    name?: string;
    ingredients?: string;
    volume?: string;
    price?: string;
    clinical_studies?: string;
  };
  disclaimers?: string[];
  // For whole_foods_commodity category: what WOULD increase BS if context were provided
  key_findings_if_context_provided?: string[];
  // DISAMBIGUATION FIELDS - for ambiguous short queries
  needs_disambiguation?: boolean;
  disambiguation_query?: string;
  disambiguation_candidates?: Array<{
    id: string;
    label: string;
    category_hint: string;
    confidence: number;
  }>;
  // Set after user selects a disambiguation candidate
  interpreted_as?: string;
  // ROUTING/ARCHETYPE FIELDS (v2.1)
  analysis_mode?: 'commodity' | 'claim_archetype' | 'seller_specific' | 'full_analysis' | 'unable_to_assess';
  claim_archetype?: {
    name: string;
    confidence: number;
    matched_signals: string[];
  };
  unable_to_assess?: boolean;
}

// Initialize Supabase client
const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Sleep utility
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// BARE COMMODITY FAST PATH DETECTOR
// =============================================================================

/**
 * Detects if text is a bare commodity name (e.g., "gala apples", "pumpkin seeds")
 * with no claims, pricing, seller info, or marketing language.
 *
 * When matched, these items can skip Perplexity and return BS = 0.0 immediately.
 */
interface BareCommodityResult {
  match: boolean;
  item?: string;
}

// Known commodity terms (MVP lexicon - easy to expand)
const COMMODITY_LEXICON = new Set([
  // Fruits
  'apple', 'apples', 'gala apples', 'honeycrisp', 'honeycrisp apples', 'fuji apples',
  'granny smith', 'banana', 'bananas', 'orange', 'oranges', 'lemon', 'lemons',
  'lime', 'limes', 'grapefruit', 'grapefruits', 'mango', 'mangoes', 'mangos',
  'pineapple', 'pineapples', 'strawberry', 'strawberries', 'blueberry', 'blueberries',
  'raspberry', 'raspberries', 'blackberry', 'blackberries', 'grape', 'grapes',
  'watermelon', 'cantaloupe', 'honeydew', 'peach', 'peaches', 'plum', 'plums',
  'pear', 'pears', 'cherry', 'cherries', 'avocado', 'avocados', 'kiwi', 'kiwis',

  // Vegetables
  'potato', 'potatoes', 'sweet potato', 'sweet potatoes', 'carrot', 'carrots',
  'onion', 'onions', 'red onion', 'red onions', 'garlic', 'celery', 'broccoli',
  'cauliflower', 'spinach', 'kale', 'lettuce', 'romaine', 'cabbage', 'cucumber',
  'cucumbers', 'tomato', 'tomatoes', 'bell pepper', 'bell peppers', 'zucchini',
  'squash', 'butternut squash', 'acorn squash', 'pumpkin', 'corn', 'green beans',
  'peas', 'asparagus', 'mushroom', 'mushrooms', 'eggplant', 'beet', 'beets',
  'radish', 'radishes', 'turnip', 'turnips', 'parsnip', 'parsnips',

  // Nuts & Seeds
  'almonds', 'almond', 'walnuts', 'walnut', 'pecans', 'pecan', 'cashews', 'cashew',
  'peanuts', 'peanut', 'pistachios', 'pistachio', 'macadamia', 'hazelnuts', 'hazelnut',
  'brazil nuts', 'pine nuts', 'sunflower seeds', 'pumpkin seeds', 'chia seeds',
  'flax seeds', 'flaxseed', 'hemp seeds', 'sesame seeds',

  // Grains & Legumes
  'rice', 'brown rice', 'white rice', 'jasmine rice', 'basmati rice', 'oats',
  'oatmeal', 'rolled oats', 'steel cut oats', 'quinoa', 'barley', 'bulgur',
  'farro', 'millet', 'buckwheat', 'wheat', 'flour', 'bread', 'pasta',
  'lentils', 'red lentils', 'green lentils', 'chickpeas', 'black beans',
  'kidney beans', 'pinto beans', 'navy beans', 'beans', 'split peas',

  // Dairy & Eggs
  'eggs', 'egg', 'milk', 'butter', 'cream', 'cheese', 'yogurt', 'cottage cheese',

  // Basic Staples
  'salt', 'pepper', 'sugar', 'honey', 'olive oil', 'vegetable oil', 'vinegar',
  'coffee', 'tea', 'water',

  // Proteins (unprocessed)
  'chicken', 'beef', 'pork', 'fish', 'salmon', 'tuna', 'shrimp', 'turkey', 'lamb',
]);

// Commodity term endings for fuzzy matching
const COMMODITY_SUFFIXES = [
  'apples', 'apple', 'bananas', 'banana', 'oranges', 'orange',
  'potatoes', 'potato', 'carrots', 'carrot', 'onions', 'onion',
  'seeds', 'nuts', 'beans', 'lentils', 'rice', 'oats',
];

// Marketing/claim tokens that disqualify bare commodity matching
const MARKETING_TOKENS = [
  'clinically', 'proven', 'miracle', 'detox', 'cure', 'guarantee', 'guaranteed',
  'limited', 'sale', 'off', 'free shipping', 'best', 'revolutionary',
  'fat burn', 'anti-aging', 'anti aging', 'lose', 'boost', 'treat', 'treatment',
  'weight loss', 'energy', 'immune', 'superfood', 'super food', 'premium',
  'exclusive', 'secret', 'breakthrough', 'amazing', 'incredible', 'unbelievable',
];

// Commodity terms that are also commonly brand names - skip commodity fast-path
const AMBIGUOUS_COMMODITY_TERMS = new Set([
  'apple', 'apples',            // Apple Inc
  'blackberry', 'blackberries', // BlackBerry phones
  'orange', 'oranges',          // Orange telecom
  'dove',                       // Dove soap/beauty
  'amazon',                     // Amazon.com
  'virgin',                     // Virgin brands
  'shell',                      // Shell gas station
  'nest',                       // Google Nest
  'target',                     // Target stores
  'eclipse',                    // Eclipse gum, Eclipse IDE
  'horizon',                    // Horizon organic
]);

function isBareCommodityName(text: string): BareCommodityResult {
  // Normalize: lowercase, trim, collapse whitespace
  const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');

  // Reject if empty
  if (!normalized) {
    return { match: false };
  }

  // Skip commodity fast-path for ambiguous terms that could be brands
  if (AMBIGUOUS_COMMODITY_TERMS.has(normalized)) {
    return { match: false };
  }

  // Reject if contains URL indicators
  if (/https?:\/\/|www\.|\.com|\.ca|\.org|\.net|\.co\.|\.io/i.test(normalized)) {
    return { match: false };
  }

  // Reject if contains digits or currency (prices, quantities with numbers)
  if (/\d|[$€£¥]|%/.test(normalized)) {
    return { match: false };
  }

  // Reject if contains marketing/claim tokens
  for (const token of MARKETING_TOKENS) {
    if (normalized.includes(token)) {
      return { match: false };
    }
  }

  // Reject if word count > 5
  const words = normalized.split(' ');
  if (words.length > 5) {
    return { match: false };
  }

  // Check for non-letter/space/hyphen characters (allow apostrophe for contractions shouldn't exist)
  if (!/^[a-z\s\-']+$/.test(normalized)) {
    return { match: false };
  }

  // Check if exact match in lexicon
  if (COMMODITY_LEXICON.has(normalized)) {
    return { match: true, item: normalized };
  }

  // Check if ends with a known commodity suffix (e.g., "fuji apples", "raw almonds")
  for (const suffix of COMMODITY_SUFFIXES) {
    if (normalized.endsWith(suffix) && words.length <= 4) {
      // Additional check: first word shouldn't be a marketing term
      const prefix = normalized.replace(suffix, '').trim();
      if (prefix && !MARKETING_TOKENS.some(t => prefix.includes(t))) {
        // Basic descriptor allowed: red, green, fresh, raw, whole, sliced
        const allowedPrefixes = ['red', 'green', 'yellow', 'fresh', 'raw', 'whole', 'sliced',
                                  'diced', 'frozen', 'dried', 'roasted', 'salted', 'unsalted'];
        const prefixWords = prefix.split(' ');
        const allPrefixesAllowed = prefixWords.every(w =>
          allowedPrefixes.includes(w) || w.length <= 2 // allow very short words like "lg"
        );
        if (allPrefixesAllowed || prefix === '') {
          return { match: true, item: normalized };
        }
      }
    }
  }

  // Check individual words - if the main noun is a commodity
  // e.g., "fresh spinach" - "spinach" is in lexicon
  for (const word of words) {
    if (COMMODITY_LEXICON.has(word) && words.length <= 3) {
      // Make sure other words are simple descriptors
      const otherWords = words.filter(w => w !== word);
      const simpleDescriptors = ['fresh', 'raw', 'whole', 'sliced', 'diced', 'frozen',
                                  'dried', 'roasted', 'red', 'green', 'yellow', 'white',
                                  'brown', 'black', 'wild', 'baby', 'mini', 'large', 'small'];
      const allSimple = otherWords.every(w => simpleDescriptors.includes(w));
      if (allSimple) {
        return { match: true, item: normalized };
      }
    }
  }

  return { match: false };
}

/**
 * Build a fast-path response for bare commodity names.
 * Returns a complete BunkdAnalysisResult with bunk_score = 0.0
 */
function buildBareCommodityResult(item: string): BunkdAnalysisResult {
  // Get verdict fields for score 0
  const verdictFields = getVerdictFields(0);

  return {
    version: "bunkd_v1",
    scoring_version: "2.0",
    bunk_score: 0.0,
    confidence: 1.0,
    confidence_level: "high",
    confidence_explanation: "Item-only query; no seller, claims, or pricing provided, so BS risk is effectively zero.",
    verdict: "low",
    verdict_label: verdictFields.verdict_label,
    secondary_verdict: verdictFields.secondary_verdict,
    verdict_text: verdictFields.verdict_text,
    meter_label: verdictFields.meter_label,
    unable_to_score: false,
    summary: `"${item}" is a basic whole food or commodity. Without seller information, pricing, or specific claims to evaluate, there's no BS to detect.`,
    evidence_bullets: [],
    key_claims: [],
    red_flags: [],
    risk_signals: [],
    claims_summary: {
      claims: [],
      status: 'No claims to analyze',
    },
    subscores: {
      human_evidence: 10,
      authenticity_transparency: 10,
      marketing_overclaim: 0,
      pricing_value: 10,
    },
    category: "whole_foods_commodity",
    category_confidence: 1.0,
    pillar_scores: {
      claim_density: 0,
      claim_specificity: 0,
      verifiability: 0,
      evidence_quality: 0,
      transparency: 0,
      presentation_risk: 0,
      source_authority: 0,
      harm_potential: 0,
    },
    score_breakdown: {
      baseRisk01: 0,
      harmMultiplier: 1.0,
      penalties01: 0,
      credits01: 0,
      confidenceAdjusted01: 0,
    },
    citations: [],
    key_findings_if_context_provided: [
      "Seller markup or deceptive unit pricing",
      "Unverifiable labels like 'organic' without USDA/certifier proof",
      "Misleading origin claims ('local', 'wild', 'grass-fed') without verification",
      "Health claims beyond basic nutritional facts",
    ],
  };
}

// =============================================================================
// AMBIGUOUS QUERY DETECTOR & DISAMBIGUATION
// =============================================================================

/**
 * Detects if a text query is ambiguous and needs disambiguation.
 * Triggers for brand-like short queries (e.g., "JOVS", "Apple", "Prime")
 * that could mean different things (brand vs commodity, tech vs food, etc.)
 */
interface AmbiguityCheckResult {
  isAmbiguous: boolean;
  reason?: string;
}

// Known ambiguous terms that definitely need disambiguation
const KNOWN_AMBIGUOUS_TERMS = new Set([
  'apple', 'amazon', 'prime', 'shell', 'dove', 'target', 'oracle',
  'jaguar', 'puma', 'blackberry', 'virgin', 'delta', 'united',
  'monster', 'red bull', 'celsius', 'bang', 'ghost',
]);

function isAmbiguousQuery(text: string): AmbiguityCheckResult {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
  const words = normalized.split(' ');

  // Only check short queries (1-2 tokens)
  if (words.length > 2) {
    return { isAmbiguous: false };
  }

  // Reject if contains URL/currency/percent (clearly not ambiguous brand query)
  if (/https?:\/\/|www\.|\.com|\.ca|\.org|\.net|\.io/i.test(normalized)) {
    return { isAmbiguous: false };
  }
  if (/[$€£¥]|%|\d{3,}/.test(normalized)) {
    return { isAmbiguous: false };
  }

  // Check for known ambiguous terms
  if (words.length === 1 && KNOWN_AMBIGUOUS_TERMS.has(normalized)) {
    return { isAmbiguous: true, reason: 'known_ambiguous_term' };
  }

  const token = words.join('');

  // ALL CAPS 2-6 characters (brand acronyms like "JOVS", "IBM", "GNC")
  if (/^[A-Z]{2,6}$/.test(text.trim())) {
    return { isAmbiguous: true, reason: 'all_caps_acronym' };
  }

  // Mixed case single token 2-10 chars that looks like a brand (e.g., "iPhone", "TikTok")
  if (words.length === 1 && token.length >= 2 && token.length <= 10) {
    // Check for mixed case (has both upper and lower)
    if (/[a-z]/.test(token) && /[A-Z]/.test(token)) {
      return { isAmbiguous: true, reason: 'mixed_case_brand' };
    }
    // Contains letters + numbers (e.g., "X7", "3M", "V8")
    if (/[a-zA-Z]/.test(token) && /\d/.test(token)) {
      return { isAmbiguous: true, reason: 'alphanumeric_brand' };
    }
  }

  // Single capitalized word 2-10 chars that's NOT clearly a commodity
  if (words.length === 1 && /^[A-Z][a-z]{1,9}$/.test(text.trim())) {
    // Check if it's a clear commodity (already handled by bare commodity detector)
    const commodityCheck = isBareCommodityName(text);
    if (!commodityCheck.match) {
      // Not a commodity, could be a brand name
      return { isAmbiguous: true, reason: 'proper_noun_single_word' };
    }
  }

  // All-lowercase single word 4-12 chars that's NOT a commodity (e.g., "minoxidil", "retinol")
  // This catches drug names, supplement names, and product names typed in lowercase
  if (words.length === 1 && /^[a-z]{4,12}$/.test(token)) {
    const commodityCheck = isBareCommodityName(text);
    if (!commodityCheck.match) {
      return { isAmbiguous: true, reason: 'lowercase_single_word' };
    }
  }

  return { isAmbiguous: false };
}

/**
 * Call Perplexity with a lightweight disambiguation prompt.
 * Returns up to 5 candidate meanings for the ambiguous query.
 */
interface DisambiguationCandidate {
  id: string;
  label: string;
  category_hint: string;
  confidence: number;
}

async function getDisambiguationCandidates(
  query: string
): Promise<DisambiguationCandidate[]> {
  const systemMessage = `You are a disambiguation engine. Given a short query, propose up to 5 plausible meanings the user might intend when checking for misleading claims or BS.

For each meaning, provide:
- id: unique lowercase slug (e.g., "jovs-beauty-device", "apple-fruit", "apple-inc")
- label: concise human-readable label (e.g., "JOVS Beauty Device", "Apple (fruit)", "Apple Inc.")
- category_hint: one of [whole_foods_commodity, supplements, beauty_personal_care, tech_gadgets, automotive, business_guru, general]
- confidence: 0.0-1.0 estimate of how likely this interpretation is

Output JSON only, no explanation. Format:
{"candidates":[{"id":"...","label":"...","category_hint":"...","confidence":0.0}]}`;

  const userMessage = `Query: "${query}"`;

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar', // Use lighter model for disambiguation
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 500, // Small token budget
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error(`Disambiguation API error: ${response.status}`);
      return [];
    }

    const data = await response.json() as PerplexityResponse;
    const content = data.choices[0]?.message?.content || '';

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in disambiguation response');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const candidates = parsed.candidates || [];

    // Validate and normalize candidates
    return candidates
      .filter((c: any) => c.id && c.label && c.category_hint)
      .map((c: any) => ({
        id: String(c.id).toLowerCase().replace(/\s+/g, '-'),
        label: String(c.label),
        category_hint: String(c.category_hint),
        confidence: Math.max(0, Math.min(1, Number(c.confidence) || 0.5)),
      }))
      .sort((a: DisambiguationCandidate, b: DisambiguationCandidate) =>
        b.confidence - a.confidence
      )
      .slice(0, 5);

  } catch (error: any) {
    console.error('Disambiguation call failed:', error.message);
    return [];
  }
}

/**
 * Build a disambiguation response (no scoring yet).
 * Returns a partial result that signals the client to show a picker.
 */
function buildDisambiguationResult(
  query: string,
  candidates: DisambiguationCandidate[]
): BunkdAnalysisResult {
  return {
    version: "bunkd_v1",
    scoring_version: "2.0",
    confidence: 0.3, // Low confidence since we don't know what they mean
    confidence_level: "low",
    confidence_explanation: "Query is ambiguous - please select the intended meaning.",
    verdict_label: "Needs Clarification",
    secondary_verdict: "Select the intended meaning",
    verdict_text: "Please select what you meant to analyze.",
    meter_label: "Pending",
    summary: `The query "${query}" could refer to multiple things. Please select the intended meaning to get an accurate BS score.`,
    evidence_bullets: [],
    key_claims: [],
    red_flags: [],
    risk_signals: [],
    claims_summary: {
      claims: [],
      status: 'Awaiting clarification',
    },
    subscores: {
      human_evidence: 0,
      authenticity_transparency: 0,
      marketing_overclaim: 0,
      pricing_value: 0,
    },
    citations: [],
    // Disambiguation fields
    needs_disambiguation: true,
    disambiguation_query: query,
    disambiguation_candidates: candidates,
  };
}

// =============================================================================
// DISAMBIGUATION CACHE (Supabase-based, 48h TTL)
// =============================================================================

interface DisambiguationCacheEntry {
  query: string;
  candidates: DisambiguationCandidate[];
  created_at: string;
}

// In-memory cache for current session (backed by Supabase for persistence)
const disambiguationCache = new Map<string, DisambiguationCacheEntry>();
const DISAMBIGUATION_CACHE_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

function getDisambiguationCacheKey(query: string): string {
  return `disambig:${query.toLowerCase().trim()}`;
}

async function getCachedDisambiguation(query: string): Promise<DisambiguationCandidate[] | null> {
  const cacheKey = getDisambiguationCacheKey(query);

  // Check in-memory first
  const memCached = disambiguationCache.get(cacheKey);
  if (memCached) {
    const age = Date.now() - new Date(memCached.created_at).getTime();
    if (age < DISAMBIGUATION_CACHE_TTL_MS) {
      console.log(`  📦 Disambiguation cache hit (memory): "${query}"`);
      return memCached.candidates;
    }
  }

  // Check Supabase
  try {
    const { data, error } = await supabase
      .from('disambiguation_cache')
      .select('candidates, created_at')
      .eq('cache_key', cacheKey)
      .single();

    if (error || !data) {
      return null;
    }

    const age = Date.now() - new Date(data.created_at).getTime();
    if (age >= DISAMBIGUATION_CACHE_TTL_MS) {
      return null;
    }

    // Populate in-memory cache
    disambiguationCache.set(cacheKey, {
      query,
      candidates: data.candidates,
      created_at: data.created_at,
    });

    console.log(`  📦 Disambiguation cache hit (db): "${query}"`);
    return data.candidates;
  } catch {
    return null;
  }
}

async function cacheDisambiguation(query: string, candidates: DisambiguationCandidate[]): Promise<void> {
  const cacheKey = getDisambiguationCacheKey(query);
  const now = new Date().toISOString();

  // Update in-memory
  disambiguationCache.set(cacheKey, {
    query,
    candidates,
    created_at: now,
  });

  // Persist to Supabase (upsert)
  try {
    await supabase
      .from('disambiguation_cache')
      .upsert({
        cache_key: cacheKey,
        query: query.toLowerCase().trim(),
        candidates,
        created_at: now,
      }, { onConflict: 'cache_key' });
  } catch (error: any) {
    console.warn(`Failed to cache disambiguation: ${error.message}`);
  }
}

// Fetch and extract text content from a URL
async function fetchPageText(url: string): Promise<{ content: string; success: boolean; error?: string }> {
  try {
    const { statusCode, body } = await request(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BunkdBot/1.0; +https://bunkd.ai)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      headersTimeout: 30000,
      bodyTimeout: 30000,
    });

    if (statusCode !== 200) {
      return { content: '', success: false, error: `HTTP ${statusCode}` };
    }

    const html = await body.text();

    // Basic HTML to text conversion
    let text = html
      // Remove script and style tags
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      // Remove HTML tags
      .replace(/<[^>]+>/g, ' ')
      // Decode HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&ldquo;/g, '"')
      .replace(/&rdquo;/g, '"')
      .replace(/&rsquo;/g, "'")
      .replace(/&#\d+;/g, ''); // Remove other numeric entities

    // Normalize whitespace
    text = text
      .split('\n')
      .map(line => line.replace(/\s+/g, ' ').trim())
      .filter(line => line.length > 0)
      .join('\n');

    // Limit to reasonable length for prompt (keep under 50KB for the prompt)
    const maxLength = 50000;
    if (text.length > maxLength) {
      text = text.substring(0, maxLength) + '\n... (content truncated)';
    }

    return { content: text, success: true };
  } catch (error: any) {
    return { content: '', success: false, error: error.message };
  }
}

// Round to nearest 0.5
function roundToHalf(num: number): number {
  return Math.round(num * 2) / 2;
}

// Compute deterministic bunk_score from subscores with category-specific weights
function computeBunkScore(
  subscores: {
    human_evidence: number;
    authenticity_transparency: number;
    marketing_overclaim: number;
    pricing_value: number;
  },
  category: ProductCategory = 'unknown'
): number {
  const weights = CATEGORY_WEIGHTS[category];

  return roundToHalf(
    weights.he * subscores.human_evidence +
    weights.at * subscores.authenticity_transparency +
    weights.mo * subscores.marketing_overclaim +
    weights.pv * subscores.pricing_value
  );
}

// Detect if there's insufficient data to score accurately
function detectInsufficientData(result: any, pageContentLength?: number): {
  insufficient: boolean;
  reason?: string;
} {
  const reasons: string[] = [];

  // Check 1: All subscores very high (suggests default "no data" scoring)
  const { subscores } = result;
  const allScoresHigh =
    subscores.human_evidence >= 8.5 &&
    subscores.authenticity_transparency >= 8.5 &&
    subscores.marketing_overclaim >= 8.5 &&
    subscores.pricing_value >= 8.5;

  if (allScoresHigh) {
    reasons.push('All quality indicators show maximum concern, suggesting insufficient product data to evaluate');
  }

  // Check 2: Very few claims
  if (result.key_claims && result.key_claims.length < 3) {
    reasons.push(`Only ${result.key_claims.length} product claims found (minimum 3 needed for analysis)`);
  }

  // Check 3: Summary indicates insufficient data
  const summaryLower = result.summary?.toLowerCase() || '';
  const insufficientKeywords = [
    'insufficient',
    'not enough data',
    'not enough information',
    'unable to',
    'no product information',
    'cannot evaluate',
    'cannot assess',
    'limited information',
    'no specific product'
  ];

  const hasInsufficientKeyword = insufficientKeywords.some(keyword =>
    summaryLower.includes(keyword)
  );

  if (hasInsufficientKeyword) {
    reasons.push('Analysis summary indicates insufficient product information');
  }

  // Check 4: Product details all "Not specified" or missing
  if (result.product_details) {
    const details = result.product_details;
    const allNotSpecified =
      (!details.name || details.name.toLowerCase().includes('not specified')) &&
      (!details.ingredients || details.ingredients.toLowerCase().includes('not specified')) &&
      (!details.volume || details.volume.toLowerCase().includes('not specified')) &&
      (!details.price || details.price.toLowerCase().includes('not specified'));

    if (allNotSpecified) {
      reasons.push('No product details (name, ingredients, volume, price) could be extracted');
    }
  }

  // Check 5: Page content too short (if we fetched it)
  if (pageContentLength !== undefined && pageContentLength < 500) {
    reasons.push(`Page content too short (${pageContentLength} characters) for meaningful analysis`);
  }

  // Check 6: No evidence bullets or very few
  if (result.evidence_bullets && result.evidence_bullets.length < 3) {
    reasons.push(`Only ${result.evidence_bullets.length} evidence points found (minimum 5 expected)`);
  }

  const insufficient = reasons.length >= 2; // Need at least 2 indicators

  return {
    insufficient,
    reason: insufficient ? reasons.join('; ') : undefined
  };
}

// Compute verdict from bunk_score
function verdictFromScore(score: number): "low" | "elevated" | "high" {
  if (score <= 3.5) return "low";
  if (score <= 6.5) return "elevated";
  return "high";
}

// =============================================================================
// PHASE 1: Research Phase - Let Perplexity research freely
// =============================================================================

// Product categories for Phase 2 extraction
type ProductCategory =
  | 'supplement'
  | 'beauty'
  | 'tech'
  | 'business_guru'
  | 'health_device'
  | 'food_beverage'
  | 'automotive'
  | 'real_estate'
  | 'financial'
  | 'education'
  | 'travel'
  | 'service'
  | 'unknown';

// =============================================================================
// PACK SYSTEM - Category-specific scoring configuration
// =============================================================================

// Pillar types for the pack system
type Pillar =
  | 'claims_evidence'      // Are claims backed by studies/proof?
  | 'safety_compliance'    // FDA, regulatory, safety certifications
  | 'authenticity'         // Is this the real source? Official?
  | 'transparency'         // Ingredient disclosure, pricing clarity
  | 'value_integrity'      // Fair pricing, no hidden fees
  | 'support_integrity';   // Return policy, customer service

// Evidence types ordered by strength
type EvidenceType =
  | 'peer_reviewed'        // Published peer-reviewed study
  | 'clinical_trial'       // Clinical trial (any size)
  | 'product_clinical_trial' // Product-specific clinical trial
  | 'ingredient_studies'   // Studies on ingredients
  | 'third_party_test'     // Third-party lab testing
  | 'manufacturer_study'   // In-house study
  | 'dermatologist_tested' // Professional endorsement
  | 'official_oem'         // Official manufacturer source
  | 'authorized_dealer'    // Authorized reseller
  | 'epa_verified'         // EPA fuel economy verification
  | 'nhtsa_safety'         // NHTSA safety ratings
  | 'verifiable_credentials' // Checkable credentials
  | 'named_testimonials'   // Real, named testimonials
  | 'public_track_record'  // Verifiable public history
  | 'refund_policy'        // Clear refund/return policy
  | 'user_testimonials'    // Anonymous testimonials (weakest)
  | 'sec_registered'       // SEC registration
  | 'finra_member'         // FINRA membership
  | 'accredited'           // Educational accreditation
  | 'licensed';            // Professional licensing

// Auto-fail rule type
interface AutoFailRule {
  pattern: string;
  penalty: number;
  reason: string;
}

// Pack configuration type
interface CategoryPack {
  pillars: Pillar[];
  weights: Partial<Record<Pillar, number>>;
  red_flags: string[];
  auto_fail_rules: AutoFailRule[];
  evidence_priority: EvidenceType[];
  default_pillar_scores?: Partial<Record<Pillar, number>>;
}

// Category packs configuration
const CATEGORY_PACKS: Record<ProductCategory, CategoryPack> = {
  supplement: {
    pillars: ['claims_evidence', 'safety_compliance', 'transparency', 'value_integrity', 'support_integrity'],
    weights: {
      claims_evidence: 0.35,
      safety_compliance: 0.25,
      transparency: 0.20,
      value_integrity: 0.10,
      support_integrity: 0.10,
    },
    red_flags: [
      'FDA approved', 'cures', 'treats disease', 'miracle', 'proprietary blend',
      'clinically proven', '100% effective', 'no side effects', 'doctor recommended',
      'secret formula', 'ancient remedy', 'big pharma doesn\'t want you to know',
    ],
    auto_fail_rules: [
      { pattern: 'cures cancer|cures diabetes|cures alzheimer', penalty: 3.0, reason: 'Illegal disease cure claim' },
      { pattern: 'FDA approved drug|FDA approved treatment', penalty: 2.5, reason: 'False FDA approval claim for supplement' },
      { pattern: 'guaranteed results|money back if.{0,20}doesn\'t work', penalty: 1.5, reason: 'Unrealistic guarantee' },
    ],
    evidence_priority: ['peer_reviewed', 'clinical_trial', 'third_party_test', 'manufacturer_study', 'user_testimonials'],
    default_pillar_scores: { claims_evidence: 7, safety_compliance: 6, transparency: 6, value_integrity: 5, support_integrity: 5 },
  },

  beauty: {
    pillars: ['claims_evidence', 'safety_compliance', 'transparency', 'value_integrity', 'support_integrity'],
    weights: {
      claims_evidence: 0.30,
      safety_compliance: 0.20,
      transparency: 0.25,
      value_integrity: 0.15,
      support_integrity: 0.10,
    },
    red_flags: [
      'instant results', 'celebrity secret', 'miracle', 'permanent', 'anti-aging breakthrough',
      'erase wrinkles', 'look 10 years younger', 'botox alternative', 'surgery-free facelift',
    ],
    auto_fail_rules: [
      { pattern: 'FDA approved cosmetic|FDA approved skincare', penalty: 2.0, reason: 'FDA doesn\'t approve cosmetics' },
      { pattern: 'permanent results|forever young', penalty: 1.5, reason: 'Impossible permanence claim' },
    ],
    evidence_priority: ['product_clinical_trial', 'ingredient_studies', 'dermatologist_tested', 'third_party_test', 'user_testimonials'],
    default_pillar_scores: { claims_evidence: 6, safety_compliance: 5, transparency: 5, value_integrity: 5, support_integrity: 5 },
  },

  automotive: {
    pillars: ['authenticity', 'transparency', 'value_integrity', 'support_integrity'],
    weights: {
      authenticity: 0.40,
      transparency: 0.30,
      value_integrity: 0.20,
      support_integrity: 0.10,
    },
    red_flags: [
      'market adjustment', 'dealer markup', 'limited time', 'act now', 'won\'t last',
      'below invoice', 'employee pricing', 'special deal', 'today only',
    ],
    auto_fail_rules: [
      { pattern: 'unauthorized dealer|salvage title hidden|flood damage hidden', penalty: 3.0, reason: 'Fraudulent dealer/vehicle' },
      { pattern: 'bait.and.switch|advertised.{0,20}not available', penalty: 2.0, reason: 'Deceptive advertising' },
    ],
    evidence_priority: ['official_oem', 'authorized_dealer', 'epa_verified', 'nhtsa_safety'],
    default_pillar_scores: { authenticity: 4, transparency: 4, value_integrity: 4, support_integrity: 4 },
  },

  business_guru: {
    pillars: ['claims_evidence', 'authenticity', 'transparency', 'value_integrity', 'support_integrity'],
    weights: {
      claims_evidence: 0.30,
      authenticity: 0.30,
      transparency: 0.20,
      value_integrity: 0.10,
      support_integrity: 0.10,
    },
    red_flags: [
      'made $X in Y days', 'limited spots', 'price going up', 'secret method',
      'countdown timer', 'fake scarcity', 'quit your job', 'passive income',
      'financial freedom', 'work from anywhere', 'be your own boss', 'proven system',
      'copy my exact', 'step-by-step blueprint', 'done for you',
    ],
    auto_fail_rules: [
      { pattern: 'guaranteed income|guaranteed.{0,20}\\$\\d+', penalty: 2.5, reason: 'Income guarantee is illegal' },
      { pattern: 'get rich quick|overnight millionaire', penalty: 2.0, reason: 'Unrealistic wealth promise' },
      { pattern: 'mlm|network marketing|downline', penalty: 1.5, reason: 'MLM structure detected' },
    ],
    evidence_priority: ['verifiable_credentials', 'named_testimonials', 'public_track_record', 'refund_policy'],
    default_pillar_scores: { claims_evidence: 7, authenticity: 6, transparency: 6, value_integrity: 7, support_integrity: 6 },
  },

  health_device: {
    pillars: ['claims_evidence', 'safety_compliance', 'authenticity', 'transparency', 'value_integrity'],
    weights: {
      claims_evidence: 0.35,
      safety_compliance: 0.30,
      authenticity: 0.15,
      transparency: 0.10,
      value_integrity: 0.10,
    },
    red_flags: [
      'FDA cleared' /* often misused */, 'clinically proven', 'doctor approved',
      'hospital grade', 'medical breakthrough', 'replaces medication',
    ],
    auto_fail_rules: [
      { pattern: 'cures|treats|diagnoses disease', penalty: 3.0, reason: 'Illegal medical device claim' },
      { pattern: 'FDA approved.{0,20}device', penalty: 1.0, reason: 'FDA clears, not approves, most devices' },
    ],
    evidence_priority: ['peer_reviewed', 'clinical_trial', 'third_party_test', 'manufacturer_study'],
    default_pillar_scores: { claims_evidence: 7, safety_compliance: 6, authenticity: 5, transparency: 5, value_integrity: 5 },
  },

  food_beverage: {
    pillars: ['claims_evidence', 'safety_compliance', 'transparency', 'value_integrity', 'support_integrity'],
    weights: {
      claims_evidence: 0.25,
      safety_compliance: 0.25,
      transparency: 0.25,
      value_integrity: 0.15,
      support_integrity: 0.10,
    },
    red_flags: [
      'superfood', 'detox', 'cleanse', 'burns fat', 'boosts metabolism',
      'all natural', 'chemical free', 'non-GMO' /* often meaningless */,
    ],
    auto_fail_rules: [
      { pattern: 'cures|treats|prevents disease', penalty: 2.5, reason: 'Illegal health claim for food' },
    ],
    evidence_priority: ['peer_reviewed', 'clinical_trial', 'third_party_test', 'ingredient_studies'],
    default_pillar_scores: { claims_evidence: 5, safety_compliance: 4, transparency: 5, value_integrity: 5, support_integrity: 5 },
  },

  real_estate: {
    pillars: ['authenticity', 'transparency', 'value_integrity', 'support_integrity'],
    weights: {
      authenticity: 0.40,
      transparency: 0.30,
      value_integrity: 0.20,
      support_integrity: 0.10,
    },
    red_flags: [
      'guaranteed appreciation', 'can\'t lose', 'below market', 'motivated seller',
      'won\'t last', 'multiple offers', 'best and final',
    ],
    auto_fail_rules: [
      { pattern: 'guaranteed.{0,20}return|guaranteed.{0,20}appreciation', penalty: 2.0, reason: 'No real estate returns are guaranteed' },
    ],
    evidence_priority: ['licensed', 'public_track_record'],
    default_pillar_scores: { authenticity: 4, transparency: 4, value_integrity: 5, support_integrity: 5 },
  },

  financial: {
    pillars: ['claims_evidence', 'authenticity', 'safety_compliance', 'transparency', 'value_integrity'],
    weights: {
      claims_evidence: 0.25,
      authenticity: 0.30,
      safety_compliance: 0.25,
      transparency: 0.15,
      value_integrity: 0.05,
    },
    red_flags: [
      'guaranteed returns', 'risk-free', 'insider information', 'secret strategy',
      'beat the market', 'passive income', 'financial freedom',
    ],
    auto_fail_rules: [
      { pattern: 'guaranteed.{0,20}return|guaranteed.{0,20}profit', penalty: 3.0, reason: 'Guaranteed returns are illegal to promise' },
      { pattern: 'insider.{0,20}information|insider.{0,20}tips', penalty: 2.5, reason: 'Insider trading reference' },
      { pattern: 'ponzi|pyramid', penalty: 3.0, reason: 'Ponzi/pyramid scheme indicator' },
    ],
    evidence_priority: ['sec_registered', 'finra_member', 'licensed', 'public_track_record'],
    default_pillar_scores: { claims_evidence: 6, authenticity: 5, safety_compliance: 5, transparency: 5, value_integrity: 5 },
  },

  education: {
    pillars: ['claims_evidence', 'authenticity', 'transparency', 'value_integrity', 'support_integrity'],
    weights: {
      claims_evidence: 0.25,
      authenticity: 0.30,
      transparency: 0.20,
      value_integrity: 0.15,
      support_integrity: 0.10,
    },
    red_flags: [
      'guaranteed job', 'six figure salary', 'in just X weeks', 'no experience needed',
      'industry secrets', 'limited enrollment',
    ],
    auto_fail_rules: [
      { pattern: 'guaranteed.{0,20}job|guaranteed.{0,20}employment', penalty: 2.0, reason: 'Job guarantees are deceptive' },
    ],
    evidence_priority: ['accredited', 'licensed', 'public_track_record', 'verifiable_credentials'],
    default_pillar_scores: { claims_evidence: 5, authenticity: 5, transparency: 5, value_integrity: 5, support_integrity: 5 },
  },

  travel: {
    pillars: ['authenticity', 'transparency', 'value_integrity', 'support_integrity'],
    weights: {
      authenticity: 0.35,
      transparency: 0.30,
      value_integrity: 0.25,
      support_integrity: 0.10,
    },
    red_flags: [
      'too good to be true', 'limited time', 'book now', 'prices going up',
      'exclusive deal', 'members only', 'hidden fees',
    ],
    auto_fail_rules: [
      { pattern: 'free vacation|free trip', penalty: 1.5, reason: 'Free vacation scam indicator' },
    ],
    evidence_priority: ['official_oem', 'licensed', 'public_track_record'],
    default_pillar_scores: { authenticity: 4, transparency: 4, value_integrity: 5, support_integrity: 5 },
  },

  tech: {
    pillars: ['claims_evidence', 'authenticity', 'transparency', 'value_integrity', 'support_integrity'],
    weights: {
      claims_evidence: 0.20,
      authenticity: 0.30,
      transparency: 0.25,
      value_integrity: 0.15,
      support_integrity: 0.10,
    },
    red_flags: [
      'revolutionary', 'game-changer', 'disruptive', '10x better', 'kills the competition',
      'limited stock', 'selling out fast',
    ],
    auto_fail_rules: [
      { pattern: 'fake|counterfeit|knockoff', penalty: 3.0, reason: 'Counterfeit product' },
    ],
    evidence_priority: ['third_party_test', 'peer_reviewed', 'public_track_record'],
    default_pillar_scores: { claims_evidence: 5, authenticity: 5, transparency: 5, value_integrity: 5, support_integrity: 5 },
  },

  service: {
    pillars: ['authenticity', 'transparency', 'value_integrity', 'support_integrity'],
    weights: {
      authenticity: 0.35,
      transparency: 0.30,
      value_integrity: 0.20,
      support_integrity: 0.15,
    },
    red_flags: [
      'limited time offer', 'act now', 'special deal', 'won\'t last',
      'hidden fees', 'cancel anytime' /* often not true */,
    ],
    auto_fail_rules: [
      { pattern: 'scam|fraud', penalty: 3.0, reason: 'Scam/fraud indicator' },
    ],
    evidence_priority: ['licensed', 'public_track_record', 'refund_policy'],
    default_pillar_scores: { authenticity: 5, transparency: 5, value_integrity: 5, support_integrity: 5 },
  },

  unknown: {
    pillars: ['claims_evidence', 'authenticity', 'transparency', 'value_integrity', 'support_integrity'],
    weights: {
      claims_evidence: 0.25,
      authenticity: 0.25,
      transparency: 0.20,
      value_integrity: 0.15,
      support_integrity: 0.15,
    },
    red_flags: [
      'limited time', 'act now', 'guaranteed', 'miracle', 'secret',
    ],
    auto_fail_rules: [],
    evidence_priority: ['peer_reviewed', 'third_party_test', 'public_track_record'],
    default_pillar_scores: { claims_evidence: 6, authenticity: 5, transparency: 5, value_integrity: 5, support_integrity: 5 },
  },
};

// =============================================================================
// PACK SYSTEM - Pillar Evaluation Functions
// =============================================================================

// Pillar-specific evidence extraction patterns
const PILLAR_EVIDENCE_PATTERNS: Record<Pillar, { positive: RegExp[]; negative: RegExp[] }> = {
  claims_evidence: {
    positive: [
      /(\d+)\s*(?:participants?|subjects?|people|patients?)/i,
      /randomized controlled trial|rct|double.blind/i,
      /peer.reviewed|published in|journal/i,
      /clinical (?:study|trial|evidence)/i,
      /evidence supports|research confirms|study shows/i,
      /independently verified|third.party tested/i,
    ],
    negative: [
      /no.{0,20}(?:clinical|scientific).{0,20}(?:studies|evidence|trials)/i,
      /only testimonials|anecdotal/i,
      /unsubstantiated|not proven|no evidence/i,
      /pseudoscience|debunked|false claim/i,
    ],
  },
  safety_compliance: {
    positive: [
      /fda registered|fda cleared/i,
      /gmp certified|good manufacturing practice/i,
      /nsf certified|usp verified/i,
      /third.party tested for purity/i,
      /certificate of analysis|coa/i,
      /safe for|safety tested/i,
    ],
    negative: [
      /fda warning|fda action/i,
      /recalled|contaminated/i,
      /side effects reported|adverse reactions/i,
      /not evaluated by fda/i,
      /banned ingredient|prohibited substance/i,
    ],
  },
  authenticity: {
    positive: [
      /official|oem|manufacturer/i,
      /authorized dealer|authorized reseller/i,
      /verified seller|verified business/i,
      /established.{0,20}(?:company|brand|business)/i,
      /registered trademark|official website/i,
    ],
    negative: [
      /fake|counterfeit|knockoff/i,
      /unauthorized|grey market/i,
      /scam|fraud/i,
      /no business registration|unregistered/i,
      /misleading|deceptive/i,
    ],
  },
  transparency: {
    positive: [
      /full ingredient list|all ingredients disclosed/i,
      /transparent pricing|clear pricing/i,
      /terms clearly stated|clear terms/i,
      /easy to find contact|contact information provided/i,
      /return policy clearly stated/i,
    ],
    negative: [
      /proprietary blend|undisclosed/i,
      /hidden fees|surprise charges/i,
      /fine print|buried in terms/i,
      /hard to find contact|no contact info/i,
      /vague|unclear/i,
    ],
  },
  value_integrity: {
    positive: [
      /fair price|reasonable price|good value/i,
      /competitive pricing|market rate/i,
      /msrp|transparent pricing/i,
      /money.back guarantee/i,
      /no hidden fees|all.inclusive/i,
    ],
    negative: [
      /overpriced|expensive|markup/i,
      /hidden fees|additional charges/i,
      /auto.?ship|forced subscription/i,
      /price gouging|inflated/i,
      /bait.and.switch/i,
    ],
  },
  support_integrity: {
    positive: [
      /easy to cancel|cancel anytime/i,
      /responsive customer service|quick response/i,
      /clear return policy|30.day guarantee/i,
      /refund.{0,20}easy|hassle.free return/i,
      /customer support available/i,
    ],
    negative: [
      /hard to cancel|cancellation difficult/i,
      /no response|unresponsive/i,
      /no refund|non.refundable/i,
      /customer complaints|bbb complaints/i,
      /support issues|poor support/i,
    ],
  },
};

// Evaluate a single pillar based on text evidence
function evaluatePillar(
  pillar: Pillar,
  text: string,
  evidencePriority: EvidenceType[]
): { score: number; evidence: string[]; confidence: number } {
  const lower = text.toLowerCase();
  const patterns = PILLAR_EVIDENCE_PATTERNS[pillar];
  const evidence: string[] = [];
  let positiveHits = 0;
  let negativeHits = 0;

  // Check positive patterns
  for (const pattern of patterns.positive) {
    if (pattern.test(lower)) {
      positiveHits++;
      const match = lower.match(pattern);
      if (match) {
        evidence.push(`✓ ${match[0].substring(0, 80)}`);
      }
    }
  }

  // Check negative patterns
  for (const pattern of patterns.negative) {
    if (pattern.test(lower)) {
      negativeHits++;
      const match = lower.match(pattern);
      if (match) {
        evidence.push(`✗ ${match[0].substring(0, 80)}`);
      }
    }
  }

  // Special handling for claims_evidence - check study size
  if (pillar === 'claims_evidence') {
    const studyMatch = text.match(/(\d+)\s*(?:participants?|subjects?|people|patients?)/i);
    if (studyMatch) {
      const participants = parseInt(studyMatch[1]);
      if (participants >= 200) positiveHits += 3;
      else if (participants >= 50) positiveHits += 2;
      else if (participants >= 10) positiveHits += 1;
      evidence.push(`Study size: ${participants} participants`);
    }
  }

  // Calculate score (lower is better, 0-10 scale)
  // More positive evidence = lower score (less BS)
  // More negative evidence = higher score (more BS)
  let score: number;
  const totalHits = positiveHits + negativeHits;

  if (totalHits === 0) {
    // No evidence found - use default (moderate concern)
    score = 6;
  } else {
    const ratio = positiveHits / (positiveHits + negativeHits + 0.1);
    // ratio of 1.0 = all positive = score of 2
    // ratio of 0.5 = mixed = score of 5
    // ratio of 0.0 = all negative = score of 9
    score = 9 - (ratio * 7);
  }

  // Confidence is based on how much evidence we found
  const confidence = Math.min(1, totalHits / 3);

  return {
    score: roundToHalf(Math.max(0, Math.min(10, score))),
    evidence: evidence.slice(0, 5),
    confidence,
  };
}

// Find red flags from pack configuration in text
function findRedFlagsFromPack(text: string, pack: CategoryPack): string[] {
  const lower = text.toLowerCase();
  const foundFlags: string[] = [];

  for (const flag of pack.red_flags) {
    const flagLower = flag.toLowerCase();
    // Check if the red flag phrase appears in text
    if (lower.includes(flagLower)) {
      foundFlags.push(`Uses "${flag}" language`);
    }
  }

  return foundFlags.slice(0, 5);
}

// Check auto-fail rules and return penalties
function checkAutoFails(text: string, pack: CategoryPack): { totalPenalty: number; triggeredRules: string[] } {
  const lower = text.toLowerCase();
  let totalPenalty = 0;
  const triggeredRules: string[] = [];

  for (const rule of pack.auto_fail_rules) {
    const pattern = new RegExp(rule.pattern, 'i');
    if (pattern.test(lower)) {
      totalPenalty += rule.penalty;
      triggeredRules.push(rule.reason);
    }
  }

  return { totalPenalty, triggeredRules };
}

// Compute confidence from pillar evaluations and evidence count
function computeConfidence(
  pillarResults: Record<Pillar, { score: number; evidence: string[]; confidence: number }>,
  citations: string[],
  evidenceBullets: string[]
): number {
  // Base confidence from pillar evidence
  const pillarConfidences = Object.values(pillarResults).map(r => r.confidence);
  const avgPillarConfidence = pillarConfidences.length > 0
    ? pillarConfidences.reduce((a, b) => a + b, 0) / pillarConfidences.length
    : 0.5;

  // Citation boost
  let citationBoost = 0;
  if (citations.length >= 5) citationBoost = 0.15;
  else if (citations.length >= 2) citationBoost = 0.1;
  else if (citations.length >= 1) citationBoost = 0.05;

  // Evidence bullet boost
  let evidenceBoost = 0;
  if (evidenceBullets.length >= 7) evidenceBoost = 0.1;
  else if (evidenceBullets.length >= 5) evidenceBoost = 0.05;

  const confidence = Math.min(1, avgPillarConfidence * 0.6 + citationBoost + evidenceBoost + 0.2);
  return Math.round(confidence * 100) / 100;
}

// Main pack-based scoring function
function scoreWithPack(
  category: ProductCategory,
  perplexityResponse: string,
  pageContent: string = '',
  citations: string[] = []
): {
  bunkScore: number;
  pillarScores: Partial<Record<Pillar, number>>;
  confidence: number;
  redFlags: string[];
  autoFailReasons: string[];
  verdict: 'low' | 'elevated' | 'high';
  unableToScore: boolean;
  insufficientReason?: string;
} {
  const pack = CATEGORY_PACKS[category] || CATEGORY_PACKS.unknown;
  const combinedText = `${perplexityResponse}\n${pageContent}`;

  // Evaluate each pillar
  const pillarResults: Partial<Record<Pillar, { score: number; evidence: string[]; confidence: number }>> = {};
  const pillarScores: Partial<Record<Pillar, number>> = {};

  for (const pillar of pack.pillars) {
    const result = evaluatePillar(pillar, combinedText, pack.evidence_priority);
    pillarResults[pillar] = result;
    pillarScores[pillar] = result.score;
  }

  // Check auto-fail rules
  const { totalPenalty, triggeredRules } = checkAutoFails(combinedText, pack);

  // Find red flags from pack
  const packRedFlags = findRedFlagsFromPack(combinedText, pack);

  // Also extract general red flags
  const generalRedFlags = extractRedFlags(perplexityResponse);
  const allRedFlags = [...new Set([...packRedFlags, ...generalRedFlags])].slice(0, 8);

  // Add auto-fail reasons to red flags
  if (triggeredRules.length > 0) {
    allRedFlags.unshift(...triggeredRules.map(r => `⚠️ ${r}`));
  }

  // Compute weighted score
  let weightedSum = 0;
  let totalWeight = 0;

  for (const pillar of pack.pillars) {
    const weight = pack.weights[pillar] || 0;
    const score = pillarScores[pillar] ?? (pack.default_pillar_scores?.[pillar] ?? 5);
    weightedSum += score * weight;
    totalWeight += weight;
  }

  let baseScore = totalWeight > 0 ? weightedSum / totalWeight : 5;

  // Apply auto-fail penalty
  baseScore = Math.min(10, baseScore + totalPenalty);

  const bunkScore = roundToHalf(baseScore);

  // Compute confidence
  const confidence = computeConfidence(
    pillarResults as Record<Pillar, { score: number; evidence: string[]; confidence: number }>,
    citations,
    extractEvidenceBullets(perplexityResponse)
  );

  // ALWAYS compute and return a score - never refuse to score
  // Low confidence just means we add disclaimers, not that we refuse
  const verdict = verdictFromScore(bunkScore);

  return {
    bunkScore, // Always return actual score
    pillarScores,
    confidence,
    redFlags: allRedFlags,
    autoFailReasons: triggeredRules,
    verdict,
    // DEPRECATED: kept for backward compat, always false now
    unableToScore: false,
    insufficientReason: undefined,
  };
}

// Legacy weights (for backward compatibility during transition)
const CATEGORY_WEIGHTS: Record<ProductCategory, { he: number; at: number; mo: number; pv: number }> = {
  supplement:     { he: 0.40, at: 0.25, mo: 0.25, pv: 0.10 },
  beauty:         { he: 0.35, at: 0.25, mo: 0.25, pv: 0.15 },
  health_device:  { he: 0.40, at: 0.30, mo: 0.20, pv: 0.10 },
  food_beverage:  { he: 0.30, at: 0.30, mo: 0.25, pv: 0.15 },
  automotive:     { he: 0.00, at: 0.40, mo: 0.30, pv: 0.30 },
  real_estate:    { he: 0.00, at: 0.45, mo: 0.30, pv: 0.25 },
  financial:      { he: 0.10, at: 0.40, mo: 0.35, pv: 0.15 },
  education:      { he: 0.15, at: 0.35, mo: 0.35, pv: 0.15 },
  travel:         { he: 0.00, at: 0.40, mo: 0.30, pv: 0.30 },
  business_guru:  { he: 0.30, at: 0.30, mo: 0.30, pv: 0.10 },
  tech:           { he: 0.10, at: 0.35, mo: 0.35, pv: 0.20 },
  service:        { he: 0.10, at: 0.40, mo: 0.30, pv: 0.20 },
  unknown:        { he: 0.25, at: 0.30, mo: 0.30, pv: 0.15 },
};

// Build Phase 1 request - research prompt with optional page content
export function buildPhase1Request(input: {
  input_type: "url" | "text" | "image";
  input_value: string;
  normalized_input?: string;
  pageContent?: string; // Fetched page content for URL inputs
}): object {
  const normalizedInput = input.normalized_input || input.input_value;
  const hasPageContent = input.pageContent && input.pageContent.length > 100;

  // System message varies based on whether we have page content
  let systemMessage: string;

  if (hasPageContent) {
    // Constrained mode: We have the actual page content
    systemMessage = `You are a thorough product/claims researcher. Your job is to investigate products and marketing claims to help consumers make informed decisions.

IMPORTANT RULES:
1. For PRODUCT DETAILS (price, volume, ingredients, product name), use ONLY the page content provided below. Do NOT use external sources for these facts.
2. For CLAIM VERIFICATION (clinical studies, independent reviews, expert opinions, red flags), you SHOULD use external sources to verify or debunk claims.
3. If the page content shows a price like "$79", report "$79" - do not substitute prices from other sources.

When analyzing:
- Extract product details ONLY from the provided page content
- Research external sources to verify/debunk the CLAIMS made on the page
- Look for clinical studies, their sample sizes, and results
- Find independent reviews and expert opinions
- Identify any red flags or misleading tactics
- Give an honest, balanced assessment`;
  } else {
    // Unconstrained mode: No page content, let Perplexity research freely
    systemMessage = `You are a thorough product/claims researcher. Your job is to investigate products and marketing claims to help consumers make informed decisions.

When analyzing, research and report on:
1. What claims does this product/person make?
2. What evidence supports or contradicts these claims? (clinical studies, reviews, expert opinions)
3. Who is behind this product? Are they credible?
4. What do independent sources say? (not just the company's website)
5. Are there any red flags? (fake reviews, misleading claims, regulatory issues)
6. How does pricing compare to similar products?

Be specific. Cite your sources. If you find clinical studies, mention the sample size and results. If you find negative reviews or complaints, include them. Don't hold back—give an honest, balanced assessment.`;
  }

  let userMessage: string;

  if (input.input_type === 'url' && hasPageContent) {
    // URL with fetched page content - constrained analysis
    userMessage = `Analyze this product page for BS.

SOURCE URL: ${normalizedInput}

=== PAGE CONTENT (use this for product details) ===
${input.pageContent}
=== END PAGE CONTENT ===

Based on the page content above:
1. What product is being sold? (name, price, volume - from page content ONLY)
2. What claims does it make? (extract from page content)
3. Are these claims supported by evidence? (research external sources to verify)
4. Any red flags or concerns? (check for fake reviews, misleading tactics, etc.)
5. Your overall verdict: is this legit or BS?

Remember: Product details (price, size, ingredients) must come from the page content above. Use external research only to verify the CLAIMS.`;
  } else if (input.input_type === 'url') {
    // URL without page content - fallback to unconstrained
    userMessage = `Research this product/page and give me a thorough BS analysis: ${normalizedInput}

Tell me:
- What is being sold and what claims are made?
- Is there real evidence (studies, trials, verified results)?
- Any red flags or concerns?
- Your overall verdict: is this legit or BS?`;
  } else if (input.input_type === 'text') {
    userMessage = `Analyze these product claims for BS:

${normalizedInput}

Research whether these claims are supported by evidence. Look for:
- Scientific studies or clinical trials
- Independent reviews or expert opinions
- Red flags or misleading tactics
- Your overall verdict on legitimacy`;
  } else {
    userMessage = `Research and analyze: ${normalizedInput}`;
  }

  return {
    model: "sonar-pro",
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: userMessage },
    ],
    temperature: 0.2,
    max_tokens: 2000, // More room since we're including page content
  };
}

// =============================================================================
// PHASE 2: Extraction Phase - Parse Perplexity's response into our structure
// =============================================================================

// Detect product category from Perplexity's response and URL
function detectProductCategory(text: string, url?: string): ProductCategory {
  const lower = text.toLowerCase();
  const urlLower = (url || '').toLowerCase();

  // Category keyword definitions
  const categoryKeywords: Record<ProductCategory, string[]> = {
    // Health/wellness categories
    supplement: ['supplement', 'vitamin', 'capsule', 'pill', 'mg', 'dosage',
      'dietary', 'probiotic', 'protein powder', 'amino acid', 'herbal', 'extract',
      'fda disclaimer', 'not intended to diagnose'],

    beauty: ['serum', 'cream', 'skincare', 'anti-aging', 'wrinkle',
      'moisturizer', 'collagen', 'retinol', 'hyaluronic', 'beauty', 'cosmetic',
      'dermatologist', 'skin care', 'facial', 'lash', 'mascara'],

    health_device: ['medical device', 'fda cleared', 'therapeutic',
      'pain relief', 'therapy device', 'wearable health', 'blood pressure',
      'glucose monitor'],

    food_beverage: ['drink', 'beverage', 'food', 'organic', 'non-gmo',
      'nutrition facts', 'calories', 'ingredients list', 'snack', 'meal'],

    // Automotive - HIGH PRIORITY for OEM sites
    automotive: ['vehicle', 'car', 'truck', 'suv', 'sedan', 'mpg', 'horsepower',
      'engine', 'transmission', 'dealership', 'msrp', 'lease', 'financing',
      'test drive', 'manufacturer', 'oem', 'automotive', 'motor', 'nissan',
      'toyota', 'honda', 'ford', 'chevrolet', 'bmw', 'mercedes', 'audi',
      'volkswagen', 'hyundai', 'kia', 'mazda', 'subaru', 'lexus', 'acura'],

    // Real estate
    real_estate: ['property', 'real estate', 'home for sale', 'mortgage',
      'listing', 'mls', 'square feet', 'bedrooms', 'bathrooms', 'realtor',
      'broker', 'open house', 'closing cost', 'down payment', 'zillow', 'redfin'],

    // Financial services
    financial: ['investment', 'stock', 'bond', 'mutual fund', 'etf', 'ira',
      '401k', 'retirement', 'portfolio', 'dividend', 'interest rate', 'apr',
      'credit card', 'loan', 'bank', 'insurance', 'premium', 'deductible',
      'brokerage', 'financial advisor'],

    // Education
    education: ['course', 'university', 'college', 'degree', 'certificate',
      'online learning', 'tuition', 'enrollment', 'curriculum', 'accredited',
      'bootcamp', 'training program', 'certification'],

    // Travel
    travel: ['hotel', 'flight', 'booking', 'reservation', 'vacation', 'resort',
      'airline', 'cruise', 'travel', 'destination', 'itinerary', 'check-in',
      'airbnb', 'expedia', 'tripadvisor'],

    // Business guru (separate from education)
    business_guru: ['masterclass', 'coaching', 'mentor', 'entrepreneur',
      'make money', 'passive income', 'millionaire', 'success secrets', 'wealth',
      'trading secrets', 'crypto', 'forex', 'dropshipping', 'affiliate marketing',
      'get rich', 'financial freedom', 'side hustle'],

    // Tech
    tech: ['gadget', 'app', 'software', 'charger', 'wireless', 'bluetooth',
      'smart home', 'electronic', 'battery', 'specs', 'warranty', 'tech',
      'computer', 'laptop', 'phone', 'tablet'],

    // Generic service
    service: ['service', 'subscription', 'membership', 'plan', 'tier'],

    unknown: [],
  };

  // Count matches for each category
  const scores: Record<ProductCategory, number> = {
    supplement: 0, beauty: 0, tech: 0, business_guru: 0, health_device: 0,
    food_beverage: 0, automotive: 0, real_estate: 0, financial: 0,
    education: 0, travel: 0, service: 0, unknown: 0,
  };

  // Check text content
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) scores[category as ProductCategory]++;
    }
  }

  // URL-based boosts (strong signals)
  if (/nissan|toyota|honda|ford|chevrolet|bmw|mercedes|audi|volkswagen|hyundai|kia|mazda|subaru|lexus|acura|dodge|jeep|ram|gmc|cadillac|buick|lincoln|infiniti|genesis|volvo|porsche|tesla/i.test(urlLower)) {
    scores.automotive += 10; // Strong boost for OEM domains
  }
  if (/zillow|redfin|realtor|trulia|homes\.com/i.test(urlLower)) {
    scores.real_estate += 10;
  }
  if (/fidelity|vanguard|schwab|etrade|robinhood|ameritrade/i.test(urlLower)) {
    scores.financial += 10;
  }
  if (/expedia|booking\.com|airbnb|tripadvisor|hotels\.com|kayak/i.test(urlLower)) {
    scores.travel += 10;
  }
  if (/coursera|udemy|edx|skillshare|linkedin\.com\/learning/i.test(urlLower)) {
    scores.education += 10;
  }

  // Find highest scoring category
  let maxCategory: ProductCategory = 'unknown';
  let maxScore = 0;
  for (const [cat, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      maxCategory = cat as ProductCategory;
    }
  }

  return maxScore >= 2 ? maxCategory : 'unknown';
}

// Extract claims from natural text
function extractClaims(text: string): Array<{ claim: string; support_level: string; why: string }> {
  const claims: Array<{ claim: string; support_level: string; why: string }> = [];
  const lines = text.split(/[.\n]/).map(l => l.trim()).filter(l => l.length > 20);

  // Patterns that indicate claims
  const claimPatterns = [
    /claims?\s+(?:that|to)\s+(.+)/i,
    /promises?\s+(.+)/i,
    /states?\s+(?:that\s+)?(.+)/i,
    /alleges?\s+(.+)/i,
    /suggests?\s+(?:that\s+)?(.+)/i,
  ];

  // Support level indicators
  const supportedIndicators = ['study shows', 'research confirms', 'evidence supports', 'clinically proven', 'verified', 'documented'];
  const mixedIndicators = ['some evidence', 'limited studies', 'mixed results', 'partially supported'];
  const weakIndicators = ['no evidence', 'unsubstantiated', 'not proven', 'questionable', 'dubious'];
  const unsupportedIndicators = ['false', 'misleading', 'debunked', 'no scientific basis', 'pseudoscience'];

  for (const line of lines) {
    for (const pattern of claimPatterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        const claimText = match[1].substring(0, 150);

        // Determine support level from surrounding context
        const context = line.toLowerCase();
        let support_level = 'mixed';
        let why = 'Based on available evidence';

        if (unsupportedIndicators.some(ind => context.includes(ind))) {
          support_level = 'unsupported';
          why = 'No credible evidence found';
        } else if (weakIndicators.some(ind => context.includes(ind))) {
          support_level = 'weak';
          why = 'Insufficient evidence to support claim';
        } else if (supportedIndicators.some(ind => context.includes(ind))) {
          support_level = 'supported';
          why = 'Evidence found to support claim';
        } else if (mixedIndicators.some(ind => context.includes(ind))) {
          support_level = 'mixed';
          why = 'Some evidence exists but results vary';
        }

        claims.push({ claim: claimText, support_level, why });
        break;
      }
    }
  }

  // If we didn't find enough claims via patterns, extract key statements
  if (claims.length < 3) {
    const keyPhrases = text.match(/(?:the product|this product|it|they)\s+(?:claims?|promises?|offers?|provides?)\s+[^.]+/gi) || [];
    for (const phrase of keyPhrases.slice(0, 5)) {
      if (!claims.some(c => c.claim.includes(phrase.substring(0, 30)))) {
        claims.push({
          claim: phrase.substring(0, 150),
          support_level: 'mixed',
          why: 'Extracted from product description'
        });
      }
    }
  }

  return claims.slice(0, 8);
}

// Extract red flags from natural text
function extractRedFlags(text: string): string[] {
  const flags: string[] = [];
  const lower = text.toLowerCase();

  // Direct red flag mentions
  const redFlagPatterns = [
    /red flags?:?\s*([^.]+)/gi,
    /concerns?:?\s*([^.]+)/gi,
    /warning:?\s*([^.]+)/gi,
    /problematic[^.]+/gi,
    /suspicious[^.]+/gi,
    /misleading[^.]+/gi,
  ];

  for (const pattern of redFlagPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const flag = (match[1] || match[0]).trim();
      if (flag.length > 10 && flag.length < 200 && !flags.includes(flag)) {
        flags.push(flag);
      }
    }
  }

  // NOTE: We removed aggressive keyword-based pattern matching here.
  // Previously, patterns like /fake reviews?/i would match ANY mention of these
  // words, even in negative context like "no evidence of fake reviews".
  // Now we only rely on explicit red flag mentions extracted above via the
  // redFlagPatterns (which look for "red flag:", "warning:", etc.)
  // This prevents false positives for legitimate products.

  return flags.slice(0, 8);
}

// Extract evidence bullets from natural text
function extractEvidenceBullets(text: string): string[] {
  const bullets: string[] = [];

  // Look for study mentions
  const studyPattern = /(?:study|trial|research|investigation)[^.]*(?:\d+\s*(?:participants?|subjects?|people|patients?))[^.]*/gi;
  const studyMatches = text.matchAll(studyPattern);
  for (const match of studyMatches) {
    bullets.push(match[0].trim());
  }

  // Look for specific findings
  const findingPatterns = [
    /found that[^.]+/gi,
    /results showed[^.]+/gi,
    /evidence suggests[^.]+/gi,
    /according to[^.]+/gi,
    /research indicates[^.]+/gi,
  ];

  for (const pattern of findingPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const bullet = match[0].trim();
      if (bullet.length > 20 && bullet.length < 200 && !bullets.includes(bullet)) {
        bullets.push(bullet);
      }
    }
  }

  // Look for bullet-like statements in the original text
  const bulletLines = text.split('\n').filter(line =>
    line.trim().startsWith('-') ||
    line.trim().startsWith('•') ||
    line.trim().match(/^\d+\./)
  );
  for (const line of bulletLines) {
    const cleaned = line.replace(/^[-•\d.]+\s*/, '').trim();
    if (cleaned.length > 20 && cleaned.length < 200 && !bullets.includes(cleaned)) {
      bullets.push(cleaned);
    }
  }

  return bullets.slice(0, 10);
}

// Compute subscores based on extracted data and category
function computeSubscoresFromExtraction(
  text: string,
  category: ProductCategory,
  claims: Array<{ claim: string; support_level: string; why: string }>,
  redFlags: string[],
  evidenceBullets: string[]
): { human_evidence: number; authenticity_transparency: number; marketing_overclaim: number; pricing_value: number } {
  const lower = text.toLowerCase();

  // Get category-specific weight (to determine if a dimension matters)
  const weights = CATEGORY_WEIGHTS[category];

  // ==========================================================================
  // HUMAN EVIDENCE SCORE - Category-specific logic
  // ==========================================================================
  let humanEvidence: number;

  if (weights.he === 0) {
    // Categories where human evidence doesn't apply (automotive, travel, real_estate)
    humanEvidence = 5; // Neutral - won't affect final score anyway
  } else if (['supplement', 'beauty', 'health_device', 'food_beverage'].includes(category)) {
    // HEALTH CATEGORIES - clinical studies matter
    humanEvidence = 7; // Default: no strong evidence

    const studyMatch = text.match(/(\d+)\s*(?:participants?|subjects?|people|patients?)/i);
    if (studyMatch) {
      const participants = parseInt(studyMatch[1]);
      if (participants >= 200) humanEvidence = 2;
      else if (participants >= 50) humanEvidence = 3.5;
      else if (participants >= 10) humanEvidence = 5.5;
      else humanEvidence = 6.5;
    }

    if (/randomized controlled trial|rct|double.blind/i.test(lower)) humanEvidence = Math.max(1.5, humanEvidence - 1.5);
    if (/peer.reviewed|published in/i.test(lower)) humanEvidence = Math.max(2, humanEvidence - 1);
    if (/no.{0,20}(?:clinical|scientific).{0,20}(?:studies|evidence|trials)/i.test(lower)) humanEvidence = Math.min(8.5, humanEvidence + 2);
    if (/only testimonials|anecdotal/i.test(lower)) humanEvidence = Math.min(8, humanEvidence + 1.5);

  } else if (category === 'business_guru') {
    // GURU CATEGORY - verifiable credentials/results matter
    humanEvidence = 6; // Default: moderate skepticism

    if (/verified results|documented success|track record/i.test(lower)) humanEvidence = 3;
    if (/forbes|inc magazine|legitimate media/i.test(lower)) humanEvidence = Math.max(2.5, humanEvidence - 1.5);
    if (/no verifiable|fake testimonials|paid actors/i.test(lower)) humanEvidence = 8.5;
    if (/mlm|pyramid|ponzi/i.test(lower)) humanEvidence = 9.5;

  } else {
    // OTHER CATEGORIES - light evidence check
    humanEvidence = 5; // Neutral default

    if (/independent review|consumer reports|expert opinion/i.test(lower)) humanEvidence = 3;
    if (/fake|fabricated|misleading/i.test(lower)) humanEvidence = 8;
  }

  // ==========================================================================
  // AUTHENTICITY/TRANSPARENCY SCORE - Category-specific logic
  // ==========================================================================
  let authenticity: number;

  if (['automotive', 'real_estate', 'travel'].includes(category)) {
    // HIGH-VALUE CATEGORIES - official source verification matters
    authenticity = 4; // Default: moderate trust for legitimate sites

    // Official/OEM indicators (GOOD)
    if (/official|oem|manufacturer|authorized dealer/i.test(lower)) authenticity = 2;
    if (/\.ca$|\.com$|official website/i.test(lower)) authenticity = Math.max(2, authenticity - 1);
    if (/msrp|transparent pricing|no hidden fees/i.test(lower)) authenticity = Math.max(2.5, authenticity - 1);

    // Red flags for these categories
    if (/third.party|reseller|unauthorized/i.test(lower)) authenticity = Math.min(7, authenticity + 2);
    if (/too good to be true|bait.and.switch|hidden fees/i.test(lower)) authenticity = 8;
    if (/scam|fraud|fake dealer/i.test(lower)) authenticity = 9.5;

  } else if (['supplement', 'beauty', 'health_device'].includes(category)) {
    // HEALTH CATEGORIES - third-party testing matters
    authenticity = 6; // Default: moderate concern

    if (/third.party tested|independently verified|coa|certificate of analysis/i.test(lower)) authenticity = 3;
    if (/gmp certified|fda registered facility|nsf certified/i.test(lower)) authenticity = Math.max(2.5, authenticity - 1.5);
    if (/transparent|full ingredient list|clearly labeled/i.test(lower)) authenticity = Math.max(3, authenticity - 1);
    if (/proprietary blend|undisclosed|hidden ingredients/i.test(lower)) authenticity = Math.min(8, authenticity + 2);
    if (/fake|fraudulent|scam/i.test(lower)) authenticity = 9.5;

  } else if (category === 'financial') {
    // FINANCIAL CATEGORY - regulatory compliance matters
    authenticity = 5; // Default

    if (/sec registered|finra|fdic insured|regulated/i.test(lower)) authenticity = 2;
    if (/licensed|certified financial/i.test(lower)) authenticity = Math.max(3, authenticity - 1);
    if (/unregistered|unlicensed|offshore/i.test(lower)) authenticity = 8.5;
    if (/ponzi|fraud|sec enforcement/i.test(lower)) authenticity = 9.5;

  } else {
    // OTHER CATEGORIES - general transparency
    authenticity = 5; // Default

    if (/transparent|verified|official/i.test(lower)) authenticity = 3;
    if (/hidden|undisclosed|fake/i.test(lower)) authenticity = 8;
    if (/scam|fraud/i.test(lower)) authenticity = 9.5;
  }

  // ==========================================================================
  // MARKETING OVERCLAIM SCORE - Mostly universal logic with category adjustments
  // ==========================================================================
  let marketingOverclaim = 5; // Default: some marketing hype expected

  // Check claim support levels (universal)
  const unsupportedCount = claims.filter(c => c.support_level === 'unsupported').length;
  const weakCount = claims.filter(c => c.support_level === 'weak').length;
  const supportedCount = claims.filter(c => c.support_level === 'supported').length;

  if (unsupportedCount >= 3) marketingOverclaim = 8.5;
  else if (unsupportedCount >= 1) marketingOverclaim = 7;
  else if (weakCount >= 2) marketingOverclaim = 6;
  else if (supportedCount >= 3) marketingOverclaim = 3;

  // Category-specific overclaim patterns
  if (['supplement', 'beauty', 'health_device'].includes(category)) {
    if (/miracle|cure|100% effective/i.test(lower)) marketingOverclaim = Math.min(9, marketingOverclaim + 2);
    if (/fda approved/i.test(lower) && /supplement|cosmetic/i.test(lower)) marketingOverclaim = Math.min(9, marketingOverclaim + 1.5); // Misleading
  } else if (category === 'automotive') {
    if (/best in class|#1|unbeatable/i.test(lower)) marketingOverclaim = Math.min(6, marketingOverclaim + 0.5); // Normal car marketing
    if (/misleading fuel economy|fake mpg|emissions scandal/i.test(lower)) marketingOverclaim = 8.5;
  } else if (category === 'business_guru') {
    if (/guaranteed income|make \$\d+k|quit your job/i.test(lower)) marketingOverclaim = Math.min(9, marketingOverclaim + 2);
    if (/limited spots|act now|price going up/i.test(lower)) marketingOverclaim = Math.min(8.5, marketingOverclaim + 1);
  }

  // Universal red flag language
  if (/miracle|revolutionary|breakthrough/i.test(lower) && !['tech'].includes(category)) {
    marketingOverclaim = Math.min(9, marketingOverclaim + 1);
  }
  if (/modest|may help|supports|typical results/i.test(lower)) marketingOverclaim = Math.max(3, marketingOverclaim - 1);

  // ==========================================================================
  // PRICING/VALUE SCORE - Category-specific logic
  // ==========================================================================
  let pricingValue: number;

  if (['automotive', 'real_estate'].includes(category)) {
    // HIGH-VALUE PURCHASES - transparency and hidden fees matter
    pricingValue = 4; // Default: assume transparent for official sites

    if (/msrp|transparent pricing|no hidden fees|all.inclusive/i.test(lower)) pricingValue = 2;
    if (/dealer markup|market adjustment|hidden fees|destination charge/i.test(lower)) pricingValue = 6;
    if (/bait.and.switch|advertised price.{0,20}different|fine print/i.test(lower)) pricingValue = 8.5;

  } else if (category === 'business_guru') {
    // GURU PRICING - often predatory
    pricingValue = 7; // Default: skeptical

    if (/free|affordable|money.back guarantee/i.test(lower)) pricingValue = 5;
    if (/upsell|one.time offer|payment plan/i.test(lower)) pricingValue = 8;
    if (/\$\d{4,}|\$\d+k/i.test(lower)) pricingValue = Math.min(9, pricingValue + 1); // High ticket = more scrutiny

  } else {
    // OTHER CATEGORIES - general value assessment
    pricingValue = 5; // Default: moderate

    if (/overpriced|expensive|high markup|not worth/i.test(lower)) pricingValue = 7.5;
    if (/affordable|good value|reasonably priced|fair price/i.test(lower)) pricingValue = 3;
    if (/subscription trap|hard to cancel|auto.?ship/i.test(lower)) pricingValue = 8;
    if (/money.back guarantee|refund policy/i.test(lower) && !/fine print|conditions/i.test(lower)) {
      pricingValue = Math.max(3, pricingValue - 1);
    }
  }

  // ==========================================================================
  // RED FLAGS PENALTY - Universal but scaled
  // ==========================================================================
  const flagPenalty = Math.min(1.5, redFlags.length * 0.25);
  if (weights.he > 0) humanEvidence = Math.min(10, humanEvidence + flagPenalty * 0.5);
  authenticity = Math.min(10, authenticity + flagPenalty * 0.5);
  marketingOverclaim = Math.min(10, marketingOverclaim + flagPenalty);
  pricingValue = Math.min(10, pricingValue + flagPenalty * 0.3);

  // Round to 0.5
  return {
    human_evidence: roundToHalf(Math.max(0, Math.min(10, humanEvidence))),
    authenticity_transparency: roundToHalf(Math.max(0, Math.min(10, authenticity))),
    marketing_overclaim: roundToHalf(Math.max(0, Math.min(10, marketingOverclaim))),
    pricing_value: roundToHalf(Math.max(0, Math.min(10, pricingValue))),
  };
}

// Extract a summary from natural text
function extractSummary(text: string): string {
  // Look for verdict/conclusion sections
  const verdictPatterns = [
    /(?:verdict|conclusion|overall|in summary|bottom line)[:\s]+([^.]+\.)/i,
    /(?:this product|this is)\s+(?:appears to be|seems|is)\s+([^.]+\.)/i,
  ];

  for (const pattern of verdictPatterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[1].length > 30) {
      return match[1].trim();
    }
  }

  // Fall back to first substantive paragraph
  const paragraphs = text.split(/\n\n+/).filter(p => p.length > 100);
  if (paragraphs.length > 0) {
    // Get first 2-3 sentences
    const sentences = paragraphs[0].match(/[^.!?]+[.!?]+/g) || [];
    return sentences.slice(0, 3).join(' ').trim().substring(0, 500);
  }

  return text.substring(0, 300).trim();
}

// Main Phase 2 extraction function - uses NEW scoring schema v2.0
function extractStructuredData(
  perplexityResponse: string,
  citations: string[] = [],
  sourceUrl?: string,
  pageContent: string = ''
): BunkdAnalysisResult {
  // ========================================================================
  // NEW SCORING SCHEMA v2.0
  // ========================================================================

  // 1. Detect category candidates using new schema
  const categoryCandidates = detectCategoryCandidates(perplexityResponse, sourceUrl);
  const primaryCategory = categoryCandidates[0] || BUNKD_SCORING_CONFIG.categoryDetection.fallback;

  console.log(`    Category detected: ${primaryCategory.id} (confidence: ${(primaryCategory.confidence * 100).toFixed(0)}%)`);

  // 2. Extract primitives from text
  const primitives = extractPrimitivesFromText(perplexityResponse, pageContent);

  console.log(`    Primitives extracted:`);
  console.log(`      evidence_quality: ${primitives.evidence_quality.toFixed(2)}`);
  console.log(`      transparency: ${primitives.transparency.toFixed(2)}`);
  console.log(`      presentation_risk: ${primitives.presentation_risk.toFixed(2)}`);

  // 3. Extract signals for the primary category
  const signals = extractSignalsForCategory(primaryCategory.id, perplexityResponse, pageContent);
  const signalsByCategory: Partial<Record<CategoryId, Signal[]>> = {
    [primaryCategory.id]: signals,
  };

  console.log(`    Signals found: ${signals.length}`);

  // 4. Score using new schema
  const scoreResult = scoreBSMeter({
    primitives,
    categoryCandidates,
    signalsByCategory,
  });

  console.log(`    Score breakdown:`);
  console.log(`      baseRisk01: ${scoreResult.baseRisk01.toFixed(3)}`);
  console.log(`      harmMultiplier: ${scoreResult.harmMultiplier}`);
  console.log(`      penalties01: ${scoreResult.overlay.penalties01.toFixed(3)}`);
  console.log(`      credits01: ${scoreResult.overlay.credits01.toFixed(3)}`);
  console.log(`      finalScore10: ${scoreResult.finalScore10}`);

  // 5. Map to legacy subscores for backward compatibility
  const legacySubscores = mapToLegacySubscores(primitives, scoreResult);

  console.log(`    Legacy subscores: HE=${legacySubscores.human_evidence}, AT=${legacySubscores.authenticity_transparency}, MO=${legacySubscores.marketing_overclaim}, PV=${legacySubscores.pricing_value}`);

  // ========================================================================
  // EXTRACT DISPLAY CONTENT (unchanged)
  // ========================================================================
  const claims = extractClaims(perplexityResponse);
  const redFlags = extractRedFlags(perplexityResponse);
  const evidenceBullets = extractEvidenceBullets(perplexityResponse);
  const summary = extractSummary(perplexityResponse);

  // Format citations
  const formattedCitations = citations.map((url, i) => ({
    title: `Source ${i + 1}`,
    url: url,
  }));

  // Ensure minimums for UI
  const finalClaims = claims.length >= 3 ? claims : [
    ...claims,
    { claim: 'Product makes various marketing claims', support_level: 'mixed', why: 'Requires further verification' },
    { claim: 'Benefits described on product page', support_level: 'mixed', why: 'Based on manufacturer claims' },
    { claim: 'Results may vary by individual', support_level: 'mixed', why: 'Common disclaimer' },
  ].slice(0, 5);

  // Don't pad red flags with generic warnings - if no red flags were found,
  // that's a GOOD sign and we should show an empty/minimal list.
  // Only show red flags that were actually detected with evidence.
  const finalRedFlags = redFlags.slice(0, 5);

  const finalEvidence = evidenceBullets.length >= 5 ? evidenceBullets : [
    ...evidenceBullets,
    'Analysis based on publicly available information',
    'Independent reviews may provide additional perspective',
    'Product claims extracted from source material',
    'Evidence quality varies by claim',
    'Further research recommended for important decisions',
  ].slice(0, 7);

  // ========================================================================
  // CONFIDENCE HANDLING - ALWAYS return a score with confidence label
  // ========================================================================
  // Use category confidence for overall confidence (this is what scoreBSMeter uses)
  const categoryConfidence = scoreResult.category.confidence;

  // Compute confidence level and explanation
  const confidenceLevel = toConfidenceLevel(categoryConfidence);
  const confExplanation = confidenceExplanation(confidenceLevel);

  // ALWAYS compute score and verdict - never refuse to score
  const bunkScore = scoreResult.finalScore10;
  const verdict = getVerdictFromScore(bunkScore);

  // Get aligned verdict fields from verdict-mapping
  const verdictFields = getVerdictFields(bunkScore);

  // Sanitize summary for score alignment
  const sanitizedSummary = sanitizeSummary(summary, bunkScore);

  // ========================================================================
  // PHASE 2: CONTENT SANITIZATION FOR TONE CONSISTENCY
  // ========================================================================
  // Apply content sanitization to all text fields based on score
  console.log('  📝 Applying content sanitization and markdown stripping...');

  // Sanitize summary content (in addition to verdict alignment) + strip markdown
  const fullySanitizedSummary = stripMarkdown(sanitizeContentText(sanitizedSummary, bunkScore));

  // Sanitize evidence bullets + strip markdown
  const sanitizedEvidence = finalEvidence.map(bullet =>
    stripMarkdown(sanitizeContentText(bullet, bunkScore))
  );

  // Sanitize red flags, strip markdown, and deduplicate
  const sanitizedRedFlags = finalRedFlags.map(flag =>
    stripMarkdown(sanitizeContentText(flag, bunkScore))
  );
  // Phase 3: Cap at 4 red flags max after deduplication
  const dedupedRedFlags = deduplicateRedFlags(sanitizedRedFlags).slice(0, 4);

  // Sanitize key claims (both claim text and why field) + strip markdown
  const sanitizedClaims = finalClaims.map(claim => ({
    ...claim,
    claim: stripMarkdown(sanitizeContentText(claim.claim, bunkScore)),
    why: stripMarkdown(sanitizeContentText(claim.why, bunkScore)),
  }));

  // ========================================================================
  // PHASE 3: UX POLISH - Generate risk_signals and claims_summary
  // ========================================================================

  // Convert red flags to risk_signals with severity (based on score band)
  const baseSeverity = bunkScore >= 8 ? 4 : bunkScore >= 6.5 ? 3 : bunkScore >= 4 ? 2 : 1;
  const riskSignals = dedupedRedFlags.map((text, index) => ({
    text,  // Already stripped above
    // First flag gets base severity, subsequent flags get decreasing severity (min 1)
    severity: Math.max(1, baseSeverity - Math.floor(index / 2)),
  }));

  // Generate claims_summary from sanitized claims
  const supportedCount = sanitizedClaims.filter(c => c.support_level === 'supported').length;
  const mixedCount = sanitizedClaims.filter(c => c.support_level === 'mixed').length;
  const weakCount = sanitizedClaims.filter(c => c.support_level === 'weak').length;
  const unsupportedCount = sanitizedClaims.filter(c => c.support_level === 'unsupported').length;

  const statusParts: string[] = [];
  if (supportedCount > 0) statusParts.push(`${supportedCount} supported`);
  if (mixedCount > 0) statusParts.push(`${mixedCount} mixed`);
  if (weakCount > 0) statusParts.push(`${weakCount} weak`);
  if (unsupportedCount > 0) statusParts.push(`${unsupportedCount} unsupported`);

  const claimsSummary = {
    claims: sanitizedClaims.slice(0, 3).map(c => c.claim),  // Already stripped above
    status: statusParts.length > 0 ? statusParts.join(', ') : 'No claims analyzed',
  };

  const result: BunkdAnalysisResult = {
    version: 'bunkd_v1',
    scoring_version: '2.0',
    summary: fullySanitizedSummary,
    evidence_bullets: sanitizedEvidence,
    key_claims: sanitizedClaims as any,
    red_flags: dedupedRedFlags,
    risk_signals: riskSignals,
    claims_summary: claimsSummary,
    subscores: legacySubscores,
    // New fields for v2.0
    category: primaryCategory.id,
    category_confidence: primaryCategory.confidence,
    pillar_scores: primitives,
    score_breakdown: {
      baseRisk01: scoreResult.baseRisk01,
      harmMultiplier: scoreResult.harmMultiplier,
      penalties01: scoreResult.overlay.penalties01,
      credits01: scoreResult.overlay.credits01,
      confidenceAdjusted01: scoreResult.confidenceAdjusted01,
    },
    citations: formattedCitations,
    product_details: {
      name: 'Extracted from analysis',
      clinical_studies: evidenceBullets.some(b => /study|trial/i.test(b)) ? 'Referenced in analysis' : 'Not found',
    },
    // ALWAYS set score and verdict
    bunk_score: bunkScore,
    verdict: verdict,
    verdict_label: verdictFields.verdict_label,
    secondary_verdict: verdictFields.secondary_verdict,
    verdict_text: verdictFields.verdict_text,
    meter_label: verdictFields.meter_label,
    // Confidence fields
    confidence: categoryConfidence,
    confidence_level: confidenceLevel,
    confidence_explanation: confExplanation,
    // DEPRECATED: kept for backward compat, always false now
    unable_to_score: false,
  };

  // Add disclaimers for low/medium confidence
  if (confidenceLevel === 'low') {
    result.disclaimers = ['Limited evidence available - treat as a rough estimate'];
    console.log(`    ⚠️  Low confidence score: ${bunkScore} (${verdict}) - ${confExplanation}`);
  } else if (confidenceLevel === 'medium') {
    result.disclaimers = ['Score based on partial evidence - treat as preliminary assessment'];
    console.log(`    ⚠️  Medium confidence score: ${bunkScore} (${verdict}) - ${confExplanation}`);
  } else {
    console.log(`    ✓ High confidence score: ${bunkScore} (${verdict}) - ${confExplanation}`);
  }

  return result;
}

// Helper to get verdict from score (uses new interpretation ranges)
function getVerdictFromScore(score: number): "low" | "elevated" | "high" {
  const { interpretation } = BUNKD_SCORING_CONFIG.output;
  if (score <= interpretation.low.range[1]) return "low";
  if (score <= interpretation.mid.range[1]) return "elevated";
  return "high";
}

// Helper to convert numeric confidence to a user-friendly level
function toConfidenceLevel(conf: number): "low" | "medium" | "high" {
  if (conf >= 0.75) return "high";
  if (conf >= 0.5) return "medium";
  return "low";
}

// Helper to provide explanation text for confidence level
function confidenceExplanation(level: "low" | "medium" | "high"): string {
  if (level === "high") return "Strong evidence coverage across sources.";
  if (level === "medium") return "Some signals missing; treat as an estimate.";
  return "Limited evidence or unclear category; treat as a rough estimate.";
}

// Legacy function for backward compatibility - now wraps two-phase approach
export function buildPerplexityRequestBody(input: {
  input_type: "url" | "text" | "image";
  input_value: string;
  normalized_input?: string;
  cache_key?: string;
}): object {
  // Now just returns Phase 1 request
  return buildPhase1Request(input);
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
function parseAndValidateResponse(rawContent: string, pageContentLength?: number): {
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

    // Step 3: Check for insufficient data BEFORE scoring
    const insufficientDataCheck = detectInsufficientData(
      parseResult.result,
      pageContentLength
    );

    // Step 4: Adjust confidence and red_flags based on citation count
    let confidence = 0.7; // Default confidence
    let redFlags = [...parseResult.result.red_flags];

    if (parseResult.result.citations.length < 2) {
      confidence = Math.min(confidence, 0.5);
      redFlags.push('Limited citations returned; treat evidence strength cautiously.');
    }

    // Step 5: Build final result - ALWAYS compute and return a score
    // Adjust confidence if insufficient data was detected
    if (insufficientDataCheck.insufficient) {
      confidence = Math.min(confidence, 0.4); // Lower confidence but still score
      console.log(`  ⚠️  Limited data detected: ${insufficientDataCheck.reason} - scoring with low confidence`);
    }

    // ALWAYS compute score and verdict
    const computedScore = computeBunkScore(parseResult.result.subscores);
    const computedVerdict = verdictFromScore(computedScore);

    // Get aligned verdict fields from verdict-mapping
    const verdictFields = getVerdictFields(computedScore);

    // Compute confidence level and explanation
    const confidenceLevel = toConfidenceLevel(confidence);
    const confExplanation = confidenceExplanation(confidenceLevel);

    // Build disclaimers based on confidence level
    let disclaimers = parseResult.result.disclaimers || [];
    if (confidenceLevel === 'low') {
      disclaimers = [...disclaimers, 'Limited evidence available - treat as a rough estimate'];
    } else if (confidenceLevel === 'medium') {
      disclaimers = [...disclaimers, 'Score based on partial evidence - treat as preliminary assessment'];
    }

    // Sanitize summary for score alignment
    const sanitizedSummary = sanitizeSummary(parseResult.result.summary, computedScore);

    // ========================================================================
    // PHASE 2: CONTENT SANITIZATION FOR TONE CONSISTENCY (FALLBACK PATH)
    // ========================================================================
    console.log('  📝 Applying content sanitization and markdown stripping (fallback path)...');

    // Sanitize summary content + strip markdown
    const fullySanitizedSummary = stripMarkdown(sanitizeContentText(sanitizedSummary, computedScore));

    // Sanitize evidence bullets + strip markdown
    const sanitizedEvidence = parseResult.result.evidence_bullets.map((bullet: string) =>
      stripMarkdown(sanitizeContentText(bullet, computedScore))
    );

    // Sanitize red flags, strip markdown, and deduplicate
    const sanitizedRedFlags = redFlags.map((flag: string) =>
      stripMarkdown(sanitizeContentText(flag, computedScore))
    );
    // Phase 3: Cap at 4 red flags max after deduplication
    const dedupedRedFlags = deduplicateRedFlags(sanitizedRedFlags).slice(0, 4);

    // Sanitize key claims + strip markdown
    const sanitizedClaims = parseResult.result.key_claims.map((claim: any) => ({
      ...claim,
      claim: stripMarkdown(sanitizeContentText(claim.claim, computedScore)),
      why: stripMarkdown(sanitizeContentText(claim.why, computedScore)),
    }));

    // ========================================================================
    // PHASE 3: UX POLISH - Generate risk_signals and claims_summary (FALLBACK)
    // ========================================================================

    // Convert red flags to risk_signals with severity
    const baseSeverity = computedScore >= 8 ? 4 : computedScore >= 6.5 ? 3 : computedScore >= 4 ? 2 : 1;
    const riskSignals = dedupedRedFlags.map((text: string, index: number) => ({
      text,
      severity: Math.max(1, baseSeverity - Math.floor(index / 2)),
    }));

    // Generate claims_summary
    const supportedCount = sanitizedClaims.filter((c: any) => c.support_level === 'supported').length;
    const mixedCount = sanitizedClaims.filter((c: any) => c.support_level === 'mixed').length;
    const weakCount = sanitizedClaims.filter((c: any) => c.support_level === 'weak').length;
    const unsupportedCount = sanitizedClaims.filter((c: any) => c.support_level === 'unsupported').length;

    const statusParts: string[] = [];
    if (supportedCount > 0) statusParts.push(`${supportedCount} supported`);
    if (mixedCount > 0) statusParts.push(`${mixedCount} mixed`);
    if (weakCount > 0) statusParts.push(`${weakCount} weak`);
    if (unsupportedCount > 0) statusParts.push(`${unsupportedCount} unsupported`);

    const claimsSummary = {
      claims: sanitizedClaims.slice(0, 3).map((c: any) => c.claim),
      status: statusParts.length > 0 ? statusParts.join(', ') : 'No claims analyzed',
    };

    const finalResult: BunkdAnalysisResult = {
      version: 'bunkd_v1',
      bunk_score: computedScore,
      confidence: confidence,
      confidence_level: confidenceLevel,
      confidence_explanation: confExplanation,
      verdict: computedVerdict,
      verdict_label: verdictFields.verdict_label,
      secondary_verdict: verdictFields.secondary_verdict,
      verdict_text: verdictFields.verdict_text,
      meter_label: verdictFields.meter_label,
      // DEPRECATED: kept for backward compat, always false now
      unable_to_score: false,
      summary: fullySanitizedSummary,
      evidence_bullets: sanitizedEvidence,
      subscores: parseResult.result.subscores,
      key_claims: sanitizedClaims,
      red_flags: dedupedRedFlags,
      risk_signals: riskSignals,
      claims_summary: claimsSummary,
      citations: parseResult.result.citations,
      product_details: parseResult.result.product_details,
      disclaimers: disclaimers.length > 0 ? disclaimers : undefined,
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

// Process a single job using two-phase approach
async function processJob(job: Job): Promise<void> {
  console.log(`[${job.id.substring(0, 8)}] Processing job (attempt ${job.attempts})`);
  console.log(`  Input type: ${job.input_type}`);
  console.log(`  Input length: ${job.normalized_input.length}`);

  try {
    // =================================================================
    // PRE-PHASE: Fetch page content for URL inputs
    // =================================================================
    let pageContent: string | undefined;

    if (job.input_type === 'url') {
      console.log(`  🌐 Fetching page content from URL...`);
      const fetchResult = await fetchPageText(job.normalized_input);

      if (fetchResult.success) {
        pageContent = fetchResult.content;
        console.log(`  ✓ Page fetched: ${pageContent.length} characters`);

        // Log a preview of key product details found
        const priceMatch = pageContent.match(/\$[\d,.]+/g);
        const volumeMatch = pageContent.match(/\d+\s*(?:ml|oz|g|mg)/gi);
        if (priceMatch) console.log(`    Prices found: ${priceMatch.slice(0, 3).join(', ')}${priceMatch.length > 3 ? '...' : ''}`);
        if (volumeMatch) console.log(`    Volumes found: ${volumeMatch.slice(0, 3).join(', ')}${volumeMatch.length > 3 ? '...' : ''}`);
      } else {
        console.warn(`  ⚠️  Failed to fetch page: ${fetchResult.error}`);
        console.log(`  Continuing with Perplexity-only research...`);
      }
    }

    // =================================================================
    // TIERED ROUTING: Determine analysis path based on input type/content
    // =================================================================
    let hasDisambiguationFailed = false;

    // For text inputs, check if user already selected a disambiguation candidate
    if (job.input_type === 'text' && job.selected_candidate_id) {
      console.log(`  ✓ Using selected interpretation: "${job.interpreted_as || job.selected_candidate_id}"`);
    }

    // Determine routing tier
    const routing = determineRoutingTier(
      job.input_type as 'url' | 'text' | 'image',
      job.normalized_input,
      hasDisambiguationFailed
    );
    console.log(`  🎯 ROUTING: Tier ${routing.tier} (${routing.mode}) - ${routing.reason}`);

    // -------------------------------------------------------------------------
    // TIER 1: Commodity - Instant zero BS score
    // -------------------------------------------------------------------------
    if (routing.tier === 1 && routing.commodity) {
      console.log(`  🥬 TIER 1: Bare commodity detected: "${routing.commodity}"`);
      console.log(`  ✓ Skipping Perplexity - returning BS Meter = 0.0`);

      const result = buildCommodityResultV2(routing.commodity);

      const { error: updateError } = await supabase
        .from('analysis_jobs')
        .update({
          status: 'done',
          bs_score: result.bunk_score,
          result_json: result,
          model_used: 'tier1-commodity',
          perplexity_latency_ms: 0,
        })
        .eq('id', job.id);

      if (updateError) {
        console.error(`  ❌ Failed to update job:`, updateError);
        throw updateError;
      }

      console.log(`  ✓ Job completed (Tier 1 commodity)`);
      return;
    }

    // -------------------------------------------------------------------------
    // TIER 2: Scam Archetype - Instant high BS score
    // -------------------------------------------------------------------------
    if (routing.tier === 2 && routing.archetypeMatch) {
      const { archetype, confidence, matchedSignals } = routing.archetypeMatch;
      console.log(`  🚨 TIER 2: Scam archetype detected: "${archetype.name}"`);
      console.log(`    Confidence: ${Math.round(confidence * 100)}%`);
      console.log(`    Matched signals: ${matchedSignals.join(', ')}`);
      console.log(`  ✓ Skipping Perplexity - returning high BS score`);

      const result = buildArchetypeResult(routing.archetypeMatch, job.normalized_input);

      const { error: updateError } = await supabase
        .from('analysis_jobs')
        .update({
          status: 'done',
          bs_score: result.bunk_score,
          result_json: result,
          model_used: 'tier2-archetype',
          perplexity_latency_ms: 0,
        })
        .eq('id', job.id);

      if (updateError) {
        console.error(`  ❌ Failed to update job:`, updateError);
        throw updateError;
      }

      console.log(`  ✓ Job completed (Tier 2 archetype: ${archetype.name}, score: ${result.bunk_score})`);
      return;
    }

    // -------------------------------------------------------------------------
    // TIER 3: Full Analysis - But first check for disambiguation (text only)
    // -------------------------------------------------------------------------
    if (routing.tier === 3 && job.input_type === 'text' && !job.selected_candidate_id) {
      const ambiguityCheck = isAmbiguousQuery(job.normalized_input);
      if (ambiguityCheck.isAmbiguous) {
        console.log(`  🔀 DISAMBIGUATION: Ambiguous query detected: "${job.normalized_input}" (${ambiguityCheck.reason})`);

        // Check cache first
        let candidates = await getCachedDisambiguation(job.normalized_input);

        if (!candidates || candidates.length === 0) {
          console.log(`  📡 Fetching disambiguation candidates from Perplexity...`);
          candidates = await getDisambiguationCandidates(job.normalized_input);

          if (candidates.length > 0) {
            await cacheDisambiguation(job.normalized_input, candidates);
            console.log(`  ✓ Cached ${candidates.length} disambiguation candidates`);
          }
        }

        if (candidates && candidates.length > 0) {
          const result = buildDisambiguationResult(job.normalized_input, candidates);

          const { error: updateError } = await supabase
            .from('analysis_jobs')
            .update({
              status: 'done',
              bs_score: null,
              result_json: result,
              model_used: 'disambiguation',
              perplexity_latency_ms: 0,
            })
            .eq('id', job.id);

          if (updateError) {
            console.error(`  ❌ Failed to update job:`, updateError);
            throw updateError;
          }

          console.log(`  ✓ Job completed (needs disambiguation - ${candidates.length} candidates)`);
          return;
        } else {
          // No disambiguation candidates found - re-route with disambiguation failed flag
          console.log(`  ⚠️ No disambiguation candidates found, re-checking routing...`);
          hasDisambiguationFailed = true;

          const reRouting = determineRoutingTier(
            job.input_type as 'url' | 'text' | 'image',
            job.normalized_input,
            hasDisambiguationFailed
          );

          // If now Tier 4, return unable-to-assess
          if (reRouting.tier === 4) {
            console.log(`  ❓ TIER 4: Unable to assess - insufficient context`);
            const result = buildUnableToAssessResult();

            const { error: updateError } = await supabase
              .from('analysis_jobs')
              .update({
                status: 'done',
                bs_score: null,
                result_json: result,
                model_used: 'tier4-unable-to-assess',
                perplexity_latency_ms: 0,
              })
              .eq('id', job.id);

            if (updateError) {
              console.error(`  ❌ Failed to update job:`, updateError);
              throw updateError;
            }

            console.log(`  ✓ Job completed (Tier 4 unable to assess)`);
            return;
          }

          // Otherwise continue with full analysis
          console.log(`  Proceeding with full analysis (Tier 3)`);
        }
      }
    }

    // -------------------------------------------------------------------------
    // TIER 4: Unable to Assess (direct route without disambiguation attempt)
    // -------------------------------------------------------------------------
    if (routing.tier === 4) {
      console.log(`  ❓ TIER 4: Unable to assess - ${routing.reason}`);
      const result = buildUnableToAssessResult();

      const { error: updateError } = await supabase
        .from('analysis_jobs')
        .update({
          status: 'done',
          bs_score: null,
          result_json: result,
          model_used: 'tier4-unable-to-assess',
          perplexity_latency_ms: 0,
        })
        .eq('id', job.id);

      if (updateError) {
        console.error(`  ❌ Failed to update job:`, updateError);
        throw updateError;
      }

      console.log(`  ✓ Job completed (Tier 4 unable to assess)`);
      return;
    }

    // -------------------------------------------------------------------------
    // TIER 3: Full Perplexity Analysis (continue below)
    // -------------------------------------------------------------------------
    console.log(`  📊 TIER 3: Proceeding with full Perplexity analysis...`);

    // If we detected an archetype with lower confidence, log it for context
    if (routing.archetypeMatch) {
      console.log(`    (Archetype hint: "${routing.archetypeMatch.archetype.name}" at ${Math.round(routing.archetypeMatch.confidence * 100)}% confidence)`);
    }

    // =================================================================
    // PHASE 1: Research with page content constraint (if available)
    // =================================================================
    console.log(`  📡 PHASE 1: Research ${pageContent ? '(with page content constraint)' : '(unconstrained)'}...`);

    const phase1Request = buildPhase1Request({
      input_type: job.input_type as "url" | "text" | "image",
      input_value: job.input_value,
      normalized_input: job.normalized_input,
      pageContent: pageContent,
    });

    // Log user message preview (truncated since it may include page content)
    const userMsg = (phase1Request as any).messages?.find((m: any) => m.role === 'user')?.content || '';
    const previewEnd = userMsg.indexOf('=== PAGE CONTENT');
    const preview = previewEnd > 0 ? userMsg.substring(0, previewEnd) : userMsg.substring(0, 100);
    console.log(`  User message preview: ${preview.trim()}...`);

    // Call Perplexity for research
    const { response, latencyMs } = await callPerplexity(phase1Request);
    console.log(`  ✓ Perplexity responded in ${latencyMs}ms`);

    // Extract content
    const researchContent = response.choices[0]?.message?.content || '';
    if (!researchContent) {
      throw new Error('Empty response from Perplexity');
    }

    // Log research response preview
    console.log(`  Research response (first 300 chars): ${researchContent.substring(0, 300)}...`);

    // Extract citations from Perplexity response
    const citations = response.citations || [];
    console.log(`  Citations found: ${citations.length}`);

    // =================================================================
    // PHASE 2: Extract structured data from natural language response
    // =================================================================
    console.log(`  🔬 PHASE 2: Extraction (parsing research into structured data)...`);

    // Pass URL for category detection (helps identify OEM sites, travel sites, etc.)
    // Also pass pageContent for pack-based scoring
    const sourceUrl = job.input_type === 'url' ? job.normalized_input : undefined;
    const result = extractStructuredData(researchContent, citations, sourceUrl, pageContent || '');

    console.log(`  ✓ Subscores computed: HE=${result.subscores.human_evidence}, AT=${result.subscores.authenticity_transparency}, MO=${result.subscores.marketing_overclaim}, PV=${result.subscores.pricing_value}`);
    console.log(`  ✓ Extracted: ${result.key_claims.length} claims, ${result.red_flags.length} red flags, ${result.evidence_bullets.length} evidence points`);

    // =================================================================
    // PHASE 3: Post-Perplexity Archetype Detection & Score Boost
    // =================================================================
    // Run archetype detection on the research content (not the URL)
    // This catches scam patterns that the base scoring might underweight
    const postArchetypeMatch = detectClaimArchetype(researchContent + '\n' + (pageContent || ''));

    if (postArchetypeMatch && postArchetypeMatch.confidence >= 0.70) {
      const { archetype, confidence, matchedSignals } = postArchetypeMatch;
      const archetypeMinScore = archetype.bsRange.min;

      console.log(`  🎯 POST-PERPLEXITY ARCHETYPE DETECTED: "${archetype.name}"`);
      console.log(`     Confidence: ${Math.round(confidence * 100)}%`);
      console.log(`     Matched signals: ${matchedSignals.slice(0, 5).join(', ')}${matchedSignals.length > 5 ? '...' : ''}`);
      console.log(`     Archetype score range: ${archetype.bsRange.min} - ${archetype.bsRange.max}`);

      // Check if archetype minimum score is higher than current score
      const currentScore = result.bunk_score ?? 0;
      if (archetypeMinScore > currentScore) {
        const originalScore = currentScore;
        // Boost to archetype minimum + small bump based on confidence
        const confidenceBoost = (confidence - 0.70) * 2; // 0-0.6 based on confidence 0.70-1.0
        const boostedScore = Math.min(
          archetype.bsRange.max,
          archetypeMinScore + confidenceBoost
        );
        result.bunk_score = Math.round(boostedScore * 10) / 10;

        console.log(`  ⚡ ARCHETYPE BOOST APPLIED: "${archetype.name}" raised score from ${originalScore} to ${result.bunk_score}`);

        // Update verdict fields based on new score
        const boostedVerdictFields = getVerdictFields(result.bunk_score);
        result.verdict = boostedVerdictFields.verdict;
        result.verdict_label = boostedVerdictFields.verdict_label;
        result.verdict_text = boostedVerdictFields.verdict_text;
        result.meter_label = boostedVerdictFields.meter_label;

        // Add archetype info to result
        result.analysis_mode = 'claim_archetype';
        result.claim_archetype = {
          name: archetype.name,
          confidence,
          matched_signals: matchedSignals,
        };

        // Merge archetype red flags with existing ones (avoid duplicates)
        const archetypeRedFlags = archetype.redFlagsTemplate.filter(
          flag => !result.red_flags.some(existing => existing.toLowerCase().includes(flag.toLowerCase().substring(0, 20)))
        );
        const mergedRedFlags = [...result.red_flags, ...archetypeRedFlags];

        // ================================================================
        // RE-APPLY ALL SANITIZATION FOR BOOSTED SCORE
        // All derived fields must be regenerated when score changes
        // ================================================================
        console.log(`  📝 Re-applying sanitization for boosted score ${result.bunk_score}...`);

        // 1. Re-sanitize summary for the NEW boosted score (don't add internal prefix)
        result.summary = sanitizeContentText(result.summary, result.bunk_score);
        result.summary = stripMarkdown(result.summary);

        // 2. Clean up, strip markdown, deduplicate, and cap red flags at 4
        result.red_flags = mergedRedFlags
          .map(flag => stripMarkdown(flag
            .replace(/^and\s+/i, '')        // Remove "and " prefix
            .replace(/^\s*-\s*/, '')        // Remove "- " prefix
            .replace(/^\s*•\s*/, '')        // Remove "• " prefix
            .trim()
          ))
          .filter(flag => flag.length > 0);
        result.red_flags = deduplicateRedFlags(result.red_flags).slice(0, 4);

        // 3. Regenerate risk_signals with correct severity for boosted score
        const boostedSeverity = result.bunk_score >= 8 ? 4 : result.bunk_score >= 6.5 ? 3 : 2;
        result.risk_signals = result.red_flags.map((flag, index) => ({
          text: stripMarkdown(flag),
          severity: Math.max(1, boostedSeverity - Math.floor(index / 2)),
        }));

        // 4. Update secondary_verdict from the band for the boosted score
        result.secondary_verdict = boostedVerdictFields.secondary_verdict;

        // 5. Regenerate claims_summary for boosted score
        if (result.key_claims && result.key_claims.length > 0) {
          const supportedCount = result.key_claims.filter(c => c.support_level === 'supported').length;
          const mixedCount = result.key_claims.filter(c => c.support_level === 'mixed').length;
          const weakCount = result.key_claims.filter(c => c.support_level === 'weak').length;
          const unsupportedCount = result.key_claims.filter(c => c.support_level === 'unsupported').length;

          const statusParts: string[] = [];
          if (supportedCount > 0) statusParts.push(`${supportedCount} supported`);
          if (mixedCount > 0) statusParts.push(`${mixedCount} mixed`);
          if (weakCount > 0) statusParts.push(`${weakCount} weak`);
          if (unsupportedCount > 0) statusParts.push(`${unsupportedCount} unsupported`);

          result.claims_summary = {
            claims: result.key_claims.slice(0, 3).map(c => stripMarkdown(c.claim)),
            status: statusParts.length > 0 ? statusParts.join(', ') : 'Claims require verification',
          };
        }

        console.log(`  ✓ Sanitization complete: ${result.red_flags.length} red flags, ${result.risk_signals?.length || 0} risk signals`);
      } else {
        console.log(`  ℹ️ Archetype detected but score already adequate (${currentScore} >= ${archetypeMinScore})`);
      }
    }

    // Log final score result with confidence level
    const confidenceIcon = result.confidence_level === 'high' ? '✓' : '⚠️';
    console.log(`  ${confidenceIcon} Final Bunk Score: ${result.bunk_score} | Verdict: ${result.verdict} | Confidence: ${result.confidence_level} (${(result.confidence * 100).toFixed(0)}%)`);
    if (result.confidence_level !== 'high') {
      console.log(`     ${result.confidence_explanation}`);
    }

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

    console.log(`  ✓ Job completed successfully (two-phase)`);

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
