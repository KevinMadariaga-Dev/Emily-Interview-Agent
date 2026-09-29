# Providers & pricing

> Prices are public list prices researched in **September 2026**. Verify on each vendor's pricing page before committing — they change often.

## Voice agent (STT + LLM + TTS)

| Option                                    | Approx. all-in cost                         | Pros                                                                  | Cons                                                |
| ----------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------- |
| **Deepgram Voice Agent API** ✅ default   | ~$0.05–0.11 / min (connection-time billing) | Predictable cost, BYO LLM, STT+TTS+orchestration in one socket, ES/EN | Newer API, voice quality below ElevenLabs premium   |
| OpenAI Realtime (`gpt-realtime`, WebRTC)  | ~$0.12 (cached) – $0.30 / min (token-based) | Most natural speech-to-speech, WebRTC native in browser               | Variable cost, OpenAI-only LLM                      |
| ElevenLabs Conversational AI              | ~$0.10–0.18 / min                           | Best voices                                                           | Less control over the pipeline                      |
| Vapi / Retell (bundled platforms)         | ~$0.12–0.31 / min                           | Fast to prototype, phone support                                      | Platform fee on top, more lock-in                   |
| DIY (Deepgram STT + LLM + ElevenLabs TTS) | ~$0.12–0.13 / min                           | Full control                                                          | Most engineering (turn-taking, barge-in, streaming) |

**Estimate for the MVP:** 100 interviews × 15 min = 1,500 min → **≈ $75–165 / month** with Deepgram.

Switch provider with `VOICE_PROVIDER=deepgram | openai-realtime` (`src/integrations/voice`).

## LLM (post-interview summary)

One call per interview (~5–15k tokens). With a small model (e.g. `gpt-4.1-mini` or a Claude Haiku-class model) this is **cents per interview**. Switch with `LLM_PROVIDER` + `LLM_MODEL`.

## Database

| Option      | Free tier                        | Notes                                   |
| ----------- | -------------------------------- | --------------------------------------- |
| **Neon** ✅ | Yes (small storage, autosuspend) | Serverless Postgres, DB branch per PR   |
| Supabase    | Yes                              | Postgres + auth/storage if needed later |
| Local       | Docker (`docker-compose.yml`)    | Development                             |

## Email

| Option        | Free tier                        | Notes                                 |
| ------------- | -------------------------------- | ------------------------------------- |
| **Resend** ✅ | 3,000 emails / month (100 / day) | Great DX, idempotency keys            |
| Postmark      | Trial                            | Best deliverability for transactional |
| SendGrid      | No free tier anymore             | —                                     |

## Hosting

| Option                          | Notes                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Vercel** ✅                   | Native Next.js, preview per PR, Cron built-in. Hobby is non-commercial → use **Pro** for production. |
| Docker (`output: "standalone"`) | Railway / Fly.io / AWS if leaving Vercel                                                             |

## Notion

Free API. Rate limit ≈ **3 requests/second** per integration (handled by the sequential worker + `Retry-After`). Use API version `2025-09-03` (data sources).

## Sources

- [Deepgram vs OpenAI Realtime API](https://deepgram.com/learn/deepgram-voice-agent-api-vs-openai-realtime-api)
- [AI voice agent pricing 2026 (8 vendors)](https://techsy.io/en/blog/ai-voice-agent-pricing)
- [Notion API integrations guide 2026 (data sources)](https://www.stackscout.net/articles/cc_20260628_173053.html)
- [Notion — Working with databases](https://developers.notion.com/guides/data-apis/working-with-databases)
- [Resend pricing](https://resend.com/blog/new-free-tier)
- [Next.js 16.3 release](https://nextjs.org/blog/next-16-3)
