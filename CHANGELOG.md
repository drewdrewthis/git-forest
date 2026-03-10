# Changelog

## [Unreleased]

### Features

* remote worktree browsing — view and jump into remote tmux sessions over SSH or mosh
* worktree transfer — push/pull worktrees between local and remote machines (`p` key)
* merge conflict detection — shown as top-priority status badge
* issue tracking — links worktrees to GitHub issues and displays issue state
* `--json` flag for machine-readable worktree output

### Bug Fixes

* fix remote session attach — detect dead connections, surface errors in UI instead of silently failing
* fix mosh locale error (`LC_CTYPE=UTF-8`) by setting `LC_ALL=en_US.UTF-8` via env
* handle duplicate remote tmux sessions gracefully instead of erroring
* force PTY allocation with `ssh -tt` for remote tmux attach inside detached sessions
* pass remote command as spread args to `tmux new-session` (was incorrectly joined as single string)

## [0.1.5](https://github.com/drewdrewthis/git-orchard/compare/git-orchard-v0.1.4...git-orchard-v0.1.5) (2026-03-06)


### Bug Fixes

* derive review status from latestReviews when branch protection is absent ([b5c72ea](https://github.com/drewdrewthis/git-orchard/commit/b5c72ea75a7ab655bd882b3665aa628833f90ea5))
* prioritize unresolved comments over failing CI in TUI status ([14ab5dc](https://github.com/drewdrewthis/git-orchard/commit/14ab5dc72f0e5dcaba4d8224dfb7ba27c07c0b61))

## [0.1.4](https://github.com/drewdrewthis/git-orchard/compare/git-orchard-v0.1.3...git-orchard-v0.1.4) (2026-03-03)


### Features

* add file-based debug logging infrastructure ([3e034bb](https://github.com/drewdrewthis/git-orchard/commit/3e034bb97537901bbe52dc02c6b27be53a3410d1))
* add TitledBox to worktree list and preview pane ([09efe53](https://github.com/drewdrewthis/git-orchard/commit/09efe53cf77f0727c099f1235fb724842ef856a4))
* new banner, number key navigation, upgrade command, consistent table columns ([fcd970d](https://github.com/drewdrewthis/git-orchard/commit/fcd970d38251be432a6e571565a25f43c32354ff))


### Bug Fixes

* cleanup view loses state on background refresh and fails on broken worktrees ([93b22f9](https://github.com/drewdrewthis/git-orchard/commit/93b22f97467699503553dc2d6e97a86028f352b6))
* escape % in tmux cheatsheet and add prefix key hint ([59bb52b](https://github.com/drewdrewthis/git-orchard/commit/59bb52b14af444356e1e67191349b4a48030de43))
* simplify tmux cheatsheet to key: action format ([f5b1d38](https://github.com/drewdrewthis/git-orchard/commit/f5b1d38e84f65d4eee8bfa127831a0bde7afc3f6))
* tmux cheatsheet shows arrows instead of ←→ for pane navigation ([7222174](https://github.com/drewdrewthis/git-orchard/commit/7222174648821aeee0967b3b6f09cb81496bf8c9))

## [0.1.3](https://github.com/drewdrewthis/git-orchard/compare/git-orchard-v0.1.2...git-orchard-v0.1.3) (2026-03-03)


### Features

* add tmux status bar and popup keybinding for Orchard context ([cf775d3](https://github.com/drewdrewthis/git-orchard/commit/cf775d34fe08b617cf071f28ba85f147df8fef76))
* improve cleanup and tmux detach experience ([279b4e2](https://github.com/drewdrewthis/git-orchard/commit/279b4e233cb99ff746d120d1f9165c58c31ba0bf))
* persistent orchard tmux session with consistent UI across all sessions ([9d6c5f5](https://github.com/drewdrewthis/git-orchard/commit/9d6c5f52f3454b8a2310c3d1712dd8b341d84fab))
* unified PR status with CI checks and batch fetching ([7d15516](https://github.com/drewdrewthis/git-orchard/commit/7d15516aa6ef6098d8a2723f370f7c2d1dcb9ef7))


### Bug Fixes

* avoid GitHub API timeout by removing statusCheckRollup from gh pr list ([00aec16](https://github.com/drewdrewthis/git-orchard/commit/00aec16bcc33331043e2b403731726d38ccd5a16))
* **ci:** add repository field to package.json for provenance verification ([af0ed76](https://github.com/drewdrewthis/git-orchard/commit/af0ed762caf4b9a61141cd8451e16aec8f15bf29))
* **ci:** bump to Node 24 and latest npm for OIDC trusted publishing support ([f4bfd5b](https://github.com/drewdrewthis/git-orchard/commit/f4bfd5b4076fd1771a2526190cecf69f23ae3385))
* **ci:** use npm publish for OIDC trusted publishing compatibility ([9d608a8](https://github.com/drewdrewthis/git-orchard/commit/9d608a8660e3fcd5946a73a7b44ca4d2d9d32a28))
* execute tmux commands from ^B o popup ([75ad7f8](https://github.com/drewdrewthis/git-orchard/commit/75ad7f8dfffeb7b233738c7a16395f06419352bf))


### Performance Improvements

* parallelize worktree removal in cleanup ([6f1cfb4](https://github.com/drewdrewthis/git-orchard/commit/6f1cfb43f9934b27e1f97ddb700e163ac361f882))

## [0.1.2](https://github.com/drewdrewthis/git-orchard/compare/git-orchard-v0.1.1...git-orchard-v0.1.2) (2026-02-19)


### Bug Fixes

* address review violations across security, correctness, and style ([7d6da4b](https://github.com/drewdrewthis/git-orchard/commit/7d6da4b7918f26a85b6bc54c4ad31743093b0d41))
* resolve submodule main worktree path and unblock error screen ([2dba479](https://github.com/drewdrewthis/git-orchard/commit/2dba479f22d7e4ee9a9e1e22bf53a3cf761b645d))
