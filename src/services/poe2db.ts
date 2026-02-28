import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { RateLimiter, USER_AGENT } from './http.js';

// ─── poe2db.tw ─────────────────────────────────────────────────────────

// poe2db.tw: 15 req / 60 sec (undocumented limits, conservative)
const poe2dbLimiter = new RateLimiter(15, 60 * 1000);

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
  await poe2dbLimiter.wait();

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

// ─── poe2db Section Parsing ───────────────────────────────────────────

/**
 * Represents a parsed section from a poe2db HTML page.
 */
export interface Poe2dbSection {
  /** Section identifier (e.g., "Microtransactions", "Level Effect") */
  id: string;
  /** Human-readable header text (e.g., "Level Effect /40") */
  header: string;
  /** Extracted text content (HTML stripped, whitespace normalized) */
  content: string;
  /** Estimated item count from header (e.g., 40 from "Level Effect /40") */
  itemCount: number | null;
}

/**
 * Parsed poe2db page with structured sections.
 */
export interface Poe2dbParsedPage {
  /** Page title/name */
  title: string;
  /** Main description text (first card body or intro text) */
  description: string;
  /** Base stats, requirements, tags from the stats section */
  stats: string;
  /** Named sections extracted from card-header elements */
  sections: Map<string, Poe2dbSection>;
}

/**
 * Section filter configuration for poe2db output.
 */
export type Poe2dbSectionFilter =
  | 'description'
  | 'stats'
  | 'supports'
  | 'supports_full'
  | 'acquisition'
  | 'levels'
  | 'history'
  | 'microtransactions'
  | 'monsters';

/** Default sections to include when none specified. */
const DEFAULT_POE2DB_SECTIONS: Poe2dbSectionFilter[] = [
  'description',
  'stats',
  'supports',
  'acquisition',
];

/** Map raw poe2db section header names to filter keys. */
const POE2DB_SECTION_MAP: Record<string, Poe2dbSectionFilter> = {
  'Recommended Support Gems': 'supports',
  'Supported By': 'supports_full',
  From: 'acquisition',
  'Level Effect': 'levels',
  'Version history': 'history',
  Microtransactions: 'microtransactions',
};

/**
 * Map a raw section header name to its filter key.
 * Handles patterns like "{Name} Attr" → stats, "{Name} Monster" → monsters.
 */
function mapSectionName(rawName: string): Poe2dbSectionFilter | null {
  // Direct match
  if (rawName in POE2DB_SECTION_MAP) {
    return POE2DB_SECTION_MAP[rawName]!;
  }

  // Pattern matches
  if (rawName.endsWith(' Attr')) {
    return 'stats';
  }
  if (rawName.endsWith(' Monster')) {
    return 'monsters';
  }

  return null;
}

/**
 * Filter level rows to a specific range.
 * Extracts only the levels within min..max from the content.
 * Handles both newline-separated and tab-separated table formats.
 */
function filterLevelRows(content: string, levelRange: { min: number; max: number }): string {
  const lines = content.split(/\n/);
  const filtered: string[] = [];
  let headerLine = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Try to extract level from the first column (tab-separated or space-separated)
    const columns = trimmed.split(/\t/);
    const firstCol = columns[0]?.trim() ?? '';

    // Check if this is a header row
    if (firstCol.toLowerCase() === 'level' || firstCol.toLowerCase().startsWith('levelrequires')) {
      headerLine = trimmed;
      continue;
    }

    // Try to parse level number from first column
    const levelMatch = /^(\d+)/.exec(firstCol);
    if (levelMatch) {
      const level = parseInt(levelMatch[1]!, 10);
      if (level >= levelRange.min && level <= levelRange.max) {
        filtered.push(trimmed);
      }
    }
  }

  if (filtered.length === 0) {
    return `Level ${levelRange.min} data not found`;
  }

  // Include header if found
  if (headerLine) {
    return headerLine + '\n' + filtered.join('\n');
  }
  return filtered.join('\n');
}

/**
 * Format tab-separated table content into a readable markdown table.
 * Handles content like "Col1\tCol2\nVal1\tVal2" into proper markdown tables.
 */
