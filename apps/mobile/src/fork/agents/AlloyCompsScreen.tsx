import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import type { EnvironmentId } from "@t3tools/contracts";
import type { AlloySnapshot } from "@t3tools/contracts/alloy";

import { EmptyState } from "../../components/ui/EmptyState";
import { ListRow } from "../../components/ui/ListRow";
import { ListRowLayout } from "../../components/ui/ListRowLayout";
import { ListSection } from "../../components/ui/ListSection";
import { useNowMinuteMs } from "../../lib/clock";
import { relativeTime } from "../../lib/time";
import { AlloyPage, WithSnapshot } from "./AlloyLayout";
import {
  compStatusSummary,
  modelChoiceKey,
  modelLabel,
  newestComps,
  scoreboard,
  scoreSummary,
} from "./alloy-model";
import { useAlloySnapshot } from "./alloy-state";

export function AlloyCompsScreen({
  route,
}: StaticScreenProps<{ readonly environmentId: EnvironmentId }>) {
  const { environmentId } = route.params;
  const navigation = useNavigation();
  const query = useAlloySnapshot(environmentId);
  const newComp = () => navigation.navigate("AlloyNewComp", { environmentId });
  return (
    <AlloyPage
      title="Comps"
      actions={[{ accessibilityLabel: "New comp", icon: "plus", onPress: newComp }]}
    >
      <WithSnapshot query={query}>
        {(snapshot) => (
          <CompsBody environmentId={environmentId} snapshot={snapshot} onNewComp={newComp} />
        )}
      </WithSnapshot>
    </AlloyPage>
  );
}

function CompsBody(props: {
  readonly environmentId: EnvironmentId;
  readonly snapshot: AlloySnapshot;
  readonly onNewComp: () => void;
}) {
  const { snapshot } = props;
  const navigation = useNavigation();
  const nowMs = useNowMinuteMs();
  if (snapshot.comps.length === 0) {
    return (
      <EmptyState
        title="No comps yet"
        detail="A comp runs one prompt on several models side by side. Keep the best answer and the scoreboard learns which model to use for that kind of task."
        actionLabel="New comp"
        onAction={props.onNewComp}
      />
    );
  }
  return (
    <>
      {scoreboard(snapshot.scores).map((group) => (
        <ListSection key={group.taskType} title={`Scoreboard · ${group.taskType}`}>
          {group.rows.map((score) => (
            <ListRowLayout
              key={modelChoiceKey(score.model)}
              label={modelLabel(snapshot.accounts, score.model)}
              description={scoreSummary(score)}
            />
          ))}
        </ListSection>
      ))}
      <ListSection title="Comps">
        {newestComps(snapshot.comps).map((comp) => (
          <ListRow
            key={comp.id}
            label={comp.title}
            description={`${comp.taskType} · ${compStatusSummary(comp)}`}
            detail={relativeTime(comp.createdAt, nowMs)}
            onPress={() =>
              navigation.navigate("SettingsAlloyComp", {
                environmentId: props.environmentId,
                compId: comp.id,
              })
            }
          />
        ))}
      </ListSection>
    </>
  );
}
