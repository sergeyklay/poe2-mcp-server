import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deflateSync } from 'zlib';
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
  decodePobCode,
  extractPobbinId,
  fetchPobbinCode,
  parseItemText,
  parsePobXml,
  comparePobBuilds,
  parsePoe2dbHtml,
  formatPoe2dbSections,
  type PobBuild,
  type PobItem,
  type Poe2dbParsedPage,
  type Poe2dbSectionFilter,
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

// ─── PoB2 Service Functions Tests ─────────────────────────────────────

describe('decodePobCode', () => {
  it('decodes valid URL-safe base64 zlib-compressed XML', () => {
    const xml = '<Build className="Witch" level="1"></Build>';
    const compressed = deflateSync(Buffer.from(xml, 'utf-8'));
    const base64 = compressed.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

    const result = decodePobCode(base64);

    expect(result).toBe(xml);
  });

  it('handles codes with leading/trailing whitespace', () => {
    const xml = '<Build />';
    const compressed = deflateSync(Buffer.from(xml, 'utf-8'));
    const base64 = compressed.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

    const result = decodePobCode(`  ${base64}  \n`);

    expect(result).toBe(xml);
  });

  it('throws on empty string', () => {
    expect(() => decodePobCode('')).toThrow('empty after base64 decode');
  });

  it('throws on invalid zlib data', () => {
    const invalidData = Buffer.from('not-zlib-data').toString('base64');

    expect(() => decodePobCode(invalidData)).toThrow('decompression failed');
  });
});

describe('extractPobbinId', () => {
  it.each([
    { input: 'https://pobb.in/abc123', expected: 'abc123' },
    { input: 'http://pobb.in/abc123', expected: 'abc123' },
    { input: 'pobb.in/abc123', expected: 'abc123' },
    { input: 'POBB.IN/abc123', expected: 'abc123' },
    { input: 'https://pobb.in/u/username/abc123', expected: 'u/username/abc123' },
  ])('extracts "$expected" from "$input"', ({ input, expected }) => {
    expect(extractPobbinId(input)).toBe(expected);
  });

  it('strips trailing /raw from paste ID', () => {
    expect(extractPobbinId('https://pobb.in/abc123/raw')).toBe('abc123');
  });

  it('handles whitespace around URL', () => {
    expect(extractPobbinId('  pobb.in/test123  ')).toBe('test123');
  });

  it.each([
    { input: 'eNrtVV1v2jAU...', reason: 'PoB code' },
    { input: 'https://pastebin.com/abc', reason: 'different domain' },
    { input: 'not a url', reason: 'plain text' },
    { input: '', reason: 'empty string' },
  ])('returns null for "$input" ($reason)', ({ input }) => {
    expect(extractPobbinId(input)).toBeNull();
  });
});

describe('fetchPobbinCode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches raw paste content with encoded ID', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('eNrtVV1v...'),
      }),
    );

    const result = await fetchPobbinCode('abc123');

    expect(fetch).toHaveBeenCalledWith('https://pobb.in/abc123/raw', expect.any(Object));
    expect(result).toBe('eNrtVV1v...');
  });

  it('throws specific error on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(fetchPobbinCode('invalid')).rejects.toThrow('paste not found');
  });

  it('throws rate limit error on 429', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));

    await expect(fetchPobbinCode('test')).rejects.toThrow('rate limit exceeded');
  });

  it('throws generic error on other HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchPobbinCode('test')).rejects.toThrow('HTTP 500');
  });
});

