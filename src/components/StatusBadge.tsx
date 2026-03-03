import { Text } from "ink";
import { resolvePrStatus } from "../lib/types.js";
import type { PrInfo, PrStatus } from "../lib/types.js";

interface Props {
  pr: PrInfo | null;
  loading: boolean;
}

export function StatusBadge({ pr, loading }: Props) {
  if (loading) {
    return <Text dimColor>···</Text>;
  }

  if (!pr) {
    return <Text dimColor>no PR</Text>;
  }

  const status = resolvePrStatus(pr);
  const { icon, label, color } = statusDisplay[status];
  return <Text color={color}>{icon} {label}</Text>;
}

const statusDisplay: Record<PrStatus, { icon: string; label: string; color: string }> = {
  failing:           { icon: "✕", label: "failing",  color: "red" },
  unresolved:        { icon: "●", label: "threads",  color: "yellow" },
  changes_requested: { icon: "✎", label: "changes",  color: "red" },
  review_needed:     { icon: "◌", label: "review",   color: "yellow" },
  pending_ci:        { icon: "◌", label: "pending",  color: "yellow" },
  approved:          { icon: "✓", label: "ready",    color: "green" },
  merged:            { icon: "✓", label: "merged",   color: "magenta" },
  closed:            { icon: "✕", label: "closed",   color: "red" },
};
