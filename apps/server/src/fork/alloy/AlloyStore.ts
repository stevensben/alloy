import {
  AlloyActivity,
  AlloyComp,
  AlloyCompEntry,
  type AlloyCompId,
  AlloyCompany,
  type AlloyCompanyId,
  AlloyGoal,
  type AlloyGoalId,
  AlloyLesson,
  type AlloyLessonId,
  AlloyLessonScope,
  AlloyMilestone,
  AlloyModelChoice,
  AlloyOrchestrator,
  AlloyProgress,
  AlloyProposal,
  AlloyProposalBody,
  type AlloyProposalId,
} from "@t3tools/contracts/alloy";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Migrator from "effect/sql/Migrator";
import * as SqlClient from "effect/sql/SqlClient";
import * as SqlError from "effect/sql/SqlError";
import * as SqlSchema from "effect/sql/SqlSchema";

export class AlloyStoreError extends Schema.TaggedError<AlloyStoreError>()("AlloyStoreError", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Alloy could not ${this.operation}.`;
  }
}

/** Recent activity kept per goal in a snapshot. */
const ACTIVITY_PER_GOAL = 300;

const migrations = {
  "1_AlloyCore": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      CREATE TABLE IF NOT EXISTS alloy_companies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        model_ranking TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `;
    yield* sql`
      CREATE TABLE IF NOT EXISTS alloy_goals (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        vision TEXT NOT NULL,
        status TEXT NOT NULL,
        orchestrator TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `;
    yield* sql`
      CREATE TABLE IF NOT EXISTS alloy_milestones (
        id TEXT PRIMARY KEY,
        goal_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        title TEXT NOT NULL,
        done_when TEXT NOT NULL,
        status TEXT NOT NULL,
        progress TEXT,
        note TEXT
      )
    `;
    yield* sql`CREATE INDEX IF NOT EXISTS alloy_milestones_goal ON alloy_milestones (goal_id, position)`;
    yield* sql`
      CREATE TABLE IF NOT EXISTS alloy_proposals (
        id TEXT PRIMARY KEY,
        goal_id TEXT NOT NULL,
        title TEXT NOT NULL,
        rationale TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL,
        decision_note TEXT,
        author TEXT NOT NULL,
        created_at TEXT NOT NULL,
        decided_at TEXT
      )
    `;
    yield* sql`CREATE INDEX IF NOT EXISTS alloy_proposals_goal ON alloy_proposals (goal_id, created_at)`;
    yield* sql`
      CREATE TABLE IF NOT EXISTS alloy_lessons (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        text TEXT NOT NULL,
        source TEXT NOT NULL,
        author TEXT NOT NULL,
        active INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )
    `;
    yield* sql`
      CREATE TABLE IF NOT EXISTS alloy_activity (
        id TEXT PRIMARY KEY,
        goal_id TEXT NOT NULL,
        at TEXT NOT NULL,
        author TEXT NOT NULL,
        text TEXT NOT NULL
      )
    `;
    yield* sql`CREATE INDEX IF NOT EXISTS alloy_activity_goal ON alloy_activity (goal_id, at)`;
    yield* sql`
      CREATE TABLE IF NOT EXISTS alloy_comps (
        id TEXT PRIMARY KEY,
        company_id TEXT,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        task_type TEXT NOT NULL,
        prompt TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `;
    yield* sql`
      CREATE TABLE IF NOT EXISTS alloy_comp_entries (
        id TEXT PRIMARY KEY,
        comp_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        model TEXT NOT NULL,
        thread_id TEXT,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        duration_ms INTEGER,
        kept INTEGER,
        error TEXT
      )
    `;
    yield* sql`CREATE INDEX IF NOT EXISTS alloy_comp_entries_comp ON alloy_comp_entries (comp_id, position)`;
  }),
};

/** A ledger of its own, so upstream's migration ids never collide with Alloy's. */
export const runMigrations = Migrator.make({})({
  loader: Migrator.fromRecord(migrations),
  table: "alloy_migrations",
});

