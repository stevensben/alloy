import type {
  AlloyAccount,
  AlloyComp,
  AlloyCompany,
  AlloyGoal,
  AlloyLesson,
  AlloyMilestone,
  AlloyMilestoneId,
  AlloyModelChoice,
  AlloyProgress,
  AlloyProposal,
  AlloyRoadmapItem,
  AlloyScore,
  AlloyUsageWindow,
} from "@t3tools/contracts/alloy";
import type { ServerProvider } from "@t3tools/contracts";

/** Routing needs to know which models a usage window limits; the wire account drops that. */
export interface RoutingUsageWindow extends AlloyUsageWindow {
  readonly modelIds?: ReadonlyArray<string> | undefined;
}

export interface RoutingAccount extends Omit<AlloyAccount, "usage"> {
  readonly usage: ReadonlyArray<RoutingUsageWindow>;
}

export const toRoutingAccount = (provider: ServerProvider): RoutingAccount => ({
  instanceId: provider.instanceId,
  label: provider.displayName ?? provider.instanceId,
  driver: provider.driver,
  available:
    provider.enabled &&
    provider.installed &&
    (provider.status === "ready" || provider.status === "warning") &&
    provider.availability !== "unavailable",
  models: provider.models.map((model) => ({ slug: model.slug, name: model.name })),
  usage: (provider.usageLimits?.windows ?? []).map((window) => ({
    label: window.label,
    usedPercent: window.usedPercent,
    resetsAt: window.resetsAt ?? null,
    modelIds: window.modelIds,
  })),
});

export const toAlloyAccount = (account: RoutingAccount): AlloyAccount => ({
  ...account,
  usage: account.usage.map(({ label, usedPercent, resetsAt }) => ({
    label,
    usedPercent,
    resetsAt,
  })),
});

const FULL_PERCENT = 90;

export type RouteResult =
  | { readonly _tag: "Routed"; readonly choice: AlloyModelChoice; readonly note: string }
  | { readonly _tag: "Unroutable"; readonly message: string };

type EntryVerdict =
  | { readonly _tag: "missing" }
  | { readonly _tag: "unavailable" }
  | { readonly _tag: "notOffered" }
  | { readonly _tag: "full" }
  | {
      readonly _tag: "viable";
      readonly account: RoutingAccount;
      readonly usedPercent: number;
      readonly resetsAt: number;
    };

const windowsFor = (account: RoutingAccount, model: string) =>
  account.usage.filter(
    (window) => window.modelIds === undefined || window.modelIds.includes(model),
  );

const judge = (entry: AlloyModelChoice, accounts: ReadonlyArray<RoutingAccount>): EntryVerdict => {
  const account = accounts.find((candidate) => candidate.instanceId === entry.instanceId);
  if (account === undefined) return { _tag: "missing" };
  if (!account.available) return { _tag: "unavailable" };
  if (!account.models.some((model) => model.slug === entry.model)) return { _tag: "notOffered" };
  const windows = windowsFor(account, entry.model);
  const usedPercent = Math.max(0, ...windows.map((window) => window.usedPercent));
  if (usedPercent >= FULL_PERCENT) return { _tag: "full" };
  const resets = windows.flatMap((window) =>
    window.resetsAt === null ? [] : [Date.parse(window.resetsAt)],
  );
  const resetsAt = Math.min(Infinity, ...resets.filter((value) => !Number.isNaN(value)));
  return { _tag: "viable", account, usedPercent, resetsAt };
};

const modelName = (model: string, accounts: ReadonlyArray<RoutingAccount>) =>
  accounts.flatMap((account) => account.models).find((candidate) => candidate.slug === model)
    ?.name ?? model;

const formatDuration = (ms: number): string => {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
};

const skipReason = (verdicts: ReadonlyArray<EntryVerdict>) => {
  const tags = new Set(verdicts.map((verdict) => verdict._tag));
  if (tags.size === 1 && tags.has("full")) return "every account above 90%";
  if ([...tags].every((tag) => tag === "missing" || tag === "unavailable"))
    return "no connected account";
  if (tags.size === 1 && tags.has("notOffered")) return "not offered by its account";
  return "no account with headroom";
};

