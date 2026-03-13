# Best Practices

## Naming

- **No abbreviations.** Use full, descriptive names everywhere — variables, parameters, functions, files.
  - `worktree` not `wt`
  - `session` not `sess`
  - `index` not `idx`
- Variable names reveal intent. If a name needs a comment, rename it.

## Code Style

- Follow the conventions in the existing codebase. When in doubt, match what's already there.
- One concept per function. If a function does two things, split it.
- Prefer `const` over `let`. Never use `var`.
- No `any` in TypeScript — use proper types or `unknown` with narrowing.

## Error Handling

- External boundaries (git, gh, tmux) should catch and handle errors gracefully.
- Internal code can trust its own types — don't add redundant validation between trusted modules.
- Log errors via `log.error()` / `log.warn()` before swallowing them.

## Testing

- Every change ships with tests.
- Test behavior, not implementation.
- One expectation per test.
- Use factories (e.g., `makeWorktree()`) for test data.
- See [BetterSpecs](https://www.betterspecs.org/) for guidelines.

## Logging

- Use the `log` module (`src/lib/log.ts`) for debug output — never `console.log` or `console.error` in library code.
- Add `log.time` / `log.timeEnd` around operations that call external tools.
- Add `log.info` at operation boundaries (entering a mode, completing a batch).
- See [ADR-002](adr/002-debug-logging.md) for the full logging decision.

## Clipboard with Mosh + tmux

**Problem:** mosh strips OSC 52 sequences, so tmux's clipboard integration (`set-clipboard on`) silently fails — yanked text never reaches your local clipboard.

**Fix:** add these lines to the remote `~/.tmux.conf`:

```
set -g set-clipboard on
set -ag terminal-overrides ",xterm-256color:Ms=\\E]52;c;%p2%s\\7"
```

Replace `xterm-256color` with whatever `$TERM` reports inside your mosh session (usually `xterm-256color`, but check).

For tmux 3.3+, also add:

```
set -g allow-passthrough on
```

**Caveats:**

- Mosh caps clipboard data at ~1.5 KB (one UDP packet). Copies larger than that will be silently truncated.
- Requires a reasonably recent mosh on both client and server (1.3.x+). Older versions don't forward OSC 52 at all.
