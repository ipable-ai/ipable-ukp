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
  // Specific tools first — AI should prefer these over ipable_chat
  {
    name: "ipable_market_concentration",
    description: "PREFERRED for questions about top companies, market leaders, or who dominates a technology area. Returns ranked list of companies by patent count with market share percentages. Use when the user asks: 'top assignees in X', 'who has the most patents in X', 'market leaders in X', 'competitive landscape for X'. Requires an IPC code prefix like G06N (AI), G06F (computing), H01L (semiconductors), A61K (pharma), H04L (telecom), H04W (wireless), C12N (biotech).",
    inputSchema: {
      type: "object" as const,
      properties: {
        tech_domain: { type: "string", description: "IPC code prefix. Common ones: G06N=AI/ML, G06F=Computing, H01L=Semiconductors, A61K=Pharma, H04L=Digital Comm, H04W=Wireless, C12N=Genetic Eng. Leave empty for all domains." },
      },
    },
  },
  {
    name: "ipable_company_overview",
    description: "PREFERRED for questions about a specific company's patent portfolio. Returns total patents, patent families, research intensity, tech areas, and times cited. Use when the user mentions a company name and wants portfolio stats, overview, or profile.",
    inputSchema: {
      type: "object" as const,
      properties: {
        company_name: { type: "string", description: "Company name, e.g. Samsung, Google, Toyota, Apple, TSMC" },
      },
      required: ["company_name"],
    },
  },
  {
    name: "ipable_company_tech_portfolio",
    description: "PREFERRED for questions about what technologies a company focuses on. Returns IPC class distribution for a company's patents. Use when user asks 'what does X work on', 'X's technology focus', 'IPC classes for X'.",
    inputSchema: {
      type: "object" as const,
      properties: {
        company_name: { type: "string", description: "Company name" },
      },
      required: ["company_name"],
    },
  },
  {
    name: "ipable_find_similar_patents",
    description: "Find patents similar to a specific patent by shared citation overlap. Use when the user provides a patent publication number and wants to find related patents.",
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
    name: "ipable_fto_risk",
    description: "Assess Freedom-to-Operate risk for a technology domain. Returns crowdedness score, risk level (LOW/MEDIUM/HIGH/EXTREME), and blocking patents. Use when the user asks about FTO, patent risk, or how crowded a technology space is.",
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
    description: "Rank companies by how much academic research they cite per patent. Classifies companies as Deep Research (>30), Research-Driven (15-30), Moderate R&D (5-15), or Engineering-Focused (<5). Use for questions about R&D intensity, research-driven companies, or academic-industry links.",
    inputSchema: {
      type: "object" as const,
      properties: {
        min_patents: { type: "number", description: "Minimum patent threshold (default 20)" },
      },
    },
  },
  {
    name: "ipable_cross_domain",
    description: "Find companies that bridge two different technology domains through shared research citations. Use when user asks about cross-domain innovation, technology convergence, or companies working across fields.",
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
    description: "Get overall knowledge graph statistics: total patents, articles, inventors, assignees, families, authors. Use for general questions about the database size or 'how many patents'.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "ipable_ipc_distribution",
    description: "Get patent distribution across IPC technology classes with section names. Use for questions about technology landscape, patent distribution, or which fields have the most patents.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Number of top classes to return (default 15)" },
      },
    },
  },
  // Chat is LAST RESORT — only when no specific tool matches
  {
    name: "ipable_chat",
    description: "LAST RESORT — only use this when NO other IPable tool matches the question. Sends a free-form question to the IPable AI which generates a custom database query. Less reliable than the specific tools above. Prefer ipable_market_concentration, ipable_company_overview, ipable_graph_stats, etc.",
    inputSchema: {
      type: "object" as const,
      properties: {
        message: { type: "string", description: "Free-form patent question that doesn't match any specific tool" },
      },
      required: ["message"],
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
