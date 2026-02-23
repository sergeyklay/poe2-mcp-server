import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../services/api.js', () => ({
  searchWiki: vi.fn(),
  getWikiPage: vi.fn(),
  getPoe2dbPage: vi.fn(),
}));

import { searchWiki, getWikiPage, getPoe2dbPage } from '../services/api.js';
import { registerWikiTools } from './wiki.js';

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
  registerWikiTools(mockServer);
  return handlers;
}

describe('poe2_wiki_search', () => {
  let handler: ToolHandler;

  beforeEach(() => {
    vi.restoreAllMocks();
    handler = extractHandlers().get('poe2_wiki_search')!;
  });

  it('formats search results with links', async () => {
    vi.mocked(searchWiki).mockResolvedValue([
      {
        title: 'Fireball',
        snippet: 'A <b>fire</b> projectile skill',
        pageid: 1,
      },
    ]);

    const result = await handler({ query: 'Fireball' });

    expect(result.content[0]!.text).toContain('### Fireball');
    expect(result.content[0]!.text).toContain('A fire projectile skill');
    expect(result.content[0]!.text).toContain('poe2wiki.net/wiki/Fireball');
  });

  it('strips HTML tags from snippets', async () => {
    vi.mocked(searchWiki).mockResolvedValue([
      { title: 'X', snippet: "<span class='a'>text</span>", pageid: 1 },
    ]);

    const result = await handler({ query: 'X' });

    expect(result.content[0]!.text).not.toContain('<span');
    expect(result.content[0]!.text).toContain('text');
  });

  it('returns no-result message', async () => {
    vi.mocked(searchWiki).mockResolvedValue([]);

    const result = await handler({ query: 'zzzzz' });

    expect(result.content[0]!.text).toContain('No wiki articles found');
  });

  it('returns isError on failure', async () => {
    vi.mocked(searchWiki).mockRejectedValue(new Error('net err'));

    const result = await handler({ query: 'test' });

    expect(result.isError).toBe(true);
  });
});

describe('poe2_wiki_page', () => {
  let handler: ToolHandler;

  beforeEach(() => {
    vi.restoreAllMocks();
    handler = extractHandlers().get('poe2_wiki_page')!;
  });

  it('returns page content with header and link', async () => {
    vi.mocked(getWikiPage).mockResolvedValue('== Overview ==\nContent');

    const result = await handler({ title: 'Fireball' });

    expect(result.content[0]!.text).toContain('## Wiki: Fireball');
    expect(result.content[0]!.text).toContain('== Overview ==');
  });

  it('truncates long pages', async () => {
    vi.mocked(getWikiPage).mockResolvedValue('x'.repeat(10000));

    const result = await handler({ title: 'LongPage' });

    expect(result.content[0]!.text).toContain('[truncated');
  });

  it('returns not-found message for empty content', async () => {
    vi.mocked(getWikiPage).mockResolvedValue('');

    const result = await handler({ title: 'Missing' });

    expect(result.content[0]!.text).toContain('not found or empty');
  });
});

describe('poe2_db_lookup', () => {
  let handler: ToolHandler;

  beforeEach(() => {
    vi.restoreAllMocks();
    handler = extractHandlers().get('poe2_db_lookup')!;
  });

  it('strips HTML tags and dangerous elements', async () => {
    vi.mocked(getPoe2dbPage).mockResolvedValue(
      '<script>alert(1)</script><nav>nav</nav><div>useful data</div><style>.x{}</style>',
    );

    const result = await handler({ term: 'Fireball', lang: 'us' });

    expect(result.content[0]!.text).not.toContain('<script');
    expect(result.content[0]!.text).not.toContain('<nav');
    expect(result.content[0]!.text).not.toContain('<style');
    expect(result.content[0]!.text).toContain('useful data');
  });

  it('decodes HTML entities', async () => {
    vi.mocked(getPoe2dbPage).mockResolvedValue('<p>10 &amp; 20 &gt; 5 &lt; 30</p>');

    const result = await handler({ term: 'Test', lang: 'us' });

    expect(result.content[0]!.text).toContain('10 & 20 > 5 < 30');
  });

  it('truncates long content', async () => {
    vi.mocked(getPoe2dbPage).mockResolvedValue('<p>' + 'a'.repeat(8000) + '</p>');

    const result = await handler({ term: 'Big', lang: 'us' });

    expect(result.content[0]!.text).toContain('[truncated]');
  });

  it('returns isError on failure with Roman numeral tips', async () => {
    vi.mocked(getPoe2dbPage).mockRejectedValue(new Error('poe2db returned 404'));

    const result = await handler({ term: 'NoExist', lang: 'us' });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('poe2db returned 404');
    expect(result.content[0]!.text).toContain('Tips:');
    expect(result.content[0]!.text).toContain('Roman numerals');
    expect(result.content[0]!.text).toContain('Urgent_Totems_II');
    expect(result.content[0]!.text).toContain('rank suffix');
  });
});
