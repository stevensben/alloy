import { StackActions, useNavigation, type StaticScreenProps } from "@react-navigation/native";
import type { EnvironmentId } from "@t3tools/contracts";
import type {
  AlloyComp,
  AlloyCompEntry,
  AlloyCompId,
  AlloySnapshot,
} from "@t3tools/contracts/alloy";
import { View } from "react-native";

import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { ListSection } from "../../components/ui/ListSection";
import { AlloyPage, Muted, NotFound, WithSnapshot } from "./AlloyLayout";
import { formatDuration, modelLabel } from "./alloy-model";
import { useAlloyCommand, useAlloySnapshot } from "./alloy-state";

type CompParams = { readonly environmentId: EnvironmentId; readonly compId: AlloyCompId };

const ENTRY_STATUS = { running: "Running", finished: "Finished", failed: "Failed" } as const;

export function AlloyCompScreen({ route }: StaticScreenProps<CompParams>) {
  const query = useAlloySnapshot(route.params.environmentId);
  const comp = query.data?.comps.find((candidate) => candidate.id === route.params.compId);
  return (
    <AlloyPage title={comp?.title ?? "Comp"} subtitle={comp?.taskType}>
      <WithSnapshot query={query}>
        {(snapshot) => {
          const current = snapshot.comps.find((candidate) => candidate.id === route.params.compId);
          return current ? (
            <CompBody
              environmentId={route.params.environmentId}
              comp={current}
              snapshot={snapshot}
            />
          ) : (
            <NotFound what="comp" />
          );
        }}
      </WithSnapshot>
    </AlloyPage>
  );
}

function CompBody(props: {
  readonly environmentId: EnvironmentId;
  readonly comp: AlloyComp;
  readonly snapshot: AlloySnapshot;
}) {
  const { comp } = props;
  const run = useAlloyCommand(props.environmentId);
  return (
    <>
      <ListSection title="Prompt">
        <Text selectable textRole="body" className="p-4 text-foreground">
          {comp.prompt}
        </Text>
      </ListSection>
      {comp.entries.map((entry) => (
        <EntryCard
          key={entry.id}
          environmentId={props.environmentId}
          entry={entry}
          label={modelLabel(props.snapshot.accounts, entry.model)}
          canKeep={entry.kept !== true && entry.status === "finished"}
          onKeep={() => void run({ _tag: "keepCompEntry", compId: comp.id, entryId: entry.id })}
        />
      ))}
    </>
  );
}

function EntryCard(props: {
  readonly environmentId: EnvironmentId;
  readonly entry: AlloyCompEntry;
  readonly label: string;
  readonly canKeep: boolean;
  readonly onKeep: () => void;
}) {
  const { entry } = props;
  const navigation = useNavigation();
  const status = [
    ENTRY_STATUS[entry.status],
    entry.durationMs === null ? null : formatDuration(entry.durationMs),
  ]
    .filter(Boolean)
    .join(" · ");
  const threadId = entry.threadId;
  return (
    <ListSection>
      <View className="gap-3 p-4">
        <View className="flex-row items-center gap-2">
          <Text textRole="body" className="min-w-0 flex-1 font-t3-bold text-foreground">
            {props.label}
          </Text>
          {entry.kept === true ? (
            <View className="flex-row items-center gap-1">
              <SymbolView
                name="checkmark.circle.fill"
                size={16}
                tintColorClassName="accent-primary-text"
              />
              <Text textRole="footnote" className="font-t3-bold text-primary-text">
                Kept
              </Text>
            </View>
          ) : null}
        </View>
        <Muted>{status}</Muted>
        {entry.error ? (
          <Text selectable textRole="footnote" className="text-danger-foreground">
            {entry.error}
          </Text>
        ) : null}
        <View className="flex-row flex-wrap gap-2">
          {threadId ? (
            <Button
              label="Open thread"
              tone="secondary"
              size="compact"
              onPress={() =>
                navigation.dispatch(
                  StackActions.push("Thread", { environmentId: props.environmentId, threadId }),
                )
              }
            />
          ) : null}
          {props.canKeep ? (
            <Button label="Keep this one" tone="primary" size="compact" onPress={props.onKeep} />
          ) : null}
        </View>
      </View>
    </ListSection>
  );
}
