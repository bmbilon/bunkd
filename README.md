# Bunkd

**BS Meter**: Measuring how well public claims are supported by publicly available evidence.

## Canonical Definition

**Bunkd Score (BS) is a numerical measure (0–10) of how well public claims are supported by publicly available evidence.**

Higher scores indicate better evidence support. Lower scores indicate claims with minimal or no supporting evidence.

## What is Bunkd?

Bunkd analyzes product claims and marketing language to evaluate the quality and availability of supporting evidence. It doesn't tell you if a product is "good" or "bad"—it tells you how well the claims are backed up by publicly accessible information.

### What We Measure
✅ Specificity vs. vagueness in claims
✅ Availability of technical specifications
✅ Presence of citations and sources
✅ Use of promotional vs. descriptive language
✅ Comparative context and benchmarks

### What We Don't Measure
❌ Product quality or performance
❌ Value for money
❌ Subjective preferences
❌ Brand reputation
❌ Customer satisfaction

## Project Structure

```
bunkd/
├── apps/
│   └── mobile/              # Expo mobile app
│       ├── app/             # Screens (Analyze, Result, History, About)
│       └── lib/             # API client and Supabase config
├── supabase/
│   ├── functions/           # Edge functions (Deno)
│   │   ├── analyze_product/ # Accept analysis requests
│   │   ├── job_status/      # Check job progress
│   │   ├── run_job/         # Process analysis queue
│   │   └── _shared/         # Shared utilities
│   └── migrations/          # Database schema
└── docs/
    ├── architecture.md      # Technical architecture
    └── objectivity-charter.md  # Methodology & principles
```

## Technology Stack

### Mobile App
- **React Native** (via Expo)
- **TypeScript**
- **Supabase JS Client**

### Backend
- **Supabase** (PostgreSQL + Edge Functions)
- **Deno** (Edge function runtime)
- **Perplexity AI** (Analysis provider)
- **Zod** (Schema validation)

## Getting Started

### Prerequisites
- Node.js 18+
- Supabase CLI
- Perplexity API key

### Installation

1. **Clone and install dependencies**
   ```bash
   cd bunkd
   npm install -g pnpm
   pnpm install
   ```

2. **Link Supabase project**
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

3. **Set secrets**
   ```bash
   supabase secrets set PPLX_API_KEY="your-perplexity-key"
   supabase secrets set PROVIDER="perplexity"
   ```

4. **Deploy database migrations**
   ```bash
   supabase db push
   ```

5. **Deploy edge functions**
   ```bash
   supabase functions deploy analyze_product
   supabase functions deploy job_status
   supabase functions deploy run_job
   ```

6. **Run mobile app**
   ```bash
   cd apps/mobile
   npm install
   npm start
   ```

## How It Works

### 1. User submits content for analysis
Input can be:
- Product URL
- Text description
- Image URL

### 2. System creates analysis job
- Generates fingerprint for caching
- Checks if identical analysis exists
- Returns cached result OR creates new job

### 3. Job processing
- Fetches content (if URL)
- Calls AI provider (Perplexity)
- Analyzes claims vs. evidence
- Validates response structure
- Stores result with sources

### 4. Result display
Shows:
- **BS Meter** with Bunkd Score (0-10)
- **Bias Indicators**: Promotional language patterns
- **Factual Claims**: Individual claims with verification status
- **Sources**: Citations used in analysis
- **Summary**: Overall assessment

## Score Interpretation

| Score | Tier | Meaning |
|-------|------|---------|
| 9-10 | Very High Bunkd Score | Claims have comprehensive supporting evidence |
| 7-8 | High Bunkd Score | Claims have substantial supporting evidence |
| 5-6 | Moderate Bunkd Score | Claims have some supporting evidence |
| 3-4 | Low Bunkd Score | Claims have minimal supporting evidence |
| 0-2 | Very Low Bunkd Score | Claims have almost no supporting evidence |

**Color Coding**:
- 🟢 Green (9-10): Very High
- 🟡 Yellow (7-8): High
- 🟠 Orange (5-6): Moderate
- 🔴 Light Red (3-4): Low
- 🔴 Red (0-2): Very Low

## API Usage

### Submit Analysis
```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/analyze_product' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -d '{"text": "Revolutionary smartphone with amazing features"}'
```

Response:
```json
{
  "status": "queued",
  "job_id": "uuid-here"
}
```

### Check Status
```bash
curl 'https://YOUR_PROJECT.supabase.co/functions/v1/job_status?job_id=UUID' \
  -H 'Authorization: Bearer YOUR_ANON_KEY'
```

Response (when complete):
```json
{
  "job_id": "uuid",
  "status": "completed",
  "result": {
    "bunkd_score": 1.0,
    "bias_indicators": ["Vague superlatives", "No technical specs"],
    "factual_claims": [...],
    "summary": "...",
    "sources": [...]
  }
}
```

### Process Job (Manual Trigger)
```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/run_job' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -d '{}'
```

## Development

### Run locally
```bash
# Start mobile app
cd apps/mobile
npm start

# Test edge functions
supabase functions serve

# Run migrations
supabase db reset
```

### Testing
See [TESTING.md](TESTING.md) for comprehensive testing instructions.

### Documentation
- [Architecture](docs/architecture.md): Technical details
- [Objectivity Charter](docs/objectivity-charter.md): Methodology & principles

## Security Notes

⚠️ **Current state is for testing only**

The project currently has:
- RLS disabled on tables
- No user authentication required
- Service role key in edge functions

### Before production:
1. ✅ Enable RLS policies
2. ✅ Implement Supabase Auth
3. ✅ Use anon key in client
4. ✅ Verify auth in functions
5. ✅ Add rate limiting
6. ✅ Set up monitoring

## Roadmap

### Completed ✅
- Core analysis pipeline
- Mobile app (iOS/Android/Web)
- Caching system
- Job queue
- BS Meter branding

### Next Steps
- [ ] User authentication
- [ ] Automated job processing (cron)
- [ ] Image analysis (vision API)
- [ ] Browser extension
- [ ] Public share links
- [ ] Export results (PDF, CSV)

## Contributing

Contributions welcome! Please:
1. Read the [Objectivity Charter](docs/objectivity-charter.md)
2. Follow the canonical terminology (BS Meter, Bunkd Score)
3. Include tests for new features
4. Update documentation

## License

[To be determined]

## Contact

[To be determined]

---

**Remember**: Bunkd Score (BS) is a numerical measure (0–10) of how well public claims are supported by publicly available evidence.

The BS Meter displays a Bunkd Score between 0 and 10. Higher values indicate stronger levels of supporting evidence for the evaluated claims.
