import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  searchWiki,
  getWikiPage,
  getPoe2dbPage,
  parsePoe2dbHtml,
  formatPoe2dbSections,
} from '../services/api.js';

/** Section filter enum for poe2_db_lookup. */
const Poe2dbSectionEnum = z.enum([
  'description',
  'stats',
  'supports',
  'supports_full',
  'acquisition',
  'levels',
  'history',
  'microtransactions',
  'monsters',
]);

export function registerWikiTools(server: McpServer): void {
  // ── poe2_wiki_search ──────────────────────────────────────────────
  server.registerTool(
    'poe2_wiki_search',
    {
      title: 'PoE2 Wiki Search',
      description: `Search the Path of Exile 2 community wiki (poe2wiki.net) for game mechanics, items, skills, and other information.

Args:
  - query (string): Search term — skill name, mechanic, item, monster, etc.

Returns: Up to 5 matching wiki articles with titles and snippets.

Examples:
  - "How does Contagion spread?" → query="Contagion"
  - "Energy Shield mechanics" → query="Energy Shield"
  - "Lich ascendancy" → query="Lich ascendancy"`,
      inputSchema: {
        query: z.string().min(2).max(200).describe('Search query for the wiki'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ query }) => {
      try {
        const results = await searchWiki(query);
        if (results.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No wiki articles found for "${query}". Try different keywords.`,
              },
            ],
          };
        }

        const lines: string[] = [`## Wiki Search: "${query}"`, ''];
        for (const r of results) {
          // Strip HTML tags from snippet
          const clean = r.snippet.replace(/<[^>]+>/g, '');
          lines.push(`### ${r.title}`);
          lines.push(`${clean}`);
          lines.push(
            `🔗 https://www.poe2wiki.net/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
          );
          lines.push('');
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: 'text', text: `Wiki search error: ${msg}` }],
        };
      }
    },
  );

  // ── poe2_wiki_page ────────────────────────────────────────────────
  server.registerTool(
    'poe2_wiki_page',
    {
      title: 'PoE2 Wiki Page Content',
      description: `Get the full content of a specific wiki page from poe2wiki.net.

Use poe2_wiki_search first to find the exact page title, then use this to read the full content.

Args:
  - title (string): Exact wiki page title (from search results)

Returns: Full wikitext content of the page (may be long — truncated at 8000 chars).`,
      inputSchema: {
        title: z.string().min(1).describe('Exact wiki page title'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ title }) => {
      try {
        let content = await getWikiPage(title);
        if (!content) {
          return {
            content: [
              {
                type: 'text',
                text: `Wiki page "${title}" not found or empty.`,
              },
            ],
          };
        }

        // Truncate very long pages
        if (content.length > 8000) {
          content = content.slice(0, 8000) + '\n\n... [truncated — page too long]';
        }

        return {
          content: [
            {
              type: 'text',
              text: `## Wiki: ${title}\n🔗 https://www.poe2wiki.net/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}\n\n${content}`,
            },
          ],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: 'text', text: `Error fetching wiki page: ${msg}` }],
        };
      }
    },
  );

  // ── poe2_db_lookup ────────────────────────────────────────────────
  server.registerTool(
    'poe2_db_lookup',
    {
      title: 'PoE2 Database Lookup',
      description: `Look up detailed game data from poe2db.tw — items, gems, mods, passives.

poe2db.tw contains datamined information directly from game files, including exact stat values, gem scaling, mod tiers, and more.

Useful for finding translations of game terms in various languages.

IMPORTANT: Skills, passives, and ascendancy nodes with ranks use Roman numerals in poe2db, not Arabic.
Convert rank numbers: 1→I, 2→II, 3→III, 4→IV, 5→V.
Always include the rank suffix if the user mentions a specific rank.

Args:
  - term (string): English name of an item, gem, mod, etc. Use underscores for spaces, e.g. "Essence_Drain", "Chaos_Bolt". For ranked skills/passives, append Roman numeral: "Urgent_Totems_II", "War_Cry_III".
  - lang: Language code — "us" (English, default), "tw" (Traditional Chinese), "cn" (Simplified Chinese), "kr" (Korean), "jp" (Japanese), "ru" (Russian), "de" (German), "fr" (French), "sp" (Spanish), "pt" (Portuguese), "th" (Thai)
  - sections (optional): Array of sections to include. Defaults to ["description", "stats", "supports", "acquisition"]. Options: "description", "stats", "supports", "supports_full", "acquisition", "levels", "history", "microtransactions", "monsters".
  - level_range (optional): For "levels" section — specify {min, max} to get specific level stats. Default shows level 1 only.

Returns: Focused markdown content with requested sections only.

Examples:
  - Gem details: term="Essence_Drain"
  - Gem with specific levels: term="Essence_Drain", sections=["description", "stats", "levels"], level_range={min: 10, max: 12}
  - Full support gem list: term="Chaos_Bolt", sections=["description", "supports_full"]
  - Passive rank 2: term="Urgent_Totems_II"
  - Ascendancy node rank 3: term="War_Cry_III"
  - French name: term="Chaos_Bolt", lang="fr"
  - Unique item: term="Atziri's_Rule"`,
      inputSchema: {
        term: z
          .string()
          .min(1)
          .describe(
            'Search term with underscores for spaces. Use Roman numerals for ranks, e.g. "Urgent_Totems_II", "Essence_Drain"',
          ),
        lang: z
          .enum(['us', 'tw', 'cn', 'kr', 'jp', 'ru', 'de', 'fr', 'sp', 'pt', 'th'])
          .default('us')
          .describe(
            'Language: us=English, tw=Traditional Chinese, cn=Simplified Chinese, kr=Korean, jp=Japanese, ru=Russian, de=German, fr=French, sp=Spanish, pt=Portuguese, th=Thai',
          ),
        sections: z
          .array(Poe2dbSectionEnum)
          .optional()
          .describe(
            'Sections to include. Defaults to ["description", "stats", "supports", "acquisition"]. ' +
              'Use "levels" with level_range for gem scaling. ' +
              'Use "supports_full" for complete support gem list.',
          ),
        level_range: z
          .object({
            min: z.number().int().min(1).max(40),
            max: z.number().int().min(1).max(40),
          })
          .optional()
          .describe(
            'Level range for "levels" section. Example: {min: 10, max: 12} returns levels 10-12 only.',
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ term, lang, sections, level_range }) => {
      try {
        const html = await getPoe2dbPage(term, lang);

        // Try structured parsing first
        try {
          const parsed = parsePoe2dbHtml(html);
          const text = formatPoe2dbSections(parsed, term, lang, sections, level_range);
          return {
            content: [{ type: 'text', text }],
          };
        } catch (parseError) {
          // Log parsing error to stderr (stdout reserved for MCP)
          console.error(
            'poe2db parsing failed, falling back to naive strip:',
            parseError instanceof Error ? parseError.message : parseError,
          );

          // Fallback: naive HTML stripping
          let text = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<nav[\s\S]*?<\/nav>/gi, '')
            .replace(/<footer[\s\S]*?<\/footer>/gi, '')
            .replace(/<header[\s\S]*?<\/header>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\s+/g, ' ')
            .trim();

          if (text.length > 6000) {
            text = text.slice(0, 6000) + '\n\n... [truncated]';
          }

          const url = `https://poe2db.tw/${lang}/${encodeURIComponent(term.replace(/\s+/g, '_'))}`;
          return {
            content: [
              {
                type: 'text',
                text: `## poe2db: ${term} (${lang})\n🔗 ${url}\n\n${text}\n\n(Structured parsing unavailable — showing raw content)`,
              },
            ],
          };
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error looking up "${term}" on poe2db: ${msg}\n\nTips:\n- Use English names with underscores, e.g. "Essence_Drain", "Orb_of_Augmentation"\n- For ranked skills/passives, use Roman numerals: "Urgent_Totems_II", not "Urgent_Totems_2"\n- Always include the rank suffix (I, II, III, etc.) if looking up a specific rank`,
            },
          ],
        };
      }
    },
  );
}
