import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./http.js', () => {
  class MockRateLimiter {
    async wait(): Promise<void> {}
  }
  return {
    USER_AGENT: 'test-agent',
    RateLimiter: MockRateLimiter,
    fetchJson: vi.fn(),
  };
});

import { fetchJson } from './http.js';
import {
  lookupBaseItem,
  lookupBaseItemByClass,
  matchSingleModTier,
  matchAllModTiers,
  resetRepoeCache,
} from './repoe.js';

beforeEach(() => {
  vi.restoreAllMocks();
  resetRepoeCache();
});

function mockModsJson(mods: Record<string, Record<string, unknown>>) {
  vi.mocked(fetchJson).mockImplementation(async (url: string) => {
    if (url.includes('mods.json')) return mods;
    if (url.includes('base_items.json')) return {};
    return {};
  });
}

function mockBaseItemsJson(items: Record<string, Record<string, unknown>>) {
  vi.mocked(fetchJson).mockImplementation(async (url: string) => {
    if (url.includes('base_items.json')) return items;
    if (url.includes('mods.json')) return {};
    return {};
  });
}

const SPELL_DAMAGE_MODS = {
  SpellDamageOnWeapon7: {
    domain: 'item',
    generation_type: 'prefix',
    groups: ['WeaponCasterDamagePrefix'],
    name: 'Glyphic',
    required_level: 70,
    spawn_weights: [
      { tag: 'wand', weight: 1 },
      { tag: 'focus', weight: 1 },
      { tag: 'default', weight: 0 },
    ],
    stats: [{ id: 'spell_damage_+%', min: 90, max: 104 }],
    text: '(90-104)% increased [Spell] Damage',
    type: 'WeaponSpellDamage',
    is_essence_only: false,
    adds_tags: [],
    generation_weights: [],
    grants_effects: [],
    implicit_tags: [],
    gold_value: null,
  },
  SpellDamageOnWeapon8_: {
    domain: 'item',
    generation_type: 'prefix',
    groups: ['WeaponCasterDamagePrefix'],
    name: 'Runic',
    required_level: 80,
    spawn_weights: [
      { tag: 'wand', weight: 1 },
      { tag: 'focus', weight: 1 },
      { tag: 'default', weight: 0 },
    ],
    stats: [{ id: 'spell_damage_+%', min: 105, max: 119 }],
    text: '(105-119)% increased [Spell] Damage',
    type: 'WeaponSpellDamage',
    is_essence_only: false,
    adds_tags: [],
    generation_weights: [],
    grants_effects: [],
    implicit_tags: [],
    gold_value: null,
  },
};

const INTELLIGENCE_MODS = {
  Intelligence3: {
    domain: 'item',
    generation_type: 'suffix',
    groups: ['Intelligence'],
    name: 'of the Prodigy',
    required_level: 22,
    spawn_weights: [
      { tag: 'helmet', weight: 1 },
      { tag: 'int_armour', weight: 1 },
      { tag: 'wand', weight: 1 },
      { tag: 'default', weight: 0 },
    ],
    stats: [{ id: 'additional_intelligence', min: 13, max: 16 }],
    text: '+(13-16) to [Intelligence|Intelligence]',
    type: 'Intelligence',
    is_essence_only: false,
    adds_tags: [],
    generation_weights: [],
    grants_effects: [],
    implicit_tags: [],
    gold_value: null,
  },
  Intelligence4: {
    domain: 'item',
    generation_type: 'suffix',
    groups: ['Intelligence'],
    name: 'of the Augur',
    required_level: 36,
    spawn_weights: [
      { tag: 'helmet', weight: 1 },
      { tag: 'int_armour', weight: 1 },
      { tag: 'wand', weight: 1 },
      { tag: 'default', weight: 0 },
    ],
    stats: [{ id: 'additional_intelligence', min: 17, max: 21 }],
    text: '+(17-21) to [Intelligence|Intelligence]',
    type: 'Intelligence',
    is_essence_only: false,
    adds_tags: [],
    generation_weights: [],
    grants_effects: [],
    implicit_tags: [],
    gold_value: null,
  },
};

