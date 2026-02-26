/**
 * HTTP client for public PoE2 APIs (poe.ninja, poe2db, wiki, RePoE).
 * No authentication required — all endpoints are public.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

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

// pobb.in: 10 req / 60 sec (undocumented, conservative limit)
const pobbinLimiter = new RateLimiter(10, 60 * 1000);

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

export interface BuildClassStatistic {
  class: string;
  percentage: number;
  trend: number;
}

export interface BuildLeagueEntry {
  leagueName: string;
  leagueUrl: string;
  total: number;
  status: number;
  statistics: BuildClassStatistic[];
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

  const res = await fetch(`https://poe2db.tw/${lang}/${encodeURIComponent(normalizedSlug)}`, {
    headers,
  });

  if (res.ok) return res.text();

  if (res.status === 404 && normalizedSlug !== slug) {
    const retry = await fetch(`https://poe2db.tw/${lang}/${encodeURIComponent(slug)}`, { headers });
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

// ─── Path of Building 2 (PoB2) Types ──────────────────────────────────

/** Options for PoB2 tool registration. */
export interface PobToolOptions {
  pob2BuildsPath?: string;
}

/** Equipment slot identifiers used in PoB. */
export type PobSlot =
  | 'Helmet'
  | 'Body Armour'
  | 'Gloves'
  | 'Boots'
  | 'Amulet'
  | 'Ring 1'
  | 'Ring 2'
  | 'Belt'
  | 'Weapon 1'
  | 'Weapon 2'
  | 'Weapon 1 Swap'
  | 'Weapon 2 Swap'
  | 'Flask 1'
  | 'Flask 2'
  | 'Flask 3'
  | 'Flask 4'
  | 'Flask 5';

/** Rarity levels in PoE2. */
export type PobRarity = 'Normal' | 'Magic' | 'Rare' | 'Unique' | 'Relic';

/** Decoded build metadata from PoB XML <Build> element. */
export interface PobBuildMetadata {
  className: string;
  ascendancy: string | null;
  level: number;
  bandit: string | null;
  pantheonMajor: string | null;
  pantheonMinor: string | null;
  mainSocketGroup: number | null;
}

/** Parsed item from PoB XML <Item> text block. */
export interface PobItem {
  slot: PobSlot | string;
  rarity: PobRarity;
  name: string | null;
  base: string;
  itemLevel: number;
  levelRequirement: number;
  quality: number;
  armour: number;
  evasion: number;
  energyShield: number;
  sockets: string | null;
  implicits: string[];
  explicits: string[];
  corrupted: boolean;
}

/** Parsed gem from PoB XML <Gem> element. */
export interface PobGem {
  name: string;
  nameSpec: string;
  level: number;
  quality: number;
  enabled: boolean;
  isSupport: boolean;
}

/** Parsed skill group from PoB XML <Skill> element. */
export interface PobSkillGroup {
  label: string | null;
  slot: string | null;
  enabled: boolean;
  gems: PobGem[];
  activeGem: PobGem | null;
  supportGems: PobGem[];
}

/** Parsed passive tree from PoB XML <Tree> element. */
export interface PobPassiveTree {
  version: string;
  activeSpec: number;
  allocatedNodes: number[];
  masteryEffects: Array<{ nodeId: number; effectId: number }>;
}

/** Resolved passive tree with readable names (requires tree data). */
export interface PobResolvedTree {
  version: string;
  allocatedCount: number;
  keystones: string[];
  notables: string[];
  masteries: Array<{ node: string; effect: string }>;
}

/** Configuration flags from PoB XML <Config>. */
export type PobConfig = Record<string, string | boolean | number>;

/** Complete parsed PoB build. */
export interface PobBuild {
  metadata: PobBuildMetadata;
  items: PobItem[];
  skills: PobSkillGroup[];
  tree: PobPassiveTree;
  resolvedTree: PobResolvedTree | null;
  config: PobConfig;
  notes: string;
  xmlSource: 'code' | 'file';
}

