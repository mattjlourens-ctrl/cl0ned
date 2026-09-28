# Build log

Notes on anything that was hard, wrong on the first try, or needed a human decision.

## 2026-09-27: Open decisions resolved

Human decisions (asked in two rounds, because matching and safety depend on target user and stack):

- Sources: GitHub only
- Search: live, no index
- Target user: both, with a "ready to use" / "needs setup" label based on releases and homepage
- Stack: TypeScript + Next.js (Python was the alternative considered, for readability; the human chose TypeScript)
- Matching: Claude judges each README → replacement / partial / related only
- Safety: repo health basics + OpenSSF Scorecard; flag failures, remove only severe ones

Still open: which failures are "severe" (the proposal was archived repo or no license), and the thresholds (e.g. how stale counts as stale).

## 2026-09-28: Step 1, Next.js page with search box and results list

- Human course-correction: the AI started writing a full multi-task plan and planned to run it with subagents. The human stopped it and asked for step 1 only, verified by running `npm run dev`, before anything else. The heavy process was more than this stage needed.
- `create-next-app` won't scaffold into a folder that already has files, and its template includes its own `CLAUDE.md`. Scaffolded in a temp folder and copied the files over, skipping the template's `CLAUDE.md` and `README.md` so ours wasn't overwritten.
- Next.js 16 ships `AGENTS.md`, which says APIs may differ from what AI models learned in training and points to docs bundled in `node_modules/next/dist/docs/`. Checked there before writing code; client components (`"use client"`) work as expected.
- The editor showed `Cannot find name 'LayoutProps'` in `layout.tsx`. It's a global type that Next generates when `next dev` runs. The error went away after starting the dev server (`tsc` passes).
- The page never shows results yet. Submitting shows "Search isn't connected yet" rather than fake data, per the "never invent alternatives" rule.

## 2026-09-28: Step 2, live GitHub search

- **Mistake (AI):** `.env.local` contained only the raw token, with no `GITHUB_TOKEN=` prefix. To check it, the AI ran a command meant to hide the values of `NAME=value` lines. The file had no `=`, so nothing was hidden and the token was printed into the session. Lesson: to inspect a secrets file, print only whether a line exists or its length, never a "masked" version that depends on the file being formatted as expected. The token needs to be revoked and replaced.
- Next.js ignores a line without `NAME=`, so the Photoshop check ran without authentication (GitHub allows about 10 searches a minute that way). The code sends the token when it's present.
- The search query is `<tool> alternative`, sorted by stars. For "Photoshop" it returned 10 real repos, but they're weak: scripts, a file loader, and a GIMP mod. **GIMP, Krita and Photopea-style projects didn't appear**, because their descriptions don't say "alternative". Matching (step 4) can label weak results, but it can't recover repos the search never found. Search recall needs a human decision.
- "Last update" uses GitHub's `pushed_at` (last code push), not `updated_at`. `updated_at` also changes when someone stars the repo.
- React 19 types mark `FormEvent` as deprecated; switched to `SubmitEvent`.
