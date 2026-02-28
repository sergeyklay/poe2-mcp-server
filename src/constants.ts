/**
 * Project-wide constants.
 * Single source of truth for values shared across tools and services.
 *
 * Update DEFAULT_LEAGUE each league rotation.
 */

import { z } from 'zod';

/** Current active PoE2 challenge league. Update each league rotation. */
export const DEFAULT_LEAGUE = 'Dawn of the Hunt';

/** Shared Zod schema for the league parameter used by all tools. */
export const LeagueSchema = z
  .string()
  .default(DEFAULT_LEAGUE)
  .describe(
    `PoE2 league name. Current challenge league: "${DEFAULT_LEAGUE}". ` +
      `Previous leagues: "Fate of the Vaal", "Rise of the Abyssal". ` +
      `Permanent leagues: "Standard", "Hardcore". ` +
      `Hardcore variants: "HC ${DEFAULT_LEAGUE}".`,
  );
