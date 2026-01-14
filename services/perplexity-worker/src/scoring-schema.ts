/**
 * Bunkd Score (BS Meter) Scoring Schema v2.0
 * Integrated from GPT comprehensive schema
 *
 * Output: BS Meter score from 0.0-10.0 (higher = higher risk of misleading claims)
 * Legally safer framing: "risk of misleading" not "truth/falsehood"
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type CategoryId =
  | "supplements"
  | "beauty_personal_care"
  | "tech_gadgets"
  | "automotive"
  | "business_guru_coaching"
  | "home_improvement"
  | "general";

export type PrimitiveId =
  | "claim_density"
  | "claim_specificity"
  | "verifiability"
  | "evidence_quality"
  | "transparency"
  | "presentation_risk"
  | "source_authority"
  | "harm_potential";

export type PrimitiveScore = number; // normalized 0..1 (1 = higher BS risk)
export type Weight = number;

export type CategoryCandidate = {
  id: CategoryId;
  confidence: number; // 0..1
};

export type PrimitiveScores = Record<PrimitiveId, PrimitiveScore>;

export type Signal =
  | { id: string; severity: "low" | "med" | "high"; weight?: number; note?: string }
  | { id: string; severity: "low" | "med" | "high"; points: number; note?: string };

export type ScoreBreakdown = {
  category: CategoryCandidate;
  baseRisk01: number;
  overlay: {
    multiplier: number;
    additive01: number;
    penalties01: number;
    credits01: number;
    signals: Signal[];
  };
  harmMultiplier: number;
  confidenceAdjusted01: number;
  finalScore10: number;
};

export type CategoryOverlay = {
  multiplier: number;
  additive01: number;
  penalties: Array<{
    id: string;
    description: string;
    severityPoints01: { low: number; med: number; high: number };
  }>;
  credits: Array<{
    id: string;
    description: string;
    severityPoints01: { low: number; med: number; high: number };
  }>;
  cues: {
    mustConsider: string[];
    redFlags: string[];
    greenFlags: string[];
  };
};

export type BunkdScoringConfig = {
  version: string;
  clamp: { min: number; max: number };
  confidence: {
    shrinkToMidpointBelow: number;
    shrinkStrength: number;
    midpoint01: number;
  };
  primitives: {
    weights: Record<PrimitiveId, Weight>;
    descriptions: Record<PrimitiveId, string>;
  };
  harmMultipliers: Record<CategoryId, number>;
  categoryDetection: {
    maxCandidates: number;
    minConfidenceToApplyOverlay: number;
    fallback: CategoryCandidate;
  };
  overlays: Record<CategoryId, CategoryOverlay>;
  baseRisk: { compute: "weighted_sum" };
  output: {
    name: string;
    unit: string;
    scale: { min: number; max: number; decimals: number };
    interpretation: {
      low: { range: [number, number]; label: string };
      mid: { range: [number, number]; label: string };
      high: { range: [number, number]; label: string };
    };
  };
};

// ============================================================================
// CONFIGURATION
// ============================================================================

export const BUNKD_SCORING_CONFIG: BunkdScoringConfig = {
  version: "2.0.0",

  clamp: { min: 0, max: 1 },

  confidence: {
    shrinkToMidpointBelow: 0.6,
    shrinkStrength: 0.35,
    midpoint01: 0.5,
  },

  primitives: {
    weights: {
      claim_density: 0.12,
      claim_specificity: 0.10,
      verifiability: 0.16,
      evidence_quality: 0.16,
      transparency: 0.14,
      presentation_risk: 0.12,
      source_authority: 0.12,
      harm_potential: 0.08,
    },
    descriptions: {
      claim_density: "How many claims are being made. More claims = higher BS risk.",
      claim_specificity: "Vague promises vs concrete claims. Vague = higher BS risk.",
      verifiability: "How independently checkable the claims are.",
      evidence_quality: "Quality of support (direct product evidence > ingredient-only > anecdote).",
      transparency: "Clarity of pricing, terms, refund/warranty, limitations, disclosures.",
      presentation_risk: "Manipulative patterns (scarcity, urgency, emotional triggers).",
      source_authority: "Legitimacy signals (real company, history, credentials).",
      harm_potential: "Potential consumer harm if misled (health/safety/financial).",
    },
  },

  harmMultipliers: {
    supplements: 1.2,
    beauty_personal_care: 1.1,
    tech_gadgets: 1.05,
    automotive: 1.1,
    business_guru_coaching: 1.15,
    home_improvement: 1.05,
    general: 1.0,
  },

  categoryDetection: {
    maxCandidates: 3,
    minConfidenceToApplyOverlay: 0.6,
    fallback: { id: "general", confidence: 0.5 },
  },

  overlays: {
    general: {
      multiplier: 1.0,
      additive01: 0.0,
      penalties: [
        {
          id: "missing_terms_or_pricing",
          description: "Pricing/terms unclear or missing.",
          severityPoints01: { low: 0.04, med: 0.08, high: 0.12 },
        },
        {
          id: "heavy_scarcity_urgency",
          description: "Aggressive urgency/scarcity tactics.",
          severityPoints01: { low: 0.04, med: 0.08, high: 0.12 },
        },
      ],
      credits: [
        {
          id: "clear_return_policy",
          description: "Clear return/refund policy with terms.",
          severityPoints01: { low: 0.03, med: 0.06, high: 0.09 },
        },
        {
          id: "independent_reviews_present",
          description: "Reputable third-party reviews present.",
          severityPoints01: { low: 0.03, med: 0.06, high: 0.09 },
        },
      ],
      cues: {
        mustConsider: ["pricing", "return policy", "warranty", "reviews", "disclosures"],
        redFlags: ["limited time", "only today", "act now", "countdown", "guaranteed"],
        greenFlags: ["warranty", "return policy", "independent review", "spec sheet"],
      },
    },

    supplements: {
      multiplier: 1.08,
      additive01: 0.0,
      penalties: [
        {
          id: "illegal_fda_approved_claim",
          description: 'Claims "FDA approved" for a supplement.',
          severityPoints01: { low: 0.10, med: 0.16, high: 0.22 },
        },
        {
          id: "disease_treatment_claims",
          description: "Claims to cure/treat/prevent disease.",
          severityPoints01: { low: 0.08, med: 0.14, high: 0.20 },
        },
        {
          id: "proprietary_blend_no_dosages",
          description: "Proprietary blend or missing dosages.",
          severityPoints01: { low: 0.05, med: 0.10, high: 0.15 },
        },
        {
          id: "no_third_party_testing",
          description: "No third-party testing/certification.",
          severityPoints01: { low: 0.04, med: 0.08, high: 0.12 },
        },
        {
          id: "missing_fda_disclaimer",
          description: "Missing FDA disclaimer.",
          severityPoints01: { low: 0.04, med: 0.08, high: 0.12 },
        },
      ],
      credits: [
        {
          id: "credible_third_party_cert",
          description: "NSF/USP/ConsumerLab verification.",
          severityPoints01: { low: 0.05, med: 0.10, high: 0.15 },
        },
        {
          id: "full_transparent_supplement_facts",
          description: "Clear dosages and label transparency.",
          severityPoints01: { low: 0.04, med: 0.08, high: 0.12 },
        },
      ],
      cues: {
        mustConsider: ["FDA disclaimer", "Supplement Facts", "NSF", "USP", "COA", "dosage"],
        redFlags: ["FDA approved", "cure", "treat", "guaranteed results", "miracle"],
        greenFlags: ["NSF certified", "USP verified", "COA", "third-party tested", "dosage"],
      },
    },

    beauty_personal_care: {
      multiplier: 1.05,
      additive01: 0.0,
      penalties: [
        {
          id: "product_clinical_claim_without_product_data",
          description: '"Clinically proven" but only ingredient studies.',
          severityPoints01: { low: 0.05, med: 0.10, high: 0.15 },
        },
        {
          id: "instant_results_claims",
          description: "Promises instant/dramatic results.",
          severityPoints01: { low: 0.04, med: 0.08, high: 0.12 },
        },
        {
          id: "before_after_unverified",
          description: "Before/after photos without verification.",
          severityPoints01: { low: 0.03, med: 0.07, high: 0.11 },
        },
      ],
      credits: [
        {
          id: "product_specific_clinical_trial",
          description: "Product-specific clinical data.",
          severityPoints01: { low: 0.05, med: 0.10, high: 0.15 },
        },
        {
          id: "ingredient_transparency_inci",
          description: "Clear full ingredient list / INCI.",
          severityPoints01: { low: 0.03, med: 0.06, high: 0.09 },
        },
      ],
      cues: {
        mustConsider: ["ingredients", "INCI", "clinical study", "before and after", "dermatologist"],
        redFlags: ["instant", "miracle", "secret", "guaranteed", "clinically proven (no links)"],
        greenFlags: ["clinical trial", "in vivo", "dermatologist tested", "INCI list"],
      },
    },

    tech_gadgets: {
      multiplier: 1.03,
      additive01: 0.0,
      penalties: [
        {
          id: "unverifiable_performance_claims",
          description: "Performance claims without benchmarks.",
          severityPoints01: { low: 0.04, med: 0.08, high: 0.12 },
        },
        {
          id: "missing_warranty_returns",
          description: "Warranty/returns unclear.",
          severityPoints01: { low: 0.04, med: 0.08, high: 0.12 },
        },
        {
          id: "too_good_to_be_true_language",
          description: 'Exaggerated claims ("1000x faster").',
          severityPoints01: { low: 0.04, med: 0.09, high: 0.14 },
        },
      ],
      credits: [
        {
          id: "reputable_reviews_linked",
          description: "Independent reviews linked.",
          severityPoints01: { low: 0.04, med: 0.08, high: 0.12 },
        },
        {
          id: "clear_spec_sheet_and_support",
          description: "Clear specs and support channels.",
          severityPoints01: { low: 0.03, med: 0.06, high: 0.09 },
        },
      ],
      cues: {
        mustConsider: ["specs", "benchmarks", "warranty", "returns", "reviews"],
        redFlags: ["1000x", "NASA-grade", "quantum", "revolutionary", "secret technology"],
        greenFlags: ["spec sheet", "warranty", "return policy", "UL listed", "FCC"],
      },
    },

    automotive: {
      multiplier: 1.10,
      additive01: 0.0,
      penalties: [
        {
          id: "unauthorized_reseller_or_non_oem",
          description: "Not official OEM or authorized dealer.",
          severityPoints01: { low: 0.06, med: 0.12, high: 0.18 },
        },
        {
          id: "pricing_not_transparent",
          description: "No MSRP/price clarity, hidden fees.",
          severityPoints01: { low: 0.05, med: 0.10, high: 0.15 },
        },
        {
          id: "bait_and_switch_patterns",
          description: "Bait-and-switch cues.",
          severityPoints01: { low: 0.06, med: 0.12, high: 0.18 },
        },
        {
          id: "unverifiable_specs_claims",
          description: "Specs without EPA/IIHS/NHTSA references.",
          severityPoints01: { low: 0.04, med: 0.08, high: 0.12 },
        },
      ],
      credits: [
        {
          id: "oem_or_authorized_dealer_confirmed",
          description: "Official OEM or authorized dealer.",
          severityPoints01: { low: 0.06, med: 0.12, high: 0.18 },
        },
        {
          id: "verifiable_ratings_cited",
          description: "EPA/IIHS/NHTSA ratings cited.",
          severityPoints01: { low: 0.04, med: 0.08, high: 0.12 },
        },
      ],
      cues: {
        mustConsider: ["MSRP", "VIN", "authorized dealer", "EPA", "IIHS", "NHTSA", "fees"],
        redFlags: ["market adjustment", "call for price", "dealer fee", "limited inventory (no VIN)"],
        greenFlags: ["authorized dealer", "VIN", "MSRP", "EPA rating", "IIHS", "NHTSA"],
      },
    },

    business_guru_coaching: {
      multiplier: 1.12,
      additive01: 0.0,
      penalties: [
        {
          id: "income_claims_specific_unverifiable",
          description: "Specific income claims without evidence.",
          severityPoints01: { low: 0.08, med: 0.14, high: 0.20 },
        },
        {
          id: "scarcity_urgency_stack",
          description: "Countdown timers, limited spots, price going up.",
          severityPoints01: { low: 0.06, med: 0.12, high: 0.18 },
        },
        {
          id: "testimonials_unverifiable",
          description: "Testimonials not verifiable.",
          severityPoints01: { low: 0.05, med: 0.10, high: 0.15 },
        },
        {
          id: "refund_terms_unclear",
          description: "Money-back guarantee unclear/conditional.",
          severityPoints01: { low: 0.05, med: 0.10, high: 0.15 },
        },
      ],
      credits: [
        {
          id: "background_verifiable",
          description: "Background verifiable (LinkedIn, track record).",
          severityPoints01: { low: 0.05, med: 0.10, high: 0.15 },
        },
        {
          id: "clear_refund_terms",
          description: "Clear refund policy with terms.",
          severityPoints01: { low: 0.04, med: 0.08, high: 0.12 },
        },
      ],
      cues: {
        mustConsider: ["masterclass", "coaching", "students", "case studies", "refund", "guarantee"],
        redFlags: ["I made $", "in X days", "limited spots", "countdown", "price goes up"],
        greenFlags: ["refund policy", "terms", "verifiable background", "transparent curriculum"],
      },
    },

    home_improvement: {
      multiplier: 1.05,
      additive01: 0.0,
      penalties: [
        {
          id: "contractor_scams_patterns",
          description: "High-pressure quotes, vague scope.",
          severityPoints01: { low: 0.04, med: 0.08, high: 0.12 },
        },
        {
          id: "no_license_insurance_info",
          description: "Missing licensing/insurance info.",
          severityPoints01: { low: 0.04, med: 0.08, high: 0.12 },
        },
      ],
      credits: [
        {
          id: "transparent_scope_pricing",
          description: "Clear scope and pricing.",
          severityPoints01: { low: 0.04, med: 0.08, high: 0.12 },
        },
        {
          id: "verifiable_credentials",
          description: "Credentials, permits verifiable.",
          severityPoints01: { low: 0.04, med: 0.08, high: 0.12 },
        },
      ],
      cues: {
        mustConsider: ["estimate", "scope", "licensed", "insured", "warranty", "permits"],
        redFlags: ["today only", "cash discount", "no contract", "too good to be true"],
        greenFlags: ["licensed", "insured", "permit", "written estimate", "warranty"],
      },
    },
  },

  baseRisk: { compute: "weighted_sum" },

  output: {
    name: "BS Meter",
    unit: "Bunkd Score",
    scale: { min: 0, max: 10, decimals: 1 },
    interpretation: {
      low: { range: [0, 3.3], label: "Lower BS risk" },
      mid: { range: [3.4, 6.6], label: "Moderate BS risk" },
      high: { range: [6.7, 10], label: "Higher BS risk" },
    },
  },
};

// ============================================================================
// SCORING FUNCTIONS
// ============================================================================

/**
 * Main scoring function - computes BS Meter score from primitives and signals
 */