const WAND_BASE_ITEM = {
  'Metadata/Items/Weapons/Wands/Wand4': {
    domain: 'item',
    drop_level: 1,
    item_class: 'Wand',
    name: 'Withered Wand',
    tags: ['wand', 'onehand', 'default'],
    properties: {
      armour: null,
      energy_shield: null,
      evasion: null,
      block: null,
      attack_time: null,
      critical_strike_chance: 700,
      physical_damage_min: 5,
      physical_damage_max: 14,
      range: null,
      movement_speed: null,
    },
    requirements: { dexterity: 0, intelligence: 0, level: 1, strength: 0 },
    release_state: 'released',
  },
};

const HELMET_BASE_ITEM = {
  'Metadata/Items/Armours/Helmets/Helmet6': {
    domain: 'item',
    drop_level: 40,
    item_class: 'Helmet',
    name: 'Gold Circlet',
    tags: ['int_armour', 'helmet', 'armour', 'default'],
    properties: {
      armour: null,
      energy_shield: { min: 58, max: 58 },
      evasion: null,
      block: null,
      attack_time: null,
      critical_strike_chance: null,
      physical_damage_min: null,
      physical_damage_max: null,
      range: null,
      movement_speed: null,
    },
    requirements: { dexterity: 0, intelligence: 58, level: 40, strength: 0 },
    release_state: 'released',
  },
};

describe('lookupBaseItem', () => {
  it('finds base item by name (case-insensitive)', async () => {
    mockBaseItemsJson(HELMET_BASE_ITEM);

    const result = await lookupBaseItem('Gold Circlet');

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Gold Circlet');
    expect(result!.itemClass).toBe('Helmet');
    expect(result!.baseEs).toBe(58);
    expect(result!.tags).toContain('helmet');
  });

  it('returns weapon stats correctly', async () => {
    mockBaseItemsJson(WAND_BASE_ITEM);

    const result = await lookupBaseItem('Withered Wand');

    expect(result).not.toBeNull();
    expect(result!.baseCritChance).toBe(7);
    expect(result!.basePhysDamageMin).toBe(5);
    expect(result!.basePhysDamageMax).toBe(14);
  });

  it('returns null for unknown base item', async () => {
    mockBaseItemsJson({});

    const result = await lookupBaseItem('Nonexistent Item');

    expect(result).toBeNull();
  });

  it('returns null on fetch error', async () => {
    vi.mocked(fetchJson).mockRejectedValue(new Error('Network error'));

    const result = await lookupBaseItem('Gold Circlet');

    expect(result).toBeNull();
  });

  it('caches base items after first fetch', async () => {
    mockBaseItemsJson(HELMET_BASE_ITEM);

    await lookupBaseItem('Gold Circlet');
    const callsAfterFirst = vi.mocked(fetchJson).mock.calls.length;

    await lookupBaseItem('Gold Circlet');
    const callsAfterSecond = vi.mocked(fetchJson).mock.calls.length;

    expect(callsAfterSecond).toBe(callsAfterFirst);
  });

  it('strips Magic affix names to find base item', async () => {
    mockBaseItemsJson(HELMET_BASE_ITEM);

    const result = await lookupBaseItem('Gold Circlet of the Polar Bear');

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Gold Circlet');
    expect(result!.baseEs).toBe(58);
  });

  it('strips prefix names from Magic items', async () => {
    mockBaseItemsJson(WAND_BASE_ITEM);

    const result = await lookupBaseItem("Runic Withered Wand");

    expect(result).toBeNull();
  });

  it('handles two-word base names with suffix', async () => {
    mockBaseItemsJson(HELMET_BASE_ITEM);

    const result = await lookupBaseItem('Gold Circlet of Skill');

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Gold Circlet');
  });
});

describe('lookupBaseItemByClass', () => {
  it('finds base item by class and closest required level', async () => {
    mockBaseItemsJson({
      ...HELMET_BASE_ITEM,
      'Metadata/Items/Armours/Helmets/Helmet1': {
        domain: 'item',
        drop_level: 1,
        item_class: 'Helmet',
        name: 'Leather Hood',
        tags: ['int_armour', 'helmet', 'armour', 'default'],
        properties: {
          armour: null, energy_shield: { min: 10, max: 10 }, evasion: null,
          block: null, attack_time: null, critical_strike_chance: null,
          physical_damage_min: null, physical_damage_max: null, range: null,
          movement_speed: null,
        },
        requirements: { dexterity: 0, intelligence: 10, level: 1, strength: 0 },
        release_state: 'released',
      },
    });

    const result = await lookupBaseItemByClass('Helmet', 35);

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Gold Circlet');
  });

  it('returns null for unknown item class', async () => {
    mockBaseItemsJson(HELMET_BASE_ITEM);

    const result = await lookupBaseItemByClass('Unknown Class', 35);

    expect(result).toBeNull();
  });

  it('returns first candidate when reqLevel is null', async () => {
    mockBaseItemsJson(HELMET_BASE_ITEM);

    const result = await lookupBaseItemByClass('Helmet', null);

    expect(result).not.toBeNull();
  });
});

