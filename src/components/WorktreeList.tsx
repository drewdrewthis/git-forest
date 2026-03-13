import { useState, useEffect, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import { TitledBox } from "@mishieck/ink-titled-box";
import { WorktreeRow } from "./WorktreeRow.js";
import { ConfirmDelete } from "./ConfirmDelete.js";
import { Transfer } from "./Transfer.js";
import { switchToSession, deriveSessionName, capturePaneContent } from "../lib/tmux.js";
import { openUrl } from "../lib/browser.js";
import { cursorIndexFromDigit } from "../lib/navigation.js";
import { loadConfig } from "../lib/config.js";
import type { RemoteConfig } from "../lib/config.js";
import { attachRemoteSession, createRemoteSession, captureRemotePaneContent } from "../lib/remote.js";
import { log } from "../lib/log.js";
import type { Worktree } from "../lib/types.js";
import { execaSync } from "execa";
import { basename } from "node:path";

interface Props {
  worktrees: Worktree[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onCleanup: () => void;
}

export function WorktreeList({
  worktrees,
  loading,
  error,
  onRefresh,
  onCleanup,
}: Props) {
  const [cursor, setCursor] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<Worktree | null>(null);
  const [transferTarget, setTransferTarget] = useState<Worktree | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const { exit } = useApp();

  const configRef = useRef<ReturnType<typeof loadConfig> | null>(null);
  if (!configRef.current) {
    configRef.current = loadConfig();
  }
  const remoteConfig: RemoteConfig | undefined = configRef.current.remote;

  const repoRootRef = useRef<string | null>(null);
  const repoNameRef = useRef<string>("orchard");
  useEffect(() => {
    const root = execaSync("git", ["rev-parse", "--show-toplevel"]).stdout.trim();
    repoRootRef.current = root;
    repoNameRef.current = basename(root);
  }, []);

  const [termSize, setTermSize] = useState({
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  });

  useEffect(() => {
    const onResize = () => setTermSize({
      cols: process.stdout.columns || 80,
      rows: process.stdout.rows || 24,
    });
    process.stdout.on("resize", onResize);
    return () => { process.stdout.off("resize", onResize); };
  }, []);

  const { cols, rows } = termSize;
  const branchWidth = Math.min(30, Math.floor(cols * 0.25));
  const pathWidth = Math.min(50, Math.floor(cols * 0.45));
  const tmuxWidth = Math.min(30, Math.floor(cols * 0.2));

  // header box (9) + spacer (1) + list border+padding (4) + spacer (1) + preview border (2) + spacer (1) + hint (1)
  const fixedChrome = 9 + 1 + 4 + 1 + 2 + 1 + 1;
  const previewLines = Math.max(3, rows - fixedChrome - worktrees.length);

  const selected = worktrees[cursor];

  const [paneContent, setPaneContent] = useState<string | null>(null);
  const lastSession = useRef<string | null>(null);
  useEffect(() => {
    const session = selected?.tmuxSession ?? null;
    if (!session) { setPaneContent(null); lastSession.current = null; return; }
    // Don't clear existing content — fetch silently and swap when ready
    lastSession.current = session;
    const handle = selected?.remote
      ? captureRemotePaneContent(selected.remote, session, previewLines)
      : capturePaneContent(session, previewLines);
    handle.promise.then((content) => {
      // Discard if cursor moved to a different session while fetching
      if (lastSession.current === session) setPaneContent(content);
    });
    return () => { handle.kill(); };
  }, [selected?.tmuxSession, previewLines]);

  function showWarning(msg: string) {
    setWarning(msg);
    setTimeout(() => setWarning(null), 3000);
  }

  useInput((input, key) => {
    if (confirmDelete || transferTarget) return;

    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
    } else if (key.downArrow) {
      setCursor((c) => Math.min(worktrees.length - 1, c + 1));
    } else if (key.return || input === "t") {
      if (selected && !selected.isBare) {
        if (selected.remote) {
          const remote = configRef.current?.remote;
          if (remote) {
            const sessionName = selected.tmuxSession ?? deriveSessionName(repoNameRef.current, selected.branch, selected.path);
            const attach = selected.tmuxSession
              ? Promise.resolve()
              : createRemoteSession(remote.host, sessionName, selected.path);
            attach
              .then(() => attachRemoteSession(remote.host, sessionName, remote.shell))
              .catch((err) => {
                const msg = err instanceof Error ? err.message : String(err);
                log.error(`remote session failed for ${sessionName}: ${msg}`);
                showWarning(`Remote: ${msg}`);
              });
          }
        } else {
          const sessionName = deriveSessionName(repoNameRef.current, selected.branch, selected.path);
          switchToSession({
            sessionName,
            worktreePath: selected.path,
            branch: selected.branch,
            pr: selected.pr,
          }).catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            log.error(`switchToSession failed for ${sessionName}: ${msg}`);
          });
        }
      }
    } else if (input === "o") {
      if (selected?.pr?.url) {
        openUrl(selected.pr.url);
      }
    } else if (input === "d") {
      if (selected && !selected.isBare) {
        setConfirmDelete(selected);
      }
    } else if (input === "p") {
      if (!remoteConfig) {
        showWarning("No remote configured");
      } else if (!selected || selected.isBare) {
        showWarning("Cannot transfer bare worktree");
      } else if (!selected.branch) {
        showWarning("Cannot transfer detached HEAD");
      } else if (selected.hasConflicts) {
        showWarning("Resolve merge conflicts first");
      } else {
        setTransferTarget(selected);
      }
    } else if (input === "c") {
      onCleanup();
    } else if (input === "r") {
      configRef.current = loadConfig();
      onRefresh();
    } else if (input === "q") {
      exit();
    } else {
      const jumpIndex = cursorIndexFromDigit(input, worktrees.length);
      if (jumpIndex !== null) {
        setCursor(jumpIndex);
      }
    }
  });

  if (loading && worktrees.length === 0) {
    return (
      <Box borderStyle="round" borderColor="green" paddingX={2} paddingY={1} flexDirection="column" alignItems="center">
        <Text>
          <Spinner type="dots" />{" "}
          <Text color="green">Loading worktrees...</Text>
        </Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box borderStyle="round" borderColor="red" paddingX={2} paddingY={1}>
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  if (worktrees.length === 0) {
    return (
      <Box borderStyle="round" borderColor="yellow" paddingX={2} paddingY={1}>
        <Text dimColor>No worktrees found.</Text>
      </Box>
    );
  }

  if (confirmDelete) {
    return (
      <Box borderStyle="round" borderColor="red" paddingX={2} paddingY={1}>
        <ConfirmDelete
          worktree={confirmDelete}
          onDone={() => {
            setConfirmDelete(null);
            onRefresh();
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      </Box>
    );
  }

  if (transferTarget && remoteConfig && repoRootRef.current) {
    return (
      <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
        <Transfer
          worktree={transferTarget}
          remote={remoteConfig}
          repoRoot={repoRootRef.current}
          onDone={() => {
            setTransferTarget(null);
            onRefresh();
          }}
          onCancel={() => setTransferTarget(null)}
        />
      </Box>
    );
  }

  const hasPr = !!selected?.pr?.url;

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="green" paddingX={2} paddingY={1} flexDirection="column" alignItems="center">
        <Text color="green">{"🌲🌳🌴🌲🌳🌴🌲🌳🌴🌲🌳🌴🌲🌳🌴🌲🌳🌴"}</Text>
        <Text color="green">{"┌─┐┬┌┬┐╔═╗╦═╗╔═╗╦ ╦╔═╗╦═╗╔╦╗"}</Text>
        <Text color="green">{"│ ┬│ │ ║ ║╠╦╝║  ╠═╣╠═╣╠╦╝ ║║"}</Text>
        <Text color="green">{"└─┘┴ ┴ ╚═╝╩╚═╚═╝╩ ╩╩ ╩╩╚══╩╝"}</Text>
        <Text color="green">{"🌲🌳🌴🌲🌳🌴🌲🌳🌴🌲🌳🌴🌲🌳🌴🌲🌳🌴"}</Text>
      </Box>

      <Text> </Text>

      <TitledBox borderStyle="round" borderColor="gray" titles={["WORKTREES"]} paddingX={2} paddingY={1} flexDirection="column">
        {worktrees.map((worktree, i) => (
          <WorktreeRow
            key={worktree.path}
            worktree={worktree}
            isSelected={i === cursor}
            index={i}
            pathWidth={pathWidth}
            branchWidth={branchWidth}
            tmuxWidth={tmuxWidth}
          />
        ))}
      </TitledBox>

      <Text> </Text>

      {selected?.tmuxSession && paneContent !== null && <WorktreePreview paneContent={paneContent} lines={previewLines} sessionName={selected.tmuxSession} />}
      {selected?.tmuxSession && paneContent === null && (
        <Box height={previewLines + 2} />
      )}

      <Text> </Text>

      {warning && (
        <Box justifyContent="center">
          <Text color="yellow">{warning}</Text>
        </Box>
      )}

      <Box paddingX={1} flexDirection="row" gap={1} justifyContent="center">
        <KeyHint label="1-9" desc="jump" dimmed={worktrees.length === 0} />
        <Sep /><KeyHint label="enter" desc="tmux" />
        <Sep /><KeyHint label="o" desc="pr" dimmed={!hasPr} />
        {remoteConfig && (
          <>
            <Sep /><KeyHint label="p" desc={selected?.remote ? "pull" : "push"} />
          </>
        )}
        <Sep /><KeyHint label="d" desc="delete" />
        <Sep /><KeyHint label="c" desc="cleanup" />
        <Sep /><KeyHint label="r" desc="refresh" />
        <Sep /><KeyHint label="q" desc="quit" />
      </Box>
    </Box>
  );
}

function Sep() {
  return <Text dimColor>{"\u2502"}</Text>;
}

function KeyHint({ label, desc, dimmed }: { label: string; desc: string; dimmed?: boolean }) {
  if (dimmed) {
    return <Text dimColor>{label} {desc}</Text>;
  }
  return (
    <Text>
      <Text color="cyan" bold>{label}</Text>
      <Text dimColor> {desc}</Text>
    </Text>
  );
}

function WorktreePreview({ paneContent, lines, sessionName }: { paneContent: string | null; lines: number; sessionName: string }) {
  const contentLines = paneContent === null || paneContent === ""
    ? []
    : paneContent.split("\n").slice(-lines);

  const paddedLines = [
    ...contentLines,
    ...Array.from({ length: Math.max(0, lines - contentLines.length) }, () => ""),
  ];

  return (
    <TitledBox borderStyle="double" borderColor="red" titles={["PREVIEW", sessionName]} paddingX={2} paddingY={0} flexDirection="column">
      {paddedLines.map((line, i) => (
        <Text key={i} dimColor wrap="truncate">{line || " "}</Text>
      ))}
    </TitledBox>
  );
}
