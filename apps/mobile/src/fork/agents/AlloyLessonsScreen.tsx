import type { StaticScreenProps } from "@react-navigation/native";
import type { EnvironmentId } from "@t3tools/contracts";
import type { AlloyLesson, AlloySnapshot } from "@t3tools/contracts/alloy";
import { View } from "react-native";

import { ControlPill } from "../../components/ui/ControlPill";
import * as Dialog from "../../components/ui/Dialog";
import { EmptyState } from "../../components/ui/EmptyState";
import { ListRowLayout } from "../../components/ui/ListRowLayout";
import { ListSection } from "../../components/ui/ListSection";
import { ThemedSwitch } from "../../components/ui/ThemedSwitch";
import { AlloyPage, WithSnapshot } from "./AlloyLayout";
import { lessonScopeLabel } from "./alloy-model";
import { useAlloyCommand, useAlloySnapshot } from "./alloy-state";

export function AlloyLessonsScreen({
  route,
}: StaticScreenProps<{ readonly environmentId: EnvironmentId }>) {
  const { environmentId } = route.params;
  const query = useAlloySnapshot(environmentId);
  const run = useAlloyCommand(environmentId);
  const addGlobal = () =>
    Dialog.prompt({
      title: "Add lesson",
      message: "Every orchestrator and worker reads it before acting.",
      placeholder: "Never push to main",
      initialValue: "",
      confirmText: "Add",
      onConfirm: (text) => {
        if (text.trim())
          void run({ _tag: "addLesson", scope: { _tag: "global" }, text: text.trim() });
      },
    });
  return (
    <AlloyPage
      title="Lessons"
      actions={[{ accessibilityLabel: "Add lesson", icon: "plus", onPress: addGlobal }]}
    >
      <WithSnapshot query={query}>
        {(snapshot) =>
          snapshot.lessons.length === 0 ? (
            <EmptyState
              title="No lessons yet"
              detail="Lessons are standing instructions for agents. Rejecting a proposal with a reason adds one."
              actionLabel="Add lesson"
              onAction={addGlobal}
            />
          ) : (
            <ListSection>
              {[...snapshot.lessons]
                .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
                .map((lesson) => (
                  <LessonRow
                    key={lesson.id}
                    lesson={lesson}
                    snapshot={snapshot}
                    onActive={(active) =>
                      void run({ _tag: "setLessonActive", lessonId: lesson.id, active })
                    }
                    onDelete={() =>
                      Dialog.confirm({
                        title: "Delete lesson?",
                        message: lesson.text,
                        confirmText: "Delete",
                        destructive: true,
                        onConfirm: () => void run({ _tag: "deleteLesson", lessonId: lesson.id }),
                      })
                    }
                  />
                ))}
            </ListSection>
          )
        }
      </WithSnapshot>
    </AlloyPage>
  );
}

function LessonRow(props: {
  readonly lesson: AlloyLesson;
  readonly snapshot: AlloySnapshot;
  readonly onActive: (active: boolean) => void;
  readonly onDelete: () => void;
}) {
  const { lesson } = props;
  return (
    <ListRowLayout
      label={lesson.text}
      description={[lessonScopeLabel(lesson, props.snapshot), lesson.source]
        .filter(Boolean)
        .join(" · ")}
      accessory={
        <View className="flex-row items-center gap-2">
          <ThemedSwitch
            accessibilityLabel={`${lesson.text} active`}
            value={lesson.active}
            onValueChange={props.onActive}
          />
          <ControlPill
            icon="trash"
            variant="danger"
            accessibilityLabel="Delete lesson"
            onPress={props.onDelete}
          />
        </View>
      }
    />
  );
}
