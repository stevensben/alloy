import type {
  AlloyAccount,
  AlloyActivity,
  AlloyComp,
  AlloyCompany,
  AlloyGoal,
  AlloyGoalId,
  AlloyGoalStatus,
  AlloyLesson,
  AlloyMilestone,
  AlloyModelChoice,
  AlloyProposal,
  AlloyScore,
  AlloySnapshot,
  AlloyUsageWindow,
} from "@t3tools/contracts/alloy";

export type AlloyProbe = "pending" | "alloy" | "other";

type AlloyEnvironmentChoice<Id extends string> =
  | { readonly _tag: "found"; readonly environmentId: Id }
  | { readonly _tag: "probing" }
  | { readonly _tag: "none" };

/** The preferred environment wins once it answers; otherwise the first one that does. */
export function chooseAlloyEnvironment<Id extends string>(
  candidates: ReadonlyArray<{ readonly environmentId: Id; readonly probe: AlloyProbe }>,
  preferred: Id | null,
): AlloyEnvironmentChoice<Id> {
  const preferredProbe = candidates.find((candidate) => candidate.environmentId === preferred);
  if (preferredProbe?.probe === "alloy")
    return { _tag: "found", environmentId: preferredProbe.environmentId };
  if (preferredProbe?.probe === "pending") return { _tag: "probing" };
  const alloy = candidates.find((candidate) => candidate.probe === "alloy");
  if (alloy) return { _tag: "found", environmentId: alloy.environmentId };
  return candidates.some((candidate) => candidate.probe === "pending")
    ? { _tag: "probing" }
    : { _tag: "none" };
}

export const GOAL_STATUS_LABEL: Record<AlloyGoalStatus, string> = {
  draft: "Draft",
  running: "Running",
  paused: "Paused",
  done: "Done",
};

const GOAL_STATUS_ORDER: Record<AlloyGoalStatus, number> = {
  running: 0,
  paused: 1,
  draft: 2,
  done: 3,
};

const byNewest = <T extends { readonly createdAt: string }>(left: T, right: T) =>
  right.createdAt.localeCompare(left.createdAt);

interface CompanyGoals {
  readonly company: AlloyCompany;
  readonly goals: ReadonlyArray<AlloyGoal>;
}

export function groupGoalsByCompany(
  snapshot: Pick<AlloySnapshot, "companies" | "goals">,
): ReadonlyArray<CompanyGoals> {
  return snapshot.companies
    .map((company) => ({
      company,
      goals: snapshot.goals
        .filter((goal) => goal.companyId === company.id)
        .sort(
          (left, right) =>
            GOAL_STATUS_ORDER[left.status] - GOAL_STATUS_ORDER[right.status] ||
            right.updatedAt.localeCompare(left.updatedAt),
        ),
    }))
    .filter((group) => group.goals.length > 0)
    .sort((left, right) => left.company.name.localeCompare(right.company.name));
}

export function goalMilestones(
  milestones: ReadonlyArray<AlloyMilestone>,
  goalId: AlloyGoalId,
): ReadonlyArray<AlloyMilestone> {
  return milestones
    .filter((milestone) => milestone.goalId === goalId)
    .sort((left, right) => left.position - right.position);
}

export function roadmapProgress(milestones: ReadonlyArray<AlloyMilestone>) {
  return {
    done: milestones.filter((milestone) => milestone.status === "done").length,
    total: milestones.length,
  };
}

export function currentMilestone(milestones: ReadonlyArray<AlloyMilestone>): AlloyMilestone | null {
  return (
    milestones.find((milestone) => milestone.status === "current") ??
    milestones.find((milestone) => milestone.status !== "done") ??
    null
  );
}

/** Roughly whether text runs past `lines` lines on a phone, without measuring layout. */
export function isLongText(text: string, lines: number): boolean {
  return text.split("\n").length > lines || text.length > lines * 70;
}

export function progressFraction(progress: { readonly done: number; readonly total: number }) {
  return progress.total > 0 ? progress.done / progress.total : 0;
}

export function pendingProposals(
  proposals: ReadonlyArray<AlloyProposal>,
  goalId?: AlloyGoalId,
): ReadonlyArray<AlloyProposal> {
  return proposals
    .filter(
      (proposal) =>
        proposal.status === "pending" && (goalId === undefined || proposal.goalId === goalId),
    )
    .sort(byNewest);
}

export function goalActivity(
  activity: ReadonlyArray<AlloyActivity>,
  goalId: AlloyGoalId,
): ReadonlyArray<AlloyActivity> {
  return activity
    .filter((entry) => entry.goalId === goalId)
    .sort((left, right) => right.at.localeCompare(left.at));
}

export function lessonScopeLabel(
  lesson: AlloyLesson,
  snapshot: Pick<AlloySnapshot, "companies" | "goals">,
): string {
  switch (lesson.scope._tag) {
    case "global":
      return "Everywhere";
    case "company": {
      const { companyId } = lesson.scope;
      return snapshot.companies.find((company) => company.id === companyId)?.name ?? "Company";
    }
    case "goal": {
      const { goalId } = lesson.scope;
      return snapshot.goals.find((goal) => goal.id === goalId)?.title ?? "Goal";
    }
  }
}

interface ModelOption {
  readonly key: string;
  readonly choice: AlloyModelChoice;
  readonly label: string;
}

export const modelChoiceKey = (choice: AlloyModelChoice) =>
  `${choice.instanceId}\u0000${choice.model}`;

