/**
 * Claim Archetypes & Routing Logic for BS Meter
 *
 * Implements tiered routing to minimize expensive API calls:
 * - Tier 1: Instant zero for commodities
 * - Tier 2: Instant high BS for known scam patterns
 * - Tier 3: Full Perplexity analysis
 * - Tier 4: Unable to assess (insufficient input)
 */

import { PrimitiveScores } from './scoring-schema';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export type AnalysisMode = 'commodity' | 'claim_archetype' | 'seller_specific' | 'full_analysis' | 'unable_to_assess';

export interface ClaimArchetype {
  id: string;
  name: string;
  description: string;
  priority: number; // Lower = higher priority (1 = highest, checked first)
  bsRange: { min: number; max: number };
  pillars: {
    human_evidence: number;
    authenticity_transparency: number;
    marketing_overclaim: number;
    pricing_value: number;
  };
  signals: string[];
  intensityModifiers: string[];
  redFlagsTemplate: string[];
  summaryTemplate: string;
  threshold: number; // Number of signals needed for high confidence
  minExactMatches?: number; // Minimum EXACT (non-partial) matches required (default: 1)
}

export interface ArchetypeMatch {
  archetype: ClaimArchetype;
  confidence: number;
  matchedSignals: string[];
}

export interface RoutingResult {
  tier: 1 | 2 | 3 | 4;
  mode: AnalysisMode;
  commodity?: string;
  archetypeMatch?: ArchetypeMatch;
  reason: string;
}

// =============================================================================
// COMMODITY LEXICON (~150 whole foods)
// =============================================================================

export const COMMODITY_LEXICON = new Set([
  // Fruits
  'apple', 'apples', 'gala apples', 'honeycrisp', 'honeycrisp apples', 'fuji apples',
  'granny smith', 'red delicious', 'banana', 'bananas', 'orange', 'oranges',
  'navel orange', 'blood orange', 'lemon', 'lemons', 'lime', 'limes',
  'grapefruit', 'grapefruits', 'mango', 'mangoes', 'mangos', 'papaya', 'papayas',
  'pineapple', 'pineapples', 'strawberry', 'strawberries', 'blueberry', 'blueberries',
  'raspberry', 'raspberries', 'blackberry', 'blackberries', 'cranberry', 'cranberries',
  'grape', 'grapes', 'red grapes', 'green grapes', 'watermelon', 'cantaloupe',
  'honeydew', 'peach', 'peaches', 'nectarine', 'nectarines', 'plum', 'plums',
  'apricot', 'apricots', 'pear', 'pears', 'cherry', 'cherries', 'avocado', 'avocados',
  'kiwi', 'kiwis', 'pomegranate', 'pomegranates', 'fig', 'figs', 'date', 'dates',

  // Vegetables
  'potato', 'potatoes', 'russet potato', 'yukon gold', 'sweet potato', 'sweet potatoes',
  'yam', 'yams', 'carrot', 'carrots', 'onion', 'onions', 'red onion', 'red onions',
  'yellow onion', 'white onion', 'shallot', 'shallots', 'garlic', 'celery',
  'broccoli', 'cauliflower', 'spinach', 'kale', 'collard greens', 'swiss chard',
  'lettuce', 'romaine', 'iceberg lettuce', 'arugula', 'cabbage', 'red cabbage',
  'brussels sprouts', 'cucumber', 'cucumbers', 'tomato', 'tomatoes', 'cherry tomatoes',
  'roma tomatoes', 'bell pepper', 'bell peppers', 'red pepper', 'green pepper',
  'jalapeno', 'zucchini', 'squash', 'butternut squash', 'acorn squash', 'spaghetti squash',
  'pumpkin', 'corn', 'sweet corn', 'green beans', 'snap peas', 'snow peas',
  'peas', 'asparagus', 'artichoke', 'artichokes', 'mushroom', 'mushrooms',
  'portobello', 'shiitake', 'eggplant', 'beet', 'beets', 'radish', 'radishes',
  'turnip', 'turnips', 'parsnip', 'parsnips', 'rutabaga', 'leek', 'leeks',

  // Nuts & Seeds
  'almonds', 'almond', 'walnuts', 'walnut', 'pecans', 'pecan', 'cashews', 'cashew',
  'peanuts', 'peanut', 'pistachios', 'pistachio', 'macadamia', 'macadamia nuts',
  'hazelnuts', 'hazelnut', 'brazil nuts', 'pine nuts', 'chestnuts',
  'sunflower seeds', 'pumpkin seeds', 'pepitas', 'chia seeds', 'flax seeds',
  'flaxseed', 'hemp seeds', 'sesame seeds', 'poppy seeds',

  // Grains & Legumes
  'rice', 'brown rice', 'white rice', 'jasmine rice', 'basmati rice', 'wild rice',
  'oats', 'oatmeal', 'rolled oats', 'steel cut oats', 'quinoa', 'barley',
  'bulgur', 'farro', 'millet', 'buckwheat', 'wheat', 'wheat berries',
  'flour', 'whole wheat flour', 'bread', 'whole grain bread', 'pasta', 'whole wheat pasta',
  'lentils', 'red lentils', 'green lentils', 'brown lentils', 'chickpeas', 'garbanzo beans',
  'black beans', 'kidney beans', 'pinto beans', 'navy beans', 'cannellini beans',
  'lima beans', 'beans', 'split peas', 'black eyed peas',

  // Dairy & Eggs
  'eggs', 'egg', 'chicken eggs', 'milk', 'whole milk', 'skim milk', '2% milk',
  'butter', 'unsalted butter', 'cream', 'heavy cream', 'half and half',
  'cheese', 'cheddar', 'mozzarella', 'parmesan', 'swiss cheese', 'feta',
  'yogurt', 'greek yogurt', 'plain yogurt', 'cottage cheese', 'cream cheese',
  'sour cream',

  // Basic Staples
  'salt', 'sea salt', 'kosher salt', 'pepper', 'black pepper', 'sugar', 'brown sugar',
  'honey', 'maple syrup', 'olive oil', 'extra virgin olive oil', 'vegetable oil',
  'canola oil', 'coconut oil', 'vinegar', 'apple cider vinegar', 'balsamic vinegar',
  'coffee', 'coffee beans', 'tea', 'green tea', 'black tea', 'water',

  // Proteins (unprocessed)
  'chicken', 'chicken breast', 'chicken thighs', 'whole chicken',
  'beef', 'ground beef', 'steak', 'beef roast', 'pork', 'pork chops', 'pork loin',
  'bacon', 'ham', 'fish', 'salmon', 'wild salmon', 'tuna', 'cod', 'tilapia',
  'halibut', 'trout', 'shrimp', 'prawns', 'scallops', 'crab', 'lobster',
  'turkey', 'ground turkey', 'turkey breast', 'lamb', 'lamb chops',

  // Herbs & Spices (plain)
  'basil', 'oregano', 'thyme', 'rosemary', 'parsley', 'cilantro', 'dill',
  'mint', 'sage', 'bay leaves', 'cumin', 'paprika', 'turmeric', 'ginger',
  'cinnamon', 'nutmeg', 'cloves', 'cardamom', 'coriander',
]);