/** Item comparison diff entry. */
export interface PobItemDiff {
  slot: string;
  current: PobItem | null;
  reference: PobItem | null;
  delta: string | null;
}

/** Tree comparison diff. */
export interface PobTreeDiff {
  missingNodes: string[];
  extraNodes: string[];
  matchingKeystones: string[];
}

/** Skill comparison diff. */
export interface PobSkillDiff {
  missingGems: string[];
  extraGems: string[];
  differentSupports: Array<{
    skill: string;
    currentSupport: string;
    referenceSupport: string;
  }>;
}

/** Complete comparison result. */
export interface PobCompareResult {
  summary: string;
  items: {
    upgradesNeeded: PobItemDiff[];
    matching: string[];
    missingInCurrent: string[];
  };
  tree: PobTreeDiff;
  skills: PobSkillDiff;
}

/** Local build file entry for directory listing. */
export interface PobLocalBuildEntry {
  filename: string;
  className: string | null;
  ascendancy: string | null;
  level: number | null;
  lastModified: Date;
}

// ─── Path of Building 2 (PoB2) Service Functions ─────────────────────

/**
 * Default PoB2 builds directory paths by platform.
 * The official folder name for PoE2 is "Path of Building (PoE2)" per
 * https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/master/src/Modules/Main.lua
 * Some older installs may use "Path of Building Community (PoE2)".
 * pasteofexile default installs to Documents folder on Windows.
 */
const DEFAULT_POB2_PATHS: Record<string, string[]> = {
  win32: [
    path.join(os.homedir(), 'Documents', 'Path of Building (PoE2)', 'Builds'),
    path.join(os.homedir(), 'Documents', 'Path of Building Community (PoE2)', 'Builds'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'Path of Building (PoE2)', 'Builds'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'Path of Building Community (PoE2)', 'Builds'),
  ],
  darwin: [
    path.join(os.homedir(), 'Library', 'Application Support', 'Path of Building (PoE2)', 'Builds'),
    path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Path of Building Community (PoE2)',
      'Builds',
    ),
  ],
  linux: [
    path.join(os.homedir(), '.config', 'Path of Building (PoE2)', 'Builds'),
    path.join(os.homedir(), '.config', 'Path of Building Community (PoE2)', 'Builds'),
  ],
};

/**
 * Decode a PoB code string to XML.
 * Pipeline: URL-safe reversal → Base64 decode → Zlib inflate → UTF-8 string.
 * @param code - PoB code string (base64, URL-safe encoded)
 * @returns Decoded XML string
 * @throws Error if decoding fails
 */
export function decodePobCode(code: string): string {
  const trimmed = code.trim();
  const base64 = trimmed.replace(/-/g, '+').replace(/_/g, '/');

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    throw new Error('Invalid PoB code: not valid base64 encoding');
  }

  if (buffer.length === 0) {
    throw new Error('Invalid PoB code: empty after base64 decode');
  }

  let decompressed: Buffer;
  try {
    decompressed = inflateSync(buffer);
  } catch {
    throw new Error('Invalid PoB code: decompression failed');
  }

  return decompressed.toString('utf-8');
}

/**
 * Detect if a string is a pobb.in URL and extract the paste ID.
 * @param input - PoB code, pobb.in URL, or local build name
 * @returns Extracted paste ID or null if not a pobb.in URL
 */
export function extractPobbinId(input: string): string | null {
  const trimmed = input.trim();
  // Match: https://pobb.in/id, http://pobb.in/id, pobb.in/id
  const match = /^(?:https?:\/\/)?pobb\.in\/(.+)$/i.exec(trimmed);
  if (match) {
    // Remove trailing /raw if present
    return match[1]!.replace(/\/raw$/, '');
  }
  return null;
}

