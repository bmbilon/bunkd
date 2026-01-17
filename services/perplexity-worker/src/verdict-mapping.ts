/**
 * Verdict-Score Alignment System
 *
 * Maps bunk_score (0-10) to consistent verdict labels, text, and meter labels.
 * Ensures UI displays aligned messaging regardless of score source.
 */

// ============================================================================
// VERDICT BAND DEFINITIONS
// ============================================================================

export interface VerdictBand {
  /** Score range [min, max] inclusive */
  range: [number, number];
  /** Machine-readable verdict key */
  verdict: 'low' | 'elevated' | 'high';
  /** Short label for UI (e.g., "Low Risk") - primary verdict headline */
  verdict_label: string;
  /** Secondary verdict subline for additional context */
  secondary_verdict: string;
  /** Longer explanation text */
  verdict_text: string;
  /** Label for the BS Meter display */
  meter_label: string;
  /** Color hint for UI */
  color: string;
}

/**
 * Verdict bands ordered from lowest to highest risk.
 * Ranges are inclusive and non-overlapping.
 * Labels are professional and neutral for mainstream appeal.
 */
export const VERDICT_BANDS: VerdictBand[] = [
  {
    range: [0, 1.5],
    verdict: 'low',
    verdict_label: 'Well Supported',
    secondary_verdict: 'Strong evidence backing claims',
    verdict_text: 'Claims appear well-supported with strong evidence.',
    meter_label: 'Very Low BS',
    color: '#34C759', // Green
  },
  {
    range: [1.6, 3.3],
    verdict: 'low',
    verdict_label: 'Generally Credible',
    secondary_verdict: 'Good evidence with minor gaps',
    verdict_text: 'Claims have decent evidence support with minor gaps.',
    meter_label: 'Low BS',
    color: '#34C759', // Green
  },
  {
    range: [3.4, 5.0],
    verdict: 'elevated',
    verdict_label: 'Overstated',
    secondary_verdict: 'Some claims lack strong evidence',
    verdict_text: 'Some claims lack strong evidence. Verify before trusting.',
    meter_label: 'Moderate BS',
    color: '#FFD60A', // Yellow
  },
  {
    range: [5.1, 6.6],
    verdict: 'elevated',
    verdict_label: 'Questionable',
    secondary_verdict: 'Multiple claims have weak support',
    verdict_text: 'Multiple claims have weak or missing evidence support.',
    meter_label: 'Elevated BS',
    color: '#FF9500', // Orange
  },
  {
    range: [6.7, 8.0],
    verdict: 'high',
    verdict_label: 'Not Credible',
    secondary_verdict: 'Minimal supporting evidence found',
    verdict_text: 'Claims have minimal supporting evidence. Exercise caution.',
    meter_label: 'High BS',
    color: '#FF6B6B', // Light Red
  },
  {
    range: [8.1, 10.0],
    verdict: 'high',
    verdict_label: 'Highly Suspect',
    secondary_verdict: 'Major red flags detected',
    verdict_text: 'Claims have almost no supporting evidence. Major red flags detected.',
    meter_label: 'Very High BS',
    color: '#FF3B30', // Red
  },
];

// ============================================================================
// VERDICT LOOKUP FUNCTIONS
// ============================================================================

/**
 * Get the verdict band for a given score.
 * Returns the matching band or a default high-risk band if out of range.
 */
export function getVerdictBand(score: number): VerdictBand {
  // Clamp score to valid range
  const clampedScore = Math.max(0, Math.min(10, score));

  for (const band of VERDICT_BANDS) {
    if (clampedScore >= band.range[0] && clampedScore <= band.range[1]) {
      return band;
    }
  }

  // Fallback to highest risk band (shouldn't happen with proper clamping)
  return VERDICT_BANDS[VERDICT_BANDS.length - 1];
}

/**
 * Get verdict fields ready to merge into result object.
 */
export function getVerdictFields(score: number): {
  verdict: 'low' | 'elevated' | 'high';
  verdict_label: string;
  secondary_verdict: string;
  verdict_text: string;
  meter_label: string;
} {
  const band = getVerdictBand(score);
  return {
    verdict: band.verdict,
    verdict_label: band.verdict_label,
    secondary_verdict: band.secondary_verdict,
    verdict_text: band.verdict_text,
    meter_label: band.meter_label,
  };
}

