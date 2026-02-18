import { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import { WorktreeRow } from "./WorktreeRow.js";
import { ConfirmDelete } from "./ConfirmDelete.js";
import { writeFileSync, unlinkSync } from "node:fs";
import { CD_TARGET_FILE, TMUX_CMD_FILE } from "../lib/paths.js";
import { getTmuxCommand } from "../lib/tmux.js";
import { openUrl } from "../lib/browser.js";
import type { Worktree } from "../lib/types.js";

function cleanTempFiles() {
  try { unlinkSync(CD_TARGET_FILE); } catch { /* ok */ }
  try { unlinkSync(TMUX_CMD_FILE); } catch { /* ok */ }
}

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
  const { exit } = useApp();

  const cols = process.stdout.columns || 80;
  const branchWidth = Math.min(30, Math.floor(cols * 0.25));
  const pathWidth = Math.min(50, Math.floor(cols * 0.45));

  const selected = worktrees[cursor];

  useInput((input, key) => {
    if (confirmDelete) return;

    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
    } else if (key.downArrow) {
      setCursor((c) => Math.min(worktrees.length - 1, c + 1));
    } else if (key.return) {
      if (selected) {
        cleanTempFiles();
        try {
          writeFileSync(CD_TARGET_FILE, selected.path);
        } catch {
          // ignore
        }
        exit();
      }
    } else if (input === "t") {
      if (selected && !selected.isBare) {
        const sessionName = selected.branch?.replace(/\//g, "-") || selected.path.split("/").pop() || "forest";
        const cmd = getTmuxCommand(selected.path, sessionName, selected.tmuxSession);
        cleanTempFiles();
        try {
          writeFileSync(TMUX_CMD_FILE, cmd);
        } catch {
          // ignore
        }
        exit();
      }
    } else if (input === "o") {
      if (selected?.pr?.url) {
        openUrl(selected.pr.url);
      }
    } else if (input === "d") {
      if (selected && !selected.isBare) {
        setConfirmDelete(selected);
      }
    } else if (input === "c") {
      onCleanup();
    } else if (input === "r") {
      onRefresh();
    } else if (input === "q") {
      cleanTempFiles();
      exit();
    }
  });

  if (loading) {
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

  const hasPr = !!selected?.pr?.url;

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="green" paddingX={4} paddingY={1} flexDirection="column" alignItems="center">
        <Text color="green">{"     ^           ^           ^"}</Text>
        <Text color="green">{"    /o\\         /o\\         /o\\"}</Text>
        <Text color="green">{"   /ooo\\       /ooo\\       /ooo\\"}</Text>
        <Text color="green">{"  /ooooo\\     /ooooo\\     /ooooo\\"}</Text>
        <Text color="green">{" /ooooooo\\   /ooooooo\\   /ooooooo\\"}</Text>
        <Text color="yellow">{"     #           #           #"}</Text>
        <Text color="yellow">{"     #           #           #"}</Text>
        <Text> </Text>
        <Text bold color="greenBright">{"    g i t    f o r e s t"}</Text>
      </Box>

      <Text> </Text>

      <Box borderStyle="round" borderColor="gray" paddingX={2} paddingY={1} flexDirection="column">
        {worktrees.map((wt, i) => (
          <WorktreeRow
            key={wt.path}
            worktree={wt}
            isSelected={i === cursor}
            pathWidth={pathWidth}
            branchWidth={branchWidth}
          />
        ))}
      </Box>

      <Text> </Text>

      <Box paddingX={1} flexDirection="row" gap={1} justifyContent="center">
        <KeyHint label="enter" desc="cd" />
        <Text dimColor>{"\u2502"}</Text>
        <KeyHint label="t" desc="tmux" />
        <Text dimColor>{"\u2502"}</Text>
        <KeyHint label="o" desc="pr" dimmed={!hasPr} />
        <Text dimColor>{"\u2502"}</Text>
        <KeyHint label="d" desc="delete" />
        <Text dimColor>{"\u2502"}</Text>
        <KeyHint label="c" desc="cleanup" />
        <Text dimColor>{"\u2502"}</Text>
        <KeyHint label="r" desc="refresh" />
        <Text dimColor>{"\u2502"}</Text>
        <KeyHint label="q" desc="quit" />
      </Box>
    </Box>
  );
}

function KeyHint({ label, desc, dimmed }: { label: string; desc: string; dimmed?: boolean }) {
  if (dimmed) {
    return (
      <Text dimColor>
        {label} {desc}
      </Text>
    );
  }
  return (
    <Text>
      <Text color="cyan" bold>{label}</Text>
      <Text dimColor> {desc}</Text>
    </Text>
  );
}
