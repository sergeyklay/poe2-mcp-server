import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchJson,
  getNinjaExchangeOverview,
  getNinjaBuildIndex,
  getPoe2dbPage,
  normalizeTrailingArabicToRoman,
  searchWiki,
  getWikiPage,
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

  it('fetches Russian page when lang=ru', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html>контент</html>'),
      }),
    );

    await getPoe2dbPage('Chaos_Bolt', 'ru');

    expect(fetch).toHaveBeenCalledWith('https://poe2db.tw/ru/Chaos_Bolt', expect.any(Object));
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
