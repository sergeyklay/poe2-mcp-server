/**
 * HTTP client for public PoE2 APIs (poe.ninja, poe2db, wiki, RePoE).
 * No authentication required — all endpoints are public.
 */

import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

const ARABIC_TO_ROMAN: Record<string, string> = {
  '1': 'I',
  '2': 'II',
  '3': 'III',
  '4': 'IV',
  '5': 'V',
  '6': 'VI',
  '7': 'VII',
  '8': 'VIII',
  '9': 'IX',
  '10': 'X',
};

/**
 * Convert a trailing Arabic numeral (after underscore) to Roman.
 * e.g. "Urgent_Totems_2" → "Urgent_Totems_II"
 * Returns the slug unchanged if no trailing numeral or numeral > 10.
 */
export function normalizeTrailingArabicToRoman(slug: string): string {
  const match = /^(.+_)(\d+)$/.exec(slug);
  if (!match) return slug;
  const roman = ARABIC_TO_ROMAN[match[2]!];
  return roman ? match[1]! + roman : slug;
}

/**
 * Supported language codes for poe2db.tw.
 * - us: English
 * - tw: Chinese Traditional (Taiwan)
 * - cn: Chinese Simplified
 * - kr: Korean
 * - jp: Japanese
 * - ru: Russian
 * - de: German
 * - fr: French
 * - sp: Spanish
 * - pt: Portuguese
 * - th: Thai
 */
export type Poe2dbLang = 'us' | 'tw' | 'cn' | 'kr' | 'jp' | 'ru' | 'de' | 'fr' | 'sp' | 'pt' | 'th';

/**
 * Fetch HTML page from poe2db.tw for a given term.
 * Automatically normalizes trailing Arabic numerals to Roman (e.g. _2 → _II)
 * and retries with the original slug on 404 if normalization was applied.
 */
