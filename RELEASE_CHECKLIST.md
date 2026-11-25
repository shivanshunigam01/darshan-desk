# Release checklist — DarshanDesk standalone extension

- [ ] `RECOVERY_AUDIT.md` reviewed
- [ ] `npm run build:extension` on release branch
- [ ] Load `apps/extension/dist` in Chrome + Edge smoke test
- [ ] Login / logout / session refresh
- [ ] Preparation validate + auto reconnect (no token paste UI)
- [ ] Mock `Sync & Fill` for 1–4 pilgrims
- [ ] Monitor tab reads quota + Continue state on mock page
- [ ] Confirm **no** auto Pay Now / auto Continue with default settings
- [ ] Grep dist popup: no “paste token” / pairing placeholder strings
- [ ] `server/.env.production` on host — secrets not in git
- [ ] ZIP published: `apps/extension/release/darshandesk-extension-v1.0.0.zip`
- [ ] `EXTENSION_QA_REPORT.md` updated with manual pass/fail
- [ ] Proposed commit created (do not push unless requested)