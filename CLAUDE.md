# CLAUDE.md

## Project Purpose

Automate tracking of FII (real estate fund) investments made via XP Investimentos.

**Trigger:** XP sends a "Nota de Negociação" email with a password-protected PDF after each approved investment.
**Goal:** Extract the invested amount from that PDF and persist it to a Notion database.

## Architecture

```
Gmail API → Pub/Sub topic → Cloud Run (serverless) → Notion API
```

1. Gmail watch monitors inbox for XP negotiation emails
2. Gmail notifies Pub/Sub on new messages
3. Pub/Sub triggers Cloud Run handler (no persistent server — scales to zero)
4. Handler: fetch email → extract PDF attachment → scrape investment amount → write to Notion

**Cloud infrastructure:** currently created manually via GCP console. Planned migration to Terraform.
**Gmail watch renewal:** expires every 7 days. GitHub Actions script handles renewal.

## Tech Stack

- **Runtime:** Node.js + TypeScript (`tsx` for local execution)
- **No HTTP server** — `server.ts` and `routes/` are legacy and will be deleted
- **PDF parsing:** `pdfjs-dist` (XP PDFs are password-protected, 3-char password)
- **Validation:** `zod` (env schema in `src/env.ts`)
- **Google:** `googleapis`, `@google-cloud/pubsub`, `@google-cloud/local-auth`
- **Notion:** `@notionhq/client`

## Module Map

| Path                                      | Purpose                                                          |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `src/env.ts`                              | Zod-validated env schema — source of truth for all required vars |
| `src/google/auth/`                        | OAuth2 flow + credential persistence (local dev only)            |
| `src/google/gmail/`                       | Gmail API client, history ID tracking to avoid reprocessing      |
| `src/google/pubsub/`                      | Pub/Sub topic/subscription setup                                 |
| `src/notion/`                             | Notion client + `createInvestmentRecord` util                    |
| `src/utils/getInvestmentAmountFromPDF.ts` | PDF scraping logic                                               |
| `src/scripts/`                            | One-off scripts (e.g., Gmail unsubscribe)                        |
| `src/server.ts`                           | **LEGACY — to be deleted**                                       |
| `src/routes/`                             | **LEGACY — to be deleted**                                       |

## Commands

```bash
npm run gmail:unsubscribe   # unsubscribe Gmail push watch
```

## Environment Variables

All required. See `.env.example` for template.

| Variable                       | Description                                |
| ------------------------------ | ------------------------------------------ |
| `PDF_PASSWORD`                 | 3-char password for XP PDF files           |
| `NOTION_TOKEN`                 | Notion integration token                   |
| `NOTION_REALSTATE_DATABASE_ID` | Target Notion database ID                  |
| `GOOGLE_PROJECT_ID`            | GCP project ID                             |
| `GOOGLE_PUBSUB_TOPIC`          | Pub/Sub topic name                         |
| `GOOGLE_PUBSUB_SUBSCRIPTION`   | Pub/Sub subscription name                  |
| `GOOGLE_PUBSUB_PUSH_ENDPOINT`  | HTTPS URL for Pub/Sub push (Cloud Run URL) |

## Auth Files

`credentials.json` and `token.json` at project root — **never commit** (gitignored).
OAuth2 flow runs once locally and saves the token. In Cloud Run, use a service account instead.

## Key Constraints

- Pub/Sub push endpoint must be HTTPS
- Gmail watch expires every 7 days — GitHub Actions renews it
- `lastHistoryId` persisted to avoid reprocessing emails across restarts
- PDF password is always exactly 3 characters (XP Investimentos format)

## Legacy State

This codebase is pre-refactor. `server.ts`, Express, and `routes/` exist but are slated for removal. Treat existing code as a reference for business logic only, not as the target architecture.
