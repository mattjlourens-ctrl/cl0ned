// Works out how a non-developer can get a repo running, from data we fetched from GitHub.
// Everything here is deterministic: commands are copied exactly as the README writes them,
// and build steps are only suggested for files that really exist in the repo.
// Pure functions only, so this file is used by both the server and the browser.

import { installerPlatforms } from "./readiness";

export type OS = "Mac" | "Windows" | "Linux";

export type Download = {
  platform: string; // "Mac", "Windows", "Linux", "Android", or "Other" when the file name doesn't say
  fileName: string;
  url: string; // always a file in this repo's own GitHub Releases
};

export type PackageCommand = {
  manager: string; // "Homebrew", "winget", "npm", …
  command: string;
  platforms: OS[] | "any";
};

export type DockerCommand = {
  command: string;
  source: "readme" | "compose-file";
};

export type Prerequisite = { name: string; version: string | null; url: string };
export type BuildStep = { label: string; command: string | null };
export type BuildFromSource = { prerequisites: Prerequisite[]; steps: BuildStep[] };

export type SetupInfo = {
  // "unavailable": we skipped or failed the extra GitHub calls, so we know nothing about setup.
  status: "ok" | "unavailable";
  readmeUrl: string;
  hostedUrl: string | null;
  releaseUrl: string | null;
  downloads: Download[];
  packageCommands: PackageCommand[];
  dockerCommands: DockerCommand[];
  pipedScripts: string[]; // "curl … | sh" style commands. Never shown as the main option.
  buildFromSource: BuildFromSource | null;
};

// ---------- Release downloads ----------

// Preferred files first: installers over archives, and the most common CPU for each platform.
function downloadScore(download: Download): number {
  const name = download.fileName.toLowerCase();
  let score = 0;
  if (/\.(dmg|exe|appimage)$/.test(name)) score += 4;
  else if (/\.(pkg|msi|deb)$/.test(name)) score += 3;
  else if (/\.rpm$/.test(name)) score += 2;
  if (name.includes("universal")) score += 2;
  if (download.platform === "Mac" && /arm64|aarch64|apple/.test(name)) score += 1;
  if (download.platform !== "Mac" && /x64|x86_64|amd64|win64/.test(name)) score += 1;
  if (/arm|aarch64|ia32|i386|win32/.test(name) && download.platform !== "Mac") score -= 1;
  return score;
}

export function downloadsFromRelease(
  fullName: string,
  assets: { name: string; browser_download_url: string }[],
): Download[] {
  // Only files hosted by this repo's own releases, never links to other sites.
  const ownPrefix = `https://github.com/${fullName}/releases/download/`.toLowerCase();
  const downloads: Download[] = [];
  for (const asset of assets) {
    if (!asset.browser_download_url.toLowerCase().startsWith(ownPrefix)) continue;
    const platforms = installerPlatforms(asset.name);
    if (platforms === null) continue;
    for (const platform of platforms.length > 0 ? platforms : ["Other"]) {
      downloads.push({ platform, fileName: asset.name, url: asset.browser_download_url });
    }
  }
  return downloads.sort((a, b) => downloadScore(b) - downloadScore(a));
}

// ---------- README parsing ----------

