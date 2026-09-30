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

## 2026-09-28: UI restyle "like Cursor"

- "Like Cursor" was ambiguous (the website, the editor app, or the AI chat panel). Asked; the human chose the cursor.com website look. Short design approved in chat before any code.
- Dark-only palette, Geist font (the template's `globals.css` had been forcing Arial over it), centred hero, pill-shaped search box, bordered result cards with license and readiness pill badges. The full honest sentences stay under the badges, and "View on GitHub →" stays directly under the last update date. No logic or copy rules changed; no new dependencies.
- Verified with screenshots from headless Chrome, driven by a small DevTools-protocol script: landing page, "Photoshop" results (10 cards) at desktop width, and at 390px phone width. First attempt failed: the script crashed before closing its own Chrome, which kept the debugging port busy. Fixed by killing the leftover and using a fresh port.

## 2026-09-29: Landing page redesign (dark, editorial)

- The human supplied a detailed visual brief: huge "cl0ned" wordmark, script tagline, a rotating wireframe torus, film grain, a warm glow, a 12-column grid, and hairlines instead of boxes. Fonts are now Inter Tight + Allura (Geist dropped). Motion (already installed) handles the entrance animation. The torus is a small hand-written canvas component (`WireTorus.tsx`) and draws one still frame when the user prefers reduced motion.
- **The brief conflicted with the hard rules in three places, and the AI changed the copy instead of following the brief literally:**
  - "1,200+ alternatives indexed" + avatars: the number would be made up, and there is no index (search is live). Replaced with "Live GitHub search. License on every result." and three license chips (MIT/GPL/BSD) in place of the avatars.
  - "— SAFETY FILTERED": the safety filter isn't built yet. Shown as "Safety checks · coming soon".
  - "— LICENSE CHECKED" became "License shown", which is what the app actually does today.
- Footer names (GIMP, Blender, Inkscape, …) are real open-source projects, labelled "Open source, for example" so they aren't mistaken for search results. The brief asked for several social icons; there are no accounts, so there is only a GitHub icon, linking to github.com.
- Verified with a DevTools-protocol screenshot script (1440px landing, 390px phone, and a real "Photoshop" search). **First attempt misleading:** plain `chrome --headless --screenshot` showed an empty hero (the capture ran before the animations finished) and a phone layout that looked wider than the screen (headless Chrome enforces a minimum window width). The DevTools script sets the viewport exactly and waits; it measured scrollWidth = 390 on the phone, so nothing overflows. The first proper screenshot also showed the torus ending in a hard line at the hero's edge; fixed with a fade mask.

## 2026-09-29: Monochrome, then trimming the landing page

- **Human decision:** the red-orange accent was removed; the app is fully monochrome. That also removed the red/amber/green status colours on results. Warnings (no license, unrecognized license) now stand out by being the brightest, boldest badge with a heavier border, and "setup unknown" uses a dashed border. The film-grain SVG made faintly coloured noise, so it now has a desaturate filter too.
- **Human decision:** removed the script tagline (and the Allura font), the "v1 beta" badge, the "Safety checks · coming soon" label, and the meta row under the nav.
- **Rule conflict, human decided:** the brief also asked to remove the "raw GitHub results, not yet checked for safety or fit" line. That line is currently the only caveat on results, because the safety filter and match labels aren't built yet. The human chose to keep it as one small uppercase label line instead of removing it.
- A blue-gray background showed inside the search input. It came from the browser's autofill styling, which a normal `background` can't override. It's now covered with an inset shadow in the bar's colour.

## 2026-09-29: "Get it running" panel on each result

- The human asked for a per-result panel that gets a non-developer from result to working tool: release downloads for their OS, package-manager and Docker commands from the README, and build-from-source steps. One primary action, the rest in expanders, copy buttons, and an "Unverified" tag on every download until the safety filter exists.
- **Human decisions before coding:** (1) the LLM fallback ("AI-summarized from README") is **deferred**. It conflicts with the recorded "Claude is used only for match judging" decision, so for now no detection shows "No easy install found, see README". (2) A hosted version counts only under a strict rule: the repo's own homepage field, linked in the README on a line with "demo", "try it", "web app" or "online".
- Code: `src/lib/setup.ts` (pure detection and ranking, used by server and browser), `github.ts` (README, root file list, and package.json/.nvmrc/.python-version when present, with a per-repo cache invalidated by a new push or after 1 hour, and a stop when fewer than 200 API calls are left), `SetupPanel.tsx`. Commands are copied verbatim from READMEs. Build steps come only from files in the repo, and there is no guessed start command: when none is visible it says "see README".
- Verified with a fixture script (`npx tsx`, nothing added to the project) and real searches: Photoshop, Notion, TeamViewer, Google Analytics (40 repos). An uncached search costs about 20 to 22 API calls (of 5,000/hour), and a repeat search costs 0.
- **Wrong on the first real run (the fixtures all passed):**
  - Package commands caught developer tooling: `brew install create-dmg` (Compositor), `npx inlang machine translate` (AppFlowy), `npm install -g @microsoft/rush` (Huly, where it was the *primary* action). Fix: a README command only counts if it names the repo or its owner. The same rule applies to `docker run` and piped scripts. The piped-script rule was added after RustDesk showed `curl … sh.rustup.rs | sh` (the Rust installer) as if it were RustDesk's.
  - Matomo (PHP) got `npm install` build steps from a tooling-only package.json. Fix: no build steps when the root shows a language we don't handle (composer.json, Gemfile, pom.xml, build.gradle, CMakeLists.txt, meson.build).
  - **Hosted links were paid products.** The only 2 hits of 40 were the company clouds (apitable → aitable.ai, Swetrix → swetrix.com). **Human decision:** a hosted version is never the primary action. It sits under "More ways to get it", labelled "Run by the project, may be a paid plan".
- **Known limitations, not fixed:**
  - RustDesk's "Run with Docker" is actually its build container, and it names the project, so the filter can't tell.
  - Docmost's `pnpm start` needs a build and a database first. The panel says to check the README, but that's all.
  - The Mac download defaults to Apple Silicon when there's no universal file, because the browser can't reliably tell Intel Macs apart. Other files sit in the dropdown.
  - This is now the third keyword heuristic that needed patching on real data (after search recall and installer labelling). Step 4 (Claude reading the README) could double-check the panel too.

## 2026-09-29: Security review, command allowlist, rate limit

- The human asked "is my app secure". The review found one real problem: README commands were matched by how they *start*, so `brew install coolapp && curl … && bash …`, `pip install coolapp; rm -rf ~`, `npx coolapp $(curl …)` and `sudo docker run --privileged -v /:/host …` were all shown as normal install commands with a copy button (verified with a script before fixing). Also: `/api/search` had no rate limit, so anyone could use up the GitHub quota.
- **Human decision: allowlist, not blocklist.** A README command is shown only if it fully matches a strict pattern (package name characters only, a few known flags). `docker run` only accepts listed flags and an image as the last token, so `--privileged`, `--pid=host`, `--network=host` etc. are rejected by default. Volumes may only mount inside the current folder (`./x`, `$PWD/x`) or a named volume. Absolute paths, `~`, `$HOME`, bare `$PWD` (often the home folder in a fresh terminal) and `..` are all rejected; that's stricter than asked ("/ or home"). Anything install-like that fails shows "See README for install steps" instead. Piped scripts are no longer shown as commands at all, only a warning that the README has one.
- Every command now carries "Unverified · from README" or "Unverified · from repo files" (build steps and Compose commands we write ourselves, so "from README" would be false).
- First real tests in the repo: `npm test` (node's test runner + tsx, 29 tests). They cover the four review attacks, newline and `\r\n` injection, a single `&`, backticks, redirects, zero-width characters, dangerous docker flags and mounts, and the legitimate commands that must still pass.
- Side effect: RustDesk's build-container `docker run` (logged as a known limitation earlier) is now rejected, because it mounts the bare `$PWD`.
- **Rate limit:** 10 searches/minute per IP in Upstash Redis (sliding window), because Vercel instances don't share memory. There's a 100-character query limit on both server and input box, and a 429 "We're busy right now. Try again in a minute." with a Retry-After header. Without Upstash configured, production refuses searches (503) rather than running unlimited, and development runs unlimited with a warning. A Redis error (e.g. wrong token) also refuses. A Redis *timeout* (5s) lets the search through, the library's default.
- **Not verified against real Upstash:** there were no credentials locally and no Docker for the local emulator. The route logic is tested with a stand-in limiter (11th request → 429, other IPs unaffected, long query refused before the limiter or GitHub is touched). It needs a live check after deploying.
- Per-repo cache capped at 1,000 entries (least recently used dropped).
- **Mistake (AI):** running `next build` while the human's `next dev` server was running stopped the dev server; it was restarted. Lesson: don't run a production build in the same folder as a running dev server without asking.
- Security headers deferred to a follow-up (human decision).
