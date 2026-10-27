import type { Snapshot } from "../state/snapshot.js";
import type { Action, BotName, CheckId, Mode, RiskCheck, Side, Stage } from "../types.js";
import type { RawAnswer } from "../policy/decide.js";

export interface SnapshotEvent {
  kind: "snapshot";
  ts: number;
  decisionId: string;
  symbol: string;
  decisionTs: number;
  tokens: number;
  snapshot: Snapshot;
}

export interface QuestionEvent {
  kind: "question";
  ts: number;
  decisionId: string;
  bot: BotName;
  questionId: string;
  questionType: "choice" | "noul" | "score";
  instructions: string;
  criteria: unknown;
}

export interface AnswerEvent {
  kind: "answer";
  ts: number;
  decisionId: string;
  bot: BotName;
  questionId: string;
  /** Exact `model` string from the response. Never rewritten. */
  model: string;
  answer: RawAnswer;
}

export interface RejectionEvent {
  kind: "rejection";
  ts: number;
  decisionId: string;
  symbol: string | null;
  stage: Stage;
  check: CheckId;
  detail?: string;
}

export interface VetoEvent {
  kind: "veto";
  ts: number;
  decisionId: string;
  symbol: string;
  check: RiskCheck;
  detail?: string;
}

export interface DecisionEvent {
  kind: "decision";
  ts: number;
  decisionId: string;
  mode: Mode;
  symbol: string | null;
  policyAction: Action;
  executed: boolean;
  reason: string;
  scores: Record<Action, number>;
  thresholds: Record<Action, number>;
  model: string | null;
}

export interface FillEvent {
  kind: "fill";
  ts: number;
  decisionId: string;
  symbol: string;
  side: Side;
  qty: number;
  price: number;
  fee: number;
  gas: number;
  realizedPnl: number;
}

export interface OutcomeEvent {
  kind: "outcome";
  ts: number;
  decisionId: string;
  questionId: string;
  probability: number;
  outcome: 0 | 1;
  labeledAt: number;
}

export type LogEvent =
  | SnapshotEvent
  | QuestionEvent
  | AnswerEvent
  | RejectionEvent
  | VetoEvent
  | DecisionEvent
  | FillEvent
  | OutcomeEvent;
