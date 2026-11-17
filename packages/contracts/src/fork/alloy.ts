import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";

import { EnvironmentAuthorizationError } from "../auth.ts";
import { IsoDateTime, ProjectId, ThreadId, TrimmedNonEmptyString } from "../baseSchemas.ts";
import { ProviderInstanceId } from "../providerInstance.ts";

export const AlloyCompanyId = Schema.String.pipe(Schema.brand("AlloyCompanyId"));
export type AlloyCompanyId = typeof AlloyCompanyId.Type;
export const AlloyGoalId = Schema.String.pipe(Schema.brand("AlloyGoalId"));
export type AlloyGoalId = typeof AlloyGoalId.Type;
export const AlloyMilestoneId = Schema.String.pipe(Schema.brand("AlloyMilestoneId"));
export type AlloyMilestoneId = typeof AlloyMilestoneId.Type;
export const AlloyProposalId = Schema.String.pipe(Schema.brand("AlloyProposalId"));
export type AlloyProposalId = typeof AlloyProposalId.Type;
export const AlloyLessonId = Schema.String.pipe(Schema.brand("AlloyLessonId"));
export type AlloyLessonId = typeof AlloyLessonId.Type;
export const AlloyCompId = Schema.String.pipe(Schema.brand("AlloyCompId"));
export type AlloyCompId = typeof AlloyCompId.Type;
export const AlloyCompEntryId = Schema.String.pipe(Schema.brand("AlloyCompEntryId"));
export type AlloyCompEntryId = typeof AlloyCompEntryId.Type;

/** One model on one connected account (a T3 provider instance). */
export const AlloyModelChoice = Schema.Struct({
  instanceId: ProviderInstanceId,
  model: TrimmedNonEmptyString,
});
export type AlloyModelChoice = typeof AlloyModelChoice.Type;

export const AlloyCompany = Schema.Struct({
  id: AlloyCompanyId,
  name: TrimmedNonEmptyString,
  /** Best first. Routing takes the first model with headroom on some account. */
  modelRanking: Schema.Array(AlloyModelChoice),
  createdAt: IsoDateTime,
});
export type AlloyCompany = typeof AlloyCompany.Type;

export const AlloyGoalStatus = Schema.Literals(["draft", "running", "paused", "done"]);
export type AlloyGoalStatus = typeof AlloyGoalStatus.Type;

export const AlloyOrchestrator = Schema.Struct({
  threadId: ThreadId,
  model: AlloyModelChoice,
  /** Why routing picked this model, shown to the user. */
  routingNote: Schema.String,
  startedAt: IsoDateTime,
});
export type AlloyOrchestrator = typeof AlloyOrchestrator.Type;