describe('parseItemText', () => {
  it('parses rare item with name and base', () => {
    const itemText = `Rarity: Rare
Doom Veil
Carved Visage
Item Level: 75
Armour: 150
Implicits: 0
+50 to Maximum Life`;

    const result = parseItemText(itemText, 'Helmet');

    expect(result).toMatchObject({
      slot: 'Helmet',
      rarity: 'Rare',
      name: 'Doom Veil',
      base: 'Carved Visage',
      itemLevel: 75,
      armour: 150,
    });
    expect(result?.explicits).toContain('+50 to Maximum Life');
  });

  it('parses unique item', () => {
    const itemText = `Rarity: Unique
Goldrim
Carved Visage
Item Level: 1
Evasion: 100
Energy Shield: 50
Implicits: 1
+1 to Level of Socketed Gems
+35 to All Attributes`;

    const result = parseItemText(itemText, 'Helmet');

    expect(result).toMatchObject({
      rarity: 'Unique',
      name: 'Goldrim',
      base: 'Carved Visage',
      evasion: 100,
      energyShield: 50,
    });
    expect(result?.implicits).toContain('+1 to Level of Socketed Gems');
    expect(result?.explicits).toContain('+35 to All Attributes');
  });

  it('parses magic item without separate name', () => {
    const itemText = `Rarity: Magic
Sturdy Iron Ring of Life
Item Level: 10
Implicits: 0
+10 to Maximum Life`;

    const result = parseItemText(itemText, 'Ring 1');

    expect(result).toMatchObject({
      rarity: 'Magic',
      name: null,
      base: 'Sturdy Iron Ring of Life',
    });
  });

  it('parses corrupted flag', () => {
    const itemText = `Rarity: Rare
Test Item
Base Item
Item Level: 80
Implicits: 0
+10 to Strength
Corrupted`;

    const result = parseItemText(itemText, 'Amulet');

    expect(result?.corrupted).toBe(true);
  });

  it('parses quality', () => {
    const itemText = `Rarity: Rare
Test Chest
Vaal Regalia
Quality: +20%
Item Level: 84
Energy Shield: 500
Implicits: 0
+100 to Maximum Life`;

    const result = parseItemText(itemText, 'Body Armour');

    expect(result?.quality).toBe(20);
  });

  it('returns null for insufficient lines', () => {
    expect(parseItemText('Rarity: Rare', 'Helmet')).toBeNull();
    expect(parseItemText('', 'Helmet')).toBeNull();
  });

  it('returns null for missing rarity header', () => {
    const itemText = `Name Only
Base Item Only`;

    expect(parseItemText(itemText, 'Helmet')).toBeNull();
  });
});

describe('parsePobXml', () => {
  const minimalXml = `
<PathOfBuilding>
  <Build className="Witch" ascendClassName="Necromancer" level="95" bandit="None">
  </Build>
  <Items></Items>
  <Skills></Skills>
  <Tree activeSpec="1">
    <Spec treeVersion="0.4">
      <URL></URL>
    </Spec>
  </Tree>
  <Config></Config>
  <Notes>Test notes</Notes>
</PathOfBuilding>`;

  it('extracts build metadata', () => {
    const result = parsePobXml(minimalXml, 'code');

    expect(result.metadata).toMatchObject({
      className: 'Witch',
      ascendancy: 'Necromancer',
      level: 95,
      bandit: 'None',
    });
    expect(result.xmlSource).toBe('code');
  });

  it('extracts notes', () => {
    const result = parsePobXml(minimalXml, 'file');

    expect(result.notes).toBe('Test notes');
    expect(result.xmlSource).toBe('file');
  });

  it('parses items from Items block', () => {
    const xml = `
<PathOfBuilding>
  <Build className="Witch" level="1"></Build>
  <Items>
    <Slot name="Helmet" itemId="1"/>
    <Item id="1">
Rarity: Rare
Test Helm
Iron Hat
Item Level: 50
Armour: 100
Implicits: 0
+30 to Maximum Life
    </Item>
  </Items>
  <Skills></Skills>
  <Tree activeSpec="1"><Spec treeVersion="0.4"><URL></URL></Spec></Tree>
  <Config></Config>
  <Notes></Notes>
</PathOfBuilding>`;

    const result = parsePobXml(xml, 'code');

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      slot: 'Helmet',
      rarity: 'Rare',
      name: 'Test Helm',
      base: 'Iron Hat',
      armour: 100,
    });
  });

  it('parses skills and gems', () => {
    const xml = `
<PathOfBuilding>
  <Build className="Witch" level="1"></Build>
  <Items></Items>
  <Skills>
    <Skill enabled="true" label="Main Setup">
      <Gem nameSpec="Fireball" level="20" quality="20" enabled="true"/>
      <Gem nameSpec="Greater Multiple Projectiles Support" level="20" quality="0" enabled="true"/>
    </Skill>
  </Skills>
  <Tree activeSpec="1"><Spec treeVersion="0.4"><URL></URL></Spec></Tree>
  <Config></Config>
  <Notes></Notes>
</PathOfBuilding>`;

    const result = parsePobXml(xml, 'code');

    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]?.label).toBe('Main Setup');
    expect(result.skills[0]?.gems).toHaveLength(2);
    expect(result.skills[0]?.activeGem?.name).toBe('Fireball');
    expect(result.skills[0]?.supportGems).toHaveLength(1);
    expect(result.skills[0]?.supportGems[0]?.name).toBe('Greater Multiple Projectiles Support');
  });

  it('parses config values', () => {
    const xml = `
<PathOfBuilding>
  <Build className="Witch" level="1"></Build>
  <Items></Items>
  <Skills></Skills>
  <Tree activeSpec="1"><Spec treeVersion="0.4"><URL></URL></Spec></Tree>
  <Config>
    <Input name="enemyIsBoss" boolean="true"/>
    <Input name="enemyLevel" number="83"/>
    <Input name="customMod" string="test value"/>
  </Config>
  <Notes></Notes>
</PathOfBuilding>`;

    const result = parsePobXml(xml, 'code');

    expect(result.config).toEqual({
      enemyIsBoss: true,
      enemyLevel: 83,
      customMod: 'test value',
    });
  });

  it('handles missing optional sections gracefully', () => {
    const xml = '<PathOfBuilding><Build className="Ranger" level="1"></Build></PathOfBuilding>';

    const result = parsePobXml(xml, 'code');

    expect(result.metadata.className).toBe('Ranger');
    expect(result.items).toEqual([]);
    expect(result.skills).toEqual([]);
    expect(result.notes).toBe('');
  });
});

