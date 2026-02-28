import { describe, it, expect } from 'vitest';
import {
  fetchJson,
  getNinjaExchangeOverview,
  getNinjaBuildIndex,
  getNinjaItemOverview,
  getPoe2dbPage,
  normalizeTrailingArabicToRoman,
  searchWiki,
  getWikiPage,
  decodeZoneCode,
  parseClientLog,
  decodePobCode,
  extractPobbinId,
  extractPoeNinjaId,
  fetchPobbinCode,
  fetchPoeNinjaCode,
  parseItemText,
  parsePobXml,
  comparePobBuilds,
  parsePoe2dbHtml,
  formatPoe2dbSections,
} from './api.js';

describe('api.ts barrel re-exports', () => {
  it.each([
    { name: 'fetchJson', value: fetchJson },
    { name: 'getNinjaExchangeOverview', value: getNinjaExchangeOverview },
    { name: 'getNinjaBuildIndex', value: getNinjaBuildIndex },
    { name: 'getNinjaItemOverview', value: getNinjaItemOverview },
    { name: 'getPoe2dbPage', value: getPoe2dbPage },
    { name: 'normalizeTrailingArabicToRoman', value: normalizeTrailingArabicToRoman },
    { name: 'searchWiki', value: searchWiki },
    { name: 'getWikiPage', value: getWikiPage },
    { name: 'decodeZoneCode', value: decodeZoneCode },
    { name: 'parseClientLog', value: parseClientLog },
    { name: 'decodePobCode', value: decodePobCode },
    { name: 'extractPobbinId', value: extractPobbinId },
    { name: 'extractPoeNinjaId', value: extractPoeNinjaId },
    { name: 'fetchPobbinCode', value: fetchPobbinCode },
    { name: 'fetchPoeNinjaCode', value: fetchPoeNinjaCode },
    { name: 'parseItemText', value: parseItemText },
    { name: 'parsePobXml', value: parsePobXml },
    { name: 'comparePobBuilds', value: comparePobBuilds },
    { name: 'parsePoe2dbHtml', value: parsePoe2dbHtml },
    { name: 'formatPoe2dbSections', value: formatPoe2dbSections },
  ])('re-exports $name as a function', ({ value }) => {
    expect(typeof value).toBe('function');
  });
});
