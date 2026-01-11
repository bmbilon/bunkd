# Testing TEXT Analysis - Debugging Guide

This guide will help you test and debug TEXT analysis in the Bunkd app after the improvements made to error handling and auth.

## Changes Made

### 1. Client-Side Error Handling (`apps/mobile/lib/api.ts`)
- Added detailed error parsing for `FunctionsHttpError`, `FunctionsRelayError`, and `FunctionsFetchError`
- Errors now extract and display the full error body from Edge Functions
- Added console logging for debugging request/response flow

### 2. Server-Side Error Handling (`supabase/functions/analyze_product/index.ts`)
- Added structured JSON error responses with `error`, `details`, `hint`, `where`, and `request_id` fields
- Added comprehensive logging with unique request IDs for tracking
- Added input normalization to support both `text`/`content` and `image_url`/`imageUrl` naming conventions
- Added validation error messages with helpful hints
- All errors now return proper JSON (no more generic 500s)

### 3. Authentication (`apps/mobile/app/_layout.tsx` and `hooks/use-auth.ts`)
- Added automatic anonymous authentication on app startup
- Users are signed in silently before the app loads
- Loading screen shown while auth initializes

### 4. Supabase Configuration (`supabase/config.toml`)
- Enabled anonymous sign-ins: `enable_anonymous_sign_ins = true`

## Testing Steps

### Step 1: Enable Anonymous Auth in Remote Supabase

You need to enable anonymous auth in your remote Supabase project:

1. Go to https://supabase.com/dashboard/project/qmhqfmkbvyeabftpchex/auth/providers
2. Find "Anonymous Sign-In" in the providers list
3. Enable it
4. Save changes

### Step 2: Deploy the Updated Edge Function

```bash
cd /Users/brettbilon/bunkd

# Link to your project (if not already linked)
supabase link --project-ref qmhqfmkbvyeabftpchex

# Deploy the updated analyze_product function
supabase functions deploy analyze_product

# Verify deployment
supabase functions list
```

### Step 3: Test the Function Directly with curl

Test the function with a direct HTTP request to see detailed error messages:

```bash
# Replace with your actual Supabase URL and anon key from apps/mobile/lib/supabase.ts
SUPABASE_URL="https://qmhqfmkbvyeabftpchex.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtaHFmbWtidnllYWJmdHBjaGV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMzMyMzgsImV4cCI6MjA4MzcwOTIzOH0.LEmsl18C1cH3RjAQXC1TMViN7nrXbDgVEALHAYtY6PE"

# Test without auth (should fail with helpful error)
curl -i "${SUPABASE_URL}/functions/v1/analyze_product" \
  -H "Content-Type: application/json" \
  -H "apikey: ${ANON_KEY}" \
  -d '{"text":"Turkesterone"}'

# If you have a session token, test with auth
# First, get a session token by signing in anonymously
curl -X POST "${SUPABASE_URL}/auth/v1/signup" \
  -H "Content-Type: application/json" \
  -H "apikey: ${ANON_KEY}" \
  -d '{}'

# Copy the access_token from the response, then test again
curl -i "${SUPABASE_URL}/functions/v1/analyze_product" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE" \
  -H "apikey: ${ANON_KEY}" \
  -d '{"text":"Turkesterone"}'
```

### Step 4: Monitor Function Logs

In a separate terminal, watch the Edge Function logs in real-time:

```bash
cd /Users/brettbilon/bunkd
supabase functions logs analyze_product --tail
```

This will show you:
- Request IDs
- Input type and content length
- Auth status
- Cache hit/miss
- Job creation status
- Any errors with full stack traces

### Step 5: Test in the Mobile App

1. Start the Expo dev server:
```bash
cd /Users/brettbilon/bunkd/apps/mobile
npm start
```

2. Open the app in iOS Simulator or on device

3. Check the console for auth initialization:
```
[Auth] Initializing authentication...
[Auth] ✓ Signed in anonymously: <user_id>
```

4. Navigate to the Analyze tab

5. Enter "Turkesterone" in the TEXT input

6. Tap "Analyze"

7. Watch the console for detailed logging:
```
[BunkdAPI] Calling function: analyze_product
[BunkdAPI] Response from analyze_product: ...
```

### Step 6: Verify Error Visibility

If TEXT analysis fails, you should now see:
- An Alert with the specific error message (not just "non-2xx status code")
- Detailed console logs showing:
  - Request payload
  - Response status
  - Error body
  - Hints for fixing the issue

## Common Errors and Solutions

### Error: "Missing authorization header"
**Cause:** Anonymous auth failed or didn't complete before making the request
**Solution:**
- Check that anonymous sign-ins are enabled in Supabase dashboard
- Check console for `[Auth]` logs showing successful initialization
- Restart the app to trigger fresh auth initialization

### Error: "Failed to create analysis job" with RLS policy violation
**Cause:** RLS policies on `analysis_jobs` table don't allow anonymous users to insert
**Solution:** Update RLS policies to allow inserts for authenticated users (including anonymous):
```sql
-- In Supabase SQL Editor
CREATE POLICY "Allow authenticated users to insert jobs"
ON analysis_jobs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
```

### Error: "Invalid input"
**Cause:** The payload doesn't match expected format
**Solution:** Ensure you're sending at least one of: `url`, `text`, or `image_url`
- The function now also accepts `content` (alias for `text`) and `imageUrl` (alias for `image_url`)

### Error: Network timeout or connection refused
**Cause:** Edge Function not deployed or Supabase URL incorrect
**Solution:**
- Verify deployment: `supabase functions list`
- Check Supabase URL in `apps/mobile/lib/supabase.ts` matches your project

## Success Criteria

TEXT analysis is working correctly when:
1. ✅ App signs in anonymously on startup (check console)
2. ✅ Submitting "Turkesterone" returns either:
   - A cached result (status 200 with `cached: true`)
   - A new job ID (status 202 with `job_id`)
3. ✅ If it fails, you see the actual error message in an Alert
4. ✅ Function logs show detailed request/response info with request IDs

## Debugging Checklist

If TEXT analysis still fails:
- [ ] Anonymous auth is enabled in Supabase dashboard
- [ ] Edge Function is deployed: `supabase functions list`
- [ ] App console shows `[Auth] ✓ Signed in anonymously`
- [ ] Function logs show request with `[<request_id>]` format
- [ ] Error message in app is specific (not generic "non-2xx")
- [ ] Check RLS policies on `analysis_jobs` and `analysis_results` tables

## Additional Resources

- Supabase Anonymous Sign-In: https://supabase.com/docs/guides/auth/auth-anonymous
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- RLS Policies: https://supabase.com/docs/guides/auth/row-level-security
