export function getShellFunction(): string {
  return `# git-orchard - git worktree manager
orchard() {
  case "$1" in
    init|upgrade|--json|--help|-h) git-orchard "$@"; return ;;
  esac
  for arg in "$@"; do
    case "$arg" in
      --json|--help|-h) git-orchard "$@"; return ;;
    esac
  done

  local session="orchard"
  local cmd='while true; do git-orchard "$@"; done'

  if tmux has-session -t "$session" 2>/dev/null; then
    if [ -n "$TMUX" ]; then
      tmux switch-client -t "$session"
    else
      tmux attach-session -t "$session"
    fi
  else
    local cheatsheet='#[fg=colour8]^B ( prev  ^B ) next  ^B % vert  ^B " horiz  ^B z zoom  ^B x close  ^B d detach'
    local status_left='#[fg=colour2,bold] orchard #[fg=colour248,nobold]'
    tmux new-session -d -s "$session" /bin/zsh -c "$cmd"
    tmux set-option -t "$session" status on
    tmux set-option -t "$session" status-style 'bg=colour235,fg=colour248'
    tmux set-option -t "$session" status-left-length 60
    tmux set-option -t "$session" status-right-length 120
    tmux set-option -t "$session" status-left "$status_left"
    tmux set-option -t "$session" status-right "$cheatsheet"
    if [ -n "$TMUX" ]; then
      tmux switch-client -t "$session"
    else
      tmux attach-session -t "$session"
    fi
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

This creates an "orchard" command that launches git-orchard in a persistent tmux session.`;
}
