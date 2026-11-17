import { useAtomSet } from "@effect/atom-react";
import type { MenuAction } from "@react-native-menu/menu";
import { useNavigation } from "@react-navigation/native";
import type { EnvironmentId } from "@t3tools/contracts";
import type { AlloyGoal, AlloySnapshot } from "@t3tools/contracts/alloy";
import { use, useState } from "react";
import { View } from "react-native";

import { ProviderIcon } from "../../components/ProviderIcon";
import { AppText as Text } from "../../components/ui/AppText";
import { EmptyState } from "../../components/ui/EmptyState";
import { Menu } from "../../components/ui/Menu";
import { RefreshControl } from "../../components/ui/RefreshControl";
import { RowPressable } from "../../components/ui/RowPressable";
import { ScreenContent } from "../../components/ui/ScreenContent";
import { ScreenScrollView } from "../../components/ui/ScreenScrollView";
import { Toolbar } from "../../components/ui/Toolbar";
import { useNowMinuteMs } from "../../lib/clock";
import { cn } from "../../lib/cn";
import { relativeTime } from "../../lib/time";
import { NATIVE_LIQUID_GLASS_SUPPORTED } from "../../native/native-glass";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { NativeWorkspaceTabActivityContext } from "../../native/v5-workspace-context";
import { useThreadShells } from "../../state/entities";
import { resolveThreadActivityTimestamp } from "@t3tools/client-runtime/state/thread-sort";
import { AlloyEnvironmentGate, WithSnapshot } from "./AlloyLayout";
import { agentRows, agentStatusLabel, type AgentRow } from "./alloy-inbox";
import {
  useAlloyCommand,
  useAlloySnapshot,
  useAlloySnapshotFetch,
  useThreadPreview,
} from "./alloy-state";
import { useOpenAgent, useOpenInCode } from "./alloy-navigation";
import { workspaceModeAtom } from "./workspace-mode";

export function AlloyShell() {
  const headerOnly = use(NativeWorkspaceTabActivityContext)?.headerOnly === true;
  return (
    <View className="flex-1 bg-screen">
      <ShellHeader />
      {headerOnly ? null : (
        <AlloyEnvironmentGate>
          {(environmentId) => <Inbox environmentId={environmentId} />}
        </AlloyEnvironmentGate>
      )}
    </View>
  );
}

const renderNoTitle = () => <View />;

function ShellHeader() {
  const navigation = useNavigation();
  const setMode = useAtomSet(workspaceModeAtom);
  return (
    <>
      <NativeStackScreenOptions
        options={{
          title: "Agents",
          headerShown: true,
          headerTitle: renderNoTitle,
          headerTransparent: NATIVE_LIQUID_GLASS_SUPPORTED,
          headerStyle: NATIVE_LIQUID_GLASS_SUPPORTED
            ? { backgroundColor: "transparent" }
            : undefined,
          headerSearchBarOptions: undefined,
          unstable_headerToolbarItems: () => [],
        }}
      />
      <Toolbar placement="left">
        <Toolbar.Button
          label="Code"
          accessibilityLabel="Switch to Code"
          onPress={() => setMode("code")}
        />
      </Toolbar>
      <Toolbar placement="right">
        <Toolbar.Menu title="Settings" accessibilityLabel="Settings" icon="gearshape">
          <Toolbar.MenuAction icon="cube" onPress={() => navigation.navigate("SettingsAlloy")}>
            Alloy settings
          </Toolbar.MenuAction>
          <Toolbar.MenuAction icon="chart.bar" onPress={() => navigation.navigate("SettingsUsage")}>
            Usage
          </Toolbar.MenuAction>
          <Toolbar.MenuAction icon="gearshape.2" onPress={() => navigation.navigate("Settings")}>
            App settings
          </Toolbar.MenuAction>
        </Toolbar.Menu>
        <Toolbar.Button
          icon="square.and.pencil"
          accessibilityLabel="New agent"
          onPress={() => navigation.navigate("AlloyNewAgent")}
        />
      </Toolbar>
    </>
  );
}

function Inbox(props: { readonly environmentId: EnvironmentId }) {
  const query = useAlloySnapshot(props.environmentId);
  const fetchSnapshot = useAlloySnapshotFetch(props.environmentId);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = () => {
    setRefreshing(true);
    void fetchSnapshot().finally(() => {
      query.refresh();
      setRefreshing(false);
    });
  };
  return (
    <ScreenContent surface="screen">
      <ScreenScrollView
        className="flex-1 bg-screen"
        contentInsetAdjustmentBehavior="automatic"
        alwaysBounceVertical
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <Text textRole="display" className="px-5 pb-2 pt-1 font-t3-bold text-foreground">
          Agents
        </Text>
        <WithSnapshot query={query}>
          {(snapshot) => <AgentList environmentId={props.environmentId} snapshot={snapshot} />}
        </WithSnapshot>
      </ScreenScrollView>
    </ScreenContent>
  );
}

