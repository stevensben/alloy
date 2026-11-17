import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { ScreenContent } from "../../components/ui/ScreenContent";
import { ScreenScrollView } from "../../components/ui/ScreenScrollView";
import { useWorkspaceTabs } from "../../features/layout/workspace/WorkspaceTabsContext";
import {
  PLACEHOLDER_AGENT_TASKS,
  formatTokenBudget,
  groupAgentTasks,
  type AgentTask,
} from "./agent-tasks";

const PROVIDER_LABEL = { claude: "Claude", codex: "Codex", grok: "Grok" } as const;

export function AgentsScreen() {
  const bottomClearance = useWorkspaceTabs()?.bottomClearance ?? 0;
  const sections = groupAgentTasks(PLACEHOLDER_AGENT_TASKS);
  return (
    <ScreenContent surface="screen">
      <ScreenScrollView
        className="flex-1 bg-screen"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomClearance }}
      >
        {sections.needsYou.length > 0 ? (
          <Section title={`Needs you (${sections.needsYou.length})`} tone="danger">
            {sections.needsYou.map((task) => (
              <AgentTaskRow key={task.id} task={task} />
            ))}
          </Section>
        ) : null}
        <Section title="Running">
          {sections.running.map((task) => (
            <AgentTaskRow key={task.id} task={task} />
          ))}
        </Section>
        <Section title={`Done, check passed (${sections.done.length})`}>
          {sections.done.map((task) => (
            <AgentTaskRow key={task.id} task={task} />
          ))}
        </Section>
      </ScreenScrollView>
    </ScreenContent>
  );
}

function Section(props: {
  readonly title: string;
  readonly tone?: "danger";
  readonly children: ReactNode;
}) {
  return (
    <View className="pt-4">
      <Text
        textRole="footnote"
        className={
          props.tone === "danger"
            ? "font-t3-bold text-danger-foreground"
            : "font-t3-bold text-foreground-muted"
        }
      >
        {props.title.toUpperCase()}
      </Text>
      {props.children}
    </View>
  );
}

function AgentTaskRow(props: { readonly task: AgentTask }) {
  const { task } = props;
  const workers = task.workers.map((worker) => PROVIDER_LABEL[worker.provider]).join(", ");
  return (
    <Pressable
      accessibilityRole="button"
      className="flex-row items-start gap-3 border-b border-border py-3"
    >
      <View className="mt-0.5 size-7 items-center justify-center rounded-md bg-primary/15">
        <Text textRole="caption" className="font-t3-bold text-primary">
          {task.projectBadge}
        </Text>
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text textRole="body" className="text-foreground" numberOfLines={2}>
          {task.title}
        </Text>
        <Text textRole="footnote" className="text-foreground-muted" numberOfLines={1}>
          {task.status.kind === "needsYou"
            ? task.status.reason
            : `${task.check.label} · ${formatTokenBudget(task.tokens)} · ${workers}`}
        </Text>
      </View>
      <AgentTaskStatus task={task} />
    </Pressable>
  );
}

function AgentTaskStatus(props: { readonly task: AgentTask }) {
  const { status } = props.task;
  switch (status.kind) {
    case "needsYou":
      return (
        <SymbolView
          name="exclamationmark.triangle"
          size={18}
          tintColorClassName="accent-danger-foreground"
        />
      );
    case "running":
      return (
        <Text textRole="footnote" className="text-foreground-muted">
          {`${status.step}/${status.steps}`}
        </Text>
      );
    case "done":
      return (
        <View className="flex-row items-center gap-1">
          <SymbolView name="checkmark.circle" size={15} tintColorClassName="accent-icon" />
          <Text textRole="footnote" className="font-t3-bold text-foreground">
            Done
          </Text>
        </View>
      );
  }
}
