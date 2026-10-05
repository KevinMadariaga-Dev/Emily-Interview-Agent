# Emily — AI Interview Agent

Emily runs **customer-discovery interviews by voice** through a **shareable link**. An admin defines the interview objective and questions, sends the link, and the participant talks to Emily (Spanish or English) from the browser — no app, no sign-up. Emily is friendly and adaptive but keeps the participant focused on the interview goal.

When the interview ends, the transcript is **stored in the database**, **structured by an LLM** (summary, pain points, insights, quotes, sentiment), **emailed** to the team and **saved as a page in Notion**.

```
Participant ──(voice)──► Interview page /i/<token> ──► Voice provider (STT + LLM + TTS)
                               │ transcript turns
                               ▼
                         Next.js API ──► PostgreSQL ──► Job worker ──► LLM summary
                                                                   ├─► Email (Resend)
                                                                   └─► Notion page
Admin ──► /admin (templates, links, sessions, transcripts)
```

## Tech stack

| Layer           | Choice                                                                 | Why                                                             |
| --------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| Framework       | **Next.js 16 (App Router) + TypeScript + React 19**                    | One codebase for landing pages, admin panel and API             |
| Styling         | Tailwind CSS v4                                                        | Fast, consistent UI; shadcn/ui can be added later               |
| Database        | **PostgreSQL** + **Drizzle ORM**                                       | Type-safe SQL, migrations in git, serverless-friendly           |
| Voice agent     | **Deepgram Voice Agent API** (default) · OpenAI Realtime (alternative) | STT + LLM + TTS behind one interface (`src/integrations/voice`) |
| LLM (summaries) | OpenAI or Anthropic (switch with `LLM_PROVIDER`)                       | Structured JSON validated with Zod                              |
| Email           | **Resend**                                                             | Simple API, idempotency keys, free tier for MVP                 |
| Notion          | Notion REST API (`2025-09-03`, data sources)                           | Summaries land in the "Emily Interviews" database               |
| Hosting         | **Vercel** (+ Vercel Cron) · Neon/Supabase Postgres                    | Zero-ops deploys, preview URL per PR                            |
| Quality         | ESLint, Prettier, Vitest, GitHub Actions CI                            | Every PR is linted, type-checked, tested and built              |

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/PROVIDERS.md`](docs/PROVIDERS.md) for the reasoning and price comparison.

## Pages

| Route                  | Purpose                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `/`                    | **Landing #1** — public marketing page                       |
| `/i/[token]`           | **Landing #2** — participant interview page (shareable link) |
| `/admin`               | Sessions list (status, language, pipeline)                   |
| `/admin/templates`     | Create interview templates + shareable links                 |
| `/admin/sessions/[id]` | Transcript, summary, email/Notion delivery status            |
| `/admin/login`         | Admin sign-in (dev login now → magic link later)             |

## API

| Method & path                          | Description                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| `POST /api/interviews/:token/sessions` | Start or resume a session (requires consent). Returns `sessionId` + `resumeKey`    |
| `POST /api/sessions/:id/voice-token`   | Short-lived voice-provider credentials (header `x-resume-key`)                     |
| `POST /api/sessions/:id/turns`         | Append transcript turns (batched)                                                  |
| `POST /api/sessions/:id/pause`         | Mark session paused (participant can resume)                                       |
| `POST /api/sessions/:id/complete`      | Close interview → enqueue summary → email + Notion                                 |
| `GET /api/cron/process-jobs`           | Retry pending integration jobs (Vercel Cron, `Authorization: Bearer $CRON_SECRET`) |
| `GET /api/health`                      | Health check                                                                       |

## Getting started (local)

**Requirements:** Node.js ≥ 22 (`.nvmrc`), pnpm ≥ 10 (`corepack enable`), Docker (for local Postgres).

```bash
# 1. Install dependencies
pnpm install

# 2. Environment variables
cp .env.example .env.local        # then fill in what you need (see below)

# 3. Start PostgreSQL
docker compose up -d

# 4. Create the schema and demo data
pnpm db:migrate
pnpm db:seed                      # creates the link /i/demo-link

