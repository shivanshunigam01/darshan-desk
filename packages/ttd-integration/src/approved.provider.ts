import type { TTDProvider } from "./provider.interface.js";
import {
  countriesSchema,
  parseQuotaSummary,
  personLimitSchema,
  trustsSchema,
  userContextSchema,
} from "./schemas.js";
import type { TtdPolicyConfig } from "./policy.service.js";
import { approvedMayRun } from "./policy.service.js";
import { mapHttpToTtdError } from "./error.mapper.js";
import { TtdProviderError } from "./types.js";

const PATHS = {
  countries: "/common/getAllCountryDetails",
  userContext: "/user/getUserContext",
  userDetail: (userId: string) => `/common/getUserDetail/${encodeURIComponent(userId)}`,
  personLimit: (amount: number) => `/dms/getnoOfPersons/${amount}`,
  quotaCurrent: "/dms/darshansummarySrivaniCurrentDay",
  trusts: "/eDonation/trustsandsubtrusts",
} as const;

export class ApprovedProvider implements TTDProvider {
  private lastSuccessfulUpdate?: string;

  constructor(private policy: TtdPolicyConfig) {}

  getIntegrationStatus() {
    const ready = approvedMayRun(this.policy);
    return {
      mode: "approved" as const,
      enabled: this.policy.integrationEnabled,
      baseUrl: this.policy.baseUrl,
      lastSuccessfulUpdate: this.lastSuccessfulUpdate,
      providerReady: ready,
      providerStatus: ready ? ("READY" as const) : ("NOT_CONFIGURED" as const),
      endpoint: PATHS.quotaCurrent,
      message: ready
        ? "Approved integration configured (server-side only)."
        : "Approved integration disabled — set TTD_INTEGRATION_ENABLED and TTD_INTEGRATION_AUTH_TOKEN.",
    };
  }

  private assertReady() {
    if (!approvedMayRun(this.policy)) {
      throw new TtdProviderError(
        "NOT_CONFIGURED",
        "TTD approved integration is not enabled or not configured."
      );
    }
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Accept: "application/json, text/plain, */*",
      Origin: this.policy.baseUrl,
      Referer: `${this.policy.baseUrl}/`,
    };
    if (this.policy.authToken) {
      // Portal localStorage key is ttd_auth_token; API expects header ttd-auth-token (not Bearer alone).
      h["ttd-auth-token"] = this.policy.authToken;
      if (this.policy.authHeaderStyle === "bearer" || this.policy.authHeaderStyle === "both") {
        h.Authorization = `Bearer ${this.policy.authToken}`;
      }
    }
    if (this.policy.userId) {
      h.userId = String(this.policy.userId);
    }
    return h;
  }

  private async fetchJson(path: string, signal?: AbortSignal): Promise<unknown> {
    this.assertReady();
    const url = `${this.policy.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    const merged = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: this.headers(),
        signal: merged,
      });
      const retryAfter = res.headers.get("Retry-After");
      const retrySec = retryAfter ? Number(retryAfter) : undefined;
      if (!res.ok) {
        const text = await res.text();
        throw mapHttpToTtdError(res.status, text, retrySec);
      }
      try {
        return await res.json();
      } catch {
        throw new TtdProviderError("INVALID_JSON", "Invalid JSON from upstream.");
      }
    } catch (e) {
      if (e instanceof TtdProviderError) throw e;
      if (e instanceof Error && e.name === "AbortError") {
        throw new TtdProviderError("TIMEOUT", "Upstream request timed out.");
      }
      throw new TtdProviderError("UNAVAILABLE", "Network error contacting TTD API.");
    } finally {
      clearTimeout(timeout);
    }
  }

  private meta() {
    const observedAt = new Date().toISOString();
    this.lastSuccessfulUpdate = observedAt;
    return {
      source: "approved" as const,
      observedAt,
    };
  }

  async getCountryDetails() {
    const raw = await this.fetchJson(PATHS.countries);
    const list = Array.isArray(raw) ? raw : (raw as { data?: unknown[] })?.data ?? raw;
    const countries = countriesSchema.parse(list);
    return { countries, meta: this.meta() };
  }

  async getTrustDetails() {
    const raw = await this.fetchJson(PATHS.trusts);
    const list = Array.isArray(raw) ? raw : (raw as { data?: unknown[] })?.data ?? raw;
    const trusts = trustsSchema.parse(list);
    return { trusts, meta: this.meta() };
  }

  async getQuotaSummary() {
    const raw = await this.fetchJson(PATHS.quotaCurrent);
    const parsed = parseQuotaSummary(raw);
    if (!parsed.ok) {
      throw new TtdProviderError("VALIDATION", "Quota response failed schema validation.");
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
    if (!Number.isFinite(amount) || amount < 1) {
      throw new TtdProviderError("VALIDATION", "amount must be a positive number.");
    }
    const raw = await this.fetchJson(PATHS.personLimit(amount));
    const body =
      typeof raw === "object" && raw !== null && "noOfPersons" in raw
        ? raw
        : (raw as { data?: unknown })?.data ?? raw;
    const pl = personLimitSchema.parse({ ...(body as object), amount });
    return { amount: pl.amount ?? amount, noOfPersons: pl.noOfPersons, meta: this.meta() };
  }

  async getAuthorizedAccountSummary(userId: string) {
    if (!userId) {
      throw new TtdProviderError("VALIDATION", "userId required.");
    }
    await this.fetchJson(PATHS.userContext).catch(() => undefined);
    const detail = await this.fetchJson(PATHS.userDetail(userId));
    const ctx = userContextSchema.safeParse(detail);
    const displayName = ctx.success
      ? ctx.data.userName || "TTD Account"
      : "TTD Account";
    return {
      userId,
      displayName,
      meta: this.meta(),
    };
  }
}