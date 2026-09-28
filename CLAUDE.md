# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes, followed by project-specific instructions.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

---

# Part 1: Behavioral Guidelines

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

# Part 2: Project Instructions

## What this project is

A web app that helps people avoid paying for software that has a free open-source equivalent.

The user types the name of a paid tool they use. The app searches open-source sources for real replacements, runs a safety check on what it finds, reads each candidate's license, and shows the user the GitHub repo.

This is the **discovery layer only**. The app finds and points. It does not host, deploy, install, or run anything for the user.

## v1 scope (build only this)

**Core flow:**
1. User enters the name of a tool (e.g. "Photoshop").
2. App searches its sources for open-source candidates.
3. Each candidate goes through a safety filter.
4. App reads and displays each candidate's license.
5. App shows the surviving candidates with a link to the GitHub repo.

**Each result shows at minimum:**
- Repo name and link
- License
- Last update date
- Result of the safety check (what passed, what was flagged)

## Non-goals for v1

Do not build any of the following unless explicitly asked:
- Deploying, hosting, or installing software for users
- User accounts, logins, or saved history
- Reading bank, email, or statement data
- Savings calculators or cost totals
- Ratings, reviews, or community features
- Support for sources beyond the ones agreed on below

## Hard rules

- **Never invent alternatives.** Every result must come from a real search result or database entry. If nothing is found, say so. Do not fill the gap from model memory.
- **Never claim a repo is "safe."** The safety filter reduces risk, it does not guarantee it. UI copy should say what was checked (e.g. "passed basic checks"), never that the code is safe or verified.
- **Always show the license.** Never present a repo as "free" without showing its license. Open source, source-available, and free-for-personal-use are different things. If the license is missing or unrecognized, flag it clearly instead of guessing.
- **Link out, don't host.** Send users to the official repo. Never copy or serve third-party code from this app.
- **Say when a match is weak.** A repo that is merely related to the tool is not a replacement. Don't present loose matches as equivalents.

## Open decisions (ask before assuming)

These have not been decided. Do not pick silently. Propose options and ask.

- **Sources:** GitHub only at first, or others (GitLab, Codeberg, project sites)?
- **Search approach:** live search on each query, or a pre-built index?
- **What counts as a match:** how a repo is judged to be a real replacement for a paid product.
- **Safety filter signals:** which checks to run, and what causes a repo to be flagged or removed.
- **Target user:** non-technical people who want something that works, or people comfortable running code from a repo? This affects how results are filtered (many repos are libraries, not usable products).
- **Tech stack:** language, framework, and how LLM calls are used.

## How to work in this repo

- Build the narrowest working version of the core flow first, then stop and check with the user before adding anything.
- When adding a step of the flow, state how it will be verified (a test, or a concrete query and its expected result).
- Prefer plain, readable code over clever code. The user is learning and may read this later.
- Keep a short running note in `BUILD_LOG.md` of anything that was hard, wrong on the first try, or needed a human decision. This is an experiment in how far AI-assisted building can go, and that log is part of the result.
