export function getShellFunction(): string {
  return `# git-orchard - git worktree manager
orchard() {
  local uid=$(id -u)
  local tmpbase="\${TMPDIR:-/tmp}"
  tmpbase="\${tmpbase%/}"
  local cdfile="$tmpbase/git-orchard-cd-target-$uid"
  local tmuxfile="$tmpbase/git-orchard-tmux-cmd-$uid"
  command git-orchard "$@"
  local target tmuxcmd
  local cdtmp tmptmp
  cdtmp="$tmpbase/git-orchard-cd-read-$$"
  tmptmp="$tmpbase/git-orchard-tmux-read-$$"
  mv "$cdfile" "$cdtmp" 2>/dev/null; target=$(cat "$cdtmp" 2>/dev/null); rm -f "$cdtmp"
  mv "$tmuxfile" "$tmptmp" 2>/dev/null; tmuxcmd=$(cat "$tmptmp" 2>/dev/null); rm -f "$tmptmp"
  if [ -n "$tmuxcmd" ]; then
    eval "$tmuxcmd"
    orchard
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

This creates an "orchard" command that wraps git-orchard so selecting a worktree will cd into it.`;
}
