import { ProjectId } from "@t3tools/contracts";
import {
  AlloyCompanyId,
  AlloyGoalId,
  AlloyMilestoneId,
  type AlloyAccount,
  type AlloyGoal,
  type AlloyMilestone,
  type AlloyScore,
} from "@t3tools/contracts/alloy";
import { ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  accountsOverview,
  accountUsageSummary,
  chooseAlloyEnvironment,
  currentMilestone,
  formatDuration,
  formatResetsIn,
  goalMilestones,
  goalStatusLabel,
  modelLabel,
  modelMenuGroups,
  modelOptions,
  moveItem,
  roadmapProgress,
  scoreboard,
  scoreSummary,
  toggleChoice,
} from "./alloy-model";

const NOW = Date.parse("2026-11-17T12:00:00.000Z");
const instance = ProviderInstanceId.make("claude-work");

function goal(id: string, companyId: string, status: AlloyGoal["status"], updatedAt: string) {
  return {
    id: AlloyGoalId.make(id),
    companyId: AlloyCompanyId.make(companyId),
    projectId: ProjectId.make("project"),
    title: id,
    vision: "",
    status,
    orchestrator: null,
    createdAt: updatedAt,
    updatedAt,
  } satisfies AlloyGoal;
}

function milestone(
  position: number,
  status: AlloyMilestone["status"],
  goalId = "goal",
): AlloyMilestone {
  return {
    id: AlloyMilestoneId.make(`m${position}`),
    goalId: AlloyGoalId.make(goalId),
    position,
    title: `Milestone ${position}`,
    doneWhen: "",
    status,
    progress: null,
    note: null,
  };
}

function account(usage: AlloyAccount["usage"], available = true): AlloyAccount {
  return {
    instanceId: instance,
    label: "Work",
    driver: "claude",
    available,
    models: [{ slug: "opus", name: "Claude Opus" }],
    usage,
  };
}

function score(taskType: string, model: string, kept: number, decided: number, runs: number) {
  return {
    taskType,
    model: { instanceId: instance, model },
    runs,
    decided,
    kept,
    avgDurationMs: null,
  } satisfies AlloyScore;
}

describe("chooseAlloyEnvironment", () => {
  const env = (environmentId: string, probe: "pending" | "alloy" | "other") => ({
    environmentId,
    probe,
  });

  it("prefers the selected environment once it answers", () => {
    expect(chooseAlloyEnvironment([env("a", "alloy"), env("b", "alloy")], "b")).toEqual({
      _tag: "found",
      environmentId: "b",
    });
  });

  it("waits for the selected environment before falling back", () => {
    expect(chooseAlloyEnvironment([env("a", "alloy"), env("b", "pending")], "b")).toEqual({
      _tag: "probing",
    });
  });

  it("falls back to the first Alloy environment when the selected one is not Alloy", () => {
    expect(
      chooseAlloyEnvironment([env("a", "other"), env("b", "alloy"), env("c", "alloy")], "a"),
    ).toEqual({ _tag: "found", environmentId: "b" });
  });

  it("keeps probing while any environment is unanswered, then reports none", () => {
    expect(chooseAlloyEnvironment([env("a", "other"), env("b", "pending")], null)).toEqual({
      _tag: "probing",
    });
    expect(chooseAlloyEnvironment([env("a", "other")], null)).toEqual({ _tag: "none" });
    expect(chooseAlloyEnvironment([], null)).toEqual({ _tag: "none" });
  });
});

describe("goals", () => {
  it("orders the roadmap and finds progress and the current milestone", () => {
    const roadmap = goalMilestones(
      [
        milestone(2, "upcoming"),
        milestone(0, "done"),
        milestone(1, "current"),
        milestone(0, "done", "other"),
      ],
      AlloyGoalId.make("goal"),
    );
    expect(roadmap.map((entry) => entry.position)).toEqual([0, 1, 2]);
    expect(roadmapProgress(roadmap)).toEqual({ done: 1, total: 3 });
    expect(currentMilestone(roadmap)?.position).toBe(1);
    expect(currentMilestone([milestone(0, "done"), milestone(1, "upcoming")])?.position).toBe(1);
    expect(currentMilestone([milestone(0, "done")])).toBeNull();
  });
});

describe("agents", () => {
  it("reads a draft with a running agent as planning", () => {
    const draft = goal("goal", "co", "draft", "2026-11-17T00:00:00.000Z");
    expect(goalStatusLabel(draft)).toBe("Draft");
    expect(
      goalStatusLabel({
        ...draft,
        orchestrator: {
          threadId: "thread" as never,
          model: { instanceId: instance, model: "opus" },
          routingNote: "",
          startedAt: draft.createdAt,
        },
      }),
    ).toBe("Planning with you");
  });
});

