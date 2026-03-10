import { Text } from "ink";
import { resolvePrStatus, prStatusDisplay } from "../lib/types.js";
import type { PrInfo, PrStatus } from "../lib/types.js";

interface Props {
  pr: PrInfo | null;
  loading: boolean;
  hasConflicts: boolean;
  issueState?: "open" | "closed" | "completed";
}

export function StatusBadge({ pr, loading, hasConflicts, issueState }: Props) {
  if (hasConflicts) {
    const { icon, label } = prStatusDisplay["conflict"];
    return <Text color={statusColor["conflict"]}>{icon} {label}</Text>;
  }

  if (loading) {
    return <Text dimColor>···</Text>;
  }

  if (!pr && (issueState === "completed" || issueState === "closed")) {
    return <Text color="green">{"\u2713"} closed</Text>;
  }

  if (!pr) {
    return <Text dimColor>no PR</Text>;
  }

  const status = resolvePrStatus(pr);
  const { icon, label } = prStatusDisplay[status];
  return <Text color={statusColor[status]}>{icon} {label}</Text>;
}

const statusColor: Record<PrStatus, string> = {
  conflict:          "red",
  failing:           "red",
  unresolved:        "yellow",
  changes_requested: "red",
  review_needed:     "yellow",
  pending_ci:        "yellow",
  approved:          "green",
  merged:            "magenta",
  closed:            "red",
};
