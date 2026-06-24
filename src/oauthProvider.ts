/**
 * OAuth 2.1 provider for the remote IPable MCP — backed ONLY by the Firebase
 * project's Firestore + the existing IPable API keys (no third-party vendor).
 *
 * This satisfies claude.ai web "custom connector" auth:
 *   - Dynamic Client Registration  -> Firestore `mcp_oauth_clients`
 *   - /authorize  -> a consent page where the user pastes their IPable API key
 *   - /token (PKCE) -> issues an access+refresh token mapped to that API key
 *   - verifyAccessToken -> resolves the token back to the API key for backend calls
 *
 * Interim "easiest" login = API-key paste. (A later phase can swap /authorize for
 * Firebase Google sign-in without changing the token/verify plumbing.)
 *
 * Collections (all under the same Firestore the backend uses):
 *   api_keys/{sha256(key)}        (EXISTING) -> { uid, name, revoked? }
 *   mcp_oauth_clients/{client_id} -> registered DCR clients
 *   mcp_oauth_codes/{code}        -> short-lived authorization codes
 *   mcp_oauth_tokens/{token}      -> access tokens -> { apiKey, uid, ... }
 *   mcp_oauth_refresh/{token}     -> refresh tokens -> { apiKey, uid, ... }
 */
import crypto from "crypto";
import { Response } from "express";
import { Firestore } from "@google-cloud/firestore";
import { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { InvalidGrantError, InvalidTokenError, ServerError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { OAuthClientInformationFull, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "patentmuse-kg-dev";
// ignoreUndefinedProperties: DCR client objects carry many optional fields that
// are undefined; Firestore rejects undefined values unless told to skip them.
const db = new Firestore({ projectId: PROJECT_ID, ignoreUndefinedProperties: true });

const ACCESS_TOKEN_TTL = 60 * 60;          // 1h
const CODE_TTL_MS = 10 * 60 * 1000;        // 10m
const nowSec = () => Math.floor(Date.now() / 1000);
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const randToken = () => crypto.randomBytes(32).toString("base64url");

/** Validate a pasted IPable API key against the EXISTING api_keys collection. */
async function resolveApiKey(rawKey: string): Promise<{ uid: string } | null> {
  if (!rawKey || !rawKey.startsWith("ipable_")) return null;
  const snap = await db.collection("api_keys").doc(sha256(rawKey)).get();
  if (!snap.exists) return null;
  const data = snap.data() as any;
  if (data.revoked) return null;
  return { uid: data.uid || "unknown" };
}

class FirestoreClientsStore implements OAuthRegisteredClientsStore {
  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    const snap = await db.collection("mcp_oauth_clients").doc(clientId).get();
    return snap.exists ? (snap.data() as OAuthClientInformationFull) : undefined;
  }
  async registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">
  ): Promise<OAuthClientInformationFull> {
    const client_id = "ipable_client_" + crypto.randomBytes(16).toString("hex");
    const full: OAuthClientInformationFull = {
      ...client,
      client_id,
      client_id_issued_at: nowSec(),
    };
    try {
      await db.collection("mcp_oauth_clients").doc(client_id).set(full);
    } catch (e) {
      console.error("[oauth] registerClient Firestore write failed:", e);
      throw e;
    }
    return full;
  }
}

function consentPage(params: {
  clientId: string; clientName?: string; redirectUri: string;
  codeChallenge: string; state?: string; scope?: string; resource?: string;
  error?: string;
}): string {
  const f = (v?: string) => (v ? v.replace(/"/g, "&quot;") : "");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect to IPable</title><style>
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0f1115;color:#e8eaed;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{background:#1a1d24;border:1px solid #2a2f3a;border-radius:14px;padding:32px;max-width:420px;width:90%}
h1{font-size:20px;margin:0 0 6px}p{color:#9aa0ab;font-size:14px;line-height:1.5}
label{display:block;font-size:13px;margin:18px 0 6px;color:#c7ccd4}
input{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:8px;border:1px solid #2a2f3a;background:#0f1115;color:#e8eaed;font-size:14px}
button{margin-top:20px;width:100%;padding:12px;border:0;border-radius:8px;background:#3b82f6;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
.err{background:#3a1d1d;border:1px solid #6b2b2b;color:#ffb4b4;padding:10px;border-radius:8px;font-size:13px;margin-top:14px}
.muted{font-size:12px;color:#6b7280;margin-top:16px}</style></head>
<body><div class="card">
<h1>Connect ${f(params.clientName) || "an application"} to IPable</h1>
<p>Authorize access to your IPable Patent Intelligence account. Paste your IPable API key (starts with <code>ipable_</code>) to continue.</p>
${params.error ? `<div class="err">${f(params.error)}</div>` : ""}
<form method="post" action="/oauth/approve">
<label>IPable API key</label>
<input name="api_key" type="password" placeholder="ipable_..." autocomplete="off" autofocus required />
<input type="hidden" name="client_id" value="${f(params.clientId)}"/>
<input type="hidden" name="redirect_uri" value="${f(params.redirectUri)}"/>
<input type="hidden" name="code_challenge" value="${f(params.codeChallenge)}"/>
<input type="hidden" name="state" value="${f(params.state)}"/>
<input type="hidden" name="scope" value="${f(params.scope)}"/>
<input type="hidden" name="resource" value="${f(params.resource)}"/>
<button type="submit">Authorize</button>
</form>
<p class="muted">Don't have a key? Create one in your IPable dashboard, then return here.</p>
</div></body></html>`;
}

export const provider: OAuthServerProvider = {
  clientsStore: new FirestoreClientsStore(),

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    // Render the consent page; the form POSTs to /oauth/approve (handled in http.ts).
    res.set("Content-Type", "text/html").send(consentPage({
      clientId: client.client_id,
      clientName: client.client_name,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      state: params.state,
      scope: (params.scopes || []).join(" "),
      resource: params.resource?.toString(),
    }));
  },

  async challengeForAuthorizationCode(_client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    const snap = await db.collection("mcp_oauth_codes").doc(authorizationCode).get();
    if (!snap.exists) throw new InvalidGrantError("Invalid authorization code");
    return (snap.data() as any).code_challenge;
  },

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull, authorizationCode: string,
    _codeVerifier?: string, _redirectUri?: string, resource?: URL
  ): Promise<OAuthTokens> {
    const ref = db.collection("mcp_oauth_codes").doc(authorizationCode);
    const snap = await ref.get();
    if (!snap.exists) throw new InvalidGrantError("Invalid authorization code");
    const code = snap.data() as any;
    if (code.client_id !== client.client_id) throw new InvalidGrantError("Code was issued to a different client");
    if (Date.now() > code.expires_at_ms) { await ref.delete(); throw new InvalidGrantError("Authorization code expired"); }
    await ref.delete(); // single-use

    const access_token = randToken();
    const refresh_token = randToken();
    const expiresAt = nowSec() + ACCESS_TOKEN_TTL;
    const common = { apiKey: code.api_key, uid: code.uid, clientId: client.client_id, scopes: code.scopes || [] };
    await db.collection("mcp_oauth_tokens").doc(access_token).set({ ...common, expiresAt, resource: resource?.toString() || code.resource || null });
    await db.collection("mcp_oauth_refresh").doc(refresh_token).set({ ...common });
    return {
      access_token, token_type: "bearer", expires_in: ACCESS_TOKEN_TTL,
      scope: (code.scopes || []).join(" ") || undefined, refresh_token,
    };
  },

  async exchangeRefreshToken(
    client: OAuthClientInformationFull, refreshToken: string, scopes?: string[]
  ): Promise<OAuthTokens> {
    const snap = await db.collection("mcp_oauth_refresh").doc(refreshToken).get();
    if (!snap.exists) throw new InvalidGrantError("Invalid refresh token");
    const r = snap.data() as any;
    if (r.clientId !== client.client_id) throw new InvalidGrantError("Refresh token was issued to a different client");
    const access_token = randToken();
    const expiresAt = nowSec() + ACCESS_TOKEN_TTL;
    const grantScopes = scopes && scopes.length ? scopes : (r.scopes || []);
    await db.collection("mcp_oauth_tokens").doc(access_token).set({
      apiKey: r.apiKey, uid: r.uid, clientId: client.client_id, scopes: grantScopes, expiresAt,
    });
    return {
      access_token, token_type: "bearer", expires_in: ACCESS_TOKEN_TTL,
      scope: grantScopes.join(" ") || undefined, refresh_token: refreshToken,
    };
  },

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    // Direct path for non-OAuth clients (Cursor/Desktop): a raw IPable API key
    // passed as the bearer token. Lets one verifier serve both client types.
    if (token.startsWith("ipable_")) {
      const resolved = await resolveApiKey(token);
      if (!resolved) throw new InvalidTokenError("Invalid API key");
      return { token, clientId: "direct-api-key", scopes: [], extra: { apiKey: token, uid: resolved.uid } };
    }
    // OAuth access token (claude.ai web etc.)
    const snap = await db.collection("mcp_oauth_tokens").doc(token).get();
    if (!snap.exists) throw new InvalidTokenError("Invalid access token");
    const t = snap.data() as any;
    if (t.expiresAt && nowSec() > t.expiresAt) throw new InvalidTokenError("Access token expired");
    return {
      token, clientId: t.clientId, scopes: t.scopes || [], expiresAt: t.expiresAt,
      extra: { apiKey: t.apiKey, uid: t.uid },
    };
  },
};

/**
 * Handles the consent-form POST (/oauth/approve): validate the pasted API key,
 * mint a single-use authorization code, and redirect back to the client.
 * Returns a redirect URL (success or error) for the route to 302 to.
 */
export async function approveConsent(body: Record<string, string>): Promise<{ redirect: string } | { html: string }> {
  const { api_key, client_id, redirect_uri, code_challenge, state, scope, resource } = body;
  const client = await provider.clientsStore.getClient(client_id);
  if (!client) return { html: consentPage({ clientId: client_id, redirectUri: redirect_uri, codeChallenge: code_challenge, state, scope, resource, error: "Unknown client. Please reconnect from your AI app." }) };
  if (!client.redirect_uris.includes(redirect_uri)) {
    return { html: consentPage({ clientId: client_id, redirectUri: redirect_uri, codeChallenge: code_challenge, state, scope, resource, error: "Redirect URI mismatch." }) };
  }
  const resolved = await resolveApiKey((api_key || "").trim());
  if (!resolved) {
    return { html: consentPage({ clientId: client_id, clientName: client.client_name, redirectUri: redirect_uri, codeChallenge: code_challenge, state, scope, resource, error: "That API key is invalid or revoked. Check it and try again." }) };
  }
  const code = randToken();
  await db.collection("mcp_oauth_codes").doc(code).set({
    client_id, redirect_uri, code_challenge,
    scopes: scope ? scope.split(" ").filter(Boolean) : [],
    resource: resource || null,
    api_key: (api_key || "").trim(), uid: resolved.uid,
    expires_at_ms: Date.now() + CODE_TTL_MS,
  });
  const u = new URL(redirect_uri);
  u.searchParams.set("code", code);
  if (state) u.searchParams.set("state", state);
  return { redirect: u.toString() };
}

export { ServerError };
