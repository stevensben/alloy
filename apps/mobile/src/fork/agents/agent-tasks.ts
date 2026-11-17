export type AgentProvider = "claude" | "codex" | "grok";

export type DoneCheck =
  | { readonly kind: "tests"; readonly label: string }
  | { readonly kind: "build"; readonly label: string }
  | { readonly kind: "sql"; readonly label: string }
  | { readonly kind: "review"; readonly label: string };

export type AgentTaskStatus =
  | { readonly kind: "needsYou"; readonly reason: string }
  | { readonly kind: "running"; readonly step: number; readonly steps: number }
  | { readonly kind: "done" };

export interface AgentTask {
  readonly id: string;
  readonly title: string;
  readonly projectBadge: string;
  readonly environmentLabel: string;
  readonly status: AgentTaskStatus;
  readonly check: DoneCheck;
  readonly tokens: { readonly used: number; readonly budget: number };
  readonly workers: ReadonlyArray<{ readonly provider: AgentProvider; readonly role: string }>;
}

export interface AgentTaskSections {
  readonly needsYou: ReadonlyArray<AgentTask>;
  readonly running: ReadonlyArray<AgentTask>;
  readonly done: ReadonlyArray<AgentTask>;
}

export function groupAgentTasks(tasks: ReadonlyArray<AgentTask>): AgentTaskSections {
  return {
    needsYou: tasks.filter((task) => task.status.kind === "needsYou"),
    running: tasks.filter((task) => task.status.kind === "running"),
    done: tasks.filter((task) => task.status.kind === "done"),
  };
}

export function formatTokenBudget(tokens: AgentTask["tokens"]): string {
  const k = (value: number) => `${Math.round(value / 1000)}k`;
  return `${k(tokens.used)} / ${k(tokens.budget)}`;
}

export const PLACEHOLDER_AGENT_TASKS: ReadonlyArray<AgentTask> = [
  {
    id: "webb-research",
    title: "Webb 2020TXA000015D1 research",
    projectBadge: "EP",
    environmentLabel: "Mac mini",
    status: { kind: "needsYou", reason: "Captcha on the Webb clerk portal" },
    check: { kind: "sql", label: "research_gaps() empty" },
    tokens: { used: 88_000, budget: 250_000 },
    workers: [{ provider: "claude", role: "research" }],
  },
  {
    id: "family-tree-export",
    title: "Family tree export + heirship view",
    projectBadge: "ES",
    environmentLabel: "MacBook",
    status: { kind: "running", step: 3, steps: 5 },
    check: { kind: "tests", label: "tests pass" },
    tokens: { used: 41_000, budget: 200_000 },
    workers: [
      { provider: "claude", role: "build" },
      { provider: "codex", role: "review" },
    ],
  },
  {
    id: "shelf-recovery",
    title: "Recover lost Shelf iOS work",
    projectBadge: "SS",
    environmentLabel: "MacBook",
    status: { kind: "running", step: 1, steps: 3 },
    check: { kind: "build", label: "app builds" },
    tokens: { used: 12_000, budget: 100_000 },
    workers: [{ provider: "codex", role: "build" }],
  },
  {
    id: "email-polish",
    title: "Email screen UI polish",
    projectBadge: "SN",
    environmentLabel: "MacBook",
    status: { kind: "done" },
    check: { kind: "review", label: "second-model review" },
    tokens: { used: 64_000, budget: 150_000 },
    workers: [
      { provider: "claude", role: "build" },
      { provider: "grok", role: "review" },
    ],
  },
];
