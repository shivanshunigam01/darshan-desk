# DarshanDesk simplification audit (2026-11-16)

## Operator goal (4-step flow)

1. Login on official TTD website (operator — not DarshanDesk)
2. Connect DarshanDesk extension (pairing token)
3. Sync booking preparation (pilgrim profile + revision)
4. Use official booking page (manual submit / CAPTCHA)

## Removed from **main operator navigation** (routes kept for compatibility)

| Hidden from sidebar | Route still works |
|---------------------|-------------------|
| Booking Preparation (10-step wizard) | `/booking/prepare` |
| TTD Account Manager | `/ttd-accounts` |
| SRIVANI Quota Monitor | `/srivani/quota` |
| Booking History | `/srivani/history` |
| Pilgrim Groups / Operators placeholders | unchanged |

## New primary operator surfaces (5 nav items)

1. **Dashboard** — pilgrim counts, extension status, flow reminder
2. **Pilgrims** — CRUD + Save & Prepare
3. **Ready to Fill** — select profile → validate → pairing token
4. **Extension Connection** — install + flow steps
5. **Settings**

Super Admin / agency admin platform nav unchanged.

## Backend (not deleted)

Auth, license, pilgrims (`/api/catalog/pilgrims`), preparations, extension pairing/fill, reliability, quota, platform — **retained**. New read-only helper: `GET /api/extension/active-preparation`.

## Pilgrim schema

Existing `Pilgrim` model (`idType`, `idNumber`, `gender` M/F/O) — UI labels updated to Male/Female/Transgender and Aadhaar/Passport. Field encryption planned separately; not duplicated.

## Extension

Popup streamlined to **Sync & Fill**, **Validate Fields**, **Open TTD Website**. No token/cookie harvesting.

## NOT removed

MongoDB data, booking wizard code, quota integration, super admin command center — hidden or secondary until migration reviewed.