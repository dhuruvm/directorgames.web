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

## Product

The primary product is the Director Games independent studio website. The workspace also contains the internal mockup canvas used for UI prototyping.

## User preferences

No project-specific preferences recorded.

## Gotchas

- The API service currently starts without requiring a configured database secret for its health endpoint; add external service configuration only if a future feature needs it.
- Vite dependencies are workspace-installed, so a fresh import must run the frozen pnpm install before starting workflows.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
