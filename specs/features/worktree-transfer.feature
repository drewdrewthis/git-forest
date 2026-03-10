Feature: Worktree Transfer (Push/Pull)
  As a developer using git-orchard with a remote machine
  I want to transfer worktrees between local and remote with a single keypress
  So that I can seamlessly hand off work between machines without leaving stale worktrees behind

  Background:
    Given git-orchard is running in the orchard TUI
    And the local and remote repos share the same git origin

  # ===========================================================================
  # Config: single remote (migration from remotes[])
  # ===========================================================================

  @unit
  Scenario: loadConfig reads new single-remote config shape
    Given .git/orchard.json contains {"remote": {"host": "ubuntu@10.0.3.56", "repoPath": "/home/ubuntu/repo"}}
    When loadConfig is called
    Then it returns remote with host "ubuntu@10.0.3.56" and repoPath "/home/ubuntu/repo"

  @unit
  Scenario: loadConfig migrates old remotes array to single remote
    Given .git/orchard.json contains {"remotes": [{"name": "ec2", "host": "ubuntu@10.0.3.56", "repoPath": "/home/ubuntu/repo"}]}
    When loadConfig is called
    Then it returns remote with host "ubuntu@10.0.3.56" and repoPath "/home/ubuntu/repo"

  @unit
  Scenario: loadConfig returns no remote when config has no remote key
    Given .git/orchard.json contains {}
    When loadConfig is called
    Then it returns remote as undefined

  @unit
  Scenario: loadConfig returns no remote when config file does not exist
    Given .git/orchard.json does not exist
    When loadConfig is called
    Then it returns remote as undefined

  # ===========================================================================
  # Transfer: path derivation
  # ===========================================================================

  @unit
  Scenario: deriveRemoteWorktreePath generates path from branch
    Given a remote with repoPath "/home/ubuntu/repo"
    And a branch "issue1707/add-metadata"
    When deriveRemoteWorktreePath is called
    Then it returns "/home/ubuntu/worktrees/worktree-issue1707-add-metadata"

  @unit
  Scenario: deriveLocalWorktreePath generates resolved absolute path
    Given the repo root is "/Users/dev/project"
    And a branch "issue1707/add-metadata"
    When deriveLocalWorktreePath is called
    Then it returns "/Users/dev/worktrees/worktree-issue1707-add-metadata"

  @unit
  Scenario: sanitizeBranchSlug strips shell-unsafe characters
    Given a branch "feat/login;rm -rf /"
    When sanitizeBranchSlug is called
    Then the result contains no semicolons, backticks, pipes, or spaces

  # ===========================================================================
  # Transfer: push (local -> remote)
  # ===========================================================================

  @integration
  Scenario: pushToRemote commits WIP, pushes, creates remote worktree and tmux session, tears down local
    Given a local worktree at "/repo/worktrees/feat-login" on branch "feat/login"
    And the remote is reachable
    When pushToRemote is called
    Then it runs "git add -u" in the worktree directory
    And it commits with message "[orchard] WIP handoff" if there are staged changes
    And it pushes the branch to origin with -u flag
    And it creates a worktree on the remote via SSH
    And it creates a tmux session on the remote
    And it kills the local tmux session if one exists
    And it removes the local worktree

  @integration
  Scenario: pushToRemote skips commit when worktree is clean
    Given a local worktree with no uncommitted changes
    When pushToRemote is called
    Then it does not run git commit
    And it still pushes and creates the remote worktree

  @integration
  Scenario: pushToRemote refuses when worktree has merge conflicts
    Given a local worktree with hasConflicts true
    When pushToRemote is called
    Then it throws an error mentioning merge conflicts
    And no remote worktree is created

  @integration
  Scenario: pushToRemote does not tear down local until remote setup succeeds
    Given a local worktree on branch "feat/login"
    And the remote SSH command to create a worktree fails
    When pushToRemote is called
    Then the local worktree still exists
    And the local tmux session is not killed

  @integration
  Scenario: pushToRemote reuses existing remote worktree if one already exists for the branch
    Given a local worktree on branch "feat/login"
    And a remote worktree for "feat/login" already exists
    When pushToRemote is called
    Then it does not fail on git worktree add
    And it pulls the latest into the existing remote worktree instead

  @integration
  Scenario: pushToRemote does not create duplicate WIP commits on retry
    Given a local worktree whose last commit message is "[orchard] WIP handoff"
    When pushToRemote is called
    Then it does not create another commit
    And it pushes the existing branch state

  # ===========================================================================
  # Transfer: pull (remote -> local)
  # ===========================================================================

  @integration
  Scenario: pullToLocal commits remote WIP, fetches locally, creates local worktree, tears down remote
    Given a remote worktree on branch "feat/login"
    And the remote is reachable
    When pullToLocal is called
    Then it commits remote WIP via SSH using "git add -u" if there are changes
    And it pushes from the remote
    And it runs "git fetch origin feat/login" locally
    And it creates a local worktree
    And it creates a local tmux session
    And it kills the remote tmux session
    And it removes the remote worktree

  @integration
  Scenario: pullToLocal does not tear down remote until local setup succeeds
    Given a remote worktree on branch "feat/login"
    And the local git worktree add command fails
    When pullToLocal is called
    Then the remote worktree still exists
    And the remote tmux session is not killed

  @integration
  Scenario: pullToLocal refuses when remote worktree has merge conflicts
    Given a remote worktree with merge conflicts
    When pullToLocal is called
    Then it throws an error mentioning merge conflicts
    And the remote worktree is not torn down

  @integration
  Scenario: pullToLocal reuses existing local worktree if one already exists for the branch
    Given a remote worktree on branch "feat/login"
    And a local worktree for "feat/login" already exists
    When pullToLocal is called
    Then it does not fail on git worktree add
    And it pulls the latest into the existing local worktree instead

  # ===========================================================================
  # TUI: Transfer component
  # ===========================================================================

  @unit
  Scenario: pressing p on a local worktree enters transfer confirmation
    Given a remote is configured
    And a local non-bare worktree is selected
    When the user presses "p"
    Then the Transfer confirmation view is shown
    And it indicates direction "push to remote"

  @unit
  Scenario: transfer confirmation warns when source session is attached
    Given the Transfer confirmation view is shown for a push
    And the worktree has tmuxAttached true
    Then it warns that an active session will be killed

  @unit
  Scenario: transfer confirmation shows no warning when source session is detached
    Given the Transfer confirmation view is shown for a push
    And the worktree has tmuxAttached false
    Then no active session warning is shown

  @unit
  Scenario: pressing p on a remote worktree enters transfer confirmation
    Given a remote worktree is selected
    When the user presses "p"
    Then the Transfer confirmation view is shown
    And it indicates direction "pull to local"

  @unit
  Scenario: pressing p shows warning when no remote is configured
    Given no remote is configured
    And a local worktree is selected
    When the user presses "p"
    Then a warning message "No remote configured" is shown briefly
    And the worktree list remains unchanged

  @unit
  Scenario: pressing p shows warning on a bare worktree
    Given a remote is configured
    And a bare worktree is selected
    When the user presses "p"
    Then a warning message "Cannot transfer bare worktree" is shown briefly
    And the worktree list remains unchanged

  @unit
  Scenario: pressing p shows warning on a worktree with conflicts
    Given a remote is configured
    And a local worktree with hasConflicts true is selected
    When the user presses "p"
    Then a warning message "Resolve merge conflicts first" is shown briefly
    And the worktree list remains unchanged

  @unit
  Scenario: pressing p shows warning on a detached HEAD worktree
    Given a remote is configured
    And a worktree with branch null is selected
    When the user presses "p"
    Then a warning message "Cannot transfer detached HEAD" is shown briefly
    And the worktree list remains unchanged

  @unit
  Scenario: p keybind hint is hidden when no remote is configured
    Given no remote is configured
    When the WorktreeList renders
    Then the keybind hints do not include "p"

  @unit
  Scenario: p keybind hint shows contextual direction
    Given a remote is configured
    And a local worktree is selected
    When the WorktreeList renders
    Then the keybind hints include "p push"
    When a remote worktree is selected
    Then the keybind hints include "p pull"

  @unit
  Scenario: confirming transfer with y starts the transfer
    Given the Transfer confirmation view is shown for a push
    When the user presses "y"
    Then the transfer progress view is shown with step updates

  @unit
  Scenario: cancelling transfer with n returns to worktree list
    Given the Transfer confirmation view is shown
    When the user presses "n"
    Then the worktree list is shown again

  @unit
  Scenario: transfer progress shows step-by-step status
    Given a transfer is in progress
    Then each step shows a spinner while active
    And completed steps show a checkmark

  @unit
  Scenario: transfer done view shows summary and returns on keypress
    Given a transfer has completed successfully
    Then it shows a success message with branch and direction
    When the user presses any key
    Then the worktree list is shown and refreshed

  @unit
  Scenario: transfer error view shows what went wrong and which step failed
    Given a transfer fails at the "Creating remote worktree" step
    Then it shows the error message from the failed step
    And completed steps still show checkmarks
    And the failed step shows an error icon
    When the user presses any key
    Then the worktree list is shown and refreshed

  @unit
  Scenario: warning messages auto-dismiss after a timeout
    Given a warning message is shown
    When 3 seconds elapse
    Then the warning message disappears

  # ===========================================================================
  # Display: remote worktrees show @host
  # ===========================================================================

  @unit
  Scenario: WorktreeRow shows @host for remote worktrees
    Given a worktree with remote "ubuntu@10.0.3.56"
    When WorktreeRow renders
    Then it displays "@10.0.3.56"

  @unit
  Scenario: WorktreeRow shows @host without user prefix when host has no @
    Given a worktree with remote "10.0.3.56"
    When WorktreeRow renders
    Then it displays "@10.0.3.56"

  # ===========================================================================
  # Challenge fixes: existing code improvements
  # ===========================================================================

  @unit
  Scenario: completed issues show "done" label not "merged"
    Given a worktree with issueState "completed" and no PR
    When StatusBadge renders
    Then it shows a checkmark icon with label "done"
    And it does not show label "merged"

  @unit
  Scenario: closed issues show "closed" label
    Given a worktree with issueState "closed" and no PR
    When StatusBadge renders
    Then it shows label "closed"

  @unit
  Scenario: lookupBranchPrs uses a single GraphQL query instead of N REST calls
    Given 10 branches need PR lookup
    When lookupBranchPrs is called
    Then it makes exactly 1 GraphQL API call
    And it returns a map of branch to PrInfo for all found PRs

  @unit
  Scenario: filterStale does not include worktrees with only issue-based staleness
    Given a worktree with issueState "closed" and no PR
    When filterStale is called
    Then the worktree is not included in the stale list