// Marketing/claim tokens that disqualify commodity classification
const DISQUALIFYING_TOKENS = new Set([
  // Supplement/extract language
  'extract', 'supplement', 'capsule', 'pill', 'tablet', 'powder', 'mg', 'dosage',
  'formula', 'blend', 'complex', 'concentrate', 'tincture', 'serum',
  // Marketing language
  'clinically', 'proven', 'miracle', 'detox', 'cure', 'guarantee', 'guaranteed',
  'revolutionary', 'breakthrough', 'secret', 'exclusive', 'premium',
  'superfood', 'super food', 'boost', 'enhance', 'maximize', 'optimize',
  // Health outcome promises
  'weight loss', 'fat burn', 'anti-aging', 'anti aging', 'lose weight',
  'burn fat', 'energy boost', 'immune boost', 'metabolism',
  // Brand indicators
  'brand', 'tm', '®', '™', 'inc', 'llc', 'co', 'corp',
]);

// =============================================================================
// THE 12 SCAM ARCHETYPES
// =============================================================================

export const ARCHETYPE_DEFINITIONS: ClaimArchetype[] = [
  {
    id: 'unsubstantiated_health_claims',
    name: 'Unsubstantiated Health Claims',
    description: 'Claims that treat, cure, prevent disease without FDA approval',
    priority: 1, // HIGHEST - health risk
    bsRange: { min: 8.0, max: 10.0 },
    pillars: { human_evidence: 9.5, authenticity_transparency: 9.0, marketing_overclaim: 9.5, pricing_value: 8.0 },
    signals: [
      // Disease treatment verbs
      'cures', 'treats', 'reverses', 'heals', 'eliminates',
      'prevents cancer', 'prevents diabetes', 'prevents disease', 'fights disease', 'battles disease',
      // Medical condition treatment claims
      'treats incontinence', 'treats prolapse', 'treats pelvic', 'treats bladder',
      'treats uterine', 'treats dysfunction', 'treat incontinence', 'treat prolapse',
      'for incontinence', 'for prolapse', 'for pelvic floor',
      'strengthens pelvic floor', 'pelvic floor treatment', 'bladder control',
      'urinary incontinence', 'stress incontinence', 'urge incontinence',
      // Exaggerated efficacy claims
      '30000 kegel', '30,000 kegel', '20000 kegel', '20,000 kegel',
      '11000 contraction', '11,000 contraction', '10000 contraction', '10,000 contraction',
      'equivalent to', 'equal to', 'same as',
      'kegels in', 'contractions in', 'exercises in',
      // Other health claims
      'clinically proven to cure', 'fda approved alternative',
      'breakthrough cure', 'miracle treatment', 'natural medicine',
      'targets cancer cells', 'kills tumors', 'lowers blood sugar naturally',
      'alternative to prescription', 'better than medication',
      'doctors don\'t want you to know', 'suppressed by big pharma',
      'cure cancer', 'cure diabetes', 'cure arthritis', 'cure alzheimer',
      'reverse aging', 'reverse disease', 'heal naturally',
      'therapeutic benefit', 'medical benefit', 'health benefit',
    ],
    intensityModifiers: ['cure', 'guaranteed', 'fda', 'cancer', 'diabetes', 'proven', 'treats', 'incontinence', 'prolapse'],
    redFlagsTemplate: [
      'Makes disease/condition treatment claims without FDA approval',
      'Claims may delay legitimate medical treatment',
      'No clinical trial evidence for stated benefits',
      'Exaggerated efficacy claims (e.g., "30,000 Kegels")',
    ],
    summaryTemplate: 'This content makes serious health claims (treating medical conditions) without FDA approval or clinical evidence. Such claims are illegal for non-drug products and may endanger health by delaying proper medical care.',
    threshold: 2, // Lower threshold - health claims are serious
  },
  {
    id: 'impossible_results',
    name: 'Impossible Results',
    description: 'Unrealistic results violating biological/physical constraints',
    priority: 2,
    bsRange: { min: 7.5, max: 9.5 },
    pillars: { human_evidence: 8.5, authenticity_transparency: 7.5, marketing_overclaim: 9.5, pricing_value: 7.0 },
    signals: [
      'lose 30 pounds', 'lose 20 pounds', 'lose 10 pounds in',
      'drop 5 dress sizes', 'drop dress sizes',
      'melt fat', 'burn fat while you sleep', 'effortless weight loss',
      'reverse aging', 'turn back the clock', 'look 20 years younger', 'look 10 years younger',
      'instant results', 'overnight transformation', 'see results in 24 hours', 'results in days',
      'guaranteed results', 'works for everyone', '100% effective',
      'permanent solution', 'never diet again', 'eat whatever you want',
      'hollywood secret', 'celebrity secret', 'miracle',
      'without diet or exercise', 'no exercise needed', 'no diet required',
    ],
    intensityModifiers: ['guaranteed', 'instant', 'overnight', 'miracle', 'permanent', '100%'],
    redFlagsTemplate: [
      'Promises results that violate biological limits',
      'Before/after claims without verification',
      '"Guaranteed" outcomes not substantiated',
    ],
    summaryTemplate: 'This content promises results that are biologically impossible or highly unrealistic. Claims of dramatic weight loss, instant transformation, or age reversal without effort contradict established science.',
    threshold: 3,
  },
  {
    id: 'deceptive_income_claims',
    name: 'Deceptive Income Claims',
    description: 'Unsubstantiated income/earnings claims (MLM, coaching, crypto)',
    priority: 2,
    bsRange: { min: 7.0, max: 9.5 },
    pillars: { human_evidence: 8.0, authenticity_transparency: 7.5, marketing_overclaim: 9.0, pricing_value: 7.5 },
    signals: [
      'make $10000', 'make $5000', 'make $1000 per month', 'make money online',
      'earn 6 figures', 'earn 7 figures', 'six figure income', 'seven figure',
      'passive income', 'residual income', 'recurring income',
      'financial freedom', 'be your own boss', 'quit your job', 'fire your boss',
      'guaranteed income', 'risk-free returns', 'no experience needed',
      'build your downline', 'join my team', 'network marketing opportunity',
      'proven system', 'turn-key business', 'done for you',
      'limited spots', 'exclusive opportunity', 'ground floor opportunity',
      'double your investment', 'consistent returns', 'outperform stocks',
      'ai-powered income', 'automated earnings', 'set it and forget it',
      'crypto millionaire', 'trading secrets', 'forex profits',
    ],
    intensityModifiers: ['guaranteed', 'millionaire', 'passive', 'automated', 'easy money'],
    redFlagsTemplate: [
      'Income claims lack substantiation (FTC requires evidence)',
      'Most participants in similar programs lose money',
      'Hidden costs and time investment not disclosed',
    ],
    summaryTemplate: 'This content makes income or earnings claims without required FTC substantiation. Studies show most participants in such programs lose money. Claims of "passive income" or "guaranteed returns" are major red flags.',
    threshold: 3,
  },
  {
    id: 'hidden_fees_dark_patterns',
    name: 'Hidden Fees & Dark Patterns',
    description: 'Deceptive pricing, drip pricing, manipulative design',
    priority: 5, // Lower priority - common e-commerce language can trigger false positives
    bsRange: { min: 6.0, max: 8.5 },
    pillars: { human_evidence: 6.5, authenticity_transparency: 8.0, marketing_overclaim: 7.5, pricing_value: 8.5 },
    signals: [
      // STRONG signals (truly deceptive patterns) - require these
      'just pay shipping', 'only pay shipping', '$4.95 shipping',
      'processing fee', 'convenience fee', 'service charge', 'handling fee',
      'must call to cancel', 'call to cancel', 'cannot cancel online',
      'auto-renew', 'recurring billing', 'continuous service', 'automatic renewal',
      'hidden fee', 'additional fee', 'undisclosed fee',
      'billed automatically', 'charged automatically',
      // Weaker signals (common on legitimate sites) - removed or require combination:
      // 'free trial', 'try it free', 'cancel anytime' - TOO COMMON, removed
      // 'limited time offer', 'offer expires' - TOO COMMON, removed
    ],
    intensityModifiers: ['hidden', 'auto-renew', 'recurring', 'automatic', 'undisclosed'],
    redFlagsTemplate: [
      'True costs hidden until late in purchase process',
      'Cancellation process designed to be difficult',
      'Automatic billing without clear disclosure',
    ],
    summaryTemplate: 'This content shows signs of deceptive pricing practices including hidden fees, difficult cancellation, or automatic billing. The true cost is likely higher than advertised.',
    threshold: 3,
    minExactMatches: 3, // Require 3 EXACT (non-partial) matches to avoid false positives
  },
  {
    id: 'greenwashing',
    name: 'Greenwashing',
    description: 'Misleading environmental/sustainability claims',
    priority: 4,
    bsRange: { min: 5.5, max: 8.0 },
    pillars: { human_evidence: 6.0, authenticity_transparency: 7.0, marketing_overclaim: 7.5, pricing_value: 6.0 },
    signals: [
      'eco-friendly', 'environmentally friendly', 'green product',
      'carbon neutral', 'net zero', 'carbon negative', 'climate positive',
      'biodegradable', 'compostable', 'breaks down naturally',
      'recyclable', 'made from recycled', '100% recyclable',
      'all natural', 'chemical-free', 'toxin-free', 'clean',
      'ethically sourced', 'sustainably sourced', 'responsibly sourced',
      'fair trade', 'organic', 'pesticide-free', 'non-gmo',
      'plant-based', 'vegan', 'cruelty-free',
      'saves the planet', 'save the environment', 'eco conscious',
    ],
    intensityModifiers: ['100%', 'completely', 'totally', 'certified'],
    redFlagsTemplate: [
      'Environmental claims lack third-party verification',
      'Vague terms without specific standards cited',
      'May violate FTC Green Guides',
    ],
    summaryTemplate: 'This content uses environmental marketing claims that lack verification or specific standards. Terms like "eco-friendly" and "natural" are often meaningless without third-party certification.',
    threshold: 4,
  },
  {
    id: 'fake_social_proof',
    name: 'Fake Social Proof',
    description: 'Fabricated reviews, testimonials, influencer endorsements',
    priority: 3,
    bsRange: { min: 6.5, max: 9.0 },
    pillars: { human_evidence: 7.5, authenticity_transparency: 8.5, marketing_overclaim: 8.0, pricing_value: 6.5 },
    signals: [
      '5 star reviews', 'five star reviews', 'thousands of satisfied customers',
      'top-rated', 'best-rated', '#1 rated', 'highest rated',
      'verified purchase', 'real customer', 'actual results',
      'before and after', 'transformation photos', 'real photos',
      'celebrity endorsed', 'celebrity approved', 'influencer approved',
      'as seen on tv', 'featured on', 'as seen in',
      'independent review', 'unbiased opinion', 'honest review',
      'trusted by millions', 'recommended by experts', 'doctor recommended',
      'award-winning', 'industry leader', 'market leader',
      'people are saying', 'customers love', 'rave reviews',
    ],
    intensityModifiers: ['thousands', 'millions', 'celebrity', 'verified', 'award'],
    redFlagsTemplate: [
      'Reviews may be fabricated or incentivized',
      'Testimonials lack verification',
      'Endorsements may not be disclosed as paid',
    ],
    summaryTemplate: 'This content relies heavily on social proof that may be fabricated, incentivized, or unverifiable. Fake reviews and undisclosed paid endorsements are common deceptive practices.',
    threshold: 3,
  },
  {
    id: 'proprietary_formula_claims',
    name: 'Proprietary Formula Claims',
    description: '"Secret ingredient" or "proprietary blend" obscuring lack of evidence',
    priority: 4,
    bsRange: { min: 6.0, max: 8.5 },
    pillars: { human_evidence: 7.0, authenticity_transparency: 7.5, marketing_overclaim: 7.5, pricing_value: 6.5 },
    signals: [
      'proprietary blend', 'proprietary formula', 'exclusive formula',
      'secret ingredient', 'secret formula', 'trade secret',
      'patent-pending', 'patented technology', 'patented formula',
      'clinically formulated', 'scientifically formulated',
      'doctor-formulated', 'physician-formulated', 'pharmacist-formulated',
      'pharmaceutical-grade', 'medical-grade', 'hospital-grade',
      'bioavailable', 'enhanced absorption', 'maximum potency', 'full spectrum',
      'ancient secret', 'traditional remedy', 'time-tested',
      'one-of-a-kind', 'unique formula', 'breakthrough formula',
      'third-party tested', 'gmp certified', 'lab tested',
    ],
    intensityModifiers: ['secret', 'proprietary', 'patented', 'exclusive', 'breakthrough'],
    redFlagsTemplate: [
      'Ingredient dosages hidden behind "proprietary blend"',
      'Claims cannot be independently verified',
      'Scientific-sounding terms without substantiation',
    ],
    summaryTemplate: 'This content uses "proprietary blend" or "secret formula" language that obscures actual ingredients and dosages, making it impossible to verify claims or assess safety.',
    threshold: 3,
  },
  {
    id: 'misleading_comparisons',
    name: 'Misleading Comparisons',
    description: 'False superiority claims, rigged testing, cherry-picked data',
    priority: 4,
    bsRange: { min: 5.5, max: 8.5 },
    pillars: { human_evidence: 6.5, authenticity_transparency: 7.0, marketing_overclaim: 8.0, pricing_value: 6.0 },
    signals: [
      'better than', 'outperforms', 'beats the competition',
      '#1 rated', '#1 selling', '#1 choice', 'number one',
      'clinically proven to beat', 'works better than',
      'same quality half the price', 'save 50%', 'save 70%',
      'leading brand', 'top-selling', 'best-selling', 'most popular',
      'independent tests show', 'lab results prove', 'studies confirm',
      '9 out of 10', '8 out of 10', 'preferred by',
      'voted #1', 'consumers choice', 'editor\'s choice',
      'compare to', 'equivalent to', 'just like',
    ],
    intensityModifiers: ['#1', 'best', 'leading', 'proven', 'independent'],
    redFlagsTemplate: [
      'Comparison claims lack independent verification',
      'Testing methodology not disclosed',
      '"#1" or "best" claims not substantiated',
    ],
    summaryTemplate: 'This content makes comparative superiority claims without disclosing testing methodology or providing independent verification. "#1" and "best" claims are often unsubstantiated.',
    threshold: 3,
  },
  {
    id: 'pseudoscience_claims',
    name: 'Pseudoscience Claims',
    description: 'Scientific-sounding language misrepresenting real science',
    priority: 2,
    bsRange: { min: 6.5, max: 9.0 },
    pillars: { human_evidence: 8.0, authenticity_transparency: 7.0, marketing_overclaim: 8.5, pricing_value: 6.5 },
    signals: [
      'clinically proven', 'scientifically validated', 'research-backed', 'science-backed',
      'activates', 'stimulates', 'triggers', 'unlocks',
      'cellular function', 'cellular level', 'cellular regeneration',
      'quantum', 'nano-technology', 'nanotechnology', 'molecular level',
      'dna-level', 'genetic', 'gene expression', 'epigenetic',
      'mitochondrial', 'atp production', 'energy production',
      'biofrequency', 'energy field', 'vibrational', 'frequency healing',
      'detoxifies', 'detox', 'cleanses toxins', 'removes toxins',
      'balances ph', 'alkalizes', 'alkaline body',
      'proven in studies', 'backed by research', 'clinical studies show',
    ],
    intensityModifiers: ['quantum', 'cellular', 'dna', 'molecular', 'proven'],
    redFlagsTemplate: [
      'Uses scientific terminology without valid evidence',
      'Cited studies don\'t support product claims',
      'Mechanism claims not biologically plausible',
    ],
    summaryTemplate: 'This content uses scientific-sounding terminology (quantum, cellular, DNA-level) without valid scientific evidence. These buzzwords are often used to create a false impression of efficacy.',
    threshold: 3,
  },
  {
    id: 'free_trial_trap',
    name: 'Free Trial Trap',
    description: '"Free" offers that convert to paid subscriptions',
    priority: 3,
    bsRange: { min: 7.0, max: 8.5 },
    pillars: { human_evidence: 6.5, authenticity_transparency: 8.0, marketing_overclaim: 7.5, pricing_value: 8.0 },
    signals: [
      // Strong signals indicating actual trap
      'just pay shipping', 'only pay shipping', 'pay shipping only',
      'auto-delivery', 'auto-ship', 'continuous service', 'recurring shipment',
      'limited free supply', 'free bottle', 'free month',
      'vip membership', 'preferred customer',
      'claim your free', 'get your free', 'free gift',
      // Weaker signals - need combination (common on legitimate sites alone)
      // 'free trial', 'try free', 'cancel anytime' - moved to require combination
    ],
    intensityModifiers: ['free', 'trial', 'auto', 'subscription', 'recurring'],
    redFlagsTemplate: [
      '"Free" requires credit card and auto-converts to paid',
      'Cancellation process intentionally difficult',
      'Hidden terms in fine print',
    ],
    summaryTemplate: 'This content offers a "free trial" that likely requires credit card information and automatically converts to a paid subscription. These offers are designed to be difficult to cancel.',
    threshold: 3,
    minExactMatches: 2, // Require 2 exact matches to avoid false positives
  },
  {
    id: 'urgency_manipulation',
    name: 'Urgency Manipulation',
    description: 'Fake countdown timers, fabricated scarcity',
    priority: 5, // Lower priority - common on many e-commerce sites
    bsRange: { min: 5.0, max: 7.5 },
    pillars: { human_evidence: 5.5, authenticity_transparency: 7.0, marketing_overclaim: 8.0, pricing_value: 6.0 },
    signals: [
      'limited time', 'limited time offer', 'expires soon',
      'offer ends', 'sale ends', 'deal ends', 'expires in',
      'only 5 left', 'only 3 left', 'only 10 remaining', 'low stock',
      'selling fast', 'going fast', 'almost gone', 'nearly sold out',
      'hurry', 'don\'t miss', 'last chance', 'final chance',
      'price increases', 'price going up', 'prices rise',
      'countdown', 'timer', 'hours left', 'minutes left',
      'people viewing', 'people watching', 'in cart now',
      'flash sale', 'today only', 'one day only', 'this week only',
      'act now', 'order now', 'buy now', 'immediate action',
    ],
    intensityModifiers: ['now', 'today', 'hurry', 'last', 'final', 'immediately'],
    redFlagsTemplate: [
      'Urgency tactics may be fabricated',
      'Countdown timers often reset',
      'Scarcity claims not verifiable',
    ],
    summaryTemplate: 'This content uses urgency and scarcity tactics (countdown timers, "limited stock") that are often fabricated. These psychological pressure techniques are designed to prevent thoughtful decision-making.',
    threshold: 4,
    minExactMatches: 3, // Require multiple exact matches
  },
  {
    id: 'certification_misrepresentation',
    name: 'Certification Misrepresentation',
    description: 'False claims about FDA approval, certifications, endorsements',
    priority: 1, // HIGHEST - false authority claims are serious
    bsRange: { min: 7.5, max: 9.5 },
    pillars: { human_evidence: 8.0, authenticity_transparency: 9.0, marketing_overclaim: 8.0, pricing_value: 7.0 },
    signals: [
      // FDA claims - very serious
      'fda approved', 'fda-approved', 'approved by fda',
      'fda registered', 'fda cleared', 'fda compliant',
      'cleared by fda', 'registered with fda', 'fda certification',
      '510k', '510(k)', 'class ii medical device',
      // Medical endorsement claims
      'doctor approved', 'physician approved', 'endorsed by doctors',
      'clinically recommended', 'medically recommended', 'hospital recommended',
      'hospital tested', 'used in hospitals', 'hospital grade',
      'recommended by physicians', 'recommended by doctors', 'doctor recommended',
      'used by doctors', 'trusted by professionals', 'medical professional',
      // Research claims without proof
      'university research', 'university study', 'clinical study',
      'backed by science', 'scientifically proven', 'clinically validated',
      'tested by labs', 'independent lab tested', 'third party certified',
      'research shows', 'studies show', 'proven effective',
      // Other certifications
      'certified organic', 'usda certified', 'organic certified',
      'award-winning', 'award winning', 'received awards',
      'as seen on', 'featured on', 'featured in', 'endorsed by',
    ],
    intensityModifiers: ['fda', 'approved', 'cleared', 'certified', 'endorsed', 'hospital', 'doctor', 'physician'],
    redFlagsTemplate: [
      'Claimed certifications not verifiable',
      '"FDA cleared/approved" claim lacks documentation (no 510(k) number)',
      'Authority endorsements lack documentation',
    ],
    summaryTemplate: 'This content claims FDA clearance, certifications, or professional endorsements without verifiable documentation. "FDA cleared" requires a specific 510(k) number that can be verified in the FDA database.',
    threshold: 2, // Low threshold - any FDA/certification claim is serious
  },
];