# 5. Run the app
pnpm dev                          # http://localhost:3000
```

Then open:

- http://localhost:3000 — marketing landing
- http://localhost:3000/i/demo-link — interview page
- http://localhost:3000/admin — admin (log in with an email listed in `ADMIN_ALLOWED_EMAILS`)

> Without API keys the app runs end-to-end except the external calls: voice connection, LLM summary, email and Notion fail gracefully and the job worker retries them once keys are configured.

### Environment variables

All variables are documented in [`.env.example`](.env.example). Minimum per feature:

| Feature  | Variables                                                            |
| -------- | -------------------------------------------------------------------- |
| App + DB | `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`                                |
| Admin    | `ADMIN_SESSION_SECRET`, `ADMIN_ALLOWED_EMAILS`                       |
| Voice    | `VOICE_PROVIDER`, `DEEPGRAM_API_KEY` (or `OPENAI_API_KEY`)           |
| Summary  | `LLM_PROVIDER`, `LLM_MODEL`, `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` |
| Email    | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPORT_TO`                    |
| Notion   | `NOTION_API_KEY`, `NOTION_DATA_SOURCE_ID`                            |
| Cron     | `CRON_SECRET`                                                        |

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
| `pnpm db:seed`                               | Demo template + `/i/demo-link`             |

## Project structure

```
src/
├── app/                          # Routing only (thin): pages, layouts, route handlers
│   ├── (marketing)/              # Landing #1  →  /
│   ├── (interview)/i/[token]/    # Landing #2  →  /i/:token
│   ├── (admin)/admin/            # Admin panel →  /admin/*
│   └── api/                      # REST endpoints (validate → call service → respond)
├── features/                     # UI + client logic per feature
│   ├── marketing/                # landing copy/content
│   ├── interview/                # InterviewRoom, useVoiceAgent, API client, Zod schemas
│   └── admin/                    # server actions, auth guard
├── server/                       # Server-only business logic
│   ├── db/                       # Drizzle client + schema (tables, enums)
│   ├── repositories/             # Data access (only place that writes SQL)
│   ├── services/                 # Use-cases: interview, summary, delivery, prompts
│   └── jobs/                     # Outbox worker: summary → email + Notion
├── integrations/                 # External providers behind interfaces (swappable)
│   ├── voice/                    # Deepgram Voice Agent · OpenAI Realtime
│   ├── llm/                      # OpenAI · Anthropic
│   ├── email/                    # Resend + templates
│   └── notion/                   # REST client + page mapper
├── components/ui/                # Shared UI primitives
├── lib/                          # env (Zod), errors, logger, i18n, tokens, admin session
└── proxy.ts                      # Next.js 16 proxy (ex-middleware): /admin gate
drizzle/                          # Generated SQL migrations (committed)
docs/                             # Architecture, providers, implementation plan
scripts/seed.ts                   # Demo data
tests/                            # Vitest unit tests
```

Every place that needs a real API key or unfinished integration is marked with **`TODO(integration)`**, **`TODO(voice)`**, **`TODO(auth)`** or **`TODO(security)`**:

```bash
grep -rn "TODO(" src
```

## Dependency security

`pnpm audit` runs in CI and fails on **high/critical** advisories. Production dependencies
(`pnpm audit --prod`) have no known vulnerabilities. Two dev-only findings are handled in
`package.json → pnpm`:

| Advisory | Path | Decision |
| --- | --- | --- |
| esbuild ≤0.24.2 — dev server can be read by any site ([GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)) | `drizzle-kit → @esbuild-kit/core-utils → esbuild` | **Fixed** with `pnpm.overrides` → `esbuild ^0.25.4` (same range drizzle-kit uses itself; `pnpm db:generate` verified). |
| braces ≤3.0.3 — stack-exhaustion DoS with deeply nested patterns ([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)) | `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces` | **Accepted** (`pnpm.auditConfig.ignoreGhsas`): no patched version exists; it only runs at lint time over our own `rootDir` setting, never on user input or in the production bundle. Remove the ignore when a fix ships. |

## Deployment (production)

1. Create a Postgres database (Neon or Supabase) and copy the **pooled** connection string.
2. Import the GitHub repo in Vercel → set all env vars from `.env.example` (Production + Preview).
3. Run migrations against production: `DATABASE_URL=<prod> pnpm db:migrate` (or a CI step).
4. Verify the sending domain in Resend; share the Notion database with the integration.
5. `vercel.json` registers the cron (`/api/cron/process-jobs` every 5 min) — set `CRON_SECRET`.
6. Go through [`docs/IMPLEMENTATION_PLAN.md` → Production checklist](docs/IMPLEMENTATION_PLAN.md#production-checklist).

`next.config.ts` uses `output: "standalone"`, so the app can also run in Docker on any Node host.

## Git workflow

- `main` → production · `develop` → integration/staging · `feature/<scope>-<short-name>` → work branches.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`…). PRs into `develop`; CI must pass.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — layers, data model, flows, security
- [`docs/PROVIDERS.md`](docs/PROVIDERS.md) — provider options and price comparison
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — step-by-step plan and checklists
