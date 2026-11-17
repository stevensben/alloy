import { ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import {
  AlloyCompanyId,
  AlloyGoalId,
  AlloyMilestoneId,
  AlloyProposalId,
  type AlloyGoal,
  type AlloyMilestone,
  type AlloyProposal,
} from "@t3tools/contracts/alloy";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { agentRows, agentStatus, agentStatusLabel, threadPreview } from "./alloy-inbox";

function goal(
  id: string,
  status: AlloyGoal["status"],
  updatedAt: string,
  started = true,
): AlloyGoal {
  return {
    id: AlloyGoalId.make(id),
    companyId: AlloyCompanyId.make("acme"),
    projectId: ProjectId.make("project"),
    title: id,
    vision: "",
    status,
    orchestrator: started
      ? {
          threadId: ThreadId.make(`thread-${id}`),
          model: { instanceId: ProviderInstanceId.make("claude"), model: "opus" },
          routingNote: "",
          startedAt: updatedAt,
        }
      : null,
    createdAt: updatedAt,
    updatedAt,
  };
}

function milestone(
  goalId: string,
  position: number,
  status: AlloyMilestone["status"],
  progress: AlloyMilestone["progress"] = null,
): AlloyMilestone {
  return {
    id: AlloyMilestoneId.make(`${goalId}-${position}`),
    goalId: AlloyGoalId.make(goalId),
    position,
    title: `Milestone ${position}`,
    doneWhen: "",
    status,
    progress,
    note: null,
  };
}

function proposal(goalId: string, status: AlloyProposal["status"], createdAt: string) {
  return {
    id: AlloyProposalId.make(`${goalId}-proposal`),
    goalId: AlloyGoalId.make(goalId),
    title: "Split the export",
    rationale: "",
    body: { _tag: "idea" },
    status,
    decisionNote: null,
    author: "Agent",
    createdAt,
    decidedAt: null,
  } satisfies AlloyProposal;
}

const empty = { proposals: [], milestones: [], activity: [] };

describe("agentStatus", () => {
  it.each([
    [goal("a", "draft", "2026-11-17T10:00:00Z", false), "Draft"],
    [goal("a", "draft", "2026-11-17T10:00:00Z"), "Planning"],
    [goal("a", "running", "2026-11-17T10:00:00Z"), "Running"],
    [goal("a", "paused", "2026-11-17T10:00:00Z"), "Paused"],
    [goal("a", "done", "2026-11-17T10:00:00Z"), "Done"],
  ])("labels a %s agent without pending proposals", (subject, label) => {
    expect(agentStatusLabel(agentStatus(subject, empty))).toBe(label);
  });

  it("puts a pending proposal ahead of any status", () => {
    const status = agentStatus(goal("a", "paused", "2026-11-17T10:00:00Z"), {
      ...empty,
      proposals: [proposal("a", "pending", "2026-11-17T10:00:00Z")],
    });
    expect(status).toEqual({ _tag: "needsYou", count: 1 });
    expect(agentStatusLabel(status)).toBe("Needs you");
  });

  it("shows the current milestone's progress, else milestones done", () => {
    const running = goal("a", "running", "2026-11-17T10:00:00Z");
    const counted = [
      milestone("a", 1, "done"),
      milestone("a", 2, "current", { done: 37, total: 50 }),
    ];
    expect(agentStatusLabel(agentStatus(running, { ...empty, milestones: counted }))).toBe("37/50");
    const uncounted = [milestone("a", 1, "done"), milestone("a", 2, "current")];
    expect(agentStatusLabel(agentStatus(running, { ...empty, milestones: uncounted }))).toBe("1/2");
  });
});

describe("agentRows", () => {
  it("orders agents that need Ben first, then by their latest activity", () => {
    const quiet = goal("quiet", "running", "2026-11-17T08:00:00Z");
    const busy = goal("busy", "running", "2026-11-17T09:00:00Z");
    const blocked = goal("blocked", "running", "2026-11-17T07:00:00Z");
    const rows = agentRows(
      {
        goals: [quiet, busy, blocked],
        milestones: [],
        proposals: [proposal("blocked", "pending", "2026-11-17T07:30:00Z")],
        activity: [
          {
            id: "1",
            goalId: AlloyGoalId.make("quiet"),
            at: "2026-11-17T11:00:00Z",
            author: "Agent",
            text: "Milestone 1 done",
          },
        ],
      },
      (subject) => (subject.id === "busy" ? "2026-11-17T11:30:00Z" : null),
    );
    expect(rows.map((row) => [row.goal.id, row.at])).toEqual([
      ["blocked", "2026-11-17T07:30:00Z"],
      ["busy", "2026-11-17T11:30:00Z"],
      ["quiet", "2026-11-17T11:00:00Z"],
    ]);
  });
});

describe("threadPreview", () => {
  const message = (id: string, role: string, text: string, streaming = false) => ({
    id,
    role,
    text,
    streaming,
    createdAt: DateTime.makeUnsafe("2026-11-17T10:00:00Z"),
  });

  it("takes the newest settled prose message, skipping Alloy's own notes and blanks", () => {
    expect(
      threadPreview([
        message("m1", "assistant", "Here is the **plan**:\n\n- [docs](https://x.y) first"),
        message("m2", "assistant", "   "),
        message("alloy-message:1", "user", "Ben approved the roadmap."),
        message("m3", "system", "compacted"),
        message("m4", "assistant", "Still typing", true),
      ]),
    ).toEqual({
      text: "Here is the plan: - docs first",
      fromBen: false,
      at: "2026-11-17T10:00:00.000Z",
    });
  });

  it("marks Ben's own message and is null for an empty thread", () => {
    expect(threadPreview([message("m1", "user", "Ship it")])?.fromBen).toBe(true);
    expect(threadPreview([])).toBeNull();
  });
});
