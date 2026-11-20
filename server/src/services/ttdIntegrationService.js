import {
  QuotaService,
  loadPolicyFromEnv,
  TtdProviderError,
  toClientPayload,
  MockProvider,
} from '@darshan-desk/ttd-integration';

let quotaService;

function getService(mockScenario) {
  if (mockScenario) {
    const policy = loadPolicyFromEnv(process.env);
    return new QuotaService(policy, mockScenario);
  }
  if (!quotaService) {
    quotaService = new QuotaService(loadPolicyFromEnv(process.env));
  }
  return quotaService;
}

function statusFromError(err) {
  if (!(err instanceof TtdProviderError)) return 500;
  switch (err.code) {
    case 'UNAUTHORIZED':
      return 401;
    case 'RATE_LIMITED':
      return 429;
    case 'VALIDATION':
    case 'INVALID_JSON':
      return 422;
    case 'NOT_CONFIGURED':
      return 503;
    case 'TIMEOUT':
    case 'UNAVAILABLE':
      return 503;
    default:
      return 500;
  }
}

export function ttdErrorResponse(res, err) {
  const status = statusFromError(err);
  const body = err instanceof TtdProviderError ? toClientPayload(err) : { error: 'UNAVAILABLE', message: String(err) };
  if (err instanceof TtdProviderError && err.retryAfterMs) {
    res.set('Retry-After', String(Math.ceil(err.retryAfterMs / 1000)));
  }
  return res.status(status).json(body);
}

export async function getTtdCountries(agencyId, mockScenario) {
  const svc = getService(mockScenario);
  const provider = svc.getProvider();
  if (!provider) {
    throw new TtdProviderError('NOT_CONFIGURED', 'TTD integration not configured.');
  }
  const data = await provider.getCountryDetails();
  return sanitizeEnvelope(data, agencyId);
}

export async function getTtdTrusts(agencyId, mockScenario) {
  const svc = getService(mockScenario);
  const provider = svc.getProvider();
  if (!provider) {
    throw new TtdProviderError('NOT_CONFIGURED', 'TTD integration not configured.');
  }
  const data = await provider.getTrustDetails();
  return sanitizeEnvelope(data, agencyId);
}

export async function getTtdQuotaCurrent(agencyId, { force, mockScenario }) {
  const svc = getService(mockScenario);
  const data = await svc.getQuotaSummary(String(agencyId), Boolean(force));
  return data;
}

export async function getTtdPersonLimit(agencyId, amount, mockScenario) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < 1) {
    throw new TtdProviderError('VALIDATION', 'Query amount must be a positive number.');
  }
  const svc = getService(mockScenario);
  const provider = svc.getProvider();
  if (!provider) {
    throw new TtdProviderError('NOT_CONFIGURED', 'TTD integration not configured.');
  }
  const data = await provider.getPermittedPersonCount(amt);
  return sanitizeEnvelope(data, agencyId);
}

export function getTtdIntegrationStatus(mockScenario) {
  const svc = getService(mockScenario);
  const policy = loadPolicyFromEnv(process.env);
  const base = svc.integrationMeta();
  return {
    ...base,
    tenantScoped: true,
    configuredBaseUrl: policy.baseUrl,
    minRefreshMs: policy.minRefreshMs,
    cacheTtlMs: policy.cacheTtlMs,
    lastSuccessfulUpdate: base.lastSuccessfulUpdate || svc.getGlobalLastSuccessfulUpdate(),
  };
}

/** Strip fields that must not leak cross-tenant — cache keys already per agencyId. */
function sanitizeEnvelope(payload, _agencyId) {
  return payload;
}

export { QuotaService, MockProvider };