export function scoreBSMeter(params: {
  primitives: PrimitiveScores;
  categoryCandidates: CategoryCandidate[];
  signalsByCategory?: Partial<Record<CategoryId, Signal[]>>;
}): ScoreBreakdown {
  const cfg = BUNKD_SCORING_CONFIG;

  const best = params.categoryCandidates?.[0] ?? cfg.categoryDetection.fallback;
  const applyOverlay = best.confidence >= cfg.categoryDetection.minConfidenceToApplyOverlay;
  const category = applyOverlay ? best : cfg.categoryDetection.fallback;
  const overlay = cfg.overlays[category.id];

  // Base risk (0..1) - weighted sum of primitives
  const baseRisk01 = Object.entries(cfg.primitives.weights).reduce(
    (sum, [k, w]) => sum + (params.primitives[k as PrimitiveId] ?? 0.5) * w,
    0
  );

  // Collect signals for category
  const signals = (params.signalsByCategory?.[category.id] ?? []) as Signal[];

  // Convert signals into penalties/credits
  const penalties01 = signals.reduce((acc, s) => {
    if ("points" in s) return acc + Math.max(0, s.points);
    const rule = overlay.penalties.find((p) => p.id === s.id);
    if (!rule) return acc;
    return acc + rule.severityPoints01[s.severity];
  }, 0);

  const credits01 = signals.reduce((acc, s) => {
    if ("points" in s) return acc;
    const rule = overlay.credits.find((c) => c.id === s.id);
    if (!rule) return acc;
    return acc + rule.severityPoints01[s.severity];
  }, 0);

  // Apply overlay
  let risk01 = baseRisk01 * overlay.multiplier + overlay.additive01 + penalties01 - credits01;
  risk01 = Math.min(cfg.clamp.max, Math.max(cfg.clamp.min, risk01));

  // Harm multiplier
  const harmMultiplier = cfg.harmMultipliers[category.id] ?? 1.0;
  let harmApplied01 = risk01 * harmMultiplier;
  harmApplied01 = Math.min(cfg.clamp.max, Math.max(cfg.clamp.min, harmApplied01));

  // Confidence shrink (avoid false certainty when confidence is low)
  let confidenceAdjusted01 = harmApplied01;
  if (best.confidence < cfg.confidence.shrinkToMidpointBelow) {
    const t = cfg.confidence.shrinkStrength;
    confidenceAdjusted01 = (1 - t) * harmApplied01 + t * cfg.confidence.midpoint01;
  }

  // Final 0..10
  const finalScore10 = Number((confidenceAdjusted01 * 10).toFixed(cfg.output.scale.decimals));

  return {
    category: best,
    baseRisk01,
    overlay: {
      multiplier: overlay.multiplier,
      additive01: overlay.additive01,
      penalties01,
      credits01,
      signals,
    },
    harmMultiplier,
    confidenceAdjusted01,
    finalScore10,
  };
}