function formatTableContent(content: string): string {
  const lines = content.split(/\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return content;

  // Check if content is tab-separated
  if (!lines.some((l) => l.includes('\t'))) {
    return content; // Not a table, return as-is
  }

  const rows = lines.map((line) => line.split('\t').map((cell) => cell.trim()));
  if (rows.length === 0) return content;

  // Build markdown table
  const output: string[] = [];
  const header = rows[0];
  output.push('| ' + header.join(' | ') + ' |');
  output.push('| ' + header.map(() => '---').join(' | ') + ' |');

  for (let i = 1; i < rows.length; i++) {
    // Pad row to match header length
    const row = rows[i];
    while (row.length < header.length) row.push('');
    output.push('| ' + row.join(' | ') + ' |');
  }

  return output.join('\n');
}

// ─── Poe2db HTML Parsing Helpers ────────────────────────────────────────────

/** Remove noise elements (scripts, styles, nav, ads, etc.) from the DOM. */
function cleanHtmlNoise($: cheerio.CheerioAPI): void {
  $('script, style, nav, footer, header, noscript, .ad-container, #consent-box').remove();
}

/** Extract title with fallback chain: og:title → h1 → page title → 'Unknown'. */
function extractTitle($: cheerio.CheerioAPI): string {
  const ogTitle = $('meta[property="og:title"]').attr('content');
  if (ogTitle) return ogTitle;

  const h1Title = $('h1').first().text().trim();
  if (h1Title) return h1Title;

  const pageTitle = $('title').text().split('-')[0]?.trim();
  return pageTitle || 'Unknown';
}

/** Extract description from og:description or flavor text, filtering mod IDs. */
function extractDescription($: cheerio.CheerioAPI): string {
  const ogDescription = $('meta[property="og:description"]').attr('content') ?? '';
  const flavorText = $('.gemPopup .secDescrText, .item-popup--poe2 .secDescrText')
    .first()
    .text()
    .trim();

  const description = ogDescription || flavorText || '';
  // Filter mod IDs (contain underscores without spaces)
  if (description.includes('_') && !description.includes(' ')) {
    return '';
  }
  return description;
}

/** Check if text looks like an internal mod ID (e.g., "damage_+%"). */
function isModId(text: string): boolean {
  return text.includes('_') && !text.includes(' ');
}

/** Extract gem/item stats from popup elements or base type stat containers. */
function extractStats($: cheerio.CheerioAPI): string {
  const stats: string[] = [];

  // Try .gemPopup first, fall back to .item-popup--poe2, then .Stats (base type pages)
  let popup = $('.gemPopup').first();
  if (popup.find('.property, .explicitMod').length === 0) {
    popup = $('.item-popup--poe2').first();
  }
  if (popup.find('.property, .explicitMod').length === 0) {
    popup = $('.Stats').first();
  }

  popup.find('.property, .explicitMod, .implicitMod, .requirements').each((_, el) => {
    const text = $(el).text().trim();
    if (text && !text.includes('Edit') && text.length < 200 && !isModId(text)) {
      stats.push(text);
    }
  });

  return stats.join('\n');
}

/** Parse HTML table rows into tab-separated content. */
function parseTableRows($: cheerio.CheerioAPI, table: cheerio.Cheerio<Element>): string {
  const rows: string[] = [];

  table.find('tr').each((_, tr) => {
    const cells: string[] = [];
    $(tr)
      .find('td, th')
      .each((_, cell) => {
        const $cell = $(cell);
        const anchors = $cell.find('a');
        if (anchors.length > 1) {
          const anchorTexts: string[] = [];
          anchors.each((_, a) => {
            const text = $(a).text().trim();
            if (text) anchorTexts.push(text);
          });
          cells.push(anchorTexts.join(', '));
        } else {
          const cellText = $cell.text().trim();
          if (cellText) cells.push(cellText);
        }
      });
    if (cells.length > 0) {
      rows.push(cells.join('\t'));
    }
  });

  return rows.join('\n');
}

/** Parse "Supported By" section with gem names and tags in "Gem (tags)" format. */
function parseSupportedByRow($: cheerio.CheerioAPI, row: cheerio.Cheerio<Element>): string {
  const gemEntries: string[] = [];

  row.find('.col').each((_, col) => {
    const anchors = $(col).find('a');
    let gemName = '';
    const tags: string[] = [];

    anchors.each((_, a) => {
      const text = $(a).text().trim();
      if (!text || text.length < 2 || text.includes('Reset')) return;

      if (!gemName) {
        gemName = text;
      } else {
        tags.push(text);
      }
    });

    if (gemName) {
      gemEntries.push(tags.length > 0 ? `${gemName} (${tags.join(', ')})` : gemName);
    }
  });

  return gemEntries.join(' | ');
}

/** Extract content from siblings of a card-header element. */
function extractSectionContent(
  $: cheerio.CheerioAPI,
  headerEl: cheerio.Cheerio<Element>,
  isSupportsSection: boolean,
): string {
  let current = headerEl.next();
  let attempts = 0;

  while (current.length && attempts < 5) {
    if (current.hasClass('card-body') && !isSupportsSection) {
      return current.text().trim();
    }

    if (current.hasClass('row') && isSupportsSection) {
      const content = parseSupportedByRow($, current);
      if (content) return content;
    }

    if (current.hasClass('table-responsive')) {
      return parseTableRows($, current);
    }

    if (current.is('table')) {
      return parseTableRows($, current);
    }

    if (current.hasClass('card-header')) {
      break;
    }

    current = current.next();
    attempts++;
  }

  // Fallback: try card-body within parent
  return headerEl.parent().find('.card-body').first().text().trim();
}

/**
 * Parse poe2db HTML into structured sections using Cheerio.
 *
 * @param html - Raw HTML from poe2db.tw
 * @returns Parsed page with sections map
 */
export function parsePoe2dbHtml(html: string): Poe2dbParsedPage {
  const $ = cheerio.load(html);

  cleanHtmlNoise($);

  const title = extractTitle($);
  const description = extractDescription($);
  const sections = new Map<string, Poe2dbSection>();
  let stats = extractStats($);

  // Parse each card-header section
  $('.card-header').each((_, el) => {
    const headerText = $(el).text().trim();
    if (!headerText || headerText.length < 2) return;

    // Parse section name and item count from "Name /N" format
    const match = /^(.+?)\s*\/(\d+)\s*$/.exec(headerText);
    const rawName = match?.[1]?.trim() ?? headerText;
    const itemCount = match?.[2] ? parseInt(match[2], 10) : null;

    const isSupportsSection = rawName === 'Supported By';
    const content = extractSectionContent($, $(el), isSupportsSection);

    const filterKey = mapSectionName(rawName);
    if (filterKey) {
      sections.set(filterKey, {
        id: rawName,
        header: headerText,
        content,
        itemCount,
      });

      // Capture stats from Attribute section if no popup stats found
      if (filterKey === 'stats' && !stats) {
        stats = content;
      }
    }
  });

  return { title, description, stats, sections };
}

/**
 * Filter and format parsed sections based on requested filters.
 *
 * @param page - Parsed page structure
 * @param term - Search term (for URL generation)
 * @param lang - Language code
 * @param sections - Section filters to include (defaults to essential set)
 * @param levelRange - Optional level range for "levels" section
 * @returns Formatted markdown string
 */
export function formatPoe2dbSections(
  page: Poe2dbParsedPage,
  term: string,
  lang: Poe2dbLang,
  sections?: Poe2dbSectionFilter[],
  levelRange?: { min: number; max: number },
): string {
  const filters = sections ?? DEFAULT_POE2DB_SECTIONS;
  const url = `https://poe2db.tw/${lang}/${encodeURIComponent(term.replace(/\s+/g, '_'))}`;

  const output: string[] = [`## poe2db: ${page.title} (${lang})`, `🔗 ${url}`, ''];

  // Description
  if (filters.includes('description') && page.description) {
    output.push(page.description, '');
  }

  // Stats
  if (filters.includes('stats') && page.stats) {
    output.push('### Stats', page.stats, '');
  }

  // Acquisition
  if (filters.includes('acquisition')) {
    const section = page.sections.get('acquisition');
    if (section) {
      output.push(`### ${section.id}`, section.content, '');
    }
  }

  // Recommended supports (formatted as markdown table)
  if (filters.includes('supports')) {
    const section = page.sections.get('supports');
    if (section) {
      const formatted = formatTableContent(section.content);
      output.push('### Recommended Support Gems', formatted, '');
    }
  }

  // Full supports list (now in "Gem (tags) | Gem (tags)" format)
  if (filters.includes('supports_full')) {
    const section = page.sections.get('supports_full');
    if (section) {
      const gems = section.content.split(' | ');
      const count = gems.length;
      if (count > 50) {
        const truncated = gems.slice(0, 50).join(' | ');
        output.push(
          `### Supported By (${count} gems)`,
          `⚠️ Large list (${count} entries). Showing first 50.`,
          truncated,
          '',
        );
      } else {
        output.push(`### Supported By`, section.content, '');
      }
    }
  }

  // Level scaling
  if (filters.includes('levels')) {
    const section = page.sections.get('levels');
    if (section) {
      const range = levelRange ?? { min: 1, max: 1 };
      const filtered = filterLevelRows(section.content, range);
      const header =
        range.min === range.max
          ? `### Level ${range.min} Stats`
          : `### Levels ${range.min}-${range.max}`;
      output.push(header, filtered, '');
    }
  }

  // Version history
  if (filters.includes('history')) {
    const section = page.sections.get('history');
    if (section) {
      output.push('### Version History', section.content, '');
    }
  }

  // Microtransactions (explicitly requested only)
  if (filters.includes('microtransactions')) {
    const section = page.sections.get('microtransactions');
    if (section) {
      output.push('### Microtransactions', section.content, '');
    }
  }

  // Monsters (explicitly requested only)
  if (filters.includes('monsters')) {
    const section = page.sections.get('monsters');
    if (section) {
      output.push('### Monsters Using This', section.content, '');
    }
  }

  return output.join('\n').trim();
}

// ─── Base Type Translation Cache ────────────────────────────────────────

/**
 * Cache of localized base type name → English slug mappings.
 * Keyed by "{lang}:{itemClassSlug}", e.g. "ru:Wands".
 */
const baseTypeCache = new Map<string, Map<string, string>>();

/**
 * Scrape a poe2db item class page to extract localized name → English slug mappings.
 * Parses HTML links like: href="Withered_Wand">Увядший жезл
 *
 * @param itemClassSlug - English item class slug (e.g., "Wands", "Body_Armours")
 * @param lang - poe2db language code
 * @returns Map of localized base type name → English slug
 */
async function fetchBaseTypeTranslations(
  itemClassSlug: string,
  lang: Poe2dbLang,
): Promise<Map<string, string>> {
  const cacheKey = `${lang}:${itemClassSlug}`;
  const cached = baseTypeCache.get(cacheKey);
  if (cached) return cached;

  const map = new Map<string, string>();

  try {
    const html = await getPoe2dbPage(itemClassSlug, lang);
    const $ = cheerio.load(html);

    // Parse links with pattern: href="English_Slug">Localized Name
    // Base type links use relative hrefs without language prefix
    $('a').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();

      if (!href || !text) return;
      // Match relative hrefs like "Withered_Wand" or "/ru/Withered_Wand"
      const slugMatch = href.match(/^(?:\/[a-z]{2}\/)?([A-Za-z][A-Za-z0-9_]+)$/);
      if (!slugMatch) return;

      const slug = slugMatch[1]!;
      // Filter out non-base-type links (navigation, keywords, etc.)
      if (
        slug === itemClassSlug ||
        slug.length < 3 ||
        /^(Items|Unique|Gem|Skill|Support|Spirit|Modifier|Keyword|Craft|Quest|Ascend|passive|Act|Waystone|Endgame|Reforging|Desecrated|Lineage|Liquid|Resistances|Spells|patreon|Reset)/.test(
          slug,
        )
      ) {
        return;
      }

      // Only index if the text looks like a base type name (not a skill/keyword)
      if (text.length >= 2 && text.length < 100 && !text.includes('\n')) {
        map.set(text.toLowerCase(), slug);
      }
    });
  } catch {
    // Silently fail — enrichment will proceed without translation
  }

  baseTypeCache.set(cacheKey, map);
  return map;
}

/**
 * Resolve a localized base type name to its English poe2db slug.
 *
 * @param localizedName - Base type name in the detected language (e.g., "Увядший жезл")
 * @param itemClassSlug - English item class slug from mapItemClassToEnglishSlug (e.g., "Wands")
 * @param lang - poe2db language code
 * @returns English slug (e.g., "Withered_Wand") or null if not found
 */
export async function resolveEnglishBaseType(
  localizedName: string,
  itemClassSlug: string,
  lang: Poe2dbLang,
): Promise<string | null> {
  if (lang === 'us') return localizedName.replace(/\s+/g, '_');

  const translations = await fetchBaseTypeTranslations(itemClassSlug, lang);
  return translations.get(localizedName.toLowerCase()) ?? null;
}
