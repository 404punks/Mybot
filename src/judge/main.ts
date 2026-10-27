import { judgeConfig } from "./config.js";
import { startJudge } from "./server.js";
import { createTypeSafeClient } from "./typesafe.js";

const config = judgeConfig(process.env);
const client = createTypeSafeClient(config.apiKey);
const server = await startJudge({ client, deskSecret: config.deskSecret, port: config.port });
process.stdout.write(`judge listening on ${server.url}\n`);
