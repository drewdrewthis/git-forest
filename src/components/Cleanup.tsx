import { useState, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import type { Worktree } from "../lib/types.js";
import { removeWorktree } from "../lib/git.js";
import { killTmuxSession } from "../lib/tmux.js";
import { tildify } from "../lib/paths.js";

interface Props {
  worktrees: Worktree[];
  onDone: () => void;
}

export function Cleanup({ worktrees, onDone }: Props) {
  const stale = worktrees.filter(
    (w) => w.pr?.state === "merged" || w.pr?.state === "closed"
  );
  const [selected, setSelected] = useState<Set<string>>(
    new Set(stale.map((w) => w.path))
  );
  const prevStaleCount = useRef(stale.length);
  useEffect(() => {
    if (stale.length !== prevStaleCount.current) {
      prevStaleCount.current = stale.length;
      setSelected(new Set(stale.map((w) => w.path)));
    }
  }, [stale.length]);
  const [cursor, setCursor] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (deleting) return;

    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
    } else if (key.downArrow) {
      setCursor((c) => Math.min(stale.length - 1, c + 1));
    } else if (input === " ") {
      const path = stale[cursor]?.path;
      if (path) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(path)) next.delete(path);
          else next.add(path);
          return next;
        });
      }
    } else if (key.return) {
      if (selected.size === 0) {
        onDone();
        return;
      }
      setDeleting(true);
      Promise.all(
        [...selected].map(async (path) => {
          try {
            const wt = stale.find((w) => w.path === path);
            if (wt?.tmuxSession) {
              try { await killTmuxSession(wt.tmuxSession); } catch { /* ok */ }
            }
            await removeWorktree(path, true);
            setDeleted((prev) => [...prev, path]);
          } catch (err) {
            setError(
              `Failed to remove ${path}: ${err instanceof Error ? err.message : "unknown error"}`
            );
          }
        })
      )
        .then(() => setDeleting(false))
        .catch((err) => setError(err instanceof Error ? err.message : "unknown error"));
    } else if (input === "q" || key.escape) {
      onDone();
    }
  });

  const stillLoading = worktrees.some((w) => w.prLoading);

  if (stale.length === 0) {
    if (stillLoading) {
      return (
        <Box flexDirection="column">
          <Text>
            <Spinner type="dots" /> Loading PR data...
          </Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column">
        <Text color="green">No worktrees with merged or closed PRs to clean up.</Text>
        <Text dimColor>Press q to go back</Text>
      </Box>
    );
  }

  if (deleting) {
    return (
      <Box flexDirection="column">
        <Text>
          <Spinner type="dots" /> Removing worktrees... ({deleted.length}/
          {selected.size})
        </Text>
        {deleted.map((p) => (
          <Text key={p} color="green">
            ✓ {tildify(p)}
          </Text>
        ))}
      </Box>
    );
  }

  if (deleted.length > 0) {
    return (
      <Box flexDirection="column">
        <Text color="green" bold>
          Cleaned up {deleted.length} worktree(s):
        </Text>
        {deleted.map((p) => (
          <Text key={p} color="green">
            ✓ {tildify(p)}
          </Text>
        ))}
        {error && <Text color="red">{error}</Text>}
        <Text dimColor>Press q to go back</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>Cleanup - Worktrees with merged or closed PRs</Text>
      <Text dimColor>
        space toggle  enter confirm  q cancel
      </Text>
      <Text> </Text>
      {stale.map((w, i) => {
        const isCursor = cursor === i;
        const isChecked = selected.has(w.path);
        const displayPath = tildify(w.path);
        return (
          <Box key={w.path}>
            <Text color={isCursor ? "cyan" : undefined}>
              {isCursor ? "▸" : " "} {isChecked ? "[✓]" : "[ ]"}{" "}
              {displayPath}
            </Text>
            <Text color="yellow" dimColor>
              {" "}
              {w.branch}
            </Text>
            <Text color="magenta" dimColor>
              {" "}
              PR #{w.pr?.number}
            </Text>
            {w.tmuxSession && (
              <Text color="blue" dimColor>
                {" "}
                tmux:{w.tmuxSession}
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
