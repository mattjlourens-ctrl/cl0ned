"use client";

import { useState } from "react";
import type { RepoResult } from "@/lib/github";
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
                <p>Last code update: {formatDate(result.lastUpdated)}</p>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