/**
 * Fetch raw PoB code from pobb.in.
 * @param id - Paste ID (e.g., "abc123" or "u/username/abc123")
 * @returns PoB code string
 * @throws Error on HTTP failure
 */
export async function fetchPobbinCode(id: string): Promise<string> {
  await pobbinLimiter.wait();

  const url = `https://pobb.in/${encodeURIComponent(id)}/raw`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (res.status === 404) {
    throw new Error('pobb.in paste not found. Check the URL and ensure the paste still exists.');
  }
  if (res.status === 429) {
    throw new Error('pobb.in rate limit exceeded. Try again in a minute.');
  }
  if (!res.ok) {
    throw new Error(`pobb.in returned HTTP ${res.status}`);
  }

  return res.text();
}

/**
 * Parse a single item text block from PoB XML.
 * @param itemText - Multi-line item text from PoB XML <Item> element
 * @param slot - Equipment slot identifier
 * @returns Parsed item or null if invalid
 */
export function parseItemText(itemText: string, slot: string): PobItem | null {
  const lines = itemText.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return null;

  // Parse rarity
  const rarityLine = lines[0];
  const rarityMatch = /^Rarity:\s*(\w+)/i.exec(rarityLine ?? '');
  if (!rarityMatch) return null;

  const rarityStr = rarityMatch[1]!.toUpperCase();
  let rarity: PobRarity;
  switch (rarityStr) {
    case 'NORMAL':
      rarity = 'Normal';
      break;
    case 'MAGIC':
      rarity = 'Magic';
      break;
    case 'RARE':
      rarity = 'Rare';
      break;
    case 'UNIQUE':
      rarity = 'Unique';
      break;
    case 'RELIC':
      rarity = 'Relic';
      break;
    default:
      rarity = 'Normal';
  }

  // Name and base type
  let name: string | null = null;
  let base: string;
  if (rarity === 'Rare' || rarity === 'Unique' || rarity === 'Relic') {
    name = lines[1] ?? null;
    base = lines[2] ?? lines[1] ?? '';
  } else {
    base = lines[1] ?? '';
  }

  // Parse numeric values
  let itemLevel = 0;
  let levelRequirement = 0;
  let quality = 0;
  let armour = 0;
  let evasion = 0;
  let energyShield = 0;
  let sockets: string | null = null;
  let corrupted = false;
  const implicits: string[] = [];
  const explicits: string[] = [];

  let inImplicits = false;
  let implicitCount = 0;
  let implicitsParsed = 0;

  for (let i = 3; i < lines.length; i++) {
    const line = lines[i]!.trim();

    // Skip separators
    if (line === '--------') continue;

    // Parse numeric stats
    const itemLevelMatch = /^Item Level:\s*(\d+)/i.exec(line);
    if (itemLevelMatch) {
      itemLevel = parseInt(itemLevelMatch[1]!, 10);
      continue;
    }

    const levelReqMatch = /^Level:\s*(\d+)/i.exec(line);
    if (levelReqMatch) {
      levelRequirement = parseInt(levelReqMatch[1]!, 10);
      continue;
    }

    const qualityMatch = /^Quality:\s*\+?(\d+)%/i.exec(line);
    if (qualityMatch) {
      quality = parseInt(qualityMatch[1]!, 10);
      continue;
    }

    const armourMatch = /^Armou?r:\s*(\d+)/i.exec(line);
    if (armourMatch) {
      armour = parseInt(armourMatch[1]!, 10);
      continue;
    }

    const evasionMatch = /^Evasion(?:\s*Rating)?:\s*(\d+)/i.exec(line);
    if (evasionMatch) {
      evasion = parseInt(evasionMatch[1]!, 10);
      continue;
    }

    const esMatch = /^Energy Shield:\s*(\d+)/i.exec(line);
    if (esMatch) {
      energyShield = parseInt(esMatch[1]!, 10);
      continue;
    }

    const socketsMatch = /^Sockets:\s*(.+)/i.exec(line);
    if (socketsMatch) {
      sockets = socketsMatch[1]!.trim();
      continue;
    }

    // Check for corrupted
    if (line === 'Corrupted') {
      corrupted = true;
      continue;
    }

    // Implicits header
    const implicitsMatch = /^Implicits:\s*(\d+)/i.exec(line);
    if (implicitsMatch) {
      implicitCount = parseInt(implicitsMatch[1]!, 10);
      inImplicits = true;
      implicitsParsed = 0;
      continue;
    }

    // Skip requirement lines
    if (/^(Str|Dex|Int|Requirements):/.test(line)) continue;

    // Collect mods
    if (inImplicits && implicitsParsed < implicitCount) {
      implicits.push(line);
      implicitsParsed++;
      if (implicitsParsed >= implicitCount) {
        inImplicits = false;
      }
    } else if (!line.startsWith('{') || line.includes('}')) {
      // Skip PoB command lines like {variant:1}
      const modLine = line.replace(/^\{[^}]*\}\s*/, '');
      if (modLine && !modLine.startsWith('{')) {
        explicits.push(modLine);
      }
    }
  }

  return {
    slot: slot as PobSlot | string,
    rarity,
    name,
    base,
    itemLevel,
    levelRequirement,
    quality,
    armour,
    evasion,
    energyShield,
    sockets,
    implicits,
    explicits,
    corrupted,
  };
}

