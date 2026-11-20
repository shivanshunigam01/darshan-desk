# Security review — extension-first migration (initial)

## Preserved controls

- Tenant isolation on pilgrim/preparation/TTD account APIs
- License enforcement middleware (`LICENSE_ENFORCE`)
- Extension fill: no auto-submit, no captcha/OTP automation
- ID masking in server logs (`maskSensitive`)
- Rate-limited login (`loginRateLimiter`)

## New surface area

| Item | Risk | Mitigation |
|------|------|------------|
| JWT in `chrome.storage.local` | Token theft on shared device | Session-only option planned; short TTL + refresh rotation |
| API URL in settings | Misconfiguration | Default localhost; HTTPS enforced in prod docs |
| Legacy pairing in Fill tab | Dual auth paths | Remove after JWT-native preparation sync |

## Not done yet (tracked)

- Argon2id password hashing (bcrypt still active)
- `POST /api/auth/refresh` + refresh token rotation
- Device-local credential vault UX for TTD (opt-in)

## TTD credentials

**Must not** sync TTD passwords to MongoDB or DarshanDesk API (unchanged policy).