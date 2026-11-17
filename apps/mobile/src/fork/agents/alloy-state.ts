import { useAtomValue } from "@effect/atom-react";
import { useFocusEffect } from "@react-navigation/native";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { ThreadId, WS_METHODS, type EnvironmentId } from "@t3tools/contracts";
import {
  AlloyCompanyId,
  type AlloyCommand,
  type AlloyCommandResult,
  type AlloySnapshot,
} from "@t3tools/contracts/alloy";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { useCallback } from "react";

import * as Dialog from "../../components/ui/Dialog";
import { connectionAtomRuntime } from "../../connection/runtime";
import { homeListFilterEnvironments } from "../../features/home/home-list-filter-menu";
import { useHomeListOptions } from "../../features/home/home-list-options";
import { useEnvironmentQuery } from "../../state/query";
import { environmentThreadDetails } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { useWorkspaceEnvironments, workspaceConnections } from "../../state/workspace";
import { threadPreview, type ThreadPreview } from "./alloy-inbox";
import { chooseAlloyEnvironment, type AlloyProbe } from "./alloy-model";

const POLL_INTERVAL_MS = 5_000;

const alloySnapshot = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "alloy:snapshot",
  tag: WS_METHODS.alloySnapshot,
  staleTimeMs: 2_000,
});

const snapshotTarget = (environmentId: EnvironmentId) => ({ environmentId, input: {} });

const alloyCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "alloy:command",
  tag: WS_METHODS.alloyCommand,
  onSuccess: ({ environmentId }, registry) =>
    Effect.sync(() => registry.refresh(alloySnapshot(snapshotTarget(environmentId)))),
});

const alloySnapshotFetch = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "alloy:snapshot-fetch",
  tag: WS_METHODS.alloySnapshot,
});

function probe(result: AsyncResult.AsyncResult<unknown, unknown>): AlloyProbe {
  if (Option.isSome(AsyncResult.value(result))) return "alloy";
  return result._tag === "Failure" ? "other" : "pending";
}

// Only Alloy servers answer `alloy.snapshot`; every other environment fails it.
const alloyEnvironmentAtom = Atom.family((preferred: string) =>
  Atom.make((get) =>
    chooseAlloyEnvironment(
      homeListFilterEnvironments(get(workspaceConnections.environmentsAtom))
        .filter((environment) => environment.connectionState === "connected")
        .map((environment) => ({
          environmentId: environment.environmentId,
          probe: probe(get(alloySnapshot(snapshotTarget(environment.environmentId)))),
        })),
      (preferred || null) as EnvironmentId | null,
    ),
  ).pipe(Atom.withLabel(`alloy:environment:${preferred}`)),
);

/** The Alloy environment, preferring the one the thread list is filtered to. */
export function useAlloyEnvironment() {
  const environments = homeListFilterEnvironments(useWorkspaceEnvironments());
  const { options } = useHomeListOptions(
    new Set(environments.map((environment) => environment.environmentId)),
  );
  return useAtomValue(alloyEnvironmentAtom(options.selectedEnvironmentId ?? ""));
}

/** The snapshot, refetched on focus and every few seconds while the screen stays focused. */
export function useAlloySnapshot(environmentId: EnvironmentId) {
  const query = useEnvironmentQuery(alloySnapshot(snapshotTarget(environmentId)));
  const { refresh } = query;
  useFocusEffect(
    useCallback(() => {
      refresh();
      const timer = setInterval(refresh, POLL_INTERVAL_MS);
      return () => clearInterval(timer);
    }, [refresh]),
  );
  return query;
}

/** Runs a command and alerts on failure; resolves to null when it did not succeed. */
export function useAlloyCommand(environmentId: EnvironmentId) {
  const run = useAtomCommand(alloyCommand, { label: "alloy command", reportFailure: false });
  return async (command: AlloyCommand): Promise<AlloyCommandResult | null> => {
    const result = await run({ environmentId, input: command });
    if (result._tag === "Success") return result.value;
    if (!isAtomCommandInterrupted(result)) {
      const cause = squashAtomCommandFailure(result);
      Dialog.alert(
        "Alloy couldn't do that",
        cause instanceof Error && cause.message ? cause.message : "The server refused it.",
      );
    }
    return null;
  };
}

/** Fetches a fresh snapshot, for reading what a command just created. */
export function useAlloySnapshotFetch(environmentId: EnvironmentId) {
  const fetch = useAtomCommand(alloySnapshotFetch, {
    label: "alloy snapshot",
    reportFailure: false,
  });
  return async (): Promise<AlloySnapshot | null> => {
    const result = await fetch({ environmentId, input: {} });
    return result._tag === "Success" ? result.value : null;
  };
}

const NO_PREVIEW = Atom.make<ThreadPreview | null>(null);

// Keyed `environmentId\u0000threadId`. Keeps its value until the preview itself changes, so a
// row does not re-render on every streamed token.
const threadPreviewAtom = Atom.family((key: string) => {
  const [environmentId, threadId] = key.split("\u0000") as [EnvironmentId, string];
  const ref = scopeThreadRef(environmentId, ThreadId.make(threadId));
  let previous: ThreadPreview | null = null;
  return Atom.make((get) => {
    const next = threadPreview(
      get(environmentThreadDetails.threadAtom(ref))?.projection.messages ?? [],
    );
    if (next?.text !== previous?.text || next?.at !== previous?.at) previous = next;
    return previous;
  }).pipe(Atom.setIdleTTL(0), Atom.withLabel(`alloy:thread-preview:${key}`));
});

/** The newest message in a thread, from the thread data T3 already syncs. */
export function useThreadPreview(environmentId: EnvironmentId, threadId: ThreadId | null) {
  return useAtomValue(
    threadId === null ? NO_PREVIEW : threadPreviewAtom(`${environmentId}\u0000${threadId}`),
  );
}

/** Prompts for a company name and creates it. */
export function useNewCompanyPrompt(environmentId: EnvironmentId) {
  const run = useAlloyCommand(environmentId);
  return (onCreated?: (companyId: AlloyCompanyId) => void) =>
    Dialog.prompt({
      title: "New company",
      message: "A company owns agents and ranks the models they use.",
      placeholder: "Name",
      initialValue: "",
      confirmText: "Create",
      onConfirm: (name) => {
        if (!name.trim()) return;
        void run({ _tag: "createCompany", name: name.trim() }).then((result) => {
          if (result?.id) onCreated?.(AlloyCompanyId.make(result.id));
        });
      },
    });
}
