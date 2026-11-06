/** Thin typed client for the FeedbackBuddy admin API. */
export interface ClientOptions {
  baseUrl: string;
  token: string;
  fetcher?: typeof fetch;
}

export class FeedbackBuddyClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetcher: typeof fetch;

  constructor(options: ClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.token = options.token;
    this.fetcher = options.fetcher ?? fetch;
  }

  async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
        'User-Agent': 'feedback-buddy-mcp/0.1',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    if (!response.ok) {
      let code = `http_${response.status}`;
      try { code = (JSON.parse(text) as { error?: string }).error ?? code; } catch { /* keep http code */ }
      throw new Error(`FeedbackBuddy API ${method} ${path} failed: ${code}`);
    }
    return JSON.parse(text) as T;
  }

  async bytes(path: string): Promise<{ contentType: string; data: Uint8Array }> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.token}`, 'User-Agent': 'feedback-buddy-mcp/0.1' },
    });
    if (!response.ok) throw new Error(`FeedbackBuddy API GET ${path} failed: http_${response.status}`);
    return { contentType: response.headers.get('content-type') ?? 'application/octet-stream', data: new Uint8Array(await response.arrayBuffer()) };
  }
}
