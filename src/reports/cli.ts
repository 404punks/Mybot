import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { readEvents } from "../logs/jsonl.js";
import type { OutcomeEvent } from "../logs/events.js";
import { calibrate } from "./calibration.js";
import { reliabilitySvg } from "./chart.js";
import { dailySummary, dayKey } from "./daily.js";

const [command, logPath, outPath] = process.argv.slice(2);
if (!command || !logPath || !outPath) {
  process.stderr.write("usage: report <calibration|daily> <log.jsonl> <out>\n");
  process.exit(1);
}
const events = readEvents(logPath);
mkdirSync(dirname(outPath), { recursive: true });

if (command === "calibration") {
  const outcomes = events.filter((event): event is OutcomeEvent => event.kind === "outcome");
  const report = calibrate(outcomes);
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  const svgPath = outPath.replace(/\.json$/, "") + ".svg";
  writeFileSync(svgPath, reliabilitySvg(report.buckets));
  process.stdout.write(`${outPath}\n${svgPath}\n`);
} else if (command === "daily") {
  const day = process.env.REPORT_DAY ?? dayKey(Date.now(), "Asia/Dhaka");
  const summary = dailySummary(events, day);
  writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${outPath}\n`);
} else {
  process.stderr.write("unknown report\n");
  process.exit(1);
}
