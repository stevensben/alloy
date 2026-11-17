import { CommandId, MessageId, type ThreadId } from "@t3tools/contracts";
import {
  type AlloyActivity,
  type AlloyCommand,
  type AlloyCommandResult,
  type AlloyComp,
  type AlloyCompEntry,
  AlloyCompEntryId,
  AlloyCompId,
  type AlloyCompany,
  AlloyCompanyId,
  AlloyError,
  type AlloyGoal,
  AlloyGoalId,
  type AlloyLesson,
  AlloyLessonId,
  type AlloyLessonScope,
  AlloyMilestoneId,
  type AlloyModelChoice,
  type AlloyProposal,
  type AlloyProposalBody,
  AlloyProposalId,
  type AlloyRoadmapItem,
  type AlloySnapshot,
} from "@t3tools/contracts/alloy";
import * as Context from "effect/Context";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ThreadLaunchService from "../../orchestration-v2/ThreadLaunchService.ts";
import * as ThreadManagementService from "../../orchestration-v2/ThreadManagementService.ts";
import * as ProviderRegistry from "../../provider/ProviderRegistry.ts";
import * as AlloyStore from "./AlloyStore.ts";
import {
  applyRoadmap,
  buildCompPrompt,
  buildOrchestratorBrief,
  buildPlanningBrief,
  computeScores,
  goalStatusAfterDecision,
  lessonsForGoal,
  reportProgress as applyProgressReport,
  type ProgressReport,
  routeModel,
  toAlloyAccount,
  toRoutingAccount,
  titleFromBrief,
} from "./domain.ts";

type Failure = AlloyError | AlloyStore.AlloyStoreError;

const BEN = "Ben";
const ALLOY = "Alloy";
const RECENT_DECISIONS = 10;
/** Launched and messaged on Ben's behalf from an Alloy screen. */
const ORIGIN = { createdBy: "user", creationSource: "server" } as const;

const fail = (message: string) => Effect.fail(new AlloyError({ message }));

export interface AgentReport {
  readonly goalId: AlloyGoalId;
  readonly author: string;
}

export class AlloyService extends Context.Service<
  AlloyService,
  {
    readonly snapshot: Effect.Effect<AlloySnapshot, Failure>;
    readonly command: (command: AlloyCommand) => Effect.Effect<AlloyCommandResult, Failure>;
    /** The goal a thread orchestrates, directly or as a worker its orchestrator delegated to. */
    readonly goalForThread: (threadId: ThreadId) => Effect.Effect<AlloyGoal, Failure>;
    readonly goalContext: (goalId: AlloyGoalId) => Effect.Effect<string, Failure>;
    readonly proposeRoadmap: (
      input: AgentReport & {
        readonly title: string;
        readonly rationale: string;
        readonly milestones: ReadonlyArray<AlloyRoadmapItem>;
      },
    ) => Effect.Effect<AlloyProposalId, Failure>;
    /** Sets the title and vision while the goal is still being planned. */
    readonly defineGoal: (
      input: AgentReport & { readonly title: string; readonly vision: string },
    ) => Effect.Effect<void, Failure>;
    readonly proposeVision: (
      input: AgentReport & {
        readonly title: string;
        readonly rationale: string;
        readonly vision: string;
      },
    ) => Effect.Effect<AlloyProposalId, Failure>;
    readonly logIdea: (
      input: AgentReport & { readonly title: string; readonly rationale: string },
    ) => Effect.Effect<AlloyProposalId, Failure>;
    readonly reportProgress: (
      input: AgentReport & ProgressReport,
    ) => Effect.Effect<string, Failure>;
    readonly recordLesson: (
      input: AgentReport & {
        readonly text: string;
        readonly scope: "goal" | "company" | "global";
      },
    ) => Effect.Effect<AlloyLessonId, Failure>;
  }
>()("t3/fork/alloy/AlloyService") {}

