import { AlloyGoalId, AlloyProposalId, type AlloyProposal } from "@t3tools/contracts/alloy";
import { MessageId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildChatTimeline, type ChatFeedRow } from "./alloy-chat";

const GOAL = AlloyGoalId.make("goal");

function message(
  id: string,
  at: string,
  role: "user" | "assistant",
  text: string,
  streaming = false,
): ChatFeedRow {
  return {
    type: "message",
    id,
    createdAt: `2026-11-17T${at}:00Z`,
    message: { id: MessageId.make(id), role, text, streaming },
  };
}

function runFold(runId: string, at: string, workingSince?: string): ChatFeedRow {
  return {
    type: "run-fold",
    id: `fold:${runId}`,
    createdAt: `2026-11-17T${at}:00Z`,
    runId,
    label: "Worked for 2m 14s",
    ...(workingSince ? { workingSince } : {}),
  };
}

function tools(runId: string, count: number, extraNonTool = 0): ChatFeedRow {
  return {
    type: "activity-group",
    id: `group:${runId}:${count}`,
    createdAt: "2026-11-17T10:00:00Z",
    runId,
    activities: [
      ...Array.from({ length: count }, () => ({ toolLike: true })),
      ...Array.from({ length: extraNonTool }, () => ({ toolLike: false })),
    ],
  };
}

function proposal(
  status: AlloyProposal["status"],
  createdAt: string,
  decidedAt: string | null = null,
): AlloyProposal {
  return {
    id: AlloyProposalId.make(`p-${status}`),
    goalId: GOAL,
    title: "Ship in three milestones",
    rationale: "",
    body: { _tag: "roadmap", milestones: [] },
    status,
    decisionNote: null,
    author: "Agent",
    createdAt: `2026-11-17T${createdAt}:00Z`,
    decidedAt: decidedAt === null ? null : `2026-11-17T${decidedAt}:00Z`,
  };
}

const timeline = (input: Partial<Parameters<typeof buildChatTimeline>[0]>) =>
  buildChatTimeline({
    goalId: GOAL,
    presented: [],
    feed: [],
    proposals: [],
    activity: [],
    working: false,
    ...input,
  });

const shape = (rows: ReturnType<typeof buildChatTimeline>) =>
  rows.map((row) => {
    switch (row.kind) {
      case "bubble":
        return `${row.fromBen ? "ben" : "agent"}${row.first ? "[" : ""}${row.last ? "]" : ""}:${row.text}`;
      case "run":
      case "note":
        return `${row.kind}:${"label" in row ? row.label : row.text}`;
      case "proposal":
        return `proposal:${row.proposal.status}`;
      case "time":
        return `time:${row.at.slice(11, 16)}`;
      case "typing":
        return "typing";
    }
  });

describe("buildChatTimeline", () => {
  it("shows prose as grouped bubbles and folds each finished run to one line", () => {
    const presented = [
      message("m1", "10:00", "user", "Plan the export"),
      message("m2", "10:01", "user", "Keep it small"),
      runFold("run-1", "10:02"),
      message("m3", "10:04", "assistant", "Here is the plan"),
      message("m4", "10:04", "assistant", "Shall I start?"),
      message("alloy-message:x", "10:05", "user", "Ben approved the roadmap."),
      message("m5", "10:06", "assistant", ""),
    ];
    const feed = [...presented, tools("run-1", 17, 3), tools("run-1", 1)];
    expect(shape(timeline({ presented, feed }))).toEqual([
      "time:10:00",
      "ben[:Plan the export",
      "ben]:Keep it small",
      "run:Worked for 2m 14s · 18 steps",
      "agent[:Here is the plan",
      "agent]:Shall I start?",
    ]);
  });

  it("starts a new group and repeats the time after a long gap", () => {
    const presented = [
      message("m1", "10:00", "user", "One"),
      message("m2", "10:07", "user", "Two"),
      message("m3", "10:30", "user", "Three"),
    ];
    expect(shape(timeline({ presented }))).toEqual([
      "time:10:00",
      "ben[]:One",
      "ben[]:Two",
      "time:10:30",
      "ben[]:Three",
    ]);
  });

  it("places proposals and activity by time, without lines that echo a proposal", () => {
    const presented = [
      message("m1", "10:00", "user", "Plan it"),
      message("m2", "10:10", "assistant", "Proposed a roadmap"),
    ];
    const activity = [
      {
        id: "a1",
        goalId: GOAL,
        at: "2026-11-17T10:05:00Z",
        author: "Agent",
        text: 'Proposed a roadmap: "Ship in three milestones"',
      },
      {
        id: "a2",
        goalId: GOAL,
        at: "2026-11-17T10:08:00Z",
        author: "Agent",
        text: "Milestone 2 done · 37/50",
      },
      {
        id: "a3",
        goalId: AlloyGoalId.make("other"),
        at: "2026-11-17T10:08:00Z",
        author: "Agent",
        text: "Someone else's work",
      },
    ];
    expect(
      shape(timeline({ presented, activity, proposals: [proposal("pending", "10:05")] })),
    ).toEqual([
      "time:10:00",
      "ben[]:Plan it",
      "proposal:pending",
      "note:Milestone 2 done · 37/50",
      "agent[]:Proposed a roadmap",
    ]);
  });

  it("collapses a decided proposal to a line at the time Ben decided", () => {
    const activity = [
      {
        id: "a1",
        goalId: GOAL,
        at: "2026-11-17T10:20:00Z",
        author: "Ben",
        text: 'Approved "Ship in three milestones"',
      },
    ];
    expect(
      shape(
        timeline({
          presented: [message("m1", "10:10", "assistant", "Done planning")],
          activity,
          proposals: [proposal("approved", "10:00", "10:20")],
        }),
      ),
    ).toEqual([
      "time:10:10",
      "agent[]:Done planning",
      "note:You approved the roadmap “Ship in three milestones”",
    ]);
  });

  it("shows typing while a run works until its reply starts streaming", () => {
    const asked = [message("m1", "10:00", "user", "Go"), runFold("run-1", "10:01", "10:01")];
    expect(shape(timeline({ presented: asked, working: true })).slice(-1)).toEqual(["typing"]);
    const replying = [...asked, message("m2", "10:02", "assistant", "Wor", true)];
    expect(shape(timeline({ presented: replying, working: true })).slice(-1)).toEqual([
      "agent[]:Wor",
    ]);
    expect(shape(timeline({ presented: asked, working: false })).at(-1)).toBe("ben[]:Go");
  });
});
