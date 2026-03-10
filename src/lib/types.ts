export interface Worktree {
  path: string;
  branch: string | null;
  head: string;
  isBare: boolean;
  hasConflicts: boolean;
  pr: PrInfo | null;
  prLoading: boolean;
  tmuxSession: string | null;
  tmuxAttached: boolean;
  remote?: string;
  issueNumber?: number;
  issueState?: "open" | "closed" | "completed";
}

export type ReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | "";

export type ChecksStatus = "pass" | "fail" | "pending" | "none";

export interface PrInfo {
  number: number;
  state: "open" | "merged" | "closed";
  title: string;
  url: string;
  reviewDecision: ReviewDecision;
  unresolvedThreads: number;
  checksStatus: ChecksStatus;
  hasConflicts: boolean;
}

/**
 * Single unified status for display, ordered by priority (highest first).
 */
export type PrStatus =
  | "conflict"
  | "unresolved"
  | "changes_requested"
  | "failing"
  | "review_needed"
  | "pending_ci"
  | "approved"
  | "merged"
  | "closed";

export interface StatusDisplay {
  icon: string;
  label: string;
}

export const prStatusDisplay: Record<PrStatus, StatusDisplay> = {
  conflict:          { icon: "\u26a0", label: "conflict" },
  failing:           { icon: "\u2717", label: "failing" },
  unresolved:        { icon: "\u25cf", label: "threads" },
  changes_requested: { icon: "\u270e", label: "changes" },
  review_needed:     { icon: "\u25cc", label: "review" },
  pending_ci:        { icon: "\u25cc", label: "pending" },
  approved:          { icon: "\u2713", label: "ready" },
  merged:            { icon: "\u2713", label: "merged" },
  closed:            { icon: "\u2717", label: "closed" },
};

export function resolvePrStatus(pr: PrInfo): PrStatus {
  if (pr.state === "merged") return "merged";
  if (pr.state === "closed") return "closed";

  // Open PR — priority ordering (merge conflicts first, then human feedback, then CI)
  if (pr.hasConflicts) return "conflict";
  if (pr.unresolvedThreads > 0) return "unresolved";
  if (pr.reviewDecision === "CHANGES_REQUESTED") return "changes_requested";
  if (pr.checksStatus === "fail") return "failing";
  if (pr.reviewDecision === "REVIEW_REQUIRED" || pr.reviewDecision === "") return "review_needed";
  if (pr.checksStatus === "pending") return "pending_ci";
  return "approved";
}
