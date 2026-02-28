import { fetchJson } from './http.js';

// ─── poe2wiki.net ──────────────────────────────────────────────────────

export interface WikiSearchResult {
  title: string;
  snippet: string;
  pageid: number;
}

/**
 * Search the PoE2 community wiki.
 */
export async function searchWiki(query: string): Promise<WikiSearchResult[]> {
  const url = `https://www.poe2wiki.net/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5`;
  const data = await fetchJson<{ query?: { search?: WikiSearchResult[] } }>(url);
  return data.query?.search ?? [];
}

/**
 * Get wiki page content by title.
 */
export async function getWikiPage(title: string): Promise<string> {
  const url = `https://www.poe2wiki.net/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json`;
  const data = await fetchJson<{ parse?: { wikitext?: { '*'?: string } } }>(url);
  return data.parse?.wikitext?.['*'] ?? '';
}
