// Talks to the GitHub search API. Runs on the server only, so the token never reaches the browser.

export type RepoResult = {
  name: string; // "owner/repo"
  url: string; // link to the repo on GitHub
  description: string | null;
  license: string | null; // SPDX id like "MIT", or null if GitHub found no license
  licenseName: string | null; // human-readable name like "MIT License"
  lastUpdated: string; // ISO date of the last push (code change), not metadata edits
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

export async function searchRepos(toolName: string): Promise<RepoResult[]> {
  // "alternative" steers search toward replacements rather than plugins or scripts for the tool.
  const query = `${toolName} alternative`;
  const url =
    "https://api.github.com/search/repositories" +
    `?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${MAX_RESULTS}`;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub search failed: ${response.status} ${response.statusText}`);
  }

  const data: { items: GitHubRepo[] } = await response.json();
  return data.items.map((repo) => ({
    name: repo.full_name,
    url: repo.html_url,
    description: repo.description,
    license: repo.license?.spdx_id ?? null,
    licenseName: repo.license?.name ?? null,
    lastUpdated: repo.pushed_at,
  }));
}
