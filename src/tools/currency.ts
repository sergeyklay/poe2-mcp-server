import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getNinjaExchangeOverview, displayNinjaName } from '../services/api.js';
import { DEFAULT_LEAGUE, LeagueSchema } from '../constants.js';

export function registerCurrencyTools(server: McpServer): void {
  // ── poe2_currency_prices ──────────────────────────────────────────
  server.registerTool(
    'poe2_currency_prices',
    {
      title: 'PoE2 Currency Prices',
      description: `Get current currency exchange rates for Path of Exile 2 from poe.ninja.

Returns prices of all currencies with chaos-equivalent values computed from exchange rates.
Data refreshes approximately every hour on poe.ninja.

Args:
  - league (string): League name (default: "${DEFAULT_LEAGUE}")

Returns: List of currencies with their exchange values and trade volumes.

Examples:
  - "How much is an Exalted Orb worth?" → call with default league
  - "Currency prices in Standard" → call with league="Standard"`,
      inputSchema: {
        league: LeagueSchema,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ league }) => {
      try {
        const data = await getNinjaExchangeOverview(league, 'Currency');

        // Build lookup: id → human-readable name from core reference items
        const coreNames = new Map<string, string>();
        for (const item of data.core.items) {
          coreNames.set(item.id, item.name);
        }

        const chaosRate = data.core.rates[data.core.secondary] ?? 1;

        const lines: string[] = [`## Currency Prices — ${league}`, ''];

        // Sort by chaos value descending
        const sorted = [...data.lines].sort((a, b) => {
          const chaosA = a.primaryValue * chaosRate;
          const chaosB = b.primaryValue * chaosRate;
          return chaosB - chaosA;
        });

        for (const line of sorted) {
          const name = displayNinjaName(line.id, coreNames);
          const chaosValue = (line.primaryValue * chaosRate).toFixed(2);
          const volume = line.volumePrimaryValue ?? 0;
          lines.push(`- **${name}**: ${chaosValue} chaos (volume: ${volume})`);
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error fetching currency prices for league "${league}": ${msg}\n\nAvailable PoE2 leagues: "${DEFAULT_LEAGUE}", "Standard". League names are case-sensitive.`,
            },
          ],
        };
      }
    },
  );

  // ── poe2_currency_check ───────────────────────────────────────────
  server.registerTool(
    'poe2_currency_check',
    {
      title: 'PoE2 Check Currency Value',
      description: `Look up the current value of a specific currency in Path of Exile 2.

Searches by partial name match (case-insensitive) against currency ids and reference item names.

Args:
  - name (string): Currency name or partial name, e.g. "exalted", "divine", "regal"
  - league (string): League name (default: "${DEFAULT_LEAGUE}")

Returns: Matched currency with its chaos-equivalent value and trade volume.

Examples:
  - "How much is a Divine Orb?" → name="divine"
  - "Price of Regal Orb" → name="regal"`,
      inputSchema: {
        name: z.string().min(2).describe('Currency name or partial match'),
        league: LeagueSchema,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ name, league }) => {
      try {
        const data = await getNinjaExchangeOverview(league, 'Currency');
        const query = name.toLowerCase();

        // Build lookup: id → human-readable name from core reference items
        const coreNames = new Map<string, string>();
        for (const item of data.core.items) {
          coreNames.set(item.id, item.name);
        }

        const chaosRate = data.core.rates[data.core.secondary] ?? 1;

        // Match against core item names and line ids
        const matches: Array<{
          id: string;
          name: string;
          chaosValue: number;
          volume: number;
        }> = [];

        for (const line of data.lines) {
          const itemName = coreNames.get(line.id);
          const matchesQuery =
            line.id.toLowerCase().includes(query) ||
            (itemName?.toLowerCase().includes(query) ?? false);

          if (matchesQuery) {
            matches.push({
              id: line.id,
              name: displayNinjaName(line.id, coreNames),
              chaosValue: line.primaryValue * chaosRate,
              volume: line.volumePrimaryValue ?? 0,
            });
          }
        }

        if (matches.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No currency found matching "${name}" in ${league}.\n\nTip: Try a shorter search term like "divine", "exalted", "chaos", etc.`,
              },
            ],
          };
        }

        const lines: string[] = [`## Currency: "${name}" — ${league}`, ''];
        for (const match of matches) {
          lines.push(`**${match.name}** (${match.id})`);
          lines.push(`- Chaos equivalent: ${match.chaosValue.toFixed(2)}`);
          lines.push(`- Trade volume: ${match.volume}`);
          lines.push('');
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
