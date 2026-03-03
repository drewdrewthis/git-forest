Feature: Persistent Orchard tmux Session
  As a developer using git-orchard
  I want orchard to run as a persistent named tmux session
  So that I can switch to it instantly without re-launching the TUI or losing state

  Background:
    Given the user has sourced the orchard shell function
    And git-orchard is installed and on PATH

  # ---------------------------------------------------------------------------
  # E2E: happy paths — full system, no mocking
  # ---------------------------------------------------------------------------

  @e2e
  Scenario: Launching orchard outside tmux creates the session and attaches
    Given no tmux session named "orchard" exists
    And the user is not inside a tmux session
    When the user runs "orchard"
    Then a tmux session named "orchard" is created
    And the session runs "git-orchard" in a restart loop
    And the user is attached to the "orchard" session

  @e2e
  Scenario: Launching orchard outside tmux attaches to an existing session
    Given a tmux session named "orchard" already exists
    And the user is not inside a tmux session
    When the user runs "orchard"
    Then the user is attached to the "orchard" session
    And no duplicate session is created

  @e2e
  Scenario: Launching orchard from inside tmux switches client to the orchard session
    Given a tmux session named "orchard" already exists
    And the user is inside a tmux session
    When the user runs "orchard"
    Then "tmux switch-client -t orchard" is executed
    And the current shell does not exit
    And no new tmux session is created

  @e2e
  Scenario: Launching orchard from inside tmux creates session then switches if it does not exist
    Given no tmux session named "orchard" exists
    And the user is inside a tmux session
    When the user runs "orchard"
    Then a tmux session named "orchard" is created in detached mode
    And "tmux switch-client -t orchard" is executed

  @e2e
  Scenario: Pressing t on a worktree switches to its tmux session without exiting orchard
    Given the orchard TUI is running in the "orchard" session
    And a worktree on branch "feat/login" exists with no tmux session
    And the user has selected that worktree
    When the user presses "t"
    Then a new tmux session is created for the worktree
    And the client switches to the worktree session via "tmux switch-client"
    And the orchard TUI process remains running

  @e2e
  Scenario: Pressing t on a worktree with an existing session switches to it without exiting orchard
    Given the orchard TUI is running in the "orchard" session
    And a worktree on branch "feat/login" has an existing tmux session named "feat-login"
    And the user has selected that worktree
    When the user presses "t"
    Then the client switches to the "feat-login" session via "tmux switch-client"
    And the orchard TUI process remains running

  @e2e
  Scenario: The orchard session restarts git-orchard after it exits
    Given the orchard session is running with the restart loop
    When the git-orchard process exits (e.g., after a worktree deletion)
    Then git-orchard is relaunched automatically within the same session

  @e2e
  Scenario: The popup keybinding ^B o from a worktree session switches back to orchard
    Given a worktree session "feat-login" is active with the ^B o keybinding configured
    And a tmux session named "orchard" exists
    When the user presses "^B o" inside the worktree session
    Then the "orchard" session is displayed in the popup or switched to

  @e2e
  Scenario: The orchard UI refreshes automatically while running as a persistent session
    Given the orchard TUI is running in the "orchard" session
    When a new worktree is created externally after the TUI started
    Then the TUI reflects the new worktree without the user pressing "r"

  # ---------------------------------------------------------------------------
  # Integration: edge cases, error handling, module boundaries
  # ---------------------------------------------------------------------------

  @integration
  Scenario: switchToSession creates session when it does not exist before switching
    Given no tmux session named "feat-login" exists
    When switchToSession is called with sessionName "feat-login" and worktreePath "/repo/feat-login"
    Then "tmux new-session -d -s feat-login -c /repo/feat-login" is executed
    And "tmux switch-client -t feat-login" is executed afterwards

  @integration
  Scenario: switchToSession skips creation when session already exists
    Given a tmux session named "feat-login" already exists
    When switchToSession is called with sessionName "feat-login" and worktreePath "/repo/feat-login"
    Then "tmux new-session" is not executed
    And "tmux switch-client -t feat-login" is executed

  @integration
  Scenario: switchToSession configures status bar and popup keybinding on new session
    Given no tmux session named "feat-login" exists
    When switchToSession is called with sessionName "feat-login", branch "feat/login", and no PR
    Then the new session is created with status bar options set
    And the "^B o" popup keybinding is configured on the session

  @integration
  Scenario: The shell function creates the orchard session when tmux has no sessions
    Given tmux is running but has no sessions
    When the shell function runs "orchard"
    Then it creates a session named "orchard" running "while true; do git-orchard; done"

  @integration
  Scenario: The shell function handles tmux not running by starting the server
    Given tmux is not running
    When the shell function runs "orchard"
    Then it starts tmux and creates the "orchard" session

  @integration
  Scenario: Pressing t on a bare worktree does nothing
    Given the orchard TUI is running
    And the user has selected a bare worktree
    When the user presses "t"
    Then no tmux session is created or switched to
    And the orchard TUI remains unchanged

  @integration
  Scenario: Pressing q exits the git-orchard process but the session loop restarts it
    Given the orchard TUI is running in the "orchard" session under the restart loop
    When the user presses "q"
    Then the git-orchard process exits
    And the restart loop relaunches git-orchard within the same session

  @integration
  Scenario: The ^B o popup keybinding switches to orchard session if it exists
    Given a worktree session is active with the ^B o binding
    And a tmux session named "orchard" exists
    When the popup command runs
    Then "tmux switch-client -t orchard" is executed rather than launching a new git-orchard process

  @integration
  Scenario: Auto-refresh interval fires while orchard is idle
    Given the orchard TUI is running with auto-refresh configured
    When the auto-refresh interval elapses
    Then the worktree list is reloaded from git

  # ---------------------------------------------------------------------------
  # Unit: pure logic, individual functions, branches
  # ---------------------------------------------------------------------------

  @unit
  Scenario: getShellFunction returns a function that checks for the orchard session
    When getShellFunction is called
    Then the output contains a check for the "orchard" tmux session
    And the output does not contain "CD_TARGET_FILE" logic
    And the output does not contain "git-orchard-cd-target"
    And the output does not contain "git-orchard-tmux-cmd"

  @unit
  Scenario: getShellFunction uses switch-client when inside tmux
    When getShellFunction is called
    Then the output contains 'tmux switch-client -t orchard' for the inside-tmux branch
    And it is guarded by a check on the TMUX environment variable

  @unit
  Scenario: getShellFunction uses attach-session when outside tmux
    When getShellFunction is called
    Then the output contains 'tmux attach-session -t orchard' for the outside-tmux branch

  @unit
  Scenario: getShellFunction includes a restart loop for git-orchard
    When getShellFunction is called
    Then the output contains a loop construct that re-executes git-orchard on exit

  @unit
  Scenario: paths.ts does not export CD_TARGET_FILE
    When the paths module is imported
    Then CD_TARGET_FILE is not an exported symbol

  @unit
  Scenario: switchToSession resolves the session name with slashes replaced by dashes
    Given a branch name of "feat/new-login"
    When switchToSession derives the session name
    Then the session name used is "feat-new-login"

  @unit
  Scenario: WorktreeList does not render the "enter cd" key hint
    Given the WorktreeList component renders with a list of worktrees
    When the key hint bar is inspected
    Then "enter" and "cd" are absent from the rendered output

  @unit
  Scenario: WorktreeList t handler calls switchToSession and does not call exit
    Given a non-bare worktree is selected in WorktreeList
    When the user presses "t"
    Then switchToSession is called with the correct session name and worktree path
    And the ink exit function is not called

  @unit
  Scenario: WorktreeList enter handler is not present
    Given WorktreeList is rendered
    When a key listener for "return" is inspected
    Then no handler writes to CD_TARGET_FILE or calls exit for the enter key