describe('matchSingleModTier', () => {
  it('matches spell damage mod to correct tier', async () => {
    mockModsJson({ ...SPELL_DAMAGE_MODS });

    const result = await matchSingleModTier(
      '116% increased Spell Damage',
      ['wand', 'onehand', 'default'],
      48,
    );

    expect(result).not.toBeNull();
    expect(result!.tier).toBe(1);
    expect(result!.totalTiers).toBe(2);
    expect(result!.range).toEqual([105, 119]);
    expect(result!.prefixSuffix).toBe('prefix');
    expect(result!.affixName).toBe('Runic');
  });

  it('matches intelligence mod as suffix', async () => {
    mockModsJson({ ...INTELLIGENCE_MODS });

    const result = await matchSingleModTier(
      '+15 to Intelligence',
      ['wand', 'onehand', 'default'],
      48,
    );

    expect(result).not.toBeNull();
    expect(result!.prefixSuffix).toBe('suffix');
    expect(result!.range).toEqual([13, 16]);
  });

  it('returns null when mod does not match item tags', async () => {
    mockModsJson({ ...SPELL_DAMAGE_MODS });

    const result = await matchSingleModTier(
      '116% increased Spell Damage',
      ['ring', 'default'],
      48,
    );

    expect(result).toBeNull();
  });

  it('returns null when value is outside all tier ranges', async () => {
    mockModsJson({ ...SPELL_DAMAGE_MODS });

    const result = await matchSingleModTier(
      '200% increased Spell Damage',
      ['wand', 'onehand', 'default'],
      80,
    );

    expect(result).toBeNull();
  });

  it('returns null when mod text has no numeric value', async () => {
    mockModsJson({ ...SPELL_DAMAGE_MODS });

    const result = await matchSingleModTier(
      'increased Spell Damage',
      ['wand', 'default'],
      48,
    );

    expect(result).toBeNull();
  });

  it('calculates best tier at item level', async () => {
    mockModsJson({ ...SPELL_DAMAGE_MODS });

    const result = await matchSingleModTier(
      '116% increased Spell Damage',
      ['wand', 'onehand', 'default'],
      75,
    );

    expect(result).not.toBeNull();
    expect(result!.bestTierAtIlvl).toBe(2);
  });

  it('returns null on fetch error', async () => {
    vi.mocked(fetchJson).mockRejectedValue(new Error('Network error'));

    const result = await matchSingleModTier(
      '116% increased Spell Damage',
      ['wand', 'default'],
      48,
    );

    expect(result).toBeNull();
  });
});

describe('matchAllModTiers', () => {
  it('matches multiple mods and returns results for each', async () => {
    mockModsJson({ ...SPELL_DAMAGE_MODS, ...INTELLIGENCE_MODS });

    const results = await matchAllModTiers(
      ['116% increased Spell Damage', '+15 to Intelligence'],
      ['wand', 'onehand', 'default'],
      48,
    );

    expect(results).toHaveLength(2);
    expect(results[0]!.prefixSuffix).toBe('prefix');
    expect(results[1]!.prefixSuffix).toBe('suffix');
  });

  it('skips mods that do not match', async () => {
    mockModsJson({ ...SPELL_DAMAGE_MODS });

    const results = await matchAllModTiers(
      ['116% increased Spell Damage', 'some random unmatched mod'],
      ['wand', 'onehand', 'default'],
      48,
    );

    expect(results).toHaveLength(1);
  });

  it('returns empty array when nothing matches', async () => {
    mockModsJson({});

    const results = await matchAllModTiers(
      ['116% increased Spell Damage'],
      ['wand', 'default'],
      48,
    );

    expect(results).toHaveLength(0);
  });
});
