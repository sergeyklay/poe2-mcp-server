import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeTrailingArabicToRoman,
  getPoe2dbPage,
  parsePoe2dbHtml,
  formatPoe2dbSections,
  type Poe2dbParsedPage,
  type Poe2dbSectionFilter,
} from './poe2db.js';

beforeEach(() => {
  vi.restoreAllMocks();
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

  it('falls back to page title when og:title and h1 are missing', () => {
    const html = `<html><head><title>Fallback Title - poe2db</title></head><body></body></html>`;

    const result = parsePoe2dbHtml(html);

    expect(result.title).toBe('Fallback Title');
  });

  it('extracts description from secDescrText when og:description missing', () => {
    const html = `
      <html><body>
        <div class="gemPopup">
          <div class="secDescrText">Ancient flavor text</div>
        </div>
      </body></html>
    `;

    const result = parsePoe2dbHtml(html);

    expect(result.description).toBe('Ancient flavor text');
  });

  it('filters out mod IDs from description', () => {
    const html = `
      <html>
        <head><meta property="og:description" content="damage_+%"></head>
        <body></body>
      </html>
    `;

    const result = parsePoe2dbHtml(html);

    expect(result.description).toBe('');
  });

  it('falls back to item-popup--poe2 when gemPopup has no stats', () => {
    const html = `
      <html><body>
        <div class="gemPopup"></div>
        <div class="item-popup--poe2">
          <span class="property">Armour: 500</span>
          <span class="explicitMod">+50 to Life</span>
        </div>
      </body></html>
    `;

    const result = parsePoe2dbHtml(html);

    expect(result.stats).toContain('Armour: 500');
    expect(result.stats).toContain('+50 to Life');
  });

  it('falls back to .Stats container for base type pages', () => {
    const html = `
      <html><body>
        <div class="gemPopup"></div>
        <div class="Stats">
          <span class="property">Body Armour</span>
          <span class="property">Armour: 45</span>
          <span class="property">Base Movement Speed: -0.05</span>
        </div>
      </body></html>
    `;

    const result = parsePoe2dbHtml(html);

    expect(result.stats).toContain('Body Armour');
    expect(result.stats).toContain('Armour: 45');
    expect(result.stats).toContain('Base Movement Speed: -0.05');
  });

  it('extracts .requirements elements from .Stats container', () => {
    const html = `
      <html><body>
        <div class="Stats">
          <span class="property">Wand</span>
          <span class="requirements">Requires: 6 Int</span>
          <span class="property">Grants Skill: Chaos Bolt</span>
        </div>
      </body></html>
    `;

    const result = parsePoe2dbHtml(html);

    expect(result.stats).toContain('Wand');
    expect(result.stats).toContain('Requires: 6 Int');
    expect(result.stats).toContain('Grants Skill: Chaos Bolt');
  });

  it('prefers gemPopup over .Stats when gemPopup has content', () => {
    const html = `
      <html><body>
        <div class="gemPopup">
          <span class="property">Level: 20</span>
          <span class="explicitMod">+100 to Damage</span>
        </div>
        <div class="Stats">
          <span class="property">Base type stats</span>
        </div>
      </body></html>
    `;

    const result = parsePoe2dbHtml(html);

    expect(result.stats).toContain('Level: 20');
    expect(result.stats).toContain('+100 to Damage');
    expect(result.stats).not.toContain('Base type stats');
  });

  it('filters out mod IDs from stats', () => {
    const html = `
      <html><body>
        <div class="gemPopup">
          <span class="property">Level: 1</span>
          <span class="explicitMod">damage_+%</span>
          <span class="explicitMod">base_damage_taken_+%</span>
        </div>
      </body></html>
    `;

    const result = parsePoe2dbHtml(html);

    expect(result.stats).toContain('Level: 1');
    expect(result.stats).not.toContain('damage_+%');
    expect(result.stats).not.toContain('base_damage_taken_+%');
  });

  it('parses Supported By section with gem tags', () => {
    const html = `
      <html><body>
        <div class="card-header">Supported By /3</div>
        <div class="row">
          <div class="col">
            <a></a>
            <a>GMP</a>
            <a>Projectile</a>
          </div>
          <div class="col">
            <a></a>
            <a>Swift Affliction</a>
            <a>Ailment</a>
            <a>Duration</a>
          </div>
          <div class="col">
            <a></a>
            <a>Void Manipulation</a>
          </div>
        </div>
      </body></html>
    `;

    const result = parsePoe2dbHtml(html);

    const supportsFull = result.sections.get('supports_full');
    expect(supportsFull).toBeDefined();
    expect(supportsFull?.content).toContain('GMP (Projectile)');
    expect(supportsFull?.content).toContain('Swift Affliction (Ailment, Duration)');
    expect(supportsFull?.content).toContain('Void Manipulation');
    expect(supportsFull?.content).toContain(' | ');
  });

  it('parses table-responsive section for level data', () => {
    const html = `
      <html><body>
        <div class="card-header">Level Effect /3</div>
        <div class="table-responsive">
          <table>
            <tr><th>Level</th><th>Damage</th></tr>
            <tr><td>1</td><td>10</td></tr>
            <tr><td>2</td><td>20</td></tr>
          </table>
        </div>
      </body></html>
    `;

    const result = parsePoe2dbHtml(html);

    const levels = result.sections.get('levels');
    expect(levels).toBeDefined();
    expect(levels?.content).toContain('Level\tDamage');
    expect(levels?.content).toContain('1\t10');
    expect(levels?.content).toContain('2\t20');
  });

  it('joins multiple anchor tags in table cells with comma', () => {
    const html = `
      <html><body>
        <div class="card-header">Recommended Support Gems /2</div>
        <div class="table-responsive">
          <table>
            <tr><th>Tier</th><th>Gems</th></tr>
            <tr><td>1</td><td><a>GMP</a><a>Swift</a></td></tr>
          </table>
        </div>
      </body></html>
    `;

    const result = parsePoe2dbHtml(html);

    const supports = result.sections.get('supports');
    expect(supports?.content).toContain('GMP, Swift');
  });

  it('parses direct table elements', () => {
    const html = `
      <html><body>
        <div class="card-header">Level Effect /2</div>
        <table>
          <tr><th>Level</th><th>Effect</th></tr>
          <tr><td>1</td><td>Boost</td></tr>
        </table>
      </body></html>
    `;

    const result = parsePoe2dbHtml(html);

    const levels = result.sections.get('levels');
    expect(levels).toBeDefined();
    expect(levels?.content).toContain('1\tBoost');
  });

  it('uses fallback card-body within parent when sibling not found', () => {
    const html = `
      <html><body>
        <div class="card">
          <div class="card-header">From /1</div>
          <div class="no-match">noise</div>
          <div class="card-header">Next Section</div>
          <div class="card-body">Parent Content</div>
        </div>
      </body></html>
    `;

    const result = parsePoe2dbHtml(html);

    const acquisition = result.sections.get('acquisition');
    expect(acquisition?.content).toBe('Parent Content');
  });

  it('returns Unknown title when no title sources available', () => {
    const html = `<html><head></head><body></body></html>`;

    const result = parsePoe2dbHtml(html);

    expect(result.title).toBe('Unknown');
  });

  it('skips stats with Edit in text', () => {
    const html = `
      <html><body>
        <div class="gemPopup">
          <span class="property">Level: 1</span>
          <span class="property">Edit</span>
        </div>
      </body></html>
    `;

    const result = parsePoe2dbHtml(html);

    expect(result.stats).toBe('Level: 1');
    expect(result.stats).not.toContain('Edit');
  });

  it('skips stats longer than 200 characters', () => {
    const longText = 'x'.repeat(250);
    const html = `
      <html><body>
        <div class="gemPopup">
          <span class="property">Level: 1</span>
          <span class="explicitMod">${longText}</span>
        </div>
      </body></html>
    `;

    const result = parsePoe2dbHtml(html);

    expect(result.stats).toBe('Level: 1');
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

  it('shows all entries in supports section without truncation', () => {
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

    expect(result).toContain('GMP');
    expect(result).toContain('Spell Echo');
  });

  it('shows warning for large supports_full section with 50+ entries', () => {
    const gems = Array.from({ length: 60 }, (_, i) => `Gem${i + 1}`);
    const sections = new Map([
      [
        'supports_full',
        {
          id: 'Supported By',
          header: 'Supported By /60',
          content: gems.join(' | '),
          itemCount: 60,
        },
      ],
    ]);
    const page = createParsedPage({ sections });

    const result = formatPoe2dbSections(page, 'Test_Gem', 'us', ['supports_full']);

    expect(result).toContain('⚠️ Large list (60 entries). Showing first 50.');
    expect(result).toContain('Gem1');
    expect(result).toContain('Gem50');
    expect(result).not.toContain('Gem51');
  });

  it('filters levels section by level_range', () => {
    const levelsContent = 'Level\tDamage\n5\t100\n6\t120\n10\t200\n11\t220\n12\t240';
    const sections = new Map([
      [
        'levels',
        { id: 'Level Effect', header: 'Level Effect /40', content: levelsContent, itemCount: 40 },
      ],
    ]);
    const page = createParsedPage({ sections });

    const result = formatPoe2dbSections(page, 'Test_Gem', 'us', ['levels'], { min: 10, max: 12 });

    expect(result).toContain('### Levels 10-12');
    expect(result).toContain('10\t200');
    expect(result).toContain('11\t220');
    expect(result).toContain('12\t240');
    expect(result).not.toContain('5\t100');
    expect(result).not.toContain('6\t120');
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
