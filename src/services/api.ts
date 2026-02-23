/**
 * HTTP client for public PoE2 APIs (poe.ninja, poe2db, wiki, RePoE).
 * No authentication required — all endpoints are public.
 */

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

// poe.ninja: 12 req / 5 min
const ninjaLimiter = new RateLimiter(10, 5 * 60 * 1000);

/** Generic JSON fetch with error handling. */
export async function fetchJson<T>(url: string, limiter?: RateLimiter): Promise<T> {
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

// ─── poe.ninja PoE2 Exchange API ──────────────────────────────────────

interface NinjaExchangeCoreItem {
  id: string;
  name: string;
  image: string;
  category: string;
  detailsId: string;
}

interface NinjaExchangeCore {
  items: NinjaExchangeCoreItem[];
  rates: Record<string, number>;
  primary: string;
  secondary: string;
}

interface NinjaExchangeLine {
  id: string;
  primaryValue: number;
  volumePrimaryValue: number;
  maxVolumeCurrency: string;
  maxVolumeRate: number;
  sparkline: { totalChange: number; data: number[] };
}

export interface NinjaExchangeResponse {
  core: NinjaExchangeCore;
  lines: NinjaExchangeLine[];
}

// ─── poe.ninja Build Index API ────────────────────────────────────────

interface BuildLeagueStatistics {
  class: string[];
  percentage: number[];
  trend: number[];
}

export interface BuildLeagueEntry {
  leagueName: string;
  leagueUrl: string;
  total: number;
  status: number;
  statistics: BuildLeagueStatistics;
}

export interface BuildIndexStateResponse {
  leagueBuilds: BuildLeagueEntry[];
}

const NINJA_POE2_BASE = 'https://poe.ninja/poe2/api/economy';

/**
 * Fetch PoE2 exchange overview from poe.ninja.
 * @param league — Full league display name, e.g. "Fate of the Vaal"
 * @param type — Exchange category, e.g. "Currency", "Fragments", "Essences"
 */
export async function getNinjaExchangeOverview(
  league: string,
  type: string,
): Promise<NinjaExchangeResponse> {
  const url = `${NINJA_POE2_BASE}/exchange/current/overview?league=${encodeURIComponent(league)}&type=${encodeURIComponent(type)}`;
  return fetchJson<NinjaExchangeResponse>(url, ninjaLimiter);
}

/**
 * Fetch PoE2 build index state from poe.ninja.
 * Returns class distribution statistics for all leagues.
 */
export async function getNinjaBuildIndex(): Promise<BuildIndexStateResponse> {
  const url = 'https://poe.ninja/poe2/api/data/build-index-state';
  return fetchJson<BuildIndexStateResponse>(url, ninjaLimiter);
}

// ─── poe2db.tw ─────────────────────────────────────────────────────────

/**
 * Fetch HTML page from poe2db.tw for a given term (English or Russian).
 * We parse the text content for gem/item details.
 */
export async function getPoe2dbPage(term: string, lang: 'us' | 'ru' = 'us'): Promise<string> {
  const slug = term.replace(/\s+/g, '_');
  const url = `https://poe2db.tw/${lang}/${slug}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
  });
  if (!res.ok) throw new Error(`poe2db returned ${res.status} for "${term}"`);
  return res.text();
}

// ─── poe2wiki.net ──────────────────────────────────────────────────────

export interface WikiSearchResult {
  title: string;
  snippet: string;
  pageid: number;
}

/**
 * Search the PoE2 community wiki.
 */
export async function searchWiki(query: string): Promise<WikiSearchResult[]> {
  const url = `https://www.poe2wiki.net/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5`;
  const data = await fetchJson<{ query?: { search?: WikiSearchResult[] } }>(url);
  return data.query?.search ?? [];
}

/**
 * Get wiki page content by title.
 */
export async function getWikiPage(title: string): Promise<string> {
  const url = `https://www.poe2wiki.net/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json`;
  const data = await fetchJson<{ parse?: { wikitext?: { '*'?: string } } }>(url);
  return data.parse?.wikitext?.['*'] ?? '';
}

// ─── RePoE data exports ────────────────────────────────────────────────

const REPOE_BASE = 'https://repoe-fork.github.io/poe2';

/**
 * Fetch datamined gem data from RePoE.
 */
export async function getRepoGems(): Promise<Record<string, unknown>> {
  return fetchJson<Record<string, unknown>>(`${REPOE_BASE}/gems.json`);
}

/**
 * Fetch datamined base items from RePoE.
 */
export async function getRepoBaseItems(): Promise<Record<string, unknown>> {
  return fetchJson<Record<string, unknown>>(`${REPOE_BASE}/base_items.json`);
}
