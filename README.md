# Web3 Intelligence

Web3 Intelligence is a read-only research terminal for provider-sourced cryptocurrency market data, public native-token balance lookups, and AI analysis grounded in the current market snapshot.

## Current capabilities

- Public landing page with live market context from CoinGecko.
- Market overview, searchable/sortable listings, and provider-supplied historical price data.
- Public native-balance lookups for Bitcoin, Ethereum, Solana, Polygon, Tron, Avalanche, TON, and Sui.
- Groq-backed market Q&A using the current top-100 CoinGecko snapshot, with the model, source, timestamp, scope, and disclaimer returned to the client.
- Clerk sign-in foundation and a protected dashboard route.
- Explicit unavailable/error states when providers do not return data.

The wallet scanner reads native balances only. It does not connect to wallets, request signatures, store scan results, or return token/NFT holdings or transaction histories. AI answers do not include wallet histories, whale activity, or unconnected blockchain feeds.

## Stack

- pnpm workspace monorepo
- React, Vite, TypeScript
- Express 5 API
- OpenAPI contract with generated Zod schemas and React Query client
- Drizzle ORM and PostgreSQL
- Replit-managed Clerk authentication

## Run on Replit

Dependencies are installed from the lockfile:

```sh
pnpm install --frozen-lockfile
```

Start these existing managed workflows from Replit:

- `artifacts/api-server: API Server`
- `artifacts/web3-intelligence: web`

The optional component-preview workflow is `artifacts/mockup-sandbox: Component Preview Server`. Artifact workflows provide their own ports and base paths; do not start duplicate workflows or hard-code those values.

## Configuration

Use Replit Secrets for credentials. Never commit secret values or place them in frontend code.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Replit PostgreSQL connection used by account-related API code |
| `CLERK_SECRET_KEY` | Server-side Clerk verification |
| `CLERK_PUBLISHABLE_KEY` | Server-side Clerk host/key resolution |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk browser client |
| `GROQ_API_KEY` | Server-side Groq requests for AI research |
| `GROQ_MODEL` | Optional model override; when omitted, the API discovers an available supported model |

Clerk is provisioned for this workspace. The Groq key is stored in Replit Secrets. `.env.example` lists variable names only; do not copy credentials into that file. Public data providers do not require application secrets in the current implementation, but their free endpoints can be rate-limited.

## Data sources and boundaries

| Feature | Provider |
| --- | --- |
| Market overview, listings, and history | CoinGecko API; successful market responses are cached in memory for 60 seconds |
| Bitcoin native balance | mempool.space |
| Ethereum, Polygon, and Avalanche native balances | PublicNode JSON-RPC |
| Solana native balance | Solana Mainnet RPC |
| Tron native balance | TronGrid |
| TON native balance | TON Center |
| Sui native balance | Sui Mainnet GraphQL |
| AI research | Groq, supplied with a fresh CoinGecko top-100 snapshot |

Provider values are displayed with their source and retrieval time where available. A provider error is not replaced with sample or estimated data. Public endpoints may impose limits or become unavailable.

## API

All endpoints are served beneath `/api`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/healthz` | API health |
| `GET` | `/api/market/overview` | Global market metrics |
| `GET` | `/api/market/coins?limit=100` | Market listings, up to 100 |
| `GET` | `/api/market/history?coinId=bitcoin&days=7` | Historical prices |
| `POST` | `/api/wallet/scan` | Public native-balance lookup |
| `POST` | `/api/intelligence/ask` | Snapshot-grounded market question |
| `GET` | `/api/auth/me` | Current signed-in account; requires authentication and database access |

Wallet request example:

```json
{
  "network": "ethereum",
  "address": "0x..."
}
```

AI request example:

```json
{
  "question": "Which listed assets had the largest 24-hour moves?"
}
```

The API validates request and response shapes against generated Zod schemas. See `lib/api-spec/openapi.yaml` for the contract.

## Database

The project uses the workspace PostgreSQL database through `DATABASE_URL`. Apply schema changes to the development database only with:

```sh
pnpm --filter @workspace/db run push
```

Do not use the force-push command for routine setup. Production schema changes should follow Replit's Publish flow; do not run manual production DDL from this guide.

## Checks and code generation

Run the full workspace TypeScript check:

```sh
pnpm run typecheck
```

When changing the API contract, edit the OpenAPI source first, regenerate the client and schemas, then type-check:

```sh
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
```

## Replit deployment

The web and API each have Replit artifact configuration under their `.replit-artifact/` directories. Use the artifact-managed build and run settings when publishing; do not replace them with a separate root workflow. Confirm required secrets and provider access before publishing. Replit-managed Clerk keeps development and production users in separate environments.

## Security and limitations

- Never request or store seed phrases, private keys, wallet signatures, or other wallet credentials.
- The scanner is public-address-only and read-only; no signing or transactions are implemented.
- Market data and wallet results are not financial advice.
- Do not infer wallet ownership or label addresses as individuals or institutions without evidence.
- This repository is a foundation, not the full product specification. Whale rankings/monitoring, token and NFT discovery, watchlists and alerts, verified airdrops, news aggregation, forensic case management, marketplace/checkout, subscriptions, internal messaging, and a full admin control center are not implemented yet.

See `replit.md` for workspace-specific operating notes and architecture decisions.
