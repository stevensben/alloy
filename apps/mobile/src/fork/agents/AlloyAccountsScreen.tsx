import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import type { EnvironmentId } from "@t3tools/contracts";

import { ListActionRow } from "../../components/ui/ListActionRow";
import { ListRowLayout } from "../../components/ui/ListRowLayout";
import { ListSection } from "../../components/ui/ListSection";
import { useNowMinuteMs } from "../../lib/clock";
import { AlloyPage, WithSnapshot } from "./AlloyLayout";
import { accountUsageSummary } from "./alloy-model";
import { useAlloySnapshot } from "./alloy-state";

export function AlloyAccountsScreen({
  route,
}: StaticScreenProps<{ readonly environmentId: EnvironmentId }>) {
  const query = useAlloySnapshot(route.params.environmentId);
  const navigation = useNavigation();
  const nowMs = useNowMinuteMs();
  return (
    <AlloyPage title="Accounts">
      <WithSnapshot query={query}>
        {(snapshot) => (
          <ListSection>
            {snapshot.accounts
              .filter((account) => account.available)
              .map((account) => (
                <ListRowLayout
                  key={account.instanceId}
                  icon="person.crop.circle"
                  label={account.label}
                  description={accountUsageSummary(account, nowMs)}
                />
              ))}
            <ListActionRow
              icon="plus"
              label="Add account"
              onPress={() => navigation.navigate("SettingsProviderAccounts")}
            />
          </ListSection>
        )}
      </WithSnapshot>
    </AlloyPage>
  );
}
