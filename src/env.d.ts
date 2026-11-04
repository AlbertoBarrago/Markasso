// Secrets aren't declared in wrangler.jsonc (`wrangler secret put GITHUB_TOKEN`),
// so `wrangler types` never generates them. Declared here instead of hand-editing
// the generated worker-configuration.d.ts, which gets overwritten on every run.
interface Env {
  readonly GITHUB_TOKEN: string;
}

interface Env {
  readonly BOARDS_DB: D1Database;
  readonly BOARDS_BUCKET: R2Bucket;
  readonly BOARD_RATE_LIMITER: RateLimit;
  readonly CLOUD_REQUIRES_LICENSE: string;
  readonly LEMON_STORE_ID: string;
  readonly LEMON_PRODUCT_ID: string;
}
