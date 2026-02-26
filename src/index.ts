#!/usr/bin/env node

/**
 * poe2-mcp-server — MCP server for Path of Exile 2 public data.
 *
 * Provides tools for:
 *  - Currency exchange rates (poe.ninja)
 *  - Item / unique prices (poe.ninja)
 *  - Wiki search (poe2wiki.net)
 *  - Game database lookup (poe2db.tw)
 *  - Meta build overview (poe.ninja builds)
 *  - Local logs parsing (Client.txt/LatestClient.txt)
 *
 * All data comes from public APIs — no GGG OAuth registration required.
 * Designed for use with Claude Desktop via stdio transport.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerCurrencyTools } from './tools/currency.js';
import { registerItemTools } from './tools/items.js';
import { registerWikiTools } from './tools/wiki.js';
import { registerBuildTools } from './tools/builds.js';
import { registerLogfileTools } from './tools/logfile.js';
import { registerPobTools } from './tools/pob.js';

/**
 * Parse CLI arguments for --poe2-path.
 * @returns PoE2 installation path if provided, undefined otherwise.
 */
function parsePoe2Path(): string | undefined {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--poe2-path');
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return undefined;
}

/**
 * Parse CLI arguments for --pob2-path.
 * @returns PoB2 Builds directory path if provided, undefined otherwise.
 */
function parsePob2Path(): string | undefined {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--pob2-path');
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return undefined;
}

async function main(): Promise<void> {
  const poe2Path = parsePoe2Path();
  const pob2Path = parsePob2Path();

  const server = new McpServer({
    name: 'poe2-mcp-server',
    version: '1.0.0',
  });

  // Register all tool groups
  registerCurrencyTools(server);
  registerItemTools(server);
  registerWikiTools(server);
  registerBuildTools(server);
  registerLogfileTools(server, { poe2InstallPath: poe2Path });
  registerPobTools(server, { pob2BuildsPath: pob2Path });

  // Use stdio transport for Claude Desktop integration
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is reserved for MCP JSON-RPC)
  console.error('poe2-mcp-server started (stdio transport)');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
