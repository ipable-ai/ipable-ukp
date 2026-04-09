# IPable MCP Server

Connect your AI assistant to a patent knowledge graph with 11M+ patents.

Ask patent questions directly inside Claude, Cursor, Windsurf, or any AI tool that supports MCP.

---

## What Can You Do With This?

Once set up, you can ask your AI things like:

- "Who are the top patent holders in AI?"
- "Give me Samsung's patent portfolio overview"
- "What's the FTO risk for semiconductors?"
- "Find patents similar to US-12448682-B2"
- "Which companies bridge biotech and AI research?"

The AI will query the IPable patent database and return real data.

---

## Prerequisites

You need **Node.js** installed on your computer.

- **Check if you have it:** Open a terminal and type `node --version`. If you see a version number (like `v20.x.x`), you're good.
- **If not installed:** Download it from [nodejs.org](https://nodejs.org) — pick the LTS version, install it, done.

That's the only prerequisite. The MCP server downloads automatically the first time you use it.

---

## Setup (2 steps)

### Step 1: Get Your API Key

1. Go to [app.ipable.ai](https://app.ipable.ai)
2. Create an account (or sign in with Google)
3. Click your **avatar** → opens your **Profile** page
4. Scroll to **API Keys** → click **"+ Create API Key"**
5. Type a name like "Claude" and press Enter
6. **Copy the key now** — it starts with `ipable_` and won't be shown again

### Step 2: Add to Your AI Tool

Pick your tool below. Replace `YOUR_KEY` with the key you copied in Step 1.

---

### Claude Desktop (Mac/Windows app)

1. Open this file:
   - **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

2. Paste this (replace `YOUR_KEY`):

```json
{
  "mcpServers": {
    "ipable": {
      "command": "npx",
      "args": ["-y", "@ipable/mcp"],
      "env": {
        "IPABLE_API_KEY": "YOUR_KEY"
      }
    }
  }
}
```

3. **Quit Claude Desktop completely** (Cmd+Q on Mac) and reopen it

4. Look for the 🔨 hammer icon at the bottom of the chat — click it to see IPable tools

5. Try: "Use IPable to show me the patent database stats"

---

### Claude Code (Terminal / VS Code)

1. Open `~/.claude/settings.json` (create it if it doesn't exist)

2. Paste this (replace `YOUR_KEY`):

```json
{
  "mcpServers": {
    "ipable": {
      "command": "npx",
      "args": ["-y", "@ipable/mcp"],
      "env": {
        "IPABLE_API_KEY": "YOUR_KEY"
      }
    }
  }
}
```

3. Restart Claude Code

---

### Cursor

1. Create `.cursor/mcp.json` in your project folder

2. Paste this (replace `YOUR_KEY`):

```json
{
  "mcpServers": {
    "ipable": {
      "command": "npx",
      "args": ["-y", "@ipable/mcp"],
      "env": {
        "IPABLE_API_KEY": "YOUR_KEY"
      }
    }
  }
}
```

3. Restart Cursor

---

### Windsurf

1. Open `~/.codeium/windsurf/mcp_config.json`

2. Paste the same config as above (replace `YOUR_KEY`)

3. Restart Windsurf

---

## Available Tools

| When you ask about... | Tool used | What you get |
|---|---|---|
| Top companies in a tech area | `ipable_market_concentration` | Ranked list with patent counts and market share |
| A company's patent portfolio | `ipable_company_overview` | Total patents, families, R&D intensity |
| What tech a company focuses on | `ipable_company_tech_portfolio` | IPC class breakdown |
| Similar patents | `ipable_find_similar_patents` | Patents sharing the most citations |
| How crowded a patent space is | `ipable_fto_risk` | Risk level + blocking patents |
| R&D-heavy companies | `ipable_research_intensity` | Companies ranked by citations per patent |
| Companies bridging two fields | `ipable_cross_domain` | Cross-domain convergence |
| Database size | `ipable_graph_stats` | Total patents, articles, inventors |
| Patent distribution | `ipable_ipc_distribution` | Patents per IPC class |
| Anything else | `ipable_chat` | Free-form AI query |

---

## Example Conversations

**You:** "Who dominates the wireless patent space?"
→ AI returns Samsung, Huawei, Qualcomm with patent counts and market share

**You:** "Give me Apple's patent portfolio"
→ AI returns 6,961 patents, 24 tech areas, research intensity 0.8

**You:** "Is it risky to file patents in AI?"
→ AI returns LOW risk, 30K+ assignees, 2.7 patents per company

---

## Your Queries Sync to IPable

Every MCP query automatically appears in your IPable web app at [app.ipable.ai](https://app.ipable.ai) under **"External Queries"**. You can view, move, duplicate, or share results from there.

---

## Troubleshooting

**Tools not showing up:**
- Make sure Node.js is installed (`node --version` in terminal)
- Quit and fully relaunch your AI tool (Cmd+Q, not just close)
- Check your JSON config for syntax errors at [jsonlint.com](https://jsonlint.com)
- First launch takes 10-20 seconds as npm downloads the package

**Invalid API key:**
- Create a new key at app.ipable.ai → Profile → API Keys
- Make sure no extra spaces around the key

**No results:**
- Try rephrasing the question
- Use company names as they appear in patents (e.g., "SAMSUNG ELECTRONICS CO LTD")

---

## How It Works

```
You ask a question in your AI tool
  ↓
AI calls the IPable MCP server (runs locally on your machine)
  ↓
MCP server sends the request to the IPable API (over internet)
  ↓
API queries a Neo4j graph with 11M+ patents
  ↓
Results come back to your AI
```

Nothing is stored on your machine. Your queries sync to your IPable web account.

---

## Links

- Website: [ipable.ai](https://ipable.ai)
- App: [app.ipable.ai](https://app.ipable.ai)
- GitHub: [github.com/PatentMuse/ipable-ukp](https://github.com/PatentMuse/ipable-ukp)

MIT License — [IPable](https://ipable.ai)
