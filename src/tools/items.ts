import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getNinjaExchangeOverview } from '../services/api.js';

const DEFAULT_LEAGUE = 'Fate of the Vaal';

const EXCHANGE_TYPES = [
  'Currency',
  'Fragments',
  'Abyss',
  'UncutGems',
  'LineageSupportGems',
  'Essences',
  'SoulCores',
  'Idols',
  'Runes',
  'Ritual',
  'Expedition',
  'Delirium',
  'Breach',
] as const;

/** Title-case a slug id for display (e.g. "alch" → "Alch"). */
function displayName(id: string, coreNames: Map<string, string>): string {
  return coreNames.get(id) ?? id.charAt(0).toUpperCase() + id.slice(1);
}

export function registerItemTools(server: McpServer): void {
  // ── poe2_item_price ───────────────────────────────────────────────
  server.registerTool(
    'poe2_item_price',
    {
      title: 'PoE2 Item Price Lookup',
      description: `Look up the current market price of an item in Path of Exile 2 from poe.ninja.

Searches by partial name match across exchange categories (Currency, Fragments, Essences, Soul Cores, Idols, Runes, etc.).

Args:
  - name (string): Item name or partial name, e.g. "divine", "essence", "rune"
  - type (string): Exchange category to search. If omitted, searches all categories.
  - league (string): League name (default: "Fate of the Vaal")

Returns: Matching items with chaos-equivalent values and trade volumes.

Examples:
  - "How much is a Divine Orb?" → name="divine", type="Currency"
  - "Price of essences" → name="essence", type="Essences"
  - "Find rune prices" → name="rune", type="Runes"`,
      inputSchema: {
        name: z.string().min(1).describe('Item name or partial match'),
        type: z
          .enum(EXCHANGE_TYPES)
          .optional()
          .describe('Exchange category to search. If omitted, searches all categories.'),
        league: z.string().default(DEFAULT_LEAGUE).describe('PoE2 league name'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ name, type, league }) => {
      try {
        const typesToSearch = type ? [type] : [...EXCHANGE_TYPES];
        const query = name.toLowerCase();
        const results: Array<{
          name: string;
          type: string;
          chaos: number;
          volume: number;
        }> = [];

        for (const t of typesToSearch) {
          try {
            const data = await getNinjaExchangeOverview(league, t);

            const coreNames = new Map<string, string>();
            for (const item of data.core.items) {
              coreNames.set(item.id, item.name);
            }

            const chaosRate = data.core.rates[data.core.secondary] ?? 1;

            for (const line of data.lines) {
              const itemName = coreNames.get(line.id);
              const matchesQuery =
                line.id.toLowerCase().includes(query) ||
                (itemName?.toLowerCase().includes(query) ?? false);

              if (matchesQuery) {
                results.push({
                  name: displayName(line.id, coreNames),
                  type: t,
                  chaos: line.primaryValue * chaosRate,
                  volume: line.volumePrimaryValue ?? 0,
                });
              }
            }
          } catch {
            // Some categories may not be available, skip silently
          }
        }

        if (results.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No items found matching "${name}" in ${league}.\n\nTip: Try a shorter name. Available categories: ${EXCHANGE_TYPES.join(', ')}`,
              },
            ],
          };
        }

        results.sort((a, b) => b.chaos - a.chaos);
        const top = results.slice(0, 15);

        const lines: string[] = [
          `## Item Prices: "${name}" — ${league}`,
          `Found ${results.length} match(es)`,
          '',
        ];
        for (const r of top) {
          lines.push(`**${r.name}** [${r.type}]`);
          lines.push(`- Chaos: ${r.chaos.toFixed(1)} | Volume: ${r.volume}`);
          lines.push('');
        }

        if (results.length > 15) {
          lines.push(`... and ${results.length - 15} more results.`);
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: 'text', text: `Error: ${msg}` }],
        };
      }
    },
  );

  // ── poe2_exchange_top ─────────────────────────────────────────────
  server.registerTool(
    'poe2_exchange_top',
    {
      title: 'PoE2 Top Exchange Items',
      description: `Get the most valuable items in a given exchange category in Path of Exile 2.

Args:
  - type (string): Exchange category — Currency, Fragments, Essences, SoulCores, Idols, Runes, etc.
  - limit (number): How many to return (default: 10, max: 30)
  - league (string): League name (default: "Fate of the Vaal")

Returns: Top N most valuable items sorted by chaos-equivalent value.`,
      inputSchema: {
        type: z.enum(EXCHANGE_TYPES).describe('Exchange category'),
        limit: z.number().int().min(1).max(30).default(10).describe('Number of results'),
        league: z.string().default(DEFAULT_LEAGUE),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ type, limit, league }) => {
      try {
        const data = await getNinjaExchangeOverview(league, type);

        const coreNames = new Map<string, string>();
        for (const item of data.core.items) {
          coreNames.set(item.id, item.name);
        }

        const chaosRate = data.core.rates[data.core.secondary] ?? 1;

        const sorted = [...data.lines].sort((a, b) => b.primaryValue - a.primaryValue);
        const top = sorted.slice(0, limit);

        const lines: string[] = [`## Top ${limit} ${type} — ${league}`, ''];
        for (let i = 0; i < top.length; i++) {
          const item = top[i]!;
          const name = displayName(item.id, coreNames);
          const chaosValue = (item.primaryValue * chaosRate).toFixed(1);
          const volume = item.volumePrimaryValue ?? 0;
          lines.push(`${i + 1}. **${name}** — ${chaosValue} chaos (volume: ${volume})`);
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: 'text', text: `Error: ${msg}` }],
        };
      }
    },
  );
}
