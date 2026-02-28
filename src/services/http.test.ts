import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchJson } from './http.js';

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
