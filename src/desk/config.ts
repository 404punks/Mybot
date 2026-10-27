import type { Mode } from "../types.js";

export interface DeskConfig {
  mode: Mode;
  deskSecret: string;
  judgeUrl: string;
}

/** The desk never reads the Jev key. It refuses to start if that variable is present. */
export function deskConfig(env: NodeJS.ProcessEnv): DeskConfig {
  if ((env.TYPESAFE_API_KEY ?? "").trim() !== "") {
    throw new Error("Refusing to start the desk while TYPESAFE_API_KEY is set. That key stays on the judge.");
  }
  const mode = env.DESK_MODE;
  if (mode !== "shadow" && mode !== "paper") throw new Error("DESK_MODE must be shadow or paper");
  const deskSecret = env.DESK_SECRET?.trim() ?? "";
  if (deskSecret.length < 16) throw new Error("DESK_SECRET is not set");
  const judgeUrl = env.JUDGE_URL?.trim() || "http://127.0.0.1:8787";
  return { mode, deskSecret, judgeUrl };
}
