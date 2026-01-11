import { supabase } from './supabase';
import { FunctionsHttpError, FunctionsRelayError, FunctionsFetchError } from '@supabase/supabase-js';

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

  private static async callFunction<T>(
    functionName: string,
    body?: any,
    params?: Record<string, string>
  ): Promise<T> {
    // Ensure we have a valid session
    const session = await this.ensureSession();

    console.log(`[BunkdAPI] ========== CALLING FUNCTION: ${functionName} ==========`);
    console.log(`[BunkdAPI] Session status:`, {
      hasSession: true,
      userId: session.user.id,
      hasAccessToken: true,
      tokenPrefix: session.access_token.slice(0, 12) + '...',
      tokenLength: session.access_token.length,
      expiresAt: new Date(session.expires_at! * 1000).toISOString(),
    });
    console.log(`[BunkdAPI] Request body:`, JSON.stringify(body, null, 2));

    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      ...(params && { method: 'GET' }),
    });

    console.log(`[BunkdAPI] Response status:`, error ? 'ERROR' : 'SUCCESS');
    console.log(`[BunkdAPI] Response data:`, data);
    if (error) {
      console.log(`[BunkdAPI] Response error:`, error);
    }

    if (error) {
      // Extract detailed error information
      let errorMessage = `API Error: ${error.message}`;
      let errorDetails = '';

      try {
        if (error instanceof FunctionsHttpError) {
          // Edge Function returned non-2xx status
          const responseBody = await error.context.json().catch(() =>
            error.context.text().catch(() => null)
          );

          console.error(`[BunkdAPI] FunctionsHttpError details:`, {
            status: error.context.status,
            statusText: error.context.statusText,
            body: responseBody,
          });

          if (responseBody) {
            if (typeof responseBody === 'object') {
              errorDetails = responseBody.error || responseBody.message || JSON.stringify(responseBody);
              if (responseBody.details) errorDetails += `\n${responseBody.details}`;
              if (responseBody.hint) errorDetails += `\nHint: ${responseBody.hint}`;
            } else {
              errorDetails = String(responseBody);
            }
            errorMessage = `API Error (${error.context.status}): ${errorDetails}`;
          } else {
            errorMessage = `API Error: Edge Function returned status ${error.context.status} (${error.context.statusText})`;
          }
        } else if (error instanceof FunctionsRelayError) {
          console.error(`[BunkdAPI] FunctionsRelayError:`, error.message);
          errorMessage = `Relay Error: ${error.message}`;
        } else if (error instanceof FunctionsFetchError) {
          console.error(`[BunkdAPI] FunctionsFetchError:`, error.message);
          errorMessage = `Network Error: ${error.message}`;
        }
      } catch (parseError) {
        console.error(`[BunkdAPI] Error parsing error response:`, parseError);
      }

      throw new Error(errorMessage);
    }

    return data as T;
  }

  static async analyzeProduct(input: AnalyzeInput): Promise<AnalyzeResponse> {
    return this.callFunction<AnalyzeResponse>('analyze_product', input);
  }

  static async getJobStatus(jobId: string): Promise<JobStatusResponse> {
    // Use callFunction to ensure proper session handling
    return this.callFunction<JobStatusResponse>(`job_status?job_id=${jobId}`, undefined, { _dummy: 'get' });
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