export function modelOptions(accounts: ReadonlyArray<AlloyAccount>): ReadonlyArray<ModelOption> {
  return accounts
    .filter((account) => account.available)
    .flatMap((account) =>
      account.models.map((model) => {
        const choice = { instanceId: account.instanceId, model: model.slug };
        return { key: modelChoiceKey(choice), choice, label: `${model.name} · ${account.label}` };
      }),
    );
}

export function modelLabel(accounts: ReadonlyArray<AlloyAccount>, choice: AlloyModelChoice) {
  const account = accounts.find((candidate) => candidate.instanceId === choice.instanceId);
  const name = account?.models.find((model) => model.slug === choice.model)?.name ?? choice.model;
  return `${name} · ${account?.label ?? choice.instanceId}`;
}

export function moveItem<T>(items: ReadonlyArray<T>, index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return [...items];
  }
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item!);
  return next;
}

export function highestUsage(account: AlloyAccount): AlloyUsageWindow | null {
  return account.usage.reduce<AlloyUsageWindow | null>(
    (highest, window) =>
      highest === null || window.usedPercent > highest.usedPercent ? window : highest,
    null,
  );
}

export function formatResetsIn(resetsAt: string | null, nowMs: number): string | null {
  if (resetsAt === null) return null;
  const at = Date.parse(resetsAt);
  if (Number.isNaN(at)) return null;
  const minutes = Math.ceil((at - nowMs) / 60_000);
  if (minutes <= 0) return "resets now";
  if (minutes < 60) return `resets in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `resets in ${hours}h`;
  return `resets in ${Math.floor(hours / 24)}d`;
}

export function accountUsageSummary(account: AlloyAccount, nowMs: number): string {
  if (!account.available) return "Unavailable";
  const window = highestUsage(account);
  if (window === null) return "No usage reported";
  const resets = formatResetsIn(window.resetsAt, nowMs);
  const used = `${Math.round(window.usedPercent)}% of ${window.label}`;
  return resets === null ? used : `${used} · ${resets}`;
}

/** One line for the Agents screen: how many accounts are ready and the busiest one's usage. */
export function accountsOverview(accounts: ReadonlyArray<AlloyAccount>, nowMs: number): string {
  const ready = accounts.filter((account) => account.available);
  if (ready.length === 0) return "None set up yet";
  const busiest = ready
    .map((account) => ({ account, window: highestUsage(account) }))
    .filter((entry) => entry.window !== null)
    .sort((left, right) => (right.window?.usedPercent ?? 0) - (left.window?.usedPercent ?? 0))[0];
  const count = `${ready.length} ready`;
  return busiest === undefined
    ? count
    : `${count} · ${busiest.account.label} ${accountUsageSummary(busiest.account, nowMs)}`;
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

interface ScoreboardGroup {
  readonly taskType: string;
  readonly rows: ReadonlyArray<AlloyScore>;
}

const keptRate = (score: AlloyScore) => (score.decided > 0 ? score.kept / score.decided : -1);

export function scoreboard(scores: ReadonlyArray<AlloyScore>): ReadonlyArray<ScoreboardGroup> {
  const taskTypes = [...new Set(scores.map((score) => score.taskType))].sort((left, right) =>
    left.localeCompare(right),
  );
  return taskTypes.map((taskType) => ({
    taskType,
    rows: scores
      .filter((score) => score.taskType === taskType)
      .sort((left, right) => keptRate(right) - keptRate(left) || right.runs - left.runs),
  }));
}

export function scoreSummary(score: AlloyScore): string {
  const runs = `${score.runs} run${score.runs === 1 ? "" : "s"}`;
  const time = score.avgDurationMs === null ? null : `avg ${formatDuration(score.avgDurationMs)}`;
  return [`kept ${score.kept} of ${score.decided}`, runs, time].filter(Boolean).join(" · ");
}

export function scoreboardLeaders(scores: ReadonlyArray<AlloyScore>): ReadonlyArray<AlloyScore> {
  return scoreboard(scores).flatMap((group) => (group.rows[0] ? [group.rows[0]] : []));
}

export function newestComps(comps: ReadonlyArray<AlloyComp>): ReadonlyArray<AlloyComp> {
  return [...comps].sort(byNewest);
}

export function compStatusSummary(comp: AlloyComp): string {
  const running = comp.entries.filter((entry) => entry.status === "running").length;
  const failed = comp.entries.filter((entry) => entry.status === "failed").length;
  const kept = comp.entries.some((entry) => entry.kept === true);
  return [
    `${comp.entries.length} model${comp.entries.length === 1 ? "" : "s"}`,
    running > 0 ? `${running} running` : null,
    failed > 0 ? `${failed} failed` : null,
    kept ? "kept one" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function knownTaskTypes(snapshot: Pick<AlloySnapshot, "comps" | "scores">): string[] {
  return [
    ...new Set([
      ...snapshot.comps.map((comp) => comp.taskType),
      ...snapshot.scores.map((score) => score.taskType),
    ]),
  ].sort((left, right) => left.localeCompare(right));
}

export function toggleChoice(
  selected: ReadonlyArray<AlloyModelChoice>,
  choice: AlloyModelChoice,
  max: number,
): ReadonlyArray<AlloyModelChoice> {
  const key = modelChoiceKey(choice);
  if (selected.some((candidate) => modelChoiceKey(candidate) === key)) {
    return selected.filter((candidate) => modelChoiceKey(candidate) !== key);
  }
  return selected.length >= max ? selected : [...selected, choice];
}
