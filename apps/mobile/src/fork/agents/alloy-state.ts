import { useAtomValue } from "@effect/atom-react";
import { useFocusEffect } from "@react-navigation/native";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS, type EnvironmentId } from "@t3tools/contracts";
import type { AlloyCommand, AlloyCommandResult } from "@t3tools/contracts/alloy";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { useCallback } from "react";

import * as Dialog from "../../components/ui/Dialog";
import { connectionAtomRuntime } from "../../connection/runtime";
import { homeListFilterEnvironments } from "../../features/home/home-list-filter-menu";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { workspaceConnections } from "../../state/workspace";
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

export function useAlloyEnvironment(preferred: EnvironmentId | null) {
  return useAtomValue(alloyEnvironmentAtom(preferred ?? ""));
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
