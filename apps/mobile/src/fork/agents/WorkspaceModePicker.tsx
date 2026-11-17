import { useAtom } from "@effect/atom-react";
import { View } from "react-native";

import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { workspaceModeAtom, type WorkspaceMode } from "./workspace-mode";

const OPTIONS = [
  { value: "agents", label: "Agents" },
  { value: "code", label: "Code" },
] as const satisfies readonly { value: WorkspaceMode; label: string }[];

export function WorkspaceModePicker() {
  const [mode, setMode] = useAtom(workspaceModeAtom);
  return (
    <View style={{ width: 168 }}>
      <SegmentedControl options={OPTIONS} selected={mode} onSelect={setMode} size="compact" />
    </View>
  );
}
