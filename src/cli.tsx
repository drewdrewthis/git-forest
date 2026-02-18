#!/usr/bin/env node
import { render } from "ink";
import meow from "meow";
import App from "./app.js";
import { handleInit } from "./commands/init.js";

const cli = meow(
  `
  Usage
    $ git-forest              Interactive worktree manager
    $ git-forest init         Print shell function for cd integration
    $ git-forest cleanup      Find worktrees with merged PRs to remove

  Navigation
    ↑/↓     Select worktree
    enter   cd into selected worktree
    t       tmux into worktree (attach or create session)
    d       Delete selected worktree
    c       Cleanup merged worktrees
    r       Refresh list
    q       Quit
`,
  {
    importMeta: import.meta,
  }
);

const command = cli.input[0];

if (command === "init") {
  handleInit();
} else {
  render(<App command={command} />);
}
