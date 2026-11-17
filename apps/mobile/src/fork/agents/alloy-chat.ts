import type {
  AlloyActivity,
  AlloyGoalId,
  AlloyProposal,
  AlloyProposalBody,
} from "@t3tools/contracts/alloy";

import type { ThreadFeedActivity, ThreadFeedMessage } from "../../lib/threadActivity";
import { compareTimestamps } from "../../lib/time";
import { isAlloyNote } from "./alloy-inbox";

/** The parts of T3's presented thread feed the chat reads. */
export type ChatFeedRow =
  | {
      readonly type: "message";
      readonly id: string;
      readonly createdAt: string;
      readonly message: Pick<ThreadFeedMessage, "id" | "role" | "text" | "streaming">;
      readonly pendingMessage?: object;
    }
  | {
      readonly type: "run-fold";
      readonly id: string;
      readonly createdAt: string;
      readonly runId: string;
      readonly label: string;
      readonly workingSince?: string;
    }
  | {
      readonly type: "activity-group";
      readonly id: string;
      readonly createdAt: string;
      readonly runId: string | null;
      readonly activities: ReadonlyArray<Pick<ThreadFeedActivity, "toolLike">>;
    }
  | {
      readonly type:
        | "html-render"
        | "sent-message"
        | "mcp-app"
        | "work-toggle"
        | "viewed-images"
        | "thinking";
      readonly id: string;
      readonly createdAt: string;
    };

export type ChatRow =
  | { readonly kind: "time"; readonly key: string; readonly at: string }
  | {
      readonly kind: "bubble";
      readonly key: string;
      readonly fromBen: boolean;
      readonly text: string;
      readonly streaming: boolean;
      readonly pending: boolean;
      /** First and last of a run of consecutive bubbles from the same side. */
      readonly first: boolean;
      readonly last: boolean;
    }
  | { readonly kind: "run"; readonly key: string; readonly label: string }
  | { readonly kind: "proposal"; readonly key: string; readonly proposal: AlloyProposal }
  | { readonly kind: "note"; readonly key: string; readonly text: string }
  | { readonly kind: "typing"; readonly key: string };

/** A gap this long between items shows the time again. */
const TIME_GAP_MS = 15 * 60_000;
/** Bubbles further apart than this start a new group even from the same side. */
const GROUP_GAP_MS = 5 * 60_000;

type Timed = { readonly at: string; readonly row: Exclude<ChatRow, { kind: "time" | "typing" }> };

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

function runSteps(feed: ReadonlyArray<ChatFeedRow>): ReadonlyMap<string, number> {
  const steps = new Map<string, number>();
  for (const entry of feed) {
    if (entry.type !== "activity-group" || entry.runId === null) continue;
    const tools = entry.activities.filter((activity) => activity.toolLike).length;
    steps.set(entry.runId, (steps.get(entry.runId) ?? 0) + tools);
  }
  return steps;
}

/** Ben's messages and the agent's prose, with each finished run's tool work folded to one line. */
function threadItems(
  presented: ReadonlyArray<ChatFeedRow>,
  feed: ReadonlyArray<ChatFeedRow>,
): ReadonlyArray<Timed> {
  const steps = runSteps(feed);
  return presented.flatMap((entry): Timed[] => {
    if (entry.type === "message") {
      const { message } = entry;
      if (isAlloyNote(message) || (!message.text.trim() && !message.streaming)) return [];
      return [
        {
          at: entry.createdAt,
          row: {
            kind: "bubble",
            key: entry.id,
            fromBen: message.role === "user",
            text: message.text,
            streaming: message.streaming,
            pending: entry.pendingMessage !== undefined,
            first: true,
            last: true,
          },
        },
      ];
    }
    if (entry.type === "run-fold" && entry.workingSince === undefined) {
      const count = steps.get(entry.runId) ?? 0;
      return [
        {
          at: entry.createdAt,
          row: {
            kind: "run",
            key: entry.id,
            label: count > 0 ? `${entry.label} · ${plural(count, "step")}` : entry.label,
          },
        },
      ];
    }
    return [];
  });
}

const DECISION_VERB = { approved: "approved", rejected: "rejected", noted: "noted" } as const;

