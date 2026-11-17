import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { assert, it } from "@effect/vitest";
import {
  type OrchestrationV2ThreadShell,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
  ThreadId,
} from "@t3tools/contracts";
import type { AlloyCommand, AlloyModelChoice } from "@t3tools/contracts/alloy";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";

import * as ThreadLaunchService from "../../orchestration-v2/ThreadLaunchService.ts";
import * as ThreadManagementService from "../../orchestration-v2/ThreadManagementService.ts";
import * as ProviderRegistry from "../../provider/ProviderRegistry.ts";
import * as AlloyService from "./AlloyService.ts";
import * as AlloyStore from "./AlloyStore.ts";

const projectId = ProjectId.make("project");
const orchestratorThread = ThreadId.make("thread-orchestrator");
const workerThread = ThreadId.make("thread-worker");
const opus: AlloyModelChoice = { instanceId: ProviderInstanceId.make("work"), model: "opus" };
const gpt: AlloyModelChoice = { instanceId: ProviderInstanceId.make("codex"), model: "gpt" };

const provider: ServerProvider = {
  instanceId: opus.instanceId,
  displayName: "Work Max",
  driver: ProviderDriverKind.make("claudeAgent"),
  enabled: true,
  installed: true,
  version: "1.0.0",
  status: "ready",
  auth: { status: "authenticated" },
  checkedAt: "2026-11-17T00:00:00.000Z",
  models: [{ slug: "opus", name: "Opus", isCustom: false, capabilities: null }],
  slashCommands: [],
  skills: [],
  usageLimits: {
    checkedAt: "2026-11-17T00:00:00.000Z",
    windows: [{ id: "weekly", kind: "weekly", label: "Weekly", usedPercent: 30 }],
  },
};

interface Harness {
  readonly launches: Array<ThreadLaunchService.ThreadLaunchInput>;
  readonly sent: Array<string>;
  readonly shells: Map<string, Partial<OrchestrationV2ThreadShell>>;
}

const makeLayer = (harness: Harness) =>
  AlloyService.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.mock(ThreadLaunchService.ThreadLaunchService)({
          launch: (input) =>
            Effect.suspend(() => {
              harness.launches.push(input);
              if (input.modelSelection.model === gpt.model) {
                return Effect.fail(
                  new ThreadLaunchService.ThreadLaunchError({
                    operation: "provision-worktree",
                    commandId: input.commandId,
                    projectId: input.projectId,
                    cause: new Error("no git"),
                  }),
                );
              }
              const threadId = input.title.startsWith("Alloy")
                ? orchestratorThread
                : ThreadId.make(input.commandId);
              return Effect.succeed({ threadId, projection: {} as never, resumed: false });
            }),
        }),
        Layer.mock(ThreadManagementService.ThreadManagementService)({
          getThreadShell: (threadId) =>
            Effect.sync(() => {
              const shell =
                harness.shells.get(threadId) ??
                (threadId.startsWith("alloy:comp:")
                  ? { status: "running" as const, deletedAt: null }
                  : undefined);
              return shell === undefined ? null : (shell as OrchestrationV2ThreadShell);
            }),
          sendToThread: (input) =>
            Effect.sync(() => {
              harness.sent.push(input.text);
              return {} as never;
            }),
        }),
        Layer.mock(ProviderRegistry.ProviderRegistry)({
          getProviders: Effect.succeed([provider]),
        }),
        NodeCrypto.layer,
      ),
    ),
    Layer.provideMerge(NodeSqliteClient.layer({ filename: ":memory:" })),
  );

const newHarness = (): Harness => ({ launches: [], sent: [], shells: new Map() });

const run = Effect.fn("test.run")(function* (command: AlloyCommand) {
  const alloy = yield* AlloyService.AlloyService;
  const result = yield* alloy.command(command);
  return result.id ?? "";
});

const harness = newHarness();

