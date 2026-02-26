import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../services/api.js', () => ({
  getNinjaBuildIndex: vi.fn(),
}));

import { getNinjaBuildIndex } from '../services/api.js';
import { registerBuildTools } from './builds.js';

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
  registerBuildTools(mockServer);
  return handlers;
}

describe('poe2_meta_builds', () => {
  let handler: ToolHandler;

  beforeEach(() => {
    vi.restoreAllMocks();
    handler = extractHandlers().get('poe2_meta_builds')!;
  });

  it('formats class distribution with percentages and trends', async () => {
    vi.mocked(getNinjaBuildIndex).mockResolvedValue({
      leagueBuilds: [
        {
          leagueName: 'Fate of the Vaal',
          leagueUrl: 'vaal',
          total: 124295,
          status: 1,
          statistics: [
            { class: 'Blood Mage', percentage: 17.9, trend: 1 },
            { class: 'Oracle', percentage: 16.8, trend: -1 },
          ],
        },
      ],
    });

    const result = await handler({ league: 'Fate of the Vaal' });
    const text = result.content[0]!.text;

    expect(text).toContain('### Class Distribution');
    expect(text).toContain('**Blood Mage**: 17.9%');
    expect(text).toContain('trending up');
    expect(text).toContain('**Oracle**: 16.8%');
    expect(text).toContain('trending down');
    expect(text).toContain('124,295');
  });

  it('returns league-not-found message for unknown leagues', async () => {
    vi.mocked(getNinjaBuildIndex).mockResolvedValue({
      leagueBuilds: [
        {
          leagueName: 'Fate of the Vaal',
          leagueUrl: 'vaal',
          total: 100,
          status: 1,
          statistics: [],
        },
      ],
    });

    const result = await handler({ league: 'NonExistent' });

    expect(result.content[0]!.text).toContain('League "NonExistent" not found');
    expect(result.content[0]!.text).toContain('Fate of the Vaal');
  });

  it('filters by class_name when provided', async () => {
    vi.mocked(getNinjaBuildIndex).mockResolvedValue({
      leagueBuilds: [
        {
          leagueName: 'Fate of the Vaal',
          leagueUrl: 'vaal',
          total: 100,
          status: 1,
          statistics: [
            { class: 'Witch', percentage: 20, trend: 1 },
            { class: 'Warrior', percentage: 15, trend: 0 },
          ],
        },
      ],
    });

    const result = await handler({
      league: 'Fate of the Vaal',
      class_name: 'Witch',
    });
    const text = result.content[0]!.text;

    expect(text).toContain('**Witch**: 20.0%');
    expect(text).not.toContain('Warrior');
  });

  it('returns isError on failure', async () => {
    vi.mocked(getNinjaBuildIndex).mockRejectedValue(new Error('HTTP 502'));

    const result = await handler({ league: 'Standard' });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('HTTP 502');
  });
});
