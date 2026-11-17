import { StackActions, useNavigation, type StaticScreenProps } from "@react-navigation/native";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import {
  AlloyGoalId,
  type AlloyCompany,
  type AlloyCompanyId,
  type AlloyGoal,
  type AlloySnapshot,
} from "@t3tools/contracts/alloy";
import { useRef, useState } from "react";

import { AppTextInput as TextInput } from "../../components/ui/AppText";
import { ListActionRow } from "../../components/ui/ListActionRow";
import { ListChoiceRow } from "../../components/ui/ListChoiceRow";
import { ListSection } from "../../components/ui/ListSection";
import { useProjects } from "../../state/entities";
import { AlloySheet, Muted, NotFound, WithSnapshot } from "./AlloyLayout";
import { useAlloyCommand, useAlloySnapshot, useNewCompanyPrompt } from "./alloy-state";

const INPUT_CLASS = "min-h-12 rounded-[20px] bg-grouped-card px-4 text-base text-foreground";
const MULTILINE_CLASS = "min-h-40 rounded-[20px] bg-grouped-card p-4 text-base text-foreground";

export function AlloyNewGoalSheet({
  route,
}: StaticScreenProps<{ readonly environmentId: EnvironmentId }>) {
  const { environmentId } = route.params;
  const navigation = useNavigation();
  const query = useAlloySnapshot(environmentId);
  const run = useAlloyCommand(environmentId);
  const placement = usePlacement(environmentId, query.data?.companies ?? []);
  const { selectedCompany, selectedProject } = placement;
  const [title, setTitle] = useState("");
  const [vision, setVision] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const ready = selectedCompany !== null && selectedProject !== null && title.trim().length > 0;

  const create = async () => {
    if (!ready || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const result = await run({
      _tag: "createGoal",
      companyId: selectedCompany,
      projectId: selectedProject,
      title: title.trim(),
      vision: vision.trim(),
    });
    inFlight.current = false;
    setBusy(false);
    if (result?.id) {
      navigation.dispatch(
        StackActions.replace("AlloyGoal", { environmentId, goalId: AlloyGoalId.make(result.id) }),
      );
    }
  };

  return (
    <AlloySheet
      title="New agent"
      confirm={{ label: "Create", onPress: () => void create(), disabled: !ready, loading: busy }}
    >
      <WithSnapshot query={query}>
        {(snapshot) => (
          <>
            <PlacementFields environmentId={environmentId} snapshot={snapshot} {...placement} />
            <GoalFields title={title} vision={vision} onTitle={setTitle} onVision={setVision} />
          </>
        )}
      </WithSnapshot>
    </AlloySheet>
  );
}

type Placement = ReturnType<typeof usePlacement>;

/** Which company and project a new agent belongs to; a lone option is picked for you. */
export function usePlacement(environmentId: EnvironmentId, companies: ReadonlyArray<AlloyCompany>) {
  const projects = useProjects().filter(
    (project) => project.environmentId === environmentId && project.archivedAt == null,
  );
  const [companyId, setCompanyId] = useState<AlloyCompanyId | null>(null);
  const [projectId, setProjectId] = useState<ProjectId | null>(null);
  return {
    projects,
    selectedCompany: companyId ?? (companies.length === 1 ? companies[0]!.id : null),
    selectedProject: projectId ?? (projects.length === 1 ? projects[0]!.id : null),
    setCompanyId,
    setProjectId,
  };
}

export function PlacementFields(
  props: Placement & { readonly environmentId: EnvironmentId; readonly snapshot: AlloySnapshot },
) {
  const newCompany = useNewCompanyPrompt(props.environmentId);
  return (
    <>
      <ListSection title="Company">
        {props.snapshot.companies.map((company) => (
          <ListChoiceRow
            key={company.id}
            label={company.name}
            selected={company.id === props.selectedCompany}
            onPress={() => props.setCompanyId(company.id)}
          />
        ))}
        <ListActionRow
          icon="plus"
          label="New company…"
          onPress={() => newCompany(props.setCompanyId)}
        />
      </ListSection>
      <ListSection title="Project">
        {props.projects.length === 0 ? (
          <Muted className="p-4">Add a project on the Alloy server first.</Muted>
        ) : (
          props.projects.map((project) => (
            <ListChoiceRow
              key={project.id}
              label={project.title}
              description={project.workspaceRoot}
              selected={project.id === props.selectedProject}
              onPress={() => props.setProjectId(project.id)}
            />
          ))
        )}
      </ListSection>
    </>
  );
}

export function AlloyEditGoalSheet({
  route,
}: StaticScreenProps<{ readonly environmentId: EnvironmentId; readonly goalId: AlloyGoalId }>) {
  const query = useAlloySnapshot(route.params.environmentId);
  const goal = query.data?.goals.find((candidate) => candidate.id === route.params.goalId);
  return goal ? (
    <EditGoal environmentId={route.params.environmentId} goal={goal} />
  ) : (
    <AlloySheet title="Edit goal" confirm={{ label: "Save", onPress: () => {}, disabled: true }}>
      <WithSnapshot query={query}>{() => <NotFound what="goal" />}</WithSnapshot>
    </AlloySheet>
  );
}

function EditGoal(props: { readonly environmentId: EnvironmentId; readonly goal: AlloyGoal }) {
  const navigation = useNavigation();
  const run = useAlloyCommand(props.environmentId);
  const [title, setTitle] = useState(props.goal.title);
  const [vision, setVision] = useState(props.goal.vision);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const ready = title.trim().length > 0;

  const save = async () => {
    if (!ready || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const result = await run({
      _tag: "updateGoal",
      goalId: props.goal.id,
      title: title.trim(),
      vision: vision.trim(),
    });
    inFlight.current = false;
    setBusy(false);
    if (result) navigation.goBack();
  };

  return (
    <AlloySheet
      title="Edit goal"
      confirm={{ label: "Save", onPress: () => void save(), disabled: !ready, loading: busy }}
    >
      <GoalFields title={title} vision={vision} onTitle={setTitle} onVision={setVision} />
    </AlloySheet>
  );
}

function GoalFields(props: {
  readonly title: string;
  readonly vision: string;
  readonly onTitle: (value: string) => void;
  readonly onVision: (value: string) => void;
}) {
  return (
    <>
      <ListSection title="Title">
        <TextInput
          accessibilityLabel="Goal title"
          placeholder="Ship the family tree export"
          placeholderTextColorClassName="accent-foreground-muted"
          value={props.title}
          onChangeText={props.onTitle}
          returnKeyType="next"
          className={INPUT_CLASS}
        />
      </ListSection>
      <ListSection
        title="Vision"
        footer="What done looks like. The orchestrator plans its roadmap from this."
      >
        <TextInput
          multiline
          accessibilityLabel="Goal vision"
          placeholder="Who it is for, what it should do, and how you will know it works"
          placeholderTextColorClassName="accent-foreground-muted"
          value={props.vision}
          onChangeText={props.onVision}
          className={MULTILINE_CLASS}
          style={{ textAlignVertical: "top" }}
        />
      </ListSection>
    </>
  );
}
