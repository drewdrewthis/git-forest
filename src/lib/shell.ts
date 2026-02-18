export function getShellFunction(): string {
  return `# git-forest - git worktree manager
forest() {
  local cdfile="\${TMPDIR:-/tmp}/git-forest-cd-target-$(id -u)"
  command git-forest "$@"
  local target
  target=$(cat "$cdfile" 2>/dev/null)
  rm -f "$cdfile"
  if [ -n "$target" ] && [ -d "$target" ]; then
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
