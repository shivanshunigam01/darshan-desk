# DarshanDesk extension — user guide (extension-first)

## Install

1. Build: `npm run build:extension` from repo root.
2. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → `apps/extension/dist`.

## Create account (extension)

1. Open the extension → **Create account** on the sign-in screen.
2. Enter **agency name**, **email**, and **password** only.
3. After sign-in, add TTD accounts, pilgrims, and preparation from **Accounts**, **Pilgrims**, and **Preparation** tabs, then use **Fill** for autofill.

## Daily workflow

1. **Sign in** or **register** with your DarshanDesk operator email (extension login screen).
2. **Accounts / Pilgrims / Preparation** — migrate screens rolling out; use **Fill** tab for live autofill today.
3. On TTD: log in manually, open **Pilgrim Details**, open extension → **Fill** → connect preparation (pairing until JWT sync ships) → **Sync & Fill**.
4. Enter captcha and submit on the official portal yourself.

## Languages

Settings → English / हिंदी / తెలుగు.

## Security

- DarshanDesk password is **not** saved in the extension (session token only).
- TTD passwords stay in device-local vault / browser password manager per agency policy.