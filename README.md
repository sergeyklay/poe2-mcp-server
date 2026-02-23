# poe2-mcp-server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that gives LLMs real-time access to Path of Exile 2 game data: currency exchange rates, item prices, wiki content, datamined game information, and ladder meta-build statistics.

All data is sourced from **public APIs only**. No API keys, no GGG OAuth registration, no accounts required.

## Tools

| Tool                   | Description                                           | Source                                    |
| ---------------------- | ----------------------------------------------------- | ----------------------------------------- |
| `poe2_currency_prices` | Current exchange rates for all currencies             | [poe.ninja](https://poe.ninja/poe2)       |
| `poe2_currency_check`  | Look up a specific currency by name                   | [poe.ninja](https://poe.ninja/poe2)       |
| `poe2_item_price`      | Price check items across exchange categories          | [poe.ninja](https://poe.ninja/poe2)       |
| `poe2_exchange_top`    | Most valuable items by exchange category              | [poe.ninja](https://poe.ninja/poe2)       |
| `poe2_wiki_search`     | Search the PoE 2 community wiki                       | [poe2wiki.net](https://www.poe2wiki.net/) |
| `poe2_wiki_page`       | Retrieve full wiki article content                    | [poe2wiki.net](https://www.poe2wiki.net/) |
| `poe2_db_lookup`       | Datamined game data: gems, mods, items, translations  | [poe2db.tw](https://poe2db.tw/)           |
| `poe2_meta_builds`     | Ladder class distribution with percentages and trends | [poe.ninja](https://poe.ninja/poe2)       |
| `poe2_log_summary`     | Parse local game logs: zones, sessions, player events | Local logs                                |

## Requirements

- Node.js ≥ 22
- npm

## Installation

```bash
git clone https://github.com/sergeyklay/poe2-mcp-server.git
cd poe2-mcp-server
npm install
npm run build
```

## Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "poe2": {
      "command": "node",
      "args": ["/absolute/path/to/poe2-mcp-server/dist/index.js"]
    }
  }
}
```

> **Windows users:** Use double backslashes or forward slashes in the path:
>
> ```json
> "args": ["C:\\absolute\\path\\to\\poe2-mcp-server\\dist\\index.js"]
> ```
>
> To open the config file quickly, press `Win + R` and run:
>
> ```
> notepad %APPDATA%\Claude\claude_desktop_config.json
> ```

Config file locations:

- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

Restart Claude Desktop after editing the config.

#### Custom Game Installation Path

If PoE2 is installed in a non-standard location (e.g., a different drive), add the `--poe2-path` argument. This enables the `poe2_log_summary` tool to find your game logs:

```json
{
  "mcpServers": {
    "poe2": {
      "command": "node",
      "args": [
        "C:\\path\\to\\poe2-mcp-server\\dist\\index.js",
        "--poe2-path",
        "D:\\Games\\Path of Exile 2"
      ]
    }
  }
}
```

Replace `D:\\Games\\Path of Exile 2` with your actual installation directory.

### Claude Code

```bash
claude mcp add poe2 node /absolute/path/to/poe2-mcp-server/dist/index.js
```

With custom game path:

```bash
claude mcp add poe2 node /path/to/poe2-mcp-server/dist/index.js --poe2-path "/path/to/Path of Exile 2"
```

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Example Prompts

Once connected, try asking:

- _"How much is an Exalted Orb worth right now?"_
- _"What are the top 10 most valuable items in the Currency exchange?"_
- _"Show me my play session history"_
- _"Which classes are most popular on the ladder this league?"_
- _"Look up Essence Drain on poe2db"_
- _"What's the French name for Chaos Bolt?"_ → uses `poe2_db_lookup` with `lang="fr"`

### Example Conversation

**User:**

```plaintext
I'm 42 lvl at Act 3 and I just dropped a Divine Orb.
How much is it worth, what should I buy with it?
```

**Claude:**

```plaintext
Let me check the current price of a Divine Orb for you.

Nice drop! A Divine Orb is currently worth about 27.5 Chaos Orbs in Fate of the Vaal league,
and it's one of the more valuable currency drops you can get during the campaign.

Don't spend it yet. At level 42 in Act 3, you're still in the leveling phase — any gear you buy
now will be replaced within a few levels. The standard advice for your stage is:

- Divine Orbs are used to reroll the values of explicit modifiers on items — that's an endgame
  activity, not something useful during the campaign.
- If you really want to trade it, you could sell it for ~27 Chaos Orbs and use those later at endgame
  to buy specific gear upgrades for your Lich build once you've finished the campaign and know exactly
  what you need.

Stash it and keep pushing through Act 3. It'll be much more valuable to you at endgame than anything
you could buy with it right now.
```

---

**User:**

```plaintext
I'm stuck on this quest boss... keeps killing me. Is this normal?
```

**Claude:**

```plaintext
Looking at your logs — you're in the Trial of Chaos (zone level 38) and you've died twice to the
boss already. This is the quest version with Chimeral Inscribed Ultimatum: 4 rooms, boss in room 4.

Yes, this is normal and happens to many players! Here's why:

The boss in room 4 is one of three random encounters: Uxmal (Chimera), Chetza (Bird with blood
attacks), or Bahlak (Three-headed bird with lightning). All of them hit hard, especially against
energy shield builds.

The key thing to know: your quest key doesn't drop on death. It returns to you, so you can retry
as many times as you need.

Tips to get through:

1. ...
2. ...
   ...
```

### Example System Prompt (Claude Projects)

This system prompt can be used with any MCP-compatible agent (Claude Desktop, Claude Projects, etc.) to create a PoE2 coach that automatically uses the MCP tools.

<details>
<summary>Click to expand full system prompt</summary>

```markdown
# Path of Exile 2 Coach

## Role

You are a knowledgeable Path of Exile 2 coach. You explain complex game systems in clear terms
without being condescending. Communicate in the user's language.

## Tool Usage Protocol

You have access to a PoE 2 MCP server with tools for: game logs, wiki, datamined game database
(poe2db), currency prices, item prices, and meta build stats. These tools are your PRIMARY data
source for everything PoE 2 related.

For EVERY user message about gameplay, follow this sequence BEFORE responding:

1. **Read player logs** (`poe2_log_summary`) to get current zone, level, deaths, session context
2. **Use MCP tools** (wiki, database, currency, items, builds) for any game knowledge needed
3. **Fall back to web search** ONLY if MCP tools didn't have the answer
4. **Respond** to the user with all context already gathered

## Gather Context, Don't Ask

NEVER ask the user for information you can obtain from tools:

- "What level are you?" → read the logs
- "What zone are you in?" → read the logs
- "How many times did you die?" → read the logs
- "What does skill X do?" → use `poe2_wiki_search` or `poe2_db_lookup`
- "How much does Y cost?" → use `poe2_currency_check` or `poe2_item_price`
- "What builds are popular?" → use `poe2_meta_builds`

Only ask the user for things no tool can provide: screenshots of gear, personal preferences.

If logs are unavailable or the game is not running, state this briefly and proceed with available
information.

## Localization Support

If the player uses a non-English game client:

1. Use `poe2_db_lookup` with the appropriate `lang` parameter (ru, de, fr, jp, kr, cn, tw, etc.)
2. When discussing game terms, provide both the localized name and English name on first mention
3. NEVER guess translations — always verify via the database

## Examples

### User asks for help without context

**User:** "What should I do next?"

**Correct behavior:**

1. Call `poe2_log_summary` → determine current zone and level
2. Look up relevant game mechanics via `poe2_db_lookup` or `poe2_wiki_search`
3. Respond with specific, actionable steps based on actual player state

**Wrong:** Ask "What zone are you in?" when logs have this information.

### User asks about game mechanics

**User:** "What is Contagion?"

**Correct behavior:**

1. Look up Contagion via `poe2_db_lookup` for exact mechanics
2. If player uses localized client, also fetch the translated name
3. Explain with both names so player can match it in their game

**Wrong:** Guess at mechanics without looking up current data.

### User asks about economy

**User:** "Is this item valuable?"

**Correct behavior:**

1. Use `poe2_item_price` to check current market value
2. Use `poe2_currency_check` for currency conversions if needed
3. Give a clear verdict with current prices

**Wrong:** Give outdated price estimates from training data.

## Response Guidelines

- Keep responses focused and actionable
- For item comparisons: give a clear verdict, then explain why
- For "what do I do?" questions: numbered steps, priority order
- Always end guidance with the single most important next action
```

</details>

## Supported Leagues

Default league: **Fate of the Vaal** (patch 0.4.x). Any active PoE2 league can be passed by name:

| League          | Name (case-sensitive)  |
| --------------- | ---------------------- |
| Softcore Trade  | `Fate of the Vaal`     |
| Hardcore        | `HC Fate of the Vaal`  |
| Solo Self-Found | `SSF Fate of the Vaal` |
| Permanent       | `Standard`             |

## Architecture

```
poe2-mcp-server/
├── src/
│   ├── index.ts              # Entry point: server init, stdio transport
│   ├── services/
│   │   └── api.ts            # HTTP client, rate limiter, logs parsing
│   └── tools/
│       ├── currency.ts       # Currency exchange rate tools
│       ├── items.ts          # Exchange item price tools
│       ├── wiki.ts           # Wiki search & poe2db lookup
│       ├── builds.ts         # Meta build overview
│       └── logfile.ts        # Local logs parser
├── dist/                     # Compiled output (npm run build)
├── package.json
├── tsconfig.json
└── README.md
```

### Data Sources

| Source                                                   | Auth | Rate Limit         | Update Frequency |
| -------------------------------------------------------- | ---- | ------------------ | ---------------- |
| [poe.ninja](https://poe.ninja/poe2) PoE2 Exchange API    | None | ~12 req / 5 min    | ~1 hour          |
| [poe.ninja](https://poe.ninja/poe2) PoE2 Build Index API | None | ~12 req / 5 min    | ~1 hour          |
| [poe2wiki.net](https://www.poe2wiki.net/) MediaWiki API  | None | Standard MW limits | Community-driven |
| [poe2db.tw](https://poe2db.tw/)                          | None | Reasonable use     | Each patch       |
| Local `Client.txt` / `LatestClient.txt`                  | None | N/A (local file)   | Real-time        |

A built-in rate limiter ensures poe.ninja limits are respected automatically.

## Development

```bash
npm run dev      # Watch mode: recompiles on file changes
npm run build    # One-time build
npm start        # Run the server (stdio)
```

### Adding a New Tool

1. Create a file in `src/tools/`
2. Export a `register*Tools(server: McpServer)` function
3. Import and call it in `src/index.ts`
4. Rebuild: `npm run build`

## License

MIT

## Disclaimer

This product isn't affiliated with or endorsed by Grinding Gear Games in any way.

Path of Exile is a registered trademark of Grinding Gear Games. All game content and materials are trademarks and copyrights of their respective owners.
