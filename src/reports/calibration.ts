import type { OutcomeEvent } from "../logs/events.js";

export interface Bucket {
  lo: number;
  hi: number;
  count: number;
  meanPredicted: number | null;
  actualRate: number | null;
}

export interface QuestionCalibration {
  questionId: string;
  count: number;
  brier: number | null;
  buckets: Bucket[];
}

export interface CalibrationReport {
  count: number;
  brier: number | null;
  buckets: Bucket[];
  questions: QuestionCalibration[];
}

const EDGES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

export function calibrate(outcomes: readonly OutcomeEvent[]): CalibrationReport {
  const byQuestion = new Map<string, OutcomeEvent[]>();
  for (const outcome of outcomes) {
    const rows = byQuestion.get(outcome.questionId) ?? [];
    rows.push(outcome);
    byQuestion.set(outcome.questionId, rows);
  }
  const questions = [...byQuestion.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([questionId, rows]) => ({ questionId, ...summarize(rows) }));
  return { ...summarize(outcomes), questions };
}

function summarize(rows: readonly OutcomeEvent[]): { count: number; brier: number | null; buckets: Bucket[] } {
  const buckets = EDGES.slice(0, -1).map((lo, index) => {
    const hi = EDGES[index + 1] ?? 1;
    const inside = rows.filter((row) => inBucket(row.probability, lo, hi, index === EDGES.length - 2));
    const count = inside.length;
    if (count === 0) return { lo, hi, count, meanPredicted: null, actualRate: null };
    const meanPredicted = inside.reduce((sum, row) => sum + row.probability, 0) / count;
    const actualRate = inside.reduce((sum, row) => sum + row.outcome, 0) / count;
    return { lo, hi, count, meanPredicted, actualRate };
  });
  if (rows.length === 0) return { count: 0, brier: null, buckets };
  const brier = rows.reduce((sum, row) => sum + (row.probability - row.outcome) ** 2, 0) / rows.length;
  return { count: rows.length, brier, buckets };
}

function inBucket(probability: number, lo: number, hi: number, last: boolean): boolean {
  if (last) return probability >= lo && probability <= hi;
  return probability >= lo && probability < hi;
}

export function brierScore(pairs: readonly { probability: number; outcome: 0 | 1 }[]): number | null {
  if (pairs.length === 0) return null;
  return pairs.reduce((sum, row) => sum + (row.probability - row.outcome) ** 2, 0) / pairs.length;
}
