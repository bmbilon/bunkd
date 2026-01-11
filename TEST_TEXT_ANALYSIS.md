# Testing TEXT Analysis - Debugging Guide

This guide will help you test and debug TEXT analysis in the Bunkd app after the improvements made to error handling and auth.

## 🚨 CRITICAL FIRST STEP: Enable Anonymous Auth

**The #1 reason TEXT analysis fails is because Anonymous Sign-ins are DISABLED in Supabase.**

### Quick Fix (Do This First!)

1. **Open Supabase Dashboard:**
   https://supabase.com/dashboard/project/qmhqfmkbvyeabftpchex/auth/providers

2. **Find "Anonymous sign-ins" and toggle it ON**

3. **Click "Save"**

4. **Run the verification script:**
   ```bash
   cd /Users/brettbilon/bunkd/apps/mobile
   node verify-anon-auth.js
   ```

   Expected output:
   ```
   ✅ ANONYMOUS SIGN-IN SUCCESSFUL!

   Session details:
     User ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
     Access token length: 362
     Token expires at: 2024-01-11T...
     Provider: anonymous
   ```

   If you see an error, follow the instructions in the output.

---

## Changes Made

### 1. **Client-Side Error Handling** (`apps/mobile/lib/api.ts`)
- Added detailed error parsing for `FunctionsHttpError`, `FunctionsRelayError`, and `FunctionsFetchError`
- Errors now extract and display the full error body from Edge Functions
- Added comprehensive session verification before every API call
- Added console logging for debugging request/response flow

### 2. **Server-Side Error Handling** (`supabase/functions/analyze_product/index.ts`)
- Added structured JSON error responses with `error`, `details`, `hint`, `where`, and `request_id` fields
- Added comprehensive logging with unique request IDs for tracking
- Added input normalization to support both `text`/`content` and `image_url`/`imageUrl` naming conventions
- Added validation error messages with helpful hints
- All errors now return proper JSON (no more generic 500s)

### 3. **Hardened Authentication** (`apps/mobile/app/_layout.tsx` and `hooks/use-auth.ts`)
- Added automatic anonymous authentication on app startup
- **App will NOT crash if anonymous auth is disabled** - instead shows a warning banner
- Added detailed console logging with clear error messages
- Users are signed in silently before the app loads
- Loading screen shown while auth initializes

### 4. **Warning Banner** (`components/auth-warning-banner.tsx`)
- Shows yellow warning banner when anonymous auth is disabled
- Provides direct link to Supabase dashboard to enable it
- Does NOT block the app from running

### 5. **Verification Script** (`apps/mobile/verify-anon-auth.js`)
- Quick test to verify anonymous auth is working
- Shows clear error messages with fix instructions
- Run before testing in the app

---

## Testing Steps

### Step 1: Enable Anonymous Auth and Verify (REQUIRED)

```bash
# 1. Enable anonymous auth in Supabase dashboard (see link above)

# 2. Run verification script
cd /Users/brettbilon/bunkd/apps/mobile
node verify-anon-auth.js
```

**Do not proceed until you see `✅ ANONYMOUS SIGN-IN SUCCESSFUL!`**

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

### Step 3: Monitor Function Logs

In a separate terminal, watch the Edge Function logs in real-time:

```bash
cd /Users/brettbilon/bunkd
supabase functions logs analyze_product --tail
```

This will show you:
- Request IDs with format `[req_timestamp_xxx]`
- Input type and content length
- Auth status (user ID presence)
- Cache hit/miss
- Job creation status
- Any errors with full stack traces

### Step 4: Test in the Mobile App

1. Start the Expo dev server:
```bash
cd /Users/brettbilon/bunkd/apps/mobile
npm start
```

2. Open the app in iOS Simulator or on device

3. **Check the console for auth initialization:**

   **SUCCESS:**
   ```
   [Auth] ========== INITIALIZING AUTHENTICATION ==========
   [Auth] No session found, attempting anonymous sign-in...
   [Auth] ✓ Signed in anonymously successfully!
   [Auth]   User ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   [Auth]   Access token present: true
   [Auth]   Token length: 362
   [Auth]   Token expires at: 2024-01-11T...
   ```

   **FAILURE (Anonymous Auth Disabled):**
   ```
   [Auth] ⚠️  ANONYMOUS SIGN-INS ARE DISABLED
   [Auth]    Error: Anonymous sign-ins are disabled
   [Auth]    The app will run in unauthenticated mode.
   [Auth]    Analysis requests will likely fail until you enable anonymous auth.
   [Auth]
   [Auth] TO FIX:
   [Auth]   1. Go to Supabase Dashboard → Auth → Providers
   [Auth]   2. Enable "Anonymous sign-ins"
   [Auth]   3. Save and restart the app
   ```

   If you see the failure message, you'll also see a **yellow warning banner** at the top of the app with a button to open the Supabase dashboard.

4. Navigate to the Analyze tab

5. Enter "Turkesterone" in the TEXT input

6. Tap "Analyze"

7. **Watch the console for API call logging:**

   ```
   [BunkdAPI] ========== CALLING FUNCTION: analyze_product ==========
   [BunkdAPI] Session status: {
     hasSession: true,
     userId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
     hasAccessToken: true,
     tokenLength: 362,
     expiresAt: '2024-01-11T...'
   }
   [BunkdAPI] Request body: {
     "text": "Turkesterone"
   }
   [BunkdAPI] Response status: SUCCESS
   [BunkdAPI] Response data: { status: 'queued', job_id: '...' }
   ```