const CompanyRow = Schema.Struct({
  ...AlloyCompany.fields,
  modelRanking: Schema.fromJsonString(Schema.Array(AlloyModelChoice)),
});
const GoalRow = Schema.Struct({
  ...AlloyGoal.fields,
  orchestrator: Schema.NullOr(Schema.fromJsonString(AlloyOrchestrator)),
});
const MilestoneRow = Schema.Struct({
  ...AlloyMilestone.fields,
  progress: Schema.NullOr(Schema.fromJsonString(AlloyProgress)),
});
const ProposalRow = Schema.Struct({
  ...AlloyProposal.fields,
  body: Schema.fromJsonString(AlloyProposalBody),
});
const LessonRow = Schema.Struct({
  ...AlloyLesson.fields,
  scope: Schema.fromJsonString(AlloyLessonScope),
  active: Schema.BooleanFromBit,
});
const { entries: _entries, ...compFields } = AlloyComp.fields;
const CompRow = Schema.Struct(compFields);
const CompEntryRow = Schema.Struct({
  ...AlloyCompEntry.fields,
  compId: Schema.String,
  model: Schema.fromJsonString(AlloyModelChoice),
  kept: Schema.NullOr(Schema.BooleanFromBit),
});

const json = (value: unknown) => JSON.stringify(value);
const bit = (value: boolean) => (value ? 1 : 0);

