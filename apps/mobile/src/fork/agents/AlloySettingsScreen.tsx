import { useNavigation } from "@react-navigation/native";
import type { EnvironmentId } from "@t3tools/contracts";
import type { AlloySnapshot } from "@t3tools/contracts/alloy";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListActionRow } from "../../components/ui/ListActionRow";
import { ListRow } from "../../components/ui/ListRow";
import { ListSection } from "../../components/ui/ListSection";
import { ScreenScrollView } from "../../components/ui/ScreenScrollView";
import { groupedListInsets } from "../../components/ui/listMetrics";
import { SettingsScreen } from "../../features/settings/components/SettingsScreen";
import { useNowMinuteMs } from "../../lib/clock";
import { AlloyEnvironmentGate, WithSnapshot } from "./AlloyLayout";
import { accountsOverview, modelLabel, scoreboardLeaders } from "./alloy-model";
import { useAlloySnapshot, useNewCompanyPrompt } from "./alloy-state";

export function AlloySettingsScreen() {
  const insets = useSafeAreaInsets();
  return (
    <SettingsScreen title="Alloy">
      <ScreenScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          ...groupedListInsets(false),
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 18) + 18,
        }}
      >
        <AlloyEnvironmentGate>
          {(environmentId) => <AlloySettings environmentId={environmentId} />}
        </AlloyEnvironmentGate>
      </ScreenScrollView>
    </SettingsScreen>
  );
}

function AlloySettings(props: { readonly environmentId: EnvironmentId }) {
  const query = useAlloySnapshot(props.environmentId);
  return (
    <WithSnapshot query={query}>
      {(snapshot) => <AlloySettingsRows environmentId={props.environmentId} snapshot={snapshot} />}
    </WithSnapshot>
  );
}

function AlloySettingsRows(props: {
  readonly environmentId: EnvironmentId;
  readonly snapshot: AlloySnapshot;
}) {
  const { environmentId, snapshot } = props;
  const navigation = useNavigation();
  const nowMs = useNowMinuteMs();
  const newCompany = useNewCompanyPrompt(environmentId);
  const leaders = scoreboardLeaders(snapshot.scores);
  const activeLessons = snapshot.lessons.filter((lesson) => lesson.active).length;
  return (
    <>
      <ListSection>
        <ListRow
          icon="person.crop.circle"
          label="Accounts"
          description={accountsOverview(snapshot.accounts, nowMs)}
          onPress={() => navigation.navigate("SettingsAlloyAccounts", { environmentId })}
        />
      </ListSection>
      <ListSection
        title="Companies & models"
        footer="Each company ranks the models its agents start on."
      >
        {snapshot.companies.map((company) => (
          <ListRow
            key={company.id}
            label={company.name}
            description={`${company.modelRanking.length} ranked model${
              company.modelRanking.length === 1 ? "" : "s"
            }`}
            onPress={() =>
              navigation.navigate("SettingsAlloyCompany", {
                environmentId,
                companyId: company.id,
              })
            }
          />
        ))}
        <ListActionRow icon="plus" label="New company" onPress={() => newCompany()} />
      </ListSection>
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
          onPress={() => navigation.navigate("SettingsAlloyComps", { environmentId })}
        />
        <ListRow
          icon="brain"
          label="Lessons"
          description={`${activeLessons} active`}
          onPress={() => navigation.navigate("SettingsAlloyLessons", { environmentId })}
        />
      </ListSection>
    </>
  );
}
