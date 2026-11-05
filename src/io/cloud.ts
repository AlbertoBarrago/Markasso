import type { Scene } from '../core/scene';
import type { Viewport } from '../core/viewport';
import type { Element } from '../elements/element';
import { validateElements, validateViewport } from './element_validation';

/**
 * The /cloud page of the deployment the web app runs on, so the nightly links
 * to its own page (and the Polar sandbox) instead of production.
 */
export function cloudPageUrl(origin = location.origin): string {
  return new URL('/cloud', origin).href;
}
export const TOKEN_KEY = 'markasso-cloud-tokens';
export const LICENSE_KEY = 'markasso-cloud-license';
export type CloudState = 'saved' | 'saving' | 'offline' | 'conflict' | 'error';
export type CloudScene = { elements: readonly Element[]; viewport?: Viewport };
export class CloudError extends Error {
  constructor(
    public readonly status: number,
    public readonly serverVersion?: number,
  ) {
    super('Cloud request failed');
  }
}
export function boardLinks(
  origin: string,
  id: string,
  token?: string,
): { read: string; edit: string; mac: string } {
  const read = new URL(`/b/${id}`, origin).href;
  const fragment = token ? `#k=${encodeURIComponent(token)}` : '';
  const edit = read + fragment;
  return {
    read,
    edit,
    mac:
      origin === 'https://markasso.it'
        ? `markasso://board/${id}${fragment}`
        : `markasso://open?url=${encodeURIComponent(edit)}`,
  };
}
export function parseBoardUrl(url: URL): { id: string; token?: string } | null {
  const match = /^\/b\/([a-zA-Z0-9]{12})\/?$/.exec(url.pathname);
  if (!match) return null;
  const token = new URLSearchParams(url.hash.slice(1)).get('k');
  return {
    id: match[1]!,
    ...(token && /^[\w-]{43}$/.test(token) ? { token } : {}),
  };
}
export class CloudClient {
  id: string | null = null;
  token: string | undefined;
  version = 0;
  state: CloudState = 'saved';
  error = 0;
  /** Epoch ms of the last successful response from the board API, or null before any. */
  lastSyncedAt: number | null = null;
  /**
   * Called when a request starts or ends, separately from the state callback:
   * the status icon spins only while a request is in flight, and the state
   * callback also drives dialogs that must not re-open on every request.
   */
  onActivity: () => void = () => {};
  private requests = 0;
  private pending: CloudScene | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private busy = false;
  private generation = 0;
  constructor(
    private readonly storage: Pick<
      Storage,
      'getItem' | 'setItem' | 'removeItem'
    >,
    private readonly request: typeof fetch = fetch,
    private readonly changed: () => void = () => {},
  ) {}
  /** True while at least one request to the board API is in flight. */
  get inFlight(): boolean {
    return this.requests > 0;
  }
  get editable(): boolean {
    return !!this.id && !!this.token;
  }
  get license(): string {
    try {
      return this.storage.getItem(LICENSE_KEY) ?? '';
    } catch {
      return '';
    }
  }
  setLicense(key: string): void {
    if (key.trim()) this.storage.setItem(LICENSE_KEY, key.trim());
    else this.storage.removeItem(LICENSE_KEY);
  }
  /**
   * Asks the worker whether `key` is a valid licence, without storing it.
   * `unknown` means the answer could not be obtained (offline, rate limited,
   * licence service down): callers may store the key and let the next save
   * decide.
   */
  async checkLicense(key: string): Promise<'valid' | 'invalid' | 'unknown'> {
    // Detached on purpose: `this.request(...)` would call the browser's fetch
    // with the CloudClient as receiver, which throws "Illegal invocation".
    const request = this.request;
    try {
      const response = await request('/api/licence/check', {
        method: 'POST',
        headers: { 'X-Markasso-License': key.trim() },
      });
      if (!response.ok) return 'unknown';
      const data = (await response.json()) as { valid?: unknown };
      return data.valid === true ? 'valid' : 'invalid';
    } catch {
      return 'unknown';
    }
  }
  private tokens(): Record<string, string> {
    try {
      const value: unknown = JSON.parse(
        this.storage.getItem(TOKEN_KEY) ?? '{}',
      );
      if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
      return Object.fromEntries(
        Object.entries(value).filter(
          ([id, token]) =>
            /^[a-zA-Z0-9]{12}$/.test(id) &&
            typeof token === 'string' &&
            /^[\w-]{43}$/.test(token),
        ),
      );
    } catch {
      return {};
    }
  }
  private remember(): void {
    try {
      this.storage.setItem(
        TOKEN_KEY,
        JSON.stringify({ ...this.tokens(), [this.id!]: this.token }),
      );
    } catch {
      /* Edit fragment remains available when storage is disabled. */
    }
  }
  private notify(state: CloudState, error = 0): void {
    this.state = state;
    this.error = error;
    this.changed();
  }
  private async send(
    path: string,
    init: RequestInit = {},
  ): Promise<Record<string, unknown>> {
    let response: Response;
    // Call the injected fetch as a plain function: invoking window.fetch as a
    // method of this client throws "Illegal invocation" in browsers.
    const request = this.request;
    this.requests++;
    this.onActivity();
    try {
      response = await request(path, {
        ...init,
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      });
    } catch {
      throw new CloudError(0);
    } finally {
      this.requests--;
      this.onActivity();
    }
    if (response.ok) this.lastSyncedAt = Date.now();
    if (!response.ok) {
      if (response.status === 409) {
        const data = (await response.json()) as { version?: number };
        throw new CloudError(
          409,
          Number.isInteger(data.version) && data.version! > 0
            ? data.version
            : undefined,
        );
      }
      throw new CloudError(response.status);
    }
    return (await response.json()) as Record<string, unknown>;
  }
  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.license ? { 'X-Markasso-License': this.license } : {}),
    };
  }
  async create(scene: CloudScene): Promise<void> {
    this.notify('saving');
    try {
      const data = await this.send('/api/board', {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          elements: scene.elements,
          ...(scene.viewport ? { viewport: scene.viewport } : {}),
        }),
      });
      if (
        typeof data.id !== 'string' ||
        !/^[a-zA-Z0-9]{12}$/.test(data.id) ||
        typeof data.writeToken !== 'string' ||
        !/^[\w-]{43}$/.test(data.writeToken) ||
        !Number.isInteger(data.version) ||
        (data.version as number) < 1
      )
        throw new CloudError(503);
      this.detach();
      this.id = data.id;
      this.token = data.writeToken;
      this.version = data.version as number;
      this.remember();
      this.notify('saved');
    } catch (error) {
      this.failed(error);
      throw error;
    }
  }
  async open(url: URL): Promise<CloudScene> {
    const route = parseBoardUrl(url);
    if (!route) throw new CloudError(404);
    this.detach();
    this.id = route.id;
    this.token = route.token ?? this.tokens()[route.id];
    const scene = await this.read();
    if (this.token) this.remember();
    this.notify('saved');
    return scene;
  }
  async read(): Promise<CloudScene> {
    const data = await this.send(`/api/board/${this.id}`);
    const elements = validateElements(data.elements);
    const viewport = validateViewport(data.viewport);
    if (
      !elements ||
      !Number.isInteger(data.version) ||
      (data.version as number) < 1 ||
      (data.viewport !== undefined && !viewport)
    )
      throw new CloudError(503);
    this.version = data.version as number;
    return { elements, ...(viewport ? { viewport } : {}) };
  }
  schedule(scene: Pick<Scene, 'elements' | 'viewport'>): void {
    if (!this.editable) return;
    this.pending = { elements: scene.elements, viewport: scene.viewport };
    if (this.timer) clearTimeout(this.timer);
    if (this.state === 'conflict' || this.state === 'error') return;
    this.notify('saving');
    this.timer = setTimeout(() => {
      void this.flush();
    }, 2000);
  }
  async flush(keepalive = false): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    if (
      this.busy ||
      !this.pending ||
      !this.editable ||
      this.state === 'conflict' ||
      this.state === 'error'
    )
      return;
    this.busy = true;
    const scene = this.pending;
    const generation = this.generation;
    this.notify('saving');
    try {
      const data = await this.send(`/api/board/${this.id}`, {
        method: 'PUT',
        headers: {
          ...this.headers(),
          Authorization: `Bearer ${this.token}`,
          'If-Match': `"${this.version}"`,
        },
        body: JSON.stringify({
          elements: scene.elements,
          ...(scene.viewport ? { viewport: scene.viewport } : {}),
        }),
        keepalive,
      });
      if (generation !== this.generation) return;
      if (
        !Number.isInteger(data.version) ||
        (data.version as number) <= this.version
      )
        throw new CloudError(503);
      this.version = data.version as number;
      if (this.pending === scene) this.pending = null;
      this.notify(this.pending ? 'saving' : 'saved');
    } catch (error) {
      if (generation === this.generation) {
        if (error instanceof CloudError && error.serverVersion)
          this.version = error.serverVersion;
        this.failed(error);
      }
    } finally {
      this.busy = false;
    }
    if (this.pending && this.state === 'saving')
      this.timer = setTimeout(() => {
        void this.flush();
      }, 2000);
  }
  private failed(error: unknown): void {
    const status = error instanceof CloudError ? error.status : 503;
    this.notify(
      status === 409
        ? 'conflict'
        : [0, 429, 503].includes(status)
          ? 'offline'
          : 'error',
      status,
    );
    if (this.pending && this.state === 'offline')
      this.timer = setTimeout(
        () => {
          void this.flush();
        },
        status === 429 ? 60000 : 10000,
      );
  }
  async keepMine(): Promise<void> {
    this.notify('saving');
    await this.flush();
  }
  async takeTheirs(): Promise<CloudScene> {
    const scene = await this.read();
    this.pending = null;
    this.notify('saved');
    return scene;
  }
  retry(): Promise<void> {
    if (!this.pending || !this.editable) return Promise.resolve();
    this.notify('saving');
    return this.flush();
  }
  async saveCopy(scene: CloudScene, download: () => void): Promise<void> {
    const oldState = this.state;
    const oldError = this.error;
    try {
      await this.create(scene);
    } catch {
      if (this.timer) clearTimeout(this.timer);
      this.notify(oldState, oldError);
      download();
    }
  }
  detach(): void {
    if (this.timer) clearTimeout(this.timer);
    this.generation++;
    this.pending = null;
    this.id = null;
    this.token = undefined;
    this.version = 0;
  }
}
