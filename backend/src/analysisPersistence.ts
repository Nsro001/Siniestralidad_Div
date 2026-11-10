import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError, databaseError } from './supabase.js';
import { validateIdentity, validateStoredAnalysis, type CacheIdentity } from './analysisPrivacy.js';

// Etapa 4: solo simulación interna; sin transporte real ni ruta de generación.
export const ANALYSIS_PROVIDER_CALLS_IMPLEMENTED = false;
export function analysisAvailability() {
  return { enabled: false, providerCallsImplemented: ANALYSIS_PROVIDER_CALLS_IMPLEMENTED, apiBudgetClp: 0,
    reason: process.env.GEMINI_ENABLED === 'true' ? 'real_provider_not_authorized' : 'disabled' };
}
export function classifyProviderFailure(status: number | null, timedOut = false) {
  return timedOut ? 'timeout' : status === 429 ? 'rate_limited' : 'provider_error';
}
export type AuthorizedAnalysisUser = { id: string; db: SupabaseClient };
export class AnalysisPersistence {
  // Cliente privilegiado explícito, únicamente inyectado por backend confiable.
  // No se instancia con claves ni se conecta desde dashboards/PDF.
  constructor(private readonly writer: SupabaseClient) {}
  async runtimePolicy() {
    const {data,error}=await this.writer.from('analysis_runtime_policy').select('*').eq('singleton',true).maybeSingle();
    databaseError(error); return data;
  }
  private async authorize(user: AuthorizedAnalysisUser, identity: CacheIdentity) {
    validateIdentity(identity);
    if (user.id !== identity.ownerId) throw new HttpError(403, 'analysis_owner_mismatch');
    const { data, error } = await user.db.from('portfolio_policies').select('id,client_id').eq('id', identity.policyId).eq('client_id', identity.clientId).maybeSingle();
    databaseError(error);
    if (!data) throw new HttpError(403, 'analysis_access_denied');
  }
  async read(user: AuthorizedAnalysisUser, identity: CacheIdentity) {
    await this.authorize(user, identity);
    const { data, error } = await user.db.from('analysis_cache').select('id,result,created_at,expires_at')
      .eq('owner_id', user.id).eq('client_id', identity.clientId).eq('policy_id', identity.policyId).eq('cache_key', identity.cacheKey)
      .eq('indicators_hash', identity.indicatorsHash).eq('assumptions_hash', identity.assumptionsHash).eq('model', identity.model)
      .eq('prompt_version', identity.promptVersion).eq('calculation_version', identity.calculationVersion).eq('privacy_version', identity.privacyVersion).maybeSingle();
    databaseError(error);
    if (data) validateStoredAnalysis(data.result);
    return data;
  }
  async reserve(user: AuthorizedAnalysisUser, identity: CacheIdentity, inputTokenUpperBound: number, outputTokenUpperBound: number) {
    await this.authorize(user, identity);
    if (![inputTokenUpperBound, outputTokenUpperBound].every(n => Number.isSafeInteger(n) && n > 0 && n <= 2147483647)) throw new HttpError(400, 'analysis_invalid_token_bound');
    const { data, error } = await this.writer.rpc('analysis_reserve', {
      p_actor: user.id, p_client: identity.clientId, p_policy: identity.policyId, p_versions: identity.contractVersions,
      p_periods: identity.periods, p_coverages: identity.coverages, p_kind: identity.kind, p_key: identity.cacheKey,
      p_indicators_hash: identity.indicatorsHash, p_assumptions_hash: identity.assumptionsHash, p_model: identity.model,
      p_prompt_version: identity.promptVersion, p_calculation_version: identity.calculationVersion, p_privacy_version: identity.privacyVersion,
      p_input_tokens: inputTokenUpperBound, p_output_tokens: outputTokenUpperBound,
    });
    databaseError(error); return data;
  }
  async finish(user: AuthorizedAnalysisUser, requestId: string, leaseToken: string,
    outcome: 'succeeded' | 'rate_limited' | 'timeout' | 'provider_error' | 'invalid_result', result: unknown = null,
    usage: { input: number; output: number; total: number } | null = null) {
    // La RPC vuelve a comprobar al actor, la autorización vigente y el fencing token.
    if (result !== null) validateStoredAnalysis(result);
    if (usage && (!Object.values(usage).every(n => Number.isSafeInteger(n) && n >= 0) || usage.total < usage.input + usage.output)) throw new HttpError(400, 'analysis_invalid_usage');
    const { data, error } = await this.writer.rpc('analysis_finish', { p_actor: user.id, p_request: requestId, p_lease: leaseToken,
      p_status: outcome, p_result: result, p_actual_input: usage?.input ?? null, p_actual_output: usage?.output ?? null, p_actual_total: usage?.total ?? null });
    databaseError(error); return data;
  }
}
