# IPable MCP Server

MCP server for [IPable](https://ipable.ai) — query a patent knowledge graph with 11M+ patents from any MCP-compatible AI tool.

Works with Claude Code, Cursor, Windsurf, Cline, and any tool that supports the [Model Context Protocol](https://modelcontextprotocol.io).

## Quick Start

### 1. Get an API Key

Sign up at [app.ipable.ai](https://app.ipable.ai), go to **Profile → API Keys → Create API Key**.

### 2. Connect to Your AI Tool

**Claude Code (CLI):**
```bash
claude mcp add ipable -- npx -y ipable-mcp
# Then set your key:
# IPABLE_API_KEY=ipable_xxxxx
```

**Claude Code (VS Code extension) — `~/.claude/settings.json`:**
```json
{
  "mcpServers": {
    "ipable": {
      "command": "npx",
      "args": ["-y", "ipable-mcp"],
      "env": {
        "IPABLE_API_KEY": "ipable_your_key_here"
      }
    }
  }
}
```

**Cursor — `.cursor/mcp.json`:**
```json
{
  "mcpServers": {
    "ipable": {
      "command": "npx",
      "args": ["-y", "ipable-mcp"],
      "env": {
        "IPABLE_API_KEY": "ipable_your_key_here"
      }
    }
  }
}
```

**Windsurf — `~/.codeium/windsurf/mcp_config.json`:**
```json
{
  "mcpServers": {
    "ipable": {
      "command": "npx",
      "args": ["-y", "ipable-mcp"],
      "env": {
        "IPABLE_API_KEY": "ipable_your_key_here"
      }
    }
  }
}
```

### 3. Ask Questions

Once connected, your AI can query the patent knowledge graph:

```
"Find patents similar to US-12448682-B2 by citation overlap"
"Give me Samsung's patent portfolio overview"
"What's the FTO risk for AI/ML patents (IPC G06N)?"
"Which companies bridge biotech and AI research?"
"Show me the top 10 companies in semiconductor patents"
"Rank companies by research intensity"
```

## Available Tools

| Tool | Description | Example Input |
|------|-------------|---------------|
| `ipable_chat` | Free-form patent question — AI queries the graph | "How many battery patents does Toyota have?" |
| `ipable_find_similar_patents` | Patents sharing citation overlap | `publication_number: "US-12448682-B2"` |
| `ipable_company_overview` | Portfolio summary: patents, families, R&D intensity | `company_name: "Samsung"` |
| `ipable_company_tech_portfolio` | IPC class distribution for a company | `company_name: "Google"` |
| `ipable_market_concentration` | Top players + market share in a tech domain | `tech_domain: "G06N"` |
| `ipable_fto_risk` | FTO risk level + blocking patents | `tech_domain: "H01L"` |
| `ipable_research_intensity` | Companies ranked by academic citations/patent | `min_patents: 20` |
| `ipable_cross_domain` | Companies bridging two tech domains | `source: "C12N", target: "G06N"` |
| `ipable_graph_stats` | Knowledge graph node counts | — |
| `ipable_ipc_distribution` | Patent count by IPC class | `limit: 15` |

## Knowledge Graph

The IPable knowledge graph contains:

| Entity | Count |
|--------|-------|
| Patents | 11.6M+ |
| Patent Families | 3.5M+ |
| Inventors | 2.2M+ |
| Assignees (Companies) | 660K+ |
| Academic Articles | 389K+ |
| Authors | 185K+ |

Data sourced from public patent registries. Updated periodically.

## How It Works

```
Your AI Tool (Claude, Cursor, etc.)
  ↓ MCP protocol (local stdio)
ipable-mcp (runs on your machine)
  ↓ HTTPS (X-API-Key auth)
IPable Cloud API
  ↓
Neo4j Knowledge Graph + Gemini AI
```

The MCP server runs locally as a subprocess of your AI tool. It translates MCP tool calls into API requests to the IPable backend. No data leaves your machine except the API calls — your conversations stay private.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `IPABLE_API_KEY` | Yes | — | Your IPable API key (get it from app.ipable.ai) |
| `IPABLE_BASE_URL` | No | Production API | Override API endpoint (for self-hosted deployments) |

## Development

```bash
git clone https://github.com/PatentMuse/ipable-mcp.git
cd ipable-mcp
npm install
npm run build
IPABLE_API_KEY=your_key npm start
```

## Troubleshooting

**"Invalid API key"** — Create a new key at app.ipable.ai → Profile → API Keys.

**"Connection refused"** — Check your internet connection. The MCP server needs to reach the IPable API.

**Tools not showing up** — Restart your AI tool after adding the MCP config. Some tools require a full restart.

## License

MIT — [IPable](https://ipable.ai)
