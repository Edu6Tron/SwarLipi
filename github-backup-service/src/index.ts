interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

interface Env {
  ALLOWED_ORIGIN: string;
  GITHUB_APP_CLIENT_ID: string;
  GITHUB_APP_CLIENT_SECRET: string;
  CONNECTIONS: KVNamespace;
}

type StoredConnection = {
  accessToken: string;
  expiresAt: string | null;
  repository: string | null;
};

type StateRecord = { returnTo: string };

const SESSION_COOKIE = "swarlipi_backup_session";
const MAX_ENCRYPTED_ENVELOPE_BYTES = 1_000_000;

function json(value: unknown, env: Env, status = 200, extraHeaders: HeadersInit = {}) {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Access-Control-Allow-Origin", env.ALLOWED_ORIGIN);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Vary", "Origin");
  return new Response(JSON.stringify(value), { status, headers });
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function parseCookies(request: Request) {
  return Object.fromEntries(
    (request.headers.get("Cookie") ?? "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key]) => Boolean(key))
      .map(([key, ...value]) => [key, decodeURIComponent(value.join("="))]),
  );
}

function validReturnUrl(value: string | null, allowedOrigin: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin === allowedOrigin ? url.toString() : null;
  } catch {
    return null;
  }
}

async function getConnection(request: Request, env: Env): Promise<{ id: string; value: StoredConnection } | null> {
  const sessionId = parseCookies(request)[SESSION_COOKIE];
  if (!sessionId) return null;
  const raw = await env.CONNECTIONS.get(`session:${sessionId}`);
  if (!raw) return null;
  try {
    return { id: sessionId, value: JSON.parse(raw) as StoredConnection };
  } catch {
    return null;
  }
}

async function githubJson(url: string, accessToken: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function exchangeCode(code: string, env: Env) {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GITHUB_APP_CLIENT_ID, client_secret: env.GITHUB_APP_CLIENT_SECRET, code }).toString(),
  });
  if (!response.ok) throw new Error("GitHub authorization could not be completed.");
  const payload = await response.json() as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error("GitHub did not return an access token.");
  return payload as { access_token: string; expires_in?: number };
}

async function startAuthorization(url: URL, env: Env) {
  const returnTo = validReturnUrl(url.searchParams.get("returnTo"), env.ALLOWED_ORIGIN);
  if (!returnTo) return json({ error: "A valid return address is required." }, env, 400);
  const state = randomToken();
  await env.CONNECTIONS.put(`state:${state}`, JSON.stringify({ returnTo } satisfies StateRecord), { expirationTtl: 600 });
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", env.GITHUB_APP_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", `${url.origin}/auth/github/callback`);
  authorize.searchParams.set("state", state);
  return Response.redirect(authorize.toString(), 302);
}

async function finishAuthorization(url: URL, env: Env) {
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !code) return new Response("GitHub authorization did not return the required details.", { status: 400 });
  const stateRaw = await env.CONNECTIONS.get(`state:${state}`);
  await env.CONNECTIONS.delete(`state:${state}`);
  if (!stateRaw) return new Response("This GitHub connection request has expired. Please try again.", { status: 400 });
  const { returnTo } = JSON.parse(stateRaw) as StateRecord;
  try {
    const token = await exchangeCode(code, env);
    const sessionId = randomToken();
    const ttl = Math.max(300, token.expires_in ?? 28_800);
    const connection: StoredConnection = {
      accessToken: token.access_token,
      expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
      repository: null,
    };
    await env.CONNECTIONS.put(`session:${sessionId}`, JSON.stringify(connection), { expirationTtl: ttl });
    const callback = new URL(returnTo);
    callback.searchParams.set("githubBackup", "connected");
    return new Response(null, {
      status: 302,
      headers: {
        Location: callback.toString(),
        "Set-Cookie": `${SESSION_COOKIE}=${sessionId}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${ttl}`,
      },
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "GitHub authorization failed.", { status: 502 });
  }
}

async function selectRepository(request: Request, env: Env) {
  const connection = await getConnection(request, env);
  if (!connection) return json({ error: "Connect GitHub before choosing a backup repository." }, env, 401);
  const body = await request.json().catch(() => null) as { repository?: string } | null;
  const repository = body?.repository?.trim();
  if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) return json({ error: "Use repository format owner/repository." }, env, 400);
  const { response, payload } = await githubJson(`https://api.github.com/repos/${repository}`, connection.value.accessToken);
  if (!response.ok || !payload.private) return json({ error: "Choose a private repository that this GitHub App can access." }, env, 403);
  const next = { ...connection.value, repository };
  await env.CONNECTIONS.put(`session:${connection.id}`, JSON.stringify(next), { expirationTtl: 28_800 });
  return json({ repository, connected: true }, env);
}

async function uploadLatestBackup(request: Request, env: Env) {
  const connection = await getConnection(request, env);
  if (!connection?.value.repository) return json({ error: "Choose a private backup repository before uploading." }, env, 401);
  const encryptedEnvelope = await request.text();
  if (!encryptedEnvelope || new TextEncoder().encode(encryptedEnvelope).byteLength > MAX_ENCRYPTED_ENVELOPE_BYTES) {
    return json({ error: "The encrypted backup is too large for this safe snapshot endpoint." }, env, 413);
  }
  try {
    JSON.parse(encryptedEnvelope);
  } catch {
    return json({ error: "The backup must be a valid encrypted SwarLipi envelope." }, env, 400);
  }
  const contentUrl = `https://api.github.com/repos/${connection.value.repository}/contents/latest.swarlipi.enc`;
  const existing = await githubJson(contentUrl, connection.value.accessToken);
  const update = await githubJson(contentUrl, connection.value.accessToken, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `SwarLipi encrypted backup ${new Date().toISOString()}`,
      content: btoa(encryptedEnvelope),
      ...(existing.response.ok && typeof existing.payload.sha === "string" ? { sha: existing.payload.sha } : {}),
    }),
  });
  if (!update.response.ok) return json({ error: "GitHub did not accept the encrypted backup." }, env, 502);
  return json({ repository: connection.value.repository, updatedAt: new Date().toISOString() }, env);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return json({ ok: true }, env, 204, { "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true }, env);
    if (request.method === "GET" && url.pathname === "/auth/github/start") return startAuthorization(url, env);
    if (request.method === "GET" && url.pathname === "/auth/github/callback") return finishAuthorization(url, env);
    if (request.method === "POST" && url.pathname === "/connection/repository") return selectRepository(request, env);
    if (request.method === "POST" && url.pathname === "/backup/latest") return uploadLatestBackup(request, env);
    if (request.method === "DELETE" && url.pathname === "/connection") {
      const connection = await getConnection(request, env);
      if (connection) await env.CONNECTIONS.delete(`session:${connection.id}`);
      return json({ disconnected: true }, env, 200, { "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0` });
    }
    return json({ error: "Not found." }, env, 404);
  },
};
