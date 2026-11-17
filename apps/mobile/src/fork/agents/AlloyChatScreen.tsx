import { KeyboardAwareLegendList } from "@legendapp/list/keyboard";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import {
  AuthOrchestrationOperateScope,
  type EnvironmentId,
  type ThreadId,
} from "@t3tools/contracts";
import type { AlloyGoal, AlloyGoalId, AlloySnapshot } from "@t3tools/contracts/alloy";
import * as Haptics from "expo-haptics";
import { useState, type ComponentPropsWithRef } from "react";
import { Platform, Pressable, View, useWindowDimensions } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import Animated, { useSharedValue } from "react-native-reanimated";
import { useResolveClassNames } from "uniwind";

import { useComposerBottomInset } from "../../components/ComposerSurface";
import { AppBar } from "../../components/ui/AppBar";
import { AppText as Text } from "../../components/ui/AppText";
import { useMarkdownPreviewStyles } from "../../features/files/FileMarkdownPreview";
import { appendPendingThreadMessages } from "../../features/threads/pending-thread-feed";
import { ShimmeringWorkContent } from "../../features/threads/thread-work-log";
import { ThreadComposer } from "../../features/threads/ThreadComposer";
import { useMessageTimeFormatter } from "../../features/threads/useMessageTimeFormatter";
import { useStartSideChat } from "../../features/threads/useStartSideChat";
import { useNowMinuteMs } from "../../lib/clock";
import { cn } from "../../lib/cn";
import { createThreadFeedCache, deriveThreadFeedPresentation } from "../../lib/threadActivity";
import { SelectableMarkdownText } from "../../native/SelectableMarkdownText";
import { NativeScrollViewMarker } from "../../native/NativeScrollViewMarker";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { useOpenPullRequest } from "../../native/useOpenPullRequest";
import { useEnvironmentScope } from "../../state/session";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { useRemoteEnvironmentRuntime } from "../../state/use-remote-environment-registry";
import { useSelectedThreadWorktree } from "../../state/use-selected-thread-worktree";
import { useThreadComposerState } from "../../state/use-thread-composer-state";
import { useThreadSelection } from "../../state/use-thread-selection";
import { ProposalContent } from "./AlloyProposalContent";
import { buildChatTimeline, type ChatRow } from "./alloy-chat";
import { agentStatus, agentStatusLabel } from "./alloy-inbox";
import { modelName } from "./alloy-model";
import { useOpenInCode } from "./alloy-navigation";
import { useAlloyCommand, useAlloySnapshot } from "./alloy-state";

type ChatParams = {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly goalId: AlloyGoalId;
};

type ComposerState = ReturnType<typeof useThreadComposerState>;

const NO_RUNS = new Set<never>();
const NO_GROUPS = new Set<string>();
const BUBBLE_MAX_WIDTH = 0.78;
const MAINTAIN_SCROLL_AT_END = {
  animated: false,
  on: { dataChange: true, itemLayout: true, layout: true },
} as const;

export function AlloyChatScreen({ route }: StaticScreenProps<ChatParams>) {
  const { environmentId, threadId, goalId } = route.params;
  const snapshot = useAlloySnapshot(environmentId).data;
  const goal = snapshot?.goals.find((candidate) => candidate.id === goalId) ?? null;
  return (
    <View className="flex-1 bg-screen">
      <ChatHeader
        environmentId={environmentId}
        threadId={threadId}
        goalId={goalId}
        goal={goal}
        snapshot={snapshot}
      />
      <Conversation
        environmentId={environmentId}
        threadId={threadId}
        goalId={goalId}
        snapshot={snapshot}
      />
    </View>
  );
}

function ChatHeader(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly goalId: AlloyGoalId;
  readonly goal: AlloyGoal | null;
  readonly snapshot: AlloySnapshot | null;
}) {
  const navigation = useNavigation();
  const openInCode = useOpenInCode(props.environmentId);
  const { goal, snapshot } = props;
  const title = goal?.title ?? "Agent";
  const subtitle =
    goal && snapshot
      ? [
          goal.orchestrator ? modelName(snapshot.accounts, goal.orchestrator.model) : null,
          agentStatusLabel(agentStatus(goal, snapshot)),
        ]
          .filter(Boolean)
          .join(" · ")
      : "";
  const openDetails = () =>
    navigation.navigate("AlloyGoal", {
      environmentId: props.environmentId,
      goalId: props.goalId,
    });
  const renderTitle = () => <ChatTitle title={title} subtitle={subtitle} onPress={openDetails} />;
  return (
    <>
      <AppBar
        title={title}
        onBack={() => navigation.goBack()}
        actions={[
          {
            accessibilityLabel: "Open in Code",
            icon: "chevron.left.forwardslash.chevron.right",
            onPress: () => openInCode(props.threadId),
          },
          { accessibilityLabel: "Agent details", icon: "info.circle", onPress: openDetails },
        ]}
      />
      <NativeStackScreenOptions
        optionsVersion={[title, subtitle]}
        options={{ headerTitle: renderTitle }}
      />
    </>
  );
}