describe("accounts", () => {
  it("formats when usage resets", () => {
    expect(formatResetsIn(null, NOW)).toBeNull();
    expect(formatResetsIn("2026-11-17T11:59:00Z", NOW)).toBe("resets now");
    expect(formatResetsIn("2026-11-17T12:45:00Z", NOW)).toBe("resets in 45m");
    expect(formatResetsIn("2026-11-17T14:10:00Z", NOW)).toBe("resets in 2h");
    expect(formatResetsIn("2026-11-21T12:00:00Z", NOW)).toBe("resets in 4d");
  });

  it("summarizes the most used window", () => {
    expect(
      accountUsageSummary(
        account([
          { label: "5h", usedPercent: 20, resetsAt: "2026-11-17T13:00:00Z" },
          { label: "week", usedPercent: 71.6, resetsAt: "2026-11-19T12:00:00Z" },
        ]),
        NOW,
      ),
    ).toBe("72% of week · resets in 2d");
    expect(accountUsageSummary(account([]), NOW)).toBe("No usage reported");
    expect(accountUsageSummary(account([], false), NOW)).toBe("Unavailable");
  });

  it("labels a model with its account and falls back to the slug", () => {
    const accounts = [account([])];
    expect(modelLabel(accounts, { instanceId: instance, model: "opus" })).toBe(
      "Claude Opus · Work",
    );
    expect(modelLabel(accounts, { instanceId: instance, model: "haiku" })).toBe("haiku · Work");
  });
});

describe("scoreboard", () => {
  it("ranks each task type by kept rate, then runs, with undecided models last", () => {
    const groups = scoreboard([
      score("scripts", "undecided", 0, 0, 9),
      score("scripts", "half", 1, 2, 2),
      score("scripts", "all-few", 1, 1, 1),
      score("scripts", "all-many", 3, 3, 4),
      score("emails", "solo", 0, 1, 1),
    ]);
    expect(groups.map((group) => group.taskType)).toEqual(["emails", "scripts"]);
    expect(groups[1]!.rows.map((row) => row.model.model)).toEqual([
      "all-many",
      "all-few",
      "half",
      "undecided",
    ]);
  });

  it("summarizes a row", () => {
    expect(scoreSummary({ ...score("t", "m", 3, 4, 5), avgDurationMs: 252_000 })).toBe(
      "kept 3 of 4 · 5 runs · avg 4m 12s",
    );
    expect(formatDuration(3_900_000)).toBe("1h 5m");
  });
});

describe("editing choices", () => {
  it("moves items within bounds", () => {
    expect(moveItem(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
  });

  it("toggles models up to the limit", () => {
    const opus = { instanceId: instance, model: "opus" };
    const haiku = { instanceId: instance, model: "haiku" };
    expect(toggleChoice([opus], haiku, 2)).toEqual([opus, haiku]);
    expect(toggleChoice([opus, haiku], opus, 2)).toEqual([haiku]);
    expect(toggleChoice([opus], haiku, 1)).toEqual([opus]);
  });
});

describe("accountsOverview", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  const account = (label: string, available: boolean, usedPercent: number | null) => ({
    instanceId: ProviderInstanceId.make(label.toLowerCase()),
    label,
    driver: label.toLowerCase(),
    available,
    models: [],
    usage:
      usedPercent === null
        ? []
        : [{ label: "Weekly", usedPercent, resetsAt: "2026-11-20T12:00:00Z" }],
  });

  it("says when nothing is set up", () => {
    expect(accountsOverview([account("Codex", false, null)], now)).toBe("None set up yet");
  });

  it("counts ready accounts and names the busiest", () => {
    expect(
      accountsOverview(
        [account("Codex", false, null), account("Claude", true, 42), account("Work", true, 10)],
        now,
      ),
    ).toBe("2 ready · Claude 42% of Weekly · resets in 3d");
  });
});

describe("modelMenuGroups", () => {
  const accounts = [
    {
      instanceId: ProviderInstanceId.make("claudeAgent"),
      label: "Claude",
      driver: "claudeAgent",
      available: true,
      models: [
        { slug: "claude-opus-5-5", name: "Claude Opus 5.5" },
        { slug: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
      ],
      usage: [],
    },
    {
      instanceId: ProviderInstanceId.make("grok"),
      label: "Grok",
      driver: "grok",
      available: true,
      models: [{ slug: "grok-4.7", name: "Grok 4.7" }],
      usage: [],
    },
  ];

  it("keeps every model with a distinct, NUL-free id", () => {
    const options = modelOptions(accounts);
    const ids = options.map((option) => option.key);
    expect(new Set(ids).size).toBe(3);
    expect(ids.some((id) => id.includes("\u0000"))).toBe(false);
  });

  it("groups models under their account", () => {
    const options = modelOptions(accounts);
    const groups = modelMenuGroups(accounts, options, options[0]?.key ?? null);
    expect(groups.map((group) => group.title)).toEqual(["Claude", "Grok"]);
    expect(groups[0]?.subactions?.map((action) => action.title)).toEqual([
      "Claude Opus 5.5",
      "Claude Haiku 4.5",
    ]);
    expect(groups[0]?.subactions?.[0]?.state).toBe("on");
  });
});
