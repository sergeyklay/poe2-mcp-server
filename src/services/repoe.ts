/**
 * RePoE datamined game data service.
 * Provides mod tier lookup and base item stats from PoE2 datamined JSON exports.
 *
 * @see https://repoe-fork.github.io/poe2/
 */

import { RateLimiter, fetchJson } from './http.js';

const REPOE_BASE = 'https://repoe-fork.github.io/poe2';
const repoeLimiter = new RateLimiter(5, 60 * 1000);

// ─── Raw RePoE Types ──────────────────────────────────────────────────

interface RepoeSpawnWeight {
  tag: string;
  weight: number;
}

interface RepoeStat {
  id: string;
  min: number;
  max: number;
}

interface RepoeModEntry {
  domain: string;
  generation_type: string;
  groups: string[];
  name: string;
  required_level: number;
  spawn_weights: RepoeSpawnWeight[];
  stats: RepoeStat[];
  text: string | null;
  type: string;
  is_essence_only: boolean;
}

interface RepoeMinMax {
  min: number;
  max: number;
}

interface RepoeBaseItemProperties {
  armour: RepoeMinMax | null;
  energy_shield: RepoeMinMax | null;
  evasion: RepoeMinMax | null;
  block: number | null;
  attack_time: number | null;
  critical_strike_chance: number | null;
  physical_damage_min: number | null;
  physical_damage_max: number | null;
  range: number | null;
  movement_speed: number | null;
}

interface RepoeRequirements {
  dexterity: number;
  intelligence: number;
  level: number;
  strength: number;
}

interface RepoeBaseItemEntry {
  domain: string;
  drop_level: number;
  item_class: string;
  name: string;
  tags: string[];
  properties: RepoeBaseItemProperties;
  requirements: RepoeRequirements | null;
  release_state: string;
}

// ─── Public Types ─────────────────────────────────────────────────────

/** Resolved mod tier info for a single item modifier. */
export interface ModTierResult {
  modText: string;
  value: number;
  tier: number;
  totalTiers: number;
  range: [number, number];
  bestTierAtIlvl: number | null;
  prefixSuffix: 'prefix' | 'suffix';
  modGroup: string;
  affixName: string;
}

/** Base item stats resolved from RePoE. */
export interface BaseItemStats {
  name: string;
  itemClass: string;
  tags: string[];
  baseEs: number | null;
  baseArmour: number | null;
  baseEvasion: number | null;
  basePhysDamageMin: number | null;
  basePhysDamageMax: number | null;
  baseCritChance: number | null;
  baseAttackTime: number | null;
  reqLevel: number | null;
  reqStr: number | null;
  reqDex: number | null;
  reqInt: number | null;
}

// ─── Mod Index ────────────────────────────────────────────────────────

/** Indexed mod tier entry for fast lookup. */
interface IndexedModTier {
  modId: string;
  template: string;
  affixName: string;
  generationType: 'prefix' | 'suffix';
  requiredLevel: number;
  statMin: number;
  statMax: number;
  type: string;
  groups: string[];
  allowedTags: Set<string>;
}

/** Template → tier entries grouped by mod type. */
type ModIndex = Map<string, IndexedModTier[]>;

/** Base item name (lowercase) → base item stats. */
type BaseItemIndex = Map<string, BaseItemStats>;

let modIndex: ModIndex | null = null;
let baseItemIndex: BaseItemIndex | null = null;

// ─── Text Normalization ───────────────────────────────────────────────

/**
 * Strip RePoE markup from mod text.
 * - `[Spell]` → `Spell`
 * - `[Resistances|Fire Resistance]` → `Fire Resistance`
 */
function stripMarkup(text: string): string {
  return text.replace(/\[([^\]|]+)\|([^\]]+)\]/g, '$2').replace(/\[([^\]]+)\]/g, '$1');
}

/**
 * Create a normalized template from mod text for matching.
 * Replaces all numeric values (including ranges like "(105-119)") with `#`.
 */