/**
 * Parse tree spec URL to extract allocated node IDs.
 * @param specUrl - Tree URL from PoB XML
 * @returns Array of node hash IDs
 */
function parseTreeSpec(specUrl: string): number[] {
  // PoB tree URL format: https://www.pathofexile.com/passive-skill-tree/AAAABg...
  // or just the encoded portion
  const match = /[?/]([A-Za-z0-9_-]+)$/.exec(specUrl);
  if (!match) return [];

  try {
    const base64 = match[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const buffer = Buffer.from(base64, 'base64');

    // The format is: 4 bytes version, 1 byte class, 1 byte ascendancy, then 2-byte node IDs
    const nodes: number[] = [];
    for (let i = 6; i < buffer.length; i += 2) {
      if (i + 1 < buffer.length) {
        nodes.push(buffer.readUInt16BE(i));
      }
    }
    return nodes;
  } catch {
    return [];
  }
}

/**
 * Parse PoB XML into structured PobBuild object.
 * @param xml - Decoded PoB XML string
 * @param source - Source type ('code' or 'file')
 * @returns Parsed build data
 */
export function parsePobXml(xml: string, source: 'code' | 'file'): PobBuild {
  // Extract <Build> attributes
  const buildMatch = /<Build\s([^>]+)>/i.exec(xml);
  const buildAttrs = buildMatch?.[1] ?? '';

  const getAttr = (name: string): string | null => {
    const match = new RegExp(`${name}="([^"]*)"`, 'i').exec(buildAttrs);
    return match?.[1] ?? null;
  };

  const metadata: PobBuildMetadata = {
    className: getAttr('className') ?? 'Unknown',
    ascendancy: getAttr('ascendClassName') || null,
    level: parseInt(getAttr('level') ?? '1', 10),
    bandit: getAttr('bandit') || null,
    pantheonMajor: getAttr('pantheonMajorGod') || null,
    pantheonMinor: getAttr('pantheonMinorGod') || null,
    mainSocketGroup: getAttr('mainSocketGroup') ? parseInt(getAttr('mainSocketGroup')!, 10) : null,
  };

  // Parse items (handle attributes on Items tag in PoB2 local files)
  const items: PobItem[] = [];
  const itemsMatch = /<Items[^>]*>([\s\S]*?)<\/Items>/i.exec(xml);
  if (itemsMatch) {
    const itemsBlock = itemsMatch[1]!;

    // Extract slot assignments (handle attributes in any order)
    const slotAssignments = new Map<number, string>();
    const slotRegex = /<Slot\s+([^>]+)\/?>/gi;
    let slotMatch;
    while ((slotMatch = slotRegex.exec(itemsBlock)) !== null) {
      const attrs = slotMatch[1]!;
      const nameMatch = /name="([^"]+)"/.exec(attrs);
      const itemIdMatch = /itemId="(\d+)"/.exec(attrs);
      if (nameMatch && itemIdMatch) {
        const itemId = parseInt(itemIdMatch[1]!, 10);
        if (itemId > 0) {
          slotAssignments.set(itemId, nameMatch[1]!);
        }
      }
    }

    // Extract item blocks
    const itemRegex = /<Item\s+id="(\d+)"[^>]*>([\s\S]*?)<\/Item>/gi;
    let itemMatch;
    while ((itemMatch = itemRegex.exec(itemsBlock)) !== null) {
      const itemId = parseInt(itemMatch[1]!, 10);
      const itemText = itemMatch[2]!
        .replace(/<!?\[CDATA\[/g, '')
        .replace(/\]\]>/g, '')
        .replace(/<ModRange[^>]*\/>/gi, '') // Strip PoB2 ModRange elements
        .replace(/<[^>]+>/g, '') // Strip any remaining XML tags
        .trim();
      const slot = slotAssignments.get(itemId) ?? `Item ${itemId}`;
      const parsed = parseItemText(itemText, slot);
      if (parsed) {
        items.push(parsed);
      }
    }
  }

  // Parse skills (handle SkillSet wrapping in PoB2 local files)
  const skills: PobSkillGroup[] = [];
  const skillsMatch = /<Skills[^>]*>([\s\S]*?)<\/Skills>/i.exec(xml);
  if (skillsMatch) {
    // Search entire skills block including inside SkillSet elements
    const skillsBlock = skillsMatch[1]!;
    const skillRegex = /<Skill\s+([^>]*)>([\s\S]*?)<\/Skill>|<Skill\s+([^>]*)\s*\/>/gi;
    let skillMatch;
    while ((skillMatch = skillRegex.exec(skillsBlock)) !== null) {
      const attrs = skillMatch[1] || skillMatch[3] || '';
      const content = skillMatch[2] || '';

      const getLabelAttr = (name: string): string | null => {
        const match = new RegExp(`${name}="([^"]*)"`, 'i').exec(attrs);
        return match?.[1] ?? null;
      };

      const enabled = getLabelAttr('enabled') !== 'false';
      const label = getLabelAttr('label') || null;
      const slot = getLabelAttr('slot') || null;

      const gems: PobGem[] = [];
      const gemRegex = /<Gem\s+([^>]+)\s*\/?>/gi;
      let gemMatch;
      while ((gemMatch = gemRegex.exec(content)) !== null) {
        const gemAttrs = gemMatch[1]!;
        const getGemAttr = (name: string): string | null => {
          const match = new RegExp(`${name}="([^"]*)"`, 'i').exec(gemAttrs);
          return match?.[1] ?? null;
        };

        // Prefer nameSpec for friendly name, fall back to gemId (metadata path)
        const nameSpec = getGemAttr('nameSpec');
        const gemId = getGemAttr('gemId') ?? '';
        const displayName = nameSpec ?? getGemAttr('skillId') ?? gemId ?? 'Unknown';
        const isSupport =
          displayName.toLowerCase().includes('support') || gemId.toLowerCase().includes('support');

        gems.push({
          name: displayName,
          nameSpec: nameSpec ?? displayName,
          level: parseInt(getGemAttr('level') ?? '1', 10),
          quality: parseInt(getGemAttr('quality') ?? '0', 10),
          enabled: getGemAttr('enabled') !== 'false',
          isSupport,
        });
      }

      const activeGem = gems.find((g) => !g.isSupport && g.enabled) ?? null;
      const supportGems = gems.filter((g) => g.isSupport && g.enabled);

      skills.push({
        label,
        slot,
        enabled,
        gems,
        activeGem,
        supportGems,
      });
    }
  }

  // Parse tree
  const treeMatch = /<Tree\s+([^>]*)>([\s\S]*?)<\/Tree>/i.exec(xml);
  const treeAttrs = treeMatch?.[1] ?? '';
  const treeContent = treeMatch?.[2] ?? '';

  const activeSpec = parseInt(
    new RegExp('activeSpec="(\\d+)"', 'i').exec(treeAttrs)?.[1] ?? '1',
    10,
  );

  // Find the active Spec element
  let allocatedNodes: number[] = [];
  let treeVersion = '0.4';
  const specRegex = /<Spec\s+([^>]*)>([\s\S]*?)<\/Spec>/gi;
  let specIndex = 1;
  let specMatch;
  while ((specMatch = specRegex.exec(treeContent)) !== null) {
    if (specIndex === activeSpec) {
      const specAttrs = specMatch[1] ?? '';
      const specContent = specMatch[2] ?? '';

      const versionMatch = /treeVersion="([^"]+)"/i.exec(specAttrs);
      if (versionMatch) treeVersion = versionMatch[1]!;

      // Extract URL with encoded nodes
      const urlMatch = /<URL>([\s\S]*?)<\/URL>/i.exec(specContent);
      if (urlMatch) {
        allocatedNodes = parseTreeSpec(urlMatch[1]!.trim());
      }
      break;
    }
    specIndex++;
  }

  // Parse masteries
  const masteryEffects: Array<{ nodeId: number; effectId: number }> = [];
  const masteryRegex = /<MasteryEffect\s+([^>]+)\s*\/?>/gi;
  let masteryMatch;
  while ((masteryMatch = masteryRegex.exec(treeContent)) !== null) {
    const attrs = masteryMatch[1]!;
    const nodeId = parseInt(new RegExp('nodeId="(\\d+)"', 'i').exec(attrs)?.[1] ?? '0', 10);
    const effectId = parseInt(new RegExp('effect="(\\d+)"', 'i').exec(attrs)?.[1] ?? '0', 10);
    if (nodeId && effectId) {
      masteryEffects.push({ nodeId, effectId });
    }
  }

  const tree: PobPassiveTree = {
    version: treeVersion,
    activeSpec,
    allocatedNodes,
    masteryEffects,
  };

  // Parse config
  const config: PobConfig = {};
  const configMatch = /<Config>([\s\S]*?)<\/Config>/i.exec(xml);
  if (configMatch) {
    const configRegex = /<Input\s+([^>]+)\s*\/?>/gi;
    let configEntry;
    while ((configEntry = configRegex.exec(configMatch[1]!)) !== null) {
      const attrs = configEntry[1]!;
      const name = new RegExp('name="([^"]*)"', 'i').exec(attrs)?.[1];
      let value: string | boolean | number | null = null;

      const boolMatch = /boolean="(\w+)"/i.exec(attrs);
      const numMatch = /number="([\d.]+)"/i.exec(attrs);
      const strMatch = /string="([^"]*)"/i.exec(attrs);

      if (boolMatch) value = boolMatch[1] === 'true';
      else if (numMatch) value = parseFloat(numMatch[1]!);
      else if (strMatch) value = strMatch[1]!;

      if (name && value !== null) {
        config[name] = value;
      }
    }
  }

  // Parse notes
  const notesMatch = /<Notes>([\s\S]*?)<\/Notes>/i.exec(xml);
  const notes =
    notesMatch?.[1]
      ?.replace(/<!?\[CDATA\[/g, '')
      .replace(/\]\]>/g, '')
      .trim() ?? '';

  return {
    metadata,
    items,
    skills,
    tree,
    resolvedTree: null, // Tree resolution requires external tree data
    config,
    notes,
    xmlSource: source,
  };
}

