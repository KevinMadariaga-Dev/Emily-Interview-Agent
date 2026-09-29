# Architecture

## 1. Principles

1. **Modular monolith** — one Next.js app (landings + admin + API). No microservices until there is a real reason.
2. **Thin routes, fat services** — `app/` only routes and validates; business logic lives in `server/services`, SQL only in `server/repositories`.
3. **Providers behind interfaces** — voice, LLM, email and Notion are adapters in `src/integrations/*`. Switching vendor = new file + env var, no changes to services.
4. **Reliable side effects (outbox pattern)** — external calls are persisted as jobs in `integration_jobs`, processed with retries + exponential backoff and idempotency keys. A Notion or email outage never loses an interview.
5. **Audio never passes through our server** — the browser connects directly to the voice provider with a short-lived token. Lower latency, lower cost, no long-lived sockets on serverless.
6. **Validate at the edges** — Zod for env vars, request bodies and LLM output.
7. **Server-only by default** — `import "server-only"` on everything that touches secrets or the DB.

## 2. Layers

```
┌──────────────────────────────────────────────────────────────────────┐
│ app/ (routing)   (marketing)/  (interview)/i/[token]  (admin)/  api/ │
├──────────────────────────────────────────────────────────────────────┤
│ features/ (UI + client logic)   interview · admin · marketing        │
├──────────────────────────────────────────────────────────────────────┤
│ server/services (use-cases)     interview · summary · delivery       │
│ server/jobs (worker)            generate_summary → send_email/notion │
├──────────────────────────────────────────────────────────────────────┤
│ server/repositories (data)      interview · job                       │
│ server/db (Drizzle + Postgres)                                        │
├──────────────────────────────────────────────────────────────────────┤
│ integrations/ (adapters)        voice · llm · email · notion          │
└──────────────────────────────────────────────────────────────────────┘
Dependencies point downward only. `integrations/` never imports `server/`.
```

## 3. Data model

```
admins
interview_templates 1──* interview_links 1──* interview_sessions 1──* transcript_turns
                                                    │
                                                    └──1 interview_summaries
integration_jobs (outbox: generate_summary | send_email | sync_notion)
```

| Table                 | Key columns                                                                             | Notes                                                          |
| --------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `interview_templates` | name, objective, questions (jsonb), instructions, default_locale, max_duration_minutes  | The "brief" Emily follows                                      |
| `interview_links`     | token (unique), template_id, participant_hint, max_sessions, expires_at, is_active      | Shareable `/i/<token>`                                         |
| `interview_sessions`  | link_id, status, locale, participant_name, consent_at, resume_key, started/completed_at | Status: created → in_progress ⇄ paused → completed → processed |
| `transcript_turns`    | session_id, seq, role (agent/participant), text, offset_ms                              | Unique (session_id, seq)                                       |
| `interview_summaries` | session_id (unique), data (jsonb), markdown, model, email_sent_at, notion_page_id       | Delivery status lives here                                     |
| `integration_jobs`    | type, status, payload, idempotency_key (unique), attempts, run_after, last_error        | Retries with backoff, `dead` after 5 attempts                  |

Schema source: `src/server/db/schema/*`. Migrations: `drizzle/` (generated, committed, never edited by hand).

## 4. Main flows

### 4.1 Interview (participant)

```
Browser /i/<token>
 1. Server renders page with public template info (never the prompt).
 2. Participant accepts consent → POST /api/interviews/:token/sessions
      ← { sessionId, resumeKey }   (resumeKey saved in localStorage)
 3. POST /api/sessions/:id/voice-token  (x-resume-key)
      server builds Emily's system prompt from the template + mints a 60s provider token
 4. Browser ⇄ Deepgram Voice Agent (WebSocket): mic audio up, Emily's voice down
      STT (Nova-3) → LLM (think) → TTS (Aura-2), all inside the provider
 5. Every ~5s: POST /api/sessions/:id/turns  (batched final transcript segments)
 6. Tab closed → POST /pause (keepalive). Same link later → resumes with resumeKey.
 7. "End" → POST /api/sessions/:id/complete
```

### 4.2 Post-processing pipeline

```
complete ──► integration_jobs: generate_summary
                  │  (after() runs it right away; cron every 5 min retries)
                  ▼
         LLM → JSON → Zod validate → interview_summaries (+ markdown)
                  │
       ┌──────────┴──────────┐
  send_email             sync_notion
  Resend (Idempotency-Key)  POST /v1/pages (parent: data_source_id)
  → email_sent_at           → notion_page_id
```

Failures: the job goes back to `pending` with `run_after = now + 30s·2^(attempt-1)` (or Notion's `Retry-After`), up to 5 attempts, then `dead` (visible for manual retry).

## 5. Security

| Concern            | Measure                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Secrets            | Only on the server (`server-only`, env validated by Zod). Browser gets 60-second voice tokens.                          |
| Participant access | Unguessable link token (128-bit) + per-session `resumeKey` required on every session endpoint.                          |
| Admin access       | `proxy.ts` gate + `requireAdmin()` in each page; allow-listed emails. **TODO:** magic-link auth (Better Auth + Resend). |
| Abuse              | **TODO:** rate-limit session creation per IP; `max_sessions` / `expires_at` per link.                                   |
| Privacy            | Explicit consent stored (`consent_at`); prompt forbids collecting sensitive data; no audio stored by default.           |
| Headers            | `nosniff`, `Referrer-Policy`, `Permissions-Policy: microphone=(self)`; add CSP before launch.                           |
| Cron               | `Authorization: Bearer $CRON_SECRET`.                                                                                   |

## 6. Observability

- JSON logs via `src/lib/logger.ts` (swap for Axiom/Sentry without touching call sites).
- `/api/health` for uptime monitoring.
- Admin session page shows email/Notion delivery status; `integration_jobs.last_error` for debugging.

## 7. Key decisions (ADR summary)

| Decision        | Chosen                                    | Alternatives                             | Reason                                                                   |
| --------------- | ----------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| ORM             | Drizzle                                   | Prisma                                   | SQL-like, no engine binary, great on serverless, schema in TS            |
| Voice           | Deepgram Voice Agent                      | OpenAI Realtime, ElevenLabs, Vapi/Retell | Flat per-minute price, BYO LLM, ES+EN voices, one socket for STT+LLM+TTS |
| Background work | Postgres outbox + `after()` + Vercel Cron | Inngest, QStash, BullMQ                  | No new infra for MVP; upgrade path to Inngest if volume grows            |
| Email           | Resend                                    | SendGrid, Postmark, SES                  | DX, idempotency keys, free tier                                          |
| Auth (admin)    | Signed cookie (dev) → Better Auth         | Auth.js, Clerk                           | Few admins; magic link is enough, no vendor lock                         |
