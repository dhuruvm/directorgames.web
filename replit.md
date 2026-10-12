# The Director Games Workspace

An imported pnpm workspace containing the Director Games studio website, its mockup canvas, and a shared API server.

## Run & Operate

- The Replit preview uses the managed artifact workflows:
  - `artifacts/director-games: web` — Director Games website at `/`
  - `artifacts/mockup-sandbox: Component Preview Server` — mockup canvas at `/__mockup`
  - `artifacts/api-server: API Server` — shared API at `/api`
- To install the committed workspace dependencies: `pnpm install --frozen-lockfile`
- `pnpm run typecheck` — full typecheck across all workspace packages
- `pnpm --filter @workspace/director-games run typecheck` — website typecheck
- `pnpm --filter @workspace/mockup-sandbox run typecheck` — canvas typecheck
- `pnpm --filter @workspace/api-server run typecheck` — API typecheck
- `curl http://localhost:80/api/healthz` — check the API through the shared proxy
- Do not run a root-level `pnpm dev`; restart the managed artifact workflows instead.

## Stack

- pnpm workspaces, Node.js 20, TypeScript 5.9
- Website and canvas: React + Vite
- API: Express 5, built with esbuild
- Shared libraries include API client/spec/Zod and database packages

## Where things live

- `artifacts/director-games/` — main studio website
- `artifacts/mockup-sandbox/` — canvas and component preview server
- `artifacts/api-server/` — shared Express API
- `lib/` — shared workspace libraries
- `attached_assets/` — imported image, video, and audio assets
- `pnpm-workspace.yaml` — workspace package discovery and dependency catalog

## Architecture decisions

- Keep the imported pnpm workspace structure and existing artifact boundaries.
- Use artifact-owned workflows so Replit injects each service's port and base-path routing.
- Access services through the shared proxy paths rather than hardcoded localhost URLs in app code.
- The Vercel-hosted website calls the separately hosted API using `VITE_API_BASE_URL`; do not put API secrets in the website environment.

## Member administration and studio email

Membership applications are stored in PostgreSQL and administered at `/dir`, which remains directly accessible but is not linked from public navigation. `/join` is likewise directly accessible and not linked publicly. Member data and dashboard actions require the admin password. New applications remain pending and do not receive a card or welcome email until the Director approves them. Approval issues the signed membership card and sends a welcome email if Gmail is connected; email failures are reported in the dashboard and can be retried from the approved-member ledger. Broadcasts are sent individually to active, approved members, and delivery totals are recorded. Cards from the former browser-local ledger can be imported from that browser after admin sign-in; imported records also remain pending until reviewed.

Each application stores its requester IP address and accepts at most one application per IP address and email. The IP is visible only in the authenticated Director dashboard. Applicants are notified before submitting; shared networks share the one-application-per-IP limit. The API uses Express's `request.ip`; set `TRUST_PROXY_HOPS` to the exact number of trusted reverse-proxy hops in front of the API (for example, `1` behind one trusted proxy). Leave it at `0` when the API is directly exposed. Do not trust forwarded client IP headers unless requests can only arrive through the configured trusted proxy chain.

Configure the API host with these deployment secrets:

- `DATABASE_URL` — PostgreSQL connection string.
- `ADMIN_PASSWORD` — password for `/dir` admin sign-in.
- `SESSION_SECRET` — random secret used to sign the eight-hour admin session.
- `GMAIL_TOKEN_ENCRYPTION_KEY` — 32-byte key encoded as 64 hexadecimal characters; it encrypts the stored Gmail refresh token.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` — Google OAuth web-client credentials.
- `GOOGLE_REDIRECT_URI` — exact callback URL: `https://<api-host>/api/admin/gmail/callback`.
- `FRONTEND_URL` — the production website origin, without a trailing slash.
- `FRONTEND_ORIGINS` — comma-separated website origins allowed to call the API, without trailing slashes.
- `TRUST_PROXY_HOPS` — optional non-negative integer; exact trusted reverse-proxy hops used to determine requester IPs (default `0`).

Configure the Vercel website build with `VITE_API_BASE_URL=https://<api-host>` (the API origin without `/api`). Use HTTPS for both origins. Prefer serving the API on a subdomain of the website's registrable domain (for example, `api.directorgames.studio`); unrelated cross-site domains may have their authentication cookies blocked by browser privacy settings.

In Google Cloud, enable the Gmail API, configure the OAuth consent screen, create a Web application OAuth client, and add the exact `GOOGLE_REDIRECT_URI` as an authorized redirect URI. The API requests Gmail send and account-email scopes. After setting up PostgreSQL or changing the database schema, apply it with `pnpm --filter @workspace/db run push` before deploying the API. Then use **Connect Gmail** from `/dir`.

Generate secrets locally; never commit them or send them in chat. For example:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Run the command twice: use one value for `SESSION_SECRET` and the other for `GMAIL_TOKEN_ENCRYPTION_KEY`.

## Product

The primary product is the Director Games independent studio website. The workspace also contains the internal mockup canvas used for UI prototyping.

## User preferences

No project-specific preferences recorded.

## Gotchas

- The API service currently starts without requiring a configured database secret for its health endpoint; add external service configuration only if a future feature needs it.
- Vite dependencies are workspace-installed, so a fresh import must run the frozen pnpm install before starting workflows.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
- `vercel.json` configures Vercel to build and host the Director Games website from the monorepo.
