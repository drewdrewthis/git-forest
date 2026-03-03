# git-orchard

A tmux-native TUI for managing git worktrees. Browse worktrees, preview live session content, and switch between them — all without leaving your terminal.

![TypeScript](https://img.shields.io/badge/TypeScript-blue) ![React Ink](https://img.shields.io/badge/React%20Ink-TUI-green) ![License: MIT](https://img.shields.io/badge/License-MIT-yellow)

## How it works

Orchard runs as a persistent named tmux session. Each worktree you open becomes its own tmux session. The orchard session stays alive in the background, auto-refreshing every 60 seconds, and you can jump back to it at any time with `^B o`.

```
orchard session (persistent, auto-refreshing)
├── worktree list + live preview
└── ^B o from any worktree session returns here

feat/login session
├── your shell / editor / claude
└── status bar: branch  PR#42 ◌ review  │  ^B o orchard  ^B ( prev ...
```

## Features

- **Worktree list** with branch, PR status, and review state
- **Live pane preview** — see what's running in each session before switching
- **Switch sessions** with Enter — creates the session if it doesn't exist
- **Consistent tmux UI** — every session gets the same styled status bar with a cheatsheet
- **PR status** from GitHub — failing CI, unresolved threads, changes requested, approved
- **Open PRs in browser** — jump straight to GitHub
- **Delete worktrees** with confirmation
- **Batch cleanup** — remove all worktrees with merged/closed PRs
- **Auto-refresh** — list updates in the background every 60s

## Install

```bash
npm install -g git-orchard
```

## Setup

```bash
git-orchard init
```

Add the printed shell function to your `~/.zshrc` or `~/.bashrc`, then reload:

```bash
source ~/.zshrc
```

This creates an `orchard` command that creates and attaches to the persistent orchard tmux session. Always use `orchard`, not `git-orchard` directly.

## Usage

```bash
orchard          # Open the orchard session (creates it if needed)
orchard cleanup  # Jump straight to cleanup view
orchard init     # Print shell function
```

### Keybindings in orchard

| Key | Action |
|-----|--------|
| `↑ / ↓` | Navigate worktrees |
| `enter` | Switch to worktree tmux session (creates if needed) |
| `o` | Open PR in browser |
| `d` | Delete selected worktree |
| `c` | Cleanup worktrees with merged/closed PRs |
| `r` | Refresh list |
| `q` | Quit |

### Tmux cheatsheet (shown in every session's status bar)

| Binding | Action |
|---------|--------|
| `^B o` | Switch to orchard session |
| `^B (` / `^B )` | Previous / next session |
| `^B %` | Split pane vertically |
| `^B "` | Split pane horizontally |
| `^B ←→` | Navigate panes |
| `^B z` | Zoom pane |
| `^B x` | Close pane |
| `^B d` | Detach session |

## Requirements

- Node.js 18+
- Git
- tmux
- [GitHub CLI](https://cli.github.com/) (`gh`) — optional, for PR status

## Contributing

1. Fork the repo and create a feature branch
2. Follow SOLID, KISS, YAGNI, and CUPID principles
3. Write tests for pure functions (BetterSpecs style)
4. Run `npm test` and make sure everything passes
5. Open a PR

```bash
npm install
npm test         # Run tests
npm run build    # Compile TypeScript
```

## License

MIT
