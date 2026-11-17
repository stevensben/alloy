import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";

import { useWorkspaceTabs } from "../../features/layout/workspace/WorkspaceTabsContext";

export type WorkspaceMode = "agents" | "code";

export const workspaceModeAtom = Atom.make<WorkspaceMode>("agents").pipe(Atom.keepAlive);

/** Agents mode owns Home's Chats tab: the Alloy shell replaces T3's list there and hides the tab bar. */
export function useAlloyShellActive(): boolean {
  const workspace = useWorkspaceTabs();
  const mode = useAtomValue(workspaceModeAtom);
  return (
    mode === "agents" &&
    workspace !== null &&
    !workspace.settingsOpen &&
    workspace.state.selectedTab === "threads"
  );
}
