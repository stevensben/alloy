# Alloy

Alloy is a fork of T3 Code that adds an Agents view. It otherwise tracks
[pingdotgg/t3code](https://github.com/pingdotgg/t3code).

## Rule

Fork code lives in `apps/mobile/src/fork/` (and later `apps/server/src/fork/`).
Upstream files only get small seams: an import and a line or two that calls
into fork code. Small seams keep upstream merges clean.

Current seams:

- `features/layout/workspace/WorkspaceRootScreen.tsx` shows the Agents/Code
  picker as the Chats title and swaps in `AgentsScreen`.
- `features/layout/workspace/WorkspaceToolbar.tsx` adds the environment and
  project menus to the iPhone header.
- `features/home/HomeScreen.tsx` hides the filter chip row on iPhone unless a
  filter is active.

## Getting Theo's updates

Run `fork/sync.sh`. It fetches `upstream`, merges `upstream/main` into `main`,
and typechecks mobile. On a conflict it lists the files; keep Theo's version
and re-add the seam.

Merge, never rebase, `main`: it is published, and merges keep each sync as one
reviewable commit.
