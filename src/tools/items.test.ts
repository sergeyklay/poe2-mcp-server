import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../services/api.js', () => ({
  getNinjaExchangeOverview: vi.fn(),
}));

import { getNinjaExchangeOverview } from '../services/api.js';
import { registerItemTools } from './items.js';

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
  registerItemTools(mockServer);
  return handlers;
}

function mockExchangeResponse(
  lines: Array<{
    id: string;
    primaryValue: number;
    volumePrimaryValue?: number;
  }>,
) {
  return {
    core: {
      items: [
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
    lines: lines.map((l) => ({
      id: l.id,
      primaryValue: l.primaryValue,
      volumePrimaryValue: l.volumePrimaryValue ?? 0,
      maxVolumeCurrency: 'chaos',
      maxVolumeRate: 27,
      sparkline: { totalChange: 0, data: [] },
    })),
  };
}

describe('poe2_item_price', () => {
  let handler: ToolHandler;

  beforeEach(() => {
    vi.restoreAllMocks();
    handler = extractHandlers().get('poe2_item_price')!;
  });

  it('finds items by partial id match and formats markdown', async () => {
    vi.mocked(getNinjaExchangeOverview).mockResolvedValue(
      mockExchangeResponse([
        { id: 'divine', primaryValue: 1, volumePrimaryValue: 80 },
        { id: 'exalted', primaryValue: 0.1, volumePrimaryValue: 200 },
      ]),
    );

    const result = await handler({
      name: 'divine',
      type: 'Currency',
      league: 'Standard',
    });

    expect(result.content[0]!.text).toContain('Divine Orb');
    expect(result.content[0]!.text).not.toContain('Exalted');
  });

  it('returns no-match message for unknown items', async () => {
    vi.mocked(getNinjaExchangeOverview).mockResolvedValue(mockExchangeResponse([]));

    const result = await handler({
      name: 'nonexistent',
      type: 'Currency',
      league: 'Standard',
    });

    expect(result.content[0]!.text).toContain('No items found');
  });

  it('returns no-match when API fails for a specific type (error is swallowed)', async () => {
    vi.mocked(getNinjaExchangeOverview).mockRejectedValue(new Error('HTTP 503'));

    const result = await handler({
      name: 'test',
      type: 'Currency',
      league: 'Standard',
    });

    expect(result.content[0]!.text).toContain('No items found');
  });

  it('finds unique items by partial name match', async () => {
    vi.mocked(getNinjaExchangeOverview).mockResolvedValue(
      mockExchangeResponse([
        {
          id: 'kaoms-heart',
          primaryValue: 3.5,
          volumePrimaryValue: 80,
        },
      ]),
    );

    const result = await handler({
      name: 'kaom',
      type: 'UniqueArmour',
      league: 'Standard',
    });

    expect(result.content[0]!.text).not.toContain('No items found');
  });

  it('searches all types including unique types when type is omitted', async () => {
    vi.mocked(getNinjaExchangeOverview).mockResolvedValue(mockExchangeResponse([]));

    await handler({ name: 'test', league: 'Standard' });

    const calledTypes = vi.mocked(getNinjaExchangeOverview).mock.calls.map((c) => c[1]);
    expect(calledTypes).toContain('Currency');
    expect(calledTypes).toContain('UniqueArmour');
    expect(calledTypes).toContain('UniqueWeapon');
    expect(calledTypes).toContain('UniqueAccessory');
    expect(calledTypes).toContain('UniqueJewel');
    expect(calledTypes).toContain('UniqueFlask');
  });

  it('returns unique item with chaos value in results', async () => {
    vi.mocked(getNinjaExchangeOverview).mockImplementation(async (_league, type) => {
      if (type === 'UniqueAccessory') {
        return {
          core: {
            items: [
              {
                id: 'atziris-disdain',
                name: "Atziri's Disdain",
                image: '',
                category: 'UniqueAccessory',
                detailsId: 'atziris-disdain',
              },
            ],
            rates: { chaos: 27 },
            primary: 'divine',
            secondary: 'chaos',
          },
          lines: [
            {
              id: 'atziris-disdain',
              primaryValue: 2,
              volumePrimaryValue: 50,
              maxVolumeCurrency: 'chaos',
              maxVolumeRate: 27,
              sparkline: { totalChange: 0, data: [] },
            },
          ],
        };
      }
      return mockExchangeResponse([]);
    });

    const result = await handler({
      name: "Atziri's Disdain",
      type: 'UniqueAccessory',
      league: 'Standard',
    });

    expect(result.content[0]!.text).toContain("Atziri's Disdain");
    expect(result.content[0]!.text).toContain('[UniqueAccessory]');
  });

  it('includes all item types in no-results message', async () => {
    vi.mocked(getNinjaExchangeOverview).mockResolvedValue(mockExchangeResponse([]));

    const result = await handler({
      name: 'nonexistent_xyz',
      type: 'UniqueArmour',
      league: 'Standard',
    });

    expect(result.content[0]!.text).toContain('UniqueArmour');
    expect(result.content[0]!.text).toContain('UniqueFlask');
  });
});

describe('poe2_exchange_top', () => {
  let handler: ToolHandler;

  beforeEach(() => {
    vi.restoreAllMocks();
    handler = extractHandlers().get('poe2_exchange_top')!;
  });

  it('returns top N items sorted by primaryValue', async () => {
    vi.mocked(getNinjaExchangeOverview).mockResolvedValue(
      mockExchangeResponse([
        { id: 'cheap', primaryValue: 0.001 },
        { id: 'expensive', primaryValue: 5 },
        { id: 'mid', primaryValue: 0.5 },
      ]),
    );

    const result = await handler({
      type: 'Currency',
      limit: 2,
      league: 'Standard',
    });

    expect(result.content[0]!.text).toContain('1. **Expensive**');
    expect(result.content[0]!.text).toContain('2. **Mid**');
    expect(result.content[0]!.text).not.toContain('Cheap');
  });

  it('returns isError on failure', async () => {
    vi.mocked(getNinjaExchangeOverview).mockRejectedValue(new Error('network'));

    const result = await handler({
      type: 'Currency',
      limit: 10,
      league: 'Standard',
    });

    expect(result.isError).toBe(true);
  });
});
