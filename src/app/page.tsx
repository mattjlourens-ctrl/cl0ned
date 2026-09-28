"use client";

import { useState } from "react";
import type { RepoResult } from "@/lib/github";
import type { Readiness } from "@/lib/readiness";
import styles from "./page.module.css";

// GitHub uses "NOASSERTION" when a repo has a license file it can't identify.
function describeLicense(result: RepoResult): { text: string; flagged: boolean } {
  if (result.license === null) {
    return { text: "No license found. Not confirmed as open source.", flagged: true };
  }
  if (result.license === "NOASSERTION") {
    return { text: "Unrecognized license. Check the repo before using.", flagged: true };
  }
  return { text: result.licenseName ?? result.license, flagged: false };
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
    <main className={styles.main}>
      <h1>cl0ned</h1>
      <p className={styles.intro}>
        Type the name of a paid tool you use. We&apos;ll look for open-source alternatives on GitHub.
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
          placeholder="e.g. Photoshop"
          className={styles.input}
        />
        <button type="submit" className={styles.button} disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      <section aria-live="polite">
        {error !== null && <p className={styles.error}>{error}</p>}

        {!loading && error === null && searchedFor !== null && results.length === 0 && (
          <p className={styles.empty}>No GitHub repositories found for &ldquo;{searchedFor}&rdquo;.</p>
        )}

        {results.length > 0 && (
          <p className={styles.notice}>
            These are raw GitHub search results. They have not yet been checked for safety or for
            whether they really replace {searchedFor}.
          </p>
        )}

        <ul className={styles.results}>
          {results.map((result) => {
            const license = describeLicense(result);
            return (
              <li key={result.url} className={styles.card}>
                <a href={result.url} target="_blank" rel="noopener noreferrer">
                  {result.name}
                </a>
                {result.description && <p>{result.description}</p>}
                <p className={license.flagged ? styles.flag : undefined}>License: {license.text}</p>
                <ReadinessLabel readiness={result.readiness} />
                <p>Last code update: {formatDate(result.lastUpdated)}</p>
                <a href={result.url} target="_blank" rel="noopener noreferrer">
                  View on GitHub: {result.url}
                </a>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
