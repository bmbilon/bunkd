import { supabase, supabaseUrl, supabaseAnonKey } from './supabase';

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
      console.log(`[BunkdAPI] No session at invoke-time; signing in anonymously...`);
      const { error } = await supabase.auth.signInAnonymously();
      if (error) {
        throw new Error(`Anonymous sign-in failed: ${error.message}`);
      }
      session = await getSession();
      if (!session) {
        throw new Error('No session after anonymous sign-in');
      }
      console.log(`[BunkdAPI] ✓ Signed in anonymously, got session`);
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

    console.log(`[BunkdAPI] ========== CALLING EDGE FUNCTION: ${functionName} ==========`);
    console.log(`[BunkdAPI] Session status:`, {
      hasSession: true,
      userId: session.user.id,
      hasAccessToken: true,
      tokenPrefix: session.access_token.slice(0, 12) + '...',
      tokenLength: session.access_token.length,
      expiresAt: new Date(session.expires_at! * 1000).toISOString(),
    });
    console.log(`[BunkdAPI] Method:`, method);
    console.log(`[BunkdAPI] Request body:`, body ? JSON.stringify(body, null, 2) : 'none');

    // Build URL with query params if provided
    let url = `${supabaseUrl}/functions/v1/${functionName}`;
    if (query) {
      const params = new URLSearchParams(query);
      url += `?${params.toString()}`;
    }

    const headers: Record<string, string> = {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (method === 'POST' && body) {
      fetchOptions.body = JSON.stringify(body);
    }

    console.log(`[BunkdAPI] Fetching URL:`, url);

    const response = await fetch(url, fetchOptions);
    const responseText = await response.text();

    console.log(`[BunkdAPI] Response status:`, response.status, response.statusText);
    console.log(`[BunkdAPI] Response body (raw):`, responseText);

    let data: any;
    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch (parseError) {
      console.error(`[BunkdAPI] Failed to parse response as JSON:`, parseError);
      data = responseText;
    }

    if (!response.ok) {
      const errorMessage =
        typeof data === 'object' && data
          ? data.error || data.message || JSON.stringify(data)
          : String(data || response.statusText);

      const details =
        typeof data === 'object' && data?.details ? `\n${data.details}` : '';
      const hint =
        typeof data === 'object' && data?.hint ? `\nHint: ${data.hint}` : '';

      console.error(`[BunkdAPI] API Error (${response.status}):`, errorMessage + details + hint);
      throw new Error(`API Error (${response.status}): ${errorMessage}${details}${hint}`);
    }

    console.log(`[BunkdAPI] ✓ SUCCESS`);
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
