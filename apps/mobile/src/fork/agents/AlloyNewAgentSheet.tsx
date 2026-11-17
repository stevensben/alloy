import type { MenuAction } from "@react-native-menu/menu";
import { StackActions, useNavigation } from "@react-navigation/native";
import type { EnvironmentId } from "@t3tools/contracts";
import { AlloyGoalId, type AlloyModelChoice, type AlloySnapshot } from "@t3tools/contracts/alloy";
import { useRef, useState } from "react";
import { Pressable } from "react-native";

import { AppText as Text, AppTextInput as TextInput } from "../../components/ui/AppText";
import { ListRowLayout } from "../../components/ui/ListRowLayout";
import { ListSection } from "../../components/ui/ListSection";
import { Menu } from "../../components/ui/Menu";
import { AlloyEnvironmentGate, AlloySheet, WithSnapshot } from "./AlloyLayout";
import { PlacementFields, usePlacement } from "./AlloyGoalFormSheet";
import { modelChoiceKey, modelLabel, modelOptions } from "./alloy-model";
import {
  useAlloyCommand,
  useAlloyEnvironment,
  useAlloySnapshot,
  useAlloySnapshotFetch,
} from "./alloy-state";

const BRIEF_CLASS = "min-h-40 rounded-[20px] bg-grouped-card p-4 text-base text-foreground";
const AUTO = "auto";

export function AlloyNewAgentSheet() {
  const choice = useAlloyEnvironment();
  return choice._tag === "found" ? (
    <NewAgent environmentId={choice.environmentId} />
  ) : (
    <AlloySheet title="New agent" confirm={{ label: "Start", onPress: () => {}, disabled: true }}>
      <AlloyEnvironmentGate>{() => null}</AlloyEnvironmentGate>
    </AlloySheet>
  );
}

function NewAgent(props: { readonly environmentId: EnvironmentId }) {
  const { environmentId } = props;
  const navigation = useNavigation();
  const query = useAlloySnapshot(environmentId);
  const run = useAlloyCommand(environmentId);
  const fetchSnapshot = useAlloySnapshotFetch(environmentId);
  const placement = usePlacement(environmentId, query.data?.companies ?? []);
  const { selectedCompany, selectedProject } = placement;
  const [brief, setBrief] = useState("");
  const [model, setModel] = useState<AlloyModelChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const ready = selectedCompany !== null && selectedProject !== null && brief.trim().length > 0;

  const start = async () => {
    if (!ready || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const result = await run({
      _tag: "createAgent",
      companyId: selectedCompany,
      projectId: selectedProject,
      brief: brief.trim(),
      model,
    });
    const goalId = result?.id ? AlloyGoalId.make(result.id) : null;
    const snapshot = goalId === null ? null : await fetchSnapshot();
    inFlight.current = false;
    setBusy(false);
    if (goalId === null) return;
    const threadId = snapshot?.goals.find((goal) => goal.id === goalId)?.orchestrator?.threadId;
    navigation.dispatch(
      threadId
        ? StackActions.replace("AlloyChat", { environmentId, threadId, goalId })
        : StackActions.replace("AlloyGoal", { environmentId, goalId }),
    );
  };

  return (
    <AlloySheet
      title="New agent"
      confirm={{ label: "Start", onPress: () => void start(), disabled: !ready, loading: busy }}
    >
      <WithSnapshot query={query}>
        {(snapshot) => (
          <>
            <PlacementFields environmentId={environmentId} snapshot={snapshot} {...placement} />
            <ListSection
              title="What should this agent do?"
              footer="The agent asks you about the goal one question at a time, then proposes a roadmap before it starts."
            >
              <TextInput
                multiline
                accessibilityLabel="What should this agent do?"
                placeholder="Ship the family tree export"
                placeholderTextColorClassName="accent-foreground-muted"
                value={brief}
                onChangeText={setBrief}
                className={BRIEF_CLASS}
                style={{ textAlignVertical: "top" }}
              />
            </ListSection>
            <ModelPicker snapshot={snapshot} model={model} onChange={setModel} />
            <Pressable
              accessibilityRole="link"
              className="items-center py-2 active:opacity-60"
              onPress={() =>
                navigation.dispatch(StackActions.replace("AlloyNewGoal", { environmentId }))
              }
            >
              <Text textRole="footnote" className="font-t3-medium text-primary-text">
                Fill in the details myself
              </Text>
            </Pressable>
          </>
        )}
      </WithSnapshot>
    </AlloySheet>
  );
}

function ModelPicker(props: {
  readonly snapshot: AlloySnapshot;
  readonly model: AlloyModelChoice | null;
  readonly onChange: (model: AlloyModelChoice | null) => void;
}) {
  const options = modelOptions(props.snapshot.accounts);
  const selected = props.model === null ? AUTO : modelChoiceKey(props.model);
  const actions: MenuAction[] = [
    {
      id: AUTO,
      title: "Auto",
      subtitle: "Best ranked model with headroom",
      state: selected === AUTO ? "on" : "off",
    },
    ...options.map((option) => ({
      id: option.key,
      title: option.label,
      state: option.key === selected ? ("on" as const) : ("off" as const),
    })),
  ];
  return (
    <ListSection>
      <Menu
        accessible
        accessibilityRole="button"
        accessibilityLabel="Model"
        title="Model"
        actions={actions}
        onPressAction={({ nativeEvent }) =>
          props.onChange(options.find((option) => option.key === nativeEvent.event)?.choice ?? null)
        }
      >
        <ListRowLayout
          icon="bolt.circle"
          label="Model"
          detail={props.model === null ? "Auto" : modelLabel(props.snapshot.accounts, props.model)}
        />
      </Menu>
    </ListSection>
  );
}
