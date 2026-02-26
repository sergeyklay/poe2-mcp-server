import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { deflateSync } from 'zlib';

vi.mock('../services/api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api.js')>();
  return {
    ...actual,
    fetchPobbinCode: vi.fn(),
    resolvePob2BuildsPath: vi.fn(),
    listPob2Builds: vi.fn(),
    readPob2Build: vi.fn(),
  };
});

import {
  fetchPobbinCode,
  resolvePob2BuildsPath,
  listPob2Builds,
  readPob2Build,
  type PobBuild,
} from '../services/api.js';
import { registerPobTools } from './pob.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

function createMockServer() {
  const handlers = new Map<string, ToolHandler>();
  const mockServer = {
    registerTool: vi.fn((name: string, _opts: unknown, handler: ToolHandler) => {
      handlers.set(name, handler);
    }),
  } as unknown as McpServer;

  return { mockServer, handlers };
}

function createMinimalPobCode(): string {
  const xml = `
<PathOfBuilding>
  <Build className="Witch" ascendClassName="Necromancer" level="90"></Build>
  <Items></Items>
  <Skills></Skills>
  <Tree activeSpec="1"><Spec treeVersion="0.4"><URL></URL></Spec></Tree>
  <Config></Config>
  <Notes></Notes>
</PathOfBuilding>`;
  const compressed = deflateSync(Buffer.from(xml, 'utf-8'));
  return compressed.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

function createMockBuild(overrides: Partial<PobBuild> = {}): PobBuild {
  return {
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
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('poe2_pob_decode', () => {
  it('decodes valid PoB code and returns formatted markdown', async () => {
    vi.mocked(resolvePob2BuildsPath).mockReturnValue(null);
    const { mockServer, handlers } = createMockServer();
    registerPobTools(mockServer);
    const handler = handlers.get('poe2_pob_decode')!;

    const pobCode = createMinimalPobCode();

    const result = await handler({ code: pobCode });

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('Necromancer');
    expect(result.content[0]?.text).toContain('Level 90');
    expect(result.content[0]?.text).toContain('Source: PoB code');
  });

  it('fetches and decodes pobb.in URL', async () => {
    vi.mocked(resolvePob2BuildsPath).mockReturnValue(null);
    const pobCode = createMinimalPobCode();
    vi.mocked(fetchPobbinCode).mockResolvedValue(pobCode);

    const { mockServer, handlers } = createMockServer();
    registerPobTools(mockServer);
    const handler = handlers.get('poe2_pob_decode')!;

    const result = await handler({ code: 'https://pobb.in/test123' });

    expect(fetchPobbinCode).toHaveBeenCalledWith('test123');
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('pobb.in/test123');
  });

  it('returns isError on invalid PoB code', async () => {
    vi.mocked(resolvePob2BuildsPath).mockReturnValue(null);
    const { mockServer, handlers } = createMockServer();
    registerPobTools(mockServer);
    const handler = handlers.get('poe2_pob_decode')!;

    const result = await handler({ code: 'not-valid-pob-code' });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Failed to decode');
  });

  it('returns isError when pobb.in fetch fails', async () => {
    vi.mocked(resolvePob2BuildsPath).mockReturnValue(null);
    vi.mocked(fetchPobbinCode).mockRejectedValue(new Error('paste not found'));

    const { mockServer, handlers } = createMockServer();
    registerPobTools(mockServer);
    const handler = handlers.get('poe2_pob_decode')!;

    const result = await handler({ code: 'pobb.in/invalid' });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('paste not found');
  });
});

describe('poe2_pob_local_builds', () => {
  it('returns isError when builds directory not found', async () => {
    vi.mocked(resolvePob2BuildsPath).mockReturnValue(null);

    const { mockServer, handlers } = createMockServer();
    registerPobTools(mockServer);
    const handler = handlers.get('poe2_pob_local_builds')!;

    const result = await handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('not found');
  });

  it('returns empty message when no builds exist', async () => {
    vi.mocked(resolvePob2BuildsPath).mockReturnValue('/path/to/builds');
    vi.mocked(listPob2Builds).mockReturnValue([]);

    const { mockServer, handlers } = createMockServer();
    registerPobTools(mockServer);
    const handler = handlers.get('poe2_pob_local_builds')!;

    const result = await handler({});

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('No build files found');
  });

  it('returns formatted list of builds', async () => {
    vi.mocked(resolvePob2BuildsPath).mockReturnValue('/path/to/builds');
    vi.mocked(listPob2Builds).mockReturnValue([
      {
        filename: 'Necromancer_Build',
        className: 'Witch',
        ascendancy: 'Necromancer',
        level: 95,
        lastModified: new Date('2026-02-20'),
      },
      {
        filename: 'Ranger_Build',
        className: 'Ranger',
        ascendancy: 'Deadeye',
        level: 85,
        lastModified: new Date('2026-02-15'),
      },
    ]);

    const { mockServer, handlers } = createMockServer();
    registerPobTools(mockServer);
    const handler = handlers.get('poe2_pob_local_builds')!;

    const result = await handler({});

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('Found 2 build(s)');
    expect(result.content[0]?.text).toContain('Necromancer_Build');
    expect(result.content[0]?.text).toContain('Necromancer (Witch)');
    expect(result.content[0]?.text).toContain('Lv95');
    expect(result.content[0]?.text).toContain('2026-02-20');
  });

  it('handles builds without ascendancy', async () => {
    vi.mocked(resolvePob2BuildsPath).mockReturnValue('/path/to/builds');
    vi.mocked(listPob2Builds).mockReturnValue([
      {
        filename: 'Basic_Build',
        className: 'Marauder',
        ascendancy: null,
        level: 50,
        lastModified: new Date('2026-02-10'),
      },
    ]);

    const { mockServer, handlers } = createMockServer();
    registerPobTools(mockServer);
    const handler = handlers.get('poe2_pob_local_builds')!;

    const result = await handler({});

    expect(result.content[0]?.text).toContain('Marauder');
    expect(result.content[0]?.text).not.toContain('null');
  });
});

describe('poe2_pob_compare', () => {
  it('compares two PoB codes and returns diff', async () => {
    vi.mocked(resolvePob2BuildsPath).mockReturnValue(null);

    const { mockServer, handlers } = createMockServer();
    registerPobTools(mockServer);
    const handler = handlers.get('poe2_pob_compare')!;

    const pobCode = createMinimalPobCode();

    const result = await handler({ current: pobCode, reference: pobCode });

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('Build Comparison');
    expect(result.content[0]?.text).toContain('Current:');
    expect(result.content[0]?.text).toContain('Reference:');
  });

  it('compares pobb.in URL with PoB code', async () => {
    vi.mocked(resolvePob2BuildsPath).mockReturnValue(null);
    const pobCode = createMinimalPobCode();
    vi.mocked(fetchPobbinCode).mockResolvedValue(pobCode);

    const { mockServer, handlers } = createMockServer();
    registerPobTools(mockServer);
    const handler = handlers.get('poe2_pob_compare')!;

    const result = await handler({
      current: pobCode,
      reference: 'https://pobb.in/guide123',
    });

    expect(fetchPobbinCode).toHaveBeenCalledWith('guide123');
    expect(result.isError).toBeUndefined();
  });

  it('compares local build name with PoB code', async () => {
    vi.mocked(resolvePob2BuildsPath).mockReturnValue('/path/to/builds');
    const mockBuild = createMockBuild();
    vi.mocked(readPob2Build).mockReturnValue(mockBuild);

    const { mockServer, handlers } = createMockServer();
    registerPobTools(mockServer);
    const handler = handlers.get('poe2_pob_compare')!;

    const pobCode = createMinimalPobCode();

    const result = await handler({
      current: 'MyLocalBuild',
      reference: pobCode,
    });

    expect(readPob2Build).toHaveBeenCalledWith('/path/to/builds', 'MyLocalBuild');
    expect(result.isError).toBeUndefined();
  });

  it('returns isError when current build cannot be resolved', async () => {
    vi.mocked(resolvePob2BuildsPath).mockReturnValue(null);

    const { mockServer, handlers } = createMockServer();
    registerPobTools(mockServer);
    const handler = handlers.get('poe2_pob_compare')!;

    const pobCode = createMinimalPobCode();

    const result = await handler({
      current: 'invalid-code',
      reference: pobCode,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Could not resolve current build');
  });

  it('returns isError when reference build cannot be resolved', async () => {
    vi.mocked(resolvePob2BuildsPath).mockReturnValue(null);

    const { mockServer, handlers } = createMockServer();
    registerPobTools(mockServer);
    const handler = handlers.get('poe2_pob_compare')!;

    const pobCode = createMinimalPobCode();

    const result = await handler({
      current: pobCode,
      reference: 'invalid-code',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Could not resolve reference build');
  });

  it('shows item differences in comparison output', async () => {
    vi.mocked(resolvePob2BuildsPath).mockReturnValue(null);

    const currentXml = `
<PathOfBuilding>
  <Build className="Witch" ascendClassName="Necromancer" level="90"></Build>
  <Items>
    <Slot name="Helmet" itemId="1"/>
    <Item id="1">
Rarity: Rare
Old Helm
Iron Hat
Item Level: 50
Armour: 50
Implicits: 0
+10 to Life
    </Item>
  </Items>
  <Skills></Skills>
  <Tree activeSpec="1"><Spec treeVersion="0.4"><URL></URL></Spec></Tree>
  <Config></Config>
  <Notes></Notes>
</PathOfBuilding>`;

    const refXml = `
<PathOfBuilding>
  <Build className="Witch" ascendClassName="Necromancer" level="90"></Build>
  <Items>
    <Slot name="Helmet" itemId="1"/>
    <Item id="1">
Rarity: Rare
New Helm
Steel Helm
Item Level: 80
Armour: 150
Implicits: 0
+50 to Life
    </Item>
  </Items>
  <Skills></Skills>
  <Tree activeSpec="1"><Spec treeVersion="0.4"><URL></URL></Spec></Tree>
  <Config></Config>
  <Notes></Notes>
</PathOfBuilding>`;

    const currentCode = deflateSync(Buffer.from(currentXml, 'utf-8'))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const refCode = deflateSync(Buffer.from(refXml, 'utf-8'))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const { mockServer, handlers } = createMockServer();
    registerPobTools(mockServer);
    const handler = handlers.get('poe2_pob_compare')!;

    const result = await handler({ current: currentCode, reference: refCode });

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('Item Differences');
    expect(result.content[0]?.text).toContain('Upgrades needed');
    expect(result.content[0]?.text).toContain('Helmet');
  });
});
