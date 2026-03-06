import { useState } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import type { Worktree } from "../lib/types.js";
import { removeWorktree } from "../lib/git.js";
import { killTmuxSession } from "../lib/tmux.js";
import { killRemoteTmuxSession, removeRemoteWorktree, removeRemoteRegistryEntry } from "../lib/remote.js";
import { loadConfig } from "../lib/config.js";
import { tildify } from "../lib/paths.js";
import { log } from "../lib/log.js";

function filterStale(worktrees: Worktree[]): Worktree[] {
  return worktrees.filter(
    (w) => w.pr?.state === "merged" || w.pr?.state === "closed"
  );
}

interface Props {
  worktrees: Worktree[];
  onDone: () => void;
}

export function Cleanup({ worktrees, onDone }: Props) {
  // Snapshot the stale list once PR data arrives.
  // Once frozen, background refreshes can't reset user selections.
  const liveStale = filterStale(worktrees);
  const [frozen, setFrozen] = useState<Worktree[] | null>(null);

  if (frozen === null && liveStale.length > 0) {
    setFrozen(liveStale);
  }

  const stale = frozen ?? liveStale;
  const [selected, setSelected] = useState<Set<string>>(() =>
    new Set(filterStale(worktrees).map((w) => w.path))
  );
  const [cursor, setCursor] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [done, setDone] = useState(false);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [steps, setSteps] = useState<Map<string, string>>(new Map());

  useInput((input, key) => {
    if (deleting) return;

    if (done) {
      if (input === "q" || key.escape) onDone();
      return;
    }

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
      log.info(`cleanup: deleting ${selected.size} worktree(s)`);
      const config = loadConfig();
      Promise.all(
        [...selected].map(async (path) => {
          try {
            const worktree = stale.find((w) => w.path === path);

            if (worktree?.remote) {
              const remote = config.remotes.find((r) => r.name === worktree.remote);
              if (!remote) throw new Error(`remote "${worktree.remote}" not found in config`);

              if (worktree.tmuxSession) {
                setSteps((prev) => new Map(prev).set(path, `Killing remote tmux session "${worktree.tmuxSession}"...`));
                try { await killRemoteTmuxSession(remote.host, worktree.tmuxSession); } catch { /* ok */ }
                await removeRemoteRegistryEntry(remote.host, worktree.tmuxSession);
              }
              setSteps((prev) => new Map(prev).set(path, "Removing remote worktree..."));
              await removeRemoteWorktree(remote.host, remote.repoPath, path);
            } else {
              if (worktree?.tmuxSession) {
                setSteps((prev) => new Map(prev).set(path, `Killing tmux session "${worktree.tmuxSession}"...`));
                try { await killTmuxSession(worktree.tmuxSession); } catch { /* ok */ }
              }
              setSteps((prev) => new Map(prev).set(path, "Removing worktree..."));
              await removeWorktree(path, true);
            }

            setSteps((prev) => new Map(prev).set(path, "Done"));
            setDeleted((prev) => [...prev, path]);
          } catch (err) {
            const message = err instanceof Error ? err.message : "unknown error";
            log.error(`cleanup: failed to remove ${path}: ${message}`);
            setErrors((prev) => [
              ...prev,
              `${tildify(path)}: ${message}`,
            ]);
          }
        })
      ).then(() => {
        log.info("cleanup: done");
        setDeleting(false);
        setDone(true);
      });
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
        <Text bold>
          Removing worktrees ({deleted.length}/{selected.size})
        </Text>
        {[...selected].map((p) => {
          const isDone = deleted.includes(p);
          const step = steps.get(p);
          const hasError = errors.some((e) => e.startsWith(tildify(p)));
          return (
            <Box key={p}>
              <Text color={isDone ? "green" : hasError ? "red" : "yellow"}>
                {isDone ? "✓" : hasError ? "✗" : "⧖"}{" "}
                {tildify(p)}
              </Text>
              {!isDone && !hasError && step && (
                <Text dimColor>
                  {" "}<Spinner type="dots" /> {step}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>
    );
  }

  if (done) {
    return (
      <Box flexDirection="column">
        {deleted.length > 0 && (
          <Text color="green" bold>
            Cleaned up {deleted.length} worktree(s):
          </Text>
        )}
        {deleted.map((p) => (
          <Text key={p} color="green">
            ✓ {tildify(p)}
          </Text>
        ))}
        {errors.map((e, i) => (
          <Text key={i} color="red">
            ✗ {e}
          </Text>
        ))}
        {deleted.length === 0 && errors.length > 0 && (
          <Text color="red" bold>All removals failed.</Text>
        )}
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
            {w.remote && (
              <Text color="magenta">
                {" "}
                @{w.remote}
              </Text>
            )}
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