function normalizeTemplate(text: string): string {
  return text
    .replace(/\([\d.]+-[\d.]+\)/g, '#')
    .replace(/[\d.]+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Extract the first numeric value from a mod text string.
 * Handles both integer and decimal values.
 */
function extractFirstNumber(text: string): number | null {
  const match = text.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : null;
}

// ─── Index Building ───────────────────────────────────────────────────

/** Build mod lookup index from raw RePoE mods data. */
function buildModIndex(modsData: Record<string, RepoeModEntry>): ModIndex {
  const index: ModIndex = new Map();

  for (const [modId, mod] of Object.entries(modsData)) {
    if (mod.domain !== 'item') continue;
    if (mod.generation_type !== 'prefix' && mod.generation_type !== 'suffix') continue;
    if (!mod.text || mod.stats.length === 0) continue;
    if (mod.is_essence_only) continue;

    const cleanText = stripMarkup(mod.text);
    const template = normalizeTemplate(cleanText);
    if (!template || template === '#') continue;

    const allowedTags = new Set<string>();
    for (const sw of mod.spawn_weights) {
      if (sw.weight > 0 && sw.tag !== 'default') {
        allowedTags.add(sw.tag);
      }
    }
    if (allowedTags.size === 0) continue;

    const entry: IndexedModTier = {
      modId,
      template,
      affixName: mod.name,
      generationType: mod.generation_type,
      requiredLevel: mod.required_level,
      statMin: mod.stats[0]!.min,
      statMax: mod.stats[0]!.max,
      type: mod.type,
      groups: mod.groups,
      allowedTags,
    };

    const existing = index.get(template);
    if (existing) {
      existing.push(entry);
    } else {
      index.set(template, [entry]);
    }
  }

  return index;
}

/** Build base item lookup index from raw RePoE base_items data. */
function buildBaseItemIndex(baseItemsData: Record<string, RepoeBaseItemEntry>): BaseItemIndex {
  const index: BaseItemIndex = new Map();

  for (const entry of Object.values(baseItemsData)) {
    if (entry.domain !== 'item' || !entry.name) continue;
    if (entry.release_state === 'unreleased') continue;

    const props = entry.properties;
    const reqs = entry.requirements;

    const stats: BaseItemStats = {
      name: entry.name,
      itemClass: entry.item_class,
      tags: entry.tags,
      baseEs: props.energy_shield?.min ?? null,
      baseArmour: props.armour?.min ?? null,
      baseEvasion: props.evasion?.min ?? null,
      basePhysDamageMin: props.physical_damage_min,
      basePhysDamageMax: props.physical_damage_max,
      baseCritChance: props.critical_strike_chance ? props.critical_strike_chance / 100 : null,
      baseAttackTime: props.attack_time ? +(1000 / props.attack_time).toFixed(2) : null,
      reqLevel: reqs?.level ?? null,
      reqStr: reqs?.strength || null,
      reqDex: reqs?.dexterity || null,
      reqInt: reqs?.intelligence || null,
    };

    index.set(entry.name.toLowerCase(), stats);
  }

  return index;
}

// ─── Lazy Init ────────────────────────────────────────────────────────

/** Ensure mod index is loaded. Fetches mods.json on first call. */
async function ensureModIndex(): Promise<ModIndex> {
  if (modIndex) return modIndex;

  const raw = await fetchJson<Record<string, RepoeModEntry>>(
    `${REPOE_BASE}/mods.json`,
    repoeLimiter,
  );
  modIndex = buildModIndex(raw);
  console.error(`RePoE: mod index built with ${modIndex.size} templates`);
  return modIndex;
}

/** Ensure base item index is loaded. Fetches base_items.json on first call. */
async function ensureBaseItemIndex(): Promise<BaseItemIndex> {
  if (baseItemIndex) return baseItemIndex;

  const raw = await fetchJson<Record<string, RepoeBaseItemEntry>>(
    `${REPOE_BASE}/base_items.json`,
    repoeLimiter,
  );
  baseItemIndex = buildBaseItemIndex(raw);
  console.error(`RePoE: base item index built with ${baseItemIndex.size} items`);
  return baseItemIndex;
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Look up base item stats by name.
 * For Magic items whose base type includes affix names (e.g., "Gold Circlet of the Polar Bear"),
 * progressively strips trailing words until a match is found ("Gold Circlet").
 *
 * @param baseTypeName - Display name of the base type (e.g., "Withered Wand", "Gold Circlet")
 * @returns Base item stats or null if not found
 */
export async function lookupBaseItem(baseTypeName: string): Promise<BaseItemStats | null> {
  try {
    const index = await ensureBaseItemIndex();

    // Exact match first
    const exact = index.get(baseTypeName.toLowerCase());
    if (exact) return exact;

    // Progressive strip: remove trailing words to handle Magic item affix names
    // e.g., "Gold Circlet of the Polar Bear" → "Gold Circlet of the Polar" → ... → "Gold Circlet"
    const words = baseTypeName.split(/\s+/);
    for (let len = words.length - 1; len >= 2; len--) {
      const candidate = words.slice(0, len).join(' ').toLowerCase();
      const match = index.get(candidate);
      if (match) return match;
    }

    return null;
  } catch (err) {
    console.error(
      'RePoE: base item lookup failed:',
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Find a base item by item class and required level (localization-agnostic fallback).
 * When the base type name is in a non-English language and translation fails,
 * this heuristic matches by class and closest drop level.
 *
 * @param itemClass - RePoE item class (e.g., "Helmet", "Body Armour", "Wand")
 * @param reqLevel - Required level of the item (from parsed requirements)
 * @returns Best-matching base item or null
 */
export async function lookupBaseItemByClass(
  itemClass: string,
  reqLevel: number | null,
): Promise<BaseItemStats | null> {
  try {
    const index = await ensureBaseItemIndex();

    const candidates: BaseItemStats[] = [];
    for (const item of index.values()) {
      if (item.itemClass.toLowerCase() === itemClass.toLowerCase()) {
        candidates.push(item);
      }
    }
    if (candidates.length === 0) return null;

    if (reqLevel === null) return candidates[0]!;

    // Find the candidate whose reqLevel is closest to the target
    candidates.sort((a, b) => {
      const diffA = Math.abs((a.reqLevel ?? 0) - reqLevel);
      const diffB = Math.abs((b.reqLevel ?? 0) - reqLevel);
      return diffA - diffB;
    });

    return candidates[0]!;
  } catch (err) {
    console.error(
      'RePoE: base item class lookup failed:',
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Match a single parsed mod against RePoE tier data.
 *
 * @param modText - The raw mod text from clipboard (e.g., "116% increased Spell Damage")
 * @param itemTags - Tags from the item's base type (from base_items.json)
 * @param itemLevel - Item level for "best tier at ilvl" calculation
 * @returns Tier info or null if no match
 */
export async function matchSingleModTier(
  modText: string,
  itemTags: string[],
  itemLevel: number | null,
): Promise<ModTierResult | null> {
  try {
    const index = await ensureModIndex();
    const template = normalizeTemplate(modText);
    const candidates = index.get(template);
    if (!candidates || candidates.length === 0) return null;

    const value = extractFirstNumber(modText);
    if (value === null) return null;

    const tagSet = new Set(itemTags);

    // Filter to mods that can spawn on this item type
    const compatible = candidates.filter((c) => {
      for (const tag of c.allowedTags) {
        if (tagSet.has(tag)) return true;
      }
      return false;
    });
    if (compatible.length === 0) return null;

    // Group by mod type to determine tiers
    const byType = new Map<string, IndexedModTier[]>();
    for (const c of compatible) {
      const existing = byType.get(c.type);
      if (existing) {
        existing.push(c);
      } else {
        byType.set(c.type, [c]);
      }
    }

    // Find which tier contains the rolled value
    for (const [, tiers] of byType) {
      // Sort by required_level descending → T1 = highest req level
      const sorted = [...tiers].sort((a, b) => b.requiredLevel - a.requiredLevel);

      for (let i = 0; i < sorted.length; i++) {
        const tier = sorted[i]!;
        if (value >= tier.statMin && value <= tier.statMax) {
          const tierNumber = i + 1;
          const totalTiers = sorted.length;

          // Best tier available at item level
          let bestAtIlvl: number | null = null;
          if (itemLevel !== null) {
            const bestIdx = sorted.findIndex((t) => t.requiredLevel <= itemLevel);
            bestAtIlvl = bestIdx !== -1 ? bestIdx + 1 : null;
          }

          return {
            modText,
            value,
            tier: tierNumber,
            totalTiers,
            range: [tier.statMin, tier.statMax],
            bestTierAtIlvl: bestAtIlvl,
            prefixSuffix: tier.generationType,
            modGroup: tier.groups[0] ?? tier.type,
            affixName: tier.affixName,
          };
        }
      }
    }

    return null;
  } catch (err) {
    console.error(
      'RePoE: mod tier lookup failed:',
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Match all explicit mods on an item against RePoE tier data.
 *
 * @param modTexts - Array of explicit mod text strings
 * @param itemTags - Tags from the item's base type
 * @param itemLevel - Item level
 * @returns Array of tier results (only for mods that matched)
 */
export async function matchAllModTiers(
  modTexts: string[],
  itemTags: string[],
  itemLevel: number | null,
): Promise<ModTierResult[]> {
  const results: ModTierResult[] = [];

  for (const modText of modTexts) {
    const result = await matchSingleModTier(modText, itemTags, itemLevel);
    if (result) {
      results.push(result);
    }
  }

  return results;
}

/** Reset cached indices. Used in tests. */
export function resetRepoeCache(): void {
  modIndex = null;
  baseItemIndex = null;
}
