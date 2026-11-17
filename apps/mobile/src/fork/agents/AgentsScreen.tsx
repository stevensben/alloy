import { useNavigation } from "@react-navigation/native";
import type { EnvironmentId } from "@t3tools/contracts";
import type { AlloyGoal, AlloySnapshot } from "@t3tools/contracts/alloy";
import { Pressable, View } from "react-native";

import { AppActivityIndicator } from "../../components/ui/AppActivityIndicator";
import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { ListRow } from "../../components/ui/ListRow";
import { ListRowLayout } from "../../components/ui/ListRowLayout";
import { ListSection } from "../../components/ui/ListSection";
import { ScreenContent } from "../../components/ui/ScreenContent";
import { ScreenScrollView } from "../../components/ui/ScreenScrollView";
import { groupedListInsets } from "../../components/ui/listMetrics";
import { homeListFilterEnvironments } from "../../features/home/home-list-filter-menu";
import { useHomeListOptions } from "../../features/home/home-list-options";
import { useWorkspaceTabs } from "../../features/layout/workspace/WorkspaceTabsContext";
import { openSettings } from "../../features/settings/settings-navigation";
import { useNowMinuteMs } from "../../lib/clock";
import { useWorkspaceEnvironments } from "../../state/workspace";
import { ProgressLine, WithSnapshot } from "./AlloyLayout";
import {
  accountUsageSummary,
  currentMilestone,
  GOAL_STATUS_LABEL,
  goalMilestones,
  groupGoalsByCompany,
  modelLabel,
  pendingProposals,
  roadmapProgress,
  scoreboardLeaders,
} from "./alloy-model";
import { useAlloyEnvironment, useAlloySnapshot } from "./alloy-state";

export function AgentsScreen() {
  const bottomClearance = useWorkspaceTabs()?.bottomClearance ?? 0;
  const navigation = useNavigation();
  const environments = homeListFilterEnvironments(useWorkspaceEnvironments());
  const { options } = useHomeListOptions(
    new Set(environments.map((environment) => environment.environmentId)),
  );
  const choice = useAlloyEnvironment(options.selectedEnvironmentId);
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
        {choice._tag === "found" ? (
          <AgentsHome environmentId={choice.environmentId} />
        ) : choice._tag === "probing" ? (
          <View className="items-center py-10">
            <AppActivityIndicator colorClassName="accent-icon" />
          </View>
        ) : (
          <EmptyState
            variant="plain"
            title="Connect this app to your Alloy server"
            detail="Goals, comps and lessons live on the Mac running Alloy. None of the environments this phone is connected to answers as Alloy, so add that one in Environments."
            actionLabel="Open Environments"
            onAction={() => openSettings(navigation, "SettingsEnvironments")}
          />
        )}
      </ScreenScrollView>
    </ScreenContent>
  );
}

function AgentsHome(props: { readonly environmentId: EnvironmentId }) {
  const query = useAlloySnapshot(props.environmentId);
  return (
    <WithSnapshot query={query}>
      {(snapshot) => <AgentsOverview environmentId={props.environmentId} snapshot={snapshot} />}
    </WithSnapshot>
  );
}

function AgentsOverview(props: {
  readonly environmentId: EnvironmentId;
  readonly snapshot: AlloySnapshot;
}) {
  const { environmentId, snapshot } = props;
  const navigation = useNavigation();
  const nowMs = useNowMinuteMs();
  const needsYou = pendingProposals(snapshot.proposals);
  const companies = groupGoalsByCompany(snapshot);
  const leaders = scoreboardLeaders(snapshot.scores);
  const activeLessons = snapshot.lessons.filter((lesson) => lesson.active).length;
  const newGoal = () => navigation.navigate("AlloyNewGoal", { environmentId });
  const openGoal = (goal: AlloyGoal) =>
    navigation.navigate("AlloyGoal", { environmentId, goalId: goal.id });

  return (
    <>
      {companies.length === 0 ? (
        <EmptyState
          title="No goals yet"
          detail="A goal is an outcome you hand to an orchestrator agent, which works through a roadmap of milestones and checks with you before changing it."
          actionLabel="New goal"
          onAction={newGoal}
        />
      ) : (
        <View className="self-start">
          <Button label="New goal" icon="plus" tone="primary" size="compact" onPress={newGoal} />
        </View>
      )}

      {needsYou.length > 0 ? (
        <ListSection title={`Needs you (${needsYou.length})`}>
          {needsYou.map((proposal) => {
            const goal = snapshot.goals.find((candidate) => candidate.id === proposal.goalId);
            return (
              <ListRow
                key={proposal.id}
                icon="exclamationmark.triangle"
                label={proposal.title}
                description={`${goal?.title ?? "Goal"} · ${
                  proposal.body._tag === "roadmap" ? "Roadmap change" : "Idea"
                }`}
                onPress={() => goal && openGoal(goal)}
              />
            );
          })}
        </ListSection>
      ) : null}

      {companies.map(({ company, goals }) => (
        <ListSection
          key={company.id}
          title={company.name}
          trailing={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${company.name} models`}
              className="px-2 active:opacity-60"
              onPress={() =>
                navigation.navigate("AlloyCompany", { environmentId, companyId: company.id })
              }
            >
              <Text textRole="footnote" className="font-t3-medium text-primary-text">
                Models
              </Text>
            </Pressable>
          }
        >
          {goals.map((goal) => (
            <GoalRow key={goal.id} goal={goal} snapshot={snapshot} onPress={() => openGoal(goal)} />
          ))}
        </ListSection>
      ))}

      <ListSection>
        <ListRow
          icon="chart.bar.xaxis"
          label="Comps"
          description={
            leaders.length > 0
              ? leaders
                  .map(
                    (leader) =>
                      `${leader.taskType}: ${modelLabel(snapshot.accounts, leader.model)}`,
                  )
                  .join("\n")
              : "Run one prompt on several models and keep the best"
          }
          onPress={() => navigation.navigate("AlloyComps", { environmentId })}
        />
        <ListRow
          icon="brain"
          label="Lessons"
          description={`${activeLessons} active`}
          onPress={() => navigation.navigate("AlloyLessons", { environmentId })}
        />
      </ListSection>

      {snapshot.accounts.length > 0 ? (
        <ListSection title="Accounts">
          {snapshot.accounts.map((account) => (
            <ListRowLayout
              key={account.instanceId}
              icon="person.crop.circle"
              label={account.label}
              description={accountUsageSummary(account, nowMs)}
              detail={account.driver}
              disabled={!account.available}
            />
          ))}
        </ListSection>
      ) : null}
    </>
  );
}

function GoalRow(props: {
  readonly goal: AlloyGoal;
  readonly snapshot: AlloySnapshot;
  readonly onPress: () => void;
}) {
  const { goal, snapshot } = props;
  const roadmap = goalMilestones(snapshot.milestones, goal.id);
  const current = currentMilestone(roadmap);
  const progress = roadmapProgress(roadmap);
  return (
    <ListRow
      label={goal.title}
      detail={GOAL_STATUS_LABEL[goal.status]}
      description={current ? `Now: ${current.title}` : "No roadmap yet"}
      meta={
        <View className="gap-1 pt-1">
          {progress.total > 0 ? (
            <ProgressLine done={progress.done} total={progress.total} label="milestones" />
          ) : null}
          {goal.orchestrator ? (
            <Text textRole="footnote" className="text-foreground-muted">
              {modelLabel(snapshot.accounts, goal.orchestrator.model)}
            </Text>
          ) : null}
        </View>
      }
      onPress={props.onPress}
    />
  );
}
