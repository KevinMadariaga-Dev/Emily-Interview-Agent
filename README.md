# Emily — AI Interview Agent

Emily runs **customer-discovery interviews by voice** through a **shareable link**. The admin
configures an Emily (project, goal, open/closed questions, voice, language ES/EN, report email),
shares `/e/<slug>` and the participant talks to her from the browser — no app, no sign-up.

When the interview ends ChatGPT grades how much of the required information was obtained and
summarizes it (key facts, pain points, quotes, next steps). The result is **saved in Postgres
(Supabase)**, **emailed** (Gmail) in the interview's language and **saved as a Notion page**.

```
Admin ──(SITE_PASSWORD)──► /  Crear Emily · Mis Emilys · Resultados ──► Postgres (Supabase)
                                                                            ▲
Participant ──(voice)──► /e/<slug> ──► OpenAI STT · LLM · TTS              │ result
                                   └─► end: summary ──► Postgres ─► Gmail ─► Notion
```

## Tech stack

| Layer     | Choice                                                                 |
| --------- | ---------------------------------------------------------------------- |
| Framework | **Next.js 16 (App Router) + TypeScript + React 19**, server actions    |
| Styling   | Tailwind CSS v4                                                        |
| Database  | **PostgreSQL (Supabase)** + **Drizzle ORM** (migrations in `drizzle/`) |
| Voice     | OpenAI `gpt-4o-transcribe` (listening) · `gpt-4o-mini-tts` (speaking)  |
| LLM       | OpenAI `gpt-5.6-luna` (or Anthropic via `LLM_PROVIDER`), Zod-validated |
| Email     | Gmail SMTP (App Password) · Resend as fallback                         |
| Notion    | Notion REST API (`2025-09-03`, data sources)                           |
| Quality   | ESLint, Prettier, Vitest, GitHub Actions CI (incl. `pnpm audit`)       |

## Routes

| Route                        | Purpose                                                               |
| ---------------------------- | --------------------------------------------------------------------- |
| `/`                          | Admin landing: create Emilys, "Mis Emilys", "Resultados" (password)   |
| `/e/[slug]`                  | Participant interview (public; paused/expired links show unavailable) |
| `POST /api/voice/speak`      | Text → Emily's voice (mp3), rate-limited                              |
| `POST /api/voice/transcribe` | Audio → text, rate-limited                                            |
| `GET /api/health`            | Health check                                                          |

Everything else is **server actions** (`src/features/landing/{emilys,ai,report}.ts`). Admin
actions call `requireAdmin()` themselves — actions are reachable by direct POST, the proxy alone
isn't a boundary. Public ones (interview turn, summary, saving the result, email/Notion) load the
Emily from the database by slug and never trust a browser-sent configuration.

## Getting started (local)

**Requirements:** Node.js ≥ 22 (`.nvmrc`), pnpm ≥ 10 (`corepack enable`), a Postgres database
(Supabase, or `docker compose up -d` for a local one).

```bash
pnpm install
cp .env.example .env.local   # DATABASE_URL + OPENAI_API_KEY at least (see below)
pnpm db:migrate              # creates the tables (RLS on)
pnpm dev                     # http://localhost:3000
```

### Environment variables

All variables are documented in [`.env.example`](.env.example). Minimum per feature:

| Feature     | Variables                                                                      |
| ----------- | ------------------------------------------------------------------------------ |
| App + DB    | `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `SITE_PASSWORD` (required in prod)      |
| Voice + LLM | `OPENAI_API_KEY` (models: `OPENAI_STT_MODEL`, `OPENAI_TTS_MODEL`, `LLM_MODEL`) |
| Email       | `GMAIL_USER`, `GMAIL_APP_PASSWORD` (optional `REPORT_EMAIL_ALLOWLIST`)         |
| Notion      | `NOTION_API_KEY`, `NOTION_DATA_SOURCE_ID` (`pnpm notion:setup` creates it)     |

## Scripts

| Script                                       | What it does                               |
| -------------------------------------------- | ------------------------------------------ |
| `pnpm dev`                                   | Dev server (Turbopack)                     |
| `pnpm build` / `pnpm start`                  | Production build / serve                   |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` | ESLint · route types + `tsc` · Vitest      |
| `pnpm format`                                | Prettier                                   |
| `pnpm db:generate`                           | Create a SQL migration from schema changes |
| `pnpm db:migrate`                            | Apply migrations                           |
| `pnpm db:studio`                             | Browse the DB (Drizzle Studio)             |
| `pnpm notion:setup`                          | Create the "Emily · Entrevistas" database  |

## Project structure

```
src/
├── app/                      # Routing only: / (landing), /e/[slug], api/voice, api/health
├── features/landing/         # The product: UI, i18n (ES/EN), client store, server actions
│   ├── emilys.ts             #   actions: create/list/delete, results, translations, import
│   ├── ai.ts                 #   actions: interview turn, summary, AI setup helpers
│   └── report*.ts            #   actions + builders: Gmail email, Notion page
├── server/
│   ├── auth/admin.ts         # requireAdmin(): SITE_PASSWORD check for admin actions
│   ├── db/                   # Drizzle client + schema
│   └── repositories/         # Data access (only place that writes SQL)
├── integrations/             # OpenAI audio, LLM (OpenAI/Anthropic), email, Notion client
├── lib/                      # env (Zod), logger, rate limit, site password
└── proxy.ts                  # Next.js 16 proxy: SITE_PASSWORD except participant paths
drizzle/                      # Generated SQL migrations (committed)
tests/unit/                   # Vitest
```

## Dependency security

`pnpm audit` runs in CI and fails on **high/critical** advisories. Production dependencies
(`pnpm audit --prod`) have no known vulnerabilities. Two dev-only findings are handled in
`package.json → pnpm`:

| Advisory                                                                                                                                    | Path                                                                              | Decision                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| esbuild ≤0.24.2 — dev server can be read by any site ([GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99))             | `drizzle-kit → @esbuild-kit/core-utils → esbuild`                                 | **Fixed** with `pnpm.overrides` → `esbuild ^0.25.4` (same range drizzle-kit uses itself; `pnpm db:generate` verified).                                                                                                   |
| braces ≤3.0.3 — stack-exhaustion DoS with deeply nested patterns ([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)) | `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces` | **Accepted** (`pnpm.auditConfig.ignoreGhsas`): no patched version exists; it only runs at lint time over our own `rootDir` setting, never on user input or in the production bundle. Remove the ignore when a fix ships. |

## Deployment (production)

1. **Database (Supabase):** copy the **Session pooler** URL (port 5432) for migrations and the
   **Transaction pooler** URL (port 6543) for the server. URL-encode special characters in the
   password (`?` → `%3F`, `@` → `%40`). Run `pnpm db:migrate` against it. Migrations enable RLS on
   every table, so Supabase's public REST API can't read them; the app connects as the table
   owner through `DATABASE_URL` (no Supabase client keys needed).
2. **Server:** set the env vars from `.env.example`. `SITE_PASSWORD` is required in production:
   it protects "Mis Emilys", results and creation (checked in the proxy **and** inside each admin
   server action). Participants open `/e/<slug>` without it. Use a long random value.
3. **Notion:** share the database with the integration.

`next.config.ts` uses `output: "standalone"`, so the app runs as a plain Node server (Docker or
any Node host).

## Git workflow

- `main` → production · `develop` → integration/staging · `feature/<scope>-<short-name>` → work branches.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`…). PRs into `develop`; CI must pass.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — layers, data model, flows, security
- [`docs/PROVIDERS.md`](docs/PROVIDERS.md) — provider options and price comparison
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — step-by-step plan and checklists
