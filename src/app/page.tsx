"use client";

import { useState } from "react";
import { motion, MotionConfig } from "motion/react";
import type { RepoResult } from "@/lib/github";
import type { Readiness } from "@/lib/readiness";
import { osFromUserAgent } from "@/lib/setup";
import SetupPanel from "./SetupPanel";
import WireTorus from "./WireTorus";
import styles from "./page.module.css";

// Real open-source projects, shown as decoration in the footer. Not search results.
const EXAMPLE_PROJECTS = ["GIMP", "Blender", "Inkscape", "LibreOffice", "Krita", "AppFlowy", "Penpot"];

// Entrance animation: fade in while rising slightly. `delay` staggers the pieces.
function fadeRise(delay: number) {
  return {
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] as const },
  };
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

// GitHub uses "NOASSERTION" when a repo has a license file it can't identify.
function describeLicense(result: RepoResult): { badge: string; text: string; flagged: boolean } {
  if (result.license === null) {
    return {
      badge: "No license",
      text: "No license found. Not confirmed as open source.",
      flagged: true,
    };
  }
  if (result.license === "NOASSERTION") {
    return {
      badge: "Unrecognized license",
      text: "Unrecognized license. Check the repo before using.",
      flagged: true,
    };
  }
  return { badge: result.license, text: result.licenseName ?? result.license, flagged: false };
}

// Short badge text and colour for the readiness label. The full sentence is in ReadinessLabel.
function readinessBadge(readiness: Readiness): { text: string; className: string } {
  if (readiness.status === "installer") {
    const platforms =
      readiness.platforms.length > 0 ? readiness.platforms.join(", ") : "platform not stated";
    return { text: `Installer · ${platforms}`, className: styles.badgeInstaller };
  }
  if (readiness.status === "needs-setup") {
    return { text: "Needs setup", className: "" };
  }
  return { text: "Setup unknown", className: styles.badgeUnknown };
}

// Tells the user honestly how much work it takes to start using the repo. We never install anything for them.
function ReadinessLabel({ readiness }: { readiness: Readiness }) {
  if (readiness.status === "installer") {
    return (
      <p>
        <strong>Installer available</strong> (
        {readiness.platforms.length > 0 ? readiness.platforms.join(", ") : "platform not stated"}).
        Download it from the{" "}
        <a href={readiness.releaseUrl ?? undefined} target="_blank" rel="noopener noreferrer">
          latest release
        </a>{" "}
        and install it yourself.
      </p>
    );
  }
  if (readiness.status === "needs-setup") {
    return (
      <p>
        <strong>Needs setup.</strong> No installer download found. You&apos;ll have to follow the
        repo&apos;s instructions to build or run it yourself.
      </p>
    );
  }
  return (
    <p>
      <strong>Setup unknown.</strong> We couldn&apos;t check for an installer. See the repo for how
      to get it.
    </p>
  );
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [searchedFor, setSearchedFor] = useState<string | null>(null);
  const [results, setResults] = useState<RepoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The visitor's OS picks which download or install command to show first.
  // Only used after a search, so the server render (no navigator) never shows it.
  const [os] = useState(() =>
    typeof navigator === "undefined" ? null : osFromUserAgent(navigator.userAgent),
  );

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed === "") return;

    setLoading(true);
    setError(null);
    setResults([]);
    setSearchedFor(trimmed);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Search failed.");
      } else {
        setResults(data.results);
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    // reducedMotion="user": entrance animations are skipped for people who ask for less motion.
    <MotionConfig reducedMotion="user">
      <div className={styles.page}>
        <div className={styles.glow} aria-hidden="true" />

        <nav className={styles.nav}>
          <div className={styles.navRow}>
            <a href="#" className={styles.brand}>
              <span className={styles.logoMark} aria-hidden="true" />
              cl0ned
            </a>
            <div className={styles.navLinks}>
              <a href="#search">Search</a>
              <a href="#results">Results</a>
              <a href="https://github.com" target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
            </div>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.navIcon}
              aria-label="GitHub"
            >
              <GitHubIcon />
            </a>
          </div>
        </nav>

        <header className={styles.hero}>
          <WireTorus className={styles.torus} />
          <ul className={styles.heroLabels}>
            <li>Open-source discovery</li>
            <li>License shown</li>
          </ul>
          <div className={styles.wordmarkWrap}>
            <motion.h1 className={styles.wordmark} {...fadeRise(0)}>
              cl0ned
            </motion.h1>
          </div>
        </header>

        <motion.section id="search" className={styles.searchRow} {...fadeRise(0.4)}>
          <p className={styles.intro}>
            Find free, open-source alternatives to the subscriptions you already pay for.
          </p>

          <form onSubmit={handleSubmit} className={styles.form}>
            <label htmlFor="tool" className={styles.srOnly}>
              Paid tool name
            </label>
            <input
              id="tool"
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="What do you pay for? Try Notion, Photoshop, Grammarly…"
              className={styles.input}
            />
            <button
              type="submit"
              className={styles.button}
              disabled={loading}
              aria-label="Search"
            >
              {loading ? "…" : "→"}
            </button>
          </form>

          {/* Honest "proof" cluster: what every result shows, not a made-up count. */}
          <div className={styles.proof}>
            <div className={styles.proofDots} aria-hidden="true">
              <span>MIT</span>
              <span>GPL</span>
              <span>BSD</span>
            </div>
            <p>
              Live GitHub search.
              <br />
              License on every result.
            </p>
          </div>
        </motion.section>

        <section id="results" className={styles.resultsSection} aria-live="polite">
          {loading && <p className={styles.empty}>Searching GitHub for &ldquo;{searchedFor}&rdquo;…</p>}

          {error !== null && <p className={styles.error}>{error}</p>}

          {!loading && error === null && searchedFor !== null && results.length === 0 && (
            <p className={styles.empty}>No GitHub repositories found for &ldquo;{searchedFor}&rdquo;.</p>
          )}

          {results.length > 0 && (
            // Kept on purpose: until the safety filter and match labels exist, this is the only
            // caveat that these results are unchecked.
            <p className={styles.notice}>
              Unfiltered GitHub results · not yet checked for safety or fit
            </p>
          )}

          <ul className={styles.results}>
            {results.map((result) => {
              const license = describeLicense(result);
              const readiness = readinessBadge(result.readiness);
              return (
                <li key={result.url} className={styles.card}>
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.repoName}
                  >
                    {result.name}
                  </a>
                  {result.description && <p className={styles.description}>{result.description}</p>}

                  <div className={styles.badges}>
                    <span className={`${styles.badge} ${license.flagged ? styles.badgeFlag : ""}`}>
                      {license.badge}
                    </span>
                    <span className={`${styles.badge} ${readiness.className}`}>{readiness.text}</span>
                  </div>

                  <div className={styles.details}>
                    <p className={license.flagged ? styles.flag : undefined}>License: {license.text}</p>
                    <ReadinessLabel readiness={result.readiness} />
                    <p>Last code update: {formatDate(result.lastUpdated)}</p>
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.githubLink}
                    >
                      View on GitHub →
                    </a>
                  </div>

                  <SetupPanel setup={result.setup} os={os} />
                </li>
              );
            })}
          </ul>
        </section>

        <footer className={styles.footer}>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.navIcon}
            aria-label="GitHub"
          >
            <GitHubIcon />
          </a>
          <span className={styles.footerLabel}>Open source, for example</span>
          <ul className={styles.projectNames}>
            {EXAMPLE_PROJECTS.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </footer>
      </div>
    </MotionConfig>
  );
}
