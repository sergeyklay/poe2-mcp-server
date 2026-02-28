import { describe, it, expect } from 'vitest';
import {
  detectLanguage,
  CLIENT_STRINGS,
  type SupportedLanguage,
  type ClientStrings,
} from './strings.js';

describe('detectLanguage', () => {
  describe.each<{ code: SupportedLanguage; sampleText: string }>([
    {
      code: 'en',
      sampleText: `Item Class: Wands
Rarity: Rare
Plague Curse
Withered Wand`,
    },
    {
      code: 'ru',
      sampleText: `Класс предмета: Жезлы
Редкость: Редкий
Чумное проклятие
Увядший жезл`,
    },
    {
      code: 'ko',
      sampleText: `아이템 종류: 마법봉
아이템 희귀도: 희귀
역병의 저주
시든 지팡이`,
    },
    {
      code: 'zh-TW',
      sampleText: `物品種類: 法杖
稀有度: 稀有
瘟疫詛咒
枯萎法杖`,
    },
    {
      code: 'zh-CN',
      sampleText: `物品类别: 法杖
稀有度: 稀有
瘟疫诅咒
枯萎法杖`,
    },
    {
      code: 'de',
      sampleText: `Gegenstandsklasse: Zauberstäbe
Seltenheit: Selten
Seuchenfluch
Verdorrter Zauberstab`,
    },
    {
      code: 'fr',
      sampleText: `Classe d'objet: Baguettes
Rareté: Rare
Malédiction de la peste
Baguette flétrie`,
    },
    {
      code: 'ja',
      sampleText: `アイテムクラス: ワンド
レアリティ: レア
疫病の呪い
枯れたワンド`,
    },
    {
      code: 'es',
      sampleText: `Clase de objeto: Varitas
Rareza: Raro
Maldición de plaga
Varita marchita`,
    },
    {
      code: 'pt',
      sampleText: `Classe do Item: Varinhas
Raridade: Raro
Maldição da Praga
Varinha Murcha`,
    },
    {
      code: 'th',
      sampleText: `ประเภทไอเท็ม: คทา
ความหายาก: แรร์
คำสาปโรคระบาด
คทาเหี่ยวแห้ง`,
    },
  ])('language: $code', ({ code, sampleText }) => {
    it('correctly detects language from item text', () => {
      const result = detectLanguage(sampleText);

      expect(result.code).toBe(code);
      expect(result.strings).toBe(CLIENT_STRINGS[code]);
    });
  });

  it('defaults to English when no language patterns match', () => {
    const unknownText = 'some random text without keywords';

    const result = detectLanguage(unknownText);

    expect(result.code).toBe('en');
    expect(result.strings).toBe(CLIENT_STRINGS.en);
  });
});

describe('CLIENT_STRINGS', () => {
  const ALL_LANGUAGES: SupportedLanguage[] = [
    'en',
    'ru',
    'ko',
    'zh-TW',
    'zh-CN',
    'de',
    'fr',
    'ja',
    'es',
    'pt',
    'th',
  ];

  const REQUIRED_KEYS: (keyof ClientStrings)[] = [
    'RARITY',
    'ITEM_CLASS',
    'ITEM_LEVEL',
    'QUALITY',
    'SOCKETS',
    'CORRUPTED',
    'UNIDENTIFIED',
    'MIRRORED',
    'PHYSICAL_DAMAGE',
    'ELEMENTAL_DAMAGE',
    'ENERGY_SHIELD',
    'ARMOUR',
    'EVASION',
    'CRIT_CHANCE',
    'ATTACK_SPEED',
    'REQUIRES',
    'STACK_SIZE',
    'RARITY_NORMAL',
    'RARITY_MAGIC',
    'RARITY_RARE',
    'RARITY_UNIQUE',
    'RARITY_CURRENCY',
    'RARITY_GEM',
  ];

  it.each(ALL_LANGUAGES)('language "%s" has all required keys', (code) => {
    const strings = CLIENT_STRINGS[code];

    for (const key of REQUIRED_KEYS) {
      expect(strings[key]).toBeDefined();
      expect(typeof strings[key]).toBe('string');
      expect(strings[key].length).toBeGreaterThan(0);
    }
  });

  it('contains exactly 11 supported languages', () => {
    expect(Object.keys(CLIENT_STRINGS)).toHaveLength(11);
    expect(Object.keys(CLIENT_STRINGS).sort()).toEqual(ALL_LANGUAGES.sort());
  });
});
