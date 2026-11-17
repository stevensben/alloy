import { StackActions, useNavigation } from "@react-navigation/native";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { AlloyGoal } from "@t3tools/contracts/alloy";

/** Opens an agent's conversation, or its details while it has no orchestrator thread yet. */
export function useOpenAgent(environmentId: EnvironmentId) {
  const navigation = useNavigation();
  return (goal: Pick<AlloyGoal, "id" | "orchestrator">) =>
    goal.orchestrator
      ? navigation.navigate("AlloyChat", {
          environmentId,
          threadId: goal.orchestrator.threadId,
          goalId: goal.id,
        })
      : navigation.navigate("AlloyGoal", { environmentId, goalId: goal.id });
}

/** Opens T3's own thread view: the full coding session behind an agent. */
export function useOpenInCode(environmentId: EnvironmentId) {
  const navigation = useNavigation();
  return (threadId: ThreadId) =>
    navigation.dispatch(StackActions.push("Thread", { environmentId, threadId }));
}