export async function getPoe2dbPage(term: string, lang: Poe2dbLang = 'us'): Promise<string> {
  const slug = term.replace(/\s+/g, '_');
  const normalizedSlug = normalizeTrailingArabicToRoman(slug);
  const headers = { 'User-Agent': USER_AGENT, Accept: 'text/html' };

  const res = await fetch(`https://poe2db.tw/${lang}/${normalizedSlug}`, {
    headers,
  });

  if (res.ok) return res.text();

  if (res.status === 404 && normalizedSlug !== slug) {
    const retry = await fetch(`https://poe2db.tw/${lang}/${slug}`, { headers });
    if (retry.ok) return retry.text();
  }

  throw new Error(`poe2db returned ${res.status} for "${term}"`);
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

// ─── Client.txt log parsing ───────────────────────────────────────────

/**
 * Decoded zone code metadata from PoE2's internal naming convention.
 * Format: G{act}_{area} or G{act}_{area}_{suffix}
 * Examples: G3_10 = Act 3, area 10; G3_town = Act 3 town
 */
export interface DecodedZoneCode {
  act: number;
  areaIndex: number | null;
  suffix: string | null;
  description: string;
  englishName: string | null;
}

/**
 * Canonical English zone names by area ID.
 * Used as fallback when SCENE message is missing or for LLM translation.
 */
const ZONE_NAMES: Record<string, string> = {
  // Act 1
  G1_town: 'Clearfell Encampment',
  G1_1: 'The Riverways',
  G1_2: 'Clearfell',
  G1_3: 'The Mud Burrow',
  G1_4: 'Ogham Farmlands',
  G1_5: 'Ogham Village',
  G1_6: 'The Grim Tangle',
  G1_7: 'Cemetery of the Eternals',
  G1_8: 'Mausoleum of the Praetor',
  G1_9: 'Freythorn',
  G1_10: 'The Hunting Grounds',
  G1_11: 'Red Vale',
  G1_12: 'The Grelwood',
  G1_13: 'The Bloated Miller',
  G1_14: 'Shrine of the Grelwood Wanderer',
  // Act 2
  G2_town: 'Vastiri Outskirts',
  G2_1: 'Mawdun Quarry',
  G2_2: 'The Bone Pits',
  G2_3: 'Valley of Bones',
  G2_4: 'Deshar',
  G2_5: 'The Halani Gates',
  G2_6: 'The Path of Mourning',
  G2_7: 'Mastodon Cemetary',
  G2_8: 'Sandswept Marsh',
  G2_9: 'Keth',
  G2_10: "Traitor's Passage",
  G2_11: 'The Lost City',
  G2_12: 'The Dreadnought',
  G2_13: 'Dreadnought Vanguard',
  G2_14: 'The Titan Grotto',
  G2_15: 'The Drowned City',
  // Act 3
  G3_town: 'Ziggurat Encampment',
  G3_1: 'Jungle Ruins',
  G3_2: 'Infested Barrens',
  G3_3: 'Jungle Depths',
  G3_4: "Jiquani's Machinarium",
  G3_5: 'Chimeral Wetlands',
  G3_6: 'The Azak Bog',
  G3_7: 'Aggorat',
  G3_8: 'Utzaal',
  G3_9: 'Apex of Filth',
  G3_10: 'The Trial of Chaos',
  G3_11: 'The Temple of Chaos',
  G3_10_Airlock: 'Temple of Chaos (Entrance)',
  G3_Vault_Present: 'Treasure Vault (Present)',
  G3_Vault_Past: 'Treasure Vault (Past)',
  // Act 4
  G4_town: 'Ngakuramakoi',
  G4_1: 'Kingsmarch',
  G4_2: 'Rocky Outcrop',
  G4_3: 'Volcanic Island',
  G4_4: "Castaway's Isle",
  G4_5: 'Island of the Wai-Tangi',
  G4_6: 'Coastal Path',
  G4_7: 'Moata Shore',
  G4_8: "Journey's End",
  G4_9: 'Isle of Kin',
  G4_10: 'Hidden Vaults',
  G4_11: 'Slave Pens',
  G4_12: 'Moten Fortress',
};

/**
 * Decode a PoE2 zone code into structured metadata.
 * Zone codes follow the pattern: G{act}_{area}[_{suffix}]
 * - G = Group/Graph identifier
 * - {act} = Act number (1-6+)
 * - {area} = Area index within act (numeric) or special area (town, etc.)
 * - {suffix} = Optional modifier (Airlock, Boss, etc.)
 *
 * @param areaId — Raw zone code from logs (e.g., "G3_10", "G3_town", "G3_10_Airlock")
 * @returns Decoded metadata or null if format not recognized
 */
export function decodeZoneCode(areaId: string): DecodedZoneCode | null {
  // Match pattern: G{act}_{area}[_{suffix}]
  const match = /^G(\d+)_(\w+?)(?:_(.+))?$/.exec(areaId);
  if (!match) return null;

  const act = parseInt(match[1]!, 10);
  const areaRaw = match[2]!;
  const suffix = match[3] ?? null;

  // Parse area index (numeric) or special area name
  const areaIndex = /^\d+$/.test(areaRaw) ? parseInt(areaRaw, 10) : null;

  // Look up canonical English name
  const englishName = ZONE_NAMES[areaId] ?? null;

  // Build human-readable description
  let description = `Act ${act}`;
  if (areaRaw === 'town') {
    description += ' Town';
  } else if (areaIndex !== null) {
    description += `, area ${areaIndex}`;
  } else {
    description += ` (${areaRaw})`;
  }
  if (suffix) {
    description += ` [${suffix}]`;
  }

  return { act, areaIndex, suffix, description, englishName };
}

/**
 * Event categories based on structural log format (language-agnostic).
 * - player: Game notifications shown to player (`: ` prefix) — deaths, level-ups, item events, etc.
 * - trade_chat: Trade channel messages (`#channel:` prefix)
 * - whisper: Private messages (`@player:` prefix)
 * - system: Engine/subsystem logs (`[CATEGORY]` prefix)
 */
export type LogEventCategory = 'player' | 'trade_chat' | 'whisper' | 'system';

/**
 * A universal log event with structural categorization.
 * Raw message text is preserved for LLM interpretation (language-agnostic).
 */
export interface LogEvent {
  timestamp: Date;
  category: LogEventCategory;
  rawMessage: string;
  subsystem: string | null;
  clientPid: number;
}

/** A single zone visit extracted from the log. */
export interface ZoneVisit {
  timestamp: Date;
  areaId: string;
  areaLevel: number;
  zoneName: string | null;
  decoded: DecodedZoneCode | null;
}

/** Boundaries of a play session (LOG FILE OPENING to next opening or EOF). */
export interface PlaySession {
  startTime: Date;
  endTime: Date | null;
  clientPid: number | null;
}

/**
 * Complete parsed result from a Client.txt tail.
 * Uses structural categorization instead of language-specific event parsing.
 * The LLM can interpret raw player messages to identify deaths, level-ups, etc.
 */
export interface ParsedLogData {
  sessions: PlaySession[];
  zoneVisits: ZoneVisit[];
  playerEvents: LogEvent[];
  lastZone: ZoneVisit | null;
  summary: {
    totalPlayerEvents: number;
    totalZoneVisits: number;
    totalSessions: number;
  };
}

/**
 * Regex patterns for parsing Client.txt log lines.
 * These are language-agnostic (structural patterns only).
 */
const LINE_RE =
  /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}) \d+ [0-9a-f]+ \[(\w+) Client (\d+)\] (.+)$/;
