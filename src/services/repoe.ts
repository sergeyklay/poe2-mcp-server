import { fetchJson } from './http.js';

// ─── RePoE data exports ────────────────────────────────────────────────

const REPOE_BASE = 'https://repoe-fork.github.io/poe2';

/**
 * Fetch datamined gem data from RePoE.
 */
export async function getRepoGems(): Promise<Record<string, unknown>> {
  return fetchJson<Record<string, unknown>>(`${REPOE_BASE}/gems.json`);
}

/**
 * Fetch datamined base items from RePoE.
 */
export async function getRepoBaseItems(): Promise<Record<string, unknown>> {
  return fetchJson<Record<string, unknown>>(`${REPOE_BASE}/base_items.json`);
}
