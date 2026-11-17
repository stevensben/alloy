import type { MenuAction } from "@react-native-menu/menu";
import { StackActions, useNavigation, type StaticScreenProps } from "@react-navigation/native";
import type { EnvironmentId } from "@t3tools/contracts";
import type {
  AlloyCommand,
  AlloyGoal,
  AlloyGoalId,
  AlloyMilestone,
  AlloyModelChoice,
  AlloyProposal,
  AlloySnapshot,
} from "@t3tools/contracts/alloy";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import * as Dialog from "../../components/ui/Dialog";
import { ListActionRow } from "../../components/ui/ListActionRow";
import { ListRow } from "../../components/ui/ListRow";
import { ListRowLayout } from "../../components/ui/ListRowLayout";
import { ListSection } from "../../components/ui/ListSection";
import { ListToggleRow } from "../../components/ui/ListToggleRow";
import { Menu } from "../../components/ui/Menu";
import { Progress } from "../../components/ui/Progress";
import { useNowMinuteMs } from "../../lib/clock";
import { relativeTime } from "../../lib/time";
import { AlloyPage, Muted, NotFound, ProgressLine, WithSnapshot } from "./AlloyLayout";
import {
  GOAL_STATUS_LABEL,
  goalActivity,
  goalMilestones,
  isLongText,
  modelLabel,
  modelOptions,
  pendingProposals,
  progressFraction,
  roadmapProgress,
} from "./alloy-model";
import { useAlloyCommand, useAlloySnapshot } from "./alloy-state";

type GoalParams = { readonly environmentId: EnvironmentId; readonly goalId: AlloyGoalId };

const ACTIVITY_PREVIEW = 8;
const VISION_PREVIEW_LINES = 4;

export function AlloyGoalScreen({ route }: StaticScreenProps<GoalParams>) {
  const query = useAlloySnapshot(route.params.environmentId);
  const goal = query.data?.goals.find((candidate) => candidate.id === route.params.goalId);
  return (
    <AlloyPage
      title={goal?.title ?? "Goal"}
      subtitle={goal ? GOAL_STATUS_LABEL[goal.status] : undefined}
    >
      <WithSnapshot query={query}>
        {(snapshot) => {
          const current = snapshot.goals.find((candidate) => candidate.id === route.params.goalId);
          return current ? (
            <GoalBody
              environmentId={route.params.environmentId}
              goal={current}
              snapshot={snapshot}
            />
          ) : (
            <NotFound what="goal" />
          );
        }}
      </WithSnapshot>
    </AlloyPage>
  );
}

function GoalBody(props: {
  readonly environmentId: EnvironmentId;
  readonly goal: AlloyGoal;
  readonly snapshot: AlloySnapshot;
}) {
  const { environmentId, goal, snapshot } = props;
  const run = useAlloyCommand(environmentId);
  const company = snapshot.companies.find((candidate) => candidate.id === goal.companyId);
  const roadmap = goalMilestones(snapshot.milestones, goal.id);
  const proposals = pendingProposals(snapshot.proposals, goal.id);
  const lessons = snapshot.lessons.filter(
    (lesson) => lesson.scope._tag === "goal" && lesson.scope.goalId === goal.id,
  );
  const send = (command: AlloyCommand) => void run(command);

  return (
    <>
      <GoalHeader
        environmentId={environmentId}
        goal={goal}
        companyName={company?.name ?? "Company"}
        snapshot={snapshot}
      />
      <Vision environmentId={environmentId} goal={goal} />
      {proposals.map((proposal) => (
        <ProposalCard key={proposal.id} proposal={proposal} onCommand={send} />
      ))}
      <Roadmap milestones={roadmap} />
      <GoalActions environmentId={environmentId} goal={goal} snapshot={snapshot} onCommand={send} />
      <ListSection title="Lessons">
        {lessons.map((lesson) => (
          <ListToggleRow
            key={lesson.id}
            label={lesson.text}
            description={lesson.source}
            value={lesson.active}
            onValueChange={(active) =>
              send({ _tag: "setLessonActive", lessonId: lesson.id, active })
            }
          />
        ))}
        <ListActionRow
          icon="plus"
          label="Add lesson"
          onPress={() =>
            Dialog.prompt({
              title: "Add lesson",
              message: "The orchestrator for this goal reads it before acting.",
              placeholder: "Always run the tests before marking done",
              initialValue: "",
              confirmText: "Add",
              onConfirm: (text) => {
                if (text.trim()) {
                  send({
                    _tag: "addLesson",
                    scope: { _tag: "goal", goalId: goal.id },
                    text: text.trim(),
                  });
                }
              },
            })
          }
        />
      </ListSection>
      <Activity goalId={goal.id} snapshot={snapshot} />
    </>
  );
}