// ============================================================================
// TEXT SANITIZATION
// ============================================================================

/**
 * Phrases that contradict a high BS score.
 * If score >= 6.5 and summary contains these, the summary should be flagged/adjusted.
 */
const POSITIVE_PHRASES = [
  'well-supported',
  'strong evidence',
  'credible',
  'legitimate',
  'trustworthy',
  'appears genuine',
  'no red flags',
  'no major concerns',
  'seems reliable',
  'backed by research',
  'clinically proven',
  'scientifically validated',
];

/**
 * Phrases that contradict a low BS score.
 * If score <= 3.5 and summary contains these, the summary should be flagged/adjusted.
 */
const NEGATIVE_PHRASES = [
  'red flag',
  'major concern',
  'lacks evidence',
  'unsubstantiated',
  'misleading',
  'deceptive',
  'scam',
  'fraudulent',
  'avoid',
  'do not trust',
  'suspicious',
  'questionable claims',
];

/**
 * Check if text contains contradictory language for the given score.
 * Returns the detected contradiction or null if aligned.
 */
export function detectVerdictMismatch(
  text: string,
  score: number
): { type: 'positive_in_high' | 'negative_in_low'; phrase: string } | null {
  const lowerText = text.toLowerCase();

  // High score but positive language
  if (score >= 6.5) {
    for (const phrase of POSITIVE_PHRASES) {
      if (lowerText.includes(phrase.toLowerCase())) {
        return { type: 'positive_in_high', phrase };
      }
    }
  }

  // Low score but negative language
  if (score <= 3.5) {
    for (const phrase of NEGATIVE_PHRASES) {
      if (lowerText.includes(phrase.toLowerCase())) {
        return { type: 'negative_in_low', phrase };
      }
    }
  }

  return null;
}

/**
 * Sanitize verdict text to align with score.
 * If mismatch detected, returns the band's default verdict_text instead.
 */
export function sanitizeVerdictText(rawText: string, score: number): string {
  const mismatch = detectVerdictMismatch(rawText, score);

  if (mismatch) {
    // Return the standard verdict text for this score band
    const band = getVerdictBand(score);
    console.log(`  ⚠️ Verdict mismatch: "${mismatch.phrase}" in ${mismatch.type}, using default text`);
    return band.verdict_text;
  }

  return rawText;
}

/**
 * Sanitize summary text - prepend warning if contradictory language detected.
 */
export function sanitizeSummary(summary: string, score: number): string {
  const mismatch = detectVerdictMismatch(summary, score);

  if (mismatch) {
    const band = getVerdictBand(score);
    // Don't modify the summary, but log the mismatch for debugging
    console.log(`  ⚠️ Summary/score mismatch: "${mismatch.phrase}" found but score is ${score.toFixed(1)}`);
  }

  return summary;
}

// ============================================================================
// PHASE 2: CONTENT SANITIZATION RULES
// ============================================================================

/**
 * Content sanitization rules for tone consistency.
 * Each rule has:
 * - pattern: regex to match (case-insensitive)
 * - replacement: softer alternative text
 * - minScore: only apply replacement if score is BELOW this threshold
 *   (higher scores allow harsher language)
 */
export interface ContentSanitizationRule {
  pattern: RegExp;
  replacement: string;
  minScore: number; // Apply replacement only when score < minScore
}

