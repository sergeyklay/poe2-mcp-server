import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getNinjaExchangeOverview, getNinjaBuildIndex, getNinjaItemOverview } from './ninja.js';

beforeEach(() => {
  vi.restoreAllMocks();
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

describe('getNinjaItemOverview', () => {
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
              primary: 'chaos',
              secondary: 'divine',
            },
            lines: [],
          }),
      }),
    );

    await getNinjaItemOverview('Fate of the Vaal', 'UniqueArmour');

    const url = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(url).toContain('league=Fate%20of%20the%20Vaal');
    expect(url).toContain('type=UniqueArmour');
    expect(url).toContain('/exchange/current/overview');
  });

  it('maps exchange response to item overview format', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            core: {
              items: [
                {
                  id: 'unique-kaoms',
                  name: "Kaom's Heart",
                  image: 'kaom.png',
                  category: 'Body Armour',
                  detailsId: 'kaoms-heart',
                },
                {
                  id: 'unique-tabula',
                  name: 'Tabula Rasa',
                  image: 'tabula.png',
                  category: 'Body Armour',
                  detailsId: 'tabula-rasa',
                },
              ],
              rates: { divine: 150 },
              primary: 'chaos',
              secondary: 'divine',
            },
            lines: [
              {
                id: 'unique-kaoms',
                primaryValue: 3.5,
                volumePrimaryValue: 80,
                maxVolumeCurrency: 'chaos',
                maxVolumeRate: 1,
                sparkline: { totalChange: 0, data: [] },
              },
              {
                id: 'unique-tabula',
                primaryValue: 0.1,
                volumePrimaryValue: 200,
                maxVolumeCurrency: 'chaos',
                maxVolumeRate: 1,
                sparkline: { totalChange: 0, data: [] },
              },
            ],
          }),
      }),
    );

    const result = await getNinjaItemOverview('Standard', 'UniqueArmour');

    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]!.name).toBe("Kaom's Heart");
    expect(result.lines[0]!.chaosValue).toBe(3.5 * 150);
    expect(result.lines[0]!.listingCount).toBe(80);
    expect(result.lines[0]!.icon).toBe('kaom.png');
    expect(result.lines[1]!.name).toBe('Tabula Rasa');
    expect(result.lines[1]!.chaosValue).toBe(0.1 * 150);
    expect(result.lines[1]!.listingCount).toBe(200);
  });

  it('uses item id as fallback name when core item not found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            core: {
              items: [],
              rates: { divine: 100 },
              primary: 'chaos',
              secondary: 'divine',
            },
            lines: [
              {
                id: 'orphaned-item',
                primaryValue: 2,
                volumePrimaryValue: 10,
                maxVolumeCurrency: 'chaos',
                maxVolumeRate: 1,
                sparkline: { totalChange: 0, data: [] },
              },
            ],
          }),
      }),
    );

    const result = await getNinjaItemOverview('Standard', 'UniqueWeapon');

    expect(result.lines[0]!.name).toBe('orphaned-item');
  });

  it('defaults chaosRate to 1 when secondary rate is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            core: {
              items: [{ id: 'item-a', name: 'Item A', image: '', category: '', detailsId: '' }],
              rates: {},
              primary: 'chaos',
              secondary: 'divine',
            },
            lines: [
              {
                id: 'item-a',
                primaryValue: 5,
                volumePrimaryValue: 30,
                maxVolumeCurrency: 'chaos',
                maxVolumeRate: 1,
                sparkline: { totalChange: 0, data: [] },
              },
            ],
          }),
      }),
    );

    const result = await getNinjaItemOverview('Standard', 'UniqueJewel');

    expect(result.lines[0]!.chaosValue).toBe(5);
  });

  it('returns empty lines array when exchange has no lines', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            core: {
              items: [],
              rates: {},
              primary: 'chaos',
              secondary: 'divine',
            },
            lines: [],
          }),
      }),
    );

    const result = await getNinjaItemOverview('Standard', 'UniqueFlask');

    expect(result.lines).toEqual([]);
  });

  it('throws on HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      }),
    );

    await expect(getNinjaItemOverview('Standard', 'UniqueWeapon')).rejects.toThrow('HTTP 404');
  });
});
