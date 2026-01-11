import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';

// JWT decoding helpers
function decodeJwtPartSafe(part: string) {
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const json = globalThis.atob(b64 + pad);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function decodeJwtSafe(token: string) {
  const parts = token.split('.');
  if (parts.length !== 3) return { header: null, payload: null };
  return { header: decodeJwtPartSafe(parts[0]), payload: decodeJwtPartSafe(parts[1]) };
}

// Derive alternate functions domain URL
function getFunctionsDomainBaseUrl(supabaseUrl: string) {
  try {
    const u = new URL(supabaseUrl);
    const host = u.hostname; // e.g. qmhqfmkbvyeabftpchex.supabase.co
    const ref = host.split('.')[0];
    return `https://${ref}.functions.supabase.co`;
  } catch {
    return null;
  }
}

// Verify token with auth endpoint
async function verifyTokenWithAuthEndpoint(accessToken: string) {
  const url = `${SUPABASE_URL}/auth/v1/user`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return { ok: res.ok, status: res.status };
  } catch (error) {
    return { ok: false, status: 0, error };
  }
}

export interface AnalyzeInput {
  url?: string;
  text?: string;
  image_url?: string;
}

export interface AnalysisResult {
  bunkd_score: number;
  bias_indicators: string[];
  factual_claims: Array<{
    claim: string;
    verified?: boolean;
    confidence?: number;
  }>;
  summary: string;
  sources?: Array<{
    url?: string;
    title?: string;
    snippet?: string;
  }>;
  reasoning?: string;
}

export interface AnalyzeResponse {
  status: 'queued' | 'processing' | 'completed';
  job_id?: string;
  cached?: boolean;
  result?: AnalysisResult;
  created_at?: string;
}

export interface JobStatusResponse {
  job_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  created_at: string;
  result?: AnalysisResult;
  result_created_at?: string;
  completed_at?: string;
  error_message?: string;
  error?: string;
}

export class BunkdAPI {
  private static async ensureSession() {
    const getSession = async () => (await supabase.auth.getSession()).data.session;

    let session = await getSession();

    if (!session) {
      console.log('[BunkdAPI] No session at invoke-time; signing in anonymously...');
      const { error } = await supabase.auth.signInAnonymously();
      if (error) {
        throw new Error(`Anonymous sign-in failed: ${error.message}`);
      }
      session = await getSession();
      if (!session) {
        throw new Error('No session after anonymous sign-in');
      }
      console.log('[BunkdAPI] ✓ Signed in anonymously, got session');
    }

    return session;
  }

  private static async callEdgeFunction<T>(
    functionName: string,
    options: {
      method?: 'GET' | 'POST';
      body?: any;
      query?: Record<string, string>;
    } = {}
  ): Promise<T> {
    const { method = 'POST', body, query } = options;

    // Ensure we have a valid session
    const session = await this.ensureSession();

    console.log('[BunkdAPI] ========== CALLING EDGE FUNCTION:', functionName, '==========');

    // Decode JWT header and payload
    const { header, payload } = decodeJwtSafe(session.access_token);

    console.log('[BunkdAPI] Session status:', {
      userId: session.user?.id,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
      tokenLength: session.access_token?.length ?? 0,
      tokenPrefix: (session.access_token?.slice(0, 12) ?? '') + '...',
      alg: header?.alg,
      kid: header?.kid,
      iss: payload?.iss,
      aud: payload?.aud,
      role: payload?.role,
      sub: typeof payload?.sub === 'string' ? payload.sub.slice(0, 8) + '...' : undefined,
    });

    // Verify token with auth endpoint before calling functions
    const authVerify = await verifyTokenWithAuthEndpoint(session.access_token);
    console.log('[BunkdAPI] Token verify (auth/v1/user):', authVerify);

    if (!authVerify.ok) {
      throw new Error(
        `Auth token rejected by auth endpoint (${authVerify.status}). Session token is not valid.`
      );
    }

    console.log('[BunkdAPI] Method:', method);
    console.log('[BunkdAPI] Request body:', body ? JSON.stringify(body, null, 2) : 'none');

    // Build query string if provided
    const queryString = query ? '?' + new URLSearchParams(query).toString() : '';

    // Primary URL: standard Supabase functions endpoint
    const primaryUrl = `${SUPABASE_URL}/functions/v1/${functionName}${queryString}`;

    // Fallback URL: alternate functions domain
    const functionsDomainBaseUrl = getFunctionsDomainBaseUrl(SUPABASE_URL);
    const fallbackUrl = functionsDomainBaseUrl
      ? `${functionsDomainBaseUrl}/${functionName}${queryString}`
      : null;

    const headers: Record<string, string> = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
    };

