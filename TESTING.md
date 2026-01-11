# Bunkd Testing Guide

## Testing Without Authentication

The app has been configured to work without authentication for testing purposes.

### Backend Changes
- ✅ Edge functions use service role key (bypasses RLS)
- ✅ Test user ID: `00000000-0000-0000-0000-000000000000`
- ✅ RLS disabled on analysis tables
- ✅ Functions deployed and ready

### Quick Test

#### 1. Test API Directly

```bash
# Test analyze_product endpoint
curl -X POST 'https://qmhqfmkbvyeabftpchex.supabase.co/functions/v1/analyze_product' \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "This amazing product will revolutionize your life! 100% guaranteed results in just 24 hours!"
  }'
```

Expected response:
```json
{
  "status": "queued",
  "job_id": "some-uuid-here"
}
```

#### 2. Check Job Status

```bash
# Replace JOB_ID with the job_id from step 1
curl 'https://qmhqfmkbvyeabftpchex.supabase.co/functions/v1/job_status?job_id=JOB_ID'
```

Expected response (when complete):
```json
{
  "job_id": "...",
  "status": "completed",
  "result": {
    "bunkd_score": 3.5,
    "bias_indicators": [...],
    "factual_claims": [...],
    "summary": "...",
    "sources": [...]
  }
}
```

### Running the Mobile App

#### 1. Install Dependencies

```bash
cd apps/mobile
npm install
```

#### 2. Start the Development Server

```bash
npm start
```

#### 3. Test the App

1. **Analyze Screen**:
   - Select "URL", "Text", or "Image" tab
   - Enter test content (e.g., "This product is the best ever!")
   - Tap "Analyze"
   - Watch status updates ("Analyzing...", "Processing...")
   - Automatically navigates to Result screen when done

2. **Result Screen**:
   - View objectivity score (0-10)
   - See color-coded tier (Excellent/Good/Fair/Poor)
   - Tap to expand Bias Indicators
   - Tap to expand Factual Claims
   - View Sources (tap to open in browser)

3. **History Screen**:
   - View all previous analyses
   - See status badges
   - Tap completed analyses to view results
   - Pull down to refresh

### Test Cases

#### Test 1: Objective Content
```
Text: "This is a smartphone with a 6.1-inch display, 128GB storage, and dual cameras."
Expected: High objectivity score (7-10)
```

#### Test 2: Marketing Hype
```
Text: "The BEST phone EVER! Revolutionary! Life-changing! 1000% better than competitors!"
Expected: Low objectivity score (1-4)
```

#### Test 3: URL Test
```
URL: https://www.example.com/product
(Any product page you want to analyze)
```

### Troubleshooting

**Issue**: "No jobs available" when calling run_job
**Solution**: Make sure analyze_product was called first to create a job

**Issue**: Job stays in "queued" status
**Solution**: The run_job function needs to be triggered. For now, this would be done manually or via a cron job.

**Issue**: History screen is empty
**Solution**: Submit at least one analysis first

### Important Notes

⚠️ **Security Warning**: RLS is currently disabled for testing. Before production:
1. Re-enable RLS
2. Implement proper authentication
3. Update edge functions to verify user identity
4. Remove test user ID

### Next Steps

1. **Add Authentication**:
   - Supabase Auth (email/password, social login)
   - Update edge functions to use real user IDs
   - Re-enable RLS policies

2. **Add Job Processing**:
   - Set up cron job to call run_job automatically
   - Or use Supabase Database Webhooks
   - Or implement real-time job processing

3. **Production Deployment**:
   - Re-enable RLS
   - Remove test configurations
   - Add environment variable management
   - Set up proper error tracking