const ZONE_GEN_RE = /^Generating level (\d+) area "([^"]+)" with seed \d+$/;
const SCENE_RE = /^\[SCENE\] Set Source \[(.+)\]$/;
const SUBSYSTEM_RE = /^\[([A-Z0-9_]+)\] /;
const LOG_OPENING_RE = /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}) \*{5} LOG FILE OPENING \*{5}$/;

/**
 * Default log file paths by platform.
 * Prioritizes LatestClient.txt (current session, faster reads) with Client.txt fallback (full history).
 */
const DEFAULT_LOG_PATHS: Record<string, string[]> = {
  win32: [
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile 2\\logs\\LatestClient.txt',
    'C:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile 2\\logs\\LatestClient.txt',
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile 2\\logs\\Client.txt',
    'C:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile 2\\logs\\Client.txt',
  ],
  darwin: [
    path.join(
      os.homedir(),
      'Library/Application Support/Steam/steamapps/common/Path of Exile 2/logs/LatestClient.txt',
    ),
    path.join(
      os.homedir(),
      'Library/Application Support/Steam/steamapps/common/Path of Exile 2/logs/Client.txt',
    ),
  ],
  linux: [
    path.join(os.homedir(), '.steam/steam/steamapps/common/Path of Exile 2/logs/LatestClient.txt'),
    path.join(os.homedir(), '.steam/steam/steamapps/common/Path of Exile 2/logs/Client.txt'),
  ],
};

/**
 * Resolve log file path via auto-detection or explicit override.
 * Prioritizes LatestClient.txt (current session) with Client.txt fallback (full history).
 * @param overridePath — Optional explicit path. If provided, returns it directly.
 * @param poe2InstallPath — Optional PoE2 installation directory (from --poe2-path CLI arg).
 * @returns Resolved absolute path to LatestClient.txt or Client.txt.
 * @throws Error if no path exists with detailed troubleshooting guidance.
 */
export function resolveLogFilePath(overridePath?: string, poe2InstallPath?: string): string {
  if (overridePath && overridePath.trim() !== '') {
    return overridePath;
  }

  // If PoE2 install path configured via CLI, construct logs path from it
  if (poe2InstallPath && poe2InstallPath.trim() !== '') {
    const logsDir = path.join(poe2InstallPath, 'logs');
    const latestPath = path.join(logsDir, 'LatestClient.txt');
    if (existsSync(latestPath)) {
      return latestPath;
    }
    const clientPath = path.join(logsDir, 'Client.txt');
    if (existsSync(clientPath)) {
      return clientPath;
    }
    // Configured path doesn't have logs — continue to auto-detection
  }

  const candidates = DEFAULT_LOG_PATHS[process.platform] ?? [];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  const triedPaths = candidates.map((p) => `- \`${p}\``).join('\n');
  const errorMsg = `## PoE2 log file not found

Auto-detection failed. Checked:

${triedPaths}

**Advise the user:** They have a non-standard PoE2 installation path. To fix this permanently, they need to update their MCP client configuration.

**For Claude Desktop**, edit the config file:
- Windows: \`%APPDATA%\\Claude\\claude_desktop_config.json\`
- macOS: \`~/Library/Application Support/Claude/claude_desktop_config.json\`

Add \`args\` with their PoE2 install path:

\`\`\`json
{
  "mcpServers": {
    "poe2": {
      "command": "node",
      "args": [
        "path/to/poe2-mcp-server/dist/index.js",
        "--poe2-path",
        "D:\\\\Games\\\\Path of Exile 2"
      ]
    }
  }
}
\`\`\`

Replace \`D:\\\\Games\\\\Path of Exile 2\` with their actual installation directory.`;

  throw new Error(errorMsg);
}

/**
 * Get fallback log path when LatestClient.txt has insufficient data.
 * Returns Client.txt path if currentPath is LatestClient.txt, otherwise null.
 * @param currentPath — Currently resolved log file path.
 * @returns Client.txt fallback path or null if not applicable.
 */
export function getFallbackLogPath(currentPath: string): string | null {
  if (!currentPath.includes('LatestClient.txt')) {
    return null; // Already using Client.txt or custom path
  }

  const clientPath = currentPath.replace('LatestClient.txt', 'Client.txt');
  if (existsSync(clientPath)) {
    return clientPath;
  }
  return null;
}

/**
 * Check if parsed log data has sufficient content for useful analysis.
 * Returns false if data is too sparse (e.g., user just restarted game).
 * @param data — Parsed log data.
 * @returns true if data is sufficient, false if fallback should be tried.
 */
