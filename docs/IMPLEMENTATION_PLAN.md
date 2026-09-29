# Implementation plan

MVP window: **Oct 12 – Oct 23, 2026** (4 phases), preceded by a setup phase.
Each step lists **what**, **where in the code**, and **done when**.

---

## Phase 0 — Foundations (Sep 29 – Oct 9) ✅ scaffold ready

| #   | Step                                                                                                                                   | Where                     | Done when                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------- |
| 0.1 | Repo + branch `feature/project-foundation` with this scaffold                                                                          | whole repo                | CI green (lint, typecheck, test, build) |
| 0.2 | Create GitHub repo, protect `main` (PR + CI required), create `develop`                                                                | GitHub                    | Branch rules active                     |
| 0.3 | Create accounts & keys: Neon, Deepgram, OpenAI/Anthropic, Resend, Notion, Vercel                                                       | `.env.local` / Vercel env | `.env.example` fully filled locally     |
| 0.4 | Notion: create "Emily Interviews" DB with properties from `integrations/notion/mapper.ts`, share with integration, copy data source id | Notion                    | `NOTION_DATA_SOURCE_ID` set             |
| 0.5 | Resend: verify sending domain                                                                                                          | Resend                    | Test email received                     |
| 0.6 | Vercel: import repo, set env vars, connect Neon                                                                                        | Vercel                    | Preview URL per PR                      |

## Phase 1 — Data & admin (Oct 12 – Oct 14)

| #   | Step                                                                                                      | Where                                                        | Done when                                           |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------- |
| 1.1 | Replace dev login with **Better Auth magic link** (Resend), keep `requireAdmin()` contract                | `features/admin/auth.ts`, `lib/admin-session.ts`, `proxy.ts` | Only allow-listed emails can enter `/admin` in prod |
| 1.2 | Templates: edit / deactivate; question editor with follow-ups                                             | `app/(admin)/admin/templates`, `features/admin/actions.ts`   | CRUD works, Zod-validated                           |
| 1.3 | Links: several per template, label, participant hint, expiry, max sessions (+ enforce in `startOrResume`) | `interview.service.ts` (`TODO(limits)`)                      | Expired/full links show 404                         |
| 1.4 | Copy-link button + QR (optional)                                                                          | templates page                                               | Admin shares link in 1 click                        |

## Phase 2 — Voice interview (Oct 14 – Oct 17)

| #   | Step                                                                                                                                      | Where                                                         | Done when                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------- |
| 2.1 | Implement Deepgram connection in `useVoiceAgent`: WebSocket, Settings message, mic capture (AudioWorklet → PCM16 16 kHz), playback 24 kHz | `features/interview/hooks/use-voice-agent.ts` (`TODO(voice)`) | Talk to Emily in ES and EN                   |
| 2.2 | Map `ConversationText` events → `onTurn()`; batch flush every 5 s                                                                         | same                                                          | Transcript rows appear in DB during the call |
| 2.3 | Barge-in, mic permission errors, reconnect on drop, auto-end at `max_duration_minutes`                                                    | same + `interview-room.tsx`                                   | Manual QA checklist passes                   |
| 2.4 | Prompt tuning: keep on topic, one question at a time, closing                                                                             | `server/services/prompts.ts`                                  | 5 test interviews reviewed with Carlos       |
| 2.5 | Resume flow on a second device/tab                                                                                                        | `interview-room.tsx`, `startOrResume`                         | Pause + resume keeps transcript order        |

## Phase 3 — Processing & delivery (Oct 19 – Oct 21)

| #   | Step                                                                               | Where                             | Done when                                           |
| --- | ---------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------- |
| 3.1 | Tune summary prompt + schema (pain points, insights, quotes, answers per question) | `prompts.ts`, `summary.schema.ts` | Valid JSON on 10/10 test transcripts                |
| 3.2 | Email report: final design (optionally React Email)                                | `integrations/email/templates`    | Carlos receives the report                          |
| 3.3 | Notion page: properties + body blocks                                              | `integrations/notion/mapper.ts`   | Page created in "Emily Interviews"                  |
| 3.4 | Cron + retries verified; "retry" button for `dead` jobs in admin                   | `server/jobs`, admin session page | Kill Notion key → job retries → fix key → delivered |

## Phase 4 — Hardening & launch (Oct 21 – Oct 23)

| #   | Step                                                                      | Where                                                | Done when               |
| --- | ------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------- |
| 4.1 | Rate limiting on session creation (Upstash Ratelimit)                     | `api/interviews/[token]/sessions` (`TODO(security)`) | 429 after N attempts/IP |
| 4.2 | CSP headers, error tracking (Sentry), uptime monitor on `/api/health`     | `next.config.ts`/`proxy.ts`                          | Alerts working          |
| 4.3 | E2E tests (Playwright): landing, start interview (mock voice), admin flow | `tests/e2e`                                          | Running in CI           |
| 4.4 | Production deploy + migrations + smoke test                               | Vercel                                               | Checklist below all ✅  |
| 4.5 | Pilot: 3–5 real interviews, collect feedback                              | —                                                    | Go / no-go with Carlos  |

---

## Production checklist

- [ ] All env vars set in Vercel (Production + Preview); no secrets in git
- [ ] `pnpm db:migrate` run against production DB (pooled URL in app, direct URL for migrations)
- [ ] Admin auth = magic link, allow-list correct
- [ ] Resend domain verified (SPF/DKIM); `EMAIL_FROM` on that domain
- [ ] Notion DB shared with integration; properties match mapper
- [ ] `CRON_SECRET` set; cron visible in Vercel dashboard
- [ ] Rate limit + CSP enabled
- [ ] Consent text reviewed; privacy notice linked from interview page
- [ ] Sentry + uptime monitor on
- [ ] Vercel **Pro** plan (Hobby is non-commercial)

## Definition of done (every PR)

- Lint, typecheck, tests and build pass in CI
- New env vars added to `.env.example` + `src/lib/env.ts`
- Schema change → `pnpm db:generate` and migration committed
- Docs updated when behavior or setup changes

## Suggested branches

```
feature/project-foundation      ← this scaffold
feature/admin-auth              (1.1)
feature/admin-templates-links   (1.2–1.4)
feature/voice-deepgram          (2.1–2.3)
feature/interview-prompts       (2.4–2.5)
feature/summary-delivery        (3.1–3.4)
chore/hardening-launch          (4.x)
```