/**
 * Resolve the PoB2 builds directory path.
 * @param overridePath - Optional CLI-provided path
 * @returns Resolved path or null if not found
 */
export function resolvePob2BuildsPath(overridePath?: string): string | null {
  if (overridePath && existsSync(overridePath)) {
    try {
      const stat = statSync(overridePath);
      if (stat.isDirectory()) return overridePath;
    } catch {
      // ignore
    }
  }

  const candidates = DEFAULT_POB2_PATHS[process.platform] ?? [];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      try {
        const stat = statSync(candidate);
        if (stat.isDirectory()) return candidate;
      } catch {
        // ignore
      }
    }
  }

  return null;
}

/**
 * List saved PoB2 build files with basic metadata.
 * @param buildsPath - Path to PoB2 Builds directory
 * @returns Array of build entries sorted by lastModified descending
 */
export function listPob2Builds(buildsPath: string): PobLocalBuildEntry[] {
  const entries: PobLocalBuildEntry[] = [];

  let files: string[];
  try {
    files = readdirSync(buildsPath);
  } catch {
    return [];
  }

  for (const file of files) {
    if (!file.endsWith('.xml')) continue;

    const filePath = path.join(buildsPath, file);
    try {
      const stat = statSync(filePath);
      if (!stat.isFile()) continue;

      // Read first ~1KB to extract Build attributes without full parsing
      const content = readFileSync(filePath, { encoding: 'utf-8' }).slice(0, 1024);

      let className: string | null = null;
      let ascendancy: string | null = null;
      let level: number | null = null;

      const classMatch = /className="([^"]+)"/i.exec(content);
      if (classMatch) className = classMatch[1]!;

      const ascMatch = /ascendClassName="([^"]+)"/i.exec(content);
      if (ascMatch) ascendancy = ascMatch[1]!;

      const levelMatch = /level="(\d+)"/i.exec(content);
      if (levelMatch) level = parseInt(levelMatch[1]!, 10);

      entries.push({
        filename: file.replace(/\.xml$/i, ''),
        className,
        ascendancy,
        level,
        lastModified: stat.mtime,
      });
    } catch {
      // Skip corrupted files
    }
  }

  return entries.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
}

