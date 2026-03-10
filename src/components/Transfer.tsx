import { useState } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import type { Worktree } from "../lib/types.js";
import type { RemoteConfig } from "../lib/config.js";
import { pushToRemote, pullToLocal } from "../lib/transfer.js";
import { tildify } from "../lib/paths.js";
import { log } from "../lib/log.js";

interface Props {
  worktree: Worktree;
  remote: RemoteConfig;
  repoRoot: string;
  onDone: () => void;
  onCancel: () => void;
}

type Phase = "confirm" | "transferring" | "done" | "error";

interface StepState {
  label: string;
  status: "pending" | "active" | "done" | "error";
}

export function Transfer({ worktree, remote, repoRoot, onDone, onCancel }: Props) {
  const isPush = !worktree.remote;
  const direction = isPush ? "push to remote" : "pull to local";
  const [phase, setPhase] = useState<Phase>("confirm");
  const [steps, setSteps] = useState<StepState[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useInput((input, key) => {
    if (phase === "confirm") {
      if (input === "y" || input === "Y") {
        setPhase("transferring");
        runTransfer();
      } else if (input === "n" || input === "N" || key.escape) {
        onCancel();
      }
    } else if (phase === "done" || phase === "error") {
      onDone();
    }
  });

  async function runTransfer() {
    const onStep = (step: string) => {
      setSteps((prev) => {
        const updated = prev.map((s) =>
          s.status === "active" ? { ...s, status: "done" as const } : s
        );
        return [...updated, { label: step, status: "active" as const }];
      });
    };

    try {
      if (isPush) {
        await pushToRemote(worktree, remote, onStep);
      } else {
        await pullToLocal(worktree, remote, repoRoot, onStep);
      }
      setSteps((prev) =>
        prev.map((s) => (s.status === "active" ? { ...s, status: "done" } : s))
      );
      setPhase("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transfer failed";
      log.error(`transfer failed: ${msg}`);
      setErrorMsg(msg);
      setSteps((prev) =>
        prev.map((s) => (s.status === "active" ? { ...s, status: "error" } : s))
      );
      setPhase("error");
    }
  }

  if (phase === "confirm") {
    return (
      <Box flexDirection="column">
        <Text>
          Transfer <Text color="yellow">{worktree.branch}</Text>{" "}
          — <Text bold>{direction}</Text>
        </Text>
        <Text dimColor>from {tildify(worktree.path)}</Text>
        {worktree.tmuxAttached && (
          <Text color="red">Session is currently attached — it will be killed.</Text>
        )}
        <Text>
          <Text color="green" bold>y</Text>
          {" yes  "}
          <Text color="red" bold>n</Text>
          {" no"}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>
        {phase === "done" ? "Transfer complete" : phase === "error" ? "Transfer failed" : "Transferring..."}
        {" — "}{direction}
      </Text>
      {steps.map((step, i) => (
        <Box key={i}>
          <Text color={step.status === "done" ? "green" : step.status === "error" ? "red" : "yellow"}>
            {step.status === "done" ? "\u2713" : step.status === "error" ? "\u2717" : ""}{" "}
          </Text>
          {step.status === "active" && <Spinner type="dots" />}
          <Text color={step.status === "error" ? "red" : undefined}>
            {" "}{step.label}
          </Text>
        </Box>
      ))}
      {errorMsg && <Text color="red">{errorMsg}</Text>}
      {(phase === "done" || phase === "error") && (
        <Text dimColor>Press any key to continue</Text>
      )}
    </Box>
  );
}
