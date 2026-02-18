export function getShellFunction(): string {
  return `# git-forest - git worktree manager
forest() {
  local uid=$(id -u)
  local tmpbase="\${TMPDIR:-/tmp}"
  tmpbase="\${tmpbase%/}"
  local cdfile="$tmpbase/git-forest-cd-target-$uid"
  local tmuxfile="$tmpbase/git-forest-tmux-cmd-$uid"
  command git-forest "$@"
  local target tmuxcmd
  target=$(cat "$cdfile" 2>/dev/null)
  tmuxcmd=$(cat "$tmuxfile" 2>/dev/null)
  rm -f "$cdfile" "$tmuxfile"
  if [ -n "$tmuxcmd" ]; then
    eval "$tmuxcmd"
  elif [ -n "$target" ] && [ -d "$target" ]; then
    cd "$target" || return
  fi
}`;
}

export function getInitInstructions(): string {
  const shell = process.env.SHELL || "/bin/zsh";
  const rcFile = shell.includes("zsh") ? "~/.zshrc" : "~/.bashrc";

  return `Add this to your ${rcFile}:

${getShellFunction()}

Then reload your shell:
  source ${rcFile}

This creates a "forest" command that wraps git-forest so selecting a worktree will cd into it.`;
}
