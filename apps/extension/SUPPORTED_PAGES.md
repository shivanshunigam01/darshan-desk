# Supported pages (verified mappings)

| Profile ID | URL pattern | Purpose |
|------------|-------------|---------|
| `mock-srivani-v1` | `http://localhost:4000/mock-booking/*` | Local TTD-style fixture for E2E dev |
| `mock-srivani-v1` | `http://127.0.0.1:4000/mock-booking/*` | Same fixture (127.0.0.1) |

**Not supported (by design):** live `tirupatibalaji.ap.gov.in` DOM — no verified selectors until an approved mapping profile is published.

## Mock form steps

1. **quota** — read-only quota info  
2. **booking** — donation validation (min ₹10,000), Current/Advance  
3. **pilgrims** — dynamic slots (`?pilgrims=1-9`); **autofill runs here**  
4. **declaration** — legal checkbox (never auto-filled)  
5. **confirm** — confirmation / official response simulator  

## Operator workflow

1. Save & validate preparation in DarshanDesk dashboard  
2. Generate pairing token → paste in extension  
3. Open supported mock form → navigate to **pilgrims** step  
4. Extension: **Validate & fill visible fields** → review results → submit manually on real site  