// ============================================================================
// PRIMITIVE EXTRACTION FROM TEXT
// ============================================================================

/**
 * Extract primitive scores from Perplexity response text
 * Returns scores normalized to 0..1 (1 = higher BS risk)
 */
export function extractPrimitivesFromText(
  text: string,
  pageContent: string = ''
): PrimitiveScores {
  const combinedText = `${text}\n${pageContent}`.toLowerCase();

  // Helper: count pattern matches
  const countMatches = (patterns: RegExp[]): number => {
    return patterns.reduce((count, p) => count + (p.test(combinedText) ? 1 : 0), 0);
  };

  // CLAIM DENSITY: More claims = higher risk
  const claimIndicators = [
    /claims?\s+(?:that|to)/gi, /promises?/gi, /guarantees?/gi,
    /will\s+(?:help|improve|boost|enhance)/gi, /proven\s+to/gi,
  ];
  const claimMatches = claimIndicators.reduce((c, p) => c + (combinedText.match(p)?.length || 0), 0);
  const claim_density = Math.min(1, claimMatches / 15); // Normalize: 15+ claims = max risk

  // CLAIM SPECIFICITY: Vague = higher risk (inverted)
  const specificIndicators = [
    /\d+%/, /\d+\s*(?:mg|ml|oz|g)\b/i, /\d+\s*(?:participants?|subjects?|people)/i,
    /\d+\s*(?:days?|weeks?|months?)/i, /study\s+(?:of|with)\s+\d+/i,
  ];
  const vagueIndicators = [
    /may\s+help/i, /could\s+(?:help|improve)/i, /might\s+(?:help|work)/i,
    /results\s+(?:may|will)\s+vary/i, /individual\s+results/i,
  ];
  const specificCount = countMatches(specificIndicators);
  const vagueCount = countMatches(vagueIndicators);
  const claim_specificity = vagueCount > specificCount ? Math.min(1, 0.3 + vagueCount * 0.15) : Math.max(0, 0.5 - specificCount * 0.1);

  // VERIFIABILITY: Hard to verify = higher risk
  const verifiableIndicators = [
    /peer.reviewed/i, /published\s+in/i, /journal/i, /doi:/i,
    /clinical\s+trial/i, /randomized/i, /double.blind/i,
    /fda\s+(?:registered|cleared)/i, /nsf\s+certified/i, /usp\s+verified/i,
  ];
  const unverifiableIndicators = [
    /proprietary/i, /secret\s+(?:formula|blend)/i, /ancient\s+(?:remedy|secret)/i,
    /only\s+testimonials/i, /anecdotal/i,
  ];
  const verifiableCount = countMatches(verifiableIndicators);
  const unverifiableCount = countMatches(unverifiableIndicators);
  const verifiability = unverifiableCount > 0 ? Math.min(1, 0.4 + unverifiableCount * 0.2) : Math.max(0, 0.5 - verifiableCount * 0.1);

  // EVIDENCE QUALITY: Poor evidence = higher risk
  const strongEvidenceIndicators = [
    /\d+\s*(?:participants?|subjects?|patients?)/i, /clinical\s+(?:study|trial)/i,
    /randomized\s+controlled/i, /peer.reviewed/i, /published/i,
  ];
  const weakEvidenceIndicators = [
    /testimonials?\s+only/i, /anecdotal/i, /no\s+(?:clinical|scientific)\s+(?:studies|evidence)/i,
    /not\s+(?:proven|verified|evaluated)/i,
  ];
  const strongCount = countMatches(strongEvidenceIndicators);
  const weakCount = countMatches(weakEvidenceIndicators);
  const evidence_quality = weakCount > strongCount ? Math.min(1, 0.4 + weakCount * 0.2) : Math.max(0, 0.5 - strongCount * 0.12);

  // TRANSPARENCY: Hidden info = higher risk
  const transparentIndicators = [
    /full\s+(?:ingredient|dosage)/i, /clear\s+(?:pricing|terms)/i,
    /return\s+policy/i, /money.back\s+guarantee/i, /contact\s+(?:us|info)/i,
    /\$\d+(?:\.\d{2})?/i, // Price visible
  ];
  const opaqueIndicators = [
    /proprietary\s+blend/i, /call\s+for\s+price/i, /hidden\s+fees/i,
    /fine\s+print/i, /conditions\s+apply/i, /hard\s+to\s+(?:cancel|contact)/i,
  ];
  const transparentCount = countMatches(transparentIndicators);
  const opaqueCount = countMatches(opaqueIndicators);
  const transparency = opaqueCount > 0 ? Math.min(1, 0.3 + opaqueCount * 0.2) : Math.max(0, 0.5 - transparentCount * 0.08);

  // PRESENTATION RISK: Manipulation = higher risk
  const manipulativeIndicators = [
    /limited\s+time/i, /act\s+now/i, /only\s+\d+\s+left/i, /countdown/i,
    /price\s+(?:going\s+up|increase)/i, /exclusive\s+(?:deal|offer)/i,
    /miracle/i, /breakthrough/i, /secret/i, /revolutionary/i,
    /don't\s+miss/i, /once\s+in\s+a\s+lifetime/i,
  ];
  const manipulativeCount = countMatches(manipulativeIndicators);
  const presentation_risk = Math.min(1, manipulativeCount * 0.15);

  // SOURCE AUTHORITY: Weak source = higher risk
  const authorityIndicators = [
    /official\s+(?:site|website|store)/i, /authorized\s+(?:dealer|reseller)/i,
    /oem/i, /manufacturer/i, /established\s+(?:in|since)\s+\d{4}/i,
    /bbb\s+(?:accredited|rating)/i, /verified\s+(?:seller|business)/i,
  ];
  const lowAuthorityIndicators = [
    /fake|counterfeit|knockoff/i, /unauthorized/i, /scam|fraud/i,
    /no\s+(?:contact|address|phone)/i, /anonymous/i,
  ];
  const authorityCount = countMatches(authorityIndicators);
  const lowAuthCount = countMatches(lowAuthorityIndicators);
  const source_authority = lowAuthCount > 0 ? Math.min(1, 0.5 + lowAuthCount * 0.25) : Math.max(0, 0.5 - authorityCount * 0.1);

  // HARM POTENTIAL: Based on category signals in text
  const highHarmIndicators = [
    /health|medical|supplement|drug|treatment/i,
    /investment|financial|money|income/i,
    /children|pregnancy|elderly/i,
  ];
  const harmCount = countMatches(highHarmIndicators);
  const harm_potential = Math.min(1, harmCount * 0.2);

  return {
    claim_density,
    claim_specificity,
    verifiability,
    evidence_quality,
    transparency,
    presentation_risk,
    source_authority,
    harm_potential,
  };
}