describe('comparePobBuilds', () => {
  const createMockBuild = (overrides: Partial<PobBuild> = {}): PobBuild => ({
    metadata: {
      className: 'Witch',
      ascendancy: 'Necromancer',
      level: 90,
      bandit: null,
      pantheonMajor: null,
      pantheonMinor: null,
      mainSocketGroup: null,
    },
    items: [],
    skills: [],
    tree: { version: '0.4', activeSpec: 1, allocatedNodes: [], masteryEffects: [] },
    resolvedTree: null,
    config: {},
    notes: '',
    xmlSource: 'code',
    ...overrides,
  });

  const createMockItem = (overrides: Partial<PobItem> = {}): PobItem => ({
    slot: 'Helmet',
    rarity: 'Rare',
    name: 'Test Item',
    base: 'Iron Hat',
    itemLevel: 80,
    levelRequirement: 60,
    quality: 0,
    armour: 0,
    evasion: 0,
    energyShield: 0,
    sockets: null,
    implicits: [],
    explicits: [],
    corrupted: false,
    ...overrides,
  });

  it('identifies matching items by slot, base, and rarity', () => {
    const helmet = createMockItem({ slot: 'Helmet', base: 'Iron Hat', rarity: 'Rare' });
    const current = createMockBuild({ items: [helmet] });
    const reference = createMockBuild({ items: [{ ...helmet }] });

    const result = comparePobBuilds(current, reference);

    expect(result.items.matching).toContain('Helmet');
    expect(result.items.upgradesNeeded).toHaveLength(0);
    expect(result.items.missingInCurrent).toHaveLength(0);
  });

  it('identifies missing items in current build', () => {
    const refHelmet = createMockItem({ slot: 'Helmet' });
    const current = createMockBuild({ items: [] });
    const reference = createMockBuild({ items: [refHelmet] });

    const result = comparePobBuilds(current, reference);

    expect(result.items.missingInCurrent).toContain('Helmet');
  });

  it('identifies upgrades needed with delta stats', () => {
    const curHelmet = createMockItem({ slot: 'Helmet', base: 'Iron Hat', armour: 100 });
    const refHelmet = createMockItem({ slot: 'Helmet', base: 'Steel Helm', armour: 200 });
    const current = createMockBuild({ items: [curHelmet] });
    const reference = createMockBuild({ items: [refHelmet] });

    const result = comparePobBuilds(current, reference);

    expect(result.items.upgradesNeeded).toHaveLength(1);
    expect(result.items.upgradesNeeded[0]?.slot).toBe('Helmet');
    expect(result.items.upgradesNeeded[0]?.delta).toContain('+100 Armour');
  });

  it('compares passive tree nodes', () => {
    const current = createMockBuild({
      tree: { version: '0.4', activeSpec: 1, allocatedNodes: [1, 2, 3], masteryEffects: [] },
    });
    const reference = createMockBuild({
      tree: { version: '0.4', activeSpec: 1, allocatedNodes: [2, 3, 4, 5], masteryEffects: [] },
    });

    const result = comparePobBuilds(current, reference);

    expect(result.tree.missingNodes).toEqual(['4', '5']);
    expect(result.tree.extraNodes).toEqual(['1']);
  });

  it('compares skill gems', () => {
    const current = createMockBuild({
      skills: [
        {
          label: 'Main',
          slot: null,
          enabled: true,
          gems: [
            {
              name: 'Fireball',
              nameSpec: 'Fireball',
              level: 20,
              quality: 0,
              enabled: true,
              isSupport: false,
            },
          ],
          activeGem: {
            name: 'Fireball',
            nameSpec: 'Fireball',
            level: 20,
            quality: 0,
            enabled: true,
            isSupport: false,
          },
          supportGems: [],
        },
      ],
    });
    const reference = createMockBuild({
      skills: [
        {
          label: 'Main',
          slot: null,
          enabled: true,
          gems: [
            {
              name: 'Fireball',
              nameSpec: 'Fireball',
              level: 20,
              quality: 0,
              enabled: true,
              isSupport: false,
            },
            {
              name: 'GMP Support',
              nameSpec: 'GMP Support',
              level: 20,
              quality: 0,
              enabled: true,
              isSupport: true,
            },
          ],
          activeGem: {
            name: 'Fireball',
            nameSpec: 'Fireball',
            level: 20,
            quality: 0,
            enabled: true,
            isSupport: false,
          },
          supportGems: [
            {
              name: 'GMP Support',
              nameSpec: 'GMP Support',
              level: 20,
              quality: 0,
              enabled: true,
              isSupport: true,
            },
          ],
        },
      ],
    });

    const result = comparePobBuilds(current, reference);

    expect(result.skills.missingGems).toContain('GMP Support');
  });

  it('generates summary with all differences', () => {
    const curItem = createMockItem({ slot: 'Helmet', base: 'Iron Hat' });
    const refItem = createMockItem({ slot: 'Helmet', base: 'Steel Helm' });
    const current = createMockBuild({
      items: [curItem],
      tree: { version: '0.4', activeSpec: 1, allocatedNodes: [1], masteryEffects: [] },
    });
    const reference = createMockBuild({
      items: [refItem],
      tree: { version: '0.4', activeSpec: 1, allocatedNodes: [1, 2], masteryEffects: [] },
    });

    const result = comparePobBuilds(current, reference);

    expect(result.summary).toContain('item upgrade');
    expect(result.summary).toContain('passive node');
  });

  it('returns matching summary when builds are identical', () => {
    const item = createMockItem({ slot: 'Helmet' });
    const build = createMockBuild({
      items: [item],
      tree: { version: '0.4', activeSpec: 1, allocatedNodes: [1, 2, 3], masteryEffects: [] },
    });

    const result = comparePobBuilds(build, build);

    expect(result.summary).toContain('match closely');
  });
});