export const AlloyGoal = Schema.Struct({
  id: AlloyGoalId,
  companyId: AlloyCompanyId,
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  vision: Schema.String,
  status: AlloyGoalStatus,
  orchestrator: Schema.NullOr(AlloyOrchestrator),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type AlloyGoal = typeof AlloyGoal.Type;

export const AlloyProgress = Schema.Struct({ done: Schema.Int, total: Schema.Int });
export type AlloyProgress = typeof AlloyProgress.Type;

export const AlloyMilestoneStatus = Schema.Literals(["upcoming", "current", "done"]);
export type AlloyMilestoneStatus = typeof AlloyMilestoneStatus.Type;

export const AlloyMilestone = Schema.Struct({
  id: AlloyMilestoneId,
  goalId: AlloyGoalId,
  position: Schema.Int,
  title: TrimmedNonEmptyString,
  /** The check that proves the milestone is done, e.g. "all 50 scripts pass their tests". */
  doneWhen: Schema.String,
  status: AlloyMilestoneStatus,
  progress: Schema.NullOr(AlloyProgress),
  note: Schema.NullOr(Schema.String),
});
export type AlloyMilestone = typeof AlloyMilestone.Type;

export const AlloyRoadmapItem = Schema.Struct({
  title: TrimmedNonEmptyString,
  doneWhen: Schema.String,
});
export type AlloyRoadmapItem = typeof AlloyRoadmapItem.Type;

export const AlloyProposalStatus = Schema.Literals(["pending", "approved", "rejected", "noted"]);
export type AlloyProposalStatus = typeof AlloyProposalStatus.Type;

export const AlloyProposalBody = Schema.Union([
  /** Replaces the whole roadmap on approval. Milestones with the same title keep their progress. */
  Schema.TaggedStruct("roadmap", { milestones: Schema.Array(AlloyRoadmapItem) }),
  /** An observation or improvement that is not a roadmap change. */
  Schema.TaggedStruct("idea", {}),
]);
export type AlloyProposalBody = typeof AlloyProposalBody.Type;

export const AlloyProposal = Schema.Struct({
  id: AlloyProposalId,
  goalId: AlloyGoalId,
  title: TrimmedNonEmptyString,
  rationale: Schema.String,
  body: AlloyProposalBody,
  status: AlloyProposalStatus,
  decisionNote: Schema.NullOr(Schema.String),
  author: Schema.String,
  createdAt: IsoDateTime,
  decidedAt: Schema.NullOr(IsoDateTime),
});
export type AlloyProposal = typeof AlloyProposal.Type;

export const AlloyLessonScope = Schema.Union([
  Schema.TaggedStruct("global", {}),
  Schema.TaggedStruct("company", { companyId: AlloyCompanyId }),
  Schema.TaggedStruct("goal", { goalId: AlloyGoalId }),
]);
export type AlloyLessonScope = typeof AlloyLessonScope.Type;

export const AlloyLesson = Schema.Struct({
  id: AlloyLessonId,
  scope: AlloyLessonScope,
  text: TrimmedNonEmptyString,
  /** Where it came from, e.g. "Rejected proposal: Split the export step". */
  source: Schema.String,
  author: Schema.String,
  active: Schema.Boolean,
  createdAt: IsoDateTime,
});
export type AlloyLesson = typeof AlloyLesson.Type;

export const AlloyActivity = Schema.Struct({
  id: Schema.String,
  goalId: AlloyGoalId,
  at: IsoDateTime,
  author: Schema.String,
  text: Schema.String,
});
export type AlloyActivity = typeof AlloyActivity.Type;

export const AlloyCompEntryStatus = Schema.Literals(["running", "finished", "failed"]);
export type AlloyCompEntryStatus = typeof AlloyCompEntryStatus.Type;

export const AlloyCompEntry = Schema.Struct({
  id: AlloyCompEntryId,
  model: AlloyModelChoice,
  threadId: Schema.NullOr(ThreadId),
  status: AlloyCompEntryStatus,
  startedAt: IsoDateTime,
  durationMs: Schema.NullOr(Schema.Int),
  kept: Schema.NullOr(Schema.Boolean),
  error: Schema.NullOr(Schema.String),
});
export type AlloyCompEntry = typeof AlloyCompEntry.Type;

/** The same task run on several models side by side, to learn which one to use for that kind of work. */
export const AlloyComp = Schema.Struct({
  id: AlloyCompId,
  companyId: Schema.NullOr(AlloyCompanyId),
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  /** Groups comps for the scoreboard, e.g. "script writing". */
  taskType: TrimmedNonEmptyString,
  prompt: Schema.String,
  createdAt: IsoDateTime,
  entries: Schema.Array(AlloyCompEntry),
});
export type AlloyComp = typeof AlloyComp.Type;

export const AlloyScore = Schema.Struct({
  taskType: Schema.String,
  model: AlloyModelChoice,
  runs: Schema.Int,
  decided: Schema.Int,
  kept: Schema.Int,
  avgDurationMs: Schema.NullOr(Schema.Int),
});
export type AlloyScore = typeof AlloyScore.Type;

export const AlloyUsageWindow = Schema.Struct({
  label: Schema.String,
  usedPercent: Schema.Number,
  resetsAt: Schema.NullOr(IsoDateTime),
});
export type AlloyUsageWindow = typeof AlloyUsageWindow.Type;

export const AlloyAccount = Schema.Struct({
  instanceId: ProviderInstanceId,
  label: Schema.String,
  driver: Schema.String,
  available: Schema.Boolean,
  models: Schema.Array(Schema.Struct({ slug: Schema.String, name: Schema.String })),
  usage: Schema.Array(AlloyUsageWindow),
});
export type AlloyAccount = typeof AlloyAccount.Type;

export const AlloySnapshot = Schema.Struct({
  companies: Schema.Array(AlloyCompany),
  goals: Schema.Array(AlloyGoal),
  milestones: Schema.Array(AlloyMilestone),
  proposals: Schema.Array(AlloyProposal),
  lessons: Schema.Array(AlloyLesson),
  activity: Schema.Array(AlloyActivity),
  comps: Schema.Array(AlloyComp),
  scores: Schema.Array(AlloyScore),
  accounts: Schema.Array(AlloyAccount),
});
export type AlloySnapshot = typeof AlloySnapshot.Type;

export const AlloyCommand = Schema.Union([
  Schema.TaggedStruct("createCompany", { name: TrimmedNonEmptyString }),
  Schema.TaggedStruct("setCompanyRanking", {
    companyId: AlloyCompanyId,
    modelRanking: Schema.Array(AlloyModelChoice),
  }),
  Schema.TaggedStruct("createGoal", {
    companyId: AlloyCompanyId,
    projectId: ProjectId,
    title: TrimmedNonEmptyString,
    vision: Schema.String,
  }),
  Schema.TaggedStruct("updateGoal", {
    goalId: AlloyGoalId,
    title: TrimmedNonEmptyString,
    vision: Schema.String,
  }),
  /** `model: null` lets routing pick from the company's ranking. */
  Schema.TaggedStruct("startGoal", {
    goalId: AlloyGoalId,
    model: Schema.NullOr(AlloyModelChoice),
  }),
  Schema.TaggedStruct("setGoalStatus", {
    goalId: AlloyGoalId,
    status: Schema.Literals(["running", "paused", "done"]),
  }),
  Schema.TaggedStruct("messageOrchestrator", {
    goalId: AlloyGoalId,
    text: TrimmedNonEmptyString,
  }),
  Schema.TaggedStruct("decideProposal", {
    proposalId: AlloyProposalId,
    decision: Schema.Literals(["approved", "rejected", "noted"]),
    note: Schema.NullOr(Schema.String),
  }),
  Schema.TaggedStruct("addLesson", { scope: AlloyLessonScope, text: TrimmedNonEmptyString }),
  Schema.TaggedStruct("setLessonActive", { lessonId: AlloyLessonId, active: Schema.Boolean }),
  Schema.TaggedStruct("deleteLesson", { lessonId: AlloyLessonId }),
  Schema.TaggedStruct("startComp", {
    companyId: Schema.NullOr(AlloyCompanyId),
    projectId: ProjectId,
    title: TrimmedNonEmptyString,
    taskType: TrimmedNonEmptyString,
    prompt: TrimmedNonEmptyString,
    models: Schema.Array(AlloyModelChoice),
  }),
  Schema.TaggedStruct("keepCompEntry", { compId: AlloyCompId, entryId: AlloyCompEntryId }),
]);
export type AlloyCommand = typeof AlloyCommand.Type;

export const AlloyCommandResult = Schema.Struct({ id: Schema.NullOr(Schema.String) });
export type AlloyCommandResult = typeof AlloyCommandResult.Type;

export class AlloyError extends Schema.TaggedError<AlloyError>()("AlloyError", {
  message: Schema.String,
}) {}

export const ALLOY_WS_METHODS = {
  alloySnapshot: "alloy.snapshot",
  alloyCommand: "alloy.command",
} as const;

const WsAlloySnapshotRpc = Rpc.make(ALLOY_WS_METHODS.alloySnapshot, {
  payload: Schema.Struct({}),
  success: AlloySnapshot,
  error: Schema.Union([AlloyError, EnvironmentAuthorizationError]),
});

const WsAlloyCommandRpc = Rpc.make(ALLOY_WS_METHODS.alloyCommand, {
  payload: AlloyCommand,
  success: AlloyCommandResult,
  error: Schema.Union([AlloyError, EnvironmentAuthorizationError]),
});

export const ALLOY_RPCS = [WsAlloySnapshotRpc, WsAlloyCommandRpc] as const;