export function hasSubstantialLogData(data: ParsedLogData): boolean {
  // At least 3 zone visits OR 5 player events indicates useful data
  return data.summary.totalZoneVisits >= 3 || data.summary.totalPlayerEvents >= 5;
}

/**
 * Read the last N lines from a file.
 * @param filePath — Absolute path to the file.
 * @param maxLines — Number of lines to read from the end.
 * @returns Array of lines (last maxLines lines).
 */
export function readLogTail(filePath: string, maxLines: number): string[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  return lines.slice(-maxLines);
}

/**
 * Parse Client.txt log lines into structured game session data.
 * Uses structural categorization (language-agnostic) instead of content-specific parsing.
 * Player events are returned raw for LLM interpretation.
 * @param lines — Array of log lines (from readLogTail).
 * @returns Parsed sessions, zones, and categorized events.
 */
export function parseClientLog(lines: string[]): ParsedLogData {
  const sessions: PlaySession[] = [];
  const zoneVisits: ZoneVisit[] = [];
  const playerEvents: LogEvent[] = [];

  let currentZone: ZoneVisit | null = null;
  let currentPid: number | null = null;
  let lastTimestamp: Date | null = null;

  for (const line of lines) {
    // Session boundary (with timestamp)
    const sessionMatch = LOG_OPENING_RE.exec(line);
    if (sessionMatch) {
      const sessionTimestamp = new Date(sessionMatch[1]!);
      if (sessions.length > 0) {
        sessions[sessions.length - 1]!.endTime = lastTimestamp;
      }
      sessions.push({
        startTime: sessionTimestamp,
        endTime: null,
        clientPid: currentPid,
      });
      lastTimestamp = sessionTimestamp;
      continue;
    }

    // Parse base line structure
    const lineMatch = LINE_RE.exec(line);
    if (!lineMatch) continue;

    const timestamp = new Date(lineMatch[1]!);
    const pid = parseInt(lineMatch[3]!, 10);
    const message = lineMatch[4]!;

    lastTimestamp = timestamp;
    currentPid = pid;

    // Zone generation (language-agnostic, technical format)
    const zoneGenMatch = ZONE_GEN_RE.exec(message);
    if (zoneGenMatch) {
      const areaId = zoneGenMatch[2]!;
      currentZone = {
        timestamp,
        areaLevel: parseInt(zoneGenMatch[1]!, 10),
        areaId,
        zoneName: null,
        decoded: decodeZoneCode(areaId),
      };
      zoneVisits.push(currentZone);
      continue;
    }

    // Zone name from scene (language-agnostic)
    // Skip placeholder values like "(null)", "(unknown)" — wait for real name
    const sceneMatch = SCENE_RE.exec(message);
    if (sceneMatch && currentZone) {
      const sceneName = sceneMatch[1]!;
      const isPlaceholder =
        sceneName === '(null)' ||
        sceneName === '(unknown)' ||
        sceneName === 'null' ||
        sceneName === 'unknown';
      if (!isPlaceholder) {
        currentZone.zoneName = sceneName;
      }
      continue;
    }

    // Categorize events by structural prefix (language-agnostic)
    if (message.startsWith(': ')) {
      // Player events: game notifications (deaths, level-ups, items, trades, etc.)
      playerEvents.push({
        timestamp,
        category: 'player',
        rawMessage: message.slice(2), // Remove ": " prefix
        subsystem: null,
        clientPid: pid,
      });
    } else if (message.startsWith('#')) {
      // Trade/global chat: #channel: message
      playerEvents.push({
        timestamp,
        category: 'trade_chat',
        rawMessage: message,
        subsystem: null,
        clientPid: pid,
      });
    } else if (message.startsWith('@')) {
      // Whispers: @player: message
      playerEvents.push({
        timestamp,
        category: 'whisper',
        rawMessage: message,
        subsystem: null,
        clientPid: pid,
      });
    } else {
      // Check for system messages with [CATEGORY] prefix
      const subsystemMatch = SUBSYSTEM_RE.exec(message);
      if (subsystemMatch) {
        // Skip verbose system logs to avoid noise
        // Only capture important subsystems if needed in future
        continue;
      }
    }
  }

  // Close final session
  if (sessions.length > 0 && sessions[sessions.length - 1]!.endTime === null) {
    sessions[sessions.length - 1]!.endTime = lastTimestamp;
  }

  return {
    sessions,
    zoneVisits,
    playerEvents,
    lastZone: zoneVisits.length > 0 ? zoneVisits[zoneVisits.length - 1]! : null,
    summary: {
      totalPlayerEvents: playerEvents.length,
      totalZoneVisits: zoneVisits.length,
      totalSessions: sessions.length,
    },
  };
}
