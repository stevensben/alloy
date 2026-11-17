import { useAtomValue } from "@effect/atom-react";
import { useNavigation } from "@react-navigation/native";

import { workspaceModeAtom } from "./workspace-mode";

/** In Agents mode, compose starts a new agent instead of a thread. */
export function useAgentsCompose() {
  const mode = useAtomValue(workspaceModeAtom);
  const navigation = useNavigation();
  return mode === "agents"
    ? ({ label: "New agent", onPress: () => navigation.navigate("AlloyNewAgent") } as const)
    : null;
}
