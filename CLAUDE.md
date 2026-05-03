# CLAUDE.md

## Project Purpose

Automate tracking of FII (real estate fund) investments made via XP Investimentos.

**Trigger:** XP sends a "Nota de Negociação" email with a password-protected PDF after each approved investment.
**Goal:** Extract the invested amount from that PDF and persist it to a Notion database.

## Architecture

```
Gmail API → Pub/Sub topic → Cloud Run (serverless) → Notion API
                                      ↕
                                  Firestore
                             (lastHistoryId state)
```

1. Gmail watch monitors inbox for XP negotiation emails
2. Gmail notifies Pub/Sub on new messages
3. Pub/Sub triggers Cloud Run handler (no persistent server — scales to zero)
4. Handler: read `lastHistoryId` from Firestore → fetch Gmail history since that ID → extract PDF attachment → scrape investment amount → write to Notion → save new `historyId` to Firestore

**Cloud infrastructure:** currently created manually via GCP console. Planned migration to Terraform.
**Gmail watch renewal:** expires every 7 days. GitHub Actions script handles renewal.

## Tech Stack

- **Runtime:** Node.js + TypeScript (`tsx` for local execution)
- **No HTTP server** — entry point is a Cloud Functions Framework CloudEvent handler
- **PDF parsing:** `pdfjs-dist` (XP PDFs are password-protected, 3-char password)
- **Validation:** `zod` (env schema in `src/env.ts`)
- **Google:** `googleapis`, `@google-cloud/pubsub`, `@google-cloud/local-auth`, `@google-cloud/firestore`
- **Notion:** `@notionhq/client`

## Module Map

| Path                                      | Purpose                                                          |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `src/index.ts`                            | Cloud Run entry point — registers CloudEvent handler             |
| `src/handler.ts`                          | Core pipeline: Gmail history → PDF → Notion                      |
| `src/env.ts`                              | Zod-validated env schema — source of truth for all required vars |
| `src/google/auth/`                        | OAuth2 flow + credential persistence (local dev only)            |
| `src/google/gmail/`                       | Gmail API client                                                 |
| `src/google/pubsub/`                      | Pub/Sub topic/subscription setup                                 |
| `src/notion/`                             | Notion client + `createInvestmentRecord` util                    |
| `src/utils/getInvestmentAmountFromPDF.ts` | PDF scraping logic                                               |
| `src/scripts/`                            | One-off scripts (subscribe/unsubscribe Gmail watch)              |

## Firestore State

- **Database:** `(default)`
- **Collection:** `rpa-state`
- **Document:** `gmail-watch`
- **Field:** `lastHistoryId` — persists the last processed Gmail historyId across Cloud Run invocations

On first invocation (no saved historyId): saves current historyId and skips processing. On subsequent invocations: uses saved historyId as `startHistoryId` for `gmail.users.history.list`, then updates to the new historyId after processing.

## Commands

```bash
npm run gmail:subscribe     # subscribe Gmail push watch (saves initial historyId locally)
npm run gmail:unsubscribe   # unsubscribe Gmail push watch
npm run test:pdf            # test PDF parsing against teste_pdf.pdf
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

## Auth Files

`gmail-credentials.json` (OAuth2 client credentials) and `token.json` (OAuth2 refresh token) at project root — **never commit** (gitignored).
OAuth2 flow runs once locally and saves the token. In Cloud Run, `token.json` is deployed directly to `/workspace/token.json`.

## Key Constraints

- Gmail watch expires every 7 days — GitHub Actions renews it
- `lastHistoryId` persisted in Firestore to avoid reprocessing emails across Cloud Run invocations
- Local scripts persist `lastHistoryId` to `lastHistoryId.txt` (file-based, dev only)
- PDF password is always exactly 3 characters (XP Investimentos format)
- Cloud Run service account needs `Cloud Datastore User` role for Firestore access
- Gmail watch includes both production label (`Banks/XP/Negotiation Notes`) and test label (`Label_8363703479154201157`)
