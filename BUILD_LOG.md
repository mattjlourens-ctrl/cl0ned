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
- Token replaced by the human. **First verification attempt was wrong:** the AI compared GitHub's `/rate_limit` endpoint before and after an app search. Neither counter moved, but a direct authenticated search then showed `x-ratelimit-used: 1` in its response headers while `/rate_limit` still said 0. That endpoint doesn't reliably show search usage. The reliable check is the `x-ratelimit-*` headers on the actual search response, so `github.ts` now logs them on the server. The app's search reported `28 of 30 left`. A limit of 30 means authenticated (anonymous is 10), and the count dropped by the direct test call and the app call.

## 2026-09-28: Step 5, "installer available" / "needs setup" label (built before steps 3 and 4)

- The human asked for this label next, worded so users know honestly how much work each repo takes. The app never installs or configures anything for them.
- **Deviation from the agreed rule, pending human confirmation:** the agreed rule counted "a homepage that looks like a hosted app" as ready to use. The AI dropped that part, because a homepage is often only docs and there's no reliable data-only way to tell. Only installer files in the latest GitHub Release count.
- `.zip` and `.tar.gz` are not counted as installers, because they're as often source code as an app. Verification showed the cost: `cristibaluta/Imagin-Raw` (Mac app in a .zip) and `adi805/Compositor-Windows` (Windows build in a .zip) are labelled "Needs setup" even though they offer a download. Needs a human decision.
- Verified by running "Photoshop" and "Notion" through the app and checking each Photoshop result against GitHub's raw release data. All 10 labels matched the data (1 installer, 9 needs setup). Notion found AppFlowy (Android, Linux, Mac, Windows) and Colanode (Mac, Windows) with installers.
- Cost: one extra GitHub API call per result (10 per search), against the 5,000/hour general limit, not the 30/minute search limit.
- **Human rule change:** uploaded `.zip`/`.tar.gz` files now count as installers if the filename mentions an OS (mac/macos/osx/darwin, win/windows/win32/win64, linux) or the word "app"/"portable". GitHub's auto-generated "Source code" archives never appear in a release's `assets` list (they're separate `zipball_url`/`tarball_url` fields), so no extra filter was needed. Words are matched whole: plain substring matching would read "darwin" (macOS) as Windows because it contains "win".
- Re-run results: `adi805/Compositor-Windows` → Installer (Windows) ✅. `cristibaluta/Imagin-Raw` → still Needs setup ❌, because its file is `Imagin.Raw.zip` and mentions no OS, "app" or "portable". **New false positive:** `mattermost-community/focalboard` → Installer (Mac, Linux, Windows). Its release files are `mattermost-plugin-focalboard-…-darwin-amd64.tar.gz` and similar: server plugins, not apps. Filename rules have a limit here. Needs a human decision.
- **Human decision:** archives whose names contain the whole word "plugin", "server" or "sdk" are not installers, even if they mention an OS. Re-run: Focalboard → Needs setup ✅, Compositor-Windows → Installer (Windows) ✅, Imagin-Raw → Needs setup (accepted as a known miss for now). Everything else unchanged.
- **Pattern: this is the second keyword heuristic to go wrong.** First, search recall: the `<tool> alternative` query missed GIMP and Krita. Now readiness labelling: filename rules missed Imagin-Raw and mislabelled Focalboard's server plugins. When step 4 (Claude reads each README) is built, it should double-check both: whether well-known replacements were missed, and whether the "installer available" / "needs setup" label matches what the README says.
- **Human decision:** the "plugin"/"server"/"sdk" exclusion now applies to every file type (.dmg, .exe, .deb, …), not just .zip/.tar.gz. Reason: the label promises "download it and install it yourself", and a server, plugin or SDK still needs setup after installing. Real example found first: `rustdesk/rustdesk-server` 1.1.16 ships `rustdesk-server-hbbs_1.1.16_amd64.deb` etc. and was labelled "Installer (Linux)". No real counter-example turned up (a desktop app with "server" in its installer name). Jellyfin, Mattermost and MinIO have no installer files on GitHub.
- Re-run: Compositor-Windows → Installer (Windows) ✅, Focalboard → Needs setup ✅, RustDesk Server → Needs setup ✅ (all 17 of its release files contain "server"). RustDesk Server doesn't appear in any app search (for "TeamViewer" it's the client `rustdesk/rustdesk` that appears, still Installer), so it was checked by running the same labelling function on its real release file list. The Photoshop, Notion and TeamViewer results are otherwise unchanged.
