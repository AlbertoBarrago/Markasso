// Secrets aren't declared in wrangler.jsonc (`wrangler secret put GITHUB_TOKEN`),
// so `wrangler types` never generates them. Declared here instead of hand-editing
// the generated worker-configuration.d.ts, which gets overwritten on every run.
interface Env {
  readonly GITHUB_TOKEN: string;
  /** Polar organization access token with the `license_keys:write` scope. */
  readonly POLAR_ACCESS_TOKEN?: string;
}

interface Env {
  readonly BOARDS_DB: D1Database;
  readonly BOARDS_BUCKET: R2Bucket;
  readonly BOARD_RATE_LIMITER: RateLimit;
  readonly CLOUD_ENABLED?: string;
  readonly CLOUD_REQUIRES_LICENSE: string;
  readonly POLAR_ORGANIZATION_ID?: string;
  /** The "License Keys" benefit of the Markasso Cloud product. */
  readonly POLAR_BENEFIT_ID?: string;
  /** Polar API base, e.g. `https://sandbox-api.polar.sh` for a test deployment; production API otherwise. */
  readonly POLAR_API_URL?: string;
  /** Non-browser live peers (MCP agents) need a licence when 'true'. */
  readonly LIVE_AGENT_REQUIRES_LICENSE?: string;
}
