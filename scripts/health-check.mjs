const base = process.argv[2] || process.env.API_BASE_URL || 'http://localhost:4000';

async function check(path, expectStatus = 200) {
  const res = await fetch(`${base}${path}`);
  const body = await res.json().catch(() => ({}));
  if (res.status !== expectStatus) {
    throw new Error(`${path} returned ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

try {
  await check('/health');
  await check('/health/live');
  const ready = await check('/health/ready', 200);
  if (!ready.ready) throw new Error('readiness check failed');
  console.log(JSON.stringify({ ok: true, base, ready }, null, 2));
} catch (e) {
  console.error(e.message);
  process.exit(1);
}