/**
 * Read a specific PoB2 build file by name or substring match.
 * @param buildsPath - Path to PoB2 Builds directory
 * @param buildName - Filename (without .xml) or substring to match
 * @returns Parsed PobBuild or null if not found
 */
export function readPob2Build(buildsPath: string, buildName: string): PobBuild | null {
  let files: string[];
  try {
    files = readdirSync(buildsPath);
  } catch {
    return null;
  }

  const lowerName = buildName.toLowerCase();

  // Exact match first
  let matchedFile = files.find(
    (f) => f.toLowerCase() === `${lowerName}.xml` || f.toLowerCase() === lowerName,
  );

  // Substring match
  if (!matchedFile) {
    matchedFile = files.find((f) => f.endsWith('.xml') && f.toLowerCase().includes(lowerName));
  }

  if (!matchedFile) return null;

  const filePath = path.join(buildsPath, matchedFile);
  try {
    const content = readFileSync(filePath, 'utf-8');
    return parsePobXml(content, 'file');
  } catch {
    throw new Error(`Failed to parse build file "${matchedFile}": file may be corrupted`);
  }
}

/**
 * Compare two PoB builds and return structured diff.
 * @param current - Current/player build
 * @param reference - Reference/guide build
 * @returns Comparison result
 */
export function comparePobBuilds(current: PobBuild, reference: PobBuild): PobCompareResult {
  // Build slot → item maps
  const currentItems = new Map(current.items.map((i) => [i.slot, i]));
  const referenceItems = new Map(reference.items.map((i) => [i.slot, i]));

  const upgradesNeeded: PobItemDiff[] = [];
  const matching: string[] = [];
  const missingInCurrent: string[] = [];

  for (const [slot, refItem] of referenceItems) {
    const curItem = currentItems.get(slot);

    if (!curItem) {
      missingInCurrent.push(slot);
      continue;
    }

    // Compare by base type
    if (curItem.base === refItem.base && curItem.rarity === refItem.rarity) {
      matching.push(slot);
    } else {
      // Compute delta
      const deltas: string[] = [];
      const esDiff = refItem.energyShield - curItem.energyShield;
      const armDiff = refItem.armour - curItem.armour;
      const evaDiff = refItem.evasion - curItem.evasion;

      if (esDiff !== 0) deltas.push(`${esDiff > 0 ? '+' : ''}${esDiff} ES`);
      if (armDiff !== 0) deltas.push(`${armDiff > 0 ? '+' : ''}${armDiff} Armour`);
      if (evaDiff !== 0) deltas.push(`${evaDiff > 0 ? '+' : ''}${evaDiff} Evasion`);

      upgradesNeeded.push({
        slot,
        current: curItem,
        reference: refItem,
        delta: deltas.length > 0 ? deltas.join(', ') : null,
      });
    }
  }

  // Tree comparison (using raw node IDs since we don't have tree data)
  const currentNodes = new Set(current.tree.allocatedNodes);
  const referenceNodes = new Set(reference.tree.allocatedNodes);

  const missingNodes = [...referenceNodes]
    .filter((n) => !currentNodes.has(n))
    .map((n) => n.toString());
  const extraNodes = [...currentNodes]
    .filter((n) => !referenceNodes.has(n))
    .map((n) => n.toString());

  // Skills comparison
  const currentGems = new Set(
    current.skills.flatMap((s) => s.gems.filter((g) => g.enabled).map((g) => g.name)),
  );
  const referenceGems = new Set(
    reference.skills.flatMap((s) => s.gems.filter((g) => g.enabled).map((g) => g.name)),
  );

  const missingGems = [...referenceGems].filter((g) => !currentGems.has(g));
  const extraGems = [...currentGems].filter((g) => !referenceGems.has(g));

  // Different supports comparison
  const differentSupports: PobSkillDiff['differentSupports'] = [];
  for (const refSkill of reference.skills) {
    if (!refSkill.activeGem) continue;
    const curSkill = current.skills.find((s) => s.activeGem?.name === refSkill.activeGem?.name);
    if (curSkill) {
      const refSupports = new Set(refSkill.supportGems.map((g) => g.name));
      const curSupports = new Set(curSkill.supportGems.map((g) => g.name));

      for (const ref of refSupports) {
        if (!curSupports.has(ref)) {
          const curSupportList = [...curSupports].join(', ') || 'none';
          differentSupports.push({
            skill: refSkill.activeGem.name,
            currentSupport: curSupportList,
            referenceSupport: ref,
          });
          break; // One diff per skill is enough
        }
      }
    }
  }

  // Generate summary
  const parts: string[] = [];
  if (upgradesNeeded.length > 0) {
    parts.push(`${upgradesNeeded.length} item upgrade(s) needed`);
  }
  if (missingInCurrent.length > 0) {
    parts.push(`${missingInCurrent.length} slot(s) empty`);
  }
  if (missingNodes.length > 0) {
    parts.push(`${missingNodes.length} passive node(s) missing`);
  }
  if (missingGems.length > 0) {
    parts.push(`${missingGems.length} gem(s) missing`);
  }
  const summary = parts.length > 0 ? parts.join(', ') : 'Builds match closely';

  return {
    summary,
    items: {
      upgradesNeeded,
      matching,
      missingInCurrent,
    },
    tree: {
      missingNodes,
      extraNodes,
      matchingKeystones: [], // Requires tree data for keystone identification
    },
    skills: {
      missingGems,
      extraGems,
      differentSupports,
    },
  };
}
