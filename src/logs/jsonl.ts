import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { redact } from "../redact.js";
import type { LogEvent } from "./events.js";

export interface DeskLog {
  write(event: LogEvent): void;
}

export class JsonlLog implements DeskLog {
  readonly #path: string;
  readonly #secrets: readonly string[];

  constructor(path: string, secrets: readonly string[] = []) {
    this.#path = path;
    this.#secrets = secrets;
    mkdirSync(dirname(path), { recursive: true });
  }

  write(event: LogEvent): void {
    const clean = redact(event, this.#secrets);
    const line = JSON.stringify(clean);
    if (line.includes("\n")) throw new Error("log event expanded to more than one line");
    appendFileSync(this.#path, `${line}\n`, "utf8");
  }
}

export class MemoryLog implements DeskLog {
  readonly events: LogEvent[] = [];
  write(event: LogEvent): void {
    this.events.push(event);
  }
}

export function readEvents(path: string): LogEvent[] {
  const text = readFileSync(path, "utf8").trim();
  if (text === "") return [];
  return text.split("\n").map((line) => JSON.parse(line) as LogEvent);
}
