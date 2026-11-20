# DarshanDesk Extension — Test Report

**Date:** 2026-11-15  
**Scope:** `@darshan-desk/fill-engine`, extension API auth, provider security constraints

## Automated (last run: all passing)

| Suite | Tests |
|--------|-------|
| `@darshan-desk/quota` | 12 |
| `@darshan-desk/fill-engine` | 4 |
| `@darshan-desk/extension` (security static) | 3 |
| `darshan-desk-server` (validation + quota + extension API auth) | 8 |
| **Total** | **27** |

### Fill-engine scenarios covered

- Build plan from selected pilgrim profiles
- Exclude legal consent auto-fill (`_skip`)
- Mobile pattern validation
- Reject unknown mapping profiles (no invented live TTD selectors)

### Security static checks (`apps/extension/tests/security.test.js`)

- Manifest declares no `webRequest` / `cookies` permission
- Content script matches mock host only (no `*.tirumala.org`)
- Background does not reference OTP/password endpoints

## Manual QA checklist

| Step | Expected |
|------|----------|
| Pair invalid token | Error shown, no payload |
| Pair valid token | Pilgrim list loaded |
| Open mock form | Dynamic form renders after ~300ms |
| Fill without overwrite | Fields populated; consent checkbox untouched |
| Second fill same session | `skipped_duplicate` on fields |
| Differing existing value | `needs_confirmation` until overwrite enabled |
| Official submit button | Alert only — no automated POST |

## Known limits

- Live TTD mapping profile not included (by policy).
- Fill verification uses DOM value readback on mock controlled inputs.
- `ApprovedOfficialQuotaProvider` pattern mirrored: no undocumented polling.

Regenerate this report after `npm test` at repo root and attach CI output.