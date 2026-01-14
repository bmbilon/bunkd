# Insufficient Data Scoring Fix - Implementation Summary

## Problem Solved

Previously, when the perplexity-worker couldn't extract sufficient product data (ingredients, claims, studies, etc.), it would assign default high subscores (8-10), resulting in an unfair BS score of 10 for products where data simply wasn't available.

## Solution Implemented

Added intelligent detection of insufficient data with 6 criteria, and returns "Unable to Score" instead of a misleading score of 10.

---

## Changes Made

### **Backend: Perplexity Worker**

**File**: `/Users/brettbilon/bunkd/services/perplexity-worker/src/index.ts`

#### 1. Updated `BunkdAnalysisResult` interface
- Made `bunk_score` and `verdict` optional
- Added `unable_to_score?: boolean` flag
- Added `insufficient_data_reason?: string` explanation

#### 2. Added `detectInsufficientData()` function
Detects insufficient data when **≥ 2 of these criteria are met**:

1. **All subscores ≥ 8.5** - Suggests default "no data" scoring
2. **Fewer than 3 key claims** - Not enough claims to analyze
3. **Summary contains insufficient data keywords** - "insufficient", "not enough", "unable to", etc.
4. **Product details all "Not specified"** - No product info extracted
5. **Page content < 500 characters** - Not enough content to analyze
6. **Fewer than 3 evidence bullets** - Minimum 5 expected

#### 3. Updated `parseAndValidateResponse()` function
- Added `pageContentLength` parameter
- Calls `detectInsufficientData()` before computing score
- Returns result with `unable_to_score: true` when insufficient data detected
- Only computes BS score when sufficient data exists

#### 4. Updated `processJob()` function
- Logs "⚠️ Unable to score" instead of computed score when insufficient
- Stores `null` for `bs_score` in database when unable to score
- Passes page content length to validation (for future enhancement)

---

### **Frontend: Mobile App**

**File**: `/Users/brettbilon/bunkd/apps/mobile/app/result.tsx`

#### 1. Updated `getScore()` helper
- Returns `number | null` instead of always returning a number
- Checks `unable_to_score` flag and returns `null`

#### 2. Added insufficient data helpers
- `getInsufficientDataReason()` - Extracts reason from result
- `unableToScore` boolean variable
- `insufficientDataReason` string variable

#### 3. Updated score card display
- Shows **⚠️ "Unable to Score"** instead of numeric score
- Displays message: "Not enough product data found to assign a reliable Bunkd Score"
- Gray border color instead of red/yellow/green

#### 4. Added yellow warning banner in summary
- Title: "Why can't we score this?"
- Shows detailed insufficient data reason
- Only displays when `unableToScore` is true

#### 5. Updated breakdown tab
- Shows warning card: "⚠️ Insufficient Data"
- Explains subscores are based on limited data
- Notes they should not be relied upon
- Hides score formula when unable to score

#### 6. Added comprehensive styling
- `unableToScoreContainer` - Score card styling
- `insufficientDataBanner` - Yellow warning banner
- `insufficientDataCard` - Breakdown tab warning
- Professional yellow/gold color scheme (#FFF9E6, #FFB800, #8B6914)

---

## User Experience

### **Before Fix:**
- Product with missing data → BS Score: **10/10** (unfairly penalized)
- Red border, "Very High Bunkd Score"
- No explanation of why score is high

### **After Fix:**
- Product with missing data → **⚠️ Unable to Score**
- Gray border, clear warning message
- Detailed explanation of what data is missing
- Subscores still shown for transparency, but with warning
- User understands the limitation instead of seeing misleading score

---

## Example Insufficient Data Scenarios

### Scenario 1: Generic landing page
- **Criteria met**: All subscores ≥ 8.5, summary says "insufficient", < 3 key claims
- **Reason**: "All quality indicators show maximum concern, suggesting insufficient product data to evaluate; Analysis summary indicates insufficient product information; Only 1 product claims found (minimum 3 needed for analysis)"

### Scenario 2: Short product page
- **Criteria met**: Page < 500 chars, < 3 evidence bullets, < 3 claims
- **Reason**: "Page content too short (347 characters) for meaningful analysis; Only 2 evidence points found (minimum 5 expected); Only 2 product claims found (minimum 3 needed for analysis)"

### Scenario 3: Missing product details
- **Criteria met**: All product details "Not specified", all subscores high, < 3 evidence bullets
- **Reason**: "No product details (name, ingredients, volume, price) could be extracted; All quality indicators show maximum concern, suggesting insufficient product data to evaluate; Only 2 evidence points found (minimum 5 expected)"

---

## Testing

### Backend Compilation:
```bash
cd /Users/brettbilon/bunkd/services/perplexity-worker
npm run build
# ✅ Success - TypeScript compiled without errors
```

### Frontend Compilation:
```bash
cd /Users/brettbilon/bunkd/apps/mobile
npx tsc --noEmit
# ✅ Success - TypeScript compiled without errors
```

### Manual Testing Checklist:
- [ ] Deploy updated perplexity-worker
- [ ] Test with product that has insufficient data
- [ ] Verify "Unable to Score" displays in app
- [ ] Verify yellow warning banner shows reason
- [ ] Verify breakdown tab shows warning
- [ ] Test with product that has sufficient data
- [ ] Verify normal scoring still works (score displays correctly)

---

## Deployment

1. **Deploy Backend:**
   ```bash
   cd /Users/brettbilon/bunkd/services/perplexity-worker
   ./deploy.sh
   ```

2. **Rebuild Mobile App:**
   ```bash
   cd /Users/brettbilon/bunkd/apps/mobile
   # Test locally first
   npm start
   # Then deploy to app stores as needed
   ```

3. **Monitor Logs:**
   ```bash
   flyctl logs -f
   # Look for: "⚠️ Unable to score: ..." messages
   ```

---

## Future Enhancements

1. **Page content fetching** - Already implemented, ready to use
   - Fetch page content in worker before analysis
   - Pass content length to insufficient data detection
   - Check 5: Page content < 500 chars will activate

2. **Configurable thresholds**
   - Allow adjusting minimum claims count (currently 3)
   - Allow adjusting minimum evidence bullets (currently 5)
   - Allow adjusting page content minimum (currently 500 chars)

3. **Product-specific detection**
   - Different thresholds for different product categories
   - E.g., supplements need ingredient lists, tech products don't

4. **Analytics**
   - Track % of analyses that are insufficient
   - Identify common insufficient data patterns
   - Improve prompts to extract more data

---

## Files Modified

1. `/Users/brettbilon/bunkd/services/perplexity-worker/src/index.ts`
   - Interface updates
   - `detectInsufficientData()` function
   - `parseAndValidateResponse()` updates
   - `processJob()` updates

2. `/Users/brettbilon/bunkd/apps/mobile/app/result.tsx`
   - Score handling updates
   - UI for insufficient data state
   - Warning banners and cards
   - Comprehensive styling

---

## Impact

✅ **Positive:**
- No more unfair scores of 10 for products with missing data
- Clear communication of data limitations
- Maintains transparency by showing subscores with warning
- Professional UX that builds trust

✅ **No Breaking Changes:**
- Existing analyses with valid scores continue working
- Database schema compatible (bs_score allows null)
- Mobile app gracefully handles both scored and unscored results

---

Generated: 2026-01-13