export const CONTENT_SANITIZATION_RULES: ContentSanitizationRule[] = [
  // Fabrication/fraud language - soften unless very high risk
  {
    pattern: /\bappear(?:s)? fabricated\b/gi,
    replacement: 'cannot be independently verified',
    minScore: 8.0,
  },
  {
    pattern: /\bfabricated\b/gi,
    replacement: 'unverified',
    minScore: 8.0,
  },
  {
    pattern: /\bfraudulent\b/gi,
    replacement: 'potentially misleading',
    minScore: 8.5,
  },
  {
    pattern: /\bscam\b/gi,
    replacement: 'questionable offering',
    minScore: 8.5,
  },

  // Scientific terminology - soften unless very high risk
  {
    pattern: /\bpseudoscience\b/gi,
    replacement: 'not supported by peer-reviewed research',
    minScore: 8.0,
  },
  {
    pattern: /\bpseudoscientific\b/gi,
    replacement: 'lacking peer-reviewed support',
    minScore: 8.0,
  },
  {
    pattern: /\bquackery\b/gi,
    replacement: 'unproven alternative approach',
    minScore: 8.5,
  },
  {
    pattern: /\bsnake oil\b/gi,
    replacement: 'unsubstantiated remedy',
    minScore: 8.0,
  },

  // Deception language - soften unless high risk
  {
    pattern: /\blie(?:s)?\b/gi,
    replacement: 'unverified claim',
    minScore: 8.5,
  },
  {
    pattern: /\blying\b/gi,
    replacement: 'making unverified claims',
    minScore: 8.5,
  },
  {
    pattern: /\bdeceptive\b/gi,
    replacement: 'potentially misleading',
    minScore: 7.5,
  },
  {
    pattern: /\bdishonest\b/gi,
    replacement: 'not fully transparent',
    minScore: 8.0,
  },

  // Strong negative language - soften for moderate scores
  {
    pattern: /\bavoid at all costs\b/gi,
    replacement: 'approach with caution',
    minScore: 8.0,
  },
  {
    pattern: /\bdo not (?:buy|purchase|trust)\b/gi,
    replacement: 'consider carefully before trusting',
    minScore: 8.0,
  },
  {
    pattern: /\bworthless\b/gi,
    replacement: 'of questionable value',
    minScore: 8.0,
  },
  {
    pattern: /\buseless\b/gi,
    replacement: 'of limited proven benefit',
    minScore: 7.5,
  },

  // Danger language - soften unless truly dangerous
  {
    pattern: /\bdangerous\b/gi,
    replacement: 'potentially risky',
    minScore: 8.5,
  },
  {
    pattern: /\bharmful\b/gi,
    replacement: 'may have adverse effects',
    minScore: 8.0,
  },
];

/**
 * Apply content sanitization rules to text based on score.
 * Higher scores allow harsher language; lower scores get softer alternatives.
 */
export function sanitizeContentText(text: string, score: number): string {
  let sanitized = text;
  let replacementsMade = 0;

  for (const rule of CONTENT_SANITIZATION_RULES) {
    // Only apply replacement if score is below the threshold
    if (score < rule.minScore && rule.pattern.test(sanitized)) {
      const before = sanitized;
      sanitized = sanitized.replace(rule.pattern, rule.replacement);
      if (sanitized !== before) {
        replacementsMade++;
        console.log(`  📝 Tone sanitization: replaced "${rule.pattern.source}" → "${rule.replacement}" (score ${score.toFixed(1)} < ${rule.minScore})`);
      }
    }
  }

  if (replacementsMade > 0) {
    console.log(`  📝 Content sanitization: ${replacementsMade} replacement(s) applied`);
  }

  return sanitized;
}

