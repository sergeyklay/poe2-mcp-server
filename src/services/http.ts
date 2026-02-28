const USER_AGENT = 'poe2-mcp-server/1.0.0 (MCP; Claude Desktop integration)';

/** Simple rate limiter: max N requests per window (ms). */
class RateLimiter {
  private timestamps: number[] = [];
  constructor(
    private maxRequests: number,
    private windowMs: number,
  ) {}

  async wait(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= this.maxRequests) {
      const oldest = this.timestamps[0]!;
      const delay = this.windowMs - (now - oldest) + 50;
      await new Promise((r) => setTimeout(r, delay));
    }
    this.timestamps.push(Date.now());
  }
}

/** Generic JSON fetch with error handling. */
async function fetchJson<T>(url: string, limiter?: RateLimiter): Promise<T> {
  if (limiter) await limiter.wait();
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} from ${url}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export { USER_AGENT, RateLimiter, fetchJson };
