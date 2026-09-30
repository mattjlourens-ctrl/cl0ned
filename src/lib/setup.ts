// Works out how a non-developer can get a repo running, from data we fetched from GitHub.
// Everything here is deterministic: README commands are only shown if they fully match a strict
// allowlist, and build steps are only suggested for files that really exist in the repo.
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
  // The README has install steps we didn't accept (see the allowlist below), so point to it.
  uncheckedReadmeSteps: boolean;
  // One of those runs a remote script ("curl … | sh"). Never shown as a command.
  readmeHasRemoteScript: boolean;
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

// ---------- Allowlist for README commands ----------
//
// A README command is only shown if it FULLY matches one of the strict patterns below. Anything
// else (extra "&& …", "; …", "$(…)", pipes, redirects, newlines, unknown flags) is not shown,
// and the panel points to the README instead. We copy commands to the user's clipboard, so a
// command that does more than install the project must never get through.

// A package name: letters, digits and @ / . _ -, starting with a letter, digit or @ (not "-", so
// it can't be an option, and not "." or "/", so it can't be a local file).
const PACKAGE_NAME = "[A-Za-z0-9@][A-Za-z0-9@/._-]*";
// Same, without "@" and "/" (winget ids, flatpak ids, pip and snap names).
const PLAIN_NAME = "[A-Za-z0-9][A-Za-z0-9._-]*";

const PACKAGE_PATTERNS: { manager: string; pattern: RegExp; platforms: OS[] | "any" }[] = [
  { manager: "Homebrew", pattern: new RegExp(`^brew install (--cask )?${PACKAGE_NAME}$`), platforms: ["Mac"] },
  {
    manager: "winget",
    pattern: new RegExp(`^winget install( (-e|--exact|--id))* ${PLAIN_NAME}$`),
    platforms: ["Windows"],
  },
  { manager: "Snap", pattern: new RegExp(`^(sudo )?snap install ${PLAIN_NAME}( --classic)?$`), platforms: ["Linux"] },
  {
    manager: "Flatpak",
    pattern: new RegExp(`^(sudo )?flatpak install( -y)?( flathub)? ${PLAIN_NAME}$`),
    platforms: ["Linux"],
  },
  // Only global installs and npx: a plain "npm install" is a developer adding a library.
  { manager: "npm", pattern: new RegExp(`^npm (i|install) (-g|--global) ${PACKAGE_NAME}$`), platforms: "any" },
  { manager: "npm", pattern: new RegExp(`^npx( -y| --yes)? ${PACKAGE_NAME}$`), platforms: "any" },
  // The name can't start with "-" or ".", so "pip install -r …", "-e ." and "." never match.
  {
    manager: "pip",
    pattern: new RegExp(`^(pipx install|pip3? install( --user| -U| --upgrade)?) ${PLAIN_NAME}$`),
    platforms: "any",
  },
];

// Newlines, tabs and other control characters (incl. \r) are never allowed in a command.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export function strictPackageCommand(command: string): PackageCommand | null {
  if (CONTROL_CHARACTERS.test(command)) return null;
  const match = PACKAGE_PATTERNS.find(({ pattern }) => pattern.test(command));
  return match ? { manager: match.manager, command, platforms: match.platforms } : null;
}

// docker run: every flag must be on this list, with a value of the expected shape.
// Anything not listed (--privileged, --pid=host, --network=host, --cap-add, --device, …) is rejected.
const DOCKER_FLAGS_WITHOUT_VALUE = ["-d", "--detach", "-i", "-t", "-it", "-ti", "--rm", "--init"];
const DOCKER_FLAG_VALUES: Record<string, RegExp> = {
  "-p": /^(\d{1,3}(\.\d{1,3}){3}:)?\d{1,5}(:\d{1,5})?(\/(tcp|udp))?$/,
  "--name": /^[A-Za-z0-9][A-Za-z0-9_.-]*$/,
  "-e": /^[A-Za-z_][A-Za-z0-9_]*(=[A-Za-z0-9_.:/@-]*)?$/,
  "-v": /^.+$/, // checked separately by safeVolume
  "--restart": /^(no|always|unless-stopped|on-failure(:\d+)?)$/,
  "--pull": /^(always|missing|never)$/,
  "--platform": /^linux\/[a-z0-9]+(\/[a-z0-9]+)?$/,
};
const DOCKER_FLAG_ALIASES: Record<string, string> = { "--publish": "-p", "--env": "-e", "--volume": "-v" };
const DOCKER_IMAGE = /^[a-z0-9][a-z0-9._/-]*(:[A-Za-z0-9._-]+)?(@sha256:[a-f0-9]{64})?$/;

