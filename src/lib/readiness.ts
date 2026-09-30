// Decides whether a repo offers a ready-made installer, based only on the files in its latest GitHub Release.
//
// We only ever see files the project uploaded. GitHub's auto-generated "Source code (zip)" and
// "Source code (tar.gz)" downloads are not in a release's list of files (the API keeps them in
// separate zipball_url / tarball_url fields), so they can never be mistaken for an installer here.

export type Readiness = {
  // "installer": the latest release has installer files you can download.
  // "needs-setup": no installer found, so the user has to build or run it themselves.
  // "unknown": we couldn't check (GitHub error).
  status: "installer" | "needs-setup" | "unknown";
  platforms: string[]; // e.g. ["Mac", "Windows"]. Can be empty for an installer whose name doesn't say.
  releaseUrl: string | null; // link to the release page with the downloads
};

// File endings that always mean "download and install".
const INSTALLER_ENDINGS: { ending: string; platform: string }[] = [
  { ending: ".dmg", platform: "Mac" },
  { ending: ".pkg", platform: "Mac" },
  { ending: ".exe", platform: "Windows" },
  { ending: ".msi", platform: "Windows" },
  { ending: ".appimage", platform: "Linux" },
  { ending: ".deb", platform: "Linux" },
  { ending: ".rpm", platform: "Linux" },
  { ending: ".flatpak", platform: "Linux" },
  { ending: ".snap", platform: "Linux" },
  { ending: ".apk", platform: "Android" },
];

// A .zip or .tar.gz could be the app or just source code. It counts as an installer only if
// its name mentions an OS, or says "app" or "portable".
const ARCHIVE_ENDINGS = [".zip", ".tar.gz"];
const OS_WORDS: { words: string[]; platform: string }[] = [
  { words: ["mac", "macos", "osx", "darwin"], platform: "Mac" },
  { words: ["win", "windows", "win32", "win64"], platform: "Windows" },
  { words: ["linux"], platform: "Linux" },
];
const APP_WORDS = ["app", "portable"];
// Files named like these are add-ons, servers or developer tools, not apps a person just installs,
// whatever the file type (e.g. "mattermost-plugin-focalboard-darwin-amd64.tar.gz",
// "rustdesk-server-hbbs_1.1.16_amd64.deb"). They still need setup after installing.
const NOT_APP_WORDS = ["plugin", "server", "sdk"];

// Returns the platforms this file installs on, or null if it isn't an installer.
// An empty list means "an installer, but the name doesn't say which platform".
export function installerPlatforms(fileName: string): string[] | null {
  const lower = fileName.toLowerCase();
  // Compare whole words, not substrings: "darwin" contains "win" but is macOS, not Windows.
  const words = lower.split(/[^a-z0-9]+/);

  if (NOT_APP_WORDS.some((word) => words.includes(word))) return null;

  for (const { ending, platform } of INSTALLER_ENDINGS) {
    if (lower.endsWith(ending)) return [platform];
  }

  if (!ARCHIVE_ENDINGS.some((ending) => lower.endsWith(ending))) return null;

  const platforms = OS_WORDS.filter((os) => os.words.some((word) => words.includes(word))).map(
    (os) => os.platform,
  );
  if (platforms.length > 0) return platforms;
  if (APP_WORDS.some((word) => words.includes(word))) return [];
  return null;
}

export function readinessFromRelease(assetNames: string[], releaseUrl: string | null): Readiness {
  let foundInstaller = false;
  const platforms: string[] = [];
  for (const name of assetNames) {
    const found = installerPlatforms(name);
    if (found === null) continue;
    foundInstaller = true;
    for (const platform of found) {
      if (!platforms.includes(platform)) platforms.push(platform);
    }
  }

  if (!foundInstaller) {
    return { status: "needs-setup", platforms: [], releaseUrl: null };
  }
  return { status: "installer", platforms, releaseUrl };
}
