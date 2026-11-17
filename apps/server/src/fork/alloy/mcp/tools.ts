import { OrchestratorMcpFailure } from "@t3tools/contracts";
import {
  AlloyGoalId,
  AlloyLessonId,
  AlloyMilestoneId,
  AlloyProposalId,
  AlloyRoadmapItem,
} from "@t3tools/contracts/alloy";
import * as Schema from "effect/Schema";
import { McpSchema, Tool, Toolkit } from "effect/ai";

import * as McpInvocationContext from "../../../mcp/McpInvocationContext.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as AlloyService from "../AlloyService.ts";

const goalId = Schema.optionalKey(
  AlloyGoalId.annotate({ description: "Defaults to the goal this thread orchestrates." }),
);

const shared = {
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    AlloyService.AlloyService,
  ],
};

const Done = Schema.Struct({ message: Schema.String });

const GoalContextTool = Tool.make("alloy_goal_context", {
  ...shared,
  description:
    "Read your Alloy goal: vision, roadmap with milestone ids, lessons, recent decisions and rules. Call at the start of every turn.",
  parameters: Schema.Struct({ goalId }),
  success: Schema.Struct({ goalId: AlloyGoalId, context: Schema.String }),
})
  .annotate(Tool.Title, "Read the Alloy goal")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenFromOutsideClients);

const ProposeRoadmapTool = Tool.make("alloy_propose_roadmap", {
  ...shared,
  description:
    "Propose a new roadmap for Ben to approve. `milestones` is the full ordered list and replaces the current one on approval; milestones with the same title keep their progress.",
  parameters: Schema.Struct({
    goalId,
    title: Schema.String.annotate({ description: "What changes, in a few words." }),
    rationale: Schema.String.annotate({ description: "Why, judged against the vision." }),
    milestones: Schema.Array(AlloyRoadmapItem).annotate({
      description: "`doneWhen`: the check that proves the milestone is done.",
    }),
  }),
  success: Schema.Struct({ proposalId: AlloyProposalId, message: Schema.String }),
})
  .annotate(Tool.Title, "Propose an Alloy roadmap")
  .annotate(Tool.Destructive, false)
  .annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenFromOutsideClients);

const LogIdeaTool = Tool.make("alloy_log_idea", {
  ...shared,
  description:
    "Log an idea that would improve the vision or the approach, for Ben to review. Not for roadmap changes.",
  parameters: Schema.Struct({ goalId, title: Schema.String, rationale: Schema.String }),
  success: Schema.Struct({ proposalId: AlloyProposalId, message: Schema.String }),
})
  .annotate(Tool.Title, "Log an Alloy idea")
  .annotate(Tool.Destructive, false)
  .annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenFromOutsideClients);

const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

const ReportProgressTool = Tool.make("alloy_report_progress", {
  ...shared,
  description:
    "Report measured progress on a milestone: counts from checks you ran, never estimates. `status: done` moves current to the next milestone.",
  parameters: Schema.Struct({
    goalId,
    milestoneId: AlloyMilestoneId,
    done: Schema.optionalKey(Count),
    total: Schema.optionalKey(Count),
    status: Schema.optionalKey(Schema.Literals(["current", "done"])),
    note: Schema.optionalKey(Schema.String),
  }),
  success: Done,
})
  .annotate(Tool.Title, "Report Alloy progress")
  .annotate(Tool.Destructive, false)
  .annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenFromOutsideClients);

const RecordLessonTool = Tool.make("alloy_record_lesson", {
  ...shared,
  description:
    "Record a durable lesson that future agent briefs include. `scope` defaults to this goal.",
  parameters: Schema.Struct({
    goalId,
    text: Schema.String,
    scope: Schema.optionalKey(Schema.Literals(["goal", "company", "global"])),
  }),
  success: Schema.Struct({ lessonId: AlloyLessonId, message: Schema.String }),
})
  .annotate(Tool.Title, "Record an Alloy lesson")
  .annotate(Tool.Destructive, false)
  .annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenFromOutsideClients);

export const AlloyToolkit = Toolkit.make(
  GoalContextTool,
  ProposeRoadmapTool,
  LogIdeaTool,
  ReportProgressTool,
  RecordLessonTool,
);
