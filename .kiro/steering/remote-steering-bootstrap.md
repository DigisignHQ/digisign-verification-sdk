---
inclusion: always
---

# Remote Steering Bootstrap

Global steering docs are shipped as a git submodule at `.kiro/global-steering/` in each
project repo. On remote/ephemeral environments, the submodule may not be initialized.

## Step 1: Self-Registration Check

Before anything else, verify this bootstrap doc and the global steering submodule are
registered in the project's agent config files. Check both `CLAUDE.md` and `AGENTS.md`
at the project root.

**If the project has no `.kiro/global-steering/` submodule:**

1. Add the submodule:
   ```bash
   git submodule add https://github.com/servicecute/global-steering.git .kiro/global-steering
   ```

2. Update the Global Steering Index in both `CLAUDE.md` and `AGENTS.md` to use
   `.kiro/global-steering/` paths instead of `~/.kiro/steering/` paths.

3. Copy this file into `.kiro/steering/remote-steering-bootstrap.md` and add it
   as entry #0 in the Steering Index:
   ```
   0. `.kiro/steering/remote-steering-bootstrap.md` — `inclusion: always` — Bootstrap global steering on remote/ephemeral environments.
   ```

4. Do NOT commit these changes automatically. Leave them for the user to review.

## Step 2: Initialize Submodule on Remote

If `.kiro/global-steering/` exists but is empty (submodule not initialized):

```bash
git submodule update --init --depth 1 .kiro/global-steering
```

This works in sandboxed environments because the submodule URL is recorded in
`.gitmodules` — no extra credentials needed beyond what the remote already has
for the main repo.

## When to Run

Run both steps when **any** of these are true:
- `.kiro/global-steering/` is missing or empty
- Global steering paths in CLAUDE.md or AGENTS.md resolve to missing files
- The user reports that conventions are not being followed
- You open a project for the first time and it has no global steering submodule

## Keeping in Sync (session start — do not ask)

At the start of every new agent session in a workspace that has `.kiro/global-steering/`
(or any other agent-support submodule listed in `.gitmodules`), sync it before relying
on its content:

```bash
git -C .kiro/global-steering fetch origin && git -C .kiro/global-steering merge --ff-only origin/main
```

Rules:
- Only sync a submodule whose working tree is clean; if it has local changes or the
  network is unavailable, skip it and note that in one line — never stash/reset/force.
- Leave the resulting gitlink change unstaged for user review; do not commit unless asked.
- If the submodule moved, trust the freshly synced steering over cached assumptions.

## Project Rule Bootstraps

After submodule initialization, copy required workspace steering adapters when absent:

```bash
mkdir -p .kiro/steering

# Mobile integration steering (Flutter projects)
if [ -f pubspec.yaml ] && [ ! -f .kiro/steering/maestro-agentic-integration.md ]; then
  cp ~/.kiro/steering/maestro-agentic-integration.md .kiro/steering/maestro-agentic-integration.md
fi

# Cross-suite flow tracking governance (blackbox/maestro/playwright)
if [ ! -f .kiro/steering/integration-test-tracking.md ]; then
  cp ~/.kiro/steering/integration-test-tracking.md .kiro/steering/integration-test-tracking.md
fi
```

## Cross-Project Steering Discovery Rule

**CRITICAL**: When working across multiple projects/workspaces in one task, before reading/writing/running commands in each target project:
1. Check for `AGENTS.md` and `CLAUDE.md` at that project's root (or workspace root).
2. Read both files when present.
3. Read and follow any additional steering/indexed files those documents require.
4. Do this per project boundary before performing edits or executions in that project.

This prevents applying the wrong conventions when switching between repositories.

## Source of Truth

- Submodule repo: `https://github.com/servicecute/global-steering.git`
- In-repo path: `.kiro/global-steering/`
- Local machine symlink: `~/.kiro/steering` → `registry/global-steering/`
