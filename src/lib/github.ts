// Talks to the GitHub API. Runs on the server only, so the token never reaches the browser.

import { BoundedCache } from "./boundedCache";
import { readinessFromRelease, type Readiness } from "./readiness";
import {
  buildFromSource,
  composeCommand,
  downloadsFromRelease,
  hasFile,
  hostedUrlFrom,
  readmeCommands,
  readmeInstallCommands,
  type RepoFiles,
  type SetupInfo,
} from "./setup";

export type RepoResult = {
  name: string; // "owner/repo"
  url: string; // link to the repo on GitHub
  description: string | null;
  license: string | null; // SPDX id like "MIT", or null if GitHub found no license
  licenseName: string | null; // human-readable name like "MIT License"
  lastUpdated: string; // ISO date of the last push (code change), not metadata edits
  readiness: Readiness;
  setup: SetupInfo;
};

// The parts of GitHub's search response we use.
type GitHubRepo = {
  full_name: string;
  html_url: string;
  description: string | null;
  pushed_at: string;
  homepage: string | null;
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

// How many general (non-search) GitHub API calls we have left this hour, from the latest response.
// The limit is 5,000/hour with a token. Each new repo costs up to 6 calls.
let apiCallsLeft: number | null = null;
const KEEP_IN_RESERVE = 200;

async function githubGet(path: string, raw = false): Promise<Response> {
  const headers = githubHeaders();
  if (raw) headers.Accept = "application/vnd.github.raw+json";
  const response = await fetch(`https://api.github.com/repos/${path}`, { headers });
  const remaining = response.headers.get("x-ratelimit-remaining");
  if (remaining !== null) apiCallsLeft = Number(remaining);
  return response;
}

// A file's text, or null if it doesn't exist or can't be read.
async function fetchText(path: string): Promise<string | null> {
  const response = await githubGet(path, true);
  return response.ok ? response.text() : null;
}

type Release = { html_url: string; assets: { name: string; browser_download_url: string }[] };

// The repo's latest release (GitHub skips drafts and pre-releases here).
// null = no releases at all; "error" = we couldn't check.
async function fetchLatestRelease(fullName: string): Promise<Release | null | "error"> {
  const response = await githubGet(`${fullName}/releases/latest`);
  if (response.status === 404) return null;
  if (!response.ok) return "error";
  return response.json();
}

function readinessFor(release: Release | null | "error"): Readiness {
  if (release === "error") return { status: "unknown", platforms: [], releaseUrl: null };
  if (release === null) return readinessFromRelease([], null);
  return readinessFromRelease(
    release.assets.map((asset) => asset.name),
    release.html_url,
  );
}

async function fetchSetup(repo: GitHubRepo, release: Release | null | "error"): Promise<SetupInfo> {
  const fullName = repo.full_name;
  const unavailable: SetupInfo = {
    status: "unavailable",
    readmeUrl: `${repo.html_url}#readme`,
    hostedUrl: null,
    releaseUrl: null,
    downloads: [],
    packageCommands: [],
    dockerCommands: [],
    uncheckedReadmeSteps: false,
    readmeHasRemoteScript: false,
    buildFromSource: null,
  };
  if (apiCallsLeft !== null && apiCallsLeft < KEEP_IN_RESERVE) return unavailable;

  const [readme, contentsResponse] = await Promise.all([
    fetchText(`${fullName}/readme`),
    githubGet(`${fullName}/contents/`),
  ]);
  if (!contentsResponse.ok) return unavailable;
  const contents: { name: string; type: string }[] = await contentsResponse.json();
  const rootFiles = contents.filter((item) => item.type === "file").map((item) => item.name);

  // Only fetch these small files when the repo has them.
  const fetchIfPresent = (name: string) =>
    hasFile(rootFiles, name) ? fetchText(`${fullName}/contents/${name}`) : Promise.resolve(null);
  const [packageJsonText, nvmrc, pythonVersion] = await Promise.all([
    fetchIfPresent("package.json"),
    fetchIfPresent(".nvmrc"),
    fetchIfPresent(".python-version"),
  ]);
  let packageJson: RepoFiles["packageJson"] = null;
  try {
    packageJson = packageJsonText ? JSON.parse(packageJsonText) : null;
  } catch {
    // An unreadable package.json just means no version or start command.
  }

  const files: RepoFiles = {
    cloneUrl: `${repo.html_url}.git`,
    folderName: fullName.split("/")[1],
    rootFiles,
    packageJson,
    nvmrc,
    pythonVersion,
  };
  const fromReadme = readmeInstallCommands(readmeCommands(readme ?? ""), fullName);
  const compose = composeCommand(files);
  const releaseOk = release !== null && release !== "error";

  return {
    status: "ok",
    readmeUrl: `${repo.html_url}#readme`,
    hostedUrl: hostedUrlFrom(repo.homepage, readme ?? ""),
    releaseUrl: releaseOk ? release.html_url : null,
    downloads: releaseOk ? downloadsFromRelease(fullName, release.assets) : [],
    packageCommands: fromReadme.packageCommands,
    dockerCommands: [
      ...fromReadme.dockerRunCommands.map((command) => ({ command, source: "readme" as const })),
      ...(compose ? [compose] : []),
    ],
    uncheckedReadmeSteps: fromReadme.hasUncheckedSteps,
    readmeHasRemoteScript: fromReadme.hasRemoteScript,
    buildFromSource: buildFromSource(files),
  };
}

// Per-repo cache. A new push to the repo, or an hour passing, makes the entry stale.
// Capped so a long-running server's memory can't keep growing (each entry is a few KB).
const CACHE_HOURS = 1;
const MAX_CACHED_REPOS = 1000;
const cache = new BoundedCache<{
  pushedAt: string;
  fetchedAt: number;
  readiness: Readiness;
  setup: SetupInfo;
}>(MAX_CACHED_REPOS);

async function fetchDetails(repo: GitHubRepo): Promise<{ readiness: Readiness; setup: SetupInfo }> {
  const cached = cache.get(repo.full_name);
  if (
    cached &&
    cached.pushedAt === repo.pushed_at &&
    Date.now() - cached.fetchedAt < CACHE_HOURS * 60 * 60 * 1000
  ) {
    return cached;
  }
  const release = await fetchLatestRelease(repo.full_name);
  const details = { readiness: readinessFor(release), setup: await fetchSetup(repo, release) };
  // Don't cache a skipped lookup, so it's retried once the rate limit recovers.
  if (details.setup.status === "ok") {
    cache.set(repo.full_name, { pushedAt: repo.pushed_at, fetchedAt: Date.now(), ...details });
  }
  return details;
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
  // Look up every repo at the same time rather than one after another.
  const results = await Promise.all(
    data.items.map(async (repo) => ({
      name: repo.full_name,
      url: repo.html_url,
      description: repo.description,
      license: repo.license?.spdx_id ?? null,
      licenseName: repo.license?.name ?? null,
      lastUpdated: repo.pushed_at,
      ...(await fetchDetails(repo)),
    })),
  );
  console.log(`GitHub API calls left this hour: ${apiCallsLeft}`);
  return results;
}
