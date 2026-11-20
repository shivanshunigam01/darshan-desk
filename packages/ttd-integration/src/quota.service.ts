import type { TTDProvider } from "./provider.interface.js";
import type { TtdPolicyConfig } from "./policy.service.js";
import { MockProvider } from "./mock.provider.js";
import { ApprovedProvider } from "./approved.provider.js";
import { loadPolicyFromEnv, approvedMayRun } from "./policy.service.js";
import { TtdProviderError, type QuotaSummary, SRIVANI_QUOTA_PATH } from "./types.js";

type CacheEntry = {
  data: QuotaSummary & { meta: { source: string; observedAt: string; stale?: boolean; applicableDate?: string | null } };
  expiresAt: number;
};

/** Shared upstream context — one in-flight fetch for all agencies. */
const GLOBAL_CACHE_KEY = "srivani:current-day";
const inflight = new Map<string, Promise<CacheEntry["data"]>>();
const cacheByKey = new Map<string, CacheEntry>();
const lastFetchByKey = new Map<string, number>();
let globalBackoffUntil = 0;
let globalLastSuccessfulUpdate: string | undefined;
let globalConsecutiveErrors = 0;

export class QuotaService {
  private provider: TTDProvider | null;
  private readonly usesMockDev: boolean;
  /** When set, quota cache is isolated per mock scenario (dev/E2E). */
  private readonly mockCacheKey: string | null;

  constructor(private policy: TtdPolicyConfig, mockScenario?: string) {
    if (mockScenario) {
      this.provider = new MockProvider(policy, mockScenario);
      this.usesMockDev = true;
      this.mockCacheKey = mockScenario;
    } else if (policy.mode === "mock") {
      this.provider = new MockProvider(policy, policy.mockScenario || "default");
      this.usesMockDev = true;
      this.mockCacheKey = policy.mockScenario || "default";
    } else if (approvedMayRun(policy)) {
      this.provider = new ApprovedProvider(policy);
      this.usesMockDev = false;
      this.mockCacheKey = null;
    } else {
      this.provider = null;
      this.usesMockDev = false;
      this.mockCacheKey = null;
    }
  }

  private cacheKey(): string {
    if (this.mockCacheKey) return `${GLOBAL_CACHE_KEY}:mock:${this.mockCacheKey}`;
    return GLOBAL_CACHE_KEY;
  }

  getProvider(): TTDProvider | null {
    return this.provider;
  }

  getGlobalLastSuccessfulUpdate() {
    return globalLastSuccessfulUpdate;
  }

  createProviderForScenario(scenario: string): TTDProvider {
    return new MockProvider(this.policy, scenario);
  }

  async getQuotaSummary(_tenantId: string, force = false) {
    if (!this.provider) {
      throw new TtdProviderError(
        "NOT_CONFIGURED",
        "SRIVANI quota upstream is not configured. Enable approved TTD integration with authorization, or use mockScenario for development tests."
      );
    }

    const ck = this.cacheKey();
    const now = Date.now();
    if (now < globalBackoffUntil) {
      const cached = cacheByKey.get(ck);
      if (cached) {
        return {
          ...cached.data,
          meta: {
            ...cached.data.meta,
            source: "cache" as const,
            stale: true,
            staleReason: "provider_backoff",
          },
        };
      }
      throw new TtdProviderError(
        "RATE_LIMITED",
        "Provider in backoff after upstream errors.",
        globalBackoffUntil - now
      );
    }

    const cached = cacheByKey.get(ck);
    const last = lastFetchByKey.get(ck) ?? 0;

    if (!force && now - last < this.policy.minRefreshMs) {
      if (cached) {
        return {
          ...cached.data,
          meta: {
            ...cached.data.meta,
            source: "cache" as const,
            stale: true,
            staleReason: "refresh_interval_not_elapsed",
          },
        };
      }
      throw new TtdProviderError(
        "RATE_LIMITED",
        "Minimum refresh interval not elapsed.",
        this.policy.minRefreshMs - (now - last)
      );
    }

    if (!force && cached && cached.expiresAt > now) {
      return {
        ...cached.data,
        meta: { ...cached.data.meta, source: "cache" as const, stale: false },
      };
    }

    if (inflight.has(ck)) {
      return inflight.get(ck)!;
    }

    const p = (async () => {
      try {
        const result = await this.provider!.getQuotaSummary();
        lastFetchByKey.set(ck, Date.now());
        globalLastSuccessfulUpdate = result.meta.observedAt;
        globalConsecutiveErrors = 0;
        globalBackoffUntil = 0;
        cacheByKey.set(ck, {
          data: result,
          expiresAt: Date.now() + this.policy.cacheTtlMs,
        });
        return result;
      } catch (e) {
        globalConsecutiveErrors += 1;
        const retryMs =
          e instanceof TtdProviderError && e.retryAfterMs
            ? e.retryAfterMs
            : Math.min(300_000, 5_000 * 2 ** globalConsecutiveErrors);
        globalBackoffUntil = Date.now() + retryMs;

        const cachedOnError = cacheByKey.get(ck);
        if (cachedOnError) {
          return {
            ...cachedOnError.data,
            meta: {
              ...cachedOnError.data.meta,
              source: "cache" as const,
              stale: true,
              staleReason: "upstream_error_serving_cache",
            },
          };
        }
        throw e;
      } finally {
        inflight.delete(ck);
      }
    })();

    inflight.set(ck, p);
    return p;
  }

  /** Test helper — clear shared cache (all mock scenario keys in dev). */
  clearTenantCache(_tenantId?: string) {
    for (const key of [...cacheByKey.keys()]) {
      if (key === GLOBAL_CACHE_KEY || key.startsWith(`${GLOBAL_CACHE_KEY}:mock:`)) {
        cacheByKey.delete(key);
        lastFetchByKey.delete(key);
        inflight.delete(key);
      }
    }
    globalBackoffUntil = 0;
    globalConsecutiveErrors = 0;
  }

  integrationMeta() {
    if (this.usesMockDev && this.provider) {
      const st = this.provider.getIntegrationStatus();
      return {
        ...st,
        mode: "mock" as const,
        providerStatus: "MOCK_DEV" as const,
        endpoint: SRIVANI_QUOTA_PATH,
      };
    }
    if (approvedMayRun(this.policy)) {
      return {
        mode: "approved" as const,
        enabled: true,
        baseUrl: this.policy.baseUrl,
        providerReady: true,
        providerStatus: "READY" as const,
        lastSuccessfulUpdate: globalLastSuccessfulUpdate,
        message: "Authorized server-side integration.",
        endpoint: SRIVANI_QUOTA_PATH,
      };
    }
    return {
      mode: "none" as const,
      enabled: false,
      baseUrl: this.policy.baseUrl,
      providerReady: false,
      providerStatus: "NOT_CONFIGURED" as const,
      lastSuccessfulUpdate: globalLastSuccessfulUpdate,
      message:
        "NOT CONFIGURED — set TTD_INTEGRATION_MODE=approved, TTD_INTEGRATION_ENABLED=true, and TTD_INTEGRATION_AUTH_TOKEN. No live data is invented.",
      endpoint: SRIVANI_QUOTA_PATH,
    };
  }
}

export function createQuotaService(
  env?: NodeJS.ProcessEnv,
  mockScenario?: string
): QuotaService {
  const policy = loadPolicyFromEnv(env);
  return new QuotaService(policy, mockScenario);
}