### Step 5: Verify Error Visibility

If TEXT analysis fails, you should now see:
- An Alert with the specific error message (e.g., "Missing authorization header" instead of "non-2xx status code")
- Detailed console logs showing:
  - Session status (has auth token or not)
  - Request payload
  - Response status
  - Error body with `error`, `details`, and `hint` fields
  - Request ID for tracking in function logs

---

## Common Errors and Solutions

### ⚠️ Error: "Anonymous sign-ins are disabled"

**Symptom:**
- App shows yellow warning banner
- Console shows `[Auth] ⚠️  ANONYMOUS SIGN-INS ARE DISABLED`
- API calls fail with "Missing authorization header"

**Cause:** Anonymous auth is not enabled in Supabase dashboard

**Solution:**
1. Go to https://supabase.com/dashboard/project/qmhqfmkbvyeabftpchex/auth/providers
2. Toggle ON "Anonymous sign-ins"
3. Save
4. Run `node verify-anon-auth.js` to confirm
5. Restart the app

---

### Error: "Missing authorization header"

**Symptom:**
- Function returns 401 status
- Console shows `[BunkdAPI] ⚠️  No active session!`

**Cause:** App couldn't sign in (anonymous auth disabled or network issue)

**Solution:**
- Check that anonymous sign-ins are enabled (see above)
- Check console for `[Auth]` logs showing what went wrong
- Run verification script: `node verify-anon-auth.js`
- Restart the app to trigger fresh auth initialization

---

### Error: "Failed to create analysis job"

**Symptom:**
- Function returns 500 status
- Error message mentions RLS or permissions

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

---

### Error: "Invalid input"

**Symptom:**
- Function returns 400 status
- Error message says "Invalid input"

**Cause:** The payload doesn't match expected format

**Solution:** Ensure you're sending at least one of: `url`, `text`, or `image_url`
- The function now also accepts `content` (alias for `text`) and `imageUrl` (alias for `image_url`)

---

### Warning: "No active session"

**Symptom:**
- Console shows `[BunkdAPI] ⚠️  No active session! Function call will likely fail.`

**Cause:** Auth initialization failed or session expired

**Solution:**
1. Check console for `[Auth]` error messages
2. If anonymous auth is disabled, enable it
3. If network error, check connection
4. Restart app to re-initialize auth

---

### ❌ Error: "Invalid JWT"

**Symptom:**
- Function returns 401
- Error body: `{ "code": 401, "message": "Invalid JWT" }`
- Token prefix starts with `eyJhbGci...`

**Cause:**
- JWT was issued for a different Supabase project than the Edge Function URL
- OR Authorization header is malformed

**Solution:**
- Check `[BunkdAPI] JWT claims (safe)` log
- Ensure `ref` matches the project ref in the function URL
- Ensure Edge Functions are called with BOTH:
  - `apikey: <anon key>`
  - `Authorization: Bearer <session.access_token>`
- Ensure only ONE `createClient()` exists in the mobile app

**SUCCESS CRITERIA:**
- `ref` MUST equal: `qmhqfmkbvyeabftpchex`
- Function base URL MUST match the same project ref

If `ref` does NOT match, the JWT was issued by a different Supabase project and will ALWAYS be rejected.

**Fix if Ref Mismatch Occurs:**
- Ensure there is exactly ONE Supabase client in the mobile app
- All API calls must import the same client
- Do NOT hardcode Supabase URLs or keys in multiple files

---

## Success Criteria

TEXT analysis is working correctly when:
1. ✅ `node verify-anon-auth.js` shows successful sign-in
2. ✅ App console shows `[Auth] ✓ Signed in anonymously successfully!`
3. ✅ No yellow warning banner in the app
4. ✅ Console shows `hasSession: true` before API calls
5. ✅ Submitting "Turkesterone" returns either:
   - A cached result (status 200 with `cached: true`)
   - A new job ID (status 202 with `job_id`)
6. ✅ If it fails, you see the actual error message in an Alert (not generic "non-2xx")
7. ✅ Function logs show detailed request/response info with request IDs

---

## Debugging Checklist

If TEXT analysis still fails after enabling anonymous auth:

- [ ] Anonymous auth is enabled in Supabase dashboard
- [ ] `node verify-anon-auth.js` shows success
- [ ] Edge Function is deployed: `supabase functions list`
- [ ] App console shows `[Auth] ✓ Signed in anonymously successfully!`
- [ ] App console shows `hasSession: true` before API calls
- [ ] Function logs show request with `[req_timestamp_xxx]` format
- [ ] Error message in app is specific (not generic "non-2xx")
- [ ] Check RLS policies on `analysis_jobs` and `analysis_results` tables
- [ ] Verify Supabase URL and anon key in `apps/mobile/lib/supabase.ts` match your project

---

## Additional Resources

- Supabase Anonymous Sign-In: https://supabase.com/docs/guides/auth/auth-anonymous
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- RLS Policies: https://supabase.com/docs/guides/auth/row-level-security
- Supabase Dashboard: https://supabase.com/dashboard