// Commands in fenced code blocks and `inline code`, with "\" line continuations kept together.
export function readmeCommands(readme: string): string[] {
  const commands: string[] = [];
  const add = (text: string) => {
    const command = text.trim().replace(/^\$\s+/, "");
    if (command !== "" && !command.startsWith("#") && !commands.includes(command)) {
      commands.push(command);
    }
  };

  const fenced = /```[^\n]*\n([\s\S]*?)```/g;
  for (const match of readme.matchAll(fenced)) {
    let current = "";
    for (const line of match[1].split("\n")) {
      current += current === "" ? line.trim() : "\n  " + line.trim();
      if (!line.trimEnd().endsWith("\\")) {
        add(current);
        current = "";
      }
    }
    add(current);
  }

  const withoutFenced = readme.replace(fenced, "");
  for (const match of withoutFenced.matchAll(/`([^`\n]+)`/g)) {
    add(match[1]);
  }
  return commands;
}

// "curl … | sh", "wget … | sudo bash", "iwr … | iex": these run a remote script without showing it.
export function isPipedScript(command: string): boolean {
  return (
    /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(-\S+\s+)*(ba|z|da)?sh\b/i.test(command) ||
    /\b(iwr|irm|invoke-webrequest|invoke-restmethod)\b[^|]*\|\s*(iex|invoke-expression)\b/i.test(command)
  );
}

const PACKAGE_PATTERNS: { manager: string; pattern: RegExp; platforms: OS[] | "any" }[] = [
  { manager: "Homebrew", pattern: /^brew install\s/, platforms: ["Mac"] },
  { manager: "winget", pattern: /^winget install\s/, platforms: ["Windows"] },
  { manager: "Snap", pattern: /^(sudo\s+)?snap install\s/, platforms: ["Linux"] },
  { manager: "Flatpak", pattern: /^(sudo\s+)?flatpak install\s/, platforms: ["Linux"] },
  // Only global installs and npx: a plain "npm install" is a developer adding a library.
  { manager: "npm", pattern: /^(npm (install|i) (-g|--global)\s|npx\s+\S)/, platforms: "any" },
  // Excludes "pip install -r requirements.txt", "pip install -e ." and "pip install ." (developer setup).
  { manager: "pip", pattern: /^(pipx install\s|pip3? install\s+(?!-r\b|-e\b|\.))/, platforms: "any" },
];

// READMEs also show commands for developer tools ("brew install create-dmg", "npm install -g
// @microsoft/rush", "docker run postgres"). A command only counts if it names the project itself:
// the repo's name or its owner, compared ignoring case and punctuation.
export function namesProject(command: string, fullName: string): boolean {
  const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
  const text = squash(command);
  return fullName
    .split("/")
    .map(squash)
    .some((name) => name.length >= 3 && text.includes(name));
}

export function packageCommandsFrom(commands: string[], fullName: string): PackageCommand[] {
  const found: PackageCommand[] = [];
  for (const command of commands) {
    if (isPipedScript(command) || command.includes("\n") || !namesProject(command, fullName)) continue;
    const match = PACKAGE_PATTERNS.find(({ pattern }) => pattern.test(command));
    if (match) found.push({ manager: match.manager, command, platforms: match.platforms });
  }
  return found;
}

export function dockerRunCommandsFrom(commands: string[], fullName: string): string[] {
  return commands.filter(
    (command) =>
      /^(sudo\s+)?docker run\s/.test(command) &&
      !isPipedScript(command) &&
      namesProject(command, fullName),
  );
}

// Normalises a URL so "https://www.app.com/" and "http://app.com" compare equal.
function normaliseUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

const HOSTED_WORDS = /\b(demo|try it|web ?app|online)\b/i;

// Strict rule: the repo's own homepage counts as a hosted app only if the README links to it
// with words like "demo", "try it", "web app" or "online" on the same line.
export function hostedUrlFrom(homepage: string | null, readme: string): string | null {
  if (!homepage || !/^https?:\/\//i.test(homepage)) return null;
  const target = normaliseUrl(homepage);
  if (target.startsWith("github.com")) return null;

  for (const line of readme.split("\n")) {
    const urls = line.match(/https?:\/\/[^\s)"'<>\]]+/g) ?? [];
    if (urls.some((url) => normaliseUrl(url) === target) && HOSTED_WORDS.test(line)) {
      return homepage;
    }
  }
  return null;
}

// ---------- Build from source ----------

export type RepoFiles = {
  cloneUrl: string;
  folderName: string;
  rootFiles: string[]; // names of files in the repo's top folder
  packageJson: { engines?: { node?: string }; scripts?: Record<string, string> } | null;
  nvmrc: string | null;
  pythonVersion: string | null;
};

// Signs the project is mainly written in a language we don't make build steps for. A package.json
// in such a repo is usually just for developer tooling (e.g. Matomo is PHP), so we don't guess.
const UNSUPPORTED_BUILD_FILES = [
  "composer.json",
  "Gemfile",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "CMakeLists.txt",
  "meson.build",
];

const COMPOSE_FILES = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];

export function hasFile(rootFiles: string[], name: string): boolean {
  return rootFiles.some((file) => file.toLowerCase() === name.toLowerCase());
}

export function composeCommand(files: RepoFiles): DockerCommand | null {
  if (!COMPOSE_FILES.some((name) => hasFile(files.rootFiles, name))) return null;
  return {
    command: `git clone ${files.cloneUrl}\ncd ${files.folderName}\ndocker compose up -d`,
    source: "compose-file",
  };
}

// Steps for the main language only. We never guess a start command we can't see in the repo.
export function buildFromSource(files: RepoFiles): BuildFromSource | null {
  const { rootFiles, packageJson } = files;
  if (UNSUPPORTED_BUILD_FILES.some((name) => hasFile(rootFiles, name))) return null;
  const prerequisites: Prerequisite[] = [
    { name: "Git", version: null, url: "https://git-scm.com/downloads" },
  ];
  const steps: BuildStep[] = [
    { label: "Download the code", command: `git clone ${files.cloneUrl}` },
    { label: "Go into the project folder", command: `cd ${files.folderName}` },
  ];
  // No start command we can see in the repo, so the UI points to the README instead of guessing.
  const readmeStep: BuildStep = { label: "Start it", command: null };

  if (hasFile(rootFiles, "package.json")) {
    const nodeVersion = packageJson?.engines?.node ?? files.nvmrc?.trim() ?? null;
    prerequisites.push({ name: "Node.js", version: nodeVersion, url: "https://nodejs.org/en/download" });
    let tool = "npm";
    if (hasFile(rootFiles, "pnpm-lock.yaml")) {
      tool = "pnpm";
      prerequisites.push({ name: "pnpm", version: null, url: "https://pnpm.io/installation" });
    } else if (hasFile(rootFiles, "yarn.lock")) {
      tool = "yarn";
      prerequisites.push({ name: "Yarn", version: null, url: "https://yarnpkg.com/getting-started/install" });
    }
    steps.push({ label: "Install what it depends on", command: `${tool} install` });
    const scripts = packageJson?.scripts ?? {};
    if (scripts.start) steps.push({ label: "Start it", command: `${tool} start` });
    else if (scripts.dev) steps.push({ label: "Start it", command: tool === "npm" ? "npm run dev" : `${tool} dev` });
    else steps.push(readmeStep);
  } else if (hasFile(rootFiles, "requirements.txt") || hasFile(rootFiles, "pyproject.toml")) {
    prerequisites.push({
      name: "Python",
      version: files.pythonVersion?.trim() ?? null,
      url: "https://www.python.org/downloads/",
    });
    steps.push({
      label: "Install what it depends on",
      command: hasFile(rootFiles, "requirements.txt") ? "pip install -r requirements.txt" : "pip install .",
    });
    steps.push(readmeStep);
  } else if (hasFile(rootFiles, "Cargo.toml")) {
    prerequisites.push({ name: "Rust", version: null, url: "https://www.rust-lang.org/tools/install" });
    steps.push({ label: "Build and start it", command: "cargo run --release" });
  } else if (hasFile(rootFiles, "go.mod")) {
    prerequisites.push({ name: "Go", version: null, url: "https://go.dev/dl/" });
    steps.push({ label: "Build it", command: "go build ./..." });
    steps.push(readmeStep);
  } else {
    return null;
  }
  return { prerequisites, steps };
}

// ---------- Ranking for the user's OS ----------

export type SetupOption =
  | { kind: "hosted"; url: string }
  | { kind: "download"; platform: string; files: Download[] }
  | { kind: "package"; command: PackageCommand }
  | { kind: "docker"; command: DockerCommand };

function fitsOS(command: PackageCommand, os: OS | null): boolean {
  return command.platforms === "any" || (os !== null && command.platforms.includes(os));
}

// Easiest first: download for this OS, package manager for this OS, Docker.
// Everything else (hosted version, other platforms, other OS commands) goes in "others".
// A hosted version is never the main action: on real results it was the company's paid cloud
// product (e.g. apitable → aitable.ai), which is what the user is trying to avoid.
export function rankOptions(
  setup: SetupInfo,
  os: OS | null,
): { primary: SetupOption | null; others: SetupOption[] } {
  const ranked: SetupOption[] = [];
  const rest: SetupOption[] = [];

  if (setup.hostedUrl) rest.push({ kind: "hosted", url: setup.hostedUrl });

  const platforms = [...new Set(setup.downloads.map((download) => download.platform))];
  for (const platform of platforms) {
    const option: SetupOption = {
      kind: "download",
      platform,
      files: setup.downloads.filter((download) => download.platform === platform),
    };
    (platform === os ? ranked : rest).push(option);
  }

  for (const command of setup.packageCommands) {
    (fitsOS(command, os) ? ranked : rest).push({ kind: "package", command });
  }
  for (const command of setup.dockerCommands) ranked.push({ kind: "docker", command });

  const [primary = null, ...others] = ranked;
  return { primary, others: [...others, ...rest] };
}

export function osFromUserAgent(userAgent: string): OS | null {
  if (/android|iphone|ipad/i.test(userAgent)) return null;
  if (/mac os|macintosh/i.test(userAgent)) return "Mac";
  if (/windows/i.test(userAgent)) return "Windows";
  if (/linux|x11/i.test(userAgent)) return "Linux";
  return null;
}