// =============================================================================
// DETECTION FUNCTIONS
// =============================================================================

/**
 * Check if text is a commodity (Tier 1)
 */
export function isCommodity(text: string): { match: boolean; item?: string } {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');

  // Reject if empty or too long
  if (!normalized || normalized.split(' ').length > 5) {
    return { match: false };
  }

  // Reject if contains URL indicators
  if (/https?:\/\/|www\.|\.com|\.ca|\.org|\.net|\.io/i.test(normalized)) {
    return { match: false };
  }

  // Reject if contains digits or currency
  if (/\d|[$€£¥]|%/.test(normalized)) {
    return { match: false };
  }

  // Reject if contains disqualifying tokens
  for (const token of DISQUALIFYING_TOKENS) {
    if (normalized.includes(token)) {
      return { match: false };
    }
  }

  // Check for non-letter/space/hyphen characters
  if (!/^[a-z\s\-']+$/.test(normalized)) {
    return { match: false };
  }

  // Exact match in lexicon
  if (COMMODITY_LEXICON.has(normalized)) {
    return { match: true, item: normalized };
  }

  // Check individual words against lexicon with simple descriptors
  const words = normalized.split(' ');
  const simpleDescriptors = new Set([
    'fresh', 'raw', 'whole', 'sliced', 'diced', 'frozen', 'dried', 'roasted',
    'salted', 'unsalted', 'red', 'green', 'yellow', 'white', 'brown', 'black',
    'wild', 'baby', 'mini', 'large', 'small', 'organic', 'local',
  ]);

  for (const word of words) {
    if (COMMODITY_LEXICON.has(word)) {
      const otherWords = words.filter(w => w !== word);
      if (otherWords.every(w => simpleDescriptors.has(w))) {
        return { match: true, item: normalized };
      }
    }
  }

  return { match: false };
}

/**
 * Detect claim archetype (Tier 2)
 */
export function detectClaimArchetype(text: string): ArchetypeMatch | null {
  const normalized = text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

  // Collect all matches that meet the threshold
  const allMatches: ArchetypeMatch[] = [];

  for (const archetype of ARCHETYPE_DEFINITIONS) {
    const matchedSignals: string[] = [];
    let weightedScore = 0;
    let exactMatches = 0;

    for (const signal of archetype.signals) {
      const signalNormalized = signal.toLowerCase();

      // Exact phrase match = 1.0
      if (normalized.includes(signalNormalized)) {
        matchedSignals.push(signal);
        weightedScore += 1.0;
        exactMatches++;
      }
      // Partial word match = 0.5 (check if all words in signal are present)
      else {
        const signalWords = signalNormalized.split(' ').filter(w => w.length > 2);
        const allWordsPresent = signalWords.every(word => normalized.includes(word));
        if (allWordsPresent && signalWords.length >= 2) {
          matchedSignals.push(signal + ' (partial)');
          weightedScore += 0.5;
        }
      }
    }

    // Calculate confidence
    const confidence = Math.min(1, weightedScore / archetype.threshold);

    // Check if meets minimum exact matches requirement (default: 1)
    const minExact = archetype.minExactMatches ?? 1;
    if (exactMatches < minExact) {
      continue; // Skip this archetype - not enough strong signals
    }

    // Only consider if confidence >= 0.70
    if (confidence >= 0.70) {
      allMatches.push({
        archetype,
        confidence,
        matchedSignals,
      });
    }
  }

  // No matches found
  if (allMatches.length === 0) {
    return null;
  }

  // Sort by priority first (lower = higher priority), then by confidence
  allMatches.sort((a, b) => {
    // First by priority (lower is better)
    const priorityDiff = a.archetype.priority - b.archetype.priority;
    if (priorityDiff !== 0) return priorityDiff;

    // Then by confidence (higher is better)
    return b.confidence - a.confidence;
  });

  // Return the highest priority match
  return allMatches[0];
}

/**
 * Calculate deterministic BS score from archetype
 */
export function calculateArchetypeScore(
  archetype: ClaimArchetype,
  text: string,
  matchedSignals: string[]
): number {
  const { min, max } = archetype.bsRange;
  const midpoint = (min + max) / 2;

  // Adjust based on intensity modifiers
  let intensityBonus = 0;
  const textLower = text.toLowerCase();
  for (const modifier of archetype.intensityModifiers) {
    if (textLower.includes(modifier)) {
      intensityBonus += 0.1;
    }
  }
  intensityBonus = Math.min(0.5, intensityBonus);

  // Adjust based on number of matched signals
  const signalBonus = Math.min(0.3, (matchedSignals.length - archetype.threshold) * 0.1);

  // Small hash-based jitter for variety but stability
  const hash = simpleHash(text);
  const jitter = ((hash % 40) - 20) / 100; // ±0.2

  let score = midpoint + intensityBonus + signalBonus + jitter;

  // Clamp to range
  score = Math.max(min, Math.min(max, score));

  return Math.round(score * 10) / 10;
}

/**
 * Simple hash function for deterministic jitter
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// =============================================================================
// ROUTING LOGIC
// =============================================================================

/**
 * Determine routing tier for input
 */
export function determineRoutingTier(
  inputType: 'url' | 'text' | 'image',
  inputValue: string,
  hasDisambiguationFailed: boolean = false
): RoutingResult {
  // URLs always go to Tier 3
  if (inputType === 'url') {
    // But still detect archetype for context
    const archetypeMatch = detectClaimArchetype(inputValue);
    return {
      tier: 3,
      mode: 'seller_specific',
      archetypeMatch: archetypeMatch || undefined,
      reason: 'URL input requires full seller-specific analysis',
    };
  }

  // Images go to Tier 3 (when implemented)
  if (inputType === 'image') {
    return {
      tier: 3,
      mode: 'full_analysis',
      reason: 'Image input requires full analysis',
    };
  }

  // Text input routing
  const text = inputValue.trim();
  const tokenCount = text.split(/\s+/).filter(t => t.length > 0).length;

  // Tier 1: Commodity check
  const commodityResult = isCommodity(text);
  if (commodityResult.match && commodityResult.item) {
    return {
      tier: 1,
      mode: 'commodity',
      commodity: commodityResult.item,
      reason: 'Basic commodity item with no marketing claims',
    };
  }

  // Tier 2: Archetype check
  const archetypeMatch = detectClaimArchetype(text);
  if (archetypeMatch && archetypeMatch.confidence >= 0.70) {
    return {
      tier: 2,
      mode: 'claim_archetype',
      archetypeMatch,
      reason: `Matches "${archetypeMatch.archetype.name}" pattern with ${Math.round(archetypeMatch.confidence * 100)}% confidence`,
    };
  }

  // Tier 4: Insufficient input check
  if (tokenCount < 4 && !commodityResult.match && !archetypeMatch && hasDisambiguationFailed) {
    return {
      tier: 4,
      mode: 'unable_to_assess',
      reason: 'Insufficient context to assess BS risk',
    };
  }

  // Tier 3: Full analysis
  return {
    tier: 3,
    mode: 'full_analysis',
    archetypeMatch: archetypeMatch || undefined,
    reason: archetypeMatch
      ? `Partial archetype match (${Math.round(archetypeMatch.confidence * 100)}%) - requires full analysis`
      : 'No clear pattern match - requires full analysis',
  };
}

// =============================================================================
// RESULT BUILDERS
// =============================================================================

/**
 * Build result for Tier 1 (Commodity)
 */
export function buildCommodityResult(item: string): {
  bunk_score: number;
  confidence: number;
  confidence_level: 'high';
  confidence_explanation: string;
  verdict: 'low';
  summary: string;
  evidence_bullets: string[];
  key_claims: never[];
  red_flags: string[];
  subscores: { human_evidence: number; authenticity_transparency: number; marketing_overclaim: number; pricing_value: number };
  pillar_scores: PrimitiveScores;
  category: string;
  analysis_mode: 'commodity';
  citations: never[];
} {
  return {
    bunk_score: 0.0,
    confidence: 1.0,
    confidence_level: 'high',
    confidence_explanation: 'Basic commodity item with no inherent marketing claims.',
    verdict: 'low',
    summary: `"${item}" is a basic commodity item with no inherent marketing claims. BS risk is minimal unless a seller makes exaggerated claims about sourcing, quality, or health benefits.`,
    evidence_bullets: [
      'This is a recognizable whole food or basic commodity',
      'No marketing claims, health promises, or brand-specific language detected',
      'BS risk would increase if seller adds claims about organic certification, sourcing, or health benefits',
    ],
    key_claims: [],
    red_flags: [],
    subscores: {
      human_evidence: 0,
      authenticity_transparency: 0,
      marketing_overclaim: 0,
      pricing_value: 0,
    },
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
    category: 'whole_foods_commodity',
    analysis_mode: 'commodity',
    citations: [],
  };
}

/**
 * Build result for Tier 2 (Archetype match)
 */
export function buildArchetypeResult(
  match: ArchetypeMatch,
  text: string
): {
  bunk_score: number;
  confidence: number;
  confidence_level: 'high';
  confidence_explanation: string;
  verdict: 'elevated' | 'high';
  summary: string;
  evidence_bullets: string[];
  key_claims: Array<{ claim: string; support_level: 'unsupported'; why: string }>;
  red_flags: string[];
  subscores: { human_evidence: number; authenticity_transparency: number; marketing_overclaim: number; pricing_value: number };
  category: string;
  analysis_mode: 'claim_archetype';
  claim_archetype: { name: string; confidence: number; matched_signals: string[] };
  citations: never[];
} {
  const { archetype, confidence, matchedSignals } = match;
  const bunkScore = calculateArchetypeScore(archetype, text, matchedSignals);

  return {
    bunk_score: bunkScore,
    confidence,
    confidence_level: 'high',
    confidence_explanation: `Matches "${archetype.name}" pattern with ${Math.round(confidence * 100)}% confidence based on ${matchedSignals.length} signal matches.`,
    verdict: bunkScore >= 7.0 ? 'high' : 'elevated',
    summary: archetype.summaryTemplate,
    evidence_bullets: [
      archetype.description,
      `Detected ${matchedSignals.length} warning signals characteristic of this pattern`,
      ...archetype.redFlagsTemplate,
    ],
    key_claims: matchedSignals.slice(0, 5).map(signal => ({
      claim: signal.replace(' (partial)', ''),
      support_level: 'unsupported' as const,
      why: `This is a common phrase in ${archetype.name.toLowerCase()} content`,
    })),
    red_flags: archetype.redFlagsTemplate,
    subscores: {
      human_evidence: archetype.pillars.human_evidence,
      authenticity_transparency: archetype.pillars.authenticity_transparency,
      marketing_overclaim: archetype.pillars.marketing_overclaim,
      pricing_value: archetype.pillars.pricing_value,
    },
    category: archetype.id,
    analysis_mode: 'claim_archetype',
    claim_archetype: {
      name: archetype.name,
      confidence,
      matched_signals: matchedSignals,
    },
    citations: [],
  };
}

/**
 * Build result for Tier 4 (Unable to assess)
 */
export function buildUnableToAssessResult(): {
  bunk_score: null;
  confidence: number;
  confidence_level: 'low';
  confidence_explanation: string;
  verdict: null;
  summary: string;
  evidence_bullets: string[];
  key_claims: never[];
  red_flags: never[];
  subscores: null;
  analysis_mode: 'unable_to_assess';
  unable_to_assess: true;
  citations: never[];
} {
  return {
    bunk_score: null,
    confidence: 0.1,
    confidence_level: 'low',
    confidence_explanation: 'Insufficient information to assess BS risk.',
    verdict: null,
    summary: 'Unable to assess. Please provide more context such as a URL, full product name, or marketing claims.',
    evidence_bullets: [
      'The input is too short or vague to analyze',
      'Try pasting a product URL for the most accurate analysis',
      'Or include specific marketing claims or product descriptions',
    ],
    key_claims: [],
    red_flags: [],
    subscores: null,
    analysis_mode: 'unable_to_assess',
    unable_to_assess: true,
    citations: [],
  };
}
