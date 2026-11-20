import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TTDProvider } from "./provider.interface.js";
import { countriesSchema, parseQuotaSummary, personLimitSchema, trustsSchema } from "./schemas.js";
import type { TtdPolicyConfig } from "./policy.service.js";
import { TtdProviderError, type Envelope } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "..", "fixtures");

function fixture<T>(name: string): T {
  const raw = readFileSync(join(fixturesDir, name), "utf8");
  return JSON.parse(raw) as T;
}

export type MockScenario =
  | "default"
  | "zero_quota"
  | "missing_fields"
  | "invalid_json"
  | "timeout"
  | "unauthorized"
  | "rate_limited"
  | "stale_cache"
  | "not_configured"
  | "nullable_fields"
  | "release_time_change";

export class MockProvider implements TTDProvider {
  private lastSuccessfulUpdate?: string;
  private scenario: MockScenario;

  constructor(
    private policy: TtdPolicyConfig,
    scenario?: string
  ) {
    const s = (scenario || policy.mockScenario || "default") as MockScenario;
    this.scenario = s;
  }

  setScenario(s: MockScenario) {
    this.scenario = s;
  }

  getIntegrationStatus() {
    return {
      mode: "mock" as const,
      enabled: true,
      baseUrl: this.policy.baseUrl,
      lastSuccessfulUpdate: this.lastSuccessfulUpdate,
      providerReady: true,
      providerStatus: "MOCK_DEV" as const,
      endpoint: "/dms/darshansummarySrivaniCurrentDay",
      message: `Mock scenario: ${this.scenario} — not live TTD data.`,
    };
  }

  private meta(source: "mock" | "cache" = "mock", stale = false): Envelope<unknown>["meta"] {
    const observedAt = new Date().toISOString();
    if (!stale) this.lastSuccessfulUpdate = observedAt;
    return {
      source,
      observedAt,
      stale,
      staleReason: stale ? "serving_cached_quota" : undefined,
    };
  }

  private throwScenario() {
    switch (this.scenario) {
      case "timeout":
        throw new TtdProviderError("TIMEOUT", "Mock upstream timeout.");
      case "unauthorized":
        throw new TtdProviderError("UNAUTHORIZED", "Mock 401.", undefined, 401);
      case "rate_limited":
        throw new TtdProviderError(
          "RATE_LIMITED",
          "Mock 429.",
          120_000,
          429
        );
      case "invalid_json":
        throw new TtdProviderError("INVALID_JSON", "Mock invalid JSON body.");
      case "not_configured":
        throw new TtdProviderError(
          "NOT_CONFIGURED",
          "Mock provider not configured."
        );
      default:
        return;
    }
  }

  async getCountryDetails() {
    this.throwScenario();
    const raw = fixture<unknown[]>("countries.json");
    const countries = countriesSchema.parse(raw);
    return { countries, meta: this.meta() };
  }

  async getTrustDetails() {
    this.throwScenario();
    const raw = fixture<unknown[]>("trusts.json");
    const trusts = trustsSchema.parse(raw);
    return { trusts, meta: this.meta() };
  }

  async getQuotaSummary() {
    if (this.scenario === "stale_cache") {
      const data = fixture<Record<string, unknown>>("quota-current.json");
      data.quotaCount = (data.quotaCount as number) - 20;
      const parsed = parseQuotaSummary(data);
      if (!parsed.ok) {
        throw new TtdProviderError("VALIDATION", "Cached quota validation failed.");
      }
      return { ...parsed.data, meta: this.meta("cache", true) };
    }

    this.throwScenario();

    if (this.scenario === "missing_fields") {
      const partial = { quotaCount: 1, slottime: "04:00 PM" };
      const parsed = parseQuotaSummary(partial);
      if (!parsed.ok) {
        throw new TtdProviderError("VALIDATION", "Missing required quota fields.");
      }
      return { ...parsed.data, meta: this.meta() };
    }

    if (this.scenario === "invalid_json") {
      throw new TtdProviderError("INVALID_JSON", "Could not parse quota JSON.");
    }

    const data = { ...fixture<Record<string, unknown>>("quota-current.json") };
    if (this.scenario === "zero_quota") {
      data.quotaCount = 0;
    }

    if (this.scenario === "nullable_fields") {
      Object.assign(data, {
        quotaCount: 0,
        slottime: null,
        maxpersons: null,
        minpersons: "4",
        advanceminpersons: "4",
        advancemaxpersons: null,
        released: 0,
        success: 0,
        pending: 0,
        failed: 0,
        quotaReleaseTime: "09:03:00",
      });
    }

    if (this.scenario === "release_time_change") {
      data.quotaReleaseTime = "10:15:00";
    }

    const parsed = parseQuotaSummary(data);
    if (!parsed.ok) {
      throw new TtdProviderError("VALIDATION", "Quota schema validation failed.");
    }
    return {
      ...parsed.data,
      meta: {
        ...this.meta(),
        applicableDate: parsed.applicableDate ?? null,
      },
    };
  }

  async getPermittedPersonCount(amount: number) {
    this.throwScenario();
    if (amount < 1) {
      throw new TtdProviderError("VALIDATION", "amount must be positive.");
    }
    const raw = fixture<{ noOfPersons: number; amount?: number }>(
      "person-limit-10000.json"
    );
    const base = personLimitSchema.parse({ ...raw, amount });
    const scale = amount >= 10000 ? Math.floor(amount / 10000) * 4 || 4 : 1;
    return {
      amount,
      noOfPersons: this.scenario === "zero_quota" ? 0 : Math.min(scale, 9),
      meta: this.meta(),
    };
  }

  async getAuthorizedAccountSummary(userId: string) {
    this.throwScenario();
    if (!userId) {
      throw new TtdProviderError("VALIDATION", "userId required.");
    }
    return {
      userId,
      displayName: "Sanitized Operator Account",
      agencyLabel: "DarshanDesk Tenant",
      meta: this.meta(),
    };
  }
}