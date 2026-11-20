# TTD integration module map

Canonical TypeScript implementation: `packages/ttd-integration/src/`

| Requested path | Package file |
|----------------|--------------|
| `types.ts` | `packages/ttd-integration/src/types.ts` |
| `schemas.ts` | `packages/ttd-integration/src/schemas.ts` |
| `provider.interface.ts` | `packages/ttd-integration/src/provider.interface.ts` |
| `mock.provider.ts` | `packages/ttd-integration/src/mock.provider.ts` |
| `approved.provider.ts` | `packages/ttd-integration/src/approved.provider.ts` |
| `quota.service.ts` | `packages/ttd-integration/src/quota.service.ts` |
| `policy.service.ts` | `packages/ttd-integration/src/policy.service.ts` |
| `error.mapper.ts` | `packages/ttd-integration/src/error.mapper.ts` |

Server HTTP surface: `server/src/routes/ttd.js`  
Re-export: `server/src/integrations/ttd/index.js`