const make = Effect.gen(function* () {
  const store = yield* AlloyStore.AlloyStore;
  const launcher = yield* ThreadLaunchService.ThreadLaunchService;
  const threads = yield* ThreadManagementService.ThreadManagementService;
  const providers = yield* ProviderRegistry.ProviderRegistry;
  const random = yield* SecureRandom.SecureRandom;

  const uuid = random.uuidV4();
  const nowIso = DateTime.now.pipe(Effect.map(DateTime.formatIso));

  const requireGoal = Effect.fn("AlloyService.requireGoal")(function* (goalId: AlloyGoalId) {
    const goal = yield* store.goal(goalId);
    return goal ?? (yield* fail("That goal no longer exists."));
  });

  const requireCompany = Effect.fn("AlloyService.requireCompany")(function* (
    companyId: AlloyCompanyId,
  ) {
    const company = yield* store.company(companyId);
    return company ?? (yield* fail("That company no longer exists."));
  });

  const addActivity = Effect.fn("AlloyService.addActivity")(function* (
    goalId: AlloyGoalId,
    author: string,
    text: string,
  ) {
    const activity: AlloyActivity = { id: yield* uuid, goalId, at: yield* nowIso, author, text };
    yield* store.addActivity(activity);
  });

  const routingAccounts = providers.getProviders.pipe(
    Effect.map((list) => list.map(toRoutingAccount)),
  );

  const brief = Effect.fn("AlloyService.brief")(function* (goal: AlloyGoal) {
    const company = yield* requireCompany(goal.companyId);
    const [milestones, proposals, lessons] = yield* Effect.all([
      store.milestones(goal.id),
      store.proposals(goal.id),
      store.lessons,
    ]);
    return buildOrchestratorBrief({
      company,
      goal,
      milestones,
      lessons: lessonsForGoal(lessons, goal),
      recentDecisions: proposals
        .filter((proposal) => proposal.decidedAt !== null)
        .toSorted((left, right) => (right.decidedAt ?? "").localeCompare(left.decidedAt ?? ""))
        .slice(0, RECENT_DECISIONS),
      pendingProposals: proposals.filter((proposal) => proposal.status === "pending"),
    });
  });

  /** Messages go to the thread's current project; a thread can move between projects. */
  const sendToOrchestrator = Effect.fn("AlloyService.sendToOrchestrator")(function* (
    goal: AlloyGoal,
    text: string,
  ) {
    if (goal.orchestrator === null) return yield* fail("This goal has no orchestrator yet.");
    const threadId = goal.orchestrator.threadId;
    const shell = yield* threads.getThreadShell(threadId).pipe(Effect.orElseSucceed(() => null));
    if (shell !== null && shell.deletedAt !== null) {
      return yield* fail("The orchestrator's thread was deleted. Start the goal again.");
    }
    const id = yield* uuid;
    yield* threads
      .sendToThread({
        projectId: shell?.projectId ?? goal.projectId,
        threadId,
        commandId: CommandId.make(`alloy:${id}`),
        messageId: MessageId.make(`alloy-message:${id}`),
        text,
        attachments: [],
        mode: "queue",
        ...ORIGIN,
      })
      .pipe(
        Effect.mapError(
          (error) =>
            new AlloyError({ message: `Could not message the orchestrator: ${error.message}` }),
        ),
      );
  });

  /** Best-effort: the change it reports is already saved, so a failed send only logs. */
  const notifyOrchestrator = (goal: AlloyGoal, text: string) =>
    goal.orchestrator === null
      ? Effect.void
      : sendToOrchestrator(goal, text).pipe(
          Effect.catchTags({
            AlloyError: (error) =>
              Effect.logWarning("Alloy could not notify an orchestrator", {
                goalId: goal.id,
                reason: error.message,
              }),
          }),
        );

  const saveGoal = Effect.fn("AlloyService.saveGoal")(function* (
    goal: AlloyGoal,
    changes: Partial<Pick<AlloyGoal, "status" | "orchestrator" | "title" | "vision">>,
  ) {
    const updated: AlloyGoal = { ...goal, ...changes, updatedAt: yield* nowIso };
    yield* store.saveGoal(updated);
    return updated;
  });

  /** `null` follows the company's ranking; an unroutable ranking fails with the reason. */
  const routeFor = Effect.fn("AlloyService.routeFor")(function* (
    company: AlloyCompany,
    model: AlloyModelChoice | null,
  ) {
    if (model !== null) return { choice: model, note: "Chosen by you." };
    const route = routeModel(
      company.modelRanking,
      yield* routingAccounts,
      DateTime.toEpochMillis(yield* DateTime.now),
    );
    return route._tag === "Unroutable" ? yield* fail(route.message) : route;
  });

  const launchOrchestrator = Effect.fn("AlloyService.launchOrchestrator")(function* (
    goal: AlloyGoal,
    route: { readonly choice: AlloyModelChoice; readonly note: string },
    text: string,
  ) {
    const startedAt = yield* nowIso;
    const id = yield* uuid;
    const launched = yield* launcher
      .launch({
        commandId: CommandId.make(`alloy:goal:${goal.id}:${id}`),
        projectId: goal.projectId,
        title: `Alloy · ${goal.title}`,
        modelSelection: { instanceId: route.choice.instanceId, model: route.choice.model },
        runtimeMode: "full-access",
        interactionMode: "default",
        workspaceStrategy: { type: "root" },
        initialMessage: {
          messageId: MessageId.make(`alloy-message:${id}`),
          text,
          attachments: [],
        },
        ...ORIGIN,
      })
      .pipe(
        Effect.mapError(
          (error) =>
            new AlloyError({ message: `Could not start the orchestrator: ${error.message}` }),
        ),
      );
    yield* saveGoal(goal, {
      orchestrator: {
        threadId: launched.threadId,
        model: route.choice,
        routingNote: route.note,
        startedAt,
      },
    });
    yield* addActivity(goal.id, ALLOY, `Started the orchestrator. ${route.note}`);
  });

  const startGoal = Effect.fn("AlloyService.startGoal")(function* (
    goalId: AlloyGoalId,
    model: AlloyModelChoice | null,
  ) {
    const goal = yield* requireGoal(goalId);
    if (goal.orchestrator !== null) {
      const running = yield* saveGoal(goal, { status: "running" });
      yield* sendToOrchestrator(
        running,
        `Resumed by Ben. Latest state:\n\n${yield* brief(running)}`,
      );
      yield* addActivity(goal.id, BEN, "Resumed the goal.");
      return;
    }
    const route = yield* routeFor(yield* requireCompany(goal.companyId), model);
    const running: AlloyGoal = { ...goal, status: "running" };
    yield* launchOrchestrator(running, route, yield* brief(running));
  });

  const createAgent = Effect.fn("AlloyService.createAgent")(function* (
    input: Extract<AlloyCommand, { readonly _tag: "createAgent" }>,
  ) {
    const company = yield* requireCompany(input.companyId);
    const route = yield* routeFor(company, input.model);
    const createdAt = yield* nowIso;
    const goal: AlloyGoal = {
      id: AlloyGoalId.make(yield* uuid),
      companyId: company.id,
      projectId: input.projectId,
      title: titleFromBrief(input.brief),
      vision: "",
      status: "draft",
      orchestrator: null,
      createdAt,
      updatedAt: createdAt,
    };
    yield* store.saveGoal(goal);
    yield* addActivity(goal.id, BEN, `Created the agent: ${input.brief}`);
    yield* launchOrchestrator(
      goal,
      route,
      buildPlanningBrief({
        company,
        goal,
        brief: input.brief,
        lessons: lessonsForGoal(yield* store.lessons, goal),
      }),
    );
    return goal.id;
  });

  const setGoalStatus = Effect.fn("AlloyService.setGoalStatus")(function* (
    goalId: AlloyGoalId,
    status: "running" | "paused" | "done",
  ) {
    const goal = yield* requireGoal(goalId);
    switch (status) {
      case "running":
        return yield* startGoal(goalId, null);
      case "paused": {
        const paused = yield* saveGoal(goal, { status });
        yield* addActivity(goal.id, BEN, "Paused the goal.");
        yield* notifyOrchestrator(
          paused,
          "Paused by Ben: finish or park current work, start nothing new.",
        );
        return;
      }
      case "done": {
        const done = yield* saveGoal(goal, { status });
        yield* addActivity(goal.id, BEN, "Marked the goal done.");
        yield* notifyOrchestrator(
          done,
          "Ben marked this goal done. Wrap up and start nothing new.",
        );
        return;
      }
    }
  });

  const decideProposal = Effect.fn("AlloyService.decideProposal")(function* (
    proposalId: AlloyProposalId,
    decision: "approved" | "rejected" | "noted",
    rawNote: string | null,
  ) {
    const proposal = yield* store.proposal(proposalId);
    if (proposal === null) return yield* fail("That proposal no longer exists.");
    if (proposal.status !== "pending")
      return yield* fail(`This proposal is already ${proposal.status}.`);
    const goal = yield* requireGoal(proposal.goalId);
    const note = rawNote === null || rawNote.trim() === "" ? null : rawNote.trim();
    const decidedAt = yield* nowIso;
    const applyingRoadmap = decision === "approved" && proposal.body._tag === "roadmap";
    const newVision =
      decision === "approved" && proposal.body._tag === "vision" ? proposal.body.vision : null;
    const status = goalStatusAfterDecision(goal.status, decision, proposal.body);
    const existing = applyingRoadmap ? yield* store.milestones(goal.id) : [];
    const lessonId = AlloyLessonId.make(yield* uuid);
    const suffix = note === null ? "" : `: ${note}`;

    yield* store.transaction(
      Effect.gen(function* () {
        yield* store.saveProposal({ ...proposal, status: decision, decisionNote: note, decidedAt });
        if (applyingRoadmap && proposal.body._tag === "roadmap") {
          yield* store.replaceMilestones(
            goal.id,
            applyRoadmap(goal.id, existing, proposal.body.milestones, (position) =>
              AlloyMilestoneId.make(`${proposal.id}-${position}`),
            ),
          );
        }
        if (newVision !== null || status !== goal.status) {
          yield* saveGoal(goal, { status, vision: newVision ?? goal.vision });
        }
        if (status !== goal.status) {
          yield* addActivity(goal.id, ALLOY, "Planning is done. The agent starts work.");
        }
        if (decision === "rejected") {
          yield* store.saveLesson({
            id: lessonId,
            scope: { _tag: "goal", goalId: goal.id },
            text: `Ben rejected "${proposal.title}"${suffix}`,
            source: "Rejected proposal",
            author: BEN,
            active: true,
            createdAt: decidedAt,
          });
        }
        yield* addActivity(goal.id, BEN, `${decisionVerb[decision]} "${proposal.title}"${suffix}`);
      }),
    );
    yield* notifyOrchestrator(
      goal,
      [
        `Ben ${decision} your ${proposalNoun[proposal.body._tag]} "${proposal.title}".`,
        ...(note === null ? [] : [`Note: ${note}`]),
        ...(applyingRoadmap ? ["The roadmap is updated. Call `alloy_goal_context` for it."] : []),
        ...(newVision === null ? [] : ["The vision is updated. Call `alloy_goal_context` for it."]),
        ...(status === goal.status
          ? []
          : ["Planning is done and the goal is running. Begin work on the first milestone now."]),
        ...(decision === "rejected" ? ["This is now a lesson for the goal."] : []),
      ].join("\n"),
    );
  });

  const startComp = Effect.fn("AlloyService.startComp")(function* (
    command: Extract<AlloyCommand, { readonly _tag: "startComp" }>,
  ) {
    if (command.models.length === 0) return yield* fail("Pick at least one model for the comp.");
    const createdAt = yield* nowIso;
    const comp: AlloyComp = {
      id: AlloyCompId.make(yield* uuid),
      companyId: command.companyId,
      projectId: command.projectId,
      title: command.title,
      taskType: command.taskType,
      prompt: command.prompt,
      createdAt,
      entries: [],
    };
    const entries: Array<AlloyCompEntry> = [];
    for (const model of command.models) {
      entries.push({
        id: AlloyCompEntryId.make(yield* uuid),
        model,
        threadId: null,
        status: "running",
        startedAt: createdAt,
        durationMs: null,
        kept: null,
        error: null,
      });
    }
    yield* store.saveComp({ ...comp, entries });
    const shortId = comp.id.slice(0, 8);
    yield* Effect.forEach(
      entries,
      Effect.fnUntraced(function* (entry, index) {
        // Worktree launches in one repository run one at a time so git never races itself.
        const launched = yield* Effect.result(
          launcher.launch({
            commandId: CommandId.make(`alloy:comp:${entry.id}`),
            projectId: comp.projectId,
            title: `Comp · ${comp.title} · ${entry.model.model}`,
            modelSelection: { instanceId: entry.model.instanceId, model: entry.model.model },
            runtimeMode: "full-access",
            interactionMode: "default",
            workspaceStrategy: {
              type: "worktree",
              baseRef: "HEAD",
              branch: `alloy/comp-${shortId}-${index + 1}`,
              startFromOrigin: false,
            },
            initialMessage: {
              messageId: MessageId.make(`alloy-message:comp:${entry.id}`),
              text: buildCompPrompt(comp.prompt),
              attachments: [],
            },
            ...ORIGIN,
          }),
        );
        const startedAt = yield* nowIso;
        yield* store.saveCompEntry(
          comp.id,
          launched._tag === "Success"
            ? { ...entry, threadId: launched.success.threadId, startedAt }
            : { ...entry, status: "failed", error: launched.failure.message },
        );
      }),
      { discard: true },
    );
    return comp.id;
  });

  const keepCompEntry = Effect.fn("AlloyService.keepCompEntry")(function* (
    compId: AlloyCompId,
    entryId: AlloyCompEntryId,
  ) {
    const comp = yield* store.comp(compId);
    if (comp === null) return yield* fail("That comp no longer exists.");
    if (!comp.entries.some((entry) => entry.id === entryId)) {
      return yield* fail("That entry is not part of this comp.");
    }
    yield* store.transaction(
      Effect.forEach(
        comp.entries,
        (entry) => store.saveCompEntry(comp.id, { ...entry, kept: entry.id === entryId }),
        { discard: true },
      ),
    );
  });

  /** A running entry follows its thread's latest run; an entry still launching stays running. */
  const refreshEntry = Effect.fn("AlloyService.refreshEntry")(function* (entry: AlloyCompEntry) {
    if (entry.status !== "running" || entry.threadId === null) return entry;
    const shell = yield* threads
      .getThreadShell(entry.threadId)
      .pipe(Effect.orElseSucceed(() => undefined));
    if (shell === undefined) return entry;
    if (shell === null || shell.deletedAt !== null) {
      return { ...entry, status: "failed", error: "The comp thread was deleted." } as const;
    }
    const completedAt = shell.latestRunCompletedAt ?? null;
    if (shell.status === "completed" || (shell.status === "idle" && completedAt !== null)) {
      return {
        ...entry,
        status: "finished",
        durationMs:
          completedAt === null
            ? null
            : Math.max(0, DateTime.toEpochMillis(completedAt) - Date.parse(entry.startedAt)),
      } as const;
    }
    if (shell.status !== "idle" && ThreadManagementService.isTerminalRunStatus(shell.status)) {
      return {
        ...entry,
        status: "failed",
        error: shell.lastError ?? `The run ended as ${shell.status}.`,
      } as const;
    }
    return entry;
  });

  const refreshComps = Effect.fn("AlloyService.refreshComps")(function* (
    comps: ReadonlyArray<AlloyComp>,
  ) {
    return yield* Effect.forEach(comps, (comp) =>
      Effect.gen(function* () {
        if (!comp.entries.some((entry) => entry.status === "running")) return comp;
        const entries = yield* Effect.forEach(comp.entries, (entry) =>
          refreshEntry(entry).pipe(
            Effect.tap((next) =>
              next === entry ? Effect.void : store.saveCompEntry(comp.id, next),
            ),
          ),
        );
        return { ...comp, entries };
      }),
    );
  });

  const snapshot = Effect.gen(function* () {
    const [companies, goals, milestones, proposals, lessons, activity, storedComps, accounts] =
      yield* Effect.all([
        store.companies,
        store.goals,
        store.milestones(),
        store.proposals(),
        store.lessons,
        store.activity,
        store.comps,
        routingAccounts,
      ]);
    const comps = yield* refreshComps(storedComps);
    return {
      companies,
      goals,
      milestones,
      proposals,
      lessons,
      activity,
      comps,
      scores: computeScores(comps),
      accounts: accounts.map(toAlloyAccount),
    } satisfies AlloySnapshot;
  }).pipe(Effect.withSpan("AlloyService.snapshot"));

  const none = { id: null } satisfies AlloyCommandResult;
  const withId = (id: string): AlloyCommandResult => ({ id });

  const command = Effect.fn("AlloyService.command")(function* (input: AlloyCommand) {
    switch (input._tag) {
      case "createCompany": {
        const company: AlloyCompany = {
          id: AlloyCompanyId.make(yield* uuid),
          name: input.name,
          modelRanking: [],
          createdAt: yield* nowIso,
        };
        yield* store.saveCompany(company);
        return withId(company.id);
      }
      case "setCompanyRanking": {
        const company = yield* requireCompany(input.companyId);
        yield* store.saveCompany({ ...company, modelRanking: input.modelRanking });
        return withId(company.id);
      }
      case "createGoal": {
        yield* requireCompany(input.companyId);
        const createdAt = yield* nowIso;
        const goal: AlloyGoal = {
          id: AlloyGoalId.make(yield* uuid),
          companyId: input.companyId,
          projectId: input.projectId,
          title: input.title,
          vision: input.vision,
          status: "draft",
          orchestrator: null,
          createdAt,
          updatedAt: createdAt,
        };
        yield* store.saveGoal(goal);
        yield* addActivity(goal.id, BEN, "Created the goal.");
        return withId(goal.id);
      }
      case "createAgent":
        return withId(yield* createAgent(input));
      case "updateGoal": {
        const goal = yield* requireGoal(input.goalId);
        yield* saveGoal(goal, { title: input.title, vision: input.vision });
        if (goal.vision !== input.vision) yield* addActivity(goal.id, BEN, "Updated the vision.");
        return withId(goal.id);
      }
      case "startGoal":
        yield* startGoal(input.goalId, input.model);
        return withId(input.goalId);
      case "setGoalStatus":
        yield* setGoalStatus(input.goalId, input.status);
        return withId(input.goalId);
      case "messageOrchestrator": {
        const goal = yield* requireGoal(input.goalId);
        yield* sendToOrchestrator(goal, `Message from Ben:\n${input.text}`);
        yield* addActivity(goal.id, BEN, input.text);
        return withId(goal.id);
      }
      case "decideProposal":
        yield* decideProposal(input.proposalId, input.decision, input.note);
        return withId(input.proposalId);
      case "addLesson": {
        const lesson: AlloyLesson = {
          id: AlloyLessonId.make(yield* uuid),
          scope: input.scope,
          text: input.text,
          source: "Added by Ben",
          author: BEN,
          active: true,
          createdAt: yield* nowIso,
        };
        yield* store.saveLesson(lesson);
        return withId(lesson.id);
      }
      case "setLessonActive": {
        const lesson = yield* store.lesson(input.lessonId);
        if (lesson === null) return yield* fail("That lesson no longer exists.");
        yield* store.saveLesson({ ...lesson, active: input.active });
        return withId(lesson.id);
      }
      case "deleteLesson":
        yield* store.deleteLesson(input.lessonId);
        return none;
      case "startComp":
        return withId(yield* startComp(input));
      case "keepCompEntry":
        yield* keepCompEntry(input.compId, input.entryId);
        return withId(input.entryId);
    }
  });

  const goalForThread = Effect.fn("AlloyService.goalForThread")(function* (threadId: ThreadId) {
    const goals = yield* store.goals;
    const orchestrating = (id: ThreadId | null | undefined) =>
      id === null || id === undefined
        ? undefined
        : goals.find((goal) => goal.orchestrator?.threadId === id);
    const direct = orchestrating(threadId);
    if (direct !== undefined) return direct;
    const shell = yield* threads.getThreadShell(threadId).pipe(Effect.orElseSucceed(() => null));
    const inherited =
      orchestrating(shell?.lineage.parentThreadId) ?? orchestrating(shell?.lineage.rootThreadId);
    return (
      inherited ??
      (yield* fail("This thread is not an Alloy orchestrator or one of its workers. Pass goalId."))
    );
  });

  const propose = Effect.fn("AlloyService.propose")(function* (
    input: AgentReport & { readonly title: string; readonly rationale: string },
    body: AlloyProposalBody,
  ) {
    const goal = yield* requireGoal(input.goalId);
    const title = input.title.trim();
    if (title === "") return yield* fail("Give the proposal a title.");
    const proposal: AlloyProposal = {
      id: AlloyProposalId.make(yield* uuid),
      goalId: goal.id,
      title,
      rationale: input.rationale,
      body,
      status: "pending",
      decisionNote: null,
      author: input.author,
      createdAt: yield* nowIso,
      decidedAt: null,
    };
    yield* store.saveProposal(proposal);
    yield* addActivity(goal.id, input.author, `Proposed ${proposalArticle[body._tag]}: "${title}"`);
    return proposal.id;
  });

  const reportProgress = Effect.fn("AlloyService.reportProgress")(function* (
    input: AgentReport & ProgressReport,
  ) {
    const goal = yield* requireGoal(input.goalId);
    const result = applyProgressReport(yield* store.milestones(goal.id), input);
    if (result._tag === "Rejected") return yield* fail(result.message);
    yield* store.transaction(
      Effect.andThen(
        store.replaceMilestones(goal.id, result.milestones),
        addActivity(goal.id, input.author, result.summary),
      ),
    );
    return result.summary;
  });

  const recordLesson = Effect.fn("AlloyService.recordLesson")(function* (
    input: AgentReport & { readonly text: string; readonly scope: "goal" | "company" | "global" },
  ) {
    const goal = yield* requireGoal(input.goalId);
    const text = input.text.trim();
    if (text === "") return yield* fail("A lesson needs text.");
    const scope: AlloyLessonScope =
      input.scope === "global"
        ? { _tag: "global" }
        : input.scope === "company"
          ? { _tag: "company", companyId: goal.companyId }
          : { _tag: "goal", goalId: goal.id };
    const lesson: AlloyLesson = {
      id: AlloyLessonId.make(yield* uuid),
      scope,
      text,
      source: `Agent on "${goal.title}"`,
      author: input.author,
      active: true,
      createdAt: yield* nowIso,
    };
    yield* store.saveLesson(lesson);
    yield* addActivity(goal.id, input.author, `Recorded a lesson: ${text}`);
    return lesson.id;
  });

  return AlloyService.of({
    snapshot,
    command,
    goalForThread,
    goalContext: Effect.fn("AlloyService.goalContext")(function* (goalId) {
      return yield* brief(yield* requireGoal(goalId));
    }),
    proposeRoadmap: Effect.fn("AlloyService.proposeRoadmap")(function* ({ milestones, ...input }) {
      if (milestones.length === 0) {
        return yield* fail("A roadmap proposal needs at least one milestone.");
      }
      return yield* propose(input, { _tag: "roadmap", milestones });
    }),
    defineGoal: Effect.fn("AlloyService.defineGoal")(function* (input) {
      const goal = yield* requireGoal(input.goalId);
      if (goal.status !== "draft") {
        return yield* fail(
          "This goal is past planning, so its vision is Ben's to change. Propose a new one with `alloy_propose_vision`.",
        );
      }
      const title = input.title.trim();
      const vision = input.vision.trim();
      if (title === "" || vision === "") return yield* fail("Pass both a title and a vision.");
      yield* saveGoal(goal, { title, vision });
      yield* addActivity(goal.id, input.author, `Defined the goal: "${title}"`);
    }),
    proposeVision: Effect.fn("AlloyService.proposeVision")(function* ({ vision, ...input }) {
      if (vision.trim() === "") return yield* fail("A vision proposal needs the new vision.");
      return yield* propose(input, { _tag: "vision", vision: vision.trim() });
    }),
    logIdea: Effect.fn("AlloyService.logIdea")(function* (input) {
      return yield* propose(input, { _tag: "idea" });
    }),
    reportProgress,
    recordLesson,
  });
});

const decisionVerb = { approved: "Approved", rejected: "Rejected", noted: "Noted" } as const;

const proposalNoun = {
  roadmap: "roadmap proposal",
  idea: "idea",
  vision: "vision proposal",
} as const satisfies Record<AlloyProposalBody["_tag"], string>;

const proposalArticle = {
  roadmap: "a roadmap",
  idea: "an idea",
  vision: "a new vision",
} as const satisfies Record<AlloyProposalBody["_tag"], string>;

export const layer = Layer.effect(AlloyService, make).pipe(Layer.provide(AlloyStore.layer));
