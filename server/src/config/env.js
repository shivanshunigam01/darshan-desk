/**
 * Central production-oriented env parsing (no secrets logged).
 */
export function getNodeEnv() {
  return process.env.NODE_ENV || 'development';
}

export function isProduction() {
  return getNodeEnv() === 'production';
}

export function parseCorsOrigins() {
  const raw = process.env.CORS_ORIGINS || process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function corsOptions() {
  const origins = parseCorsOrigins();
  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (origins.includes(origin)) return callback(null, true);
      // Same-machine dev hosts (mock booking page + extension E2E on :4000)
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
      // Chrome MV3 extension popup / service worker (pairing + fill API)
      if (/^chrome-extension:\/\//i.test(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
  };
}

export function shouldSeedOnStart() {
  if (process.env.SEED_ON_START === 'true') return true;
  if (isProduction()) return false;
  return process.env.SEED_ON_START !== 'false';
}

export function trustProxyHops() {
  return Number(process.env.TRUST_PROXY_HOPS || 1);
}