/**
 * Consecutive ranking entries with the same model form one quality tier. The first tier with
 * headroom wins; inside it, the account whose usage resets soonest goes first, so usage that
 * would otherwise expire unused gets spent.
 */
export const routeModel = (
  ranking: ReadonlyArray<AlloyModelChoice>,
  accounts: ReadonlyArray<RoutingAccount>,
  now: number,
): RouteResult => {
  if (ranking.length === 0) {
    return {
      _tag: "Unroutable",
      message: "This company has no ranked models. Rank models for the company or pick one.",
    };
  }
  const tiers: Array<Array<AlloyModelChoice>> = [];
  for (const entry of ranking) {
    const last = tiers.at(-1);
    if (last !== undefined && last[0]?.model === entry.model) last.push(entry);
    else tiers.push([entry]);
  }
  const skipped: Array<string> = [];
  for (const tier of tiers) {
    const verdicts = tier.map((entry) => ({ entry, verdict: judge(entry, accounts) }));
    const viable = verdicts.flatMap(({ entry, verdict }) =>
      verdict._tag === "viable" ? [{ entry, ...verdict }] : [],
    );
    const best = viable.toSorted(
      (left, right) => left.resetsAt - right.resetsAt || left.usedPercent - right.usedPercent,
    )[0];
    const name = modelName(tier[0]?.model ?? "", accounts);
    if (best === undefined) {
      skipped.push(`Skipped ${name}: ${skipReason(verdicts.map(({ verdict }) => verdict))}.`);
      continue;
    }
    const usage =
      best.account.usage.length === 0
        ? "no usage data"
        : `${Math.round(best.usedPercent)}% used${
            Number.isFinite(best.resetsAt)
              ? `, resets in ${formatDuration(best.resetsAt - now)}`
              : ""
          }`;
    return {
      _tag: "Routed",
      choice: best.entry,
      note: [`${name} on ${best.account.label}: ${usage}.`, ...skipped].join(" "),
    };
  }
  return {
    _tag: "Unroutable",
    message: `No ranked model has headroom right now. ${skipped.join(" ")} Pick a model to start anyway.`,
  };
};

const sameTitle = (left: string, right: string) =>
  left.trim().toLowerCase() === right.trim().toLowerCase();

/** Done milestones stay done; the first other one is current and the rest upcoming. */
const withCurrent = (milestones: ReadonlyArray<AlloyMilestone>): Array<AlloyMilestone> => {
  let currentSet = false;
  return milestones.map((milestone) => {
    if (milestone.status === "done") return milestone;
    const status = currentSet ? "upcoming" : "current";
    currentSet = true;
    return milestone.status === status ? milestone : { ...milestone, status };
  });
};

export const applyRoadmap = (
  goalId: AlloyGoal["id"],
  existing: ReadonlyArray<AlloyMilestone>,
  items: ReadonlyArray<AlloyRoadmapItem>,
  newId: (position: number) => AlloyMilestoneId,
): Array<AlloyMilestone> => {
  const unclaimed = [...existing];
  const next = items.map((item, position): AlloyMilestone => {
    const index = unclaimed.findIndex((milestone) => sameTitle(milestone.title, item.title));
    const kept = index === -1 ? undefined : unclaimed.splice(index, 1)[0];
    return kept === undefined
      ? {
          id: newId(position),
          goalId,
          position,
          title: item.title,
          doneWhen: item.doneWhen,
          status: "upcoming",
          progress: null,
          note: null,
        }
      : { ...kept, position, title: item.title, doneWhen: item.doneWhen };
  });
  return withCurrent(next);
};

const promoteNextAfter = (milestones: Array<AlloyMilestone>, position: number) => {
  const next =
    milestones.find(
      (milestone) => milestone.status === "upcoming" && milestone.position > position,
    ) ?? milestones.find((milestone) => milestone.status === "upcoming");
  return milestones.map((milestone): AlloyMilestone =>
    milestone === next ? { ...milestone, status: "current" } : milestone,
  );
};

