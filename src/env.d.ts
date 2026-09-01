// Secrets aren't declared in wrangler.jsonc (`wrangler secret put GITHUB_TOKEN`),
// so `wrangler types` never generates them. Declared here instead of hand-editing
// the generated worker-configuration.d.ts, which gets overwritten on every run.
interface Env {
  readonly GITHUB_TOKEN: string;
}
