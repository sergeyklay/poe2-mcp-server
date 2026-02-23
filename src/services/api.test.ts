import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchJson,
  getNinjaExchangeOverview,
  getNinjaBuildIndex,
  getPoe2dbPage,
  normalizeTrailingArabicToRoman,
  searchWiki,
  getWikiPage,
  decodeZoneCode,
  parseClientLog,
} from './api.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('fetchJson', () => {
  it('returns parsed JSON on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: 42 }),
      }),
    );

    const result = await fetchJson<{ data: number }>('https://example.com/api');

    expect(result).toEqual({ data: 42 });
  });

  it('sends correct headers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      }),
    );

    await fetchJson('https://example.com/api');

    expect(fetch).toHaveBeenCalledWith('https://example.com/api', {
      headers: {
        'User-Agent': expect.stringContaining('poe2-mcp-server'),
        Accept: 'application/json',
      },
    });
  });

  it('throws on non-OK response with status and body excerpt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      }),
    );

    await expect(fetchJson('https://example.com/api')).rejects.toThrow('HTTP 404');
  });

  it('truncates long error bodies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('x'.repeat(500)),
      }),
    );

    await expect(fetchJson('https://example.com/api')).rejects.toThrow(/^HTTP 500/);
  });
});

describe('getNinjaExchangeOverview', () => {
  it('constructs URL with encoded league and type params', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            core: {
              items: [],
              rates: {},
              primary: 'divine',
              secondary: 'chaos',
            },
            lines: [],
          }),
      }),
    );

    await getNinjaExchangeOverview('Fate of the Vaal', 'Currency');

    const url = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(url).toContain('league=Fate%20of%20the%20Vaal');
    expect(url).toContain('type=Currency');
    expect(url).toContain('/exchange/current/overview');
  });
});

describe('getNinjaBuildIndex', () => {
  it('fetches build-index-state endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ leagueBuilds: [] }),
      }),
    );

    await getNinjaBuildIndex();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/poe2/api/data/build-index-state'),
      expect.any(Object),
    );
  });
});

describe('normalizeTrailingArabicToRoman', () => {
  it.each([
    { input: 'Urgent_Totems_1', expected: 'Urgent_Totems_I' },
    { input: 'Urgent_Totems_2', expected: 'Urgent_Totems_II' },
    { input: 'War_Cry_3', expected: 'War_Cry_III' },
    { input: 'Skill_4', expected: 'Skill_IV' },
    { input: 'Node_5', expected: 'Node_V' },
    { input: 'Aura_6', expected: 'Aura_VI' },
    { input: 'Buff_7', expected: 'Buff_VII' },
    { input: 'Totem_8', expected: 'Totem_VIII' },
    { input: 'Mark_9', expected: 'Mark_IX' },
    { input: 'Phase_10', expected: 'Phase_X' },
  ])('converts trailing _$input to Roman numeral', ({ input, expected }) => {
    expect(normalizeTrailingArabicToRoman(input)).toBe(expected);
  });

  it.each([
    { input: 'Essence_Drain', reason: 'no trailing numeral' },
    { input: 'Fireball', reason: 'single word, no underscore' },
    { input: 'Thing_11', reason: 'numeral > 10' },
    { input: 'Item_99', reason: 'large numeral beyond map' },
    { input: '42', reason: 'bare number without underscore prefix' },
  ])('returns "$input" unchanged ($reason)', ({ input }) => {
    expect(normalizeTrailingArabicToRoman(input)).toBe(input);
  });
});

