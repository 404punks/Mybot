export interface JudgeConfig {
  apiKey: string;
  deskSecret: string;
  port: number;
}

/** Reads the Jev key. Only the judge process should call this. */
export function judgeConfig(env: NodeJS.ProcessEnv): JudgeConfig {
  const apiKey = env.TYPESAFE_API_KEY?.trim() ?? "";
  if (apiKey.length < 8) throw new Error("TYPESAFE_API_KEY is not set");
  const deskSecret = env.DESK_SECRET?.trim() ?? "";
  if (deskSecret.length < 16) throw new Error("DESK_SECRET is not set");
  const port = Number(env.JUDGE_PORT ?? 8787);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("JUDGE_PORT is invalid");
  return { apiKey, deskSecret, port };
}
