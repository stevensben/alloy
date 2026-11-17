import { StackActions, useNavigation, type StaticScreenProps } from "@react-navigation/native";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import {
  AlloyCompId,
  type AlloyCompanyId,
  type AlloyModelChoice,
  type AlloySnapshot,
} from "@t3tools/contracts/alloy";
import { useRef, useState } from "react";
import { Platform, View } from "react-native";
import { useResolveClassNames } from "uniwind";

import { SymbolView } from "../../components/ui/AppSymbol";
import { AppTextInput as TextInput } from "../../components/ui/AppText";
import { Chip } from "../../components/ui/Chip";
import { ListChoiceRow } from "../../components/ui/ListChoiceRow";
import { ListRowLayout } from "../../components/ui/ListRowLayout";
import { ListSection } from "../../components/ui/ListSection";
import { RowPressable } from "../../components/ui/RowPressable";
import { useProjects } from "../../state/entities";
import { AlloySheet, Muted, WithSnapshot } from "./AlloyLayout";
import { knownTaskTypes, modelChoiceKey, modelOptions, toggleChoice } from "./alloy-model";
import { useAlloyCommand, useAlloySnapshot } from "./alloy-state";

const MIN_MODELS = 2;
const MAX_MODELS = 4;
const INPUT_CLASS = "min-h-12 rounded-[20px] bg-grouped-card px-4 text-base text-foreground";
const MULTILINE_CLASS = "min-h-40 rounded-[20px] bg-grouped-card p-4 text-base text-foreground";

interface CompDraft {
  readonly title: string;
  readonly taskType: string;
  readonly prompt: string;
  readonly projectId: ProjectId | null;
  readonly companyId: AlloyCompanyId | null;
  readonly models: ReadonlyArray<AlloyModelChoice>;
}

const EMPTY_DRAFT: CompDraft = {
  title: "",
  taskType: "",
  prompt: "",
  projectId: null,
  companyId: null,
  models: [],
};

