export type TtdPolicyConfig = {
  minRefreshMs: number;
  cacheTtlMs: number;
  integrationEnabled: boolean;
  mode: "mock" | "approved";
  baseUrl: string;
  authToken?: string;
  userId?: string;
  authHeaderStyle?: "ttd" | "bearer" | "both";
  mockScenario?: string;
};

const DEFAULT_MIN_REFRESH_MS = 60_000;
const DEFAULT_CACHE_TTL_MS = 55_000;

export function loadPolicyFromEnv(
  env: NodeJS.ProcessEnv = process.env
): TtdPolicyConfig {
  const mode =
    env.TTD_INTEGRATION_MODE === "approved" ? "approved" : "mock";
  const integrationEnabled = env.TTD_INTEGRATION_ENABLED === "true";
  const baseUrl =
    (env.TTD_API_BASE_URL || "https://tirupatibalaji.ap.gov.in").replace(
      /\/$/,
      ""
    );
  const minRefreshMs = Number(
    env.TTD_INTEGRATION_MIN_REFRESH_MS || DEFAULT_MIN_REFRESH_MS
  );
  const cacheTtlMs = Number(env.TTD_CACHE_TTL_MS || DEFAULT_CACHE_TTL_MS);
  return {
    minRefreshMs: Number.isFinite(minRefreshMs)
      ? minRefreshMs
      : DEFAULT_MIN_REFRESH_MS,
    cacheTtlMs: Number.isFinite(cacheTtlMs) ? cacheTtlMs : DEFAULT_CACHE_TTL_MS,
    integrationEnabled,
    mode,
    baseUrl,
    authToken: env.TTD_INTEGRATION_AUTH_TOKEN,
    userId: env.TTD_INTEGRATION_USER_ID,
    authHeaderStyle:
      env.TTD_AUTH_HEADER_STYLE === "bearer" || env.TTD_AUTH_HEADER_STYLE === "both"
        ? env.TTD_AUTH_HEADER_STYLE
        : "ttd",
    mockScenario: env.TTD_MOCK_SCENARIO,
  };
}

/** Direct upstream only when mode, enable flag, base URL, and server auth token are set. */
export function approvedMayRun(policy: TtdPolicyConfig): boolean {
  return (
    policy.mode === "approved" &&
    policy.integrationEnabled &&
    Boolean(policy.baseUrl) &&
    Boolean(policy.authToken)
  );
}