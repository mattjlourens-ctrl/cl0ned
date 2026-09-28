// Talks to the GitHub API. Runs on the server only, so the token never reaches the browser.

import { readinessFromRelease, type Readiness } from "./readiness";

export type RepoResult = {
  name: string; // "owner/repo"
  url: string; // link to the repo on GitHub
  description: string | null;
  license: string | null; // SPDX id like "MIT", or null if GitHub found no license
  licenseName: string | null; // human-readable name like "MIT License"
  lastUpdated: string; // ISO date of the last push (code change), not metadata edits
  readiness: Readiness;
};

// The parts of GitHub's search response we use.
type GitHubRepo = {
  full_name: string;
  html_url: string;
  description: string | null;
  pushed_at: string;
  license: { spdx_id: string; name: string } | null;
};

const MAX_RESULTS = 10;

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

// Looks at the repo's latest release (GitHub skips drafts and pre-releases here).
async function fetchReadiness(fullName: string): Promise<Readiness> {
  const response = await fetch(`https://api.github.com/repos/${fullName}/releases/latest`, {
    headers: githubHeaders(),
  });
  if (response.status === 404) {
    // No releases at all.
    return readinessFromRelease([], null);
  }
  if (!response.ok) {
    return { status: "unknown", platforms: [], releaseUrl: null };
  }
  const release: { html_url: string; assets: { name: string }[] } = await response.json();
  return readinessFromRelease(
    release.assets.map((asset) => asset.name),
    release.html_url,
  );
}

export async function searchRepos(toolName: string): Promise<RepoResult[]> {
  // "alternative" steers search toward replacements rather than plugins or scripts for the tool.
  const query = `${toolName} alternative`;
  const url =
    "https://api.github.com/search/repositories" +
    `?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${MAX_RESULTS}`;

  const response = await fetch(url, { headers: githubHeaders() });
  // Limit is 30/minute with a token, 10/minute without, so this also shows whether the token is in use.
  console.log(
    `GitHub search rate limit: ${response.headers.get("x-ratelimit-remaining")}` +
      ` of ${response.headers.get("x-ratelimit-limit")} left`,
  );
  if (!response.ok) {
    throw new Error(`GitHub search failed: ${response.status} ${response.statusText}`);
  }

  const data: { items: GitHubRepo[] } = await response.json();
  // Check every repo's releases at the same time rather than one after another.
  return Promise.all(
    data.items.map(async (repo) => ({
      name: repo.full_name,
      url: repo.html_url,
      description: repo.description,
      license: repo.license?.spdx_id ?? null,
      licenseName: repo.license?.name ?? null,
      lastUpdated: repo.pushed_at,
      readiness: await fetchReadiness(repo.full_name),
    })),
  );
}
