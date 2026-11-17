import { Atom } from "effect/reactivity";

export type WorkspaceMode = "agents" | "code";

export const workspaceModeAtom = Atom.make<WorkspaceMode>("code").pipe(Atom.keepAlive);
