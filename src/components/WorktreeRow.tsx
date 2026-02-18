import { Box, Text } from "ink";
import { StatusBadge } from "./StatusBadge.js";
import { tildify } from "../lib/paths.js";
import type { Worktree } from "../lib/types.js";

interface Props {
  worktree: Worktree;
  isSelected: boolean;
  pathWidth: number;
  branchWidth: number;
}

export function WorktreeRow({
  worktree,
  isSelected,
  pathWidth,
  branchWidth,
}: Props) {
  const pointer = isSelected ? "▸" : " ";
  const displayPath = tildify(worktree.path);

  return (
    <Box>
      <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
        {pointer}{" "}
      </Text>
      <Box width={pathWidth}>
        <Text color={isSelected ? "cyan" : undefined} wrap="truncate">
          {displayPath}
        </Text>
      </Box>
      <Text> </Text>
      <Box width={branchWidth}>
        <Text
          color="yellow"
          dimColor={!isSelected}
          wrap="truncate"
        >
          {worktree.branch || "(detached)"}
        </Text>
      </Box>
      <Text> </Text>
      {worktree.isBare ? (
        <Text dimColor>(bare)</Text>
      ) : (
        <StatusBadge
          state={worktree.pr?.state ?? null}
          loading={worktree.prLoading}
        />
      )}
      {worktree.tmuxSession && (
        <>
          <Text> </Text>
          <Text color={worktree.tmuxAttached ? "green" : "blue"}>
            {worktree.tmuxAttached ? "▶" : "◼"} tmux:{worktree.tmuxSession}
          </Text>
        </>
      )}
    </Box>
  );
}