export class AlloyStore extends Context.Service<
  AlloyStore,
  {
    /** Runs `effect` in one SQLite transaction. Keep thread messaging outside it. */
    readonly transaction: <A, E, R>(
      effect: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | AlloyStoreError, R>;
    readonly companies: Effect.Effect<ReadonlyArray<AlloyCompany>, AlloyStoreError>;
    readonly company: (id: AlloyCompanyId) => Effect.Effect<AlloyCompany | null, AlloyStoreError>;
    readonly saveCompany: (company: AlloyCompany) => Effect.Effect<void, AlloyStoreError>;
    readonly goals: Effect.Effect<ReadonlyArray<AlloyGoal>, AlloyStoreError>;
    readonly goal: (id: AlloyGoalId) => Effect.Effect<AlloyGoal | null, AlloyStoreError>;
    readonly saveGoal: (goal: AlloyGoal) => Effect.Effect<void, AlloyStoreError>;
    /** Ordered by goal, then position. */
    readonly milestones: (
      goalId?: AlloyGoalId,
    ) => Effect.Effect<ReadonlyArray<AlloyMilestone>, AlloyStoreError>;
    readonly replaceMilestones: (
      goalId: AlloyGoalId,
      milestones: ReadonlyArray<AlloyMilestone>,
    ) => Effect.Effect<void, AlloyStoreError>;
    /** Newest first. */
    readonly proposals: (
      goalId?: AlloyGoalId,
    ) => Effect.Effect<ReadonlyArray<AlloyProposal>, AlloyStoreError>;
    readonly proposal: (
      id: AlloyProposalId,
    ) => Effect.Effect<AlloyProposal | null, AlloyStoreError>;
    readonly saveProposal: (proposal: AlloyProposal) => Effect.Effect<void, AlloyStoreError>;
    readonly lessons: Effect.Effect<ReadonlyArray<AlloyLesson>, AlloyStoreError>;
    readonly lesson: (id: AlloyLessonId) => Effect.Effect<AlloyLesson | null, AlloyStoreError>;
    readonly saveLesson: (lesson: AlloyLesson) => Effect.Effect<void, AlloyStoreError>;
    readonly deleteLesson: (id: AlloyLessonId) => Effect.Effect<void, AlloyStoreError>;
    /** The newest `ACTIVITY_PER_GOAL` entries of each goal, oldest first. */
    readonly activity: Effect.Effect<ReadonlyArray<AlloyActivity>, AlloyStoreError>;
    readonly addActivity: (activity: AlloyActivity) => Effect.Effect<void, AlloyStoreError>;
    /** Newest first. */
    readonly comps: Effect.Effect<ReadonlyArray<AlloyComp>, AlloyStoreError>;
    readonly comp: (id: AlloyCompId) => Effect.Effect<AlloyComp | null, AlloyStoreError>;
    readonly saveComp: (comp: AlloyComp) => Effect.Effect<void, AlloyStoreError>;
    readonly saveCompEntry: (
      compId: AlloyCompId,
      entry: AlloyCompEntry,
    ) => Effect.Effect<void, AlloyStoreError>;
  }
>()("t3/fork/alloy/AlloyStore") {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const failAs =
    (operation: string) =>
    <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.mapError(effect, (cause) => new AlloyStoreError({ operation, cause }));
  yield* runMigrations.pipe(failAs("create its tables"));

  const selectCompanies = SqlSchema.findAll({
    Request: Schema.NullOr(Schema.String),
    Result: CompanyRow,
    execute: (id) => sql`
      SELECT id, name, model_ranking AS "modelRanking", created_at AS "createdAt"
      FROM alloy_companies
      WHERE ${id === null ? sql`1 = 1` : sql`id = ${id}`}
      ORDER BY created_at
    `,
  });

  const selectGoals = SqlSchema.findAll({
    Request: Schema.NullOr(Schema.String),
    Result: GoalRow,
    execute: (id) => sql`
      SELECT id, company_id AS "companyId", project_id AS "projectId", title, vision, status,
        orchestrator, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM alloy_goals
      WHERE ${id === null ? sql`1 = 1` : sql`id = ${id}`}
      ORDER BY created_at
    `,
  });

  const selectMilestones = SqlSchema.findAll({
    Request: Schema.NullOr(Schema.String),
    Result: MilestoneRow,
    execute: (goalId) => sql`
      SELECT id, goal_id AS "goalId", position, title, done_when AS "doneWhen", status, progress, note
      FROM alloy_milestones
      WHERE ${goalId === null ? sql`1 = 1` : sql`goal_id = ${goalId}`}
      ORDER BY goal_id, position
    `,
  });

  const selectProposals = SqlSchema.findAll({
    Request: Schema.Struct({
      id: Schema.NullOr(Schema.String),
      goalId: Schema.NullOr(Schema.String),
    }),
    Result: ProposalRow,
    execute: ({ id, goalId }) => sql`
      SELECT id, goal_id AS "goalId", title, rationale, body, status,
        decision_note AS "decisionNote", author, created_at AS "createdAt", decided_at AS "decidedAt"
      FROM alloy_proposals
      WHERE ${id === null ? sql`1 = 1` : sql`id = ${id}`}
        AND ${goalId === null ? sql`1 = 1` : sql`goal_id = ${goalId}`}
      ORDER BY created_at DESC
    `,
  });

  const selectLessons = SqlSchema.findAll({
    Request: Schema.NullOr(Schema.String),
    Result: LessonRow,
    execute: (id) => sql`
      SELECT id, scope, text, source, author, active, created_at AS "createdAt"
      FROM alloy_lessons
      WHERE ${id === null ? sql`1 = 1` : sql`id = ${id}`}
      ORDER BY created_at
    `,
  });

  const selectActivity = SqlSchema.findAll({
    Request: Schema.Void,
    Result: AlloyActivity,
    execute: () => sql`
      SELECT id, goal_id AS "goalId", at, author, text FROM (
        SELECT *, rowid AS seq,
          ROW_NUMBER() OVER (PARTITION BY goal_id ORDER BY at DESC, rowid DESC) AS rank
        FROM alloy_activity
      )
      WHERE rank <= ${ACTIVITY_PER_GOAL}
      ORDER BY at, seq
    `,
  });

  const selectComps = SqlSchema.findAll({
    Request: Schema.NullOr(Schema.String),
    Result: CompRow,
    execute: (id) => sql`
      SELECT id, company_id AS "companyId", project_id AS "projectId", title,
        task_type AS "taskType", prompt, created_at AS "createdAt"
      FROM alloy_comps
      WHERE ${id === null ? sql`1 = 1` : sql`id = ${id}`}
      ORDER BY created_at DESC
    `,
  });

  const selectCompEntries = SqlSchema.findAll({
    Request: Schema.NullOr(Schema.String),
    Result: CompEntryRow,
    execute: (compId) => sql`
      SELECT id, comp_id AS "compId", model, thread_id AS "threadId", status,
        started_at AS "startedAt", duration_ms AS "durationMs", kept, error
      FROM alloy_comp_entries
      WHERE ${compId === null ? sql`1 = 1` : sql`comp_id = ${compId}`}
      ORDER BY comp_id, position
    `,
  });

  const loadComps = (id: string | null) =>
    Effect.all([selectComps(id), selectCompEntries(id)]).pipe(
      Effect.map(([comps, entries]) =>
        comps.map((comp): AlloyComp => ({
          ...comp,
          entries: entries
            .filter((entry) => entry.compId === comp.id)
            .map(({ compId: _compId, ...entry }) => entry),
        })),
      ),
    );

  const upsertCompEntry = (compId: AlloyCompId, position: number, entry: AlloyCompEntry) => sql`
    INSERT INTO alloy_comp_entries
      (id, comp_id, position, model, thread_id, status, started_at, duration_ms, kept, error)
    VALUES (${entry.id}, ${compId}, ${position}, ${json(entry.model)}, ${entry.threadId},
      ${entry.status}, ${entry.startedAt}, ${entry.durationMs},
      ${entry.kept === null ? null : bit(entry.kept)}, ${entry.error})
    ON CONFLICT (id) DO UPDATE SET
      thread_id = excluded.thread_id, status = excluded.status, duration_ms = excluded.duration_ms,
      kept = excluded.kept, error = excluded.error
  `;

  const first = <A>(rows: ReadonlyArray<A>) => rows[0] ?? null;

  return AlloyStore.of({
    transaction: Effect.fn("AlloyStore.transaction")(function* <A, E, R>(
      effect: Effect.Effect<A, E, R>,
    ) {
      return yield* sql
        .withTransaction(effect)
        .pipe(
          Effect.catchIf(SqlError.isSqlError, (cause) =>
            Effect.fail(new AlloyStoreError({ operation: "save changes", cause })),
          ),
        );
    }),
    companies: selectCompanies(null).pipe(failAs("read companies")),
    company: Effect.fn("AlloyStore.company")(function* (id) {
      return first(yield* selectCompanies(id));
    }, failAs("read a company")),
    saveCompany: Effect.fn("AlloyStore.saveCompany")(function* (company) {
      yield* sql`
        INSERT INTO alloy_companies (id, name, model_ranking, created_at)
        VALUES (${company.id}, ${company.name}, ${json(company.modelRanking)}, ${company.createdAt})
        ON CONFLICT (id) DO UPDATE SET name = excluded.name, model_ranking = excluded.model_ranking
      `;
    }, failAs("save a company")),
    goals: selectGoals(null).pipe(failAs("read goals")),
    goal: Effect.fn("AlloyStore.goal")(function* (id) {
      return first(yield* selectGoals(id));
    }, failAs("read a goal")),
    saveGoal: Effect.fn("AlloyStore.saveGoal")(function* (goal) {
      yield* sql`
        INSERT INTO alloy_goals
          (id, company_id, project_id, title, vision, status, orchestrator, created_at, updated_at)
        VALUES (${goal.id}, ${goal.companyId}, ${goal.projectId}, ${goal.title}, ${goal.vision},
          ${goal.status}, ${goal.orchestrator === null ? null : json(goal.orchestrator)},
          ${goal.createdAt}, ${goal.updatedAt})
        ON CONFLICT (id) DO UPDATE SET
          title = excluded.title, vision = excluded.vision, status = excluded.status,
          orchestrator = excluded.orchestrator, updated_at = excluded.updated_at
      `;
    }, failAs("save a goal")),
    milestones: Effect.fn("AlloyStore.milestones")(function* (goalId) {
      return yield* selectMilestones(goalId ?? null);
    }, failAs("read milestones")),
    replaceMilestones: Effect.fn("AlloyStore.replaceMilestones")(function* (goalId, milestones) {
      yield* sql.withTransaction(
        Effect.gen(function* () {
          yield* sql`DELETE FROM alloy_milestones WHERE goal_id = ${goalId}`;
          for (const milestone of milestones) {
            yield* sql`
              INSERT INTO alloy_milestones
                (id, goal_id, position, title, done_when, status, progress, note)
              VALUES (${milestone.id}, ${goalId}, ${milestone.position}, ${milestone.title},
                ${milestone.doneWhen}, ${milestone.status},
                ${milestone.progress === null ? null : json(milestone.progress)}, ${milestone.note})
            `;
          }
        }),
      );
    }, failAs("save the roadmap")),
    proposals: Effect.fn("AlloyStore.proposals")(function* (goalId) {
      return yield* selectProposals({ id: null, goalId: goalId ?? null });
    }, failAs("read proposals")),
    proposal: Effect.fn("AlloyStore.proposal")(function* (id) {
      return first(yield* selectProposals({ id, goalId: null }));
    }, failAs("read a proposal")),
    saveProposal: Effect.fn("AlloyStore.saveProposal")(function* (proposal) {
      yield* sql`
        INSERT INTO alloy_proposals
          (id, goal_id, title, rationale, body, status, decision_note, author, created_at, decided_at)
        VALUES (${proposal.id}, ${proposal.goalId}, ${proposal.title}, ${proposal.rationale},
          ${json(proposal.body)}, ${proposal.status}, ${proposal.decisionNote}, ${proposal.author},
          ${proposal.createdAt}, ${proposal.decidedAt})
        ON CONFLICT (id) DO UPDATE SET
          status = excluded.status, decision_note = excluded.decision_note,
          decided_at = excluded.decided_at
      `;
    }, failAs("save a proposal")),
    lessons: selectLessons(null).pipe(failAs("read lessons")),
    lesson: Effect.fn("AlloyStore.lesson")(function* (id) {
      return first(yield* selectLessons(id));
    }, failAs("read a lesson")),
    saveLesson: Effect.fn("AlloyStore.saveLesson")(function* (lesson) {
      yield* sql`
        INSERT INTO alloy_lessons (id, scope, text, source, author, active, created_at)
        VALUES (${lesson.id}, ${json(lesson.scope)}, ${lesson.text}, ${lesson.source},
          ${lesson.author}, ${bit(lesson.active)}, ${lesson.createdAt})
        ON CONFLICT (id) DO UPDATE SET text = excluded.text, active = excluded.active
      `;
    }, failAs("save a lesson")),
    deleteLesson: Effect.fn("AlloyStore.deleteLesson")(function* (id) {
      yield* sql`DELETE FROM alloy_lessons WHERE id = ${id}`;
    }, failAs("delete a lesson")),
    activity: selectActivity(undefined).pipe(failAs("read activity")),
    addActivity: Effect.fn("AlloyStore.addActivity")(function* (activity) {
      yield* sql`
        INSERT INTO alloy_activity (id, goal_id, at, author, text)
        VALUES (${activity.id}, ${activity.goalId}, ${activity.at}, ${activity.author}, ${activity.text})
      `;
    }, failAs("record activity")),
    comps: loadComps(null).pipe(failAs("read comps")),
    comp: Effect.fn("AlloyStore.comp")(function* (id) {
      return first(yield* loadComps(id));
    }, failAs("read a comp")),
    saveComp: Effect.fn("AlloyStore.saveComp")(function* (comp) {
      yield* sql.withTransaction(
        Effect.gen(function* () {
          yield* sql`
            INSERT INTO alloy_comps (id, company_id, project_id, title, task_type, prompt, created_at)
            VALUES (${comp.id}, ${comp.companyId}, ${comp.projectId}, ${comp.title},
              ${comp.taskType}, ${comp.prompt}, ${comp.createdAt})
            ON CONFLICT (id) DO NOTHING
          `;
          for (const [position, entry] of comp.entries.entries()) {
            yield* upsertCompEntry(comp.id, position, entry);
          }
        }),
      );
    }, failAs("save a comp")),
    saveCompEntry: Effect.fn("AlloyStore.saveCompEntry")(function* (compId, entry) {
      yield* sql`
        UPDATE alloy_comp_entries SET
          thread_id = ${entry.threadId}, status = ${entry.status}, duration_ms = ${entry.durationMs},
          kept = ${entry.kept === null ? null : bit(entry.kept)}, error = ${entry.error}
        WHERE id = ${entry.id} AND comp_id = ${compId}
      `;
    }, failAs("save a comp entry")),
  });
});

export const layer = Layer.effect(AlloyStore, make);
