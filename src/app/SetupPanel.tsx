"use client";

import { useState } from "react";
import { rankOptions, type OS, type SetupInfo, type SetupOption } from "@/lib/setup";
import styles from "./SetupPanel.module.css";

// A command in a code block with a one-click copy button.
function CopyBlock({ command }: { command: string }) {
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
      <button type="button" onClick={copy} className={styles.copyButton}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

// Stays next to every download and hosted link until the safety filter exists.
function Unverified() {
  return (
    <span className={styles.unverified} title="Not yet checked by a safety filter.">
      Unverified
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
        <CopyBlock command={command} />
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
      <CopyBlock command={option.command.command} />
    </div>
  );
}

function ReadmeLink({ setup }: { setup: SetupInfo }) {
  return (
    <a href={setup.readmeUrl} target="_blank" rel="noopener noreferrer" className={styles.inlineLink}>
      see README
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

      {setup.pipedScripts.length > 0 && (
        <details className={styles.expander}>
          <summary>Install script (runs remote code)</summary>
          <p className={styles.note}>
            The README also offers this. It downloads a script and runs it straight away, without
            showing you what it does. Only use it if you trust the project.
          </p>
          {setup.pipedScripts.map((command) => (
            <CopyBlock key={command} command={command} />
          ))}
        </details>
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
                    <CopyBlock command={step.command} />
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
