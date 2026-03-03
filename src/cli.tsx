#!/usr/bin/env node
import { render } from "ink";
import meow from "meow";
import App from "./app.js";
import { handleInit } from "./commands/init.js";
import { handleUpgrade } from "./commands/upgrade.js";

const cli = meow(
  `
  Usage
    $ git-orchard              Interactive worktree manager
    $ git-orchard init         Print shell function for tmux session integration
    $ git-orchard upgrade      Upgrade to the latest version
    $ git-orchard cleanup      Find worktrees with merged PRs to remove

  Navigation
    1-9     Jump to worktree by number
    ↑/↓     Select worktree
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
} else if (command === "upgrade") {
  await handleUpgrade();
} else {
  const app = render(<App command={command} />);
  await app.waitUntilExit();
}
