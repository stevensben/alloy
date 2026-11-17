# Alloy

Alloy is a fork of T3 Code that adds an Agents view. It otherwise tracks
[pingdotgg/t3code](https://github.com/pingdotgg/t3code).

## Why Alloy

An alloy is separate metals fused into something stronger than any of them
alone. Claude, Codex, Grok, and whatever comes next each have strengths. Alloy
runs my own agents on any of them, lets me decide how they work, how much they
say, and when a job counts as done, and shows the agents and the code they
write in one place.

T3 Code already runs each provider through its official harness on my own
subscriptions. Alloy builds the agent layer on top and keeps taking T3's
updates.

## Rule

Fork code lives in `apps/mobile/src/fork/` (and later `apps/server/src/fork/`).
Upstream files only get small seams: an import and a line or two that calls
into fork code. Small seams keep upstream merges clean.

Current seams:

- `apps/mobile/app.config.ts` builds the app as Alloy (see below).
- `features/layout/workspace/WorkspaceRootScreen.tsx` shows the Agents/Code
  picker as the Chats title and swaps in `AgentsScreen`.
- `features/layout/workspace/WorkspaceToolbar.tsx` adds the environment and
  project menus to the iPhone header.
- `features/home/HomeScreen.tsx` hides the filter chip row on iPhone unless a
  filter is active.

## App identity

`src/fork/config/alloy-identity.ts` sets the iOS and Android app to Alloy, so it
installs beside T3 instead of replacing it:

| Variant     | Name          | Bundle ID                          |
| ----------- | ------------- | ---------------------------------- |
| development | Alloy Dev     | `com.masteryprotein.alloy.dev`     |
| preview     | Alloy Preview | `com.masteryprotein.alloy.preview` |
| production  | Alloy         | `com.masteryprotein.alloy`         |

It signs with the Mastery Beverage Inc team (`8BPBB42ZJH`) and drops what
belongs to T3's accounts: its Expo project and over-the-air updates, and the
t3.codes link domains. `ALLOY_IDENTITY=0` builds with T3's identity instead.

## Getting Theo's updates

Run `fork/sync.sh`. It fetches `upstream`, merges `upstream/main` into `main`,
and typechecks mobile. On a conflict it lists the files; keep Theo's version
and re-add the seam.

Merge, never rebase, `main`: it is published, and merges keep each sync as one
reviewable commit.
