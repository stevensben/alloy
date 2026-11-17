import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import type { EnvironmentId } from "@t3tools/contracts";

import { ListRow } from "../../components/ui/ListRow";
import { ListRowLayout } from "../../components/ui/ListRowLayout";
import { ListSection } from "../../components/ui/ListSection";
import { AlloyPage, WithSnapshot } from "./AlloyLayout";
import { accountUsageSummary } from "./alloy-model";
import { useAlloySnapshot } from "./alloy-state";
import { useNowMinuteMs } from "../../lib/clock";

export function AlloyAccountsScreen({
  route,
}: StaticScreenProps<{ readonly environmentId: EnvironmentId }>) {
  const { environmentId } = route.params;
  const query = useAlloySnapshot(environmentId);
  const navigation = useNavigation();
  const nowMs = useNowMinuteMs();
  return (
    <AlloyPage title="Accounts">
      <WithSnapshot query={query}>
        {(snapshot) => {
          const ready = snapshot.accounts.filter((account) => account.available);
          const notSetUp = snapshot.accounts.filter((account) => !account.available);
          return (
            <>
              <ListSection title="Ready">
                {ready.length === 0 ? (
                  <ListRowLayout icon="person.crop.circle" label="No accounts ready" disabled />
                ) : (
                  ready.map((account) => (
                    <ListRowLayout
                      key={account.instanceId}
                      icon="person.crop.circle"
                      label={account.label}
                      description={accountUsageSummary(account, nowMs)}
                    />
                  ))
                )}
              </ListSection>
              {notSetUp.length > 0 ? (
                <ListSection
                  title="Not set up"
                  footer="Alloy keeps its own logins, separate from the T3 app. Sign in on the Alloy server to use these."
                >
                  {notSetUp.map((account) => (
                    <ListRowLayout
                      key={account.instanceId}
                      icon="person.crop.circle"
                      label={account.label}
                      disabled
                    />
                  ))}
                  <ListRow
                    icon="gearshape"
                    label="Set up accounts"
                    onPress={() => navigation.navigate("SettingsProviderAccounts")}
                  />
                </ListSection>
              ) : null}
            </>
          );
        }}
      </WithSnapshot>
    </AlloyPage>
  );
}
