# Web3 Intelligence

Web3 Intelligence is a read-only blockchain research workspace for market data, public wallet balance checks, and AI-assisted market analysis.

## Run & Operate

- `pnpm install` — install the workspace dependencies
- Start the `artifacts/web3-intelligence: web` and `artifacts/api-server: API Server` managed workflows for the app and API.
- `pnpm --filter @workspace/web3-intelligence run typecheck` — check the web app.
- `pnpm --filter @workspace/api-server run typecheck` — check the API server.
- `pnpm run typecheck` — check all workspace packages.
- `pnpm run build` — typecheck and build all packages.
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — apply schema changes to the development database only
- Public market, intelligence, and one-off wallet lookup endpoints run without account authentication. Watchlists and admin routes require `DATABASE_URL` and configured Clerk server keys.
- Clerk is provisioned for this workspace; development and production have separate tenants. Account routes return an explicit unavailable response if authentication configuration is missing. Do not bypass the account check.
- `GROQ_API_KEY` is required for AI answers; `GROQ_MODEL` is optional. Without the key, the AI endpoint returns an explicit unavailable response.
- An environment-variable-name-only template is in `.env.example`.

## Stack

- pnpm workspaces, Node.js, TypeScript 5.9
- Web: React + Vite
- API: Express 5
- Authentication: Clerk integration (requires workspace provisioning)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: Vite and esbuild

## Where things live

- `artifacts/web3-intelligence/` — React + Vite web app.
- `artifacts/api-server/src/routes/` — Express API endpoints.
- `lib/api-spec/openapi.yaml` — API contract source of truth.
- `lib/api-client-react/` and `lib/api-zod/` — generated client hooks and validation schemas.
- `lib/db/src/schema/` — Drizzle database schema.

## Architecture decisions

- The API verifies account requests server-side with Clerk; public research endpoints remain unauthenticated.
- Application roles and account status live in PostgreSQL, separate from identity-provider profile data.
- Market and wallet data are read-only provider responses; unavailable sources are shown as unavailable rather than replaced with invented values.
- Public RPC watch coverage is limited: Ethereum, Polygon, Avalanche, Base, and Arbitrum track ERC-20/ERC-721/ERC-1155 transfer events; Solana tracks recent token/native balance changes. Watch detail pages poll once a minute while open; browser notifications require user permission and an open page. Paired token movements may be labeled as possible trades, but buys/sells are not protocol-confirmed; staking and complete historical activity are not reliably identified. No API keys are needed for this keyless mode.
- Admin APIs manage application accounts, wallet watches, and saved activity observations, not arbitrary SQL or direct database administration. Admins can remove saved app records but cannot change on-chain transactions. Provider credentials stay in Replit Secrets and are never returned by the app.
- The admin UI can add watches for active accounts and update watch labels/alert preferences. Provider status reveals only whether server-side configuration exists; it never exposes or edits secret values. Use workspace Secrets to add or rotate credentials.
- New API endpoints are defined in OpenAPI before generating shared client and validation code.

## Product

- Market overview, sortable/searchable cryptocurrency listings, and historical price charts.
- Public, read-only native-balance checks for supported wallet networks.
- Signed-in wallet watches with public RPC polling, ERC-20/ERC-721 observations on five EVM networks, recent token/native balance changes on Solana, per-wallet alert settings, and optional browser notifications.
- Admin-only account, watch, and saved-activity management using database-backed application roles.
- AI market research grounded in the current market snapshot, with a clear scope and disclaimer.
- Sign-in foundation and database-backed application user roles.

## User preferences

- Use a dark-first midnight, charcoal, and navy interface with electric blue/cyan accents and subtle violet; keep typography comfortably readable without excessive neon, clutter, or oversized text.
- Keep blockchain integrations read-only unless explicitly requested otherwise.
- Never request or store private keys, seed phrases, passwords, or wallet signatures.
- Do not substitute fake market, wallet, or airdrop data when a provider is unavailable.

## Gotchas

- Managed artifact workflows supply `PORT` and `BASE_PATH`; start them through Replit's workflow controls.
- Apply schema changes with the development `push` command only.
- Wallet watch tables must be applied to the development database with `pnpm --filter @workspace/db run push` before using watchlists.
- AI responses require `GROQ_API_KEY`; the API returns an unavailable state when it is missing.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
