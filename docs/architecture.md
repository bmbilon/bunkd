# Bunkd Architecture

## Overview

Bunkd is a product claim analysis system that measures how well public claims are supported by publicly available evidence.

**Canonical Definition**: Bunkd Score (BS) is a numerical measure (0–10) of how well public claims are supported by publicly available evidence.

## System Components

### 1. Mobile App (Expo/React Native)
**Location**: `apps/mobile/`

User-facing interface for submitting analysis requests and viewing results.

**Key Screens**:
- **Analyze Screen**: Input URL, text, or image for analysis
- **Result Screen**: Display BS Meter with Bunkd Score (0-10) and detailed analysis
- **History Screen**: View past analyses
- **About Screen**: Methodology and Objectivity Charter

**Technology**: React Native, Expo Router, TypeScript

### 2. Edge Functions (Deno)
**Location**: `supabase/functions/`

Serverless functions deployed on Supabase Edge Network.

#### analyze_product
- **Purpose**: Accept user input and create analysis jobs
- **Input**: URL, text, or image
- **Output**: Job ID or cached result
- **Caching**: Fingerprint-based with TTL

#### job_status
- **Purpose**: Check analysis job status
- **Input**: Job ID
- **Output**: Status + result (if complete)

#### run_job
- **Purpose**: Process queued analysis jobs
- **Flow**:
  1. Acquire next job (FOR UPDATE SKIP LOCKED)
  2. Fetch content (if URL)
  3. Call AI provider (Perplexity)
  4. Validate response (Zod schema)
  5. Store result + sources
  6. Mark job complete

### 3. Database (PostgreSQL via Supabase)
**Location**: `supabase/migrations/`

**Core Tables**:

- **rubrics**: Active rubric text + versioning
  - Contains canonical BS Meter definition
  - System prompt for AI analysis

- **analysis_jobs**: Job queue with status tracking
  - States: queued → processing → completed/failed
  - Includes fingerprint for deduplication

- **analysis_results**: Cached analysis outputs
  - Bunkd Score (0-10)
  - Bias indicators
  - Factual claims with verification
  - Sources with citations
  - TTL via expires_at

- **analysis_sources**: Citation tracking
  - Links to sources used in analysis

- **product_inputs**: User submission history

### 4. Shared Utilities
**Location**: `supabase/functions/_shared/`

- **validate.ts**: Zod schemas for input/output validation
- **rubric.ts**: Rubric management and system prompts
- **fetch_page_text.ts**: URL content extraction
- **providers/perplexity.ts**: AI provider integration

## Data Flow

### Analysis Request Flow

```
User Input (URL/Text)
  ↓
analyze_product function
  ↓
Generate fingerprint
  ↓
Check cache (analysis_results)
  ↓
If cached → Return immediately
  ↓
If not cached → Create job (analysis_jobs)
  ↓
Return job_id to client
  ↓
Client polls job_status
  ↓
run_job processes queue
  ↓
AI analysis (Perplexity)
  ↓
Validate response (Zod)
  ↓
Store result + sources
  ↓
Mark job complete
  ↓
Client receives result
```

### Caching Strategy

**Fingerprint Generation**:
- Hash of: input + rubric version
- Enables exact duplicate detection
- Cache hit returns instant results

**TTL**: 30 days (configurable)

**Benefits**:
- Reduced AI costs
- Faster response times
- Consistent results for identical inputs

## AI Integration

### Provider: Perplexity
**Model**: sonar-pro

**Why Perplexity**:
- Online search + citations
- Up-to-date information
- Source attribution

**Prompt Structure**:
```
System: [Canonical BS definition + scoring guidance]
User: [Product content to analyze]
```

**Output Format**: Structured JSON with:
- bunkd_score: 0-10
- bias_indicators: array of strings
- factual_claims: array with verification + confidence
- summary: string
- sources: array of citations
- reasoning: string

## Terminology Standards

### Code
- Use `bunkd_score` (not objectivity_score)
- Store scores as 0-10 numeric values
- Tier labels: Very Low/Low/Moderate/High/Very High Bunkd Score

### UI
- Primary label: **BS Meter**
- Secondary label: Bunkd Score
- Display: `8.8 / 10`
- Color coding:
  - 9-10: Green (Very High)
  - 7-8: Yellow (High)
  - 5-6: Orange (Moderate)
  - 3-4: Light Red (Low)
  - 0-2: Red (Very Low)

### Documentation
Every document should include the canonical definition:

> Bunkd Score (BS) is a numerical measure (0–10) of how well public claims are supported by publicly available evidence.

## Security

### Current State (Testing)
- ⚠️ RLS disabled
- ⚠️ Service role key in functions
- ⚠️ Nullable user_id (no FK constraint)

### Production Requirements
- ✅ Enable RLS on all tables
- ✅ Implement Supabase Auth
- ✅ Enforce user_id foreign keys
- ✅ Use anon key in client
- ✅ Verify auth in functions

## Job Processing

### Current: Manual Trigger
The `run_job` function must be called manually or via cron.

### Future: Automated Processing
Options:
1. **Supabase Cron**: pg_cron extension
2. **Database Webhooks**: Trigger on job insert
3. **External Cron**: Call run_job via HTTP
4. **Real-time Processing**: WebSockets + worker pool

## Performance Considerations

### Database
- Indexes on fingerprint, status, user_id
- FOR UPDATE SKIP LOCKED for job locking
- TTL-based cleanup via expires_at

### Caching
- Fingerprint-based deduplication
- 30-day TTL
- Instant return for cache hits

### API
- Edge function deployment (low latency)
- Parallel processing possible
- Job queue prevents overload

## Monitoring & Observability

### Key Metrics
- Jobs created per minute
- Cache hit rate
- Average processing time
- Failed job rate
- AI provider latency

### Logging
- Edge function console.log
- Job status transitions
- Error messages in analysis_jobs

## Deployment

### Edge Functions
```bash
supabase functions deploy analyze_product
supabase functions deploy job_status
supabase functions deploy run_job
```

### Database Migrations
```bash
supabase db push
```

### Mobile App
```bash
cd apps/mobile
npm run build
# Deploy via EAS or app stores
```

## Environment Variables

### Supabase Secrets
```bash
PPLX_API_KEY=...        # Perplexity API key
PROVIDER=perplexity     # AI provider name
```

### Mobile App
```
SUPABASE_URL=...        # From Supabase dashboard
SUPABASE_ANON_KEY=...   # Public anon key
```

## Testing Strategy

### API Testing
- Direct curl requests to functions
- Verify job creation
- Test cache hits
- Validate JSON schema

### Mobile Testing
- Submit various input types
- Verify polling behavior
- Check result display
- Test history loading

### Integration Testing
- End-to-end analysis flow
- Cache behavior
- Error handling
- Edge cases

## Future Enhancements

### Planned
- [ ] User authentication
- [ ] Automated job processing
- [ ] Batch analysis API
- [ ] Real-time status updates (WebSockets)
- [ ] Image analysis (vision API)
- [ ] Custom rubrics
- [ ] Export results (PDF, CSV)
- [ ] Public share links
- [ ] API rate limiting

### Under Consideration
- [ ] Browser extension
- [ ] API for third-party integrations
- [ ] Comparison mode (multiple products)
- [ ] Historical tracking (score changes over time)
- [ ] Premium features (faster processing, more sources)

---

**Version**: 1.0
**Last Updated**: January 2026
