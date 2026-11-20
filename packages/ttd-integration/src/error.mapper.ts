import { TtdProviderError } from "./types.js";

export function mapHttpToTtdError(
  status: number,
  bodyText?: string,
  retryAfterSec?: number
): TtdProviderError {
  const retryAfterMs = retryAfterSec ? retryAfterSec * 1000 : undefined;
  if (status === 401 || status === 403) {
    return new TtdProviderError(
      "UNAUTHORIZED",
      "Third-party authorization rejected.",
      retryAfterMs,
      status
    );
  }
  if (status === 429) {
    return new TtdProviderError(
      "RATE_LIMITED",
      "Rate limit exceeded; respect Retry-After.",
      retryAfterMs ?? 60_000,
      status
    );
  }
  if (status >= 500) {
    return new TtdProviderError(
      "UNAVAILABLE",
      "Upstream service unavailable.",
      undefined,
      status
    );
  }
  const hint = bodyText ? bodyText.slice(0, 120) : "";
  return new TtdProviderError(
    "UNAVAILABLE",
    `Unexpected upstream response (${status}). ${hint}`.trim(),
    undefined,
    status
  );
}

export function toClientPayload(err: TtdProviderError) {
  return {
    error: err.code,
    message: err.message,
    retryAfterMs: err.retryAfterMs,
  };
}