const PROPOSAL_NOUN: Record<AlloyProposalBody["_tag"], string> = {
  roadmap: "the roadmap",
  vision: "the vision",
  idea: "the idea",
};

function decisionLine(proposal: AlloyProposal): string {
  if (proposal.status === "pending") return proposal.title;
  const line = `You ${DECISION_VERB[proposal.status]} ${PROPOSAL_NOUN[proposal.body._tag]} “${proposal.title}”`;
  return proposal.decisionNote ? `${line}: ${proposal.decisionNote}` : line;
}

const ACTIVITY_VERB = { approved: "Approved", rejected: "Rejected", noted: "Noted" } as const;

/** Activity lines the proposal cards and decision lines already show. */
function echoesProposal(entry: AlloyActivity, proposals: ReadonlyArray<AlloyProposal>) {
  return proposals.some(
    (proposal) =>
      (entry.text.startsWith("Proposed ") && entry.text.endsWith(`: "${proposal.title}"`)) ||
      (proposal.status !== "pending" &&
        entry.text.startsWith(`${ACTIVITY_VERB[proposal.status]} "${proposal.title}"`)),
  );
}

function alloyItems(
  goalId: AlloyGoalId,
  proposals: ReadonlyArray<AlloyProposal>,
  activity: ReadonlyArray<AlloyActivity>,
): ReadonlyArray<Timed> {
  const own = proposals.filter((proposal) => proposal.goalId === goalId);
  return [
    ...own.map((proposal): Timed =>
      proposal.status === "pending"
        ? { at: proposal.createdAt, row: { kind: "proposal", key: proposal.id, proposal } }
        : {
            at: proposal.decidedAt ?? proposal.createdAt,
            row: { kind: "note", key: `decision:${proposal.id}`, text: decisionLine(proposal) },
          },
    ),
    ...activity
      .filter((entry) => entry.goalId === goalId && !echoesProposal(entry, own))
      .map((entry): Timed => ({
        at: entry.at,
        row: { kind: "note", key: entry.id, text: entry.text },
      })),
  ].sort((left, right) => compareTimestamps(left.at, right.at));
}

/** Keeps the thread's own order and slots each Alloy event in before the first later item. */
function mergeByTime(thread: ReadonlyArray<Timed>, alloy: ReadonlyArray<Timed>): Timed[] {
  const merged: Timed[] = [];
  let next = 0;
  for (const item of thread) {
    while (next < alloy.length && compareTimestamps(alloy[next]!.at, item.at) < 0) {
      merged.push(alloy[next]!);
      next += 1;
    }
    merged.push(item);
  }
  return [...merged, ...alloy.slice(next)];
}

export function buildChatTimeline(input: {
  readonly goalId: AlloyGoalId;
  /** T3's feed as the thread view presents it, runs folded. */
  readonly presented: ReadonlyArray<ChatFeedRow>;
  /** T3's full feed, for counting each run's tool calls. */
  readonly feed: ReadonlyArray<ChatFeedRow>;
  readonly proposals: ReadonlyArray<AlloyProposal>;
  readonly activity: ReadonlyArray<AlloyActivity>;
  /** A run is working on the thread. */
  readonly working: boolean;
}): ReadonlyArray<ChatRow> {
  const items = mergeByTime(
    threadItems(input.presented, input.feed),
    alloyItems(input.goalId, input.proposals, input.activity),
  );
  const rows: ChatRow[] = [];
  let previous: Timed | null = null;
  for (const item of items) {
    const gap = previous === null ? Infinity : Date.parse(item.at) - Date.parse(previous.at);
    if (gap > TIME_GAP_MS) rows.push({ kind: "time", key: `time:${item.row.key}`, at: item.at });
    const prior = rows.at(-1);
    if (
      item.row.kind === "bubble" &&
      prior?.kind === "bubble" &&
      prior.fromBen === item.row.fromBen &&
      gap <= GROUP_GAP_MS
    ) {
      rows[rows.length - 1] = { ...prior, last: false };
      rows.push({ ...item.row, first: false });
    } else {
      rows.push(item.row);
    }
    previous = item;
  }
  const tail = rows.at(-1);
  if (input.working && !(tail?.kind === "bubble" && !tail.fromBen && tail.streaming)) {
    rows.push({ kind: "typing", key: "typing" });
  }
  return rows;
}
