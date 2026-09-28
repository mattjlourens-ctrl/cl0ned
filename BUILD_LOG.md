# Build log

Notes on anything that was hard, wrong on the first try, or needed a human decision.

## 2026-09-27: Open decisions resolved

Human decisions (asked in two rounds, because matching and safety depend on target user and stack):

- Sources: GitHub only
- Search: live, no index
- Target user: both, with a "ready to use" / "needs setup" label based on releases and homepage
- Stack: TypeScript + Next.js (Claude recommended Python for readability; the human chose TS)
- Matching: Claude judges each README → replacement / partial / related only
- Safety: repo health basics + OpenSSF Scorecard; flag failures, remove only severe ones

Still open: which failures are "severe" (the proposal was archived repo or no license), and the thresholds (e.g. how stale counts as stale).