function GoalHeader(props: {
  readonly environmentId: EnvironmentId;
  readonly goal: AlloyGoal;
  readonly companyName: string;
  readonly snapshot: AlloySnapshot;
}) {
  const { goal } = props;
  const navigation = useNavigation();
  return (
    <ListSection>
      <ListRowLayout label="Status" detail={GOAL_STATUS_LABEL[goal.status]} />
      <ListRow
        label="Company"
        detail={props.companyName}
        onPress={() =>
          navigation.navigate("AlloyCompany", {
            environmentId: props.environmentId,
            companyId: goal.companyId,
          })
        }
      />
      <ListRowLayout
        label="Orchestrator"
        description={goal.orchestrator ? goal.orchestrator.routingNote : "Not started"}
        detail={
          goal.orchestrator
            ? modelLabel(props.snapshot.accounts, goal.orchestrator.model)
            : undefined
        }
      />
    </ListSection>
  );
}

function Vision(props: { readonly environmentId: EnvironmentId; readonly goal: AlloyGoal }) {
  const navigation = useNavigation();
  const [expanded, setExpanded] = useState(false);
  const long = isLongText(props.goal.vision, VISION_PREVIEW_LINES);
  const edit = () =>
    navigation.navigate("AlloyEditGoal", {
      environmentId: props.environmentId,
      goalId: props.goal.id,
    });
  return (
    <ListSection
      title="Vision"
      trailing={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit goal"
          className="px-2 active:opacity-60"
          onPress={edit}
        >
          <Text textRole="footnote" className="font-t3-medium text-primary-text">
            Edit
          </Text>
        </Pressable>
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityHint={expanded ? "Collapses the vision" : "Shows the whole vision"}
        disabled={!long}
        onPress={() => setExpanded((value) => !value)}
        className="gap-2 p-4"
      >
        <Text
          textRole="body"
          className={props.goal.vision ? "text-foreground" : "text-foreground-muted"}
          numberOfLines={long && !expanded ? VISION_PREVIEW_LINES : undefined}
        >
          {props.goal.vision || "No vision yet. Describe what done looks like."}
        </Text>
        {long ? (
          <Text textRole="footnote" className="font-t3-medium text-primary-text">
            {expanded ? "Show less" : "Show more"}
          </Text>
        ) : null}
      </Pressable>
    </ListSection>
  );
}

const MILESTONE_ICON = {
  done: "checkmark.circle.fill",
  current: "circle.inset.filled",
  upcoming: "circle",
} as const;

function Roadmap(props: { readonly milestones: ReadonlyArray<AlloyMilestone> }) {
  const progress = roadmapProgress(props.milestones);
  return (
    <ListSection title="Roadmap">
      {props.milestones.length === 0 ? (
        <Muted className="p-4">The orchestrator proposes a roadmap once the goal starts.</Muted>
      ) : (
        <>
          <View className="px-4 pt-4">
            <ProgressLine done={progress.done} total={progress.total} label="milestones done" />
          </View>
          {props.milestones.map((milestone) => (
            <MilestoneRow key={milestone.id} milestone={milestone} />
          ))}
        </>
      )}
    </ListSection>
  );
}

function MilestoneRow(props: { readonly milestone: AlloyMilestone }) {
  const { milestone } = props;
  const current = milestone.status === "current";
  return (
    <View className={current ? "bg-subtle" : undefined}>
      <ListRowLayout
        leading={
          <SymbolView
            name={MILESTONE_ICON[milestone.status]}
            size={20}
            tintColorClassName={current ? "accent-primary-text" : "accent-icon"}
            type="monochrome"
          />
        }
        label={milestone.title}
        description={[milestone.doneWhen, milestone.note].filter(Boolean).join("\n") || undefined}
        detail={
          milestone.progress ? `${milestone.progress.done}/${milestone.progress.total}` : undefined
        }
        meta={
          current && milestone.progress ? (
            <Progress
              className="pt-1"
              value={progressFraction(milestone.progress)}
              label={`${milestone.title} progress`}
            />
          ) : undefined
        }
      />
    </View>
  );
}

function ProposalCard(props: {
  readonly proposal: AlloyProposal;
  readonly onCommand: (command: AlloyCommand) => void;
}) {
  const { proposal } = props;
  const nowMs = useNowMinuteMs();
  const decide = (decision: "approved" | "rejected" | "noted", note: string | null = null) =>
    props.onCommand({ _tag: "decideProposal", proposalId: proposal.id, decision, note });
  const reject = () =>
    Dialog.prompt({
      title: "Reject proposal",
      message: "Optionally tell the agent why. The reason becomes a lesson.",
      placeholder: "Reason",
      initialValue: "",
      confirmText: "Reject",
      onConfirm: (reason) => decide("rejected", reason.trim() || null),
    });
  const roadmap = proposal.body._tag === "roadmap" ? proposal.body.milestones : null;
  return (
    <ListSection
      title={roadmap ? "Needs you · roadmap change" : "Needs you · idea"}
      footer={`${proposal.author} · ${relativeTime(proposal.createdAt, nowMs)} ago`}
    >
      <View className="gap-3 p-4">
        <Text textRole="body" className="font-t3-bold text-foreground">
          {proposal.title}
        </Text>
        {proposal.rationale ? <Muted>{proposal.rationale}</Muted> : null}
        {roadmap ? (
          <View className="gap-2">
            {roadmap.map((item, index) => (
              <View key={`${item.title}\u0000${item.doneWhen}`} className="flex-row gap-2">
                <Text textRole="footnote" className="w-5 text-right text-foreground-muted">
                  {`${index + 1}.`}
                </Text>
                <View className="min-w-0 flex-1">
                  <Text textRole="footnote" className="text-foreground">
                    {item.title}
                  </Text>
                  {item.doneWhen ? <Muted>{item.doneWhen}</Muted> : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}
        <View className="flex-row flex-wrap gap-2">
          <Button
            label="Approve"
            tone="primary"
            size="compact"
            onPress={() => decide("approved")}
          />
          {roadmap ? null : (
            <Button label="Noted" tone="secondary" size="compact" onPress={() => decide("noted")} />
          )}
          <Button label="Reject" tone="danger" size="compact" onPress={reject} />
        </View>
      </View>
    </ListSection>
  );
}

function GoalActions(props: {
  readonly environmentId: EnvironmentId;
  readonly goal: AlloyGoal;
  readonly snapshot: AlloySnapshot;
  readonly onCommand: (command: AlloyCommand) => void;
}) {
  const { goal, environmentId } = props;
  const navigation = useNavigation();
  const options = modelOptions(props.snapshot.accounts);
  const start = (model: AlloyModelChoice | null) =>
    props.onCommand({ _tag: "startGoal", goalId: goal.id, model });
  const startActions: MenuAction[] = [
    { id: "auto", title: "Auto", subtitle: "Best ranked model with headroom" },
    ...options.map((option) => ({ id: option.key, title: option.label })),
  ];
  const orchestrator = goal.orchestrator;
  return (
    <ListSection title="Actions">
      {goal.status === "draft" || goal.status === "paused" ? (
        <Menu
          accessible
          accessibilityRole="button"
          accessibilityLabel={goal.status === "paused" ? "Resume" : "Start"}
          title="Orchestrator model"
          actions={startActions}
          onPressAction={({ nativeEvent }) =>
            start(
              nativeEvent.event === "auto"
                ? null
                : (options.find((option) => option.key === nativeEvent.event)?.choice ?? null),
            )
          }
        >
          <ListRowLayout
            icon="play"
            label={goal.status === "paused" ? "Resume" : "Start"}
            description="Auto follows the company ranking, or pick a model"
          />
        </Menu>
      ) : null}
      {goal.status === "running" ? (
        <ListActionRow
          icon="pause"
          label="Pause"
          onPress={() =>
            props.onCommand({ _tag: "setGoalStatus", goalId: goal.id, status: "paused" })
          }
        />
      ) : null}
      {orchestrator ? (
        <>
          <ListActionRow
            icon="text.bubble"
            label="Message orchestrator"
            onPress={() =>
              Dialog.prompt({
                title: "Message orchestrator",
                initialValue: "",
                confirmText: "Send",
                onConfirm: (text) => {
                  if (text.trim()) {
                    props.onCommand({
                      _tag: "messageOrchestrator",
                      goalId: goal.id,
                      text: text.trim(),
                    });
                  }
                },
              })
            }
          />
          <ListRow
            icon="bubble.left.and.bubble.right"
            label="Open orchestrator thread"
            onPress={() =>
              navigation.dispatch(
                StackActions.push("Thread", { environmentId, threadId: orchestrator.threadId }),
              )
            }
          />
        </>
      ) : null}
      {goal.status === "done" ? null : (
        <ListActionRow
          icon="checkmark.circle"
          label="Mark done"
          onPress={() =>
            Dialog.confirm({
              title: "Mark this goal done?",
              message: "The orchestrator stops working on it.",
              confirmText: "Mark done",
              onConfirm: () =>
                props.onCommand({ _tag: "setGoalStatus", goalId: goal.id, status: "done" }),
            })
          }
        />
      )}
    </ListSection>
  );
}

function Activity(props: { readonly goalId: AlloyGoalId; readonly snapshot: AlloySnapshot }) {
  const nowMs = useNowMinuteMs();
  const [showAll, setShowAll] = useState(false);
  const entries = goalActivity(props.snapshot.activity, props.goalId);
  if (entries.length === 0) return null;
  const shown = showAll ? entries : entries.slice(0, ACTIVITY_PREVIEW);
  return (
    <ListSection title="Activity">
      {shown.map((entry) => (
        <ListRowLayout
          key={entry.id}
          label={entry.text}
          description={`${entry.author} · ${relativeTime(entry.at, nowMs)} ago`}
        />
      ))}
      {entries.length > shown.length ? (
        <ListActionRow label={`Show all ${entries.length}`} onPress={() => setShowAll(true)} />
      ) : null}
    </ListSection>
  );
}
