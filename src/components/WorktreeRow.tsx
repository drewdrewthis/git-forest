import { Box, Text } from "ink";
import { StatusBadge } from "./StatusBadge.js";
import { truncateLeft } from "../lib/paths.js";
import type { Worktree } from "../lib/types.js";

interface Props {
  worktree: Worktree;
  isSelected: boolean;
  index: number;
  pathWidth: number;
  branchWidth: number;
  tmuxWidth: number;
}

export function WorktreeRow({
  worktree,
  isSelected,
  index,
  pathWidth,
  branchWidth,
  tmuxWidth,
}: Props) {
  const displayPath = truncateLeft(worktree.path, pathWidth);

  return (
    <Box>
      <Text dimColor>{String(index + 1).padStart(2)} </Text>
      <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
        {isSelected ? ">" : " "}{" "}
      </Text>
      <Box width={pathWidth}>
        <Text color={isSelected ? "cyan" : undefined} bold={isSelected} wrap="truncate">
          {displayPath}
        </Text>
      </Box>
      <Text>  </Text>
      <Box width={branchWidth}>
        <Text
          color="yellow"
          dimColor={!isSelected}
          wrap="truncate"
        >
          {worktree.branch || "(detached)"}
        </Text>
      </Box>
      <Text>  </Text>
      <Box width={12}>
        {worktree.isBare ? (
          <Text dimColor>(bare)</Text>
        ) : (
          <StatusBadge pr={worktree.pr} loading={worktree.prLoading} hasConflicts={worktree.hasConflicts} issueState={worktree.issueState} />
        )}
      </Box>
      <Text>  </Text>
      {worktree.remote && (
        <>
          <Box width={10}>
            <Text color="magenta" dimColor={!isSelected} wrap="truncate">
              @{worktree.remote.includes("@") ? worktree.remote.split("@").pop() : worktree.remote}
            </Text>
          </Box>
          <Text>  </Text>
        </>
      )}
      <Box width={tmuxWidth}>
        {worktree.tmuxSession ? (
          <Text color={worktree.tmuxAttached ? "green" : "blue"} wrap="truncate">
            {worktree.tmuxAttached ? "▶" : "◼"} tmux:{worktree.tmuxSession}
          </Text>
        ) : (
          <Text> </Text>
        )}
      </Box>
    </Box>
  );
}
