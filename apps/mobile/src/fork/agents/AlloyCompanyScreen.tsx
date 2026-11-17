import type { MenuAction } from "@react-native-menu/menu";
import type { StaticScreenProps } from "@react-navigation/native";
import type { EnvironmentId } from "@t3tools/contracts";
import type {
  AlloyCompany,
  AlloyCompanyId,
  AlloyModelChoice,
  AlloySnapshot,
} from "@t3tools/contracts/alloy";
import { useState } from "react";
import { View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { ControlPill } from "../../components/ui/ControlPill";
import { ListRowLayout } from "../../components/ui/ListRowLayout";
import { ListSection } from "../../components/ui/ListSection";
import { Menu } from "../../components/ui/Menu";
import { AlloyPage, Muted, NotFound, WithSnapshot } from "./AlloyLayout";
import { modelChoiceKey, modelLabel, modelMenuGroups, modelOptions, moveItem } from "./alloy-model";
import { useAlloyCommand, useAlloySnapshot } from "./alloy-state";

type CompanyParams = { readonly environmentId: EnvironmentId; readonly companyId: AlloyCompanyId };

export function AlloyCompanyScreen({ route }: StaticScreenProps<CompanyParams>) {
  const query = useAlloySnapshot(route.params.environmentId);
  const company = query.data?.companies.find(
    (candidate) => candidate.id === route.params.companyId,
  );
  return (
    <AlloyPage title={company?.name ?? "Company"} subtitle="Model ranking">
      <WithSnapshot query={query}>
        {(snapshot) => {
          const current = snapshot.companies.find(
            (candidate) => candidate.id === route.params.companyId,
          );
          return current ? (
            <Ranking
              environmentId={route.params.environmentId}
              company={current}
              snapshot={snapshot}
            />
          ) : (
            <NotFound what="company" />
          );
        }}
      </WithSnapshot>
    </AlloyPage>
  );
}

function Ranking(props: {
  readonly environmentId: EnvironmentId;
  readonly company: AlloyCompany;
  readonly snapshot: AlloySnapshot;
}) {
  const run = useAlloyCommand(props.environmentId);
  // Edits apply at once and stay shown while the save and the refetch land.
  const [draft, setDraft] = useState<ReadonlyArray<AlloyModelChoice> | null>(null);
  const ranking = draft ?? props.company.modelRanking;
  const rankedKeys = new Set(ranking.map(modelChoiceKey));
  const addable = modelOptions(props.snapshot.accounts).filter(
    (option) => !rankedKeys.has(option.key),
  );
  const addActions: MenuAction[] = modelMenuGroups(props.snapshot.accounts, addable, null);

  const save = async (next: ReadonlyArray<AlloyModelChoice>) => {
    setDraft(next);
    const result = await run({
      _tag: "setCompanyRanking",
      companyId: props.company.id,
      modelRanking: next,
    });
    if (result === null) setDraft(null);
  };

  return (
    <ListSection
      title="Ranked models"
      footer="Routing starts the orchestrator on the highest ranked model that has headroom, preferring accounts whose usage resets soonest."
    >
      {ranking.length === 0 ? (
        <Muted className="p-4">
          No models ranked. Goals here need a model picked when they start.
        </Muted>
      ) : (
        ranking.map((choice, index) => (
          <ListRowLayout
            key={modelChoiceKey(choice)}
            leading={
              <Text textRole="body" className="font-t3-bold text-foreground-muted">
                {`${index + 1}`}
              </Text>
            }
            label={modelLabel(props.snapshot.accounts, choice)}
            accessory={
              <View className="flex-row gap-2">
                <ControlPill
                  icon="arrow.up"
                  accessibilityLabel="Move up"
                  disabled={index === 0}
                  onPress={() => void save(moveItem(ranking, index, -1))}
                />
                <ControlPill
                  icon="arrow.down"
                  accessibilityLabel="Move down"
                  disabled={index === ranking.length - 1}
                  onPress={() => void save(moveItem(ranking, index, 1))}
                />
                <ControlPill
                  icon="trash"
                  variant="danger"
                  accessibilityLabel="Remove"
                  onPress={() => void save(ranking.filter((_, other) => other !== index))}
                />
              </View>
            }
          />
        ))
      )}
      {addable.length > 0 ? (
        <Menu
          accessible
          accessibilityRole="button"
          accessibilityLabel="Add model"
          title="Add model"
          actions={addActions}
          onPressAction={({ nativeEvent }) => {
            const option = addable.find((candidate) => candidate.key === nativeEvent.event);
            if (option) void save([...ranking, option.choice]);
          }}
        >
          <ListRowLayout icon="plus" label="Add model" />
        </Menu>
      ) : (
        <Muted className="p-4">
          {props.snapshot.accounts.length === 0
            ? "No connected accounts report models."
            : "Every connected model is ranked."}
        </Muted>
      )}
    </ListSection>
  );
}
