Feature: Orchard-Owned Single Tmux Session
  As a developer using git-orchard
  I want orchard to own one tmux session with all worktrees as named windows
  So that I have a unified tmux workspace with persistent context and a cheatsheet

  Background:
    Given the user has sourced the orchard shell function
    And git-orchard is installed and on PATH

  # ---------------------------------------------------------------------------
  # E2E: happy paths — full system, no mocking
  # ---------------------------------------------------------------------------

  @e2e
  Scenario: Launching orchard outside tmux creates the session with full UI styling
    Given no tmux session named "orchard" exists
    And the user is not inside a tmux session
    When the user runs "orchard"
    Then a tmux session named "orchard" is created
    And the status bar is positioned at the top
    And the status-left shows the orchard tree icon and brand name
    And the status-right shows the tmux cheatsheet
    And window 1 is named "orchard"
    And the session runs git-orchard in a restart loop

  @e2e
  Scenario: Pressing t on a worktree opens it as a new named window in the orchard session
    Given the orchard TUI is running in window 1 of the "orchard" session
    And a worktree on branch "feat/login" exists at "/repo/feat-login"
    And no window named "feat/login" exists in the "orchard" session
    And the user has selected the "feat/login" worktree
    When the user presses "t"
    Then a new window named "feat/login" is created in the "orchard" session
    And the new window's working directory is "/repo/feat-login"
    And the tmux client switches to that window
    And window 1 still exists and still runs the orchard TUI

  @e2e
  Scenario: Pressing t on a worktree whose window already exists switches to that window
    Given the orchard TUI is running in window 1 of the "orchard" session
    And a window named "feat/login" already exists at index 2 in the "orchard" session
    And the user has selected the "feat/login" worktree
    When the user presses "t"
    Then no new window is created
    And the tmux client switches to window 2 in the "orchard" session

  @e2e
  Scenario: Pressing Ctrl-B 1 from a worktree window returns to the orchard TUI
    Given the orchard session has window 1 named "orchard" running the TUI
    And the user is on window 2 named "feat/login"
    When the user presses "^B 1"
    Then the tmux client switches to window 1
    And the orchard TUI is visible

  @e2e
  Scenario: The worktree list shows the window index for open worktree windows
    Given the orchard TUI is running in the "orchard" session
    And a window named "feat/login" exists at index 2 in the "orchard" session
    And a worktree on branch "feat/login" is in the worktree list
    When the worktree list refreshes
    Then the "feat/login" worktree shows window index 2
    And a worktree with no open window shows no window index

  @e2e
  Scenario: The orchard session restarts git-orchard after it exits
    Given the orchard session is running with the restart loop in window 1
    When the git-orchard process exits
    Then git-orchard is relaunched automatically within window 1 of the same session

  @e2e
  Scenario: Attaching to the orchard session from outside tmux when it already exists
    Given a tmux session named "orchard" already exists
    And the user is not inside a tmux session
    When the user runs "orchard"
    Then "tmux attach-session -t orchard" is executed
    And no duplicate session is created

  @e2e
  Scenario: Switching to the orchard session from inside tmux when it already exists
    Given a tmux session named "orchard" already exists
    And the user is inside a different tmux session
    When the user runs "orchard"
    Then "tmux switch-client -t orchard" is executed
    And no duplicate session is created

  # ---------------------------------------------------------------------------
  # Integration: edge cases, error handling, module boundaries
  # ---------------------------------------------------------------------------

  @integration
  Scenario: openWorktreeWindow creates a new window when none exists for the branch
    Given the "orchard" session exists
    And no window named "feat/login" exists in the "orchard" session
    When openWorktreeWindow is called with branch "feat/login" and path "/repo/feat-login"
    Then "tmux new-window -t orchard -n feat/login -c /repo/feat-login" is executed
    And automatic-rename is off for the new window

  @integration
  Scenario: openWorktreeWindow switches to existing window without creating a new one
    Given the "orchard" session exists
    And a window at index 3 named "feat/login" exists in the "orchard" session
    When openWorktreeWindow is called with branch "feat/login" and path "/repo/feat-login"
    Then "tmux new-window" is not executed
    And "tmux select-window -t orchard:3" is executed

  @integration
  Scenario: Pressing t on a bare worktree does nothing
    Given the orchard TUI is running in the "orchard" session
    And the user has selected a bare worktree
    When the user presses "t"
    Then no tmux window is created or switched to
    And the orchard TUI remains unchanged

  @integration
  Scenario: listOrchardWindows returns an empty list when tmux is not running
    Given tmux is not running
    When listOrchardWindows is called
    Then it returns an empty array without throwing

  @integration
  Scenario: listOrchardWindows returns an empty list when the orchard session does not exist
    Given tmux is running but no session named "orchard" exists
    When listOrchardWindows is called
    Then it returns an empty array without throwing

  @integration
  Scenario: The session creation command sets status-position to top
    Given no tmux session named "orchard" exists
    When the orchard shell function creates the session
    Then the tmux option "status-position" is set to "top"

  @integration
  Scenario: The session creation command sets the cheatsheet in status-right
    Given no tmux session named "orchard" exists
    When the orchard shell function creates the session
    Then the tmux option "status-right" contains "^B 1 menu"
    And the tmux option "status-right" contains "^B d detach"
    And the tmux option "status-right" contains "^B z zoom"

  @integration
  Scenario: The session creation command configures window-status formats
    Given no tmux session named "orchard" exists
    When the orchard shell function creates the session
    Then the tmux option "window-status-format" is set
    And the tmux option "window-status-current-format" is set with bold highlighting

  @integration
  Scenario: Pressing q exits git-orchard but the restart loop relaunches it in window 1
    Given the orchard TUI is running in window 1 of the "orchard" session under the restart loop
    When the user presses "q"
    Then the git-orchard process exits
    And the restart loop relaunches git-orchard in the same window

  @integration
  Scenario: The worktree list auto-refresh picks up newly opened worktree windows
    Given the orchard TUI is running with auto-refresh configured
    And no window for branch "feat/login" is open at the start
    When a window named "feat/login" is opened in the "orchard" session externally
    And the auto-refresh interval elapses
    Then the "feat/login" worktree shows its window index in the worktree list

  # ---------------------------------------------------------------------------
  # Unit: pure logic, individual functions, branches
  # ---------------------------------------------------------------------------

  @unit
  Scenario: getShellFunction sets status-position top on session creation
    When getShellFunction is called
    Then the output contains "status-position top"

  @unit
  Scenario: getShellFunction sets status-left with the orchard brand
    When getShellFunction is called
    Then the output contains "status-left"
    And the output contains "orchard"

  @unit
  Scenario: getShellFunction sets status-right with the tmux cheatsheet
    When getShellFunction is called
    Then the output contains "status-right"
    And the output contains "^B 1 menu"
    And the output contains "^B d detach"

  @unit
  Scenario: getShellFunction sets window-status-format and window-status-current-format
    When getShellFunction is called
    Then the output contains "window-status-format"
    And the output contains "window-status-current-format"

  @unit
  Scenario: getShellFunction names window 1 "orchard"
    When getShellFunction is called
    Then the output contains "rename-window 'orchard'"

  @unit
  Scenario: getShellFunction includes a restart loop for git-orchard in the session command
    When getShellFunction is called
    Then the output contains a loop construct that re-executes git-orchard on exit

  @unit
  Scenario: getShellFunction does not reference switchToSession or per-session status bar setup
    When getShellFunction is called
    Then the output does not contain "new-session" with per-worktree styling arguments

  @unit
  Scenario: findWindowForWorktree returns the window index when a window name matches the branch
    Given a list of orchard windows containing index 2 named "feat/login"
    When findWindowForWorktree is called with branch "feat/login"
    Then it returns window index 2

  @unit
  Scenario: findWindowForWorktree returns null when no window matches the branch
    Given a list of orchard windows with no window named "feat/login"
    When findWindowForWorktree is called with branch "feat/login"
    Then it returns null

  @unit
  Scenario: Worktree type has windowIndex instead of tmuxSession and tmuxAttached
    When the Worktree type is inspected
    Then it has a "windowIndex" field of type "number | null"
    And it does not have a "tmuxSession" field
    And it does not have a "tmuxAttached" field

  @unit
  Scenario: WorktreeRow renders the window index when the worktree has an open window
    Given a worktree with windowIndex 2 and branch "feat/login"
    When WorktreeRow renders
    Then it displays the window index "2"
    And it does not display a "tmux:<session>" label

  @unit
  Scenario: WorktreeRow renders nothing for the window column when windowIndex is null
    Given a worktree with windowIndex null
    When WorktreeRow renders
    Then no window indicator is displayed for that row

  @unit
  Scenario: WorktreePreview renders the window index when the worktree has an open window
    Given a worktree with windowIndex 3 and branch "feat/login"
    When WorktreePreview renders
    Then it displays the window index "3"
    And it does not display tmuxSession or tmuxAttached indicators

  @unit
  Scenario: WorktreeList t handler calls openWorktreeWindow not switchToSession
    Given a non-bare worktree is selected in WorktreeList
    When the user presses "t"
    Then openWorktreeWindow is called with the correct branch and worktree path
    And switchToSession is not called

  @unit
  Scenario: useWorktrees enriches worktrees with windowIndex from listOrchardWindows
    Given listOrchardWindows returns a window at index 2 named "feat/login"
    And a worktree on branch "feat/login" exists
    When useWorktrees runs its refresh cycle
    Then the "feat/login" worktree has windowIndex 2
    And listTmuxSessions is not called
    And findSessionForWorktree is not called

  @unit
  Scenario: useWorktrees sets windowIndex to null for worktrees with no open window
    Given listOrchardWindows returns no windows matching the worktree branch
    When useWorktrees runs its refresh cycle
    Then the worktree has windowIndex null
