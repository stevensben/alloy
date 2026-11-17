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

## Current approach

Alloy is being designed by iterating, so this is how things are done today,
not a fixed rule. Fork code mostly lives in `apps/mobile/src/fork/`,
`apps/server/src/fork/` and `packages/contracts/src/fork/`. Upstream files
mostly get small seams: an import and a line or two that calls into fork code.
Small seams keep Theo's updates easy to merge, so a bigger change to one of
his files is fine when it's worth that cost.

Current seams:

- `apps/mobile/app.config.ts` builds the app as Alloy (see below).
- `features/layout/workspace/WorkspaceRootScreen.tsx` renders `AlloyShell` in
  place of the whole workspace while Agents mode owns the Chats tab, and shows
  the Agents/Code picker as the Chats title in Code mode.
- `features/layout/createWorkspaceStackNavigator.ios.tsx` hides the workspace
  tab bar while the Alloy shell shows.
- `features/layout/workspace/WorkspaceToolbar.tsx` adds the environment and
  project menus to the iPhone header.
- `features/home/HomeScreen.tsx` hides the filter chip row on iPhone unless a
  filter is active.
- `Stack.tsx` spreads `ALLOY_SCREENS` (agents, Settings › Alloy and their
  sheets) into the root stack.
- `features/settings/SettingsRouteScreen.tsx` adds the Alloy row to the
  Settings list's Agents section.

Server and contract seams:

- `packages/contracts/src/rpc.ts` adds the `alloy.*` methods and RPCs.
- `apps/server/src/server.ts` provides `AlloyService`, `ws.ts` serves its RPCs,
  and `mcp/McpHttpServer.ts` registers the `alloy_*` agent tools.

## Agents and Code modes

The app opens in Agents mode: Home is the Alloy shell, a Messages-style list of
agents with one conversation per agent, and T3's tab bar is hidden. The Code
button in its header switches to T3's own workspace; the Agents/Code picker in
the Chats title switches back. The mode lives in `workspace-mode.ts` and resets
to Agents on launch.

An agent's conversation (`AlloyChatScreen`) is its orchestrator's T3 thread.
It reuses T3's thread state, feed folding and composer, keyed by the route's
`environmentId` and `threadId` params like T3's Thread route, and adds Alloy's
proposals and activity in time order. "Open in Code" opens the same thread in
T3's Thread view.

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

### Icon

The icon comes from `fork/assets/source.jpg`, a placeholder logo on black. To
change it, save the new image there (square-ish, on a black background) and run
`fork/assets/build-icons.sh`. It builds the iOS icon, the Android adaptive,
themed and splash icons, and the splash screen image. Rebuild the app to see it.

## Running Alloy

Alloy needs its own server, separate from the T3 app:

```sh
fork/serve.sh
```

It keeps its data in `~/.alloy` and listens on port 3873, so it never touches
T3's data in `~/.t3` or its port 3773. On start it prints a pairing link. Open
it in the Alloy app (Settings › Environments) to connect your phone. Restart
the server after pulling new Alloy code.

## Getting Theo's updates

Run `fork/sync.sh`. It fetches `upstream`, merges `upstream/main` into `main`,
and typechecks mobile. On a conflict it lists the files; keep Theo's version
and re-add the seam.

Merge, never rebase, `main`: it is published, and merges keep each sync as one
reviewable commit.