export function AlloyNewCompSheet({
  route,
}: StaticScreenProps<{ readonly environmentId: EnvironmentId }>) {
  const { environmentId } = route.params;
  const navigation = useNavigation();
  const query = useAlloySnapshot(environmentId);
  const run = useAlloyCommand(environmentId);
  const projects = useProjects().filter(
    (project) => project.environmentId === environmentId && project.archivedAt == null,
  );
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const update = (patch: Partial<CompDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const projectId = draft.projectId ?? (projects.length === 1 ? projects[0]!.id : null);
  const ready =
    projectId !== null &&
    draft.title.trim().length > 0 &&
    draft.taskType.trim().length > 0 &&
    draft.prompt.trim().length > 0 &&
    draft.models.length >= MIN_MODELS;

  const start = async () => {
    if (!ready || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const result = await run({
      _tag: "startComp",
      companyId: draft.companyId,
      projectId,
      title: draft.title.trim(),
      taskType: draft.taskType.trim(),
      prompt: draft.prompt.trim(),
      models: draft.models,
    });
    inFlight.current = false;
    setBusy(false);
    if (result?.id) {
      navigation.dispatch(
        StackActions.replace("SettingsAlloyComp", {
          environmentId,
          compId: AlloyCompId.make(result.id),
        }),
      );
    }
  };

  return (
    <AlloySheet
      title="New comp"
      confirm={{ label: "Start", onPress: () => void start(), disabled: !ready, loading: busy }}
    >
      <WithSnapshot query={query}>
        {(snapshot) => (
          <>
            <ListSection title="Title">
              <TextInput
                accessibilityLabel="Comp title"
                placeholder="Heirship affidavit draft"
                placeholderTextColorClassName="accent-foreground-muted"
                value={draft.title}
                onChangeText={(title) => update({ title })}
                className={INPUT_CLASS}
              />
            </ListSection>
            <TaskTypeField
              value={draft.taskType}
              suggestions={knownTaskTypes(snapshot)}
              onChange={(taskType) => update({ taskType })}
            />
            <ListSection title="Prompt">
              <TextInput
                multiline
                accessibilityLabel="Prompt"
                placeholder="What every model should do"
                placeholderTextColorClassName="accent-foreground-muted"
                value={draft.prompt}
                onChangeText={(prompt) => update({ prompt })}
                className={MULTILINE_CLASS}
                style={{ textAlignVertical: "top" }}
              />
            </ListSection>
            <ListSection title="Project">
              {projects.length === 0 ? (
                <Muted className="p-4">Add a project on the Alloy server first.</Muted>
              ) : (
                projects.map((project) => (
                  <ListChoiceRow
                    key={project.id}
                    label={project.title}
                    description={project.workspaceRoot}
                    selected={project.id === projectId}
                    onPress={() => update({ projectId: project.id })}
                  />
                ))
              )}
            </ListSection>
            <ModelPicker
              snapshot={snapshot}
              selected={draft.models}
              onToggle={(choice) =>
                update({ models: toggleChoice(draft.models, choice, MAX_MODELS) })
              }
            />
            <ListSection title="Company (optional)">
              <ListChoiceRow
                label="None"
                selected={draft.companyId === null}
                onPress={() => update({ companyId: null })}
              />
              {snapshot.companies.map((company) => (
                <ListChoiceRow
                  key={company.id}
                  label={company.name}
                  selected={company.id === draft.companyId}
                  onPress={() => update({ companyId: company.id })}
                />
              ))}
            </ListSection>
          </>
        )}
      </WithSnapshot>
    </AlloySheet>
  );
}

function TaskTypeField(props: {
  readonly value: string;
  readonly suggestions: ReadonlyArray<string>;
  readonly onChange: (value: string) => void;
}) {
  return (
    <ListSection title="Task type" footer="Comps with the same task type share a scoreboard.">
      <View className="gap-3 p-3">
        <TextInput
          accessibilityLabel="Task type"
          placeholder="script writing"
          placeholderTextColorClassName="accent-foreground-muted"
          autoCapitalize="none"
          value={props.value}
          onChangeText={props.onChange}
        />
        {props.suggestions.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            {props.suggestions.map((suggestion) => (
              <Chip
                key={suggestion}
                size="small"
                label={suggestion}
                selected={suggestion === props.value.trim()}
                onPress={() => props.onChange(suggestion)}
              />
            ))}
          </View>
        ) : null}
      </View>
    </ListSection>
  );
}

function ModelPicker(props: {
  readonly snapshot: AlloySnapshot;
  readonly selected: ReadonlyArray<AlloyModelChoice>;
  readonly onToggle: (choice: AlloyModelChoice) => void;
}) {
  const rippleStyle = useResolveClassNames("bg-subtle-strong");
  const selectedKeys = new Set(props.selected.map(modelChoiceKey));
  const options = modelOptions(props.snapshot.accounts);
  return (
    <ListSection
      title={`Models (${props.selected.length} of ${MIN_MODELS}–${MAX_MODELS})`}
      footer="Each model runs the prompt in its own thread."
    >
      {options.length === 0 ? (
        <Muted className="p-4">No connected accounts report models.</Muted>
      ) : (
        options.map((option) => {
          const checked = selectedKeys.has(option.key);
          const full = !checked && props.selected.length >= MAX_MODELS;
          return (
            <RowPressable
              key={option.key}
              accessibilityRole="checkbox"
              accessibilityLabel={option.label}
              accessibilityState={{ checked, disabled: full }}
              disabled={full}
              onPress={() => props.onToggle(option.choice)}
              android_ripple={{ color: rippleStyle.backgroundColor }}
              unstable_pressDelay={Platform.OS === "android" ? 50 : undefined}
              className="bg-grouped-card"
            >
              <ListRowLayout
                label={option.label}
                disabled={full}
                accessory={
                  <View className="size-6 items-center justify-center">
                    {checked ? (
                      <SymbolView
                        name="checkmark"
                        size={18}
                        tintColorClassName="accent-primary-text"
                        type="monochrome"
                        weight="semibold"
                      />
                    ) : null}
                  </View>
                }
              />
            </RowPressable>
          );
        })
      )}
    </ListSection>
  );
}