function ChatTitle(props: {
  readonly title: string;
  readonly subtitle: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.subtitle ? `${props.title}, ${props.subtitle}` : props.title}
      accessibilityHint="Shows the agent's details"
      className="items-center active:opacity-60"
      onPress={props.onPress}
    >
      <Text textRole="body" numberOfLines={1} className="font-t3-bold text-foreground">
        {props.title}
      </Text>
      {props.subtitle ? (
        <Text textRole="caption" numberOfLines={1} className="text-foreground-muted">
          {props.subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

function ChatScrollView(props: ComponentPropsWithRef<typeof Animated.ScrollView>) {
  return (
    <NativeScrollViewMarker style={{ flex: 1 }}>
      <Animated.ScrollView {...props} />
    </NativeScrollViewMarker>
  );
}

/** T3's feed for this thread as its own view presents it, with every run folded. */
function useFoldedFeed(composer: ComposerState) {
  const [cache] = useState(createThreadFeedCache);
  return appendPendingThreadMessages(
    deriveThreadFeedPresentation(
      composer.selectedThreadFeed,
      composer.selectedThreadActivityRun,
      NO_RUNS,
      NO_GROUPS,
      composer.activeWorkStartedAt,
      composer.runlessWorkActive,
      cache,
    ),
    composer.selectedThreadFeed,
    composer.selectedThreadQueuedMessages,
  );
}

function Conversation(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly goalId: AlloyGoalId;
  readonly snapshot: AlloySnapshot | null;
}) {
  const startSideChat = useStartSideChat();
  const composer = useThreadComposerState({ startSideChat });
  const presented = useFoldedFeed(composer);
  const composerInset = useSharedValue(96);
  const bottomInset = useComposerBottomInset();
  const rows = buildChatTimeline({
    goalId: props.goalId,
    presented,
    feed: composer.selectedThreadFeed,
    proposals: props.snapshot?.proposals ?? [],
    activity: props.snapshot?.activity ?? [],
    working: composer.activeWorkStartedAt !== null,
  });
  return (
    <View className="flex-1">
      {/* oxlint-disable-next-line t3code/require-registered-list-scroll -- ChatScrollView is passed through the iOS-only spread below; the prop rejects undefined. */}
      <KeyboardAwareLegendList
        style={{ flex: 1 }}
        {...(Platform.OS === "ios" ? { ScrollViewComponent: ChatScrollView } : {})}
        data={rows}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.kind}
        renderItem={({ item }) => (
          <ChatRowView row={item} environmentId={props.environmentId} threadId={props.threadId} />
        )}
        estimatedItemSize={64}
        alignItemsAtEnd
        initialScrollAtEnd
        maintainScrollAtEnd={MAINTAIN_SCROLL_AT_END}
        maintainVisibleContentPosition
        keyboardOffset={bottomInset}
        keyboardLiftBehavior="whenAtEnd"
        contentInsetEndAdjustment={composerInset}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 }}
      />
      <KeyboardStickyView
        pointerEvents="box-none"
        style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}
        offset={{ closed: 0, opened: bottomInset }}
      >
        <View onLayout={(event) => composerInset.set(event.nativeEvent.layout.height)}>
          <ChatComposer
            composer={composer}
            environmentId={props.environmentId}
            bottomInset={bottomInset}
          />
        </View>
      </KeyboardStickyView>
    </View>
  );
}

function ChatComposer(props: {
  readonly composer: ComposerState;
  readonly environmentId: EnvironmentId;
  readonly bottomInset: number;
}) {
  const { composer, environmentId } = props;
  const { selectedThread, selectedEnvironmentConnection } = useThreadSelection();
  const { selectedThreadCwd } = useSelectedThreadWorktree();
  const runtime = useRemoteEnvironmentRuntime(environmentId);
  const canOperateThread = useEnvironmentScope(environmentId, AuthOrchestrationOperateScope);
  const interruptTurn = useAtomCommand(threadEnvironment.interruptTurn, "thread interrupt");
  if (selectedThread === null) return null;
  const stop = () => {
    if (composer.interruptibleRunId === null) return;
    void interruptTurn({
      environmentId,
      input: { threadId: selectedThread.id, runId: composer.interruptibleRunId },
    });
  };
  const send = async (followUp?: Parameters<ComposerState["onSendMessage"]>[0]) => {
    const messageId = await composer.onSendMessage(followUp);
    if (messageId !== null) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    return messageId;
  };
  return (
    <ThreadComposer
      canOperateThread={canOperateThread}
      placeholder="Message"
      connectionState={runtime?.connectionState ?? "available"}
      environmentLabel={selectedEnvironmentConnection?.environmentLabel ?? null}
      selectedThread={{
        ...selectedThread,
        modelSelection: composer.modelSelection ?? selectedThread.modelSelection,
        runtimeMode: composer.runtimeMode ?? selectedThread.runtimeMode,
        interactionMode: composer.interactionMode ?? selectedThread.interactionMode,
      }}
      hasCompactableConversation={false}
      serverConfig={runtime?.serverConfig ?? null}
      queueCount={composer.selectedThreadQueueCount}
      activeThreadBusy={composer.activeThreadBusy}
      redirectsApproval={false}
      canStopThread={composer.interruptibleRunId !== null}
      environmentId={environmentId}
      projectCwd={selectedThreadCwd}
      draftKey={composer.composerDraftKey ?? undefined}
      followUpBehavior={composer.followUpBehavior}
      canSteerActiveTurn={composer.canSteerActiveTurn}
      hidden={false}
      bottomInset={props.bottomInset}
      onChangeDraftMessage={composer.onChangeDraftMessage}
      onPickDraftMedia={composer.onPickDraftMedia}
      onPickDraftFiles={composer.onPickDraftFiles}
      onNativePasteImages={composer.onNativePasteImages}
      onNativePasteText={composer.onNativePasteText}
      onRemoveDraftImage={composer.onRemoveDraftImage}
      onStopThread={stop}
      onResumeQueue={null}
      onSendMessage={send}
      onShowUsageLimits={() => {}}
      canSwitchProvider={composer.canSwitchThreadProvider}
    />
  );
}

