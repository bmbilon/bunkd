# Bunkd Score Semantics Contract

**Last Updated:** January 11, 2026

## Core Definition

**Bunkd Score (BS)** is a numerical measure (0–10) indicating how much a product's claims **lack** publicly available supporting evidence.

## Critical Rules

### 1. BS = "Bunkd Score" Only
- ✅ "BS Meter"
- ✅ "Bunkd Score (BS)"
- ❌ Never expand or reference "BS" as slang
- ❌ Never use "Bullshit" anywhere in code, docs, UI, or prompts

### 2. Scoring Direction (INVERTED)

**Higher scores = Weaker evidence = BAD**
**Lower scores = Stronger evidence = GOOD**

| Score Range | Tier Label | Color | Meaning |
|-------------|-----------|-------|---------|
| 9-10 | Very High Bunkd Score | Red (#FF3B30) | Almost no supporting evidence |
| 7-8 | High Bunkd Score | Light Red (#FF6B6B) | Minimal supporting evidence |
| 5-6 | Elevated Bunkd Score | Orange (#FF9500) | Some gaps in evidence |
| 3-4 | Moderate Bunkd Score | Yellow (#FFD60A) | Decent evidence support |
| 0-2 | Low Bunkd Score | Green (#34C759) | Comprehensive evidence support |

### 3. What INCREASES the Score (Makes it Worse)

- Vague superlatives ("revolutionary", "amazing", "1000x faster")
- Unsubstantiated health/performance claims
- Missing technical specifications
- Anonymous testimonials
- Marketing jargon without substance
- "Clinically proven" without study details
- Time-pressure tactics ("Limited time!")
- Unverifiable comparative claims

### 4. What DECREASES the Score (Makes it Better)

- Specific, measurable specifications
- Verifiable third-party testing
- Published research citations
- Industry standard certifications
- Transparent methodology
- Realistic performance claims
- Clear documentation

## UI Implementation

### Colors
```typescript
const getScoreColor = (score: number): string => {
  if (score >= 9) return '#FF3B30'; // Red - Very High BS
  if (score >= 7) return '#FF6B6B'; // Light Red - High BS
  if (score >= 5) return '#FF9500'; // Orange - Elevated BS
  if (score >= 3) return '#FFD60A'; // Yellow - Moderate BS
  return '#34C759'; // Green - Low BS
};
```

### Tier Labels
```typescript
const getScoreTier = (score: number): string => {
  if (score >= 9) return 'Very High Bunkd Score';
  if (score >= 7) return 'High Bunkd Score';
  if (score >= 5) return 'Elevated Bunkd Score';
  if (score >= 3) return 'Moderate Bunkd Score';
  return 'Low Bunkd Score';
};
```

### Verdicts
```typescript
const getVerdict = (score: number): string => {
  if (score >= 9) return 'Claims have almost no supporting evidence';
  if (score >= 7) return 'Claims have minimal supporting evidence';
  if (score >= 5) return 'Claims have some gaps in evidence support';
  if (score >= 3) return 'Claims have decent evidence support';
  return 'Claims have comprehensive supporting evidence';
};
```

## AI System Prompt

The AI is instructed with:

> CRITICAL SCORING DIRECTION:
> - HIGH scores (8-10) indicate claims are POORLY supported by evidence
> - LOW scores (0-2) indicate claims are WELL supported by evidence
> - BS = "Bunkd Score" (never expand as slang)

The rubric explicitly lists what increases vs. decreases the score.

## Demo Examples

| Product | Expected Score | Reasoning |
|---------|----------------|-----------|
| MegaBurn Ultra (weight loss) | 9-10 | Extreme health claims, no studies |
| LuxeGlow Serum (skincare) | 7-8 | "Clinically proven" without details |
| QuantumBoost Pro X (tech) | 8-9 | Vague tech jargon, unverifiable claims |
| TechPro Earbuds (consumer tech) | 3-4 | Specific specs, some gaps |
| Acme Laboratory Balance (pro equipment) | 1-2 | Full documentation, certifications |

## Language Consistency

### Always Use:
- "Higher Bunkd Score indicates weaker evidence support"
- "Low Bunkd Score" (good outcome, green)
- "Very High Bunkd Score" (bad outcome, red)
- "BS = Bunkd Score"

### Never Use:
- "Bullshit" or expansions of "BS" as slang
- "Higher is better" (incorrect - lower is better)
- "Objectivity Score" (deprecated terminology)
- Tier labels like "Excellent" or "Poor"

## Files Updated in Refactoring

### Database
- `supabase/migrations/20260111134641_invert_bunkd_score_semantics.sql` - Updated AI rubric

### Mobile App
- `apps/mobile/app/result.tsx` - Inverted colors and tier labels
- `apps/mobile/app/share.tsx` - Inverted colors, tier labels, and verdicts

### Documentation
- `docs/demo-inputs.md` - Updated all expected scores (2-3 → 8-9, etc.)
- `STATUS.md` - Updated branding section and demo expectations
- `docs/scoring-semantics.md` (this file) - New contract documentation

## Verification Checklist

- [x] AI rubric uses inverted scoring (high = bad)
- [x] Result screen colors: red for high, green for low
- [x] Share screen colors: red for high, green for low
- [x] Tier labels: Low/Moderate/Elevated/High/Very High
- [x] Demo docs: MegaBurn expects 9-10, not 2-3
- [x] No "Bullshit" references anywhere
- [x] BS always means "Bunkd Score"
- [x] Migration deployed to production database

---

**This contract is now canonical and must be maintained across all future updates.**
