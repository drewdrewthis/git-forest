import { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import { WorktreeRow } from "./WorktreeRow.js";
import { ConfirmDelete } from "./ConfirmDelete.js";
import { writeFileSync, unlinkSync } from "node:fs";
import { CD_TARGET_FILE } from "../lib/paths.js";
import type { Worktree } from "../lib/types.js";

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

  useInput((input, key) => {
    if (confirmDelete) return;

    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
    } else if (key.downArrow) {
      setCursor((c) => Math.min(worktrees.length - 1, c + 1));
    } else if (key.return) {
      const selected = worktrees[cursor];
      if (selected) {
        try {
          writeFileSync(CD_TARGET_FILE, selected.path);
        } catch {
          // ignore
        }
        exit();
      }
    } else if (input === "d") {
      const selected = worktrees[cursor];
      if (selected && !selected.isBare) {
        setConfirmDelete(selected);
      }
    } else if (input === "c") {
      onCleanup();
    } else if (input === "r") {
      onRefresh();
    } else if (input === "q") {
      try {
        unlinkSync(CD_TARGET_FILE);
      } catch {
        // ignore
      }
      exit();
    }
  });

  if (loading) {
    return (
      <Text>
        <Spinner type="dots" /> Loading worktrees...
      </Text>
    );
  }

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  if (worktrees.length === 0) {
    return <Text dimColor>No worktrees found.</Text>;
  }

  if (confirmDelete) {
    return (
      <ConfirmDelete
        worktree={confirmDelete}
        onDone={() => {
          setConfirmDelete(null);
          onRefresh();
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>forest</Text>
      <Text dimColor>
        ↑/↓ navigate  enter cd  d delete  c cleanup  r refresh  q quit
      </Text>
      <Text> </Text>
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
  );
}