function ChatRowView(props: {
  readonly row: ChatRow;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const { row } = props;
  switch (row.kind) {
    case "time":
      return <TimeLabel at={row.at} />;
    case "bubble":
      return <Bubble row={row} />;
    case "run":
      return (
        <RunLine label={row.label} environmentId={props.environmentId} threadId={props.threadId} />
      );
    case "proposal":
      return <ProposalCard proposal={row.proposal} environmentId={props.environmentId} />;
    case "note":
      return <SystemLine text={row.text} />;
    case "typing":
      return <Typing />;
  }
}

function TimeLabel(props: { readonly at: string }) {
  const nowMs = useNowMinuteMs();
  const formatTime = useMessageTimeFormatter();
  return (
    <Text textRole="caption" className="pb-1 pt-4 text-center font-t3-medium text-foreground-muted">
      {formatTime(props.at, nowMs)}
    </Text>
  );
}

function SystemLine(props: { readonly text: string }) {
  return (
    <Text textRole="caption" className="px-8 py-1.5 text-center text-foreground-muted">
      {props.text}
    </Text>
  );
}

function RunLine(props: {
  readonly label: string;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const openInCode = useOpenInCode(props.environmentId);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens the full session in Code"
      className="self-start px-2 py-1.5 active:opacity-60"
      onPress={() => openInCode(props.threadId)}
    >
      <Text textRole="caption" className="text-foreground-muted">
        {`${props.label} ›`}
      </Text>
    </Pressable>
  );
}

function Bubble(props: { readonly row: Extract<ChatRow, { kind: "bubble" }> }) {
  const { row } = props;
  const { width } = useWindowDimensions();
  const markdown = useMarkdownPreviewStyles();
  const openLink = useOpenPullRequest();
  return (
    <View
      className={cn(row.fromBen ? "items-end" : "items-start", row.first ? "pt-2" : "pt-0.5")}
      style={{ opacity: row.pending ? 0.6 : 1 }}
    >
      <View
        className={cn(
          "rounded-[20px] px-3.5 py-2",
          row.fromBen ? "bg-primary" : "bg-subtle",
          !row.last && (row.fromBen ? "rounded-br-md" : "rounded-bl-md"),
          !row.first && (row.fromBen ? "rounded-tr-md" : "rounded-tl-md"),
        )}
        style={{ maxWidth: width * BUBBLE_MAX_WIDTH }}
      >
        {row.fromBen ? (
          <Text textRole="body" selectable className="text-primary-foreground">
            {row.text}
          </Text>
        ) : (
          <SelectableMarkdownText
            markdown={row.text}
            textStyle={markdown.nativeTextStyle}
            onLinkPress={(href) => {
              if (/^https?:\/\//iu.test(href)) void openLink(href);
            }}
          />
        )}
      </View>
    </View>
  );
}

function Typing() {
  const iconColor = useResolveClassNames("text-icon-subtle").color ?? "gray";
  return (
    <View className="items-start pt-2">
      <View className="rounded-[20px] bg-subtle px-3.5 py-1.5">
        <ShimmeringWorkContent
          icon="brain"
          iconSubtleColor={iconColor}
          label="Thinking"
          showIcon
          compact
        />
      </View>
    </View>
  );
}

function ProposalCard(props: {
  readonly proposal: Extract<ChatRow, { kind: "proposal" }>["proposal"];
  readonly environmentId: EnvironmentId;
}) {
  const run = useAlloyCommand(props.environmentId);
  return (
    <View className="py-2">
      <View className="gap-1 rounded-[20px] border border-border-subtle bg-grouped-card p-4">
        <Text textRole="caption" className="font-t3-medium text-primary-text">
          Needs you
        </Text>
        <ProposalContent
          proposal={props.proposal}
          onDecide={(decision, note) =>
            void run({
              _tag: "decideProposal",
              proposalId: props.proposal.id,
              decision,
              note,
            }).then((result) => {
              if (result) void Haptics.selectionAsync();
            })
          }
        />
      </View>
    </View>
  );
}