// A volume may only mount a folder *inside* the current folder ("./data", "$PWD/data") or a
// named Docker volume ("pgdata"). Never an absolute host path ("/", "/home", "/var/run/docker.sock"),
// the home folder ("~", "$HOME"), the bare current folder (often the home folder in a fresh
// terminal), or anything with ".." (which can climb back up to them).
export function safeVolume(value: string): boolean {
  const match = value.match(/^([^:]+):(\/[A-Za-z0-9_./-]*)(:(ro|rw))?$/);
  if (!match) return false;
  const source = match[1];
  if (source.split("/").includes("..")) return false;
  return (
    /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(source) ||
    /^(\.|\$PWD|\$\{PWD\})\/[A-Za-z0-9_.-][A-Za-z0-9_./-]*$/.test(source)
  );
}

// Returns the command as a single line (continuation "\" joined) if it's allowed, else null.
export function strictDockerRun(command: string): string | null {
  const oneLine = command.replace(/[ \t]*\\\n[ \t]*/g, " ").replace(/[ \t]+/g, " ").trim();
  if (CONTROL_CHARACTERS.test(oneLine)) return null;

  const tokens = oneLine.split(" ");
  let i = tokens[0] === "sudo" ? 1 : 0;
  if (tokens[i] !== "docker" || tokens[i + 1] !== "run") return null;
  i += 2;

  while (i < tokens.length - 1) {
    const token = tokens[i];
    if (DOCKER_FLAGS_WITHOUT_VALUE.includes(token)) {
      i += 1;
      continue;
    }
    // Accept both "--name x" and "--name=x".
    const [rawFlag, inlineValue] = token.includes("=") && token.startsWith("--")
      ? [token.slice(0, token.indexOf("=")), token.slice(token.indexOf("=") + 1)]
      : [token, undefined];
    const flag = DOCKER_FLAG_ALIASES[rawFlag] ?? rawFlag;
    const valuePattern = DOCKER_FLAG_VALUES[flag];
    if (!valuePattern) return null;
    const value = inlineValue ?? tokens[i + 1];
    if (value === undefined || !valuePattern.test(value)) return null;
    if (flag === "-v" && !safeVolume(value)) return null;
    i += inlineValue === undefined ? 2 : 1;
  }

  // The image must be the very last token: no container command or arguments after it.
  if (i !== tokens.length - 1 || !DOCKER_IMAGE.test(tokens[i])) return null;
  return oneLine;
}

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

// Commands that look like installing or running something, whether or not we accept them.
const LOOKS_LIKE_INSTALL =
  /^(sudo\s+)?(brew|winget|snap|flatpak|npm|npx|pipx?|pip3|docker|docker-compose|curl|wget|iwr|irm)\b/i;

export type ReadmeInstallCommands = {
  packageCommands: PackageCommand[];
  dockerRunCommands: string[];
  // The README has install steps for this project that we didn't accept, so point to the README.
  hasUncheckedSteps: boolean;
  // One of those is a "curl … | sh" style script that runs remote code.
  hasRemoteScript: boolean;
};

export function readmeInstallCommands(commands: string[], fullName: string): ReadmeInstallCommands {
  const result: ReadmeInstallCommands = {
    packageCommands: [],
    dockerRunCommands: [],
    hasUncheckedSteps: false,
    hasRemoteScript: false,
  };
  for (const command of commands) {
    if (!namesProject(command, fullName)) continue;
    const packageCommand = strictPackageCommand(command);
    const dockerRun = packageCommand ? null : strictDockerRun(command);
    if (packageCommand) result.packageCommands.push(packageCommand);
    else if (dockerRun) result.dockerRunCommands.push(dockerRun);
    else if (LOOKS_LIKE_INSTALL.test(command) || isPipedScript(command)) {
      result.hasUncheckedSteps = true;
      if (isPipedScript(command)) result.hasRemoteScript = true;
    }
  }
  return result;
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
