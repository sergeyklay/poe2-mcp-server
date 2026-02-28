/**
 * Item clipboard parsing tool for PoE2.
 * Parses item text copied from in-game (Ctrl+C) into structured data.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  detectLanguage,
  GRANTED_SKILL_PATTERN,
  SOCKETED_RUNE_PATTERN,
  RELOAD_TIME_PATTERN,
  SOCKETS_PATTERN,
  LEVEL_REQUIREMENT_PATTERN,
  STRENGTH_REQUIREMENT_PATTERN,
  DEXTERITY_REQUIREMENT_PATTERN,
  INTELLIGENCE_REQUIREMENT_PATTERN,
  ENERGY_SHIELD_PATTERN,
  BLOCK_CHANCE_PATTERN,
  RUNE_EFFECT_PATTERN,
  FLASK_RECOVERY_PATTERN,
  FLASK_CHARGES_PATTERN,
  CHARM_DURATION_PATTERN,
  CHARM_LIMIT_PATTERN,
  CHARM_CHARGES_PATTERN,
  AREA_LEVEL_PATTERN,
  USAGE_INSTRUCTION_PATTERN,
  ITEM_TYPE_IDENTIFIERS,
  GEM_LEVEL_PATTERN,
  GEM_MANA_COST_PATTERN,
  GEM_MANA_MULTIPLIER_PATTERN,
  GEM_CAST_TIME_PATTERN,
  GEM_TAGS_PATTERN,
  GEM_CRIT_CHANCE_PATTERN,
  GEM_EFFECTIVENESS_PATTERN,
  GEM_RESERVATION_PATTERN,
  GEM_EXPERIENCE_PATTERN,
  MODIFIER_HEADER_PATTERN,
  LIMIT_PATTERN,
  TIER_PATTERN,
  SOCKETABLE_EFFECT_PATTERN,
  ITEM_CLASS_PATTERN,
  ITEM_LEVEL_PATTERN,
  RUNE_SECTION_HEADER_PATTERN,
  MAP_TIER_PATTERN,
  MAP_ITEM_QUANTITY_PATTERN,
  MAP_ITEM_RARITY_PATTERN,
  MAP_PACK_SIZE_PATTERN,
  MOD_MARKERS,
  AUGMENTED_MARKER,
  UNMET_MARKER,
  CRIT_CHANCE_STAT_PATTERN,
  ATTACK_SPEED_STAT_PATTERN,
  RARITY_ALTERNATES,
  ITEM_CLASS_GEM_PATTERN,
  ITEM_CLASS_FLASK_PATTERN,
  ITEM_CLASS_CHARM_PATTERN,
  ITEM_CLASS_MAP_PATTERN,
  ITEM_CLASS_SOCKETABLE_PATTERN,
  STANDALONE_RUNE_NAME_PATTERN,
  WEAPON_DAMAGE_PATTERN,
  ITEM_CLASS_EQUIPMENT_PATTERN,
  mapItemClassToEnglishSlug,
  type ClientStrings,
  type SupportedLanguage,
} from '../services/strings.js';
import {
  getPoe2dbPage,
  parsePoe2dbHtml,
  getNinjaItemOverview,
  resolveEnglishBaseType,
  type Poe2dbParsedPage,
  type Poe2dbLang,
} from '../services/api.js';

// ─────────────────────────────────────────────────────────────────────────────
// Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

/** Rarity levels in PoE2. */
type ItemRarity = 'Normal' | 'Magic' | 'Rare' | 'Unique' | 'Currency' | 'Gem' | 'Unknown';

/** Modifier category types. */
type ModType =
  | 'implicit'
  | 'rune'
  | 'explicit'
  | 'enchant'
  | 'crafted'
  | 'fractured'
  | 'desecrated';

/** Socket entry with optional rune name. */
interface ItemSocket {
  type: string;
  rune: string | null;
}

/** A single modifier on an item. */
interface ItemMod {
  text: string;
  type: ModType;
}

/** Numeric stat with optional augmented flag. */
interface NumericStat {
  value: number;
  augmented: boolean;
}

/** Defensive stats for armor pieces. */
interface DefensiveStats {
  armour: NumericStat | null;
  evasion: NumericStat | null;
  energyShield: NumericStat | null;
  blockChance: NumericStat | null;
}

/** Offensive stats for weapons. */
interface OffensiveStats {
  physicalDamage: { min: number; max: number; augmented: boolean } | null;
  elementalDamage: Array<{ min: number; max: number; type: string }>;
  critChance: NumericStat | null;
  attacksPerSecond: NumericStat | null;
  reloadTime: NumericStat | null;
}

/** Character requirements to equip. */
interface Requirements {
  level: number | null;
  strength: NumericStat | null;
  dexterity: NumericStat | null;
  intelligence: NumericStat | null;
}

/** Gem metadata for skill/support gems. */
interface GemInfo {
  tags: string[];
  level: number | null;
  manaCost: number | null;
  manaMultiplier: number | null;
  castTime: number | null;
  critChance: number | null;
  effectiveness: number | null;
  reservation: number | null;
  experience: string | null;
}

/** Map/Waystone properties. */
interface MapProperties {
  areaLevel: number | null;
  tier: number | null;
  itemQuantity: string | null;
  itemRarity: string | null;
  packSize: string | null;
}

/** Parsed item structure. */
interface ParsedItem {
  itemClass: string;
  rarity: ItemRarity;
  name: string | null;
  baseType: string;
  quality: NumericStat | null;
  itemLevel: number | null;
  defenses: DefensiveStats;
  offense: OffensiveStats;
  requirements: Requirements;
  sockets: ItemSocket[];
  mods: ItemMod[];
  grantedSkills: string[];
  /** Rune effects (for socketable runes): "Socketed in X: effect" lines */
  runeEffects: string[];
  /** Socketable effects (runes/soul cores): "Weapons: ...", "Armour: ..." lines */
  socketableEffects: string[];
  /** Gem info (for skill/support gems) */
  gemInfo: GemInfo | null;
  /** Gem description lines (skill effect text) */
  gemDescription: string[];
  /** Flask base properties (recovery, charges) */
  flaskProperties: string[];
  /** Charm base properties (duration, limit) */
  charmProperties: string[];
  /** Map/Waystone properties */
  mapProperties: MapProperties | null;
  /** Jewel limit restriction (e.g., "Limited to: 1") */
  limit: number | null;
  /** Item tier (e.g., uncut gems). */
  tier: number | null;
  flavorText: string | null;
  flags: {
    corrupted: boolean;
    unidentified: boolean;
    mirrored: boolean;
    split: boolean;
  };
  stack: { current: number; max: number } | null;
  raw: string;
  detectedLanguage: SupportedLanguage;
}

/** Result of a section parser attempting to process a section. */
type SectionResult = 'consumed' | 'skipped' | 'not-applicable';

/**
 * Section parser — attempts to process one clipboard section.
 *
 * @param section - Array of lines from one section (between --------)
 * @param item    - Mutable ParsedItem accumulator
 * @param ctx     - Immutable parsing context (language strings, item class flags)
 * @returns Result indicating whether the section was consumed
 */
type SectionParser = (section: string[], item: ParsedItem, ctx: ParseContext) => SectionResult;

/** Pipeline entry — parser with optional greedy flag. */
interface ParserEntry {
  parse: SectionParser;
  /** When true, parser tries all remaining sections and consumes all matches. */
  greedy?: boolean;
}

