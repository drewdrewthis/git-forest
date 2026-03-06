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

interface Props {
  worktree: Worktree;
  onDone: () => void;
  onCancel: () => void;
}

export function ConfirmDelete({ worktree, onDone, onCancel }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (deleting) return;

    if (error) {
      onCancel();
      return;
    }

    if (input === "y" || input === "Y") {
      setDeleting(true);
      (async () => {
        if (worktree.remote) {
          const config = loadConfig();
          const remote = config.remotes.find((r) => r.name === worktree.remote);
          if (!remote) throw new Error(`remote "${worktree.remote}" not found in config`);

          if (worktree.tmuxSession) {
            setStep(`Killing remote tmux session "${worktree.tmuxSession}"...`);
            try { await killRemoteTmuxSession(remote.host, worktree.tmuxSession); } catch { /* ok */ }
            await removeRemoteRegistryEntry(remote.host, worktree.tmuxSession);
          }
          setStep("Removing remote worktree...");
          await removeRemoteWorktree(remote.host, remote.repoPath, worktree.path);
        } else {
          if (worktree.tmuxSession) {
            setStep(`Killing tmux session "${worktree.tmuxSession}"...`);
            try { await killTmuxSession(worktree.tmuxSession); } catch { /* session may already be dead */ }
          }
          setStep("Removing worktree...");
          try {
            await removeWorktree(worktree.path);
          } catch (firstError) {
            log.warn(`removeWorktree failed, retrying with --force: ${firstError instanceof Error ? firstError.message : "unknown"}`);
            setStep("Removing worktree (force)...");
            await removeWorktree(worktree.path, true);
          }
        }
        onDone();
      })().catch((err) => {
        const message = err instanceof Error ? err.message : "Failed to delete";
        log.error(`ConfirmDelete: ${message}`);
        setError(message);
      });
    } else if (input === "n" || input === "N" || key.escape) {
      onCancel();
    }
  });

  const displayPath = tildify(worktree.path);

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {error}</Text>
        <Text dimColor>Press any key to go back</Text>
      </Box>
    );
  }

  if (deleting) {
    return (
      <Box flexDirection="column">
        <Text>
          <Spinner type="dots" /> {displayPath}
        </Text>
        {step && <Text dimColor>  {step}</Text>}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text>
        Delete{worktree.remote ? " remote" : ""} worktree <Text color="yellow">{worktree.branch}</Text> at{" "}
        <Text color="cyan">{displayPath}</Text>
        {worktree.remote && <Text color="magenta"> @{worktree.remote}</Text>}?
      </Text>
      {worktree.pr?.state === "merged" && (
        <Text color="magenta">PR #{worktree.pr.number} is merged.</Text>
      )}
      {worktree.tmuxSession && (
        <Text color="blue">tmux session "{worktree.tmuxSession}" will be killed.</Text>
      )}
      <Text>
        <Text color="green" bold>
          y
        </Text>
        {" yes  "}
        <Text color="red" bold>
          n
        </Text>
        {" no"}
      </Text>
    </Box>
  );
}
