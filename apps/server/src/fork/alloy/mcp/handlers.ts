import { OrchestratorMcpFailure } from "@t3tools/contracts";
import type { AlloyError, AlloyGoalId } from "@t3tools/contracts/alloy";
import * as Effect from "effect/Effect";

import * as McpInvocationContext from "../../../mcp/McpInvocationContext.ts";
import * as McpToolAccess from "../../../mcp/McpToolAccess.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as AlloyService from "../AlloyService.ts";
import type { AlloyStoreError } from "../AlloyStore.ts";
import { AlloyToolkit } from "./tools.ts";

const toMcpFailure = (error: AlloyError | AlloyStoreError) =>
  new OrchestratorMcpFailure({
    code: error._tag === "AlloyError" ? "invalid_request" : "orchestration_error",
    message: error.message,
  });

/** The goal named, else the one the calling thread works for, and who to credit. */
const resolveCaller = Effect.fn("AlloyMcp.resolveCaller")(function* (
  goalId: AlloyGoalId | undefined,
) {
  const scope = yield* McpInvocationContext.McpInvocationContext;
  if (!scope.capabilities.has("orchestration")) {
    return yield* new OrchestratorMcpFailure({
      code: "capability_denied",
      message: "This credential cannot use Alloy tools.",
    });
  }
  const thread = scope.thread;
  if (thread === undefined) {
    return yield* new OrchestratorMcpFailure({
      code: "thread_credential_required",
      message: "Alloy tools act for the calling T3 thread.",
    });
  }
  const alloy = yield* AlloyService.AlloyService;
  const threads = yield* ThreadManagementService.ThreadManagementService;
  const shell = yield* threads
    .getThreadShell(thread.threadId)
    .pipe(Effect.orElseSucceed(() => null));
  const resolved =
    goalId ?? (yield* alloy.goalForThread(thread.threadId).pipe(Effect.mapError(toMcpFailure))).id;
  return { alloy, goalId: resolved, author: shell?.modelSelection.model ?? "agent" };
});

const handlers = {
  alloy_goal_context: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const { alloy, goalId } = yield* resolveCaller(input.goalId);
      const context = yield* alloy.goalContext(goalId).pipe(Effect.mapError(toMcpFailure));
      return { goalId, context };
    }),
  ),
  alloy_define_goal: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const { alloy, goalId, author } = yield* resolveCaller(input.goalId);
      yield* alloy
        .defineGoal({ goalId, author, title: input.title, vision: input.vision })
        .pipe(Effect.mapError(toMcpFailure));
      return { message: "Saved. Now propose a first roadmap with `alloy_propose_roadmap`." };
    }),
  ),
  alloy_propose_vision: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const { alloy, goalId, author } = yield* resolveCaller(input.goalId);
      const proposalId = yield* alloy
        .proposeVision({
          goalId,
          author,
          title: input.title,
          rationale: input.rationale,
          vision: input.vision,
        })
        .pipe(Effect.mapError(toMcpFailure));
      return { proposalId, message: "Proposed. Wait for Ben's decision before acting on it." };
    }),
  ),
  alloy_propose_roadmap: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const { alloy, goalId, author } = yield* resolveCaller(input.goalId);
      const proposalId = yield* alloy
        .proposeRoadmap({
          goalId,
          author,
          title: input.title,
          rationale: input.rationale,
          milestones: input.milestones,
        })
        .pipe(Effect.mapError(toMcpFailure));
      return { proposalId, message: "Proposed. Wait for Ben's decision before acting on it." };
    }),
  ),
  alloy_log_idea: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const { alloy, goalId, author } = yield* resolveCaller(input.goalId);
      const proposalId = yield* alloy
        .logIdea({ goalId, author, title: input.title, rationale: input.rationale })
        .pipe(Effect.mapError(toMcpFailure));
      return { proposalId, message: "Logged for Ben." };
    }),
  ),
  alloy_report_progress: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const { alloy, goalId, author } = yield* resolveCaller(input.goalId);
      const message = yield* alloy
        .reportProgress({
          goalId,
          author,
          milestoneId: input.milestoneId,
          done: input.done,
          total: input.total,
          status: input.status,
          note: input.note,
        })
        .pipe(Effect.mapError(toMcpFailure));
      return { message };
    }),
  ),
  alloy_record_lesson: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const { alloy, goalId, author } = yield* resolveCaller(input.goalId);
      const lessonId = yield* alloy
        .recordLesson({ goalId, author, text: input.text, scope: input.scope ?? "goal" })
        .pipe(Effect.mapError(toMcpFailure));
      return { lessonId, message: "Recorded." };
    }),
  ),
} satisfies McpToolAccess.Handlers<typeof AlloyToolkit.tools>;

export const layer = McpToolAccess.toLayer(AlloyToolkit, handlers);