export interface ProgressReport {
  readonly milestoneId: AlloyMilestoneId;
  readonly done?: number | undefined;
  readonly total?: number | undefined;
  readonly status?: "current" | "done" | undefined;
  readonly note?: string | undefined;
}

export type ProgressResult =
  | {
      readonly _tag: "Updated";
      readonly milestones: Array<AlloyMilestone>;
      readonly summary: string;
    }
  | { readonly _tag: "Rejected"; readonly message: string };

export const reportProgress = (
  milestones: ReadonlyArray<AlloyMilestone>,
  report: ProgressReport,
): ProgressResult => {
  const target = milestones.find((milestone) => milestone.id === report.milestoneId);
  if (target === undefined) {
    return { _tag: "Rejected", message: `No milestone ${report.milestoneId} in this goal.` };
  }
  let progress: AlloyProgress | null = target.progress;
  if (report.done !== undefined || report.total !== undefined) {
    const total = report.total ?? progress?.total;
    const done = report.done ?? progress?.done ?? 0;
    if (total === undefined) {
      return { _tag: "Rejected", message: "Pass total the first time you report a count." };
    }
    if (done < 0 || total < 0 || done > total) {
      return { _tag: "Rejected", message: `Progress ${done}/${total} is not a valid count.` };
    }
    progress = { done, total };
  }
  const note = report.note ?? target.note;
  const updated = milestones.map((milestone): AlloyMilestone => {
    if (milestone.id === target.id) {
      return { ...milestone, progress, note, status: report.status ?? milestone.status };
    }
    return report.status === "current" && milestone.status === "current"
      ? { ...milestone, status: "upcoming" }
      : milestone;
  });
  const next =
    report.status === "done" && !updated.some((milestone) => milestone.status === "current")
      ? promoteNextAfter(updated, target.position)
      : updated;
  const parts = [
    progress === null ? null : `${progress.done}/${progress.total}`,
    report.status === "done" ? "done" : report.status === "current" ? "now current" : null,
    report.note === undefined ? null : report.note,
  ].filter((part) => part !== null);
  return {
    _tag: "Updated",
    milestones: next,
    summary: `${target.title}: ${parts.length === 0 ? "no change" : parts.join(", ")}`,
  };
};

const scoreKey = (taskType: string, model: AlloyModelChoice) =>
  JSON.stringify([taskType, model.instanceId, model.model]);

export const computeScores = (comps: ReadonlyArray<AlloyComp>): Array<AlloyScore> => {
  const scores = new Map<
    string,
    {
      taskType: string;
      model: AlloyModelChoice;
      runs: number;
      decided: number;
      kept: number;
      durations: Array<number>;
    }
  >();
  for (const comp of comps) {
    const decided = comp.entries.some((entry) => entry.kept === true);
    for (const entry of comp.entries) {
      const key = scoreKey(comp.taskType, entry.model);
      const score = scores.get(key) ?? {
        taskType: comp.taskType,
        model: entry.model,
        runs: 0,
        decided: 0,
        kept: 0,
        durations: [],
      };
      if (entry.status !== "running") score.runs += 1;
      if (decided) score.decided += 1;
      if (entry.kept === true) score.kept += 1;
      if (entry.status === "finished" && entry.durationMs !== null) {
        score.durations.push(entry.durationMs);
      }
      scores.set(key, score);
    }
  }
  return [...scores.values()].map(({ durations, ...score }) => ({
    ...score,
    avgDurationMs:
      durations.length === 0
        ? null
        : Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length),
  }));
};

export const lessonsForGoal = (lessons: ReadonlyArray<AlloyLesson>, goal: AlloyGoal) =>
  lessons.filter(
    (lesson) =>
      lesson.active &&
      (lesson.scope._tag === "global" ||
        (lesson.scope._tag === "company" && lesson.scope.companyId === goal.companyId) ||
        (lesson.scope._tag === "goal" && lesson.scope.goalId === goal.id)),
  );

