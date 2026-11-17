import { useNavigation } from "@react-navigation/native";
import type { EnvironmentId } from "@t3tools/contracts";
import type { AlloySnapshot } from "@t3tools/contracts/alloy";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppActivityIndicator } from "../../components/ui/AppActivityIndicator";
import { AppBar } from "../../components/ui/AppBar";
import type { AppBarAction, AppBarConfirm } from "../../components/ui/AppBar.types";
import { AppText as Text } from "../../components/ui/AppText";
import { EmptyState } from "../../components/ui/EmptyState";
import { ListActionRow } from "../../components/ui/ListActionRow";
import { groupedListInsets } from "../../components/ui/listMetrics";
import { Progress } from "../../components/ui/Progress";
import { ScreenContent } from "../../components/ui/ScreenContent";
import { ScreenScrollView } from "../../components/ui/ScreenScrollView";
import { SheetPane } from "../../components/ui/SheetPane";
import { openSettings } from "../../features/settings/settings-navigation";
import { cn } from "../../lib/cn";
import type { EnvironmentQueryView } from "../../state/query";
import { progressFraction } from "./alloy-model";
import { useAlloyEnvironment } from "./alloy-state";

function ScrollBody(props: { readonly children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <ScreenScrollView
      alwaysBounceVertical
      keyboardShouldPersistTaps="handled"
      className="flex-1"
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        ...groupedListInsets(false),
        paddingTop: 8,
        paddingBottom: Math.max(insets.bottom, 18) + 18,
      }}
    >
      {props.children}
    </ScreenScrollView>
  );
}

export function AlloyPage(props: {
  readonly title: string;
  readonly subtitle?: string;
  readonly actions?: ReadonlyArray<AppBarAction>;
  readonly children: ReactNode;
}) {
  const navigation = useNavigation();
  return (
    <SheetPane surface="screen">
      <AppBar
        title={props.title}
        subtitle={props.subtitle}
        actions={props.actions}
        onBack={() => navigation.goBack()}
      />
      <ScreenContent surface="screen">
        <ScrollBody>{props.children}</ScrollBody>
      </ScreenContent>
    </SheetPane>
  );
}

export function AlloySheet(props: {
  readonly title: string;
  readonly confirm: AppBarConfirm;
  readonly children: ReactNode;
}) {
  const navigation = useNavigation();
  return (
    <SheetPane>
      <AppBar
        title={props.title}
        onClose={() => navigation.goBack()}
        confirm={props.confirm}
        hideBottomBorder
      />
      <ScreenContent>
        <ScrollBody>{props.children}</ScrollBody>
      </ScreenContent>
    </SheetPane>
  );
}

function Spinner() {
  return (
    <View className="items-center py-10">
      <AppActivityIndicator colorClassName="accent-icon" />
    </View>
  );
}

/** Renders once a connected environment answers as Alloy, else a spinner or how to connect one. */
export function AlloyEnvironmentGate(props: {
  readonly children: (environmentId: EnvironmentId) => ReactNode;
}) {
  const navigation = useNavigation();
  const choice = useAlloyEnvironment();
  if (choice._tag === "found") return props.children(choice.environmentId);
  if (choice._tag === "probing") return <Spinner />;
  return (
    <EmptyState
      variant="plain"
      title="Connect this app to your Alloy server"
      detail="Agents live on the Mac running Alloy. None of the environments this phone is connected to answers as Alloy, so add that one in Environments."
      actionLabel="Open Environments"
      onAction={() => openSettings(navigation, "SettingsEnvironments")}
    />
  );
}

/** Renders the snapshot once loaded, else a spinner or the error. */
export function WithSnapshot(props: {
  readonly query: EnvironmentQueryView<AlloySnapshot>;
  readonly children: (snapshot: AlloySnapshot) => ReactNode;
}) {
  if (props.query.data) return props.children(props.query.data);
  if (props.query.error) {
    return (
      <EmptyState
        variant="plain"
        title="Alloy isn't answering"
        detail={props.query.error}
        actionLabel="Try again"
        onAction={props.query.refresh}
      />
    );
  }
  return <Spinner />;
}

export function NotFound(props: { readonly what: string }) {
  return (
    <EmptyState
      variant="plain"
      title={`This ${props.what} is gone`}
      detail="It may have been removed on the server."
    />
  );
}

export function ProgressLine(props: {
  readonly done: number;
  readonly total: number;
  readonly label: string;
}) {
  return (
    <View className="gap-1.5">
      <Progress
        value={progressFraction(props)}
        label={`${props.done} of ${props.total} ${props.label}`}
      />
      <Text textRole="footnote" className="text-foreground-muted">
        {`${props.done}/${props.total} ${props.label}`}
      </Text>
    </View>
  );
}

export function Muted(props: { readonly children: string; readonly className?: string }) {
  return (
    <Text textRole="footnote" className={cn("text-foreground-muted", props.className)}>
      {props.children}
    </Text>
  );
}

/** Opens T3's own Add project flow, for when the Alloy server has no projects yet. */
export function AddProjectRow(props: { readonly environmentId: EnvironmentId }) {
  const navigation = useNavigation();
  return (
    <ListActionRow
      icon="plus"
      label="Add a project…"
      onPress={() => navigation.navigate("AddProject", { environmentId: props.environmentId })}
    />
  );
}
