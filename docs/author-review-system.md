# Author Review System — R2-2

## What this is

A backend that lets each author review the pipeline rewrites (May-8) paragraph-by-paragraph against their original seed (May-7) and decide, for each suggestion, whether to:

- **KEEP** the original (default)
- **SWAP** in the pipeline rewrite
- **REWRITE** with their own wording

Decisions are authenticated (Supabase auth + email whitelist), audit-logged, and can be applied to produce a final author-authorised draft.

The web-page UI is deferred pending UX/UI input. This document describes the backend that the UI will sit on top of.

## Architecture

```
                ┌──────────────────────────────────────────┐
                │  /Users/arajiv/code/The-Digital-Law-Firm │
                │  ├── chapters/drafts/chapter_NN_draft.md │  ← May-7 author seeds (canonical)
                │  └── chapters/drafts/                    │
                │      └── _pipeline_v1_2026-05-08/        │  ← May-8 pipeline output (reference)
                │          └── chapter_NN_pipeline.md      │
                └────────────────┬─────────────────────────┘
                                 │
                                 ▼
                    scripts/seed_chapter_suggestions.ts
                                 │
                                 ▼
                    ┌───────────────────────────┐
                    │ chapter_suggestions (DB)  │
                    │   classification, text,   │
                    │   rationale               │
                    └────────────┬──────────────┘
                                 │
                ┌────────────────┴────────────────┐
                │                                 │
                ▼                                 ▼
   GET /api/ghostwriter/suggestions       Author UI (deferred)
   GET /api/ghostwriter/decisions         POST /api/ghostwriter/decisions
                                                  │
                                                  ▼
                                       chapter_decisions (DB)
                                                  │
                                                  ▼
                                scripts/apply_chapter_decisions.ts
                                                  │
                                                  ▼
                            chapters/drafts/_authorised/chapter_NN_authorised.md
                                                  │
                                                  ▼
                                       state/skool-sync.log
                                                  │
                                                  ▼
                          (downstream Skool sync — blocked on write-lock)
```

## Data model

### `chapter_suggestions`

One row per non-matching paragraph between the May-7 original and the May-8 pipeline rewrite. Padding (pipeline-only paragraphs) is skipped by default.

| Column          | Type       | Notes                                                                                          |
| --------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| id              | uuid       | primary key                                                                                    |
| chapter_number  | int 1..12  |                                                                                                |
| paragraph_index | int        | 0-indexed position in the original draft                                                       |
| original_text   | text       | what's in the canonical seed                                                                   |
| suggested_text  | text       | what the pipeline produced                                                                     |
| classification  | text       | one of: `term-change`, `precision-loss`, `readability-win`, `padding`, `restructure`           |
| rationale       | text       | one-sentence explanation of why the seeder classified it that way                              |
| source_pipeline | text       | identifies the pipeline run (`v1_2026-05-08`); allows future re-runs without collision         |
| created_at      | timestamp  |                                                                                                |

Unique key: `(chapter_number, paragraph_index, source_pipeline)`. RLS allows authenticated SELECT; service-role bypass for the seeder.

### `chapter_decisions`

One row per `suggestion_id` (UNIQUE enforced). Author email is the audit trail.

| Column         | Type      | Notes                                                                  |
| -------------- | --------- | ---------------------------------------------------------------------- |
| id             | uuid      | primary key                                                            |
| suggestion_id  | uuid      | references `chapter_suggestions.id`; UNIQUE                            |
| decision       | text      | `KEEP` \| `SWAP` \| `REWRITE`                                          |
| edited_text    | text NULL | required when `decision = REWRITE`                                     |
| decided_by     | text      | authenticated user's email; forced server-side, not client-trustable   |
| decided_at     | timestamp |                                                                        |
| notes          | text NULL | optional author free-text comment                                      |

RLS policies:

- `auth_read_all` — any authenticated session can SELECT
- `auth_write_own` — INSERT requires `auth.email() = decided_by`
- `auth_update_own` — UPDATE requires the same

## Classification taxonomy

Generated by `lib/ghostwriter/diff.ts`:

| Classification     | What it means                                                                              | Author priority |
| ------------------ | ------------------------------------------------------------------------------------------ | --------------- |
| `term-change`      | ≤3 words differ between original and pipeline (e.g. "discipline" → "habit")                | **High**        |
| `precision-loss`   | Pipeline removed specific tokens — numbers, named entities, regulated terms                | **High**        |
| `readability-win`  | Pipeline shortened the paragraph by >30% with no precision-tokens lost                     | Low (likely accept) |
| `restructure`      | Same content, different ordering or phrasing                                               | Medium          |
| `padding`          | Pipeline-only paragraph (not in original) — skipped by the seeder by default               | n/a (suppressed) |

## Scripts

### Seed suggestions for a chapter

```
cd /Users/arajiv/legal-citation-verifier/frontend
npx tsx scripts/seed_chapter_suggestions.ts --chapter 8
npx tsx scripts/seed_chapter_suggestions.ts --chapter 8 --dry-run
npx tsx scripts/seed_chapter_suggestions.ts --all
```

Re-running is idempotent — existing rows for `(chapter_number, source_pipeline)` are deleted first.

### Apply decisions for a chapter

```
npx tsx scripts/apply_chapter_decisions.ts --chapter 8
npx tsx scripts/apply_chapter_decisions.ts --chapter 8 --dry-run
npx tsx scripts/apply_chapter_decisions.ts --chapter 8 --output /tmp/test.md
```

Writes to `chapters/drafts/_authorised/chapter_NN_authorised.md` and appends to `state/skool-sync.log`.

## API contract

### `POST /api/ghostwriter/decisions`

Save or update a decision.

```ts
// Request
{
  suggestion_id: string;       // UUID from chapter_suggestions
  action: 'KEEP' | 'SWAP' | 'REWRITE';
  edited_text?: string;        // required when action = REWRITE
  notes?: string;
}

// Response (200)
{ decision: { id, suggestion_id, decision, edited_text, decided_by, decided_at, notes } }
```

Authentication required (Supabase session). `decided_by` is forced to the authenticated user's email — clients cannot spoof it. Whitelist (`allowed_emails`) enforced.

### `GET /api/ghostwriter/decisions?chapter=NN`

List all decisions for a chapter. Any authenticated whitelisted user can read.

### `GET /api/ghostwriter/suggestions?chapter=NN`

List all suggestions for a chapter, each joined with its existing decision (if any), ordered by `paragraph_index`. Any authenticated whitelisted user can read.

## Decision lifecycle

1. **Seeded** — `seed_chapter_suggestions.ts` populates `chapter_suggestions`
2. **Reviewed** — Author opens the review page (deferred UI) → reads each suggestion → posts a decision via `POST /api/ghostwriter/decisions`
3. **Applied** — `apply_chapter_decisions.ts` reads decisions + original draft → writes `chapter_NN_authorised.md` + appends `state/skool-sync.log`
4. **Synced to Skool** — *downstream phase, blocked on the chapter write-lock guardrails*. Will read `chapter_NN_authorised.md` and PUT to Skool with version marker `v2.1 — Author-authorised — {author-email} — {date}`.

## UI deferral note

The frontend `/ghostwriter/review/[chapter]/page.tsx` is deferred pending UX/UI input. The backend is fully usable from any client — including curl during development. When the UI lands it will:

- Show the full chapter text on the left, suggestions on the right
- Two-way navigation (click marker in text → scroll to suggestion; click suggestion → scroll to marker)
- Radio buttons for KEEP / SWAP / REWRITE; textarea appears when REWRITE selected
- Save indicator + decision count badge
- Use the existing Supabase auth + middleware redirect to `/login` for unauthenticated users