/** Immutable context available to all section parsers, created once before pipeline runs. */
interface ParseContext {
  readonly strings: ClientStrings;
  readonly language: SupportedLanguage;
  readonly isGem: boolean;
  readonly isFlask: boolean;
  readonly isCharm: boolean;
  readonly isMap: boolean;
  readonly isSocketable: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Enrichment Interfaces
// ─────────────────────────────────────────────────────────────────────────────

/** Enrichment result for a single mod tier match. */
interface ModTierMatch {
  modText: string;
  value: number;
  tier: number;
  range: [number, number];
  bestTierAtIlvl: number | null;
  prefixSuffix: 'prefix' | 'suffix' | null;
}

/** Enrichment result for base type stats. */
interface BaseTypeEnrichment {
  name: string;
  baseEs: number | null;
  baseArmour: number | null;
  baseEvasion: number | null;
  basePhysDamage: string | null;
  baseCritChance: number | null;
  baseAttackSpeed: number | null;
  reqLevel: number | null;
  reqStr: number | null;
  reqDex: number | null;
  reqInt: number | null;
}

/** Complete enrichment data appended to parsed item output. */
interface ItemEnrichment {
  baseType: BaseTypeEnrichment | null;
  modTiers: ModTierMatch[];
  prefixCount: number;
  suffixCount: number;
  maxPrefixes: number;
  maxSuffixes: number;
  uniquePrice: { chaos: number; volume: number } | null;
  /** English base type name (set when detected language is not English). */
  englishBaseType: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Section delimiter in PoE2 item text. */
const SECTION_DELIMITER = '--------';

/** Default league for price lookups. */
const DEFAULT_LEAGUE = 'Fate of the Vaal';

/** Item classes eligible for base type + mod tier enrichment. */
const ENRICHABLE_EQUIPMENT_CLASSES =
  /body armour|helmet|glove|boot|shield|quiver|focus|bow|staff|wand|sceptre|mace|sword|axe|claw|dagger|flail|spear|crossbow|buckler/i;

// ─────────────────────────────────────────────────────────────────────────────
// Zod Schema
// ─────────────────────────────────────────────────────────────────────────────

const ItemClipboardSchema = z.object({
  text: z.string().min(10).describe('Raw item text copied from PoE2 clipboard (Ctrl+C in game)'),
  enrich: z
    .boolean()
    .default(true)
    .describe(
      'When true, appends enrichment data (mod tiers, base stats, unique prices). ' +
        'Set false for fast parsing only.',
    ),
  league: z
    .string()
    .default(DEFAULT_LEAGUE)
    .describe('League name for price lookups (only used when enrich=true and item is Unique)'),
});

// ─────────────────────────────────────────────────────────────────────────────
// Enrichment Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Whether the item class is eligible for base type + mod tier enrichment. */
function isEquipment(itemClass: string): boolean {
  return (
    ENRICHABLE_EQUIPMENT_CLASSES.test(itemClass) || ITEM_CLASS_EQUIPMENT_PATTERN.test(itemClass)
  );
}

/** Map an item class to the poe.ninja unique item overview type slug. */
function mapItemClassToNinjaType(itemClass: string): string | null {
  if (/body armour|helmet|glove|boot|shield|quiver|focus/i.test(itemClass)) {
    return 'UniqueArmour';
  }
  if (/bow|staff|wand|sceptre|mace|sword|axe|claw|dagger|flail|spear|crossbow/i.test(itemClass)) {
    return 'UniqueWeapon';
  }
  if (/ring|amulet|belt/i.test(itemClass)) return 'UniqueAccessory';
  if (/jewel/i.test(itemClass)) return 'UniqueJewel';
  if (/flask/i.test(itemClass)) return 'UniqueFlask';
  return null;
}

/** Map the detected item language to a poe2db language code. */
function mapLanguageToPoe2dbLang(lang: SupportedLanguage): Poe2dbLang {
  const mapping: Record<SupportedLanguage, Poe2dbLang> = {
    en: 'us',
    ru: 'ru',
    ko: 'kr',
    'zh-TW': 'tw',
    'zh-CN': 'cn',
    de: 'de',
    fr: 'fr',
    ja: 'jp',
    es: 'sp',
    pt: 'pt',
    th: 'th',
  };
  return mapping[lang];
}

/** Max prefix/suffix slot counts by item rarity. */
function maxModSlots(rarity: ItemRarity): { prefixes: number; suffixes: number } {
  if (rarity === 'Rare') return { prefixes: 3, suffixes: 3 };
  if (rarity === 'Magic') return { prefixes: 1, suffixes: 1 };
  return { prefixes: 0, suffixes: 0 };
}

/**
 * Extract base type stats from a parsed poe2db page.
 * Parses the `stats` field for defensive/offensive values and requirements.
 */
function extractBaseStats(page: Poe2dbParsedPage, baseType: string): BaseTypeEnrichment | null {
  const src = page.stats;
  if (!src) return null;

  const result: BaseTypeEnrichment = {
    name: baseType,
    baseEs: null,
    baseArmour: null,
    baseEvasion: null,
    basePhysDamage: null,
    baseCritChance: null,
    baseAttackSpeed: null,
    reqLevel: null,
    reqStr: null,
    reqDex: null,
    reqInt: null,
  };

  let matched = false;
  for (const line of src.split('\n')) {
    const l = line.trim();
    let m: RegExpExecArray | null;

    m = /Energy Shield:\s*(\d+)/i.exec(l);
    if (m) {
      result.baseEs = parseInt(m[1]!, 10);
      matched = true;
      continue;
    }

    m = /Armour:\s*(\d+)/i.exec(l);
    if (m) {
      result.baseArmour = parseInt(m[1]!, 10);
      matched = true;
      continue;
    }

    m = /Evasion(?:\s+Rating)?:\s*(\d+)/i.exec(l);
    if (m) {
      result.baseEvasion = parseInt(m[1]!, 10);
      matched = true;
      continue;
    }

    m = /Physical Damage:\s*(\d+-\d+)/i.exec(l);
    if (m) {
      result.basePhysDamage = m[1]!;
      matched = true;
      continue;
    }

    m = /Critical (?:Hit )?Chance:\s*([\d.]+)%/i.exec(l);
    if (m) {
      result.baseCritChance = parseFloat(m[1]!);
      matched = true;
      continue;
    }

    m = /Attacks? per Second:\s*([\d.]+)/i.exec(l);
    if (m) {
      result.baseAttackSpeed = parseFloat(m[1]!);
      matched = true;
      continue;
    }

    m = /Level:\s*(\d+)/i.exec(l);
    if (m) {
      result.reqLevel = parseInt(m[1]!, 10);
      matched = true;
      continue;
    }

    m = /Str:\s*(\d+)/i.exec(l);
    if (m) {
      result.reqStr = parseInt(m[1]!, 10);
      matched = true;
      continue;
    }

    m = /Dex:\s*(\d+)/i.exec(l);
    if (m) {
      result.reqDex = parseInt(m[1]!, 10);
      matched = true;
      continue;
    }

    m = /Int:\s*(\d+)/i.exec(l);
    if (m) {
      result.reqInt = parseInt(m[1]!, 10);
      matched = true;
      continue;
    }
  }

  return matched ? result : null;
}

/** Replace all numeric values in a mod text with '#' for template matching. */
function normalizeModTemplate(modText: string): string {
  return modText
    .replace(/[\d.]+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract all numeric values from mod text. */
function extractNumericValues(modText: string): number[] {
  return [...modText.matchAll(/([\d.]+)/g)].map((m) => parseFloat(m[1]!));
}

/**
 * Match item mods against poe2db mod tier data.
 * Parses sections from the parsed page looking for mod tier tables.
 */
function matchModTiers(
  page: Poe2dbParsedPage,
  mods: ItemMod[],
  itemLevel: number | null,
): ModTierMatch[] {
  const statsSection = page.sections.get('stats');
  if (!statsSection?.content) return [];

  const rows = statsSection.content.split('\n').filter((r) => r.trim());
  if (rows.length === 0) return [];

  // Parse tab-separated rows into structured tier data
  interface TierRow {
    template: string;
    tier: number;
    reqLevel: number;
    min: number;
    max: number;
    prefixSuffix: 'prefix' | 'suffix' | null;
  }

  const tierRows: TierRow[] = [];
  for (const row of rows) {
    const cols = row.split('\t');
    if (cols.length < 4) continue;

    const modName = cols[0]?.trim() ?? '';
    const tierStr = cols[1]?.trim() ?? '';
    const levelStr = cols[2]?.trim() ?? '';
    const rangeStr = cols[3]?.trim() ?? '';
    const psTag = cols[4]?.trim().toLowerCase() ?? '';

    const tierMatch = /(\d+)/.exec(tierStr);
    if (!tierMatch) continue;

    const rangeMatch = /(-?[\d.]+)\s*[-–]\s*(-?[\d.]+)/.exec(rangeStr);
    if (!rangeMatch) continue;

    tierRows.push({
      template: normalizeModTemplate(modName),
      tier: parseInt(tierMatch[1]!, 10),
      reqLevel: parseInt(levelStr, 10) || 0,
      min: parseFloat(rangeMatch[1]!),
      max: parseFloat(rangeMatch[2]!),
      prefixSuffix: psTag.startsWith('p') ? 'prefix' : psTag.startsWith('s') ? 'suffix' : null,
    });
  }

  if (tierRows.length === 0) return [];

  const results: ModTierMatch[] = [];
  for (const mod of mods) {
    if (mod.type !== 'explicit') continue;

    const template = normalizeModTemplate(mod.text);
    const values = extractNumericValues(mod.text);
    if (values.length === 0) continue;

    const value = values[0]!;
    const matching = tierRows.filter((r) => r.template === template);
    if (matching.length === 0) continue;

    // Find the tier whose range contains the rolled value
    const hit = matching.find((r) => value >= r.min && value <= r.max);
    if (!hit) continue;

    // Best tier at item level
    const bestAtIlvl =
      itemLevel !== null
        ? (matching.filter((r) => r.reqLevel <= itemLevel).sort((a, b) => a.tier - b.tier)[0]
            ?.tier ?? null)
        : null;

    results.push({
      modText: mod.text,
      value,
      tier: hit.tier,
      range: [hit.min, hit.max],
      bestTierAtIlvl: bestAtIlvl,
      prefixSuffix: hit.prefixSuffix,
    });
  }

  return results;
}

/** Look up unique item price on poe.ninja. Returns null on any failure. */
async function lookupUniquePrice(
  name: string,
  itemClass: string,
  league: string,
): Promise<{ chaos: number; volume: number } | null> {
  try {
    const ninjaType = mapItemClassToNinjaType(itemClass);
    if (!ninjaType) return null;

    const response = await getNinjaItemOverview(league, ninjaType);
    const match = response.lines.find((line) => line.name.toLowerCase() === name.toLowerCase());
    return match ? { chaos: match.chaosValue, volume: match.listingCount } : null;
  } catch (err) {
    console.error(
      `Failed to lookup unique price for "${name}":`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Orchestrate all enrichment lookups for a parsed item.
 * Never throws — all errors are caught and result in partial/empty enrichment.
 */
async function enrichItem(item: ParsedItem, league: string): Promise<ItemEnrichment> {
  const slots = maxModSlots(item.rarity);
  const enrichment: ItemEnrichment = {
    baseType: null,
    modTiers: [],
    prefixCount: 0,
    suffixCount: 0,
    maxPrefixes: slots.prefixes,
    maxSuffixes: slots.suffixes,
    uniquePrice: null,
    englishBaseType: null,
  };

  // Base type + mod tiers (equipment only)
  if (isEquipment(item.itemClass) && item.baseType) {
    try {
      const poe2dbLang = mapLanguageToPoe2dbLang(item.detectedLanguage);
      let slug: string;

      if (item.detectedLanguage === 'en') {
        // English: use base type directly as slug
        slug = item.baseType.replace(/\s+/g, '_');
      } else {
        // Non-English: resolve localized base type → English slug via poe2db
        const itemClassSlug = mapItemClassToEnglishSlug(item.itemClass);
        if (itemClassSlug) {
          const englishSlug = await resolveEnglishBaseType(
            item.baseType,
            itemClassSlug,
            poe2dbLang,
          );
          if (englishSlug) {
            slug = englishSlug;
            enrichment.englishBaseType = englishSlug.replace(/_/g, ' ');
          } else {
            // Fallback: try localized name as slug (unlikely to work)
            slug = item.baseType.replace(/\s+/g, '_');
          }
        } else {
          slug = item.baseType.replace(/\s+/g, '_');
        }
      }

      // Always fetch with 'us' lang for stats/mod tiers (English data)
      const html = await getPoe2dbPage(slug, 'us');
      const page = parsePoe2dbHtml(html);

      const displayName = enrichment.englishBaseType ?? item.baseType;
      enrichment.baseType = extractBaseStats(page, displayName);

      const explicitMods = item.mods.filter((m) => m.type === 'explicit');
      enrichment.modTiers = matchModTiers(page, explicitMods, item.itemLevel);
      enrichment.prefixCount = enrichment.modTiers.filter(
        (t) => t.prefixSuffix === 'prefix',
      ).length;
      enrichment.suffixCount = enrichment.modTiers.filter(
        (t) => t.prefixSuffix === 'suffix',
      ).length;
    } catch (err) {
      console.error(
        `Enrichment: poe2db lookup failed for "${item.baseType}":`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // Unique pricing
  if (item.rarity === 'Unique' && item.name) {
    try {
      enrichment.uniquePrice = await lookupUniquePrice(item.name, item.itemClass, league);
    } catch (err) {
      console.error(
        `Enrichment: price lookup failed for "${item.name}":`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return enrichment;
}

/** Format the enrichment section as markdown. Returns empty string if no data. */
function formatEnrichmentSection(enrichment: ItemEnrichment, item: ParsedItem): string {
  const lines: string[] = [];
  let hasContent = false;

  // Base type stats
  if (enrichment.baseType) {
    const bt = enrichment.baseType;
    const statParts: string[] = [];
    if (bt.baseEs !== null) statParts.push(`Base ES: ${bt.baseEs}`);
    if (bt.baseArmour !== null) statParts.push(`Base Armour: ${bt.baseArmour}`);
    if (bt.baseEvasion !== null) statParts.push(`Base Evasion: ${bt.baseEvasion}`);
    if (bt.basePhysDamage !== null) statParts.push(`Base Phys: ${bt.basePhysDamage}`);
    if (bt.baseCritChance !== null) statParts.push(`Base Crit: ${bt.baseCritChance}%`);
    if (bt.baseAttackSpeed !== null) statParts.push(`Base APS: ${bt.baseAttackSpeed}`);

    const reqParts: string[] = [];
    if (bt.reqLevel !== null) reqParts.push(`Lv${bt.reqLevel}`);
    if (bt.reqStr !== null) reqParts.push(`Str ${bt.reqStr}`);
    if (bt.reqDex !== null) reqParts.push(`Dex ${bt.reqDex}`);
    if (bt.reqInt !== null) reqParts.push(`Int ${bt.reqInt}`);

    const statsStr = statParts.length > 0 ? statParts.join(' | ') : '';
    const reqStr = reqParts.length > 0 ? ` | Req: ${reqParts.join(' ')}` : '';

    if (statsStr || reqStr) {
      lines.push(`**Base:** ${bt.name} — ${statsStr}${reqStr}`);
      hasContent = true;
    }
  }

  // Mod tiers table
  if (enrichment.modTiers.length > 0) {
    const ilvlLabel = item.itemLevel !== null ? String(item.itemLevel) : '?';
    lines.push('');
    lines.push(`**Mod Tiers (Item Level ${ilvlLabel}):**`);
    lines.push('| Modifier | Value | Tier | Range | Best at ilvl | P/S |');
    lines.push('|----------|-------|------|-------|--------------|-----|');
    for (const t of enrichment.modTiers) {
      const ps = t.prefixSuffix === 'prefix' ? 'P' : t.prefixSuffix === 'suffix' ? 'S' : '-';
      const best = t.bestTierAtIlvl !== null ? `T${t.bestTierAtIlvl}` : '-';
      lines.push(
        `| ${t.modText} | ${t.value} | T${t.tier} | ${t.range[0]}-${t.range[1]} | ${best} | ${ps} |`,
      );
    }
    hasContent = true;
  }

  // Open slots
  const hasPrefixSuffix = enrichment.modTiers.some((t) => t.prefixSuffix !== null);
  if (hasPrefixSuffix && (enrichment.maxPrefixes > 0 || enrichment.maxSuffixes > 0)) {
    const openP = enrichment.maxPrefixes - enrichment.prefixCount;
    const openS = enrichment.maxSuffixes - enrichment.suffixCount;
    lines.push('');
    lines.push(
      `**Open Slots:** ${openP} prefix, ${openS} suffix open` +
        ` (${enrichment.maxPrefixes}P/${enrichment.maxSuffixes}S max for ${item.rarity})`,
    );
    hasContent = true;
  }

  // Unique pricing
  if (item.rarity === 'Unique') {
    const displayName = item.name ?? item.baseType;
    if (enrichment.uniquePrice) {
      lines.push('');
      lines.push(
        `**Price:** ${displayName} — ` +
          `${enrichment.uniquePrice.chaos.toFixed(1)} chaos (vol: ${enrichment.uniquePrice.volume})`,
      );
      hasContent = true;
    }
    // Omit price line entirely when lookup fails — "not listed" is misleading
  }

  if (!hasContent) return '';
  return '\n### Enrichment\n' + lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Split clipboard text into sections by "--------" delimiter.
 * @param text - Raw clipboard text.
 * @returns Array of sections, each section is array of lines.
 */
function splitSections(text: string): string[][] {
  const lines = text.split(/\r?\n/);
  const sections: string[][] = [[]];

  for (const line of lines) {
    if (line === SECTION_DELIMITER) {
      sections.push([]);
    } else if (line.trim()) {
      sections[sections.length - 1]!.push(line);
    }
  }

  return sections.filter((section) => section.length > 0);
}

/**
 * Map localized rarity string to ItemRarity.
 * @param rarityStr - Localized rarity value.
 * @param strings - ClientStrings for the detected language.
 * @returns ItemRarity enum value.
 */
function mapRarity(rarityStr: string, strings: ClientStrings): ItemRarity {
  const trimmed = rarityStr.trim();
  if (trimmed === strings.RARITY_NORMAL) return 'Normal';
  if (trimmed === strings.RARITY_MAGIC) return 'Magic';
  if (trimmed === strings.RARITY_RARE) return 'Rare';
  if (trimmed === strings.RARITY_UNIQUE) return 'Unique';
  if (trimmed === strings.RARITY_CURRENCY) return 'Currency';
  if (trimmed === strings.RARITY_GEM) return 'Gem';

  // Check alternate rarity values (gender variants, transliterations)
  for (const [rarity, alternates] of Object.entries(RARITY_ALTERNATES)) {
    if (alternates.includes(trimmed)) {
      return rarity as ItemRarity;
    }
  }

  return 'Unknown';
}

/**
 * Parse the header section (item class, rarity, name, base type).
 * @param lines - Lines from the first section.
 * @param strings - ClientStrings for the detected language.
 * @returns Parsed header info.
 */
function parseHeader(
  lines: string[],
  strings: ClientStrings,
): { itemClass: string; rarity: ItemRarity; name: string | null; baseType: string } {
  let itemClass = '';
  let rarity: ItemRarity = 'Unknown';
  let name: string | null = null;
  let baseType = '';

  const normalizeColons = (line: string) => line.replace(/：/g, ':');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const normalizedLine = normalizeColons(line);
    const normalizedItemClass = normalizeColons(strings.ITEM_CLASS);
    const normalizedRarity = normalizeColons(strings.RARITY);

    if (normalizedLine.startsWith(normalizedItemClass)) {
      itemClass = normalizedLine.slice(normalizedItemClass.length).trim();
    } else if (ITEM_CLASS_PATTERN.test(normalizedLine)) {
      const match = normalizedLine.match(ITEM_CLASS_PATTERN);
      if (match) {
        itemClass = normalizedLine.slice(match[0].length).trim();
      }
    } else if (normalizedLine.startsWith(normalizedRarity)) {
      const rarityStr = normalizedLine.slice(normalizedRarity.length).trim();
      rarity = mapRarity(rarityStr, strings);

      // Name and base type follow rarity line
      if (rarity === 'Normal' || rarity === 'Currency' || rarity === 'Gem') {
        // Normal/Currency/Gem: next line is base type, no name
        baseType = lines[i + 1]?.trim() ?? '';
      } else if (rarity === 'Magic') {
        // Magic: only one line after rarity (combined prefix + base name)
        // The combined name IS the base type, no separate name
        const magicName = lines[i + 1]?.trim() ?? '';
        // Check if there's a third line that looks like a base type
        const potentialBase = lines[i + 2]?.trim();
        if (potentialBase && !potentialBase.startsWith(strings.ITEM_CLASS)) {
          // Has separate base type
          name = magicName;
          baseType = potentialBase;
        } else {
          // Magic item with combined name only
          baseType = magicName;
        }
      } else {
        // Rare/Unique: next line is name, then base type
        name = lines[i + 1]?.trim() ?? null;
        baseType = lines[i + 2]?.trim() ?? '';
      }
    }
  }

  return { itemClass, rarity, name, baseType };
}

/**
 * Extract numeric value from a line, checking for augmented marker.
 * @param line - Single line of text.
 * @returns NumericStat or null if no number found.
 */
function parseNumericStat(line: string): NumericStat | null {
  const augmented = AUGMENTED_MARKER.test(line);
  const match = line.match(/[+-]?(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  return { value: parseFloat(match[1]!.replace(',', '.')), augmented };
}

/**
 * Parse physical or elemental damage range (e.g., "12-22").
 * @param line - Single line of text.
 * @returns Damage range or null.
 */
function parseDamageRange(line: string): { min: number; max: number; augmented: boolean } | null {
  const augmented = AUGMENTED_MARKER.test(line);
  const match = line.match(/(\d+)-(\d+)/);
  if (!match) return null;
  return { min: parseInt(match[1]!, 10), max: parseInt(match[2]!, 10), augmented };
}

/**
 * Parse stats section (quality, defenses, offense).
 * @param section - Lines from a stats section.
 * @param strings - ClientStrings for the detected language.
 * @returns Parsed stats.
 */
function parseStats(
  section: string[],
  strings: ClientStrings,
): {
  quality: NumericStat | null;
  defenses: DefensiveStats;
  offense: OffensiveStats;
} {
  let quality: NumericStat | null = null;
  const defenses: DefensiveStats = {
    armour: null,
    evasion: null,
    energyShield: null,
    blockChance: null,
  };
  const offense: OffensiveStats = {
    physicalDamage: null,
    elementalDamage: [],
    critChance: null,
    attacksPerSecond: null,
    reloadTime: null,
  };

  for (const line of section) {
    if (line.startsWith(strings.QUALITY)) {
      quality = parseNumericStat(line);
    } else if (line.startsWith(strings.ARMOUR)) {
      defenses.armour = parseNumericStat(line);
    } else if (line.startsWith(strings.EVASION)) {
      defenses.evasion = parseNumericStat(line);
    } else if (ENERGY_SHIELD_PATTERN.test(line)) {
      // Use pattern to match all language variants including abbreviated forms
      defenses.energyShield = parseNumericStat(line);
    } else if (BLOCK_CHANCE_PATTERN.test(line)) {
      defenses.blockChance = parseNumericStat(line);
    } else if (line.startsWith(strings.PHYSICAL_DAMAGE)) {
      offense.physicalDamage = parseDamageRange(line);
    } else if (line.startsWith(strings.ELEMENTAL_DAMAGE)) {
      const after = line.slice(strings.ELEMENTAL_DAMAGE.length);
      const elementParts = after.split(',');
      for (const part of elementParts) {
        const rangeMatch = part.match(/(\d+)-(\d+)/);
        const typeMatch = part.match(/\(([^)]+)\)/);
        if (rangeMatch) {
          offense.elementalDamage.push({
            min: parseInt(rangeMatch[1]!, 10),
            max: parseInt(rangeMatch[2]!, 10),
            type: typeMatch ? typeMatch[1]! : 'Elemental',
          });
        }
      }
    } else if (line.startsWith(strings.CRIT_CHANCE) || CRIT_CHANCE_STAT_PATTERN.test(line)) {
      offense.critChance = parseNumericStat(line);
    } else if (line.startsWith(strings.ATTACK_SPEED) || ATTACK_SPEED_STAT_PATTERN.test(line)) {
      offense.attacksPerSecond = parseNumericStat(line);
    } else if (RELOAD_TIME_PATTERN.test(line)) {
      offense.reloadTime = parseNumericStat(line);
    } else if (WEAPON_DAMAGE_PATTERN.test(line)) {
      // Weapon-type-specific damage (e.g., "Wand Damage: 5-14", "Урон жезла: 5-14")
      const damageRange = parseDamageRange(line);
      if (damageRange) {
        offense.physicalDamage = damageRange;
      }
    } else {
      const damageRange = parseDamageRange(line);
      if (damageRange) {
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1) {
          offense.elementalDamage.push({
            min: damageRange.min,
            max: damageRange.max,
            type: line.slice(0, colonIdx).trim(),
          });
        }
      }
    }
  }

  return { quality, defenses, offense };
}

/**
 * Parse requirements section.
 * Handles both inline format ("Requires Level 35, 98 Int") and multi-line format:
 * "Requirements:\nLevel: 35\nInt: 98"
 * @param section - Lines from a requirements section.
 * @param strings - ClientStrings for the detected language.
 * @returns Parsed requirements.
 */
function parseRequirements(section: string[], strings: ClientStrings): Requirements {
  const requirements: Requirements = {
    level: null,
    strength: null,
    dexterity: null,
    intelligence: null,
  };

  // Check if this section is a requirements section
  // Supports both inline ("Requires Level 35") and multi-line ("Requirements:\nLevel: 35")
  const isRequirementsSection = section.some(
    (line) => line.includes(strings.REQUIRES) || line.includes(strings.REQUIREMENTS_HEADER),
  );
  if (!isRequirementsSection) return requirements;

  // Parse ALL lines in the section for requirement values
  for (const line of section) {
    // Level requirement - matches all supported language variants
    const levelMatch = line.match(LEVEL_REQUIREMENT_PATTERN);
    if (levelMatch) {
      requirements.level = parseInt(levelMatch[1]!, 10);
    }

    // Stat requirements - look for patterns like "55 (augmented) Int" or "Int: 98"
    // Patterns have two capture groups: (1) for "Stat: 98" format, (2) for "98 Stat" format
    const strMatch = line.match(STRENGTH_REQUIREMENT_PATTERN);
    if (strMatch) {
      const value = parseInt(strMatch[1] ?? strMatch[2]!, 10);
      const unmet = UNMET_MARKER.test(
        line.slice(0, line.indexOf(strMatch[0]!) + strMatch[0]!.length),
      );
      const augmented = AUGMENTED_MARKER.test(
        line.slice(0, line.indexOf(strMatch[0]!) + strMatch[0]!.length),
      );
      requirements.strength = { value, augmented: augmented || unmet };
    }

    const dexMatch = line.match(DEXTERITY_REQUIREMENT_PATTERN);
    if (dexMatch) {
      const value = parseInt(dexMatch[1] ?? dexMatch[2]!, 10);
      const augmented = AUGMENTED_MARKER.test(
        line.slice(0, line.indexOf(dexMatch[0]!) + dexMatch[0]!.length),
      );
      requirements.dexterity = { value, augmented };
    }

    const intMatch = line.match(INTELLIGENCE_REQUIREMENT_PATTERN);
    if (intMatch) {
      const value = parseInt(intMatch[1] ?? intMatch[2]!, 10);
      const augmented = AUGMENTED_MARKER.test(
        line.slice(0, line.indexOf(intMatch[0]!) + intMatch[0]!.length),
      );
      requirements.intelligence = { value, augmented };
    }
  }

  return requirements;
}

/**
 * Parse sockets section (e.g., "Sockets: S S").
 * @param section - Lines from a sockets section.
 * @param strings - ClientStrings for the detected language.
 * @returns Array of sockets.
 */
function parseSockets(section: string[], strings: ClientStrings): ItemSocket[] {
  const sockets: ItemSocket[] = [];

  for (const line of section) {
    // Check both exact keyword and pattern (Russian has variant spellings е/ё)
    let socketsPart: string | null = null;
    if (line.startsWith(strings.SOCKETS)) {
      socketsPart = line.slice(strings.SOCKETS.length).trim();
    } else if (SOCKETS_PATTERN.test(line)) {
      // Extract the part after the colon/space
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        socketsPart = line.slice(colonIdx + 1).trim();
      }
    }

    if (!socketsPart) continue;

    // Sockets are space-separated: "S S" or "S(Rune Name)"
    const parts = socketsPart.split(/\s+/);
    for (const part of parts) {
      if (!part) continue;
      // Check for "(Rune Name)" suffix
      const runeMatch = part.match(/^(\w)\s*\((.+)\)$/);
      if (runeMatch) {
        sockets.push({ type: runeMatch[1]!, rune: runeMatch[2]! });
      } else {
        sockets.push({ type: part, rune: null });
      }
    }
  }

  return sockets;
}

/**
 * Parse a single mod line, detecting type from English markers.
 * @param line - Single mod line.
 * @returns Parsed mod with type.
 */
function parseMod(line: string): ItemMod {
  let type: ModType = 'explicit';
  let text = line.trim();

  for (const [modType, regex] of Object.entries(MOD_MARKERS)) {
    if (regex.test(text)) {
      type = modType as ModType;
      text = text.replace(regex, '').trim();
      break;
    }
  }

  return { text, type };
}

/**
 * Check if a section contains any of the given keywords.
 */
function sectionContains(section: string[], ...keywords: string[]): boolean {
  return section.some((line) => keywords.some((kw) => line.includes(kw)));
}

/**
 * Parse item level from a section.
 */
function parseItemLevel(section: string[], strings: ClientStrings): number | null {
  for (const line of section) {
    if (line.startsWith(strings.ITEM_LEVEL)) {
      const match = line.match(/(\d+)/);
      if (match) return parseInt(match[1]!, 10);
    }
    const patternMatch = line.match(ITEM_LEVEL_PATTERN);
    if (patternMatch) return parseInt(patternMatch[1]!, 10);
  }
  return null;
}

/**
 * Parse stack size from a section (for currency items).
 */
function parseStackSize(
  section: string[],
  strings: ClientStrings,
): { current: number; max: number } | null {
  for (const line of section) {
    if (line.startsWith(strings.STACK_SIZE)) {
      const match = line.match(/(\d+)\/(\d+)/);
      if (match) {
        return { current: parseInt(match[1]!, 10), max: parseInt(match[2]!, 10) };
      }
    }
  }
  return null;
}

/**
 * Parse flags (corrupted, unidentified, mirrored) from a section.
 */
function parseFlags(
  section: string[],
  strings: ClientStrings,
): { corrupted: boolean; unidentified: boolean; mirrored: boolean; split: boolean } {
  const flags = { corrupted: false, unidentified: false, mirrored: false, split: false };

  for (const line of section) {
    const trimmed = line.trim();
    if (trimmed === strings.CORRUPTED) flags.corrupted = true;
    if (trimmed === strings.UNIDENTIFIED) flags.unidentified = true;
    if (trimmed === strings.MIRRORED) flags.mirrored = true;
    if (trimmed === 'Split') flags.split = true;
  }

  return flags;
}

/**
 * Detect granted skills from mod lines.
 */
/** Pattern for EN inline format: "Grants Level 11 Chaos Bolt Skill" */
const GRANTED_SKILL_INLINE_PATTERN = /Grants?\s+Level\s+(\d+)\s+(.+?)\s+Skill\s*$/i;

function extractGrantedSkills(mods: ItemMod[]): string[] {
  const skills: string[] = [];

  for (const mod of mods) {
    // Check EN inline format first: "Grants Level 11 Chaos Bolt Skill"
    const inlineMatch = mod.text.match(GRANTED_SKILL_INLINE_PATTERN);
    if (inlineMatch) {
      skills.push(`${inlineMatch[2]!.trim()} (Level ${inlineMatch[1]})`);
      continue;
    }

    // Standard format: "Grants Skill: X" / "Дарует умение: X"
    const match = mod.text.match(GRANTED_SKILL_PATTERN);
    if (match && match[1]?.trim()) {
      skills.push(match[1].trim());
    }
  }

  return skills;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section-Consumer Pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create immutable parsing context from header-derived item data.
 * @param strings - Localized client strings.
 * @param language - Detected language code.
 * @param item - Item with header already parsed.
 * @returns ParseContext for section parsers.
 */
function createParseContext(
  strings: ClientStrings,
  language: SupportedLanguage,
  item: ParsedItem,
): ParseContext {
  return {
    strings,
    language,
    isGem: ITEM_CLASS_GEM_PATTERN.test(item.itemClass) || item.rarity === 'Gem',
    isFlask: ITEM_CLASS_FLASK_PATTERN.test(item.itemClass),
    isCharm: ITEM_CLASS_CHARM_PATTERN.test(item.itemClass),
    isMap: ITEM_CLASS_MAP_PATTERN.test(item.itemClass),
    isSocketable: ITEM_CLASS_SOCKETABLE_PATTERN.test(item.itemClass),
  };
}

/** Parse Item Level section. */
const parseItemLevelSection: SectionParser = (section, item, ctx): SectionResult => {
  if (
    !sectionContains(section, ctx.strings.ITEM_LEVEL) &&
    !section.some((line) => ITEM_LEVEL_PATTERN.test(line))
  ) {
    return 'skipped';
  }
  item.itemLevel = parseItemLevel(section, ctx.strings);
  return 'consumed';
};

/** Parse Sockets section. */
const parseSocketsSection: SectionParser = (section, item, ctx): SectionResult => {
  if (
    !sectionContains(section, ctx.strings.SOCKETS) &&
    !section.some((line) => SOCKETS_PATTERN.test(line))
  ) {
    return 'skipped';
  }
  item.sockets = parseSockets(section, ctx.strings);
  return 'consumed';
};

/** Parse Requirements section. */
const parseRequirementsSection: SectionParser = (section, item, ctx): SectionResult => {
  if (!sectionContains(section, ctx.strings.REQUIRES, ctx.strings.REQUIREMENTS_HEADER)) {
    return 'skipped';
  }
  item.requirements = parseRequirements(section, ctx.strings);
  return 'consumed';
};

/** Parse Socketable effects (Weapons:, Armour:, etc.) for runes/soul cores. */
const parseSocketableEffectsSection: SectionParser = (section, item, ctx): SectionResult => {
  if (!ctx.isSocketable) return 'not-applicable';
  if (!section.some((line) => SOCKETABLE_EFFECT_PATTERN.test(line))) return 'skipped';
  for (const line of section) {
    if (SOCKETABLE_EFFECT_PATTERN.test(line)) {
      item.socketableEffects.push(line);
    }
  }
  return 'consumed';
};

/** Parse Stats section (quality, defenses, offense). Skipped for socketable items and gems. */
const parseStatsSection: SectionParser = (section, item, ctx): SectionResult => {
  if (ctx.isSocketable || ctx.isGem) return 'not-applicable';
  const hasStatsKeywords =
    sectionContains(
      section,
      ctx.strings.QUALITY,
      ctx.strings.ARMOUR,
      ctx.strings.EVASION,
      ctx.strings.PHYSICAL_DAMAGE,
      ctx.strings.CRIT_CHANCE,
      ctx.strings.ATTACK_SPEED,
    ) ||
    section.some(
      (line) =>
        ENERGY_SHIELD_PATTERN.test(line) ||
        RELOAD_TIME_PATTERN.test(line) ||
        BLOCK_CHANCE_PATTERN.test(line) ||
        CRIT_CHANCE_STAT_PATTERN.test(line) ||
        ATTACK_SPEED_STAT_PATTERN.test(line) ||
        WEAPON_DAMAGE_PATTERN.test(line),
    );
  if (!hasStatsKeywords) return 'skipped';

  const stats = parseStats(section, ctx.strings);
  if (stats.quality) item.quality = stats.quality;
  if (stats.defenses.armour) item.defenses.armour = stats.defenses.armour;
  if (stats.defenses.evasion) item.defenses.evasion = stats.defenses.evasion;
  if (stats.defenses.energyShield) item.defenses.energyShield = stats.defenses.energyShield;
  if (stats.defenses.blockChance) item.defenses.blockChance = stats.defenses.blockChance;
  if (stats.offense.physicalDamage) item.offense.physicalDamage = stats.offense.physicalDamage;
  if (stats.offense.critChance) item.offense.critChance = stats.offense.critChance;
  if (stats.offense.attacksPerSecond) {
    item.offense.attacksPerSecond = stats.offense.attacksPerSecond;
  }
  if (stats.offense.reloadTime) {
    item.offense.reloadTime = stats.offense.reloadTime;
  }
  if (stats.offense.elementalDamage.length > 0) {
    item.offense.elementalDamage.push(...stats.offense.elementalDamage);
  }
  return 'consumed';
};

/** Parse Stack size section (currency items). */
const parseStackSizeSection: SectionParser = (section, item, ctx): SectionResult => {
  if (!sectionContains(section, ctx.strings.STACK_SIZE)) return 'skipped';
  item.stack = parseStackSize(section, ctx.strings);
  return 'consumed';
};

/** Parse Flags section (corrupted, unidentified, mirrored, split). */
const parseFlagsSection: SectionParser = (section, item, ctx): SectionResult => {
  if (
    !sectionContains(
      section,
      ctx.strings.CORRUPTED,
      ctx.strings.UNIDENTIFIED,
      ctx.strings.MIRRORED,
      'Split',
    )
  ) {
    return 'skipped';
  }
  const flags = parseFlags(section, ctx.strings);
  if (flags.corrupted) item.flags.corrupted = true;
  if (flags.unidentified) item.flags.unidentified = true;
  if (flags.mirrored) item.flags.mirrored = true;
  if (flags.split) item.flags.split = true;
  return 'consumed';
};

/** Parse Rune Effects section (e.g., "Socketed in Weapon: ..."). */
const parseRuneEffectsSection: SectionParser = (section, item): SectionResult => {
  if (!section.some((line) => RUNE_EFFECT_PATTERN.test(line))) return 'skipped';
  for (const line of section) {
    if (RUNE_EFFECT_PATTERN.test(line)) {
      item.runeEffects.push(line);
    }
  }
  return 'consumed';
};

/** Parse Flask base properties (recovery, charges). */
const parseFlaskPropertiesSection: SectionParser = (section, item, ctx): SectionResult => {
  if (!ctx.isFlask) return 'not-applicable';
  if (
    !section.some((line) => FLASK_RECOVERY_PATTERN.test(line) || FLASK_CHARGES_PATTERN.test(line))
  ) {
    return 'skipped';
  }
  for (const line of section) {
    if (FLASK_RECOVERY_PATTERN.test(line) || FLASK_CHARGES_PATTERN.test(line)) {
      item.flaskProperties.push(line);
    }
  }
  return 'consumed';
};

/** Parse Charm base properties (duration, limit, charges). */
const parseCharmPropertiesSection: SectionParser = (section, item, ctx): SectionResult => {
  if (!ctx.isCharm) return 'not-applicable';
  if (
    !section.some(
      (line) =>
        CHARM_DURATION_PATTERN.test(line) ||
        CHARM_LIMIT_PATTERN.test(line) ||
        CHARM_CHARGES_PATTERN.test(line),
    )
  ) {
    return 'skipped';
  }
  for (const line of section) {
    if (
      CHARM_DURATION_PATTERN.test(line) ||
      CHARM_LIMIT_PATTERN.test(line) ||
      CHARM_CHARGES_PATTERN.test(line)
    ) {
      item.charmProperties.push(line);
    }
  }
  return 'consumed';
};

/** Parse "Limited to: N" section for jewels. Only consumes single-line limit sections. */
const parseLimitSection: SectionParser = (section, item): SectionResult => {
  if (section.length !== 1) return 'skipped';
  if (!LIMIT_PATTERN.test(section[0]!)) return 'skipped';
  const match = section[0]!.match(LIMIT_PATTERN);
  if (match) {
    item.limit = parseInt(match[1]!, 10);
  }
  return 'consumed';
};

/** Parse standalone Tier section (e.g., uncut gems: "Tier: 10"). */
const parseTierSection: SectionParser = (section, item, ctx): SectionResult => {
  if (ctx.isMap) return 'not-applicable';
  if (section.length !== 1) return 'skipped';
  const match = section[0]!.match(TIER_PATTERN);
  if (!match) return 'skipped';
  item.tier = parseInt(match[1]!, 10);
  return 'consumed';
};

/** Parse Map/Waystone properties (area level, tier, quantity, rarity, pack size). Greedy. */
const parseMapPropertiesSection: SectionParser = (section, item, ctx): SectionResult => {
  if (!ctx.isMap) return 'not-applicable';

  const hasAreaLevel = section.some((line) => AREA_LEVEL_PATTERN.test(line));
  const hasMapStats = section.some(
    (line) =>
      MAP_TIER_PATTERN.test(line) ||
      MAP_ITEM_QUANTITY_PATTERN.test(line) ||
      MAP_ITEM_RARITY_PATTERN.test(line) ||
      MAP_PACK_SIZE_PATTERN.test(line),
  );

  if (!hasAreaLevel && !hasMapStats) return 'skipped';

  if (!item.mapProperties) {
    item.mapProperties = {
      areaLevel: null,
      tier: null,
      itemQuantity: null,
      itemRarity: null,
      packSize: null,
    };
  }

  for (const line of section) {
    const areaMatch = line.match(AREA_LEVEL_PATTERN);
    if (areaMatch) item.mapProperties.areaLevel = parseInt(areaMatch[1]!, 10);

    const tierMatch = line.match(MAP_TIER_PATTERN);
    if (tierMatch) item.mapProperties.tier = parseInt(tierMatch[1]!, 10);

    const quantityMatch = line.match(MAP_ITEM_QUANTITY_PATTERN);
    if (quantityMatch) item.mapProperties.itemQuantity = `${quantityMatch[1]}%`;

    const rarityMatch = line.match(MAP_ITEM_RARITY_PATTERN);
    if (rarityMatch) item.mapProperties.itemRarity = `${rarityMatch[1]}%`;

    const packSizeMatch = line.match(MAP_PACK_SIZE_PATTERN);
    if (packSizeMatch) item.mapProperties.packSize = `${packSizeMatch[1]}%`;
  }

  // Also extract tier from base type if present: "Waystone (Tier 5)"
  if (item.mapProperties.tier === null) {
    const baseTierMatch = item.baseType.match(/\(Tier\s*(\d+)\)/i);
    if (baseTierMatch) {
      item.mapProperties.tier = parseInt(baseTierMatch[1]!, 10);
    }
  }

  return 'consumed';
};

/** Parse Gem metadata section (tags, level, mana cost, cast time, etc.). Greedy. */
const parseGemInfoSection: SectionParser = (section, item, ctx): SectionResult => {
  if (!ctx.isGem) return 'not-applicable';

  const hasGemMetadata = section.some(
    (line) =>
      GEM_LEVEL_PATTERN.test(line) ||
      GEM_MANA_COST_PATTERN.test(line) ||
      GEM_MANA_MULTIPLIER_PATTERN.test(line) ||
      GEM_CAST_TIME_PATTERN.test(line) ||
      GEM_TAGS_PATTERN.test(line) ||
      GEM_CRIT_CHANCE_PATTERN.test(line) ||
      GEM_EFFECTIVENESS_PATTERN.test(line) ||
      GEM_RESERVATION_PATTERN.test(line),
  );
  if (!hasGemMetadata) return 'skipped';

  // Already parsed — consume to remove from pool without overwriting
  if (item.gemInfo) return 'consumed';

  const gemInfo: GemInfo = {
    tags: [],
    level: null,
    manaCost: null,
    manaMultiplier: null,
    castTime: null,
    critChance: null,
    effectiveness: null,
    reservation: null,
    experience: null,
  };

  for (const line of section) {
    if (GEM_TAGS_PATTERN.test(line)) {
      gemInfo.tags = line.split(',').map((t) => t.trim());
    }
    const levelMatch = line.match(GEM_LEVEL_PATTERN);
    if (levelMatch) {
      gemInfo.level = parseInt(levelMatch[1]!, 10);
    }
    const manaCostMatch = line.match(GEM_MANA_COST_PATTERN);
    if (manaCostMatch) {
      gemInfo.manaCost = parseInt(manaCostMatch[1]!, 10);
    }
    const manaMultMatch = line.match(GEM_MANA_MULTIPLIER_PATTERN);
    if (manaMultMatch) {
      gemInfo.manaMultiplier = parseInt(manaMultMatch[1]!, 10);
    }
    const castTimeMatch = line.match(GEM_CAST_TIME_PATTERN);
    if (castTimeMatch) {
      gemInfo.castTime = parseFloat(castTimeMatch[1]!.replace(',', '.'));
    }
    const critMatch = line.match(GEM_CRIT_CHANCE_PATTERN);
    if (critMatch) {
      gemInfo.critChance = parseFloat(critMatch[1]!.replace(',', '.'));
    }
    const effectivenessMatch = line.match(GEM_EFFECTIVENESS_PATTERN);
    if (effectivenessMatch) {
      gemInfo.effectiveness = parseFloat(effectivenessMatch[1]!.replace(',', '.'));
    }
    const reservationMatch = line.match(GEM_RESERVATION_PATTERN);
    if (reservationMatch) {
      gemInfo.reservation = parseInt(reservationMatch[1]!, 10);
    }
    const experienceMatch = line.match(GEM_EXPERIENCE_PATTERN);
    if (experienceMatch) {
      gemInfo.experience = experienceMatch[1]!;
    }
  }

  item.gemInfo = gemInfo;
  return 'consumed';
};

/** Parse Gem experience section (e.g., "Experience: 125000/250000"). */
const parseGemExperienceSection: SectionParser = (section, item, ctx): SectionResult => {
  if (!ctx.isGem) return 'not-applicable';
  if (!section.some((line) => GEM_EXPERIENCE_PATTERN.test(line))) return 'skipped';

  for (const line of section) {
    const experienceMatch = line.match(GEM_EXPERIENCE_PATTERN);
    if (experienceMatch) {
      if (!item.gemInfo) {
        item.gemInfo = {
          tags: [],
          level: null,
          manaCost: null,
          manaMultiplier: null,
          castTime: null,
          critChance: null,
          effectiveness: null,
          reservation: null,
          experience: null,
        };
      }
      item.gemInfo.experience = experienceMatch[1]!;
    }
  }
  return 'consumed';
};

/** Parse Flavor text section (quoted text in unique items). */
const parseFlavorTextSection: SectionParser = (section, item): SectionResult => {
  const hasDoubleQuotes = section.some((line) => line.startsWith('"') && line.endsWith('"'));
  const hasGuillemets = section.some((line) => line.startsWith('«') || line.endsWith('»'));

  if (!hasDoubleQuotes && !hasGuillemets) return 'skipped';

  if (hasDoubleQuotes) {
    item.flavorText = section
      .filter((line) => line.startsWith('"'))
      .map((line) => line.replace(/^"|"$/g, ''))
      .join('\n');
  } else if (hasGuillemets) {
    item.flavorText = section.map((line) => line.replace(/^«|»$/g, '')).join('\n');
  }
  return 'consumed';
};

/** Parse Rune section with header (e.g., "Rune: Desert Rune (Level 1)"). */
const parseRuneSectionHeaderSection: SectionParser = (section, item): SectionResult => {
  if (!section.some((line) => RUNE_SECTION_HEADER_PATTERN.test(line))) return 'skipped';
  for (const line of section) {
    if (RUNE_SECTION_HEADER_PATTERN.test(line)) continue;
    if (line.trim()) {
      item.mods.push({ text: line.trim(), type: 'rune' });
    }
  }
  return 'consumed';
};

/** Parse socketable item Level as base property (single-line "Level: N"). */
const parseSocketableLevelSection: SectionParser = (section, item, ctx): SectionResult => {
  if (!ctx.isSocketable || ctx.isGem) return 'not-applicable';
  if (section.length !== 1) return 'skipped';
  if (!GEM_LEVEL_PATTERN.test(section[0]!)) return 'skipped';

  const levelMatch = section[0]!.match(GEM_LEVEL_PATTERN);
  if (levelMatch && item.itemLevel === null) {
    item.itemLevel = parseInt(levelMatch[1]!, 10);
  }
  return 'consumed';
};

/** Consume single-line item type identifier sections (e.g., "Focus", "Map"). */
const parseSingleItemTypeSection: SectionParser = (section): SectionResult => {
  if (section.length !== 1) return 'skipped';
  if (!ITEM_TYPE_IDENTIFIERS.has(section[0]!.trim())) return 'skipped';
  return 'consumed';
};

/** Parse Gem description sections (non-metadata text for gems). Greedy. */
const parseGemDescriptionSection: SectionParser = (section, item, ctx): SectionResult => {
  if (!ctx.isGem) return 'not-applicable';
  if (!item.gemInfo) return 'skipped';
  if (section.length === 0) return 'skipped';

  const isDescription = section.every(
    (line) =>
      !Object.values(MOD_MARKERS).some((regex) => regex.test(line)) &&
      !USAGE_INSTRUCTION_PATTERN.test(line),
  );
  if (!isDescription) return 'skipped';

  for (const line of section) {
    if (!USAGE_INSTRUCTION_PATTERN.test(line) && line.trim()) {
      item.gemDescription.push(line);
    }
  }
  return 'consumed';
};

/** Recognize a standalone rune/soul core name section (socketed in the item). */
const parseStandaloneRuneNameSection: SectionParser = (section, item): SectionResult => {
  if (section.length !== 1) return 'skipped';
  const line = section[0]!.trim();
  if (Object.values(MOD_MARKERS).some((regex) => regex.test(line))) return 'skipped';
  if (!STANDALONE_RUNE_NAME_PATTERN.test(line)) return 'skipped';

  const emptySocket = item.sockets.find((s) => s.rune === null);
  if (emptySocket) {
    emptySocket.rune = line;
  }
  return 'consumed';
};

/** Parse Modifier sections — consumes all remaining sections. Greedy, must be last. */
const parseModifiersSection: SectionParser = (section, item, ctx): SectionResult => {
  for (const line of section) {
    if (SOCKETED_RUNE_PATTERN.test(line)) continue;
    if (USAGE_INSTRUCTION_PATTERN.test(line)) continue;
    if (ITEM_TYPE_IDENTIFIERS.has(line.trim())) continue;
    if (MODIFIER_HEADER_PATTERN.test(line)) continue;
    if (LIMIT_PATTERN.test(line)) {
      const match = line.match(LIMIT_PATTERN);
      if (match && item.limit === null) {
        item.limit = parseInt(match[1]!, 10);
      }
      continue;
    }
    if (TIER_PATTERN.test(line)) continue;
    if (GEM_EXPERIENCE_PATTERN.test(line)) continue;
    if (ctx.isSocketable && SOCKETABLE_EFFECT_PATTERN.test(line)) continue;

    const mod = parseMod(line);
    if (mod.text) {
      item.mods.push(mod);
    }
  }
  return 'consumed';
};

/** Ordered section parser pipeline. Order matters — modifiers must be last. */
const SECTION_PARSERS: ParserEntry[] = [
  { parse: parseItemLevelSection },
  { parse: parseSocketsSection },
  { parse: parseRequirementsSection },
  { parse: parseSocketableEffectsSection },
  { parse: parseStatsSection },
  { parse: parseStackSizeSection },
  { parse: parseFlagsSection },
  { parse: parseRuneEffectsSection },
  { parse: parseFlaskPropertiesSection },
  { parse: parseCharmPropertiesSection },
  { parse: parseLimitSection },
  { parse: parseTierSection },
  { parse: parseMapPropertiesSection, greedy: true },
  { parse: parseGemInfoSection, greedy: true },
  { parse: parseGemExperienceSection },
  { parse: parseFlavorTextSection },
  { parse: parseRuneSectionHeaderSection, greedy: true },
  { parse: parseSocketableLevelSection },
  { parse: parseSingleItemTypeSection },
  { parse: parseGemDescriptionSection, greedy: true },
  { parse: parseStandaloneRuneNameSection },
  // Modifier parser MUST be last — consumes all remaining sections
  { parse: parseModifiersSection, greedy: true },
];

/**
 * Run section-consumer pipeline over remaining (non-header) sections.
 * Each parser tries sections from the pool. Consumed sections are removed.
 * Greedy parsers try all sections; non-greedy stop after first match.
 */
function runPipeline(sections: string[][], item: ParsedItem, ctx: ParseContext): void {
  let pool = [...sections];

  for (const { parse, greedy } of SECTION_PARSERS) {
    if (greedy) {
      pool = pool.filter((section) => parse(section, item, ctx) !== 'consumed');
    } else {
      for (let i = 0; i < pool.length; i++) {
        const result = parse(pool[i]!, item, ctx);
        if (result === 'consumed') {
          pool.splice(i, 1);
          break;
        }
        if (result === 'not-applicable') {
          break;
        }
      }
    }
  }
}

/**
 * Main entry point: parse clipboard text to structured ParsedItem.
 * @param text - Raw clipboard text.
 * @returns Parsed item structure.
 */
function parseItemClipboard(text: string): ParsedItem {
  const { code: detectedLanguage, strings } = detectLanguage(text);
  const sections = splitSections(text);

  // Initialize with defaults
  const item: ParsedItem = {
    itemClass: '',
    rarity: 'Unknown',
    name: null,
    baseType: '',
    quality: null,
    itemLevel: null,
    defenses: { armour: null, evasion: null, energyShield: null, blockChance: null },
    offense: {
      physicalDamage: null,
      elementalDamage: [],
      critChance: null,
      attacksPerSecond: null,
      reloadTime: null,
    },
    requirements: { level: null, strength: null, dexterity: null, intelligence: null },
    sockets: [],
    mods: [],
    grantedSkills: [],
    runeEffects: [],
    socketableEffects: [],
    gemInfo: null,
    gemDescription: [],
    flaskProperties: [],
    charmProperties: [],
    mapProperties: null,
    limit: null,
    tier: null,
    flavorText: null,
    flags: { corrupted: false, unidentified: false, mirrored: false, split: false },
    stack: null,
    raw: text,
    detectedLanguage,
  };

  // Parse header from first section
  if (sections.length > 0) {
    const header = parseHeader(sections[0]!, strings);
    item.itemClass = header.itemClass;
    item.rarity = header.rarity;
    item.name = header.name;
    item.baseType = header.baseType;

    // Extract inline stats from the header section (Normal items may have stats here)
    const headerStats = parseStats(sections[0]!, strings);
    if (headerStats.quality) item.quality = headerStats.quality;
    if (headerStats.defenses.armour) item.defenses.armour = headerStats.defenses.armour;
    if (headerStats.defenses.evasion) item.defenses.evasion = headerStats.defenses.evasion;
    if (headerStats.defenses.energyShield)
      item.defenses.energyShield = headerStats.defenses.energyShield;
    if (headerStats.defenses.blockChance)
      item.defenses.blockChance = headerStats.defenses.blockChance;
  }

  // Run section-consumer pipeline on remaining sections
  const ctx = createParseContext(strings, detectedLanguage, item);
  runPipeline(sections.slice(1), item, ctx);

  // Post-processing: extract granted skills from mods
  item.grantedSkills = extractGrantedSkills(item.mods);

  if (item.grantedSkills.length > 0) {
    item.mods = item.mods.filter(
      (mod) =>
        !GRANTED_SKILL_PATTERN.test(mod.text) && !GRANTED_SKILL_INLINE_PATTERN.test(mod.text),
    );
  }

  return item;
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format augmented marker for display.
 */
function formatAugmented(stat: NumericStat | null): string {
  if (!stat) return '';
  return stat.augmented ? ` (augmented)` : '';
}

/**
 * Format a ParsedItem as markdown for LLM consumption.
 */
function formatItemAsMarkdown(item: ParsedItem, englishBaseType?: string | null): string {
  const lines: string[] = [];

  // Header
  const displayName = item.name ?? item.baseType;
  lines.push(`## ${displayName}`);
  if (item.name && item.baseType) {
    const baseLabel = englishBaseType ? `${item.baseType} (${englishBaseType})` : item.baseType;
    lines.push(`**${item.rarity} ${item.itemClass}** — ${baseLabel}`);
  } else {
    lines.push(`**${item.rarity} ${item.itemClass}**`);
  }
  lines.push('');

  // Base section
  lines.push('### Base');
  if (item.itemLevel !== null) {
    lines.push(`- **Item Level:** ${item.itemLevel}`);
  }
  if (item.quality) {
    lines.push(`- **Quality:** ${item.quality.value}%${formatAugmented(item.quality)}`);
  }
  if (item.stack) {
    lines.push(`- **Stack:** ${item.stack.current}/${item.stack.max}`);
  }
  if (item.limit !== null) {
    lines.push(`- **Limit:** ${item.limit}`);
  }
  if (item.tier !== null) {
    lines.push(`- **Tier:** ${item.tier}`);
  }
  lines.push('');

  // Defensive stats
  const hasDefenses =
    item.defenses.armour ||
    item.defenses.evasion ||
    item.defenses.energyShield ||
    item.defenses.blockChance;
  if (hasDefenses) {
    lines.push('### Defenses');
    if (item.defenses.blockChance) {
      lines.push(
        `- **Block Chance:** ${item.defenses.blockChance.value}%${formatAugmented(item.defenses.blockChance)}`,
      );
    }
    if (item.defenses.energyShield) {
      lines.push(
        `- **Energy Shield:** ${item.defenses.energyShield.value}${formatAugmented(item.defenses.energyShield)}`,
      );
    }
    if (item.defenses.armour) {
      lines.push(
        `- **Armour:** ${item.defenses.armour.value}${formatAugmented(item.defenses.armour)}`,
      );
    }
    if (item.defenses.evasion) {
      lines.push(
        `- **Evasion:** ${item.defenses.evasion.value}${formatAugmented(item.defenses.evasion)}`,
      );
    }
    lines.push('');
  }

  // Offensive stats
  const hasOffense =
    item.offense.physicalDamage ||
    item.offense.elementalDamage.length > 0 ||
    item.offense.critChance ||
    item.offense.attacksPerSecond ||
    item.offense.reloadTime;
  if (hasOffense) {
    lines.push('### Offense');
    if (item.offense.physicalDamage) {
      const pd = item.offense.physicalDamage;
      lines.push(`- **Physical Damage:** ${pd.min}-${pd.max}${pd.augmented ? ' (augmented)' : ''}`);
    }
    for (const ed of item.offense.elementalDamage) {
      lines.push(`- **${ed.type}:** ${ed.min}-${ed.max}`);
    }
    if (item.offense.critChance) {
      lines.push(
        `- **Critical Chance:** ${item.offense.critChance.value}%${formatAugmented(item.offense.critChance)}`,
      );
    }
    if (item.offense.attacksPerSecond) {
      lines.push(
        `- **Attacks per Second:** ${item.offense.attacksPerSecond.value}${formatAugmented(item.offense.attacksPerSecond)}`,
      );
    }
    if (item.offense.reloadTime) {
      lines.push(
        `- **Reload Time:** ${item.offense.reloadTime.value}s${formatAugmented(item.offense.reloadTime)}`,
      );
    }
    lines.push('');
  }

  // Requirements
  const hasReqs =
    item.requirements.level ||
    item.requirements.strength ||
    item.requirements.dexterity ||
    item.requirements.intelligence;
  if (hasReqs) {
    lines.push('### Requirements');
    if (item.requirements.level) {
      lines.push(`- **Level:** ${item.requirements.level}`);
    }
    if (item.requirements.strength) {
      lines.push(
        `- **Strength:** ${item.requirements.strength.value}${formatAugmented(item.requirements.strength)}`,
      );
    }
    if (item.requirements.dexterity) {
      lines.push(
        `- **Dexterity:** ${item.requirements.dexterity.value}${formatAugmented(item.requirements.dexterity)}`,
      );
    }
    if (item.requirements.intelligence) {
      lines.push(
        `- **Intelligence:** ${item.requirements.intelligence.value}${formatAugmented(item.requirements.intelligence)}`,
      );
    }
    lines.push('');
  }

  // Sockets
  if (item.sockets.length > 0) {
    lines.push('### Sockets');
    const socketDisplay = item.sockets
      .map((s) => (s.rune ? `${s.type}(${s.rune})` : s.type))
      .join(' ');
    lines.push(socketDisplay);
    lines.push('');
  }

  if (item.runeEffects.length > 0) {
    lines.push('### Rune Effects');
    for (const effect of item.runeEffects) {
      lines.push(`- ${effect}`);
    }
    lines.push('');
  }

  // Socketable Effects
  if (item.socketableEffects.length > 0) {
    lines.push('### Socketable Effects');
    for (const effect of item.socketableEffects) {
      lines.push(`- ${effect}`);
    }
    lines.push('');
  }

  if (item.flaskProperties.length > 0) {
    lines.push('### Flask Properties');
    for (const prop of item.flaskProperties) {
      lines.push(`- ${prop}`);
    }
    lines.push('');
  }

  if (item.charmProperties.length > 0) {
    lines.push('### Charm Properties');
    for (const prop of item.charmProperties) {
      lines.push(`- ${prop}`);
    }
    lines.push('');
  }

  if (item.mapProperties) {
    lines.push('### Map Properties');
    if (item.mapProperties.tier !== null) {
      lines.push(`- **Map Tier:** ${item.mapProperties.tier}`);
    }
    if (item.mapProperties.areaLevel !== null) {
      lines.push(`- **Area Level:** ${item.mapProperties.areaLevel}`);
    }
    if (item.mapProperties.itemQuantity) {
      lines.push(`- **Item Quantity:** ${item.mapProperties.itemQuantity}`);
    }
    if (item.mapProperties.itemRarity) {
      lines.push(`- **Item Rarity:** ${item.mapProperties.itemRarity}`);
    }
    if (item.mapProperties.packSize) {
      lines.push(`- **Monster Pack Size:** ${item.mapProperties.packSize}`);
    }
    lines.push('');
  }

  if (item.gemInfo) {
    lines.push('### Gem Info');
    if (item.gemInfo.tags.length > 0) {
      lines.push(`- **Tags:** ${item.gemInfo.tags.join(', ')}`);
    }
    if (item.gemInfo.level !== null) {
      lines.push(`- **Level:** ${item.gemInfo.level}`);
    }
    if (item.gemInfo.manaCost !== null) {
      lines.push(`- **Mana Cost:** ${item.gemInfo.manaCost}`);
    }
    if (item.gemInfo.manaMultiplier !== null) {
      lines.push(`- **Mana Multiplier:** ${item.gemInfo.manaMultiplier}%`);
    }
    if (item.gemInfo.castTime !== null) {
      lines.push(`- **Cast Time:** ${item.gemInfo.castTime} sec`);
    }
    if (item.gemInfo.critChance !== null) {
      lines.push(`- **Critical Hit Chance:** ${item.gemInfo.critChance}%`);
    }
    if (item.gemInfo.effectiveness !== null) {
      lines.push(`- **Damage Effectiveness:** ${item.gemInfo.effectiveness}%`);
    }
    if (item.gemInfo.reservation !== null) {
      lines.push(`- **Reservation:** ${item.gemInfo.reservation} Spirit`);
    }
    if (item.gemInfo.experience) {
      lines.push(`- **Experience:** ${item.gemInfo.experience}`);
    }
    lines.push('');
  }

  // Gem Description
  if (item.gemDescription.length > 0) {
    lines.push('### Description');
    for (const desc of item.gemDescription) {
      lines.push(`- ${desc}`);
    }
    lines.push('');
  }

  // Modifiers
  if (item.mods.length > 0) {
    lines.push('### Modifiers');

    const implicitMods = item.mods.filter((m) => m.type === 'implicit');
    const runeMods = item.mods.filter((m) => m.type === 'rune');
    const explicitMods = item.mods.filter((m) => m.type === 'explicit');
    const enchantMods = item.mods.filter((m) => m.type === 'enchant');
    const craftedMods = item.mods.filter((m) => m.type === 'crafted');
    const fracturedMods = item.mods.filter((m) => m.type === 'fractured');
    const desecratedMods = item.mods.filter((m) => m.type === 'desecrated');

    if (implicitMods.length > 0) {
      lines.push('**Implicit:**');
      for (const mod of implicitMods) {
        lines.push(`- ${mod.text}`);
      }
    }

    if (runeMods.length > 0) {
      lines.push('**Rune:**');
      for (const mod of runeMods) {
        lines.push(`- ${mod.text}`);
      }
    }

    if (enchantMods.length > 0) {
      lines.push('**Enchant:**');
      for (const mod of enchantMods) {
        lines.push(`- ${mod.text}`);
      }
    }

    if (craftedMods.length > 0) {
      lines.push('**Crafted:**');
      for (const mod of craftedMods) {
        lines.push(`- ${mod.text}`);
      }
    }

    if (fracturedMods.length > 0) {
      lines.push('**Fractured:**');
      for (const mod of fracturedMods) {
        lines.push(`- ${mod.text}`);
      }
    }

    if (desecratedMods.length > 0) {
      lines.push('**Desecrated:**');
      for (const mod of desecratedMods) {
        lines.push(`- ${mod.text}`);
      }
    }

    if (explicitMods.length > 0) {
      lines.push('**Explicit:**');
      for (const mod of explicitMods) {
        lines.push(`- ${mod.text}`);
      }
    }

    lines.push('');
  }

  // Granted skills
  if (item.grantedSkills.length > 0) {
    lines.push('### Granted Skills');
    for (const skill of item.grantedSkills) {
      lines.push(`- ${skill}`);
    }
    lines.push('');
  }

  // Flavor text
  if (item.flavorText) {
    lines.push('### Flavor Text');
    lines.push(`> ${item.flavorText.replace(/\n/g, '\n> ')}`);
    lines.push('');
  }

  // Flags
  const activeFlags: string[] = [];
  if (item.flags.corrupted) activeFlags.push('Corrupted');
  if (item.flags.unidentified) activeFlags.push('Unidentified');
  if (item.flags.mirrored) activeFlags.push('Mirrored');
  if (item.flags.split) activeFlags.push('Split');

  if (activeFlags.length > 0) {
    lines.push('### Flags');
    lines.push(activeFlags.join(' | '));
    lines.push('');
  }

  // Language info
  lines.push(`*Detected language: ${item.detectedLanguage}*`);

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register item parser tools with the MCP server.
 * @param server - McpServer instance.
 */
export function registerItemParserTools(server: McpServer): void {
  server.registerTool(
    'poe2_parse_item',
    {
      title: 'PoE2 Parse Item',
      description: `Parse Path of Exile 2 item text from clipboard (Ctrl+C in game).

Returns a structured breakdown of item properties, mods, and stats.
Supports all 11 PoE2 languages with automatic language detection.
When enrich=true (default), appends enrichment data from external APIs.

Args:
  - text (string): Raw item text copied from PoE2 clipboard
  - enrich (boolean, default true): Append mod tiers, base stats, unique prices
  - league (string, default "Fate of the Vaal"): League for price lookups

Returns: Markdown-formatted breakdown including:
  - Base info (item class, rarity, name, base type, item level, quality)
  - Defensive stats (armour, evasion, energy shield)
  - Offensive stats (physical damage, crit chance, attack speed)
  - Requirements (level, str/dex/int)
  - Sockets and socketed runes
  - Modifiers categorized by type (implicit, rune, explicit, crafted)
  - Granted skills
  - Flags (corrupted, unidentified, mirrored)
  - Enrichment (when enrich=true): mod tier table, base type stats, unique price

Examples:
  - "Parse this item: [paste item text]"
  - "What are the mods on this item?"
  - "Is this item good for my build?"`,
      inputSchema: {
        text: ItemClipboardSchema.shape.text,
        enrich: ItemClipboardSchema.shape.enrich,
        league: ItemClipboardSchema.shape.league,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ text, enrich, league }) => {
      try {
        // Validate minimum content
        if (!text || text.length < 10) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: 'Error: Input text too short to be a valid item. Please copy an item from PoE2 using Ctrl+C.',
              },
            ],
          };
        }

        // Check for section delimiters
        if (!text.includes(SECTION_DELIMITER)) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: 'Error: Invalid item format — no section delimiters found. Make sure you copied the item text directly from PoE2 (Ctrl+C while hovering over the item).',
              },
            ],
          };
        }

        const parsedItem = parseItemClipboard(text);
        let englishBaseType: string | null = null;

        if (enrich) {
          const enrichment = await enrichItem(parsedItem, league ?? DEFAULT_LEAGUE);
          englishBaseType = enrichment.englishBaseType;
          const enrichmentText = formatEnrichmentSection(enrichment, parsedItem);
          // Format markdown with English base type for non-EN items
          let markdown = formatItemAsMarkdown(parsedItem, englishBaseType);
          if (enrichmentText) {
            markdown += enrichmentText;
          }
          return {
            content: [{ type: 'text', text: markdown }],
          };
        }

        const markdown = formatItemAsMarkdown(parsedItem, null);

        return {
          content: [{ type: 'text', text: markdown }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error parsing item: ${msg}\n\nPlease ensure the text was copied directly from PoE2 using Ctrl+C while hovering over an item.`,
            },
          ],
        };
      }
    },
  );
}
