import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerItemParserTools } from './item.js';

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
  registerItemParserTools(mockServer);
  return handlers;
}

describe('poe2_parse_item', () => {
  let handler: ToolHandler;

  beforeEach(() => {
    vi.restoreAllMocks();
    handler = extractHandlers().get('poe2_parse_item')!;
  });

  describe('Russian wand example from spec appendix', () => {
    const russianWandText = `Класс предмета: Жезлы
Редкость: Редкий
Чумное проклятие
Увядший жезл
--------
Качество: +20% (augmented)
--------
Требуется: Уровень 41, 55 (augmented) Инт
--------
Гнезда: S
--------
Уровень предмета: 41
--------
25% увеличение урона от чар (rune)
--------
Дарует умение: Снаряд хаоса 11 уровня
91% увеличение урона от чар
+84 к максимуму маны
25% снижение требований к характеристикам
38% повышение шанса критического удара для чар
+16 к интеллекту`;

    it('parses header correctly', async () => {
      const result = await handler({ text: russianWandText });

      expect(result.content[0]!.text).toContain('## Чумное проклятие');
      expect(result.content[0]!.text).toContain('**Rare Жезлы**');
      expect(result.content[0]!.text).toContain('Увядший жезл');
    });

    it('parses quality with augmented marker', async () => {
      const result = await handler({ text: russianWandText });

      expect(result.content[0]!.text).toContain('**Quality:** 20%');
      expect(result.content[0]!.text).toContain('(augmented)');
    });

    it('parses item level', async () => {
      const result = await handler({ text: russianWandText });

      expect(result.content[0]!.text).toContain('**Item Level:** 41');
    });

    it('parses sockets', async () => {
      const result = await handler({ text: russianWandText });

      expect(result.content[0]!.text).toContain('### Sockets');
      expect(result.content[0]!.text).toContain('S');
    });

    it('parses requirements with level', async () => {
      const result = await handler({ text: russianWandText });

      expect(result.content[0]!.text).toContain('### Requirements');
      expect(result.content[0]!.text).toContain('**Level:** 41');
    });

    it('categorizes rune mods separately', async () => {
      const result = await handler({ text: russianWandText });

      expect(result.content[0]!.text).toContain('**Rune:**');
      expect(result.content[0]!.text).toContain('25% увеличение урона от чар');
    });

    it('parses explicit mods', async () => {
      const result = await handler({ text: russianWandText });

      expect(result.content[0]!.text).toContain('**Explicit:**');
      expect(result.content[0]!.text).toContain('91% увеличение урона от чар');
      expect(result.content[0]!.text).toContain('+84 к максимуму маны');
      expect(result.content[0]!.text).toContain('+16 к интеллекту');
    });

    it('extracts granted skills', async () => {
      const result = await handler({ text: russianWandText });

      expect(result.content[0]!.text).toContain('### Granted Skills');
      expect(result.content[0]!.text).toContain('Снаряд хаоса 11 уровня');
    });

    it('detects Russian language', async () => {
      const result = await handler({ text: russianWandText });

      expect(result.content[0]!.text).toContain('*Detected language: ru*');
    });
  });

  describe('currency/stackable items', () => {
    const currencyText = `Item Class: Stackable Currency
Rarity: Currency
Chaos Orb
--------
Stack Size: 7/20
--------
Reforges a rare item with new random modifiers`;

    it('parses currency rarity', async () => {
      const result = await handler({ text: currencyText });

      expect(result.content[0]!.text).toContain('**Currency Stackable Currency**');
    });

    it('parses stack size', async () => {
      const result = await handler({ text: currencyText });

      expect(result.content[0]!.text).toContain('**Stack:** 7/20');
    });

    it('parses currency description as mod', async () => {
      const result = await handler({ text: currencyText });

      expect(result.content[0]!.text).toContain('Reforges a rare item with new random modifiers');
    });
  });

  describe('corrupted unique with implicit mods', () => {
    const corruptedUniqueText = `Item Class: Rings
Rarity: Unique
Doedre's Damning
Paua Ring
--------
Requires Level 45
--------
+12 to maximum Energy Shield (implicit)
--------
+25% to Chaos Resistance
Curse Enemies with Despair on Hit
+30 to maximum Mana
--------
Corrupted`;

    it('parses unique rarity', async () => {
      const result = await handler({ text: corruptedUniqueText });

      expect(result.content[0]!.text).toContain('**Unique Rings**');
      expect(result.content[0]!.text).toContain("Doedre's Damning");
    });

    it('categorizes implicit mods separately', async () => {
      const result = await handler({ text: corruptedUniqueText });

      expect(result.content[0]!.text).toContain('**Implicit:**');
      expect(result.content[0]!.text).toContain('+12 to maximum Energy Shield');
    });

    it('parses explicit mods', async () => {
      const result = await handler({ text: corruptedUniqueText });

      expect(result.content[0]!.text).toContain('**Explicit:**');
      expect(result.content[0]!.text).toContain('+25% to Chaos Resistance');
      expect(result.content[0]!.text).toContain('Curse Enemies with Despair on Hit');
    });

    it('detects corrupted flag', async () => {
      const result = await handler({ text: corruptedUniqueText });

      expect(result.content[0]!.text).toContain('### Flags');
      expect(result.content[0]!.text).toContain('Corrupted');
    });
  });

  describe('English rare armor with defensive stats', () => {
    const armorText = `Item Class: Body Armours
Rarity: Rare
Soul Shell
Full Plate
--------
Quality: +18% (augmented)
Armour: 542 (augmented)
Energy Shield: 85 (augmented)
--------
Requires Level 52, 78 Str, 45 Int
--------
Sockets: S S
--------
Item Level: 60
--------
+45 to maximum Life
+32% to Fire Resistance
+18% to Cold Resistance
12% increased Armour`;

    it('parses defensive stats with augmented markers', async () => {
      const result = await handler({ text: armorText });

      expect(result.content[0]!.text).toContain('### Defenses');
      expect(result.content[0]!.text).toContain('**Armour:** 542 (augmented)');
      expect(result.content[0]!.text).toContain('**Energy Shield:** 85 (augmented)');
    });

    it('parses multiple sockets', async () => {
      const result = await handler({ text: armorText });

      expect(result.content[0]!.text).toContain('### Sockets');
      expect(result.content[0]!.text).toContain('S S');
    });

    it('parses strength and intelligence requirements', async () => {
      const result = await handler({ text: armorText });

      expect(result.content[0]!.text).toContain('**Level:** 52');
      expect(result.content[0]!.text).toMatch(/Strength.*78/);
      expect(result.content[0]!.text).toMatch(/Intelligence.*45/);
    });
  });

  describe('weapon with offensive stats', () => {
    const weaponText = `Item Class: Two Hand Maces
Rarity: Rare
Beast Bane
Great Mallet
--------
Physical Damage: 45-89 (augmented)
Critical Strike Chance: 5.00%
Attacks per Second: 1.25
--------
Requires Level 35, 95 Str
--------
Item Level: 38
--------
+15 to Strength
35% increased Physical Damage
Adds 5 to 10 Physical Damage`;

    it('parses physical damage range with augmented marker', async () => {
      const result = await handler({ text: weaponText });

      expect(result.content[0]!.text).toContain('### Offense');
      expect(result.content[0]!.text).toContain('**Physical Damage:** 45-89 (augmented)');
    });

    it('parses critical chance', async () => {
      const result = await handler({ text: weaponText });

      expect(result.content[0]!.text).toContain('**Critical Chance:** 5%');
    });

    it('parses attack speed', async () => {
      const result = await handler({ text: weaponText });

      expect(result.content[0]!.text).toContain('**Attacks per Second:** 1.25');
    });
  });

  describe('unidentified item', () => {
    const unidentifiedText = `Item Class: Boots
Rarity: Rare
Unidentified
Deicide Boots
--------
Requires Level 60
--------
Unidentified`;

    it('detects unidentified flag', async () => {
      const result = await handler({ text: unidentifiedText });

      expect(result.content[0]!.text).toContain('### Flags');
      expect(result.content[0]!.text).toContain('Unidentified');
    });
  });

  describe('mirrored item', () => {
    const mirroredText = `Item Class: Amulets
Rarity: Rare
Dragon Pendant
Coral Amulet
--------
Requires Level 20
--------
Item Level: 25
--------
+30 to maximum Life
--------
Mirrored`;

    it('detects mirrored flag', async () => {
      const result = await handler({ text: mirroredText });

      expect(result.content[0]!.text).toContain('### Flags');
      expect(result.content[0]!.text).toContain('Mirrored');
    });
  });

  describe('normal item (no name)', () => {
    const normalText = `Item Class: Helmets
Rarity: Normal
Iron Hat
--------
Armour: 25
--------
Requires Level 3
--------
Item Level: 5`;

    it('uses base type as display name', async () => {
      const result = await handler({ text: normalText });

      expect(result.content[0]!.text).toContain('## Iron Hat');
      expect(result.content[0]!.text).toContain('**Normal Helmets**');
    });
  });

  describe('gem item', () => {
    const gemText = `Item Class: Skill Gems
Rarity: Gem
Rolling Slam
--------
Level: 15
--------
Mana Cost: 20
Attack Speed: 80% of base
--------
Slam the ground, creating a wave that rolls forward`;

    it('parses gem rarity', async () => {
      const result = await handler({ text: gemText });

      expect(result.content[0]!.text).toContain('**Gem Skill Gems**');
      expect(result.content[0]!.text).toContain('Rolling Slam');
    });
  });

  describe('unique item with flavor text', () => {
    const uniqueWithFlavorText = `Item Class: Belts
Rarity: Unique
Headhunter
Leather Belt
--------
Requires Level 40
--------
Item Level: 75
--------
+55 to maximum Life
+40 to Strength
When you Kill a Rare monster, you gain its Modifiers for 20 seconds
--------
"A hunter is never alone."`;

    it('parses flavor text', async () => {
      const result = await handler({ text: uniqueWithFlavorText });

      expect(result.content[0]!.text).toContain('### Flavor Text');
      expect(result.content[0]!.text).toContain('A hunter is never alone.');
    });
  });

  describe('language detection across all supported languages', () => {
    it.each([
      { code: 'en', keyword: 'Item Class:' },
      { code: 'ru', keyword: 'Класс предмета:' },
      { code: 'ko', keyword: '아이템 종류:' },
      { code: 'zh-TW', keyword: '物品種類:' },
      { code: 'de', keyword: 'Gegenstandsklasse:' },
      { code: 'fr', keyword: "Classe d'objet:" },
      { code: 'ja', keyword: 'アイテムクラス:' },
      { code: 'es', keyword: 'Clase de objeto:' },
      { code: 'pt', keyword: 'Classe do Item:' },
      { code: 'th', keyword: 'ประเภทไอเท็ม:' },
    ])('detects $code from item text', async ({ code, keyword }) => {
      const text = `${keyword} TestClass
--------
Some content`;

      const result = await handler({ text });

      expect(result.content[0]!.text).toContain(`*Detected language: ${code}*`);
    });
  });

  describe('edge cases', () => {
    it('returns error for empty input', async () => {
      const result = await handler({ text: '' });

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('too short');
    });

    it('returns error for short input', async () => {
      const result = await handler({ text: 'abc' });

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('too short');
    });

    it('returns error for input without section delimiters', async () => {
      const result = await handler({
        text: 'Item Class: Wands\nRarity: Rare\nSome Wand Name',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('no section delimiters');
    });

    it('handles minimal valid input', async () => {
      const minimalText = `Item Class: Test
Rarity: Normal
Base Item
--------
Item Level: 1`;

      const result = await handler({ text: minimalText });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]!.text).toContain('## Base Item');
      expect(result.content[0]!.text).toContain('**Item Level:** 1');
    });

    it('handles item with only header section', async () => {
      const headerOnlyText = `Item Class: Currency
Rarity: Currency
Orb of Transmutation
--------
Upgrades a normal item to magic`;

      const result = await handler({ text: headerOnlyText });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]!.text).toContain('Orb of Transmutation');
    });
  });

  describe('mod type categorization', () => {
    it('parses multiple implicit mods', async () => {
      const text = `Item Class: Rings
Rarity: Rare
Dragon Coil
Amethyst Ring
--------
+15% to Chaos Resistance (implicit)
+5 to all Attributes (implicit)
--------
Item Level: 50
--------
+30 to Strength`;

      const result = await handler({ text });

      const output = result.content[0]!.text;
      expect(output).toContain('**Implicit:**');
      expect(output).toContain('+15% to Chaos Resistance');
      expect(output).toContain('+5 to all Attributes');
    });

    it('separates enchant mods', async () => {
      const text = `Item Class: Helmets
Rarity: Rare
Dragon Crown
Great Helmet
--------
Item Level: 75
--------
40% increased Herald of Ice Damage (enchant)
--------
+50 to maximum Life`;

      const result = await handler({ text });

      expect(result.content[0]!.text).toContain('**Enchant:**');
      expect(result.content[0]!.text).toContain('40% increased Herald of Ice Damage');
    });

    it('separates crafted mods', async () => {
      const text = `Item Class: Wands
Rarity: Rare
Beast Bite
Iron Wand
--------
Item Level: 65
--------
+20 to Intelligence (crafted)
--------
+30% to Spell Damage`;

      const result = await handler({ text });

      expect(result.content[0]!.text).toContain('**Crafted:**');
      expect(result.content[0]!.text).toContain('+20 to Intelligence');
    });
  });

  describe('Magic item parsing', () => {
    const russianMagicFocusText = `Класс предмета: Фокусы
Редкость: Волшебный
Рунический фокус
--------
Энергетический щит: 25
--------
Требуется: Уровень 10
--------
Уровень предмета: 12
--------
+15% к урону от огня`;

    it('parses magic item with combined name as base type', async () => {
      const result = await handler({ text: russianMagicFocusText });

      expect(result.content[0]!.text).toContain('## Рунический фокус');
      expect(result.content[0]!.text).toContain('**Magic Фокусы**');
    });

    it('detects Russian language for magic item', async () => {
      const result = await handler({ text: russianMagicFocusText });

      expect(result.content[0]!.text).toContain('*Detected language: ru*');
    });
  });

  describe('Russian full energy shield form', () => {
    it('parses Энергетический щит (full Russian form)', async () => {
      const text = `Класс предмета: Нагрудники
Редкость: Редкий
Драконья оболочка
Пластинки
--------
Энергетический щит: 147 (augmented)
--------
Уровень предмета: 50`;

      const result = await handler({ text });

      expect(result.content[0]!.text).toContain('**Energy Shield:** 147 (augmented)');
    });
  });

  describe('Reload time parsing', () => {
    const crossbowText = `Item Class: Crossbows
Rarity: Rare
Dragon Striker
Heavy Crossbow
--------
Physical Damage: 45-89
Critical Strike Chance: 5.00%
Attacks per Second: 1.20
Reload Time: 0.79 (augmented)
--------
Requires Level 40, 80 Dex
--------
Item Level: 45
--------
+25% to Physical Damage`;

    it('parses reload time stat', async () => {
      const result = await handler({ text: crossbowText });

      expect(result.content[0]!.text).toContain('**Reload Time:** 0.79s (augmented)');
    });

    it('includes reload time in offense section', async () => {
      const result = await handler({ text: crossbowText });

      expect(result.content[0]!.text).toContain('### Offense');
      expect(result.content[0]!.text).toContain('**Physical Damage:**');
      expect(result.content[0]!.text).toContain('**Reload Time:**');
    });
  });

  describe('Requirements with Russian abbreviations', () => {
    it('parses Инт (Russian abbreviated intelligence)', async () => {
      const text = `Класс предмета: Жезлы
Редкость: Редкий
Тестовый жезл
Увядший жезл
--------
Требуется: Уровень 41, 55 (augmented) Инт
--------
Уровень предмета: 41`;

      const result = await handler({ text });

      expect(result.content[0]!.text).toContain('**Level:** 41');
      expect(result.content[0]!.text).toContain('**Intelligence:** 55');
    });

    it('parses (unmet) requirement marker', async () => {
      const text = `Item Class: Swords
Rarity: Rare
Dragon Blade
Bastard Sword
--------
Requires Level 30, 50 (unmet) Str
--------
Item Level: 30
--------
+20 to Physical Damage`;

      const result = await handler({ text });

      expect(result.content[0]!.text).toContain('**Strength:** 50 (augmented)');
    });
  });

  describe('Flavor text with guillemets', () => {
    it('parses Russian flavor text with « » quotes', async () => {
      const text = `Item Class: Crossbows
Rarity: Unique
Драконий удар
Тяжёлый арбалет
--------
Requires Level 40
--------
Item Level: 75
--------
+50% to Physical Damage
--------
«У ворот его встретили ревущие трубы»
--------
Corrupted`;

      const result = await handler({ text });

      expect(result.content[0]!.text).toContain('### Flavor Text');
      expect(result.content[0]!.text).toContain('У ворот его встретили ревущие трубы');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Item Type-Specific Parsing Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Shield Block Chance stats', () => {
    const shieldText = `Item Class: Shields
Rarity: Rare
Kraken Ward
Lacquered Buckler
--------
Block Chance: 24%
Evasion Rating: 120
--------
Requirements:
Level: 45
Dex: 60
--------
Item Level: 50
--------
+35 to Evasion Rating
+15% to Fire Resistance`;

    it('parses Block Chance as defense stat not explicit mod', async () => {
      const result = await handler({ text: shieldText });

      expect(result.content[0]!.text).toContain('### Defenses');
      expect(result.content[0]!.text).toContain('**Block Chance:** 24%');
    });

    it('parses Evasion as defense stat', async () => {
      const result = await handler({ text: shieldText });

      expect(result.content[0]!.text).toContain('**Evasion:** 120');
    });

    it('does not include Block Chance in explicit mods', async () => {
      const result = await handler({ text: shieldText });
      const lines = result.content[0]!.text.split('\n');
      const explicitSection = lines
        .slice(lines.findIndex((l) => l.includes('**Explicit:**')))
        .join('\n');

      expect(explicitSection).not.toContain('Block Chance');
    });
  });

  describe('Weapon type line filter', () => {
    const focusText = `Item Class: Foci
Rarity: Rare
Onslaught Ward
Crystal Focus
--------
Focus
--------
Requirements:
Level: 42
Int: 95
--------
Item Level: 45
--------
+50 to maximum Energy Shield
+20% to Cold Resistance`;

    it('does not parse single-word Focus as explicit mod', async () => {
      const result = await handler({ text: focusText });
      const lines = result.content[0]!.text.split('\n');
      const explicitSection = lines
        .slice(lines.findIndex((l) => l.includes('**Explicit:**')))
        .join('\n');

      expect(explicitSection).not.toContain('- Focus');
    });

    it('still parses actual explicit mods', async () => {
      const result = await handler({ text: focusText });

      expect(result.content[0]!.text).toContain('+50 to maximum Energy Shield');
      expect(result.content[0]!.text).toContain('+20% to Cold Resistance');
    });
  });

  describe('Flask base properties', () => {
    const flaskText = `Item Class: Life Flasks
Rarity: Magic
Grand Life Flask of Staunching
--------
Recovers 750 Life over 4.00 Seconds
Consumes 15 of 45 Charges on use
Currently has 45 Charges
--------
Item Level: 60
--------
Immunity to Bleeding for 5 seconds upon use
+25% increased Amount Recovered`;

    it('parses flask recovery as Flask Properties', async () => {
      const result = await handler({ text: flaskText });

      expect(result.content[0]!.text).toContain('### Flask Properties');
      expect(result.content[0]!.text).toContain('Recovers 750 Life over 4.00 Seconds');
    });

    it('parses flask charges as Flask Properties', async () => {
      const result = await handler({ text: flaskText });

      expect(result.content[0]!.text).toContain('Consumes 15 of 45 Charges on use');
      expect(result.content[0]!.text).toContain('Currently has 45 Charges');
    });

    it('does not include flask properties in explicit mods', async () => {
      const result = await handler({ text: flaskText });
      const content = result.content[0]!.text;
      const explicitIdx = content.indexOf('**Explicit:**');

      if (explicitIdx !== -1) {
        const explicitSection = content.slice(explicitIdx);
        expect(explicitSection).not.toContain('Recovers 750 Life');
        expect(explicitSection).not.toContain('Consumes 15');
      }
    });
  });

  describe('Gem tags and metadata', () => {
    const gemText = `Item Class: Skill Gems
Rarity: Gem
Essence Drain
--------
Chaos, Spell, Projectile, Duration
Level: 11
Mana Cost: 22
Cast Time: 1.36 sec
--------
Item Level: 60
--------
Deals chaos damage to enemies`;

    it('parses gem info section', async () => {
      const result = await handler({ text: gemText });

      expect(result.content[0]!.text).toContain('### Gem Info');
    });

    it('parses gem tags', async () => {
      const result = await handler({ text: gemText });

      expect(result.content[0]!.text).toContain('**Tags:** Chaos, Spell, Projectile, Duration');
    });

    it('parses gem level', async () => {
      const result = await handler({ text: gemText });

      expect(result.content[0]!.text).toContain('**Level:** 11');
    });

    it('parses gem mana cost', async () => {
      const result = await handler({ text: gemText });

      expect(result.content[0]!.text).toContain('**Mana Cost:** 22');
    });

    it('parses gem cast time', async () => {
      const result = await handler({ text: gemText });

      expect(result.content[0]!.text).toContain('**Cast Time:** 1.36 sec');
    });

    it('does not include gem metadata in explicit mods', async () => {
      const result = await handler({ text: gemText });
      const content = result.content[0]!.text;
      const explicitIdx = content.indexOf('**Explicit:**');

      if (explicitIdx !== -1) {
        const explicitSection = content.slice(explicitIdx);
        expect(explicitSection).not.toContain('Chaos, Spell, Projectile');
        expect(explicitSection).not.toContain('Level: 11');
        expect(explicitSection).not.toContain('Mana Cost: 22');
      }
    });
  });

  describe('Rune socketable effects', () => {
    const runeText = `Item Class: Socketable
Rarity: Normal
Iron Rune
--------
Socketed in Weapon: 15% increased Spell Damage
Socketed in Armour: +30 to maximum Energy Shield
--------
Right click this item then left click a socket in another item to apply it.`;

    it('parses rune effects section', async () => {
      const result = await handler({ text: runeText });

      expect(result.content[0]!.text).toContain('### Rune Effects');
    });

    it('parses Socketed in Weapon effect', async () => {
      const result = await handler({ text: runeText });

      expect(result.content[0]!.text).toContain('Socketed in Weapon: 15% increased Spell Damage');
    });

    it('parses Socketed in Armour effect', async () => {
      const result = await handler({ text: runeText });

      expect(result.content[0]!.text).toContain('Socketed in Armour: +30 to maximum Energy Shield');
    });

    it('does not include rune effects in explicit mods', async () => {
      const result = await handler({ text: runeText });
      const content = result.content[0]!.text;
      const explicitIdx = content.indexOf('**Explicit:**');

      if (explicitIdx !== -1) {
        const explicitSection = content.slice(explicitIdx);
        expect(explicitSection).not.toContain('Socketed in Weapon');
        expect(explicitSection).not.toContain('Socketed in Armour');
      }
    });

    it('filters out usage instruction line', async () => {
      const result = await handler({ text: runeText });
      const content = result.content[0]!.text;

      // Usage instruction should not appear in mods
      expect(content).not.toContain('- Right click this item');
    });
  });

  describe('Charm base properties', () => {
    const charmText = `Item Class: Charms
Rarity: Magic
Ruby Charm of Dousing
--------
Lasts 4.00 Seconds
Limit: 3
--------
Item Level: 50
--------
+10% to Fire Resistance
Immunity to Ignite during Effect`;

    it('parses Charm Properties section', async () => {
      const result = await handler({ text: charmText });

      expect(result.content[0]!.text).toContain('### Charm Properties');
    });

    it('parses charm duration', async () => {
      const result = await handler({ text: charmText });

      expect(result.content[0]!.text).toContain('Lasts 4.00 Seconds');
    });

    it('parses charm limit', async () => {
      const result = await handler({ text: charmText });

      expect(result.content[0]!.text).toContain('Limit: 3');
    });

    it('does not include charm properties in explicit mods', async () => {
      const result = await handler({ text: charmText });
      const content = result.content[0]!.text;
      const explicitIdx = content.indexOf('**Explicit:**');

      if (explicitIdx !== -1) {
        const explicitSection = content.slice(explicitIdx);
        expect(explicitSection).not.toContain('Lasts 4.00 Seconds');
        expect(explicitSection).not.toContain('Limit: 3');
      }
    });
  });

  describe('Waystone Area Level and Map properties', () => {
    const waystoneText = `Item Class: Waystones
Rarity: Normal
Waystone (Tier 5)
--------
Area Level: 70
--------
Item Level: 70
--------
Map
--------
Travel to this Map by using it in a Map Device.`;

    it('parses Map Properties section', async () => {
      const result = await handler({ text: waystoneText });

      expect(result.content[0]!.text).toContain('### Map Properties');
    });

    it('parses Area Level', async () => {
      const result = await handler({ text: waystoneText });

      expect(result.content[0]!.text).toContain('**Area Level:** 70');
    });

    it('extracts Tier from base type', async () => {
      const result = await handler({ text: waystoneText });

      expect(result.content[0]!.text).toContain('**Map Tier:** 5');
    });

    it('does not include Area Level in explicit mods', async () => {
      const result = await handler({ text: waystoneText });
      const content = result.content[0]!.text;
      const explicitIdx = content.indexOf('**Explicit:**');

      if (explicitIdx !== -1) {
        const explicitSection = content.slice(explicitIdx);
        expect(explicitSection).not.toContain('Area Level');
      }
    });

    it('filters out single-word Map line', async () => {
      const result = await handler({ text: waystoneText });
      const content = result.content[0]!.text;

      // Check that "Map" as a single line is not in explicit mods
      const lines = content.split('\n');
      const explicitMods = lines.filter((l) => l.startsWith('- '));
      expect(explicitMods.some((m) => m.trim() === '- Map')).toBe(false);
    });

    it('filters out usage instruction', async () => {
      const result = await handler({ text: waystoneText });
      const content = result.content[0]!.text;

      expect(content).not.toContain('- Travel to this Map');
    });
  });

  describe('Unique item flavour text detection', () => {
    const uniqueText = `Item Class: Body Armours
Rarity: Unique
Cloak of Flames
Simple Robe
--------
Energy Shield: 30
--------
Requirements:
Level: 10
--------
Item Level: 20
--------
+15% to Fire Resistance
+30 to maximum Mana
--------
"The Queen's rage burns eternal."`;

    it('detects quoted flavour text for Unique items', async () => {
      const result = await handler({ text: uniqueText });

      expect(result.content[0]!.text).toContain('### Flavor Text');
      expect(result.content[0]!.text).toContain("The Queen's rage burns eternal.");
    });

    it('does not include flavour text in explicit mods list', async () => {
      const result = await handler({ text: uniqueText });
      const content = result.content[0]!.text;
      const lines = content.split('\n');

      const explicitIdx = lines.findIndex((l) => l.includes('**Explicit:**'));
      if (explicitIdx !== -1) {
        const explicitMods: string[] = [];
        for (let i = explicitIdx + 1; i < lines.length; i++) {
          const line = lines[i]!;
          if (line.startsWith('- ')) {
            explicitMods.push(line);
          } else if (line.startsWith('**') || line.startsWith('###')) {
            break;
          }
        }
        expect(explicitMods.some((m) => m.includes("Queen's rage"))).toBe(false);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Language & Localization Edge Cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Portuguese Engastes sockets variant', () => {
    const portugueseItem = `Classe de Item: Armaduras de Corpo
Raridade: Raro
Veste Nova
Armadura Simples
--------
Armadura: 120
--------
Requisitos:
Nível: 45
--------
Engastes: S S
--------
Nível do Item: 50
--------
+30 à Vida Máxima`;

    it('parses Portuguese sockets with Engastes keyword', async () => {
      const result = await handler({ text: portugueseItem });

      expect(result.content[0]!.text).toContain('### Sockets');
      expect(result.content[0]!.text).toContain('S S');
    });

    it('detects Portuguese language', async () => {
      const result = await handler({ text: portugueseItem });

      expect(result.content[0]!.text).toContain('*Detected language: pt*');
    });
  });

  describe('Chinese Traditional full-width colon normalization', () => {
    // Note: Chinese game client uses full-width colon (：) followed by space
    const chineseItem = `物品種類： 胸甲
稀有度： 稀有
新防具
簡易法袍
--------
能量護盾: 50
--------
需求:
等級: 40
--------
物品等級： 45
--------
+20 至最大魔力`;

    it('parses Chinese header with full-width colon', async () => {
      const result = await handler({ text: chineseItem });

      expect(result.content[0]!.text).toContain('## 新防具');
      expect(result.content[0]!.text).toContain('簡易法袍');
    });

    it('extracts item class correctly despite full-width colon', async () => {
      const result = await handler({ text: chineseItem });

      expect(result.content[0]!.text).toContain('**Rare 胸甲**');
    });

    it('detects Chinese Traditional language', async () => {
      const result = await handler({ text: chineseItem });

      expect(result.content[0]!.text).toContain('*Detected language: zh-TW*');
    });
  });

  describe('Socketable item effects parsing', () => {
    const socketableRune = `Item Class: Socketable
Rarity: Currency
Stone Rune
--------
Weapons: 26% increased Spell Damage
Armour: +17% to Quality of Socketed Skill Gems
--------
Place into an item socket to apply.`;

    it('parses socketable effects as dedicated section', async () => {
      const result = await handler({ text: socketableRune });

      expect(result.content[0]!.text).toContain('### Socketable Effects');
      expect(result.content[0]!.text).toContain('Weapons: 26% increased Spell Damage');
      expect(result.content[0]!.text).toContain('Armour: +17% to Quality of Socketed Skill Gems');
    });

    it('does not parse Armour: line as defense stat', async () => {
      const result = await handler({ text: socketableRune });
      const content = result.content[0]!.text;

      // Should NOT have a Defense section with Armour parsed as stat
      const defenseSection = content.includes('### Defense');
      if (defenseSection) {
        expect(content).not.toMatch(/\*\*Armour:\*\*\s*17/);
      }
    });

    it('filters socketable effects from explicit mods', async () => {
      const result = await handler({ text: socketableRune });
      const content = result.content[0]!.text;
      const lines = content.split('\n');

      const explicitIdx = lines.findIndex((l) => l.includes('**Explicit:**'));
      if (explicitIdx !== -1) {
        const explicitMods: string[] = [];
        for (let i = explicitIdx + 1; i < lines.length; i++) {
          const line = lines[i]!;
          if (line.startsWith('- ')) {
            explicitMods.push(line);
          } else if (line.startsWith('**') || line.startsWith('###')) {
            break;
          }
        }
        expect(explicitMods.some((m) => m.includes('26% increased Spell'))).toBe(false);
      }
    });
  });

  describe('Modifier header line filtering', () => {
    const itemWithHeaders = `Item Class: Rings
Rarity: Rare
Storm Loop
Ruby Ring
--------
Requirements:
Level: 50
--------
Item Level: 55
--------
{ Implicit Modifier — Elemental }
+25% to Fire Resistance
--------
{ Prefix Modifier — Defense }
+50 to maximum Life
{ Suffix Modifier — Attack }
Adds 5 to 10 Fire Damage to Attacks`;

    it('filters modifier header lines from mods', async () => {
      const result = await handler({ text: itemWithHeaders });
      const content = result.content[0]!.text;

      expect(content).not.toContain('{ Implicit Modifier');
      expect(content).not.toContain('{ Prefix Modifier');
      expect(content).not.toContain('{ Suffix Modifier');
    });

    it('still parses actual modifier lines', async () => {
      const result = await handler({ text: itemWithHeaders });
      const content = result.content[0]!.text;

      expect(content).toContain('+25% to Fire Resistance');
      expect(content).toContain('+50 to maximum Life');
      expect(content).toContain('Adds 5 to 10 Fire Damage');
    });
  });

  describe('Jewel Limited to parsing', () => {
    const jewelWithLimit = `Item Class: Jewels
Rarity: Rare
Grim Sphere
Emerald
--------
Limited to: 2
--------
Item Level: 60
--------
+15% to Chaos Resistance
+30 to maximum Life`;

    it('parses Limited to as item metadata', async () => {
      const result = await handler({ text: jewelWithLimit });
      const content = result.content[0]!.text;

      expect(content).toContain('**Limit:** 2');
    });

    it('does not include Limited to in explicit mods', async () => {
      const result = await handler({ text: jewelWithLimit });
      const content = result.content[0]!.text;
      const lines = content.split('\n');

      const explicitIdx = lines.findIndex((l) => l.includes('**Explicit:**'));
      if (explicitIdx !== -1) {
        const explicitMods: string[] = [];
        for (let i = explicitIdx + 1; i < lines.length; i++) {
          const line = lines[i]!;
          if (line.startsWith('- ')) {
            explicitMods.push(line);
          } else if (line.startsWith('**') || line.startsWith('###')) {
            break;
          }
        }
        expect(explicitMods.some((m) => m.includes('Limited to'))).toBe(false);
      }
    });
  });

  describe('Uncut gem Tier filtering', () => {
    const uncutGem = `Item Class: Uncut Skill Gems
Rarity: Currency
Uncut Skill Gem
--------
Tier: 4
--------
Item Level: 65
--------
Right click this item to create a Skill Gem by selecting one from a list.`;

    it('filters Tier line from explicit mods', async () => {
      const result = await handler({ text: uncutGem });
      const content = result.content[0]!.text;
      const lines = content.split('\n');

      const explicitIdx = lines.findIndex((l) => l.includes('**Explicit:**'));
      if (explicitIdx !== -1) {
        const explicitMods: string[] = [];
        for (let i = explicitIdx + 1; i < lines.length; i++) {
          const line = lines[i]!;
          if (line.startsWith('- ')) {
            explicitMods.push(line);
          } else if (line.startsWith('**') || line.startsWith('###')) {
            break;
          }
        }
        expect(explicitMods.some((m) => m.includes('Tier:'))).toBe(false);
      }
    });
  });

  describe('Expedition Logbook Area Level parsing', () => {
    const logbookItem = `Item Class: Logbook
Rarity: Normal
Kalguuran Expedition Logbook
--------
Area Level: 72
--------
Item Level: 72
--------
Contains an Expedition encounter.`;

    it('parses Logbook as map item with Area Level', async () => {
      const result = await handler({ text: logbookItem });
      const content = result.content[0]!.text;

      expect(content).toContain('### Map Properties');
      expect(content).toContain('**Area Level:** 72');
    });
  });

  describe('Russian gem mana cost variant', () => {
    const russianGem = `Класс предмета: Камни умений
Редкость: Камень
Огненный шар
--------
Уровень: 20
Расход маны: 35
--------
Требуется: Уровень 70, 150 Инт
--------
Призывает огненный шар, взрывающийся при попадании.`;

    it('parses Russian mana cost (Расход маны)', async () => {
      const result = await handler({ text: russianGem });
      const content = result.content[0]!.text;

      expect(content).toContain('### Gem Info');
      expect(content).toContain('**Mana Cost:** 35');
    });
  });

  describe('Gem critical hit chance and effectiveness', () => {
    const gemWithCrit = `Item Class: Skill Gems
Rarity: Gem
Fireball
--------
Level: 20
Mana Cost: 25
Critical Hit Chance: 6.5%
Damage Effectiveness: 240%
Cast Time: 0.75 sec
--------
Requirements: Level 70, 150 Int
--------
Fires a ball of flame that explodes on impact.`;

    it('parses gem Critical Hit Chance', async () => {
      const result = await handler({ text: gemWithCrit });
      const content = result.content[0]!.text;

      expect(content).toContain('**Critical Hit Chance:** 6.5%');
    });

    it('parses gem Damage Effectiveness', async () => {
      const result = await handler({ text: gemWithCrit });
      const content = result.content[0]!.text;

      expect(content).toContain('**Damage Effectiveness:** 240%');
    });

    it('does not include crit chance in explicit mods', async () => {
      const result = await handler({ text: gemWithCrit });
      const content = result.content[0]!.text;
      const lines = content.split('\n');

      const explicitIdx = lines.findIndex((l) => l.includes('**Explicit:**'));
      if (explicitIdx !== -1) {
        const explicitMods: string[] = [];
        for (let i = explicitIdx + 1; i < lines.length; i++) {
          const line = lines[i]!;
          if (line.startsWith('- ')) {
            explicitMods.push(line);
          } else if (line.startsWith('**') || line.startsWith('###')) {
            break;
          }
        }
        expect(explicitMods.some((m) => m.includes('Critical Hit Chance'))).toBe(false);
        expect(explicitMods.some((m) => m.includes('Damage Effectiveness'))).toBe(false);
      }
    });
  });

  describe('Localized modifier tags', () => {
    it('classifies Russian (руна) tag as Rune', async () => {
      const text = `Класс предмета: Нательные доспехи
Редкость: Редкий
Кокон скорби
Облачение Кет
--------
Энергетический щит: 147
--------
Уровень предмета: 35
--------
58% увеличение энергетического щита (руна)
--------
+42 к максимуму энергетического щита`;

      const result = await handler({ text });
      const output = result.content[0]!.text;

      expect(output).toContain('**Rune:**');
      expect(output).toContain('58% увеличение энергетического щита');
      expect(output).not.toContain('(руна)');
    });

    it('classifies Russian (неявный) tag as Implicit', async () => {
      const text = `Класс предмета: Кольца
Редкость: Редкий
Мрачная хватка
Аметистовое кольцо
--------
Уровень предмета: 44
--------
+8% к сопротивлению хаосу (неявный)
--------
+23% к сопротивлению огню`;

      const result = await handler({ text });
      const output = result.content[0]!.text;

      expect(output).toContain('**Implicit:**');
      expect(output).toContain('+8% к сопротивлению хаосу');
      expect(output).not.toContain('(неявный)');
    });

    it('classifies Russian (создано) tag as Crafted', async () => {
      const text = `Класс предмета: Кольца
Редкость: Редкий
Кольцо дракона
Рубиновое кольцо
--------
Уровень предмета: 50
--------
+15 к интеллекту (создано)
--------
+30 к максимуму здоровья`;

      const result = await handler({ text });
      const output = result.content[0]!.text;

      expect(output).toContain('**Crafted:**');
      expect(output).toContain('+15 к интеллекту');
      expect(output).not.toContain('(создано)');
    });
  });

  describe('Korean item parsing', () => {
    const koreanArmorText = `아이템 종류: 갑옷
희귀도: 레어
번식 포장
케스 의복
--------
에너지 보호막: 147
--------
요구사항:
레벨: 35
지능: 94
--------
홈: S S
--------
아이템 레벨: 35
--------
에너지 보호막 58% 증가 (룬)
--------
최대 에너지 보호막 +42
에너지 보호막 33% 증가
지능 +18`;

    it('parses all modifiers without loss', async () => {
      const result = await handler({ text: koreanArmorText });
      const output = result.content[0]!.text;

      expect(output).toContain('**Rune:**');
      expect(output).toContain('에너지 보호막 58% 증가');
      expect(output).toContain('**Explicit:**');
      expect(output).toContain('최대 에너지 보호막 +42');
      expect(output).toContain('에너지 보호막 33% 증가');
      expect(output).toContain('지능 +18');
    });

    it('parses Energy Shield as defense stat', async () => {
      const result = await handler({ text: koreanArmorText });
      const output = result.content[0]!.text;

      expect(output).toContain('**Energy Shield:** 147');
    });

    it('parses requirements correctly', async () => {
      const result = await handler({ text: koreanArmorText });
      const output = result.content[0]!.text;

      expect(output).toContain('**Level:** 35');
      expect(output).toMatch(/Intelligence.*94/);
    });
  });

  describe('Thai item parsing', () => {
    const thaiArmorText = `ประเภทไอเท็ม: เกราะกาย
ความหายาก: หายาก
เสื้อรังไหม
เสื้อคลุมเคธ
--------
โล่พลังงาน: 147
--------
ข้อกำหนด:
เลเวล: 35
ปัญญา: 94
--------
ช่องเจียระไน: S S
--------
เลเวลไอเท็ม: 35
--------
โล่พลังงานสูงสุด +42
โล่พลังงานเพิ่มขึ้น 33%
ปัญญา +18`;

    it('parses requirements from ข้อกำหนด header', async () => {
      const result = await handler({ text: thaiArmorText });
      const output = result.content[0]!.text;

      expect(output).toContain('### Requirements');
      expect(output).toContain('**Level:** 35');
      expect(output).toContain('**Intelligence:** 94');
    });

    it('parses Energy Shield defense stat', async () => {
      const result = await handler({ text: thaiArmorText });
      const output = result.content[0]!.text;

      expect(output).toContain('**Energy Shield:** 147');
    });

    it('parses explicit modifiers', async () => {
      const result = await handler({ text: thaiArmorText });
      const output = result.content[0]!.text;

      expect(output).toContain('**Explicit:**');
      expect(output).toContain('โล่พลังงานสูงสุด +42');
    });
  });

  describe('Chinese Traditional alternate ITEM_CLASS keyword', () => {
    const zhTwItem = `物品類別: 身體護甲
稀有度: 稀有
巢穴裹衣
凱斯法衣
--------
能量護盾: 100
--------
物品等級: 45
--------
+30 最大魔力`;

    it('parses item class from 物品類別 variant', async () => {
      const result = await handler({ text: zhTwItem });
      const output = result.content[0]!.text;

      expect(output).toContain('**Rare 身體護甲**');
    });

    it('detects zh-TW language', async () => {
      const result = await handler({ text: zhTwItem });
      const output = result.content[0]!.text;

      expect(output).toContain('*Detected language: zh-TW*');
    });
  });

  describe('Unique item implicit mod not misclassified as Flavor Text', () => {
    const uniqueWithSupportedBy = `Item Class: Body Armours
Rarity: Unique
Atziri's Disdain
Devotee Robe
--------
Energy Shield: 120
--------
Requires Level 45
--------
Item Level: 75
--------
Socketed Gems are Supported by Level 10 Elemental Weakness
--------
+80 to maximum Energy Shield
170% increased Energy Shield`;

    it('does not classify "Socketed Gems are Supported by" as Flavor Text', async () => {
      const result = await handler({ text: uniqueWithSupportedBy });
      const output = result.content[0]!.text;

      expect(output).not.toContain('### Flavor Text');
      expect(output).toContain('Socketed Gems are Supported by Level 10 Elemental Weakness');
    });

    it('preserves explicit mods alongside the supported-by line', async () => {
      const result = await handler({ text: uniqueWithSupportedBy });
      const output = result.content[0]!.text;

      expect(output).toContain('+80 to maximum Energy Shield');
      expect(output).toContain('170% increased Energy Shield');
    });
  });

  describe('unique item single mod not misclassified as flavor text', () => {
    const widowhailText = `Item Class: Bows
Rarity: Unique
Widowhail
Short Bow
--------
Physical Damage: 8-16
Critical Strike Chance: 5.00%
Attacks per Second: 1.50
--------
Requirements:
Level: 3
Dex: 15
--------
Sockets: S
--------
Item Level: 75
--------
Doubles the bonus from Quiver modifiers
--------
Corrupted`;

    it('classifies unquoted mod as explicit, not flavor text', async () => {
      const result = await handler({ text: widowhailText });
      const output = result.content[0]!.text;

      expect(output).toContain('**Explicit:**');
      expect(output).toContain('Doubles the bonus from Quiver modifiers');
      expect(output).not.toContain('### Flavor Text');
    });
  });

  describe('rune section header classifies lines as rune mods', () => {
    const itemWithRuneSection = `Item Class: Helmets
Rarity: Rare
Demon Corona
Gold Circlet
--------
Energy Shield: 90
--------
Requirements:
Level: 40
Int: 60
--------
Item Level: 45
--------
36% increased Energy Shield
+50 to maximum Energy Shield
+14 to Intelligence
--------
Rune: Desert Rune (Level 1)
+10% to Fire Resistance`;

    it('classifies rune section lines as Rune mods', async () => {
      const result = await handler({ text: itemWithRuneSection });
      const output = result.content[0]!.text;

      expect(output).toContain('**Rune:**');
      expect(output).toContain('+10% to Fire Resistance');
    });

    it('keeps explicit mods separate', async () => {
      const result = await handler({ text: itemWithRuneSection });
      const output = result.content[0]!.text;

      expect(output).toContain('**Explicit:**');
      expect(output).toContain('36% increased Energy Shield');
      expect(output).toContain('+50 to maximum Energy Shield');
      expect(output).toContain('+14 to Intelligence');
    });

    it('handles Russian rune section header', async () => {
      const ruText = `Класс предмета: Шлемы
Редкость: Редкий
Магический обруч
Золотой обруч
--------
Энерг. щит: 90
--------
Уровень предмета: 45
--------
+50 к максимуму энергетического щита
--------
Вставленные руны:
Руна пустыни (Уровень 1)
+10% к сопротивлению огню`;

      const result = await handler({ text: ruText });
      const output = result.content[0]!.text;

      expect(output).toContain('**Rune:**');
      expect(output).toContain('+10% к сопротивлению огню');
    });
  });

  describe('Thai alternate keywords', () => {
    const thaiAlternateText = `ประเภทไอเทม: เกราะกาย
ความหายาก: หายาก
บรูดแร็ป
เสื้อคลุมเคธ
--------
โล่พลังงาน: 147
--------
ข้อกำหนด:
เลเวล: 35
ปัญญา: 67
--------
ช่องใส่: S S
--------
เลเวลไอเทม: 35
--------
โล่พลังงานเพิ่มขึ้น 24%`;

    it('parses Item Class from alternate Thai keyword', async () => {
      const result = await handler({ text: thaiAlternateText });
      const output = result.content[0]!.text;

      expect(output).toContain('เกราะกาย');
      expect(output).toContain('*Detected language: th*');
    });

    it('parses Item Level from alternate Thai keyword', async () => {
      const result = await handler({ text: thaiAlternateText });
      const output = result.content[0]!.text;

      expect(output).toContain('**Item Level:** 35');
    });

    it('parses Sockets from ช่องใส่ keyword', async () => {
      const result = await handler({ text: thaiAlternateText });
      const output = result.content[0]!.text;

      expect(output).toContain('### Sockets');
      expect(output).toContain('S S');
    });
  });

  describe('Japanese Intelligence requirement', () => {
    const japaneseText = `アイテムクラス: 胴体防具
レアリティ: レア
テスト防具
ケスローブ
--------
エナジーシールド: 147
--------
要求:
レベル: 35
知性: 67
--------
アイテムレベル: 35
--------
エナジーシールド +42`;

    it('parses 知性 as Intelligence', async () => {
      const result = await handler({ text: japaneseText });
      const output = result.content[0]!.text;

      expect(output).toContain('**Intelligence:** 67');
    });
  });

  describe('Spirit gem reservation', () => {
    const spiritGemText = `Item Class: Spirit Gems
Rarity: Gem
Withering Presence
--------
Spell, Aura, Duration, Chaos, Area
Level: 10
Reservation: 30 Spirit
--------
Requirements: Level 30, 50 Int
--------
Applies a chaos damage aura`;

    it('parses Reservation in Gem Info', async () => {
      const result = await handler({ text: spiritGemText });
      const output = result.content[0]!.text;

      expect(output).toContain('### Gem Info');
      expect(output).toContain('**Reservation:** 30 Spirit');
    });
  });

  describe('gem description and experience', () => {
    const gemWithDescAndExp = `Item Class: Skill Gems
Rarity: Gem
Chaos Bolt
--------
Chaos, Spell, Projectile
Level: 10
Mana Cost: 15
Cast Time: 0.80 sec
--------
Fires a projectile that applies a Chaos Damage over Time debuff
Deals 260.6 base Chaos Damage per second
--------
Experience: 125000/250000`;

    it('classifies skill effect text as Description', async () => {
      const result = await handler({ text: gemWithDescAndExp });
      const output = result.content[0]!.text;

      expect(output).toContain('### Description');
      expect(output).toContain('Fires a projectile that applies a Chaos Damage over Time debuff');
      expect(output).toContain('Deals 260.6 base Chaos Damage per second');
    });

    it('parses Experience in Gem Info', async () => {
      const result = await handler({ text: gemWithDescAndExp });
      const output = result.content[0]!.text;

      expect(output).toContain('**Experience:** 125000/250000');
    });

    it('does not include description or experience in explicit mods', async () => {
      const result = await handler({ text: gemWithDescAndExp });
      const output = result.content[0]!.text;
      const explicitIdx = output.indexOf('**Explicit:**');

      expect(explicitIdx).toBe(-1);
    });
  });

  describe('socketable item Level parsed as base property', () => {
    const socketableText = `Item Class: Socketable
Rarity: Normal
Iron Rune
--------
Socketed in Weapon: 15% increased Spell Damage
Socketed in Armour: +30 to maximum Energy Shield
--------
Level: 1`;

    it('parses Level as item level', async () => {
      const result = await handler({ text: socketableText });
      const output = result.content[0]!.text;

      expect(output).toContain('**Item Level:** 1');
    });

    it('does not include Level in explicit mods', async () => {
      const result = await handler({ text: socketableText });
      const output = result.content[0]!.text;
      const explicitIdx = output.indexOf('**Explicit:**');

      expect(explicitIdx).toBe(-1);
    });
  });

  describe('waystone map properties', () => {
    const waystoneWithProps = `Item Class: Waystones
Rarity: Rare
Precinct
Waystone (Tier 10)
--------
Map Tier: 10
Item Quantity: +65%
Item Rarity: +30%
Monster Pack Size: +20%
--------
Item Level: 75
--------
Monsters deal 110% extra Damage as Fire
Area contains two additional Bosses`;

    it('parses Map Tier', async () => {
      const result = await handler({ text: waystoneWithProps });
      const output = result.content[0]!.text;

      expect(output).toContain('**Map Tier:** 10');
    });

    it('parses Item Quantity', async () => {
      const result = await handler({ text: waystoneWithProps });
      const output = result.content[0]!.text;

      expect(output).toContain('**Item Quantity:** +65%');
    });

    it('parses Item Rarity', async () => {
      const result = await handler({ text: waystoneWithProps });
      const output = result.content[0]!.text;

      expect(output).toContain('**Item Rarity:** +30%');
    });

    it('parses Monster Pack Size', async () => {
      const result = await handler({ text: waystoneWithProps });
      const output = result.content[0]!.text;

      expect(output).toContain('**Monster Pack Size:** +20%');
    });

    it('does not include map properties in explicit mods', async () => {
      const result = await handler({ text: waystoneWithProps });
      const output = result.content[0]!.text;
      const lines = output.split('\n');
      const explicitIdx = lines.findIndex((l) => l.includes('**Explicit:**'));

      if (explicitIdx !== -1) {
        const explicitSection = lines.slice(explicitIdx, explicitIdx + 10).join('\n');
        expect(explicitSection).not.toContain('Map Tier');
        expect(explicitSection).not.toContain('Item Quantity');
        expect(explicitSection).not.toContain('Monster Pack Size');
      }
    });
  });

  describe('charm charge consumption', () => {
    const charmWithCharges = `Item Class: Charms
Rarity: Magic
Ruby Charm of Dousing
--------
Lasts 4.00 Seconds
Limit: 3
Consumes 20 of 60 Charges on use
--------
Item Level: 50
--------
+10% to Fire Resistance`;

    it('parses Consumes line in Charm Properties', async () => {
      const result = await handler({ text: charmWithCharges });
      const output = result.content[0]!.text;

      expect(output).toContain('### Charm Properties');
      expect(output).toContain('Consumes 20 of 60 Charges on use');
    });

    it('includes duration and limit alongside charges', async () => {
      const result = await handler({ text: charmWithCharges });
      const output = result.content[0]!.text;

      expect(output).toContain('Lasts 4.00 Seconds');
      expect(output).toContain('Limit: 3');
    });
  });

  describe('jewel without base type has no trailing dash', () => {
    const jewelText = `Item Class: Jewels
Rarity: Rare
Chaotic Sapphire
--------
Limited to: 2
--------
Item Level: 60
--------
+15% to Chaos Resistance
+30 to maximum Life`;

    it('renders header without trailing dash or base type', async () => {
      const result = await handler({ text: jewelText });
      const output = result.content[0]!.text;

      expect(output).toContain('## Chaotic Sapphire');
      expect(output).toContain('**Rare Jewels**');
      expect(output).not.toContain('**Rare Jewels** —');
    });
  });

  describe('Russian implicit tag (неотъемлемый)', () => {
    const russianRingText = `Класс предмета: Кольца
Редкость: Редкий
Зловещий захват
Кольцо с аметистом
--------
Требуется: Уровень 26
--------
Уровень предмета: 34
--------
+8% к сопротивлению хаосу (неотъемлемый)
--------
+27 к меткости
+39 к уклонению`;

    it('classifies (неотъемлемый) as implicit', async () => {
      const result = await handler({ text: russianRingText });
      const output = result.content[0]!.text;

      expect(output).toContain('**Implicit:**');
      expect(output).toContain('+8% к сопротивлению хаосу');
      expect(output).not.toContain('(неотъемлемый)');
    });

    it('does not put implicit mod in explicit section', async () => {
      const result = await handler({ text: russianRingText });
      const output = result.content[0]!.text;
      const lines = output.split('\n');
      const explicitIdx = lines.findIndex((l) => l.includes('**Explicit:**'));

      if (explicitIdx !== -1) {
        const explicitSection = lines.slice(explicitIdx, explicitIdx + 10).join('\n');
        expect(explicitSection).not.toContain('сопротивлению хаосу');
      }
    });
  });

  describe('Russian wand implicit granted skill with (неотъемлемый)', () => {
    const russianWandImplicitText = `Класс предмета: Жезлы
Редкость: Редкий
Чумное проклятие
Увядший жезл
--------
Уровень предмета: 41
--------
Предоставляет умение Снаряд хаоса 11-го уровня (неотъемлемый)
--------
91% увеличение урона от чар`;

    it('classifies granted skill line with (неотъемлемый) as implicit', async () => {
      const result = await handler({ text: russianWandImplicitText });
      const output = result.content[0]!.text;

      expect(output).toContain('**Implicit:**');
      expect(output).toContain('Предоставляет умение Снаряд хаоса 11-го уровня');
      expect(output).not.toContain('(неотъемлемый)');
    });
  });

  describe('Korean implicit tag (고정)', () => {
    const koreanRingText = `아이템 종류: 반지
희귀도: 레어
어둠의 고리
자수정 반지
--------
아이템 레벨: 34
--------
+8% 모든 원소 저항 (고정)
--------
+27 명중
+39 회피`;

    it('classifies (고정) as implicit', async () => {
      const result = await handler({ text: koreanRingText });
      const output = result.content[0]!.text;

      expect(output).toContain('**Implicit:**');
      expect(output).toContain('+8% 모든 원소 저항');
      expect(output).not.toContain('(고정)');
    });
  });

  describe('Russian Ячейки sockets keyword', () => {
    const russianSocketsText = `Класс предмета: Жезлы
Редкость: Редкий
Чумное проклятие
Увядший жезл
--------
Ячейки: S S
--------
Уровень предмета: 41
--------
+10 к интеллекту`;

    it('parses Ячейки as sockets', async () => {
      const result = await handler({ text: russianSocketsText });
      const output = result.content[0]!.text;

      expect(output).toContain('### Sockets');
      expect(output).toContain('S S');
    });

    it('does not include Ячейки in explicit mods', async () => {
      const result = await handler({ text: russianSocketsText });
      const output = result.content[0]!.text;
      const lines = output.split('\n');
      const explicitIdx = lines.findIndex((l) => l.includes('**Explicit:**'));

      if (explicitIdx !== -1) {
        const explicitSection = lines.slice(explicitIdx, explicitIdx + 10).join('\n');
        expect(explicitSection).not.toContain('Ячейки');
      }
    });
  });

  describe('German Fassung (singular) sockets keyword', () => {
    const germanSocketsText = `Gegenstandsklasse: Körperrüstungen
Seltenheit: Selten
Testpanzer
Plattenrüstung
--------
Rüstung: 200
--------
Fassung: S
--------
Gegenstandsstufe: 50
--------
+30 zu maximalem Leben`;

    it('parses Fassung (singular) as sockets', async () => {
      const result = await handler({ text: germanSocketsText });
      const output = result.content[0]!.text;

      expect(output).toContain('### Sockets');
      expect(output).toContain('S');
    });

    it('does not include Fassung in explicit mods', async () => {
      const result = await handler({ text: germanSocketsText });
      const output = result.content[0]!.text;
      const lines = output.split('\n');
      const explicitIdx = lines.findIndex((l) => l.includes('**Explicit:**'));

      if (explicitIdx !== -1) {
        const explicitSection = lines.slice(explicitIdx, explicitIdx + 10).join('\n');
        expect(explicitSection).not.toContain('Fassung');
      }
    });
  });

  describe('Russian full-form crit chance', () => {
    const russianWandStatsText = `Класс предмета: Жезлы
Редкость: Редкий
Чумное проклятие
Увядший жезл
--------
Физический урон: 12-22
Шанс критического удара: 7.00%
Атак в секунду: 1.50
--------
Уровень предмета: 41
--------
+10 к интеллекту`;

    it('parses Шанс критического удара as crit chance', async () => {
      const result = await handler({ text: russianWandStatsText });
      const output = result.content[0]!.text;

      expect(output).toContain('### Offense');
      expect(output).toContain('**Critical Chance:** 7%');
    });

    it('parses all weapon stats together', async () => {
      const result = await handler({ text: russianWandStatsText });
      const output = result.content[0]!.text;

      expect(output).toContain('**Physical Damage:** 12-22');
      expect(output).toContain('**Attacks per Second:** 1.5');
    });

    it('does not leak crit chance to explicit mods', async () => {
      const result = await handler({ text: russianWandStatsText });
      const output = result.content[0]!.text;
      const lines = output.split('\n');
      const explicitIdx = lines.findIndex((l) => l.includes('**Explicit:**'));

      if (explicitIdx !== -1) {
        const explicitSection = lines.slice(explicitIdx, explicitIdx + 10).join('\n');
        expect(explicitSection).not.toContain('критического удара');
      }
    });
  });

  describe('Elemental damage in weapon header', () => {
    const crossbowText = `Item Class: Crossbows
Rarity: Rare
Storm Striker
Arbalest
--------
Physical Damage: 10-20
Lightning Damage: 10-273
Critical Strike Chance: 5.00%
Attacks per Second: 1.20
Reload Time: 0.79
--------
Requires Level 40, 80 Dex
--------
Item Level: 45
--------
+25% to Physical Damage`;

    it('parses Lightning Damage as elemental', async () => {
      const result = await handler({ text: crossbowText });
      const output = result.content[0]!.text;

      expect(output).toContain('### Offense');
      expect(output).toContain('**Lightning Damage:** 10-273');
    });

    it('parses physical damage alongside elemental', async () => {
      const result = await handler({ text: crossbowText });
      const output = result.content[0]!.text;

      expect(output).toContain('**Physical Damage:** 10-20');
    });

    it('does not leak elemental damage to explicit mods', async () => {
      const result = await handler({ text: crossbowText });
      const output = result.content[0]!.text;
      const lines = output.split('\n');
      const explicitIdx = lines.findIndex((l) => l.includes('**Explicit:**'));

      if (explicitIdx !== -1) {
        const explicitSection = lines.slice(explicitIdx, explicitIdx + 10).join('\n');
        expect(explicitSection).not.toContain('Lightning Damage');
      }
    });
  });

  describe('Multiple elemental damage types', () => {
    const multiElementText = `Item Class: Wands
Rarity: Rare
Flame Spark
Bone Wand
--------
Fire Damage: 15-30
Cold Damage: 5-12
Critical Strike Chance: 6.00%
Attacks per Second: 1.40
--------
Item Level: 55
--------
+20% to Spell Damage`;

    it('parses multiple elemental damage types', async () => {
      const result = await handler({ text: multiElementText });
      const output = result.content[0]!.text;

      expect(output).toContain('**Fire Damage:** 15-30');
      expect(output).toContain('**Cold Damage:** 5-12');
    });
  });

  describe('Broadened modifier header filtering', () => {
    const itemWithRuneHeader = `Item Class: Rings
Rarity: Rare
Storm Loop
Ruby Ring
--------
Item Level: 55
--------
{ Rune Modifier }
+12% to Fire Resistance (rune)
--------
+50 to maximum Life`;

    it('filters { Rune Modifier } header from output', async () => {
      const result = await handler({ text: itemWithRuneHeader });
      const output = result.content[0]!.text;

      expect(output).not.toContain('{ Rune Modifier }');
      expect(output).toContain('+12% to Fire Resistance');
    });

    it('filters { Desecrated Modifier } header', async () => {
      const text = `Item Class: Body Armours
Rarity: Rare
Doom Shell
Full Plate
--------
Item Level: 80
--------
{ Desecrated Modifier — Tier 1 }
+100 to maximum Life (desecrated)
--------
+30% to Fire Resistance`;

      const result = await handler({ text });
      const output = result.content[0]!.text;

      expect(output).not.toContain('{ Desecrated Modifier');
      expect(output).toContain('+100 to maximum Life');
    });

    it('filters { Crafted Modifier } header', async () => {
      const text = `Item Class: Wands
Rarity: Rare
Grim Spark
Iron Wand
--------
Item Level: 70
--------
{ Crafted Modifier }
+20 to Intelligence (crafted)
--------
+30% to Spell Damage`;

      const result = await handler({ text });
      const output = result.content[0]!.text;

      expect(output).not.toContain('{ Crafted Modifier }');
      expect(output).toContain('+20 to Intelligence');
    });
  });
});
