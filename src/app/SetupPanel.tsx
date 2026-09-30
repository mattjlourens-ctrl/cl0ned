"use client";

import { useState } from "react";
import { rankOptions, type OS, type SetupInfo, type SetupOption } from "@/lib/setup";
import styles from "./SetupPanel.module.css";

// Where a command came from: copied from the README (after the allowlist check), or written
// by us from the files in the repo (build steps, Docker Compose).
type CommandSource = "README" | "repo files";

// A command in a code block with a one-click copy button. Every command gets the Unverified tag.
function CopyBlock({ command, source }: { command: string; source: CommandSource }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. insecure page): the text is still there to select by hand.
    }
  }

  return (
    <div className={styles.codeBlock}>
      <pre>
        <code>{command}</code>
      </pre>
      <Unverified source={source} />
      <button type="button" onClick={copy} className={styles.copyButton}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

// Stays next to every download, hosted link and command until the safety filter exists.
function Unverified({ source }: { source?: CommandSource }) {
  return (
    <span className={styles.unverified} title="Not yet checked by a safety filter.">
      Unverified{source && ` · from ${source}`}
    </span>
  );
}

function DownloadLinks({ option }: { option: Extract<SetupOption, { kind: "download" }> }) {
  return (
    <ul className={styles.fileList}>
      {option.files.map((file) => (
        <li key={file.url}>
          <a href={file.url}>{file.fileName}</a> <span className={styles.muted}>({option.platform})</span>{" "}
          <Unverified />
        </li>
      ))}
    </ul>
  );
}

function OptionView({ option, primary }: { option: SetupOption; primary: boolean }) {
  if (option.kind === "hosted") {
    return (
      <div>
        <p className={styles.optionLabel}>Hosted version</p>
        <div className={styles.actionRow}>
          <a href={option.url} target="_blank" rel="noopener noreferrer" className={styles.inlineLink}>
            Open in browser
          </a>
          <Unverified />
          <span className={styles.muted}>Run by the project, may be a paid plan</span>
        </div>
      </div>
    );
  }
  if (option.kind === "download") {
    if (!primary) return <DownloadLinks option={option} />;
    return (
      <div className={styles.actionRow}>
        <a href={option.files[0].url} className={styles.primaryButton}>
          Download for {option.platform}
        </a>
        <Unverified />
        <span className={styles.muted}>{option.files[0].fileName}</span>
      </div>
    );
  }
  if (option.kind === "package") {
    const { manager, command, platforms } = option.command;
    return (
      <div>
        <p className={styles.optionLabel}>
          Install with {manager}
          {platforms !== "any" && ` (${platforms.join(", ")})`}
        </p>
        <CopyBlock command={command} source="README" />
      </div>
    );
  }
  return (
    <div>
      <p className={styles.optionLabel}>Run with Docker</p>
      {option.command.source === "compose-file" && (
        <p className={styles.note}>
          Downloads the code, then starts it using the project&apos;s own Docker Compose file. Needs
          Git and Docker.
        </p>
      )}
      <CopyBlock
        command={option.command.command}
        source={option.command.source === "readme" ? "README" : "repo files"}
      />
    </div>
  );
}

function ReadmeLink({ setup, text = "see README" }: { setup: SetupInfo; text?: string }) {
  return (
    <a href={setup.readmeUrl} target="_blank" rel="noopener noreferrer" className={styles.inlineLink}>
      {text}
    </a>
  );
}

export default function SetupPanel({ setup, os }: { setup: SetupInfo; os: OS | null }) {
  if (setup.status === "unavailable") {
    return (
      <div className={styles.panel}>
        <p className={styles.heading}>Get it running</p>
        <p className={styles.note}>
          Couldn&apos;t load setup info right now. <ReadmeLink setup={setup} />
        </p>
      </div>
    );
  }

  const { primary, others } = rankOptions(setup, os);
  // When the main action is a download, the other platforms' files get their own dropdown.
  const otherPlatforms: SetupOption[] =
    primary?.kind === "download" ? others.filter((option) => option.kind === "download") : [];
  const moreWays = others.filter((option) => !otherPlatforms.includes(option));
  const extraFilesForPrimary = primary?.kind === "download" ? primary.files.slice(1) : [];
  const build = setup.buildFromSource;

  return (
    <div className={styles.panel}>
      <p className={styles.heading}>Get it running</p>

      {primary ? (
        <OptionView option={primary} primary />
      ) : setup.uncheckedReadmeSteps ? (
        <p className={styles.note}>
          <ReadmeLink setup={setup} text="See README for install steps" />
        </p>
      ) : (
        <p className={styles.note}>
          No easy install found — <ReadmeLink setup={setup} />
        </p>
      )}

      {(otherPlatforms.length > 0 || extraFilesForPrimary.length > 0) && primary?.kind === "download" && (
        <details className={styles.expander}>
          <summary>Other platforms and files</summary>
          {extraFilesForPrimary.length > 0 && (
            <DownloadLinks option={{ ...primary, files: extraFilesForPrimary }} />
          )}
          {otherPlatforms.map((option, index) => (
            <OptionView key={index} option={option} primary={false} />
          ))}
        </details>
      )}

      {moreWays.length > 0 && (
        <details className={styles.expander}>
          <summary>More ways to get it</summary>
          {moreWays.map((option, index) => (
            <OptionView key={index} option={option} primary={false} />
          ))}
        </details>
      )}

      {/* README steps that failed the allowlist are never shown as commands, only pointed to. */}
      {primary && setup.uncheckedReadmeSteps && (
        <p className={styles.note}>
          The README has other install steps we can&apos;t check automatically.{" "}
          <ReadmeLink setup={setup} text="See README for install steps" />
        </p>
      )}
      {setup.readmeHasRemoteScript && (
        <p className={styles.note}>
          One of the README&apos;s install steps downloads a script and runs it straight away,
          without showing you what it does. Only use it if you trust the project.
        </p>
      )}

      {build && (
        <details className={styles.expander}>
          <summary>Advanced: build it yourself</summary>
          <p className={styles.optionLabel}>You&apos;ll need</p>
          <ul className={styles.prereqs}>
            {build.prerequisites.map((prerequisite) => (
              <li key={prerequisite.name}>
                {prerequisite.name}
                {prerequisite.version && (
                  <span className={styles.muted}> (version {prerequisite.version})</span>
                )}{" "}
                —{" "}
                <a
                  href={prerequisite.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.inlineLink}
                >
                  official download
                </a>
              </li>
            ))}
          </ul>
          <p className={styles.optionLabel}>Then run, in a terminal</p>
          <ol className={styles.steps}>
            {build.steps.map((step) => (
              <li key={step.label}>
                {step.command ? (
                  <>
                    <span>{step.label}</span>
                    <CopyBlock command={step.command} source="repo files" />
                  </>
                ) : (
                  <span>
                    {step.label}: <ReadmeLink setup={setup} />
                  </span>
                )}
              </li>
            ))}
          </ol>
          <p className={styles.note}>
            Steps are based on the files in the repo. Projects often need more (settings, a
            database), so check the README too.
          </p>
        </details>
      )}
    </div>
  );
}