/**
 * Strip markdown formatting from text.
 * Removes bold, italic, code, and bullet prefixes.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')  // **bold** → bold
    .replace(/\*([^*]+)\*/g, '$1')       // *italic* → italic
    .replace(/`([^`]+)`/g, '$1')         // `code` → code
    .replace(/^\*\*\s*/g, '')            // Remove orphaned ** at start
    .replace(/\s*\*\*$/g, '')            // Remove orphaned ** at end
    .replace(/^\*\s*/g, '')              // Remove orphaned * at start
    .replace(/\s*\*$/g, '')              // Remove orphaned * at end
    .replace(/^\s*[-•]\s*/gm, '')        // Remove bullet prefixes
    .trim();
}

// ============================================================================
// RED FLAG DEDUPLICATION
// ============================================================================

/**
 * Key semantic terms that indicate two red flags are about the same topic.
 * If two flags share 2+ of these terms, they're likely duplicates.
 */
const SEMANTIC_KEY_TERMS = new Set([
  // Evidence/studies
  'clinical', 'study', 'studies', 'trial', 'trials', 'research', 'evidence', 'scientific',
  // Credibility
  'credential', 'credentials', 'verifiable', 'verified', 'certification', 'certified',
  // Business
  'company', 'business', 'seller', 'manufacturer', 'brand',
  // Claims
  'claim', 'claims', 'promise', 'promises', 'guarantee', 'guarantees',
  // Reviews
  'review', 'reviews', 'testimonial', 'testimonials', 'rating', 'ratings',
  // Pricing
  'price', 'pricing', 'cost', 'expensive', 'inflated', 'overpriced',
  // Safety
  'safety', 'safe', 'harmful', 'dangerous', 'risk', 'side',
  // Ingredients
  'ingredient', 'ingredients', 'formula', 'formulation',
  // Transparency
  'transparent', 'transparency', 'hidden', 'undisclosed',
]);

/**
 * Normalize text for fuzzy comparison.
 * Lowercases, removes punctuation, collapses whitespace.
 */
function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')    // Collapse whitespace
    .trim();
}

/**
 * Calculate Jaccard similarity between two strings (word-level).
 * Returns value between 0 (no overlap) and 1 (identical).
 */
function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeForComparison(a).split(' '));
  const wordsB = new Set(normalizeForComparison(b).split(' '));

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);

  return intersection.size / union.size;
}

/**
 * Check if two flags share semantic key terms indicating same topic.
 * Returns the count of shared key terms.
 */
function sharedKeyTermCount(a: string, b: string): number {
  const wordsA = new Set(normalizeForComparison(a).split(' '));
  const wordsB = new Set(normalizeForComparison(b).split(' '));

  let sharedCount = 0;
  for (const term of SEMANTIC_KEY_TERMS) {
    if (wordsA.has(term) && wordsB.has(term)) {
      sharedCount++;
    }
  }
  return sharedCount;
}

/**
 * Check if one string is a substring of another (after normalization).
 */
function isSubstringOf(shorter: string, longer: string): boolean {
  const normShorter = normalizeForComparison(shorter);
  const normLonger = normalizeForComparison(longer);
  return normLonger.includes(normShorter) && normShorter.length >= 10;
}

/**
 * Deduplicate red flags using fuzzy matching.
 * Removes near-duplicates and keeps the more detailed version.
 *
 * @param flags - Array of red flag strings
 * @param similarityThreshold - Jaccard similarity threshold (default 0.5 = 50% word overlap)
 * @returns Deduplicated array of red flags
 */
export function deduplicateRedFlags(
  flags: string[],
  similarityThreshold: number = 0.5
): string[] {
  if (!flags || flags.length <= 1) return flags;

  const result: string[] = [];
  const used = new Set<number>();

  // Sort by length descending to prefer more detailed flags
  const indexed = flags.map((flag, i) => ({ flag, i }));
  indexed.sort((a, b) => b.flag.length - a.flag.length);

  for (const { flag, i } of indexed) {
    if (used.has(i)) continue;

    let isDuplicate = false;

    for (const existing of result) {
      // Check Jaccard similarity
      const similarity = jaccardSimilarity(flag, existing);
      if (similarity >= similarityThreshold) {
        isDuplicate = true;
        console.log(`  🔄 Dedup: "${flag.slice(0, 50)}..." similar to "${existing.slice(0, 50)}..." (${(similarity * 100).toFixed(0)}%)`);
        break;
      }

      // Check shared semantic key terms (2+ shared = same topic)
      const sharedTerms = sharedKeyTermCount(flag, existing);
      if (sharedTerms >= 2) {
        isDuplicate = true;
        console.log(`  🔄 Dedup: "${flag.slice(0, 50)}..." shares ${sharedTerms} key terms with "${existing.slice(0, 50)}..."`);
        break;
      }

      // Check substring relationship
      if (isSubstringOf(flag, existing) || isSubstringOf(existing, flag)) {
        isDuplicate = true;
        console.log(`  🔄 Dedup: "${flag.slice(0, 50)}..." is substring of existing`);
        break;
      }
    }

    if (!isDuplicate) {
      result.push(flag);
      used.add(i);
    }
  }

  if (result.length < flags.length) {
    console.log(`  🔄 Red flags deduplicated: ${flags.length} → ${result.length}`);
  }

  return result;
}