it.layer(makeLayer(harness))("AlloyService", (it) => {
  it.effect("routes, launches and steers an orchestrator through a roadmap", () =>
    Effect.gen(function* () {
      const alloy = yield* AlloyService.AlloyService;
      const companyId = (yield* run({ _tag: "createCompany", name: "Mastery" })) as never;
      yield* run({ _tag: "setCompanyRanking", companyId, modelRanking: [opus] });
      const goalId = (yield* run({
        _tag: "createGoal",
        companyId,
        projectId,
        title: "Ship scripts",
        vision: "Fifty scripts that pass.",
      })) as never;
      yield* run({ _tag: "startGoal", goalId, model: null });

      const launch = harness.launches[0];
      assert.strictEqual(launch?.title, "Alloy · Ship scripts");
      assert.deepStrictEqual(launch?.modelSelection, {
        instanceId: opus.instanceId,
        model: "opus",
      });
      assert.strictEqual(launch?.runtimeMode, "full-access");
      assert.include(launch?.initialMessage?.text ?? "", "Fifty scripts that pass.");
      assert.include(launch?.initialMessage?.text ?? "", "No roadmap yet.");

      harness.shells.set(orchestratorThread, {
        id: orchestratorThread,
        projectId,
        deletedAt: null,
      });
      harness.shells.set(workerThread, {
        id: workerThread,
        lineage: {
          parentThreadId: orchestratorThread,
          relationshipToParent: "subagent",
          rootThreadId: orchestratorThread,
        },
      });
      assert.strictEqual((yield* alloy.goalForThread(workerThread)).id, goalId);

      const roadmap = yield* alloy.proposeRoadmap({
        goalId,
        author: "opus",
        title: "First roadmap",
        rationale: "Start",
        milestones: [
          { title: "Write", doneWhen: "50 scripts exist" },
          { title: "Test", doneWhen: "50 pass" },
        ],
      });
      yield* run({ _tag: "decideProposal", proposalId: roadmap, decision: "approved", note: null });
      const approved = yield* alloy.snapshot;
      assert.deepStrictEqual(
        approved.milestones.map((milestone) => [milestone.title, milestone.status]),
        [
          ["Write", "current"],
          ["Test", "upcoming"],
        ],
      );
      assert.include(
        harness.sent.at(-1) ?? "",
        'Ben approved your roadmap proposal "First roadmap"',
      );

      const write = approved.milestones[0];
      yield* alloy.reportProgress({
        goalId,
        author: "opus",
        milestoneId: write?.id as never,
        done: 50,
        total: 50,
        status: "done",
      });
      const idea = yield* alloy.logIdea({ goalId, author: "opus", title: "Split", rationale: "" });
      yield* run({
        _tag: "decideProposal",
        proposalId: idea,
        decision: "rejected",
        note: "Not now",
      });
      yield* run({ _tag: "setGoalStatus", goalId, status: "paused" });

      const snapshot = yield* alloy.snapshot;
      assert.deepStrictEqual(
        snapshot.milestones.map((milestone) => [milestone.status, milestone.progress]),
        [
          ["done", { done: 50, total: 50 }],
          ["current", null],
        ],
      );
      assert.deepStrictEqual(
        snapshot.lessons.map((lesson) => [lesson.text, lesson.source]),
        [['Ben rejected "Split": Not now', "Rejected proposal"]],
      );
      const goal = snapshot.goals[0];
      assert.strictEqual(goal?.status, "paused");
      assert.strictEqual(goal?.orchestrator?.routingNote, "Opus on Work Max: 30% used.");
      assert.include(harness.sent.at(-1) ?? "", "Paused by Ben");
      assert.include(yield* alloy.goalContext(goalId), 'Ben rejected "Split": Not now');
      assert.deepStrictEqual(snapshot.accounts[0]?.usage, [
        { label: "Weekly", usedPercent: 30, resetsAt: null },
      ]);

      yield* run({ _tag: "setGoalStatus", goalId, status: "running" });
      assert.strictEqual(harness.launches.length, 1);
      assert.include(harness.sent.at(-1) ?? "", "Resumed by Ben. Latest state:");
    }),
  );

  it.effect("runs a comp, follows its threads and scores the kept entry", () =>
    Effect.gen(function* () {
      const alloy = yield* AlloyService.AlloyService;
      const compId = yield* run({
        _tag: "startComp",
        companyId: null,
        projectId,
        title: "Parser",
        taskType: "parsing",
        prompt: "Write the parser.",
        models: [opus, gpt],
      });
      const started = (yield* alloy.snapshot).comps.find((comp) => comp.id === compId);
      const [winner, failed] = started?.entries ?? [];
      assert.strictEqual(failed?.status, "failed");
      assert.include(failed?.error ?? "", "provision-worktree");
      assert.strictEqual(winner?.status, "running");
      const compLaunch = harness.launches.find((launch) => launch.title === "Comp · Parser · opus");
      assert.deepStrictEqual(compLaunch?.workspaceStrategy, {
        type: "worktree",
        baseRef: "HEAD",
        branch: `alloy/comp-${compId.slice(0, 8)}-1`,
        startFromOrigin: false,
      });
      assert.include(compLaunch?.initialMessage?.text ?? "", "independent attempt");

      harness.shells.set(winner?.threadId ?? "", {
        status: "completed",
        deletedAt: null,
        latestRunCompletedAt: DateTime.makeUnsafe(Date.parse(winner?.startedAt ?? "") + 90_000),
      });
      yield* run({ _tag: "keepCompEntry", compId: compId as never, entryId: winner?.id as never });

      const snapshot = yield* alloy.snapshot;
      const comp = snapshot.comps.find((candidate) => candidate.id === compId);
      assert.deepStrictEqual(
        comp?.entries.map((entry) => [entry.status, entry.durationMs, entry.kept]),
        [
          ["finished", 90_000, true],
          ["failed", null, false],
        ],
      );
      assert.deepStrictEqual(
        snapshot.scores.find((score) => score.model.model === "opus"),
        { taskType: "parsing", model: opus, runs: 1, decided: 1, kept: 1, avgDurationMs: 90_000 },
      );
    }),
  );

  it.effect("keeps its own migration ledger", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* AlloyStore.runMigrations;
      const ledger = yield* sql<{ readonly name: string }>`SELECT name FROM alloy_migrations`;
      assert.deepStrictEqual(
        ledger.map((row) => row.name),
        ["AlloyCore"],
      );
    }),
  );
});