describe('parsePoe2dbHtml', () => {
  it('extracts title from og:title meta tag', () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Essence Drain">
          <title>Essence Drain - poe2db</title>
        </head>
        <body><h1>Different Title</h1></body>
      </html>
    `;

    const result = parsePoe2dbHtml(html);

    expect(result.title).toBe('Essence Drain');
  });

  it('falls back to h1 then page title when og:title missing', () => {
    const htmlWithH1 = `<html><head><title>Page - poe2db</title></head><body><h1>H1 Title</h1></body></html>`;

    const result = parsePoe2dbHtml(htmlWithH1);

    expect(result.title).toBe('H1 Title');
  });

  it('extracts description from og:description meta tag', () => {
    const html = `
      <html>
        <head>
          <meta property="og:description" content="Fires a chaos projectile.">
        </head>
        <body></body>
      </html>
    `;

    const result = parsePoe2dbHtml(html);

    expect(result.description).toBe('Fires a chaos projectile.');
  });

  it('extracts gem stats from gemPopup elements', () => {
    const html = `
      <html><body>
        <div class="gemPopup">
          <span class="property">Level: 1</span>
          <span class="explicitMod">+10 to Intelligence</span>
        </div>
      </body></html>
    `;

    const result = parsePoe2dbHtml(html);

    expect(result.stats).toContain('Level: 1');
    expect(result.stats).toContain('+10 to Intelligence');
  });

  it('parses card-header sections with item counts', () => {
    const html = `
      <html><body>
        <div class="card-header">Level Effect /40</div>
        <div class="card-body">Level 1: +5 damage</div>
        <div class="card-header">From /3</div>
        <div class="card-body">Quest Reward</div>
      </body></html>
    `;

    const result = parsePoe2dbHtml(html);

    expect(result.sections.get('levels')).toBeDefined();
    expect(result.sections.get('levels')?.itemCount).toBe(40);
    expect(result.sections.get('acquisition')).toBeDefined();
    expect(result.sections.get('acquisition')?.content).toBe('Quest Reward');
  });

  it('maps section names to filter keys correctly', () => {
    const html = `
      <html><body>
        <div class="card-header">Recommended Support Gems /10</div>
        <div class="card-body">Swift Affliction</div>
        <div class="card-header">Version history /5</div>
        <div class="card-body">0.4.0: Added</div>
        <div class="card-header">Microtransactions /2</div>
        <div class="card-body">Skin MTX</div>
      </body></html>
    `;

    const result = parsePoe2dbHtml(html);

    expect(result.sections.get('supports')).toBeDefined();
    expect(result.sections.get('history')).toBeDefined();
    expect(result.sections.get('microtransactions')).toBeDefined();
  });

  it('handles pattern-based section mapping (Attr suffix)', () => {
    const html = `
      <html><body>
        <div class="card-header">Essence Drain Attr /4</div>
        <div class="card-body">Chaos, Spell, Projectile</div>
      </body></html>
    `;

    const result = parsePoe2dbHtml(html);

    expect(result.sections.get('stats')).toBeDefined();
    expect(result.sections.get('stats')?.content).toContain('Chaos');
  });

  it('removes script/style/nav elements', () => {
    const html = `
      <html><body>
        <script>alert('xss')</script>
        <style>.foo{}</style>
        <nav>Navigation</nav>
        <div class="card-header">From /1</div>
        <div class="card-body">Quest</div>
      </body></html>
    `;

    const result = parsePoe2dbHtml(html);

    expect(result.sections.get('acquisition')?.content).toBe('Quest');
  });
});

describe('formatPoe2dbSections', () => {
  const createParsedPage = (overrides?: Partial<Poe2dbParsedPage>): Poe2dbParsedPage => ({
    title: 'Test Gem',
    description: 'A test spell.',
    stats: 'Chaos, Spell',
    sections: new Map(),
    ...overrides,
  });

  it('formats default sections (description, stats, supports, acquisition)', () => {
    const sections = new Map([
      [
        'supports',
        {
          id: 'Recommended Support Gems',
          header: 'Recommended Support Gems /10',
          content: 'GMP\nSwift',
          itemCount: 10,
        },
      ],
      ['acquisition', { id: 'From', header: 'From /2', content: 'Quest Reward', itemCount: 2 }],
    ]);
    const page = createParsedPage({ sections });

    const result = formatPoe2dbSections(page, 'Test_Gem', 'us');

    expect(result).toContain('## poe2db: Test Gem (us)');
    expect(result).toContain('A test spell.');
    expect(result).toContain('### Stats');
    expect(result).toContain('Chaos, Spell');
    expect(result).toContain('### Recommended Support Gems');
    expect(result).toContain('### From');
  });

  it('filters to only requested sections', () => {
    const sections = new Map([
      [
        'supports',
        {
          id: 'Recommended Support Gems',
          header: 'Recommended Support Gems /10',
          content: 'GMP',
          itemCount: 10,
        },
      ],
      ['acquisition', { id: 'From', header: 'From /2', content: 'Quest', itemCount: 2 }],
      [
        'history',
        { id: 'Version history', header: 'Version history /5', content: 'Changes', itemCount: 5 },
      ],
    ]);
    const page = createParsedPage({ sections });

    const result = formatPoe2dbSections(page, 'Test_Gem', 'us', ['description', 'history']);

    expect(result).toContain('A test spell.');
    expect(result).toContain('### Version History');
    expect(result).not.toContain('### Stats');
    expect(result).not.toContain('### Recommended Support Gems');
  });

  it('truncates supports section to 5 entries', () => {
    const supportsList =
      'GMP\nSwift Affliction\nControlled Destruction\nVoid Manipulation\nEfficacy\nArcane Surge\nSpell Echo';
    const sections = new Map([
      [
        'supports',
        {
          id: 'Recommended Support Gems',
          header: 'Recommended Support Gems /7',
          content: supportsList,
          itemCount: 7,
        },
      ],
    ]);
    const page = createParsedPage({ sections });

    const result = formatPoe2dbSections(page, 'Test_Gem', 'us', ['supports']);

    expect(result).toContain('... and 2 more');
    expect(result).not.toContain('Spell Echo');
  });

  it('shows warning for large supports_full section', () => {
    const sections = new Map([
      [
        'supports_full',
        {
          id: 'Supported By',
          header: 'Supported By /187',
          content: 'Gem1\nGem2\n...',
          itemCount: 187,
        },
      ],
    ]);
    const page = createParsedPage({ sections });

    const result = formatPoe2dbSections(page, 'Test_Gem', 'us', ['supports_full']);

    expect(result).toContain('⚠️ Large list (187 entries)');
    expect(result).toContain('Showing first 50');
  });

  it('filters levels section by level_range', () => {
    const levelsContent =
      'Level 1: +5 damage\nLevel 2: +10 damage\nLevel 10: +50 damage\nLevel 11: +55 damage\nLevel 12: +60 damage';
    const sections = new Map([
      [
        'levels',
        { id: 'Level Effect', header: 'Level Effect /40', content: levelsContent, itemCount: 40 },
      ],
    ]);
    const page = createParsedPage({ sections });

    const result = formatPoe2dbSections(page, 'Test_Gem', 'us', ['levels'], { min: 10, max: 12 });

    expect(result).toContain('### Levels 10-12');
    expect(result).toContain('Level 10');
    expect(result).toContain('Level 11');
    expect(result).toContain('Level 12');
    expect(result).not.toContain('Level 1:');
    expect(result).not.toContain('Level 2:');
  });

  it('shows single level header when min equals max', () => {
    const levelsContent = 'Level 20: +100 damage';
    const sections = new Map([
      [
        'levels',
        { id: 'Level Effect', header: 'Level Effect /40', content: levelsContent, itemCount: 40 },
      ],
    ]);
    const page = createParsedPage({ sections });

    const result = formatPoe2dbSections(page, 'Test_Gem', 'us', ['levels'], { min: 20, max: 20 });

    expect(result).toContain('### Level 20 Stats');
  });

  it('generates correct URL with encoded term', () => {
    const page = createParsedPage({ title: 'Chaos Bolt' });

    const result = formatPoe2dbSections(page, 'Chaos Bolt', 'us', ['description']);

    expect(result).toContain('https://poe2db.tw/us/Chaos_Bolt');
  });

  it('formats all section types when explicitly requested', () => {
    const sections = new Map([
      [
        'supports',
        {
          id: 'Recommended Support Gems',
          header: 'Recommended Support Gems /5',
          content: 'GMP',
          itemCount: 5,
        },
      ],
      ['acquisition', { id: 'From', header: 'From /2', content: 'Quest', itemCount: 2 }],
      [
        'levels',
        { id: 'Level Effect', header: 'Level Effect /40', content: 'Level 1: data', itemCount: 40 },
      ],
      [
        'history',
        { id: 'Version history', header: 'Version history /3', content: 'Changed', itemCount: 3 },
      ],
      [
        'microtransactions',
        { id: 'Microtransactions', header: 'Microtransactions /1', content: 'Skin', itemCount: 1 },
      ],
      [
        'monsters',
        { id: 'Test Monster', header: 'Test Monster /2', content: 'Boss', itemCount: 2 },
      ],
    ]);
    const page = createParsedPage({ sections });
    const allSections: Poe2dbSectionFilter[] = [
      'description',
      'stats',
      'supports',
      'acquisition',
      'levels',
      'history',
      'microtransactions',
      'monsters',
    ];

    const result = formatPoe2dbSections(page, 'Test_Gem', 'us', allSections);

    expect(result).toContain('### Recommended Support Gems');
    expect(result).toContain('### From');
    expect(result).toContain('### Level 1 Stats');
    expect(result).toContain('### Version History');
    expect(result).toContain('### Microtransactions');
    expect(result).toContain('### Monsters Using This');
  });
});