describe('getPoe2dbPage', () => {
  it('fetches with normalized slug when term has trailing Arabic numeral', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html>content</html>'),
      }),
    );

    await getPoe2dbPage('Urgent_Totems_2');

    expect(fetch).toHaveBeenCalledWith('https://poe2db.tw/us/Urgent_Totems_II', expect.any(Object));
  });

  it('fetches English page by default with no normalization needed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html>content</html>'),
      }),
    );

    await getPoe2dbPage('Essence Drain');

    expect(fetch).toHaveBeenCalledWith('https://poe2db.tw/us/Essence_Drain', expect.any(Object));
  });

  it('fetches French page when lang=fr', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html>contenu</html>'),
      }),
    );

    await getPoe2dbPage('Chaos_Bolt', 'fr');

    expect(fetch).toHaveBeenCalledWith('https://poe2db.tw/fr/Chaos_Bolt', expect.any(Object));
  });

  it('retries with original slug when normalized slug returns 404', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('<html>fallback</html>'),
      });
    vi.stubGlobal('fetch', mockFetch);

    const result = await getPoe2dbPage('Urgent_Totems_2');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0]![0]).toBe('https://poe2db.tw/us/Urgent_Totems_II');
    expect(mockFetch.mock.calls[1]![0]).toBe('https://poe2db.tw/us/Urgent_Totems_2');
    expect(result).toBe('<html>fallback</html>');
  });

  it('throws when both normalized and original slugs return 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(getPoe2dbPage('Urgent_Totems_2')).rejects.toThrow('404');
  });

  it('throws immediately on 404 when no normalization was applied', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal('fetch', mockFetch);

    await expect(getPoe2dbPage('NoExist')).rejects.toThrow('404');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws immediately on non-404 errors without retrying', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', mockFetch);

    await expect(getPoe2dbPage('Urgent_Totems_2')).rejects.toThrow('500');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('searchWiki', () => {
  it('constructs URL with encoded query', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ query: { search: [] } }),
      }),
    );

    await searchWiki('Energy Shield');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('srsearch=Energy%20Shield'),
      expect.any(Object),
    );
  });

  it('returns empty array when no results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      }),
    );

    const results = await searchWiki('nonexistent');

    expect(results).toEqual([]);
  });

  it('returns search results', async () => {
    const mockResults = [{ title: 'Fireball', snippet: 'A fire skill', pageid: 1 }];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ query: { search: mockResults } }),
      }),
    );

    const results = await searchWiki('Fireball');

    expect(results).toEqual(mockResults);
  });
});

describe('getWikiPage', () => {
  it('returns wikitext content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            parse: { wikitext: { '*': '== Overview ==\nSome content' } },
          }),
      }),
    );

    const content = await getWikiPage('Fireball');

    expect(content).toBe('== Overview ==\nSome content');
  });

  it('returns empty string when page not found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      }),
    );

    const content = await getWikiPage('NonExistentPage');

    expect(content).toBe('');
  });
});

describe('decodeZoneCode', () => {
  it.each([
    {
      areaId: 'G3_10',
      expected: {
        act: 3,
        areaIndex: 10,
        suffix: null,
        description: 'Act 3, area 10',
        englishName: 'The Trial of Chaos',
      },
    },
    {
      areaId: 'G1_town',
      expected: {
        act: 1,
        areaIndex: null,
        suffix: null,
        description: 'Act 1 Town',
        englishName: 'Clearfell Encampment',
      },
    },
    {
      areaId: 'G3_10_Airlock',
      expected: {
        act: 3,
        areaIndex: 10,
        suffix: 'Airlock',
        description: 'Act 3, area 10 [Airlock]',
        englishName: 'Temple of Chaos (Entrance)',
      },
    },
    {
      areaId: 'G2_1',
      expected: {
        act: 2,
        areaIndex: 1,
        suffix: null,
        description: 'Act 2, area 1',
        englishName: 'Mawdun Quarry',
      },
    },
  ])('decodes $areaId correctly', ({ areaId, expected }) => {
    const result = decodeZoneCode(areaId);

    expect(result).toEqual(expected);
  });

  it('returns null for non-matching area IDs', () => {
    expect(decodeZoneCode('Invalid')).toBeNull();
    expect(decodeZoneCode('Zone_1_2')).toBeNull();
    expect(decodeZoneCode('')).toBeNull();
  });

  it('returns englishName as null when zone is not in ZONE_NAMES', () => {
    const result = decodeZoneCode('G99_999');

    expect(result?.englishName).toBeNull();
    expect(result?.act).toBe(99);
    expect(result?.areaIndex).toBe(999);
  });
});

