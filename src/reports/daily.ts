import type { LogEvent } from "../logs/events.js";
import type { RiskCheck } from "../types.js";

export interface DailySummary {
  day: string;
  timeZone: string;
  decisions: number;
  trades: number;
  pnlAfterFees: number;
  fees: number;
  gas: number;
  shadowDecisions: number;
  paperDecisions: number;
  vetoes: { check: RiskCheck; count: number; decisionIds: string[] }[];
}

export function dailySummary(events: readonly LogEvent[], day: string, timeZone = "Asia/Dhaka"): DailySummary {
  const onDay = events.filter((event) => dayKey(event.ts, timeZone) === day);
  const decisions = onDay.filter((event) => event.kind === "decision");
  const fills = onDay.filter((event) => event.kind === "fill");
  const vetoes = onDay.filter((event) => event.kind === "veto");
  const grouped = new Map<RiskCheck, { count: number; decisionIds: string[] }>();
  for (const veto of vetoes) {
    const row = grouped.get(veto.check) ?? { count: 0, decisionIds: [] };
    row.count += 1;
    row.decisionIds.push(veto.decisionId);
    grouped.set(veto.check, row);
  }
  return {
    day,
    timeZone,
    decisions: decisions.length,
    trades: fills.length,
    pnlAfterFees: fills.reduce((sum, fill) => sum + fill.realizedPnl, 0),
    fees: fills.reduce((sum, fill) => sum + fill.fee, 0),
    gas: fills.reduce((sum, fill) => sum + fill.gas, 0),
    shadowDecisions: decisions.filter((event) => event.mode === "shadow").length,
    paperDecisions: decisions.filter((event) => event.mode === "paper").length,
    vetoes: [...grouped.entries()]
      .map(([check, row]) => ({ check, ...row }))
      .sort((a, b) => a.check.localeCompare(b.check)),
  };
}

export function dayKey(ts: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts));
}
