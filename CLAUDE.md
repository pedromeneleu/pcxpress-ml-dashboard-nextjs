# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Full project documentation (pt-BR) lives in [`docs/`](docs/README.md)** — architecture, every
Supabase table/view, every n8n workflow and its run history, each dashboard tab and metric, the
Devoluções feature, project history, roadmap and runbook. Read `docs/README.md` first; read the
doc for the area you are about to change.

## What this is

PCXpress Mercado Livre Analytics — a Next.js (App Router) dashboard for the PCXpress store on
Mercado Livre, built by Aruna Data. n8n workflows pull the Mercado Livre API and upsert into a
self-hosted Supabase (schema `ml_dashboards`); the dashboard reads Supabase server-side and renders
one client page. Deployed on Vercel.

## Commands

```bash
pnpm install --frozen-lockfile   # pnpm 11.9.0, Node 22.13–24
pnpm run dev                     # http://localhost:3000 (webpack, not turbopack)
pnpm run build                   # production build (webpack)
pnpm run lint                    # eslint . (flat config, next core-web-vitals + typescript)
pnpm run test                    # node --test tests/*.test.mjs
pnpm run check                   # lint && test && build
node --test tests/returns.test.mjs --test-name-pattern="<substring>"   # single file / case
```

Local env: copy `.env.example` to `.env.local` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_SCHEMA=ml_dashboards`, `SUPABASE_ACCOUNT_NAME=PC Express`; optional `RETURNS_DEMO_MODE`,
`LOGISTICS_V2_ENABLED`). Without them the API returns `FALLBACK_DASHBOARD_DATA` — the app always renders.

## Architecture

- **Main dashboard:** `app/page.tsx` (client, ~3k lines, every tab) → `GET /api/dashboard`
  (`app/api/dashboard/route.ts`, validates params, max 366-day ranges) →
  `lib/supabase-dashboard.ts#getDashboardData()` → PostgREST over `fetch` (no supabase-js) with the
  service-role key and `accept-profile: ml_dashboards`. Contract in `app/dashboard-types.ts`
  (mirror any shape change in `FALLBACK_DASHBOARD_DATA`).
- **Devoluções (returns):** `app/returns/ReturnsView.tsx` → `GET /api/returns` →
  `lib/supabase-returns.ts` (tables `devolucoes*`, view `devolucoes_base_vendas_diaria`). Pure
  calculations in `app/returns/returns-metrics.ts`; **all business thresholds in
  `app/returns/returns-config.ts`** (provisional values). Demo data in `lib/returns-demo-data.ts`,
  shown per `resolveDemoMode`/`shouldShowDemo` (production: only while no real data exists; read
  errors never become demo data).
- **Logistics tab is retired** (removed from the menu on 2026-10-05; queries disabled by
  `const logisticsEnabled = false` in `getDashboardData`). The code and `logistics*` types remain;
  don't build on it without the decision in `docs/07-roadmap.md`.
- **Dates:** `resolveDateSelection()` anchors 7/30/90-day presets on the latest
  `performance_date` (not today). Comparison modes: `previousPeriod`, `previousMonthEquivalent`,
  `previousMonthFull`, `custom`, `none`. One combined `or=(and(...),and(...))` query per view, split
  in memory with `inRange`.
- **Optional sources:** use `optionalFetchAll` / `optionalFetchAllWithAvailability` for views that
  may not exist in every environment.
- **Ingestion (n8n):** source of truth is the n8n instance. Sanitized copies (keys replaced by
  `PREENCHA_…`) in `ingestao/n8n/`: `ML_Dashboards_Sync_Diario.json` (MVP1–4) and
  `MVP7_Devolucoes.json` (returns). `tests/ingestao-mvp7.test.mjs` executes the MVP7 node code
  against fake ML/Supabase; `tests/ingestao-n8n.test.mjs` fails if any copy contains keys. Never
  commit real keys.
- **Migrations:** only the Devoluções DDL is versioned (`supabase/migrations/`). The other tables
  and `dashboard_*` views were created directly in Supabase — see `docs/02-supabase.md`.

## Rules the code follows

- UI copy in Brazilian Portuguese. Money always full BRL via `Intl.NumberFormat` (no "mil"/"mi").
- Conversion = orders / visits × 100 (not units); ticket médio = gross / orders; units per order =
  units / orders. Percentages and averages are computed on read, never stored.
- Missing data shows as "Sem dados"/"—"/"não informado", never a fake zero.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only (never `NEXT_PUBLIC_`, never in client code).
- Color = judgment, not decoration: `app/metric-signals.ts` (currently used only by Devoluções; see roadmap).

## Known test failures

3 tests in `tests/project.test.mjs` fail with `ENOENT`: they read SQL scripts that were never
committed and lived one folder above the repo root (`supabase-seller-health-cancellations.sql`,
`supabase-logistics-shipment-reconciliation-v5.sql`,
`supabase-check-logistics-shipment-reconciliation-v5.sql`). Not a regression; fixing it is roadmap
item 8 in `docs/07-roadmap.md`.
