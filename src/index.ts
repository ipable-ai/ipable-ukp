#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { IPableAPI } from "./api.js";

const BASE_URL = process.env.IPABLE_BASE_URL;

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
  // Claim Element Analysis
  {
    name: "ipable_claim_elements",
    description: "PREFERRED for viewing how a patent claim is decomposed into atomic limitations. Returns structured breakdown: each limitation with its type (structural, functional, method_step, etc.), clause type (body, wherein), and normalized text. Use when user asks 'what does this patent claim?', 'show me the claim elements', 'break down this claim'.",
    inputSchema: {
      type: "object" as const,
      properties: {
        publication_number: { type: "string", description: "Patent publication number, e.g. US-12213393-B2" },
      },
      required: ["publication_number"],
    },
  },
  {
    name: "ipable_obviousness_check",
    description: "PREFERRED for obviousness analysis (§103). Finds the minimum combination of prior art patents whose claim limitations collectively cover all limitations of a target claim. Returns: covered vs novel limitations, prior art references with element-by-element attribution, and an obvious/not-obvious verdict. Use when user asks 'is this claim obvious?', 'can this patent be invalidated?', 'prior art combination for this claim'.",
    inputSchema: {
      type: "object" as const,
      properties: {
        publication_number: { type: "string", description: "Patent publication number" },
        claim_number: { type: "number", description: "Claim number to check (default: first independent claim)" },
      },
      required: ["publication_number"],
    },
  },
  {
    name: "ipable_claim_overlap",
    description: "Find patents that share similar claim limitations with a target patent. Shows which specific limitations overlap and their similarity scores. Use when user asks 'which patents overlap with this one?', 'find similar claims', 'who claims similar things?'.",
    inputSchema: {
      type: "object" as const,
      properties: {
        publication_number: { type: "string", description: "Patent publication number" },
        min_score: { type: "number", description: "Minimum similarity score 0-1 (default 0.85)" },
      },
      required: ["publication_number"],
    },
  },
  {
    name: "ipable_novel_elements",
    description: "Find claim limitations that are unique to a patent — no similar limitation exists in any other patent in the database. Use for novelty assessment: 'what's novel in this patent?', 'which elements are unique?', 'novelty check'.",
    inputSchema: {
      type: "object" as const,
      properties: {
        publication_number: { type: "string", description: "Patent publication number" },
      },
      required: ["publication_number"],
    },
  },
  {
    name: "ipable_element_landscape",
    description: "Show the most commonly claimed limitations across all patents in a technology domain. Reveals what's crowded vs where white space exists. Use when user asks 'what do people claim in semiconductor patents?', 'most common claim elements in AI', 'claim landscape for telecom'.",
    inputSchema: {
      type: "object" as const,
      properties: {
        tech_domain: { type: "string", description: "IPC code prefix, e.g. G06N, H01L, A61K" },
        limit: { type: "number", description: "Number of results (default 30)" },
      },
      required: ["tech_domain"],
    },
  },
  {
    name: "ipable_search_claim",
    description: "Search for existing patents with similar claim limitations to a user-provided claim text. The claim is split into limitations, embedded with PatentSBERTa, and searched against the database. Use when user pastes a claim and asks 'is this already claimed?', 'find prior art for my claim', 'does my invention overlap with existing patents?'.",
    inputSchema: {
      type: "object" as const,
      properties: {
        claim_text: { type: "string", description: "Full claim text to search against the database" },
        min_score: { type: "number", description: "Minimum similarity score 0-1 (default 0.7)" },
      },
      required: ["claim_text"],
    },
  },
  // Technology Communities (Clusters) — Leiden community detection over H02P motor-control patents
  {
    name: "ipable_classify_patent",
    description: "PREFERRED for classifying a patent into its discovered technology community. Uses Leiden community detection clusters (NOT IPC codes) to show which motor-control technology group a patent belongs to. Coverage: H02P subclass, US+WO only (55,994 patents). Returns cluster levels with names. Use when user asks 'what technology is this patent?', 'classify this patent', 'which cluster?'.",
    inputSchema: {
      type: "object" as const,
      properties: {
        publication_number: { type: "string", description: "Patent publication number, e.g. US-12448682-B2" },
      },
      required: ["publication_number"],
    },
  },
  {
    name: "ipable_classify_patent_from_features",
    description: "Inductively classify an UNSEEN / not-yet-indexed patent (e.g. a draft application, a brand-new filing, or any patent outside the 55,994 indexed set) into a motor-control technology community from its CONTENT. Embeds the supplied text with the same E5 model the clusters were built from, finds the nearest INDEXED candidate patents (restricted to the 55,994 reps the clusters live on), and assigns by the v4 graph weights (3.0*backward-citation + 0.6*abstract-similarity). Returns `top_clusters`: the 5 most likely technology communities each with a confidence share, plus supporting evidence patents — or abstains (cluster=null, reason 'out_of_distribution'/'weak_support') when nothing fits. On a temporal holdout the correct cluster is rank-1 ~59% and within top-5 ~94% of the time. title+abstract required; citations optional and strengthen the result; claims/ipc accepted but not scored. Use this (NOT ipable_classify_patent) when the patent is not already in the graph or when the user provides the patent's text rather than a publication number.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Patent title" },
        abstract: { type: "string", description: "Patent abstract (required for a reliable result)" },
        claims: { type: "array", items: { type: "string" }, description: "Optional: independent claim or limitation texts — sharpens the result" },
        ipc: { type: "array", items: { type: "string" }, description: "Optional: IPC codes, e.g. ['H02P21/00'] — used to bias toward technically aligned clusters" },
        citations: { type: "array", items: { type: "string" }, description: "Optional: backward-cited publication numbers — adds a citation-neighborhood signal" },
      },
      required: ["title", "abstract"],
    },
  },
  {
    name: "ipable_find_technology",
    description: "Search for technology communities by keyword. Returns matching named technology groups from the 26 motor-control clusters. Use when user asks 'is there a cluster for X?', 'find technologies related to X'.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Keyword to search, e.g. 'steering', 'reluctance', 'inverter'" },
      },
      required: ["query"],
    },
  },
  {
    name: "ipable_list_technologies",
    description: "List all 26 named technology communities (motor-control taxonomy). Shows the full technology landscape with patent counts. Use when user asks 'what technologies exist?', 'show me all clusters', 'technology taxonomy'.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "ipable_cluster_patents",
    description: "Get patents belonging to a specific technology community, newest first. Use when user asks 'show patents in X technology', 'recent patents in vector control'.",
    inputSchema: {
      type: "object" as const,
      properties: {
        technology: { type: "string", description: "Technology name or partial match, e.g. 'Vector Control', 'Steering'" },
        limit: { type: "number", description: "Max results (default 20, max 100)" },
      },
      required: ["technology"],
    },
  },
  {
    name: "ipable_cluster_prior_art",
    description: "Find prior art for a patent using technology community co-membership and abstract similarity. Returns same-cluster patents ranked by semantic similarity. More targeted than citation-based search. Use when user asks 'find prior art using clusters', 'similar patents in same technology'.",
    inputSchema: {
      type: "object" as const,
      properties: {
        publication_number: { type: "string", description: "Patent publication number" },
        limit: { type: "number", description: "Max results (default 10, max 100)" },
      },
      required: ["publication_number"],
    },
  },
  {
    name: "ipable_assignee_landscape",
    description: "Top patent holders in a specific technology community. Shows who dominates a discovered technology cluster (different from IPC-based market concentration). Use when user asks 'who leads in vector control?', 'top companies in motor control technology X'.",
    inputSchema: {
      type: "object" as const,
      properties: {
        technology: { type: "string", description: "Technology name or partial match" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
      required: ["technology"],
    },
  },
  {
    name: "ipable_technology_flow",
    description: "Cross-technology citation flow — which technology communities cite each other. Shows knowledge flow between discovered clusters. Use for 'how do technologies relate?', 'citation flow for X', 'which technologies build on X?'.",
    inputSchema: {
      type: "object" as const,
      properties: {
        technology: { type: "string", description: "Technology name or partial match" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
      required: ["technology"],
    },
  },
  {
    name: "ipable_technology_timeline",
    description: "Filing-year histogram for a technology community — shows when a technology emerged and its trend over time. Use for 'when did X start?', 'is X growing?', 'technology trend for X'.",
    inputSchema: {
      type: "object" as const,
      properties: {
        technology: { type: "string", description: "Technology name or partial match" },
      },
      required: ["technology"],
    },
  },
  {
    name: "ipable_ipc_vs_cluster",
    description: "Compare a patent's IPC classification with its discovered technology community. Shows how the data-driven clustering differs from the official IPC taxonomy. This is a key differentiator. Use for 'how does IPC compare to clusters for this patent?', 'IPC vs discovered technology'.",
    inputSchema: {
      type: "object" as const,
      properties: {
        publication_number: { type: "string", description: "Patent publication number" },
      },
      required: ["publication_number"],
    },
  },
  {
    name: "ipable_similar_limitations",
    description: "Find similar claim limitations via pre-computed graph similarity edges. Given a specific limitation element_id, returns similar limitations from other patents with similarity scores. Use for fine-grained claim-level prior art search.",
    inputSchema: {
      type: "object" as const,
      properties: {
        element_id: { type: "string", description: "Limitation element_id, e.g. 'US-12448682-B2::1::3'" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["element_id"],
    },
  },
  // Subscriptions — track technology clusters
  {
    name: "ipable_subscribe",
    description: "Subscribe to a technology cluster to track it. Use when the user says 'subscribe to X', 'track X', 'follow X technology'. Resolves the technology name to its cluster ID automatically.",
    inputSchema: {
      type: "object" as const,
      properties: {
        technology: { type: "string", description: "Technology name or keyword, e.g. 'Electric Power Steering', 'vector control'" },
      },
      required: ["technology"],
    },
  },
  {
    name: "ipable_unsubscribe",
    description: "Unsubscribe from a technology cluster. Use when the user says 'unsubscribe from X', 'stop tracking X'.",
    inputSchema: {
      type: "object" as const,
      properties: {
        technology: { type: "string", description: "Technology name or keyword" },
      },
      required: ["technology"],
    },
  },
  {
    name: "ipable_my_subscriptions",
    description: "List all technology clusters the user is subscribed to. Use when the user asks 'what am I tracking?', 'my subscriptions', 'show my clusters'.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "ipable_check_alerts",
    description: "Check for new patents in all subscribed technology clusters since the last check. Returns new patents grouped by cluster with filing dates, titles, and assignees. Use when the user asks 'any new patents?', 'check my alerts', 'what's new in my clusters?', 'show me updates'.",
    inputSchema: {
      type: "object" as const,
      properties: {},
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

// ── Server factory — shared by the stdio (local) and HTTP (remote) entries ───
// `api` is supplied per caller so the remote server can be multi-tenant (each
// request authenticates with its own API key).
export function createServer(api: IPableAPI): Server {
  const server = new Server(
    { name: "ipable-mcp", version: "0.5.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

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

      case "ipable_claim_elements":
        result = await api.claimElements(args.publication_number as string);
        break;

      case "ipable_obviousness_check":
        result = await api.obviousnessCheck(args.publication_number as string, (args.claim_number as number) || 1);
        break;

      case "ipable_claim_overlap":
        result = await api.claimOverlap(args.publication_number as string, (args.min_score as number) || 0.85);
        break;

      case "ipable_novel_elements":
        result = await api.novelElements(args.publication_number as string);
        break;

      case "ipable_element_landscape":
        result = await api.elementLandscape(args.tech_domain as string, (args.limit as number) || 30);
        break;

      case "ipable_search_claim":
        result = await api.searchClaimElements(args.claim_text as string, (args.min_score as number) || 0.7);
        break;

      // Technology Communities (Clusters)
      case "ipable_classify_patent":
        result = await api.classifyPatent(args.publication_number as string);
        break;

      case "ipable_classify_patent_from_features":
        result = await api.classifyPatentFromFeatures({
          title: args.title as string,
          abstract: args.abstract as string,
          claims: args.claims as string[] | undefined,
          ipc: args.ipc as string[] | undefined,
          citations: args.citations as string[] | undefined,
        });
        break;

      case "ipable_find_technology":
        result = await api.findTechnology(args.query as string);
        break;

      case "ipable_list_technologies":
        result = await api.listTechnologies();
        break;

      case "ipable_cluster_patents":
        result = await api.clusterPatents(args.technology as string, (args.limit as number) || 20);
        break;

      case "ipable_cluster_prior_art":
        result = await api.clusterPriorArt(args.publication_number as string, (args.limit as number) || 10);
        break;

      case "ipable_assignee_landscape":
        result = await api.assigneeLandscape(args.technology as string, (args.limit as number) || 20);
        break;

      case "ipable_technology_flow":
        result = await api.technologyFlow(args.technology as string, (args.limit as number) || 20);
        break;

      case "ipable_technology_timeline":
        result = await api.technologyTimeline(args.technology as string);
        break;

      case "ipable_ipc_vs_cluster":
        result = await api.ipcVsCluster(args.publication_number as string);
        break;

      case "ipable_similar_limitations":
        result = await api.similarLimitations(args.element_id as string, (args.limit as number) || 10);
        break;

      // Subscriptions
      case "ipable_subscribe": {
        const techs = await api.findTechnology(args.technology as string);
        if (!techs || techs.length === 0) {
          result = { error: `No technology cluster found matching "${args.technology}". Use ipable_list_technologies to see all available clusters.` };
        } else {
          const cluster = techs[0];
          result = await api.subscribe(cluster.id, cluster.technology);
        }
        break;
      }

      case "ipable_unsubscribe": {
        const techs2 = await api.findTechnology(args.technology as string);
        if (!techs2 || techs2.length === 0) {
          result = { error: `No technology cluster found matching "${args.technology}".` };
        } else {
          result = await api.unsubscribe(String(techs2[0].id));
        }
        break;
      }

      case "ipable_my_subscriptions":
        result = await api.listSubscriptions();
        break;

      case "ipable_check_alerts":
        result = await api.checkAlerts();
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

// ── Resources ──────────────────────────────────────────────────────────────

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "ipable://taxonomy/motor-control-clusters",
        name: "Motor Control Technology Taxonomy",
        description:
          "All 26 technology communities discovered via Leiden community detection over 55,994 H02P motor-control patents (US+WO). Each cluster has an id, name, and patent count.",
        mimeType: "application/json",
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === "ipable://taxonomy/motor-control-clusters") {
    const taxonomy = await api.listTechnologies();
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(taxonomy, null, 2),
        },
      ],
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// ── Prompts ────────────────────────────────────────────────────────────────

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "discover-technology",
        description:
          "Discover which patent technology clusters match your work. Describe your technology and the AI will recommend relevant clusters to subscribe to.",
        arguments: [
          {
            name: "description",
            description: "Describe your technology, product, or research area in plain language",
            required: true,
          },
        ],
      },
      {
        name: "explore-technology",
        description:
          "Deep-dive into a technology cluster — see top patent holders, filing trends, recent patents, and cross-technology citation flow.",
        arguments: [
          {
            name: "technology",
            description: "Technology name or keyword, e.g. 'Electric Power Steering', 'vector control'",
            required: true,
          },
        ],
      },
    ],
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: promptArgs } = request.params;

  if (name === "discover-technology") {
    const description = promptArgs?.description || "my technology";
    const taxonomy = await api.listTechnologies();

    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Here is the full taxonomy of 26 motor-control technology clusters discovered via Leiden community detection over 55,994 H02P patents (US+WO):\n\n${JSON.stringify(taxonomy, null, 2)}`,
          },
        },
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `I work on: ${description}\n\nPlease analyze which of the 26 technology clusters above are most relevant to my work. For each match:\n1. Explain WHY it's relevant to what I described\n2. How many patents it contains\n3. Whether I should subscribe to track it\n\nAfter your analysis, offer to subscribe me to the clusters I'm interested in using the ipable_subscribe tool. Also offer to explore any cluster in more detail (top companies, trends, recent patents).`,
          },
        },
      ],
    };
  }

  if (name === "explore-technology") {
    const technology = promptArgs?.technology || "motor control";

    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `I want to explore the "${technology}" technology cluster. Please:\n1. Show me the top patent holders (use ipable_assignee_landscape)\n2. Show the filing trend over time (use ipable_technology_timeline)\n3. Show the 10 most recent patents (use ipable_cluster_patents with limit 10)\n4. Show which other technologies cite or are cited by this one (use ipable_technology_flow)\n\nSummarize the competitive landscape, growth trajectory, and key trends. Then ask if I'd like to subscribe to this technology.`,
          },
        },
      ],
    };
  }

    throw new Error(`Unknown prompt: ${name}`);
  });

  return server;
}

// ── stdio entry (local npm package) ──────────────────────────────────────────
async function main() {
  const API_KEY = process.env.IPABLE_API_KEY || "";
  if (!API_KEY) {
    console.error("[ipable-mcp] ❌ IPABLE_API_KEY environment variable is required");
    process.exit(1);
  }
  console.error("[ipable-mcp] ℹ️  Starting IPable MCP Server v0.5.0 (stdio)");
  console.error(`[ipable-mcp] ℹ️  API: ${BASE_URL || "default (Cloud Run)"}`);

  const api = new IPableAPI(API_KEY, BASE_URL);
  const server = createServer(api);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[ipable-mcp] ✅ Server ready");
}

// Only run the stdio server when this file is executed directly (npx / node),
// NOT when imported by the HTTP entry (http.ts). CommonJS main-detection.
if (require.main === module) {
  main().catch((error) => {
    console.error("[ipable-mcp] ❌ Fatal error:", error);
    process.exit(1);
  });
}