    if (method === 'POST' && body) {
      headers['Content-Type'] = 'application/json';
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (method === 'POST' && body) {
      fetchOptions.body = JSON.stringify(body);
    }

    // Try primary URL first
    console.log('[BunkdAPI] Fetching URL (primary):', primaryUrl);
    let response = await fetch(primaryUrl, fetchOptions);
    let responseText = await response.text();

    console.log('[BunkdAPI] Response status:', response.status, response.statusText);
    console.log('[BunkdAPI] Response body (raw):', responseText.slice(0, 500));

    let data: any;
    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch (parseError) {
      console.error('[BunkdAPI] Failed to parse response as JSON:', parseError);
      data = responseText;
    }

    // If primary URL returns 401 with "Invalid JWT", try fallback
    if (
      response.status === 401 &&
      fallbackUrl &&
      (
        (typeof data === 'object' && data?.message?.includes('Invalid JWT')) ||
        (typeof data === 'string' && data.includes('Invalid JWT'))
      )
    ) {
      console.log('[BunkdAPI] Primary functions URL returned Invalid JWT; retrying via functions domain...');
      console.log('[BunkdAPI] Fetching URL (fallback):', fallbackUrl);

      response = await fetch(fallbackUrl, fetchOptions);
      responseText = await response.text();

      console.log('[BunkdAPI] Fallback response status:', response.status, response.statusText);
      console.log('[BunkdAPI] Fallback response body (raw):', responseText.slice(0, 500));

      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch (parseError) {
        console.error('[BunkdAPI] Failed to parse fallback response as JSON:', parseError);
        data = responseText;
      }
    }

    // Handle errors
    if (!response.ok) {
      const errorMessage =
        typeof data === 'object' && data
          ? data.error || data.message || JSON.stringify(data)
          : String(data || response.statusText);

      const details =
        typeof data === 'object' && data?.details ? `\n${data.details}` : '';
      const hint =
        typeof data === 'object' && data?.hint ? `\nHint: ${data.hint}` : '';

      console.error('[BunkdAPI] API Error (' + response.status + '):', errorMessage + details + hint);
      throw new Error(`API Error (${response.status}): ${errorMessage}${details}${hint}`);
    }

    console.log('[BunkdAPI] ✓ SUCCESS');
    return data as T;
  }

  static async analyzeProduct(input: AnalyzeInput): Promise<AnalyzeResponse> {
    return this.callEdgeFunction<AnalyzeResponse>('analyze_product', {
      method: 'POST',
      body: input,
    });
  }

  static async getJobStatus(jobId: string): Promise<JobStatusResponse> {
    return this.callEdgeFunction<JobStatusResponse>('job_status', {
      method: 'GET',
      query: { job_id: jobId },
    });
  }

  static async pollJobStatus(
    jobId: string,
    onUpdate: (status: JobStatusResponse) => void,
    maxAttempts: number = 30,
    intervalMs: number = 2000
  ): Promise<JobStatusResponse> {
    return new Promise((resolve, reject) => {
      let attempts = 0;

      const poll = async () => {
        try {
          const status = await this.getJobStatus(jobId);
          onUpdate(status);

          if (status.status === 'completed' || status.status === 'failed') {
            resolve(status);
            return;
          }

          attempts++;
          if (attempts >= maxAttempts) {
            reject(new Error('Polling timeout: Job did not complete in time'));
            return;
          }

          setTimeout(poll, intervalMs);
        } catch (error) {
          reject(error);
        }
      };

      poll();
    });
  }
}
