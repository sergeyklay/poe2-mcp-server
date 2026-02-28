import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../services/api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api.js')>();
  return { ...actual, getNinjaExchangeOverview: vi.fn() };
});

import { getNinjaExchangeOverview } from '../services/api.js';
import { registerCurrencyTools } from './currency.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
}>;

function extractHandlers() {
  const handlers = new Map<string, ToolHandler>();
  const mockServer = {
    registerTool: vi.fn((name: string, _opts: unknown, fn: ToolHandler) => {
      handlers.set(name, fn);
    }),
  } as unknown as McpServer;
  registerCurrencyTools(mockServer);
  return handlers;
}

describe('poe2_currency_prices', () => {
  let handler: ToolHandler;

  beforeEach(() => {
    vi.restoreAllMocks();
    handler = extractHandlers().get('poe2_currency_prices')!;
  });

  it('returns formatted markdown with currency data sorted by chaos value', async () => {
    vi.mocked(getNinjaExchangeOverview).mockResolvedValue({
      core: {
        items: [
          {
            id: 'divine',
            name: 'Divine Orb',
            image: '',
            category: 'Currency',
            detailsId: 'divine-orb',
          },
          {
            id: 'exalted',
            name: 'Exalted Orb',
            image: '',
            category: 'Currency',
            detailsId: 'exalted-orb',
          },
          {
            id: 'chaos',
            name: 'Chaos Orb',
            image: '',
            category: 'Currency',
            detailsId: 'chaos-orb',
          },
        ],
        rates: { exalted: 284.9, chaos: 27.46 },
        primary: 'divine',
        secondary: 'chaos',
      },
      lines: [
        {
          id: 'exalted',
          primaryValue: 0.1,
          volumePrimaryValue: 200,
          maxVolumeCurrency: 'chaos',
          maxVolumeRate: 284.9,
          sparkline: { totalChange: 0, data: [] },
        },
        {
          id: 'divine',
          primaryValue: 1,
          volumePrimaryValue: 80,
          maxVolumeCurrency: 'chaos',
          maxVolumeRate: 27.46,
          sparkline: { totalChange: 0, data: [] },
        },
      ],
    });

    const result = await handler({ league: 'Standard' });

    expect(result.content[0]!.text).toContain('## Currency Prices — Standard');
    expect(result.content[0]!.text).toContain('Divine Orb');
    expect(result.content[0]!.text).toContain('Exalted Orb');
    const divineIdx = result.content[0]!.text.indexOf('Divine Orb');
    const exaltedIdx = result.content[0]!.text.indexOf('Exalted Orb');
    expect(divineIdx).toBeLessThan(exaltedIdx);
  });

  it('title-cases ids for items not in core.items', async () => {
    vi.mocked(getNinjaExchangeOverview).mockResolvedValue({
      core: {
        items: [],
        rates: { chaos: 27 },
        primary: 'divine',
        secondary: 'chaos',
      },
      lines: [
        {
          id: 'alch',
          primaryValue: 0.01,
          volumePrimaryValue: 500,
          maxVolumeCurrency: 'chaos',
          maxVolumeRate: 27,
          sparkline: { totalChange: 0, data: [] },
        },
      ],
    });

    const result = await handler({ league: 'Standard' });

    expect(result.content[0]!.text).toContain('**Alch**');
  });

  it('returns isError on fetch failure', async () => {
    vi.mocked(getNinjaExchangeOverview).mockRejectedValue(new Error('HTTP 500'));

    const result = await handler({ league: 'Standard' });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('HTTP 500');
  });
});

describe('poe2_currency_check', () => {
  let handler: ToolHandler;

  beforeEach(() => {
    vi.restoreAllMocks();
    handler = extractHandlers().get('poe2_currency_check')!;
  });

  it('finds currency by partial name match (case-insensitive)', async () => {
    vi.mocked(getNinjaExchangeOverview).mockResolvedValue({
      core: {
        items: [
          {
            id: 'exalted',
            name: 'Exalted Orb',
            image: '',
            category: 'Currency',
            detailsId: 'exalted-orb',
          },
          {
            id: 'divine',
            name: 'Divine Orb',
            image: '',
            category: 'Currency',
            detailsId: 'divine-orb',
          },
        ],
        rates: { chaos: 27 },
        primary: 'divine',
        secondary: 'chaos',
      },
      lines: [
        {
          id: 'exalted',
          primaryValue: 0.1,
          volumePrimaryValue: 100,
          maxVolumeCurrency: 'chaos',
          maxVolumeRate: 284,
          sparkline: { totalChange: 0, data: [] },
        },
        {
          id: 'divine',
          primaryValue: 1,
          volumePrimaryValue: 50,
          maxVolumeCurrency: 'chaos',
          maxVolumeRate: 27,
          sparkline: { totalChange: 0, data: [] },
        },
      ],
    });

    const result = await handler({ name: 'exalt', league: 'Standard' });

    expect(result.content[0]!.text).toContain('Exalted Orb');
    expect(result.content[0]!.text).not.toContain('Divine Orb');
  });

  it('returns helpful message when no match', async () => {
    vi.mocked(getNinjaExchangeOverview).mockResolvedValue({
      core: {
        items: [],
        rates: { chaos: 27 },
        primary: 'divine',
        secondary: 'chaos',
      },
      lines: [],
    });

    const result = await handler({ name: 'nonexistent', league: 'Standard' });

    expect(result.content[0]!.text).toContain('No currency found matching');
  });

  it('returns isError on service failure', async () => {
    vi.mocked(getNinjaExchangeOverview).mockRejectedValue(new Error('timeout'));

    const result = await handler({ name: 'divine', league: 'Standard' });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('timeout');
  });
});