describe('parseClientLog', () => {
  it('parses zone generation events', () => {
    const lines = [
      '2026/02/23 18:00:00 12345 abc123 [DEBUG Client 1234] Generating level 38 area "G3_10" with seed 999',
    ];

    const result = parseClientLog(lines);

    expect(result.zoneVisits).toHaveLength(1);
    expect(result.zoneVisits[0]).toMatchObject({
      areaId: 'G3_10',
      areaLevel: 38,
      zoneName: null,
    });
    expect(result.zoneVisits[0]?.decoded?.englishName).toBe('The Trial of Chaos');
    expect(result.lastZone?.areaId).toBe('G3_10');
  });

  it('attaches localized zone name from SCENE message', () => {
    const lines = [
      '2026/02/23 18:00:00 12345 abc123 [DEBUG Client 1234] Generating level 38 area "G3_10" with seed 999',
      '2026/02/23 18:00:01 12346 abc124 [INFO Client 1234] [SCENE] Set Source [Испытание Хаоса]',
    ];

    const result = parseClientLog(lines);

    expect(result.zoneVisits[0]?.zoneName).toBe('Испытание Хаоса');
  });

  it('skips placeholder zone names like (null) and (unknown)', () => {
    const lines = [
      '2026/02/23 18:00:00 12345 abc123 [DEBUG Client 1234] Generating level 38 area "G3_10" with seed 999',
      '2026/02/23 18:00:01 12346 abc124 [INFO Client 1234] [SCENE] Set Source [(null)]',
      '2026/02/23 18:00:02 12347 abc125 [INFO Client 1234] [SCENE] Set Source [(unknown)]',
      '2026/02/23 18:00:03 12348 abc126 [INFO Client 1234] [SCENE] Set Source [Real Zone Name]',
    ];

    const result = parseClientLog(lines);

    expect(result.zoneVisits[0]?.zoneName).toBe('Real Zone Name');
  });

  it('categorizes player events (colon prefix)', () => {
    const lines = [
      '2026/02/23 18:00:00 12345 abc123 [INFO Client 1234] : NewBrewess was slain.',
      '2026/02/23 18:00:01 12346 abc124 [INFO Client 1234] : NewBrewess (Witch) is now level 38',
    ];

    const result = parseClientLog(lines);

    expect(result.playerEvents).toHaveLength(2);
    expect(result.playerEvents[0]).toMatchObject({
      category: 'player',
      rawMessage: 'NewBrewess was slain.',
    });
    expect(result.playerEvents[1]).toMatchObject({
      category: 'player',
      rawMessage: 'NewBrewess (Witch) is now level 38',
    });
  });

  it('categorizes trade chat events (hash prefix)', () => {
    const lines = [
      '2026/02/23 18:00:00 12345 abc123 [INFO Client 1234] #SomePlayer: WTS cheap items',
    ];

    const result = parseClientLog(lines);

    expect(result.playerEvents).toHaveLength(1);
    expect(result.playerEvents[0]).toMatchObject({
      category: 'trade_chat',
      rawMessage: '#SomePlayer: WTS cheap items',
    });
  });

  it('categorizes whisper events (at prefix)', () => {
    const lines = ['2026/02/23 18:00:00 12345 abc123 [INFO Client 1234] @FromPlayer: hello'];

    const result = parseClientLog(lines);

    expect(result.playerEvents).toHaveLength(1);
    expect(result.playerEvents[0]).toMatchObject({
      category: 'whisper',
      rawMessage: '@FromPlayer: hello',
    });
  });

  it('tracks session boundaries from LOG FILE OPENING', () => {
    const lines = [
      '2026/02/23 17:00:00 ***** LOG FILE OPENING *****',
      '2026/02/23 17:30:00 12345 abc123 [INFO Client 1234] : Some event',
      '2026/02/23 18:00:00 ***** LOG FILE OPENING *****',
      '2026/02/23 18:30:00 12346 abc124 [INFO Client 1235] : Another event',
    ];

    const result = parseClientLog(lines);

    expect(result.sessions).toHaveLength(2);
    expect(result.sessions[0]?.startTime.getHours()).toBe(17);
    expect(result.sessions[0]?.endTime?.getHours()).toBe(17);
    expect(result.sessions[1]?.startTime.getHours()).toBe(18);
    expect(result.sessions[1]?.endTime?.getHours()).toBe(18);
  });

  it('returns correct summary counts', () => {
    const lines = [
      '2026/02/23 17:00:00 ***** LOG FILE OPENING *****',
      '2026/02/23 18:00:00 12345 abc123 [DEBUG Client 1234] Generating level 10 area "G1_1" with seed 1',
      '2026/02/23 18:01:00 12346 abc124 [DEBUG Client 1234] Generating level 11 area "G1_2" with seed 2',
      '2026/02/23 18:02:00 12347 abc125 [INFO Client 1234] : Death event',
      '2026/02/23 18:03:00 12348 abc126 [INFO Client 1234] : Level up event',
    ];

    const result = parseClientLog(lines);

    expect(result.summary).toEqual({
      totalPlayerEvents: 2,
      totalZoneVisits: 2,
      totalSessions: 1,
    });
  });

  it('handles empty input', () => {
    const result = parseClientLog([]);

    expect(result.sessions).toHaveLength(0);
    expect(result.zoneVisits).toHaveLength(0);
    expect(result.playerEvents).toHaveLength(0);
    expect(result.lastZone).toBeNull();
  });

  it('skips malformed lines', () => {
    const lines = [
      'Not a valid log line',
      '',
      '   ',
      '2026/02/23 18:00:00 12345 abc123 [INFO Client 1234] : Valid event',
    ];

    const result = parseClientLog(lines);

    expect(result.playerEvents).toHaveLength(1);
    expect(result.playerEvents[0]?.rawMessage).toBe('Valid event');
  });
});
