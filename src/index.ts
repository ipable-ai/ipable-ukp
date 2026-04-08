#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { IPableAPI } from "./api.js";

const API_KEY = process.env.IPABLE_API_KEY || "";
const BASE_URL = process.env.IPABLE_BASE_URL;

if (!API_KEY) {
  console.error("[ipable-mcp] ❌ IPABLE_API_KEY environment variable is required");
  process.exit(1);
}

const api = new IPableAPI(API_KEY, BASE_URL);

const server = new Server(
  { name: "ipable-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

// ── Tool Definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "ipable_chat",
    description: "Ask the IPable AI about patents. It will query a 12M+ node knowledge graph and return analysis. Use this for any patent-related question.",
    inputSchema: {
      type: "object" as const,
      properties: {
        message: { type: "string", description: "Your question about patents, companies, inventors, or IP landscapes" },
      },
      required: ["message"],
    },
  },
  {
    name: "ipable_find_similar_patents",
    description: "Find patents similar to a target patent by shared citation overlap (both patent and article citations).",
    inputSchema: {
      type: "object" as const,
      properties: {
        publication_number: { type: "string", description: "Patent publication number, e.g. US-12448682-B2" },
        limit: { type: "number", description: "Max results (default 5)" },
      },
      required: ["publication_number"],
    },
  },
  {
    name: "ipable_company_overview",
    description: "Get a complete overview of a company's patent portfolio: total patents, families, research intensity, tech areas, times cited.",
    inputSchema: {
      type: "object" as const,
      properties: {
        company_name: { type: "string", description: "Company name, e.g. Samsung, Google, Toyota" },
      },
      required: ["company_name"],
    },
  },
  {
    name: "ipable_company_tech_portfolio",
    description: "Get the technology distribution (IPC classes) for a company's patent portfolio.",
    inputSchema: {
      type: "object" as const,
      properties: {
        company_name: { type: "string", description: "Company name" },
      },
      required: ["company_name"],
    },
  },
  {
    name: "ipable_market_concentration",
    description: "Analyze competitive landscape — top companies by patent count in a technology domain with market share percentages.",
    inputSchema: {
      type: "object" as const,
      properties: {
        tech_domain: { type: "string", description: "IPC code prefix, e.g. G06N for AI, H01L for semiconductors. Leave empty for all domains." },
      },
    },
  },
  {
    name: "ipable_fto_risk",
    description: "Assess Freedom-to-Operate risk for a technology domain — crowdedness score, risk level, and blocking patents.",
    inputSchema: {
      type: "object" as const,
      properties: {
        tech_domain: { type: "string", description: "IPC code prefix, e.g. G06N, H01L, A61K" },
      },
      required: ["tech_domain"],
    },
  },
  {
    name: "ipable_research_intensity",
    description: "Rank companies by research intensity — how many academic articles they cite per patent. Classifies as Deep Research, Research-Driven, or Engineering-Focused.",
    inputSchema: {
      type: "object" as const,
      properties: {
        min_patents: { type: "number", description: "Minimum patent threshold (default 20)" },
      },
    },
  },
  {
    name: "ipable_cross_domain",
    description: "Find companies bridging two technology domains by shared research citations.",
    inputSchema: {
      type: "object" as const,
      properties: {
        source_domain: { type: "string", description: "Source IPC code, e.g. C12N (biotech)" },
        target_domain: { type: "string", description: "Target IPC code, e.g. G06N (AI)" },
      },
      required: ["source_domain", "target_domain"],
    },
  },
  {
    name: "ipable_graph_stats",
    description: "Get overall knowledge graph statistics: total patents, articles, inventors, assignees, families, authors.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "ipable_ipc_distribution",
    description: "Get patent distribution across IPC technology classes.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Number of top classes to return (default 15)" },
      },
    },
  },
];

// ── List Tools ──────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// ── Call Tool ───────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    let result: any;

    switch (name) {
      case "ipable_chat":
        result = await api.chat(args.message as string);
        return {
          content: [
            { type: "text", text: result.response || "No response" },
            ...(result.tool_result ? [{ type: "text", text: `\n\nStructured data:\n${JSON.stringify(result.tool_result, null, 2)}` }] : []),
          ],
        };

      case "ipable_find_similar_patents":
        result = await api.findSimilarByCitations(args.publication_number as string, (args.limit as number) || 5);
        break;

      case "ipable_company_overview":
        result = await api.companyOverview(args.company_name as string);
        break;

      case "ipable_company_tech_portfolio":
        result = await api.companyTechPortfolio(args.company_name as string);
        break;

      case "ipable_market_concentration":
        result = await api.marketConcentration(args.tech_domain as string);
        break;

      case "ipable_fto_risk": {
        const [risk, blockers] = await Promise.all([
          api.ftoRisk(args.tech_domain as string),
          api.blockingPatents(args.tech_domain as string),
        ]);
        result = { risk_assessment: risk, blocking_patents: blockers };
        break;
      }

      case "ipable_research_intensity":
        result = await api.researchIntensity((args.min_patents as number) || 20);
        break;

      case "ipable_cross_domain":
        result = await api.crossDomain(args.source_domain as string, args.target_domain as string);
        break;

      case "ipable_graph_stats":
        result = await api.graphStats();
        break;

      case "ipable_ipc_distribution":
        result = await api.ipcDistribution((args.limit as number) || 15);
        break;

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };

  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// ── Start Server ────────────────────────────────────────────────────────────

async function main() {
  console.error("[ipable-mcp] ℹ️  Starting IPable MCP Server v0.1.0");
  console.error(`[ipable-mcp] ℹ️  API: ${BASE_URL || "default (Cloud Run)"}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[ipable-mcp] ✅ Server ready");
}

main().catch((error) => {
  console.error("[ipable-mcp] ❌ Fatal error:", error);
  process.exit(1);
});
