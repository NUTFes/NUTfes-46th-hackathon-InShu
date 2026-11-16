import { cleanup } from "./lib/cleanup";
export default {
  async scheduled(_event: ScheduledController, env: CloudflareEnv, ctx: ExecutionContext) {
    ctx.waitUntil(cleanup(env));
  },
};