function AgentList(props: {
  readonly environmentId: EnvironmentId;
  readonly snapshot: AlloySnapshot;
}) {
  const navigation = useNavigation();
  const shells = useThreadShells();
  const rows = agentRows(props.snapshot, (goal) => {
    const threadId = goal.orchestrator?.threadId;
    const shell = shells.find(
      (candidate) => candidate.environmentId === props.environmentId && candidate.id === threadId,
    );
    return shell ? resolveThreadActivityTimestamp(shell) : null;
  });
  if (rows.length === 0) {
    return (
      <EmptyState
        variant="plain"
        title="No agents yet"
        detail="Tell an agent what you want done. It talks the goal through with you, proposes a roadmap, then works through it and checks with you before changing course."
        actionLabel="New agent"
        onAction={() => navigation.navigate("AlloyNewAgent")}
      />
    );
  }
  return (
    <View>
      {rows.map((row, index) => (
        <AgentRowView
          key={row.goal.id}
          environmentId={props.environmentId}
          row={row}
          snapshot={props.snapshot}
          divider={index < rows.length - 1}
        />
      ))}
    </View>
  );
}

const AVATAR_SIZE = 48;

function AgentAvatar(props: { readonly goal: AlloyGoal; readonly snapshot: AlloySnapshot }) {
  const company = props.snapshot.companies.find(
    (candidate) => candidate.id === props.goal.companyId,
  );
  const orchestrator = props.goal.orchestrator;
  const driver = orchestrator
    ? props.snapshot.accounts.find(
        (account) => account.instanceId === orchestrator.model.instanceId,
      )?.driver
    : undefined;
  return (
    <View style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}>
      <View
        className="items-center justify-center rounded-full bg-subtle"
        style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
      >
        <Text textRole="title" className="font-t3-bold text-foreground-secondary">
          {(company?.name ?? props.goal.title).trim().charAt(0).toUpperCase()}
        </Text>
      </View>
      {driver ? (
        <View className="absolute -bottom-0.5 -right-0.5 items-center justify-center rounded-full bg-screen p-0.5">
          <ProviderIcon provider={driver} size={16} />
        </View>
      ) : null}
    </View>
  );
}

const PAUSE = "pause";
const RESUME = "resume";
const CODE = "code";
const DETAILS = "details";

function AgentRowView(props: {
  readonly environmentId: EnvironmentId;
  readonly row: AgentRow;
  readonly snapshot: AlloySnapshot;
  readonly divider: boolean;
}) {
  const { environmentId, row } = props;
  const { goal, status } = row;
  const navigation = useNavigation();
  const nowMs = useNowMinuteMs();
  const run = useAlloyCommand(environmentId);
  const openAgent = useOpenAgent(environmentId);
  const openInCode = useOpenInCode(environmentId);
  const threadId = goal.orchestrator?.threadId ?? null;
  const preview = useThreadPreview(environmentId, threadId);
  const needsYou = status._tag === "needsYou";
  const previewText = preview
    ? `${preview.fromBen ? "You: " : ""}${preview.text}`
    : goal.vision || (goal.orchestrator ? "No messages yet" : "Not started");
  const actions: MenuAction[] = [
    ...(goal.status === "running" ? [{ id: PAUSE, title: "Pause", image: "pause" }] : []),
    ...(goal.status === "paused" ? [{ id: RESUME, title: "Resume", image: "play" }] : []),
    ...(threadId
      ? [{ id: CODE, title: "Open in Code", image: "chevron.left.forwardslash.chevron.right" }]
      : []),
    { id: DETAILS, title: "Details", image: "info.circle" },
  ];
  const onAction = (id: string) => {
    if (id === PAUSE) void run({ _tag: "setGoalStatus", goalId: goal.id, status: "paused" });
    if (id === RESUME)
      void run({ _tag: "startGoal", goalId: goal.id, model: goal.orchestrator?.model ?? null });
    if (id === CODE && threadId) openInCode(threadId);
    if (id === DETAILS) navigation.navigate("AlloyGoal", { environmentId, goalId: goal.id });
  };
  return (
    <Menu
      actions={actions}
      shouldOpenOnLongPress
      onPressAction={({ nativeEvent }) => onAction(nativeEvent.event)}
    >
      <RowPressable
        accessibilityRole="button"
        accessibilityLabel={`${goal.title}, ${agentStatusLabel(status)}`}
        accessibilityHint="Opens the conversation. Long press for more."
        onPress={() => openAgent(goal)}
      >
        <View className="flex-row gap-3 pl-4">
          <View className="py-3">
            <AgentAvatar goal={goal} snapshot={props.snapshot} />
          </View>
          <View
            className={cn(
              "min-w-0 flex-1 gap-0.5 py-3 pr-4",
              props.divider && "border-b border-border-subtle",
            )}
          >
            <View className="flex-row items-baseline gap-2">
              <Text
                textRole="body"
                numberOfLines={1}
                className="min-w-0 flex-1 font-t3-bold text-foreground"
              >
                {goal.title}
              </Text>
              <Text textRole="footnote" className="text-foreground-muted">
                {relativeTime(row.at, nowMs)}
              </Text>
            </View>
            <View className="flex-row items-start gap-2">
              <Text
                textRole="footnote"
                numberOfLines={2}
                className="min-w-0 flex-1 text-foreground-muted"
              >
                {previewText}
              </Text>
              <Text
                textRole="caption"
                className={cn(
                  "overflow-hidden rounded-full px-2 py-0.5 font-t3-medium",
                  needsYou
                    ? "bg-primary text-primary-foreground"
                    : "bg-subtle text-foreground-secondary",
                )}
              >
                {agentStatusLabel(status)}
              </Text>
            </View>
          </View>
        </View>
      </RowPressable>
    </Menu>
  );
}