const scopeLabel = (lesson: AlloyLesson) =>
  lesson.scope._tag === "global"
    ? "all goals"
    : lesson.scope._tag === "company"
      ? "company"
      : "goal";

const progressLabel = (milestone: AlloyMilestone) =>
  milestone.progress === null
    ? ""
    : `, progress ${milestone.progress.done}/${milestone.progress.total}`;

const decisionLine = (proposal: AlloyProposal) =>
  `- ${proposal.status} ${proposal.body._tag} "${proposal.title}"${
    proposal.decisionNote === null || proposal.decisionNote.trim() === ""
      ? ""
      : `: ${proposal.decisionNote}`
  }`;

export interface OrchestratorBriefInput {
  readonly company: AlloyCompany;
  readonly goal: AlloyGoal;
  readonly milestones: ReadonlyArray<AlloyMilestone>;
  readonly lessons: ReadonlyArray<AlloyLesson>;
  readonly recentDecisions: ReadonlyArray<AlloyProposal>;
  readonly pendingProposals?: ReadonlyArray<AlloyProposal>;
}

const RULES = [
  "You own delivery of this goal. Judge every worker result against the vision, not just its task.",
  "Delegate work to workers with `delegate_task`; use `orchestrator_capabilities` to pick models. Give each worker the vision, its milestone and that milestone's done check.",
  "You may not change the roadmap. Propose a full milestone list with `alloy_propose_roadmap` and wait for Ben's approval.",
  "If the roadmap is empty, your first job is to draft one and propose it. Then wait for approval.",
  "Log anything that would improve the vision or the approach with `alloy_log_idea`. Never sit on an improvement.",
  "Report progress with `alloy_report_progress` whenever a count changes or a milestone finishes. Counts come from checks you ran, never estimates.",
  "Record durable lessons with `alloy_record_lesson`.",
  "Call `alloy_goal_context` at the start of every turn for the latest state.",
  "Stay quiet between state changes: no status chatter. Ask Ben only when you are blocked or the decision is his.",
  'The `alloy_*` tools are on the T3 Code MCP server. If they are not listed, find them with tool search ("alloy").',
];

export const buildOrchestratorBrief = (input: OrchestratorBriefInput): string => {
  const { company, goal, milestones, lessons, recentDecisions } = input;
  const pending = input.pendingProposals ?? [];
  const roadmap =
    milestones.length === 0
      ? ["No roadmap yet."]
      : milestones.flatMap((milestone, index) => [
          `${index + 1}. [${milestone.status}] ${milestone.title} (id: ${milestone.id})${progressLabel(milestone)}`,
          `   Done when: ${milestone.doneWhen}`,
          ...(milestone.note === null ? [] : [`   Note: ${milestone.note}`]),
        ]);
  const sections = [
    `# Alloy goal: ${goal.title}`,
    `Company: ${company.name}. Goal id: ${goal.id}. Status: ${goal.status}.`,
    "## Vision",
    goal.vision.trim() === "" ? "(No vision written yet. Ask Ben for one.)" : goal.vision,
    "## Roadmap",
    roadmap.join("\n"),
    "## Lessons",
    lessons.length === 0
      ? "None yet."
      : lessons.map((lesson) => `- ${lesson.text} (${scopeLabel(lesson)})`).join("\n"),
    "## Recent decisions",
    recentDecisions.length === 0 ? "None yet." : recentDecisions.map(decisionLine).join("\n"),
    ...(pending.length === 0
      ? []
      : [
          "## Awaiting Ben",
          pending.map((proposal) => `- ${proposal.body._tag} "${proposal.title}"`).join("\n"),
        ]),
    "## How you work",
    RULES.map((rule) => `- ${rule}`).join("\n"),
  ];
  return sections.join("\n\n");
};

export const buildCompPrompt = (prompt: string): string =>
  [
    prompt,
    "---",
    "This is one independent attempt among several models working on the same task. Work only in this worktree. Finish with a short summary of what you did and how you verified it.",
  ].join("\n\n");