// ============================================================================
// CATEGORY DETECTION
// ============================================================================

/**
 * Detect category candidates from text and URL
 */
export function detectCategoryCandidates(
  text: string,
  url?: string
): CategoryCandidate[] {
  const lower = text.toLowerCase();
  const urlLower = (url || '').toLowerCase();

  const scores: Record<CategoryId, number> = {
    supplements: 0,
    beauty_personal_care: 0,
    tech_gadgets: 0,
    automotive: 0,
    business_guru_coaching: 0,
    home_improvement: 0,
    general: 0.5, // Base score for general
  };

  // Category keywords
  const categoryKeywords: Record<CategoryId, string[]> = {
    supplements: [
      'supplement', 'vitamin', 'capsule', 'pill', 'mg', 'dosage', 'dietary',
      'probiotic', 'protein powder', 'amino acid', 'herbal', 'extract',
      'fda disclaimer', 'turkesterone', 'creatine', 'pre-workout',
    ],
    beauty_personal_care: [
      'serum', 'cream', 'skincare', 'anti-aging', 'wrinkle', 'moisturizer',
      'collagen', 'retinol', 'hyaluronic', 'beauty', 'cosmetic', 'dermatologist',
      'skin care', 'facial', 'lash', 'mascara', 'hair growth',
    ],
    tech_gadgets: [
      'gadget', 'app', 'software', 'charger', 'wireless', 'bluetooth',
      'smart home', 'electronic', 'battery', 'specs', 'warranty', 'tech',
      'computer', 'laptop', 'phone', 'tablet', 'usb', 'hdmi',
    ],
    automotive: [
      'vehicle', 'car', 'truck', 'suv', 'sedan', 'mpg', 'horsepower',
      'engine', 'transmission', 'dealership', 'msrp', 'lease', 'financing',
      'test drive', 'manufacturer', 'oem', 'automotive',
    ],
    business_guru_coaching: [
      'masterclass', 'coaching', 'mentor', 'entrepreneur', 'make money',
      'passive income', 'millionaire', 'success secrets', 'wealth',
      'trading secrets', 'crypto', 'forex', 'dropshipping', 'affiliate',
      'get rich', 'financial freedom', 'side hustle', 'course',
    ],
    home_improvement: [
      'contractor', 'renovation', 'remodel', 'plumbing', 'electrical',
      'roofing', 'hvac', 'flooring', 'kitchen', 'bathroom', 'home repair',
      'licensed', 'insured', 'permit', 'estimate',
    ],
    general: [],
  };

  // Score based on keyword matches
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) scores[category as CategoryId] += 1;
    }
  }

  // URL-based boosts
  const urlBoosts: Array<{ pattern: RegExp; category: CategoryId; boost: number }> = [
    { pattern: /nissan|toyota|honda|ford|chevrolet|bmw|mercedes|audi|volkswagen|hyundai|kia|mazda|subaru|lexus|acura|dodge|jeep|gmc|cadillac|tesla/i, category: 'automotive', boost: 8 },
    { pattern: /gnc|vitaminshop|iherb|bodybuilding\.com|nutrition/i, category: 'supplements', boost: 8 },
    { pattern: /sephora|ulta|dermstore|skincare/i, category: 'beauty_personal_care', boost: 8 },
    { pattern: /newegg|bestbuy|amazon\.com\/dp/i, category: 'tech_gadgets', boost: 6 },
    { pattern: /clickfunnels|kajabi|teachable|thinkific/i, category: 'business_guru_coaching', boost: 8 },
    { pattern: /homedepot|lowes|angi|homeadvisor/i, category: 'home_improvement', boost: 6 },
  ];

  for (const { pattern, category, boost } of urlBoosts) {
    if (pattern.test(urlLower)) {
      scores[category] += boost;
    }
  }

  // Convert to candidates with confidence
  const candidates: CategoryCandidate[] = Object.entries(scores)
    .filter(([_, score]) => score > 0)
    .map(([id, score]) => ({
      id: id as CategoryId,
      confidence: Math.min(1, score / 10), // Normalize to 0-1
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, BUNKD_SCORING_CONFIG.categoryDetection.maxCandidates);

  // Ensure we have at least the fallback
  if (candidates.length === 0) {
    candidates.push(BUNKD_SCORING_CONFIG.categoryDetection.fallback);
  }

  return candidates;
}

// ============================================================================
// SIGNAL EXTRACTION
// ============================================================================

/**
 * Extract signals for a category from text
 */
export function extractSignalsForCategory(
  categoryId: CategoryId,
  text: string,
  pageContent: string = ''
): Signal[] {
  const combinedText = `${text}\n${pageContent}`.toLowerCase();
  const overlay = BUNKD_SCORING_CONFIG.overlays[categoryId];
  const signals: Signal[] = [];

  // Check penalties
  for (const penalty of overlay.penalties) {
    const severity = detectSignalSeverity(penalty.id, combinedText);
    if (severity) {
      signals.push({ id: penalty.id, severity, note: penalty.description });
    }
  }

  // Check credits
  for (const credit of overlay.credits) {
    const severity = detectSignalSeverity(credit.id, combinedText);
    if (severity) {
      signals.push({ id: credit.id, severity, note: credit.description });
    }
  }

  return signals;
}

/**
 * Detect signal severity based on text patterns
 */
function detectSignalSeverity(
  signalId: string,
  text: string
): 'low' | 'med' | 'high' | null {
  // Signal-specific patterns
  const signalPatterns: Record<string, { patterns: RegExp[]; default: 'low' | 'med' | 'high' }> = {
    // Penalties
    illegal_fda_approved_claim: { patterns: [/fda\s+approved/i], default: 'high' },
    disease_treatment_claims: { patterns: [/cures?|treats?|prevents?\s+(?:cancer|diabetes|disease)/i], default: 'high' },
    proprietary_blend_no_dosages: { patterns: [/proprietary\s+blend/i], default: 'med' },
    no_third_party_testing: { patterns: [/no\s+third.party|not\s+third.party\s+tested/i], default: 'med' },
    missing_fda_disclaimer: { patterns: [/(?<!has\s+the\s+)fda\s+disclaimer/i], default: 'low' },
    product_clinical_claim_without_product_data: { patterns: [/clinically\s+proven.*(?:ingredient|extract)/i], default: 'med' },
    instant_results_claims: { patterns: [/instant\s+results|immediate\s+results/i], default: 'med' },
    before_after_unverified: { patterns: [/before\s+and\s+after|before\/after/i], default: 'low' },
    unverifiable_performance_claims: { patterns: [/\d+x\s+(?:faster|better|more)/i], default: 'med' },
    missing_warranty_returns: { patterns: [/no\s+(?:warranty|return)/i], default: 'med' },
    too_good_to_be_true_language: { patterns: [/revolutionary|game.?changer|miracle/i], default: 'med' },
    unauthorized_reseller_or_non_oem: { patterns: [/unauthorized|grey\s+market/i], default: 'high' },
    pricing_not_transparent: { patterns: [/call\s+for\s+price|price\s+on\s+request/i], default: 'med' },
    bait_and_switch_patterns: { patterns: [/bait.and.switch|not\s+available/i], default: 'high' },
    unverifiable_specs_claims: { patterns: [/(?<!epa|nhtsa|iihs)\s+rating/i], default: 'low' },
    income_claims_specific_unverifiable: { patterns: [/made?\s+\$\d+|earn\s+\$\d+/i], default: 'high' },
    scarcity_urgency_stack: { patterns: [/limited\s+(?:spots?|time)|countdown|price\s+(?:going\s+up|increase)/i], default: 'med' },
    testimonials_unverifiable: { patterns: [/testimonials?/i], default: 'low' },
    refund_terms_unclear: { patterns: [/refund.*conditions|money.?back.*(?:conditions|terms)/i], default: 'med' },
    contractor_scams_patterns: { patterns: [/cash\s+(?:only|discount)|today\s+only/i], default: 'med' },
    no_license_insurance_info: { patterns: [/not\s+(?:licensed|insured)/i], default: 'med' },
    missing_terms_or_pricing: { patterns: [/(?:pricing|terms)\s+(?:unclear|not\s+(?:specified|available))/i], default: 'med' },
    heavy_scarcity_urgency: { patterns: [/act\s+now|limited\s+time|only\s+\d+\s+left/i], default: 'med' },

    // Credits
    credible_third_party_cert: { patterns: [/nsf\s+certified|usp\s+verified|consumerlab/i], default: 'high' },
    full_transparent_supplement_facts: { patterns: [/supplement\s+facts|full\s+(?:ingredient|dosage)/i], default: 'med' },
    product_specific_clinical_trial: { patterns: [/product.specific\s+(?:clinical|study)|clinical\s+trial\s+(?:of|on)\s+(?:this|the)\s+product/i], default: 'high' },
    ingredient_transparency_inci: { patterns: [/inci|full\s+ingredient\s+list/i], default: 'med' },
    reputable_reviews_linked: { patterns: [/independent\s+review|third.party\s+review/i], default: 'med' },
    clear_spec_sheet_and_support: { patterns: [/spec\s+sheet|specifications|support\s+(?:available|contact)/i], default: 'med' },
    oem_or_authorized_dealer_confirmed: { patterns: [/official|authorized\s+dealer|oem/i], default: 'high' },
    verifiable_ratings_cited: { patterns: [/epa\s+(?:rating|mpg)|nhtsa|iihs/i], default: 'med' },
    background_verifiable: { patterns: [/linkedin|verifiable\s+(?:background|credentials)/i], default: 'med' },
    clear_refund_terms: { patterns: [/(?:clear|full)\s+refund|30.day\s+(?:money.back|guarantee)/i], default: 'med' },
    transparent_scope_pricing: { patterns: [/written\s+estimate|clear\s+(?:scope|pricing)/i], default: 'med' },
    verifiable_credentials: { patterns: [/licensed|insured|permit/i], default: 'med' },
    clear_return_policy: { patterns: [/return\s+policy|refund\s+policy/i], default: 'med' },
    independent_reviews_present: { patterns: [/independent\s+review|third.party\s+review/i], default: 'med' },
  };

  const config = signalPatterns[signalId];
  if (!config) return null;

  for (const pattern of config.patterns) {
    if (pattern.test(text)) {
      return config.default;
    }
  }

  return null;
}

// ============================================================================
// LEGACY SUBSCORE MAPPING
// ============================================================================

/**
 * Map new primitive scores to legacy subscores for backward compatibility
 * Primitives are 0-1 (higher = worse), legacy subscores are 0-10 (higher = worse)
 */
export function mapToLegacySubscores(
  primitives: PrimitiveScores,
  _scoreBreakdown: ScoreBreakdown
): {
  human_evidence: number;
  authenticity_transparency: number;
  marketing_overclaim: number;
  pricing_value: number;
} {
  // Convert 0-1 (higher=worse) to 0-10 scale, round to 0.5
  const toScale10 = (val: number) => Math.round(val * 10 * 2) / 2;

  return {
    // human_evidence <- evidence_quality
    human_evidence: toScale10(primitives.evidence_quality),

    // authenticity_transparency <- average of transparency + source_authority
    authenticity_transparency: toScale10(
      (primitives.transparency + primitives.source_authority) / 2
    ),

    // marketing_overclaim <- average of claim_density + presentation_risk
    marketing_overclaim: toScale10(
      (primitives.claim_density + primitives.presentation_risk) / 2
    ),

    // pricing_value <- transparency (pricing is part of transparency in new schema)
    pricing_value: toScale10(primitives.transparency),
  };
}

// ============================================================================
// PERPLEXITY EXTRACTION TYPE (for future Phase 1 prompt)
// ============================================================================

export type PerplexityExtraction = {
  categoryCandidates: CategoryCandidate[];
  primitives: PrimitiveScores;
  signalsByCategory?: Partial<Record<CategoryId, Signal[]>>;
  notes?: string[];
};
