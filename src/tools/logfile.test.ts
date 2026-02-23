import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../services/api.js', () => ({
  resolveLogFilePath: vi.fn(),
  readLogTail: vi.fn(),
  parseClientLog: vi.fn(),
  getFallbackLogPath: vi.fn(),
  hasSubstantialLogData: vi.fn(),
}));

import {
  resolveLogFilePath,
  readLogTail,
  parseClientLog,
  getFallbackLogPath,
  hasSubstantialLogData,
} from '../services/api.js';
import { registerLogfileTools } from './logfile.js';

type ToolHandler = (params: Record<string, unknown>) => Promise<{
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
}>;

describe('poe2_log_summary', () => {
  let handler: ToolHandler;

  beforeEach(() => {
    vi.restoreAllMocks();

    // Default: data is substantial, no fallback needed
    vi.mocked(hasSubstantialLogData).mockReturnValue(true);
    vi.mocked(getFallbackLogPath).mockReturnValue(null);

    const mockServer = {
      registerTool: vi.fn((name, _opts, fn) => {
        if (name === 'poe2_log_summary') handler = fn as ToolHandler;
      }),
    } as unknown as McpServer;

    registerLogfileTools(mockServer);
  });

  it('returns formatted markdown with zone and session data', async () => {
    vi.mocked(resolveLogFilePath).mockReturnValue('/path/to/Client.txt');
    vi.mocked(readLogTail).mockReturnValue([
      '2026/02/23 18:00:00 12345 abc123 [DEBUG Client 1234] Generating level 38 area "G3_10" with seed 999',
    ]);
    vi.mocked(parseClientLog).mockReturnValue({
      sessions: [
        {
          startTime: new Date('2026-02-23T17:00:00'),
          endTime: new Date('2026-02-23T19:00:00'),
          clientPid: 1234,
        },
      ],
      zoneVisits: [
        {
          timestamp: new Date('2026-02-23T18:00:00'),
          areaId: 'G3_10',
          areaLevel: 38,
          zoneName: 'Испытание Хаоса',
          decoded: {
            act: 3,
            areaIndex: 10,
            suffix: null,
            description: 'Act 3, area 10',
            englishName: 'The Trial of Chaos',
          },
        },
      ],
      playerEvents: [
        {
          timestamp: new Date('2026-02-23T18:17:01'),
          category: 'player' as const,
          rawMessage: 'NewBrewess was slain.',
          subsystem: null,
          clientPid: 1234,
        },
      ],
      lastZone: {
        timestamp: new Date('2026-02-23T18:00:00'),
        areaId: 'G3_10',
        areaLevel: 38,
        zoneName: 'Испытание Хаоса',
        decoded: {
          act: 3,
          areaIndex: 10,
          suffix: null,
          description: 'Act 3, area 10',
          englishName: 'The Trial of Chaos',
        },
      },
      summary: {
        totalPlayerEvents: 1,
        totalZoneVisits: 1,
        totalSessions: 1,
      },
    });

    const result = await handler({ tail_lines: 1000 });

    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toContain('## PoE2 Log Analysis');
    expect(result.content[0]!.text).toContain('Испытание Хаоса');
    expect(result.content[0]!.text).toContain('The Trial of Chaos');
    expect(result.content[0]!.text).toContain('G3_10');
    expect(result.content[0]!.text).toContain('NewBrewess was slain.');
  });

  it('displays current zone with English name for LLM translation', async () => {
    vi.mocked(resolveLogFilePath).mockReturnValue('/path/to/Client.txt');
    vi.mocked(readLogTail).mockReturnValue([]);
    vi.mocked(parseClientLog).mockReturnValue({
      sessions: [],
      zoneVisits: [],
      playerEvents: [],
      lastZone: {
        timestamp: new Date('2026-02-23T18:00:00'),
        areaId: 'G1_town',
        areaLevel: 1,
        zoneName: 'Лагерь Очищенной Просеки',
        decoded: {
          act: 1,
          areaIndex: null,
          suffix: null,
          description: 'Act 1 Town',
          englishName: 'Clearfell Encampment',
        },
      },
      summary: {
        totalPlayerEvents: 0,
        totalZoneVisits: 0,
        totalSessions: 0,
      },
    });

    const result = await handler({ tail_lines: 10000 });

    expect(result.content[0]!.text).toContain('Лагерь Очищенной Просеки / Clearfell Encampment');
  });

  it('shows area ID when English name is not in mapping', async () => {
    vi.mocked(resolveLogFilePath).mockReturnValue('/path/to/Client.txt');
    vi.mocked(readLogTail).mockReturnValue([]);
    vi.mocked(parseClientLog).mockReturnValue({
      sessions: [],
      zoneVisits: [],
      playerEvents: [],
      lastZone: {
        timestamp: new Date('2026-02-23T18:00:00'),
        areaId: 'G99_unknown',
        areaLevel: 50,
        zoneName: 'Some Future Zone',
        decoded: {
          act: 99,
          areaIndex: null,
          suffix: 'unknown',
          description: 'Act 99 (unknown)',
          englishName: null,
        },
      },
      summary: {
        totalPlayerEvents: 0,
        totalZoneVisits: 0,
        totalSessions: 0,
      },
    });

    const result = await handler({ tail_lines: 10000 });

    expect(result.content[0]!.text).toContain('**Current zone:** Some Future Zone');
    expect(result.content[0]!.text).not.toContain(' / ');
  });

  it('handles empty log with no zones, sessions, or events', async () => {
    vi.mocked(resolveLogFilePath).mockReturnValue('/path/to/Client.txt');
    vi.mocked(readLogTail).mockReturnValue([]);
    vi.mocked(parseClientLog).mockReturnValue({
      sessions: [],
      zoneVisits: [],
      playerEvents: [],
      lastZone: null,
      summary: {
        totalPlayerEvents: 0,
        totalZoneVisits: 0,
        totalSessions: 0,
      },
    });

    const result = await handler({ tail_lines: 10000 });

    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toContain('**Current zone:** Unknown');
    expect(result.content[0]!.text).toContain('No player events in this log scope.');
    expect(result.content[0]!.text).toContain('No zone visits in this log scope.');
    expect(result.content[0]!.text).toContain('No sessions detected in this log scope.');
  });

  it('passes log_file_path override to resolveLogFilePath', async () => {
    vi.mocked(resolveLogFilePath).mockReturnValue('D:\\Custom\\Client.txt');
    vi.mocked(readLogTail).mockReturnValue([]);
    vi.mocked(parseClientLog).mockReturnValue({
      sessions: [],
      zoneVisits: [],
      playerEvents: [],
      lastZone: null,
      summary: {
        totalPlayerEvents: 0,
        totalZoneVisits: 0,
        totalSessions: 0,
      },
    });

    await handler({
      log_file_path: 'D:\\Custom\\Client.txt',
      tail_lines: 10000,
    });

    // Second arg is config.poe2InstallPath (undefined when not configured)
    expect(resolveLogFilePath).toHaveBeenCalledWith('D:\\Custom\\Client.txt', undefined);
  });

  it('returns isError when resolveLogFilePath throws (auto-detection failure)', async () => {
    vi.mocked(resolveLogFilePath).mockImplementation(() => {
      throw new Error('## PoE2 log file not found\n\nCould not find...');
    });

    const result = await handler({ tail_lines: 10000 });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('PoE2 log file not found');
  });

  it('returns isError when readLogTail throws (file I/O error)', async () => {
    vi.mocked(resolveLogFilePath).mockReturnValue('/path/to/Client.txt');
    vi.mocked(readLogTail).mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });

    const result = await handler({ tail_lines: 10000 });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('ENOENT');
  });

  it('escapes pipe characters in player event messages', async () => {
    vi.mocked(resolveLogFilePath).mockReturnValue('/path/to/Client.txt');
    vi.mocked(readLogTail).mockReturnValue([]);
    vi.mocked(parseClientLog).mockReturnValue({
      sessions: [],
      zoneVisits: [],
      playerEvents: [
        {
          timestamp: new Date('2026-02-23T18:00:00'),
          category: 'player' as const,
          rawMessage: '10|20|30 values',
          subsystem: null,
          clientPid: 1234,
        },
      ],
      lastZone: null,
      summary: {
        totalPlayerEvents: 1,
        totalZoneVisits: 0,
        totalSessions: 0,
      },
    });

    const result = await handler({ tail_lines: 10000 });

    expect(result.content[0]!.text).toContain('10\\|20\\|30 values');
  });

  it('limits player events to last 50 entries', async () => {
    const manyEvents = Array.from({ length: 100 }, (_, i) => ({
      timestamp: new Date(`2026-02-23T${String(i % 24).padStart(2, '0')}:00:00`),
      category: 'player' as const,
      rawMessage: `Event ${i}`,
      subsystem: null,
      clientPid: 1234,
    }));

    vi.mocked(resolveLogFilePath).mockReturnValue('/path/to/Client.txt');
    vi.mocked(readLogTail).mockReturnValue([]);
    vi.mocked(parseClientLog).mockReturnValue({
      sessions: [],
      zoneVisits: [],
      playerEvents: manyEvents,
      lastZone: null,
      summary: {
        totalPlayerEvents: 100,
        totalZoneVisits: 0,
        totalSessions: 0,
      },
    });

    const result = await handler({ tail_lines: 10000 });

    expect(result.content[0]!.text).toContain('(50 earlier events omitted)');
    expect(result.content[0]!.text).toContain('Event 99');
    expect(result.content[0]!.text).not.toContain('Event 49');
  });

  it('formats zone history with local and English names', async () => {
    vi.mocked(resolveLogFilePath).mockReturnValue('/path/to/Client.txt');
    vi.mocked(readLogTail).mockReturnValue([]);
    vi.mocked(parseClientLog).mockReturnValue({
      sessions: [],
      zoneVisits: [
        {
          timestamp: new Date('2026-02-23T17:00:00'),
          areaId: 'G1_town',
          areaLevel: 1,
          zoneName: 'Лагерь',
          decoded: {
            act: 1,
            areaIndex: null,
            suffix: null,
            description: 'Act 1 Town',
            englishName: 'Clearfell Encampment',
          },
        },
        {
          timestamp: new Date('2026-02-23T18:00:00'),
          areaId: 'G3_10',
          areaLevel: 38,
          zoneName: null,
          decoded: {
            act: 3,
            areaIndex: 10,
            suffix: null,
            description: 'Act 3, area 10',
            englishName: 'The Trial of Chaos',
          },
        },
      ],
      playerEvents: [],
      lastZone: null,
      summary: {
        totalPlayerEvents: 0,
        totalZoneVisits: 2,
        totalSessions: 0,
      },
    });

    const result = await handler({ tail_lines: 10000 });

    expect(result.content[0]!.text).toContain('| G1_town | 1 | Лагерь | Clearfell Encampment |');
    expect(result.content[0]!.text).toContain('| G3_10 | 38 | - | The Trial of Chaos |');
  });

  it('shows source file type in output (Client.txt)', async () => {
    vi.mocked(resolveLogFilePath).mockReturnValue('/path/to/Client.txt');
    vi.mocked(readLogTail).mockReturnValue([]);
    vi.mocked(parseClientLog).mockReturnValue({
      sessions: [],
      zoneVisits: [],
      playerEvents: [],
      lastZone: null,
      summary: { totalPlayerEvents: 0, totalZoneVisits: 0, totalSessions: 0 },
    });

    const result = await handler({ tail_lines: 10000 });

    expect(result.content[0]!.text).toContain('**Source:** Client.txt (full history)');
  });

  it('shows source file type in output (LatestClient.txt)', async () => {
    vi.mocked(resolveLogFilePath).mockReturnValue('/path/to/LatestClient.txt');
    vi.mocked(readLogTail).mockReturnValue([]);
    vi.mocked(parseClientLog).mockReturnValue({
      sessions: [],
      zoneVisits: [],
      playerEvents: [],
      lastZone: null,
      summary: { totalPlayerEvents: 5, totalZoneVisits: 3, totalSessions: 1 },
    });

    const result = await handler({ tail_lines: 10000 });

    expect(result.content[0]!.text).toContain('**Source:** LatestClient.txt (current session)');
  });

  it('falls back to Client.txt when LatestClient.txt has insufficient data', async () => {
    const sparseData = {
      sessions: [],
      zoneVisits: [],
      playerEvents: [],
      lastZone: null,
      summary: { totalPlayerEvents: 1, totalZoneVisits: 0, totalSessions: 0 },
    };
    const richData = {
      sessions: [
        {
          startTime: new Date('2026-02-23T17:00:00'),
          endTime: new Date('2026-02-23T19:00:00'),
          clientPid: 1234,
        },
      ],
      zoneVisits: [
        {
          timestamp: new Date('2026-02-23T18:00:00'),
          areaId: 'G3_10',
          areaLevel: 38,
          zoneName: 'Trial of Chaos',
          decoded: null,
        },
      ],
      playerEvents: [
        {
          timestamp: new Date('2026-02-23T18:00:00'),
          category: 'player' as const,
          rawMessage: 'Some event',
          subsystem: null,
          clientPid: 1234,
        },
      ],
      lastZone: null,
      summary: { totalPlayerEvents: 10, totalZoneVisits: 5, totalSessions: 2 },
    };

    vi.mocked(resolveLogFilePath).mockReturnValue('/path/to/LatestClient.txt');
    vi.mocked(hasSubstantialLogData).mockReturnValue(false);
    vi.mocked(getFallbackLogPath).mockReturnValue('/path/to/Client.txt');
    vi.mocked(readLogTail)
      .mockReturnValueOnce([]) // LatestClient.txt
      .mockReturnValueOnce([]); // Client.txt
    vi.mocked(parseClientLog)
      .mockReturnValueOnce(sparseData) // LatestClient.txt
      .mockReturnValueOnce(richData); // Client.txt

    const result = await handler({ tail_lines: 10000 });

    expect(result.content[0]!.text).toContain('**Source:** Client.txt (full history)');
    expect(result.content[0]!.text).toContain('10 event(s)');
  });

  it('keeps LatestClient.txt when fallback has less data', async () => {
    const latestData = {
      sessions: [],
      zoneVisits: [],
      playerEvents: [],
      lastZone: null,
      summary: { totalPlayerEvents: 3, totalZoneVisits: 2, totalSessions: 1 },
    };
    const clientData = {
      sessions: [],
      zoneVisits: [],
      playerEvents: [],
      lastZone: null,
      summary: { totalPlayerEvents: 1, totalZoneVisits: 1, totalSessions: 0 },
    };

    vi.mocked(resolveLogFilePath).mockReturnValue('/path/to/LatestClient.txt');
    vi.mocked(hasSubstantialLogData).mockReturnValue(false);
    vi.mocked(getFallbackLogPath).mockReturnValue('/path/to/Client.txt');
    vi.mocked(readLogTail).mockReturnValue([]);
    vi.mocked(parseClientLog).mockReturnValueOnce(latestData).mockReturnValueOnce(clientData);

    const result = await handler({ tail_lines: 10000 });

    // Should stay with LatestClient.txt because it has more data
    expect(result.content[0]!.text).toContain('**Source:** LatestClient.txt (current session)');
  });
});
