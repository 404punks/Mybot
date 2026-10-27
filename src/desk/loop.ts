import { executePick } from "./execute.js";
import { runFunnel, type FunnelDeps } from "../filter/funnel.js";
import type { SnapshotInput } from "../state/snapshot.js";

export async function runDecision(deps: FunnelDeps, inputs: readonly SnapshotInput[]): Promise<string> {
  const position = await deps.broker.getPosition();
  deps.book.sync(position, deps.nowMs);
  const funnel = await runFunnel(deps, inputs);
  const accountSymbol = funnel.prepared?.symbol ?? position?.symbol ?? inputs[0]?.symbol;
  const mid = funnel.prepared?.snapshot.mid ?? markFrom(inputs, deps, accountSymbol);
  const account =
    accountSymbol && mid
      ? await deps.broker.getAccount({ symbol: accountSymbol, mid })
      : { cash: 0, equity: 0, dailyPnl: 0 };
  const live = await deps.broker.getPosition();
  await executePick({
    log: deps.log,
    book: deps.book,
    broker: deps.broker,
    prepared: funnel.prepared,
    decisionId: funnel.decisionId,
    mode: deps.mode,
    nowMs: deps.nowMs,
    blockMs: deps.blockMs,
    orderQty: deps.orderQty,
    risk: deps.risk,
    account,
    positionQty: live?.qty ?? 0,
    holdReason: funnel.holdReason,
  });
  return funnel.decisionId;
}

function markFrom(inputs: readonly SnapshotInput[], deps: FunnelDeps, symbol: string | undefined): number | null {
  if (!symbol) return null;
  const input = inputs.find((item) => item.symbol === symbol);
  const book = input?.books.filter((row) => row.ts < deps.decisionTs).at(-1);
  if (!book) return null;
  return (book.bid + book.ask) / 2;
}
