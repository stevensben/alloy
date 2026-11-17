import type { AlloyGoal, AlloySnapshot } from "@t3tools/contracts/alloy";
import * as DateTime from "effect/DateTime";

import { compareTimestamps } from "../../lib/time";
import { currentMilestone, goalMilestones, pendingProposals, roadmapProgress } from "./alloy-model";

/** Alloy posts its own notes into an orchestrator thread under this message id prefix. */
const ALLOY_MESSAGE_PREFIX = "alloy-message:";

export const isAlloyNote = (message: { readonly id: string; readonly role: string }) =>
  message.role === "user" && message.id.startsWith(ALLOY_MESSAGE_PREFIX);

type AgentStatus =
  | { readonly _tag: "needsYou"; readonly count: number }
  | { readonly _tag: "planning" }
  | { readonly _tag: "draft" }
  | { readonly _tag: "progress"; readonly done: number; readonly total: number }
  | { readonly _tag: "running" }
  | { readonly _tag: "paused" }
  | { readonly _tag: "done" };

export function agentStatus(
  goal: AlloyGoal,
  snapshot: Pick<AlloySnapshot, "proposals" | "milestones">,
): AgentStatus {
  const pending = pendingProposals(snapshot.proposals, goal.id).length;
  if (pending > 0) return { _tag: "needsYou", count: pending };
  switch (goal.status) {
    case "done":
      return { _tag: "done" };
    case "paused":
      return { _tag: "paused" };
    case "draft":
      return goal.orchestrator === null ? { _tag: "draft" } : { _tag: "planning" };
    case "running": {
      const roadmap = goalMilestones(snapshot.milestones, goal.id);
      const progress = currentMilestone(roadmap)?.progress ?? roadmapProgress(roadmap);
      return progress.total > 0
        ? { _tag: "progress", done: progress.done, total: progress.total }
        : { _tag: "running" };
    }
  }
}

export function agentStatusLabel(status: AgentStatus): string {
  switch (status._tag) {
    case "needsYou":
      return "Needs you";
    case "planning":
      return "Planning";
    case "draft":
      return "Draft";
    case "progress":
      return `${status.done}/${status.total}`;
    case "running":
      return "Running";
    case "paused":
      return "Paused";
    case "done":
      return "Done";
  }
}

const latest = (timestamps: ReadonlyArray<string | null | undefined>): string | null =>
  timestamps.reduce<string | null>(
    (best, candidate) =>
      candidate == null || (best !== null && compareTimestamps(candidate, best) <= 0)
        ? best
        : candidate,
    null,
  );

export interface AgentRow {
  readonly goal: AlloyGoal;
  readonly status: AgentStatus;
  /** The newest of the thread's activity and the agent's own Alloy events. */
  readonly at: string;
}

/** One row per agent: agents that need Ben first, then the most recently active. */
export function agentRows(
  snapshot: Pick<AlloySnapshot, "goals" | "proposals" | "milestones" | "activity">,
  threadActivityAt: (goal: AlloyGoal) => string | null,
): ReadonlyArray<AgentRow> {
  return snapshot.goals
    .map((goal) => ({
      goal,
      status: agentStatus(goal, snapshot),
      at:
        latest([
          goal.updatedAt,
          threadActivityAt(goal),
          ...snapshot.activity.filter((entry) => entry.goalId === goal.id).map((entry) => entry.at),
          ...snapshot.proposals.flatMap((proposal) =>
            proposal.goalId === goal.id ? [proposal.createdAt, proposal.decidedAt] : [],
          ),
        ]) ?? goal.updatedAt,
    }))
    .sort(
      (left, right) =>
        Number(right.status._tag === "needsYou") - Number(left.status._tag === "needsYou") ||
        compareTimestamps(right.at, left.at),
    );
}

export interface ThreadPreview {
  readonly text: string;
  readonly fromBen: boolean;
  readonly at: string;
}

const MARKDOWN_NOISE = /[`*_~#>]+|\[([^\]]*)\]\([^)]*\)/gu;

/** The newest settled message Ben or the agent wrote, flattened to one line of plain text. */
export function threadPreview(
  messages: ReadonlyArray<{
    readonly id: string;
    readonly role: string;
    readonly text: string;
    readonly streaming: boolean;
    readonly createdAt: DateTime.Utc;
  }>,
): ThreadPreview | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (
      (message.role !== "user" && message.role !== "assistant") ||
      message.streaming ||
      isAlloyNote(message)
    )
      continue;
    const text = message.text
      .replace(MARKDOWN_NOISE, (_match, label: string | undefined) => label ?? "")
      .replace(/\s+/gu, " ")
      .trim();
    if (text) {
      return { text, fromBen: message.role === "user", at: DateTime.formatIso(message.createdAt) };
    }
  }
  return null;
}
