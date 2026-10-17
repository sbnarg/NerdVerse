# Payment checks

Requires Node 24+. Run `npm ci`, `npm test`, and `npm run typecheck` from this directory. Dependencies are isolated here so the static storefront has no new build requirement.

`phonepe-db.test.mjs` loads the real migration into an isolated PGlite Postgres database; test fixtures reflect the audited live schema and constraints. It never connects to Supabase. Handler/transport tests mock provider responses, and checkout tests run in JSDOM. Test credentials are fixtures, never real merchant secrets.

Type checking uses pinned Supabase SDK types and minimal hosted-runtime global declarations. A native Deno check was attempted but the runtime could not reach npm's registry; the TypeScript check passes locally. Production deployment and hosted sandbox success/failure testing remain separate gates.
