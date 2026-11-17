import { useNavigation } from "@react-navigation/native";
import type { EnvironmentId } from "@t3tools/contracts";
import type { AlloyGoal, AlloySnapshot } from "@t3tools/contracts/alloy";

import { EmptyState } from "../../components/ui/EmptyState";
import { ListRow } from "../../components/ui/ListRow";
import { ListSection } from "../../components/ui/ListSection";
import { ScreenContent } from "../../components/ui/ScreenContent";
import { ScreenScrollView } from "../../components/ui/ScreenScrollView";
import { groupedListInsets } from "../../components/ui/listMetrics";
import { useWorkspaceTabs } from "../../features/layout/workspace/WorkspaceTabsContext";
import { AlloyEnvironmentGate, WithSnapshot } from "./AlloyLayout";
import {
  agentSubtitle,
  groupGoalsByCompany,
  pendingProposals,
  PROPOSAL_KIND_LABEL,
} from "./alloy-model";
import { useAlloySnapshot } from "./alloy-state";

export function AgentsScreen() {
  const bottomClearance = useWorkspaceTabs()?.bottomClearance ?? 0;
  return (
    <ScreenContent surface="screen">
      <ScreenScrollView
        className="flex-1 bg-screen"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          ...groupedListInsets(false),
          paddingTop: 12,
          paddingBottom: bottomClearance,
        }}
      >
        <AlloyEnvironmentGate>
          {(environmentId) => <AgentsHome environmentId={environmentId} />}
        </AlloyEnvironmentGate>
      </ScreenScrollView>
    </ScreenContent>
  );
}

function AgentsHome(props: { readonly environmentId: EnvironmentId }) {
  const query = useAlloySnapshot(props.environmentId);
  return (
    <WithSnapshot query={query}>
      {(snapshot) => <AgentsList environmentId={props.environmentId} snapshot={snapshot} />}
    </WithSnapshot>
  );
}

function AgentsList(props: {
  readonly environmentId: EnvironmentId;
  readonly snapshot: AlloySnapshot;
}) {
  const { environmentId, snapshot } = props;
  const navigation = useNavigation();
  const needsYou = pendingProposals(snapshot.proposals);
  const companies = groupGoalsByCompany(snapshot);
  const openGoal = (goal: AlloyGoal) =>
    navigation.navigate("AlloyGoal", { environmentId, goalId: goal.id });

  if (companies.length === 0) {
    return (
      <EmptyState
        title="No agents yet"
        detail="An agent talks a goal through with you, proposes a roadmap, then works through it and checks with you before changing course."
        actionLabel="New agent"
        onAction={() => navigation.navigate("AlloyNewAgent")}
      />
    );
  }

  return (
    <>
      {needsYou.length > 0 ? (
        <ListSection title={`Needs you (${needsYou.length})`}>
          {needsYou.map((proposal) => {
            const goal = snapshot.goals.find((candidate) => candidate.id === proposal.goalId);
            return (
              <ListRow
                key={proposal.id}
                icon="exclamationmark.triangle"
                label={proposal.title}
                description={`${goal?.title ?? "Agent"} · ${PROPOSAL_KIND_LABEL[proposal.body._tag]}`}
                onPress={() => goal && openGoal(goal)}
              />
            );
          })}
        </ListSection>
      ) : null}

      {companies.map(({ company, goals }) => (
        <ListSection key={company.id} title={companies.length > 1 ? company.name : undefined}>
          {goals.map((goal) => (
            <ListRow
              key={goal.id}
              label={goal.title}
              description={agentSubtitle(goal, snapshot.milestones, snapshot.accounts)}
              onPress={() => openGoal(goal)}
            />
          ))}
        </ListSection>
      ))}
    </>
  );
}
