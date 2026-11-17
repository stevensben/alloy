import { ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import {
  type AlloyComp,
  AlloyCompEntryId,
  AlloyCompId,
  type AlloyCompEntry,
  AlloyCompanyId,
  type AlloyGoal,
  AlloyGoalId,
  type AlloyLesson,
  AlloyLessonId,
  type AlloyMilestone,
  AlloyMilestoneId,
  type AlloyModelChoice,
  AlloyProposalId,
} from "@t3tools/contracts/alloy";
import { assert, describe, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";

import {
  applyRoadmap,
  buildOrchestratorBrief,
  computeScores,
  reportProgress,
  routeModel,
  type RoutingAccount,
} from "./domain.ts";

const NOW = Date.parse("2026-11-17T12:00:00.000Z");
const inHours = (hours: number) => DateTime.formatIso(DateTime.makeUnsafe(NOW + hours * 3_600_000));

const account = (
  id: string,
  label: string,
  usage: RoutingAccount["usage"],
  overrides: Partial<RoutingAccount> = {},
): RoutingAccount => ({
  instanceId: ProviderInstanceId.make(id),
  label,
  driver: "claudeAgent",
  available: true,
  models: [
    { slug: "opus", name: "Opus" },
    { slug: "fable", name: "Fable" },
    { slug: "gpt", name: "GPT" },
  ],
  usage,
  ...overrides,
});

const choice = (instanceId: string, model: string): AlloyModelChoice => ({
  instanceId: ProviderInstanceId.make(instanceId),
  model,
});

describe("routeModel", () => {
  it("skips a full tier and picks the account whose usage resets soonest", () => {
    const result = routeModel(
      [
        choice("work", "fable"),
        choice("home", "fable"),
        choice("home", "opus"),
        choice("work", "opus"),
      ],
      [
        account("work", "Work Max", [
          { label: "Weekly", usedPercent: 34, resetsAt: inHours(2) },
          { label: "Fable", usedPercent: 95, resetsAt: inHours(30), modelIds: ["fable"] },
        ]),
        account("home", "Home Max", [
          { label: "Weekly", usedPercent: 10, resetsAt: inHours(50) },
          { label: "Fable", usedPercent: 92, resetsAt: null, modelIds: ["fable"] },
        ]),
      ],
      NOW,
    );
    assert.deepStrictEqual(result, {
      _tag: "Routed",
      choice: choice("work", "opus"),
      note: "Opus on Work Max: 34% used, resets in 2h. Skipped Fable: every account above 90%.",
    });
  });

  it("breaks reset ties by the lower usage", () => {
    const result = routeModel(
      [choice("a", "opus"), choice("b", "opus")],
      [
        account("a", "A", [{ label: "Weekly", usedPercent: 60, resetsAt: inHours(5) }]),
        account("b", "B", [{ label: "Weekly", usedPercent: 20, resetsAt: inHours(5) }]),
      ],
      NOW,
    );
    assert.deepStrictEqual(result._tag === "Routed" ? result.choice : null, choice("b", "opus"));
  });

  it("does not route to unavailable accounts or models they do not offer", () => {
    const result = routeModel(
      [choice("off", "opus"), choice("gone", "opus"), choice("on", "missing"), choice("on", "gpt")],
      [
        account("off", "Off", [], { available: false }),
        account("on", "On", [{ label: "Weekly", usedPercent: 0, resetsAt: null }]),
      ],
      NOW,
    );
    assert.deepStrictEqual(result, {
      _tag: "Routed",
      choice: choice("on", "gpt"),
      note: "GPT on On: 0% used. Skipped Opus: no connected account. Skipped missing: not offered by its account.",
    });
  });

  it("fails with a reason when nothing is viable or nothing is ranked", () => {
    const full = routeModel(
      [choice("a", "opus")],
      [account("a", "A", [{ label: "Weekly", usedPercent: 90, resetsAt: null }])],
      NOW,
    );
    assert.strictEqual(full._tag, "Unroutable");
    assert.include(full._tag === "Unroutable" ? full.message : "", "every account above 90%");
    const empty = routeModel([], [], NOW);
    assert.include(empty._tag === "Unroutable" ? empty.message : "", "Rank models");
  });
});

const goalId = AlloyGoalId.make("goal");
const milestone = (
  id: string,
  title: string,
  status: AlloyMilestone["status"],
  position: number,
): AlloyMilestone => ({
  id: AlloyMilestoneId.make(id),
  goalId,
  position,
  title,
  doneWhen: `${title} checked`,
  status,
  progress: null,
  note: null,
});

describe("applyRoadmap", () => {
  it("keeps matching milestones' state and makes the first unfinished one current", () => {
    const existing = [
      { ...milestone("m1", "Scaffold", "done", 0), progress: { done: 3, total: 3 } },
      { ...milestone("m2", "Write scripts", "current", 1), progress: { done: 37, total: 50 } },
      milestone("m3", "Old step", "upcoming", 2),
    ];
    const next = applyRoadmap(
      goalId,
      existing,
      [
        { title: "Research", doneWhen: "notes exist" },
        { title: "  write SCRIPTS ", doneWhen: "all 50 pass" },
        { title: "Scaffold", doneWhen: "builds" },
      ],
      (position) => AlloyMilestoneId.make(`new-${position}`),
    );
    assert.deepStrictEqual(
      next.map((item) => [item.id, item.position, item.status, item.doneWhen, item.progress]),
      [
        ["new-0", 0, "current", "notes exist", null],
        ["m2", 1, "upcoming", "all 50 pass", { done: 37, total: 50 }],
        ["m1", 2, "done", "builds", { done: 3, total: 3 }],
      ],
    );
  });
});

describe("reportProgress", () => {
  const roadmap = [
    milestone("m1", "One", "current", 0),
    milestone("m2", "Two", "upcoming", 1),
    milestone("m3", "Three", "upcoming", 2),
  ];

  it("records counts, and marking done moves current to the next milestone", () => {
    const counted = reportProgress(roadmap, {
      milestoneId: AlloyMilestoneId.make("m1"),
      done: 3,
      total: 5,
    });
    assert.strictEqual(counted._tag, "Updated");
    if (counted._tag !== "Updated") return;
    assert.deepStrictEqual(counted.milestones[0]?.progress, { done: 3, total: 5 });
    assert.strictEqual(counted.summary, "One: 3/5");

    const finished = reportProgress(counted.milestones, {
      milestoneId: AlloyMilestoneId.make("m1"),
      done: 5,
      status: "done",
    });
    assert.deepStrictEqual(
      finished._tag === "Updated" ? finished.milestones.map((item) => item.status) : [],
      ["done", "current", "upcoming"],
    );
  });

  it("can make a later milestone current and rejects bad counts", () => {
    const jumped = reportProgress(roadmap, {
      milestoneId: AlloyMilestoneId.make("m3"),
      status: "current",
    });
    assert.deepStrictEqual(
      jumped._tag === "Updated" ? jumped.milestones.map((item) => item.status) : [],
      ["upcoming", "upcoming", "current"],
    );
    assert.strictEqual(
      reportProgress(roadmap, { milestoneId: AlloyMilestoneId.make("m1"), done: 2 })._tag,
      "Rejected",
    );
    assert.strictEqual(
      reportProgress(roadmap, { milestoneId: AlloyMilestoneId.make("m1"), done: 6, total: 5 })._tag,
      "Rejected",
    );
    assert.strictEqual(
      reportProgress(roadmap, { milestoneId: AlloyMilestoneId.make("nope"), status: "done" })._tag,
      "Rejected",
    );
  });
});

describe("computeScores", () => {
  const entry = (
    id: string,
    model: AlloyModelChoice,
    status: AlloyCompEntry["status"],
    durationMs: number | null,
    kept: boolean | null,
  ): AlloyCompEntry => ({
    id: AlloyCompEntryId.make(id),
    model,
    threadId: null,
    status,
    startedAt: inHours(0),
    durationMs,
    kept,
    error: null,
  });
  const comp = (id: string, entries: ReadonlyArray<AlloyCompEntry>): AlloyComp => ({
    id: AlloyCompId.make(id),
    companyId: null,
    projectId: ProjectId.make("project"),
    title: id,
    taskType: "scripts",
    prompt: "do it",
    createdAt: inHours(0),
    entries,
  });

  it("counts runs, decided comps, keeps and average finished duration per model", () => {
    const opus = choice("work", "opus");
    const gpt = choice("codex", "gpt");
    const scores = computeScores([
      comp("c1", [
        entry("1", opus, "finished", 1_000, true),
        entry("2", gpt, "finished", 3_000, false),
      ]),
      comp("c2", [
        entry("3", opus, "finished", 2_000, null),
        entry("4", gpt, "failed", null, null),
      ]),
      comp("c3", [entry("5", opus, "running", null, null)]),
    ]);
    assert.deepStrictEqual(scores, [
      { taskType: "scripts", model: opus, runs: 2, decided: 1, kept: 1, avgDurationMs: 1_500 },
      { taskType: "scripts", model: gpt, runs: 2, decided: 1, kept: 0, avgDurationMs: 3_000 },
    ]);
  });
});

describe("buildOrchestratorBrief", () => {
  it("carries the vision verbatim, milestone ids and checks, scoped lessons and decisions", () => {
    const goal: AlloyGoal = {
      id: goalId,
      companyId: AlloyCompanyId.make("co"),
      projectId: ProjectId.make("project"),
      title: "Ship scripts",
      vision: "Fifty scripts that\n  each pass their tests.",
      status: "running",
      orchestrator: null,
      createdAt: inHours(0),
      updatedAt: inHours(0),
    };
    const lesson: AlloyLesson = {
      id: AlloyLessonId.make("l1"),
      scope: { _tag: "goal", goalId },
      text: "Run the full suite before reporting.",
      source: "Rejected proposal",
      author: "Ben",
      active: true,
      createdAt: inHours(0),
    };
    const brief = buildOrchestratorBrief({
      company: {
        id: goal.companyId,
        name: "Mastery",
        modelRanking: [],
        createdAt: inHours(0),
      },
      goal,
      milestones: [
        { ...milestone("m1", "Write scripts", "current", 0), progress: { done: 37, total: 50 } },
      ],
      lessons: [lesson],
      recentDecisions: [
        {
          id: AlloyProposalId.make("p1"),
          goalId,
          title: "Split export",
          rationale: "",
          body: { _tag: "idea" },
          status: "rejected",
          decisionNote: "Not now",
          author: "opus",
          createdAt: inHours(0),
          decidedAt: inHours(1),
        },
      ],
    });
    for (const expected of [
      "Company: Mastery.",
      "Fifty scripts that\n  each pass their tests.",
      "1. [current] Write scripts (id: m1), progress 37/50",
      "Done when: Write scripts checked",
      "- Run the full suite before reporting. (goal)",
      '- rejected idea "Split export": Not now',
      "`alloy_propose_roadmap`",
    ]) {
      assert.include(brief, expected);
    }
  });
});
