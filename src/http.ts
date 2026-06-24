/**
 * Remote / hosted IPable MCP server — Streamable HTTP transport + OAuth 2.1.
 *
 * Same tools/resources/prompts as the local stdio server (shared via createServer
 * in index.ts), exposed at POST /mcp.
 *
 * Auth — one verifier covers two client styles:
 *   - claude.ai web "custom connectors": full OAuth 2.1 (DCR + PKCE), implemented
 *     by mcpAuthRouter + our Firestore-backed provider (oauthProvider.ts). The
 *     user logs in by pasting their IPable API key on the /authorize consent page.
 *   - Cursor / Claude Desktop / agents: send the IPable API key directly as
 *     `Authorization: Bearer ipable_...` (verifyAccessToken handles it).
 *
 * Stateless Streamable HTTP so it scales horizontally on Cloud Run.
 */
import express, { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { IPableAPI } from "./api.js";
import { createServer } from "./index.js";
import { provider, approveConsent } from "./oauthProvider.js";

const BASE_URL = process.env.IPABLE_BASE_URL;
const PORT = parseInt(process.env.PORT || "8080", 10);
const PUBLIC_URL = process.env.PUBLIC_URL || "https://ipable-mcp-remote-780141866774.europe-west3.run.app";

const app = express();
// Cloud Run terminates TLS and forwards via exactly one proxy hop. Trust exactly
// 1 hop (not `true`, which express-rate-limit rejects as bypassable) so the SDK
// auth router's rate-limiter identifies clients by the real X-Forwarded-For IP.
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "ipable-mcp-remote", transport: "streamable-http", auth: "oauth2.1 + api-key" });
});

// ── OAuth 2.1 endpoints (metadata, DCR /register, /authorize, /token, /revoke) ──
// resourceServerUrl points at the actual protected resource (/mcp) so the
// protected-resource metadata is served at the same path the WWW-Authenticate
// header advertises (/.well-known/oauth-protected-resource/mcp).
app.use(mcpAuthRouter({
  provider,
  issuerUrl: new URL(PUBLIC_URL),
  resourceServerUrl: new URL(PUBLIC_URL + "/mcp"),
  resourceName: "IPable Patent Intelligence",
  scopesSupported: ["ipable"],
}));

// Consent-form submission from the /authorize page.
app.post("/oauth/approve", async (req: Request, res: Response) => {
  try {
    const result = await approveConsent(req.body || {});
    if ("redirect" in result) return res.redirect(302, result.redirect);
    return res.status(400).set("Content-Type", "text/html").send(result.html);
  } catch (err) {
    console.error("[ipable-mcp-remote] /oauth/approve error:", err);
    return res.status(500).send("Authorization failed. Please try again.");
  }
});

// ── MCP endpoint (protected) ──────────────────────────────────────────────────
const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(new URL(PUBLIC_URL + "/mcp"));
const bearer = requireBearerAuth({ verifier: provider, resourceMetadataUrl });

app.post("/mcp", bearer, async (req: Request, res: Response) => {
  const apiKey = (req.auth?.extra as any)?.apiKey as string | undefined;
  if (!apiKey) {
    res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "No API key resolved from token" }, id: null });
    return;
  }
  try {
    const api = new IPableAPI(apiKey, BASE_URL);
    const server = createServer(api);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[ipable-mcp-remote] request error:", err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
});

const methodNotAllowed = (_req: Request, res: Response) =>
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server — use POST /mcp)." }, id: null });
app.get("/mcp", methodNotAllowed);
app.delete("/mcp", methodNotAllowed);

app.listen(PORT, () => {
  console.error(`[ipable-mcp-remote] Streamable HTTP + OAuth listening on :${PORT}`);
  console.error(`[ipable-mcp-remote] public URL: ${PUBLIC_URL}`);
});
