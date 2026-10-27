# Desk

A paper-only trading desk. Jev makes judgments. Code makes the trading decision. Nothing in this repo can place a live order.

No API key is included. Do not add one until you mean to. The Jev key stays on the judge process. The desk uses a separate desk secret and refuses to start if `TYPESAFE_API_KEY` is set in its environment. This desk has no exchange key and no path that moves cash off the account.

## Layout

| Path | Role |
| --- | --- |
| `src/state` | Builds a snapshot from prices strictly before the decision. It stays under 400 estimated tokens. |
| `src/questions` | One file per bot: gambler, house, spy. One judgment per question. Every Choice has an `other` option. |
| `src/policy` | One threshold per action, scaled by what being wrong costs, plus the combination weights. |
| `src/risk` | Hard vetoes before every order: max position, daily loss, leverage, range, fees plus gas, model version. |
| `src/broker` | Paper broker behind the interface a venue adapter would use. |
| `src/filter` | Funnel, cheapest check first. Every rejection is logged with the check that fired. |
| `src/book` | One open position. A rejected name is benched for a time set by the reason. |
| `src/logs` | Snapshots, questions, answers with probabilities, and outcomes. |
| `src/judge` | The only process that sees the Jev key. It returns raw answers and does not pick a trade. |
| `src/reports` | Calibration (buckets, Brier, reliability chart) and the daily summary. |

The pinned model is `jev-1.14.0`. Each answer log stores the `model` string from that response, unchanged. A different string is a veto.

## Modes

`DESK_MODE=shadow` asks Jev and logs what the policy would have done. It does not call the broker.

`DESK_MODE=paper` does the same, then sends the order to the paper broker if every veto passes.

If a judge call has not returned before the next block, the decision is a hold. Rate limits back off inside the judge. A malformed question is not retried.

## Run

Use two shells so the Jev key is not in the desk's environment.

```sh
# judge shell, after you have chosen to add a key
export TYPESAFE_API_KEY=...
export DESK_SECRET=...   # at least 16 characters, not the Jev key
npm run judge

# desk shell. Do not export TYPESAFE_API_KEY here.
export DESK_SECRET=...
export DESK_MODE=shadow
npm run desk -- examples/tape.json
```

```sh
npm run report:calibration -- logs/desk.jsonl reports/calibration.json
npm run report:daily -- logs/desk.jsonl reports/daily.json
```

`REPORT_DAY=YYYY-MM-DD` selects the day. The default day is today in Asia/Dhaka.

Thresholds and weights are starting values. They are not fit to a tape. Outcome labels for calibration are proxies computed from prices after the decision, and only for the questions that have a forward rule.
