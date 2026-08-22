interface Env {
  ALLOWED_ORIGIN: string;
  GITHUB_APP_CLIENT_ID: string;
  GITHUB_APP_CLIENT_SECRET: string;
}

type GitHubProfile = { login: string; avatarUrl: string | null };
type RelaySession = { accessToken: string; expiresAt: string | null; repository: string | null; profile: GitHubProfile };
type StateRecord = { issuedAt: number; returnTo: string };

const SESSION_HEADER = "X-SwarLipi-Session";
const MAX_ENCRYPTED_ENVELOPE_BYTES = 1_000_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function json(value: unknown, env: Env, status = 200, extraHeaders: HeadersInit = {}) {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("Access-Control-Allow-Origin", env.ALLOWED_ORIGIN);
  headers.set("Access-Control-Allow-Headers", `Content-Type, ${SESSION_HEADER}`);
  headers.set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  headers.set("Vary", "Origin");
  return new Response(JSON.stringify(value), { status, headers });
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64Url(bytes);
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeJson(value: unknown) {
  return base64Url(encoder.encode(JSON.stringify(value)));
}

function decodeJson<T>(value: string) {
  return JSON.parse(decoder.decode(base64UrlBytes(value))) as T;
}

async function deriveKey(secret: string, purpose: string, algorithm: "AES-GCM" | "HMAC") {
  const material = await crypto.subtle.digest("SHA-256", encoder.encode(`${purpose}:${secret}`));
  return crypto.subtle.importKey("raw", material, { name: algorithm, hash: algorithm === "HMAC" ? "SHA-256" : undefined }, false, algorithm === "HMAC" ? ["sign", "verify"] : ["encrypt", "decrypt"]);
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function signState(record: StateRecord, env: Env) {
  const body = encodeJson(record);
  const key = await deriveKey(env.GITHUB_APP_CLIENT_SECRET, "swarlipi-github-oauth-state", "HMAC");
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${base64Url(new Uint8Array(signature))}`;
}

async function verifyState(value: string, env: Env): Promise<StateRecord | null> {
  const [body, signature] = value.split(".");
  if (!body || !signature) return null;
  const key = await deriveKey(env.GITHUB_APP_CLIENT_SECRET, "swarlipi-github-oauth-state", "HMAC");
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  const received = base64UrlBytes(signature);
  if (!timingSafeEqual(expected, received)) return null;
  try {
    const parsed = decodeJson<StateRecord>(body);
    return Date.now() - parsed.issuedAt <= 10 * 60 * 1000 ? parsed : null;
  } catch {
    return null;
  }
}

async function encryptSession(session: RelaySession, env: Env) {
  const key = await deriveKey(env.GITHUB_APP_CLIENT_SECRET, "swarlipi-github-relay-session", "AES-GCM");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(session)));
  return `v1.${base64Url(iv)}.${base64Url(new Uint8Array(ciphertext))}`;
}

async function decryptSession(value: string, env: Env): Promise<RelaySession | null> {
  const [version, ivText, ciphertextText] = value.split(".");
  if (version !== "v1" || !ivText || !ciphertextText) return null;
  try {
    const key = await deriveKey(env.GITHUB_APP_CLIENT_SECRET, "swarlipi-github-relay-session", "AES-GCM");
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64UrlBytes(ivText) }, key, base64UrlBytes(ciphertextText));
    const session = JSON.parse(decoder.decode(plaintext)) as RelaySession;
    if (!session.accessToken || !session.profile?.login) return null;
    if (session.expiresAt && Date.parse(session.expiresAt) <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

function validReturnUrl(value: string | null, allowedOrigin: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin === allowedOrigin ? `${url.origin}${url.pathname}${url.search}` : null;
  } catch {
    return null;
  }
}

async function githubJson(url: string, accessToken: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${accessToken}`, "User-Agent": "SwarLipi-Secure-Sync", "X-GitHub-Api-Version": "2022-11-28", ...(init.headers ?? {}) } });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function exchangeCode(code: string, callbackUrl: string, env: Env) {
  const response = await fetch("https://github.com/login/oauth/access_token", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.GITHUB_APP_CLIENT_ID, client_secret: env.GITHUB_APP_CLIENT_SECRET, code, redirect_uri: callbackUrl }).toString() });
  if (!response.ok) throw new Error("GitHub authorization could not be completed.");
  const payload = await response.json() as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error("GitHub did not return an access token.");
  return payload as { access_token: string; expires_in?: number };
}

async function startAuthorization(url: URL, env: Env) {
  const returnTo = validReturnUrl(url.searchParams.get("returnTo"), env.ALLOWED_ORIGIN);
  if (!returnTo) return json({ error: "A valid return address is required." }, env, 400);
  const record: StateRecord = { issuedAt: Date.now(), returnTo };
  const state = await signState(record, env);
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", env.GITHUB_APP_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", `${url.origin}/auth/github/callback`);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("prompt", "select_account");
  return new Response(null, { status: 302, headers: { Location: authorize.toString(), "Cache-Control": "no-store" } });
}

async function finishAuthorization(request: Request, url: URL, env: Env) {
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !code) return new Response("GitHub authorization could not be verified. Please return to SwarLipi and try again.", { status: 400 });
  const stateRecord = await verifyState(state, env);
  if (!stateRecord) return new Response("This GitHub connection request expired. Please return to SwarLipi and try again.", { status: 400 });
  try {
    const token = await exchangeCode(code, `${url.origin}/auth/github/callback`, env);
    const user = await githubJson("https://api.github.com/user", token.access_token);
    if (!user.response.ok || typeof user.payload.login !== "string") {
      const detail = typeof user.payload?.message === "string" ? `: ${user.payload.message}` : "";
      const acceptedPermissions = user.response.headers.get("X-Accepted-GitHub-Permissions");
      const required = acceptedPermissions ? `; required permission: ${acceptedPermissions}` : "";
      throw new Error(`GitHub profile lookup failed (${user.response.status})${detail}${required}`);
    }
    const session = await encryptSession({ accessToken: token.access_token, expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null, repository: null, profile: { login: user.payload.login, avatarUrl: typeof user.payload.avatar_url === "string" ? user.payload.avatar_url : null } }, env);
    const callback = new URL(stateRecord.returnTo);
    callback.hash = new URLSearchParams({ githubBackup: "connected", relaySession: session }).toString();
    return new Response(null, { status: 302, headers: { Location: callback.toString(), "Cache-Control": "no-store" } });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "GitHub authorization failed.", { status: 502 });
  }
}

async function getSession(request: Request, env: Env) {
  const encrypted = request.headers.get(SESSION_HEADER);
  if (!encrypted) return null;
  return decryptSession(encrypted, env);
}

async function connectionStatus(request: Request, env: Env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "Your GitHub session has expired. Sign in again to continue." }, env, 401);
  return json({ connected: true, expiresAt: session.expiresAt, repository: session.repository, profile: session.profile }, env);
}

async function selectRepository(request: Request, env: Env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "Connect GitHub before choosing a backup repository." }, env, 401);
  const body = await request.json().catch(() => null) as { repository?: string } | null;
  const repository = body?.repository?.trim();
  if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) return json({ error: "Use repository format owner/repository." }, env, 400);
  const { response, payload } = await githubJson(`https://api.github.com/repos/${repository}`, session.accessToken);
  if (!response.ok || !payload.private) return json({ error: "Choose a private repository that this GitHub App can access." }, env, 403);
  return json({ repository, session: await encryptSession({ ...session, repository }, env) }, env);
}

async function uploadLatestBackup(request: Request, env: Env) {
  const session = await getSession(request, env);
  if (!session?.repository) return json({ error: "Choose a private backup repository before uploading." }, env, 401);
  const encryptedEnvelope = await request.text();
  if (!encryptedEnvelope || encoder.encode(encryptedEnvelope).byteLength > MAX_ENCRYPTED_ENVELOPE_BYTES) return json({ error: "The encrypted backup is too large for this safe snapshot endpoint." }, env, 413);
  try { JSON.parse(encryptedEnvelope); } catch { return json({ error: "The backup must be a valid encrypted SwarLipi envelope." }, env, 400); }
  const contentUrl = `https://api.github.com/repos/${session.repository}/contents/latest.swarlipi.enc`;
  const existing = await githubJson(contentUrl, session.accessToken);
  const update = await githubJson(contentUrl, session.accessToken, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: `SwarLipi encrypted backup ${new Date().toISOString()}`, content: btoa(encryptedEnvelope), ...(existing.response.ok && typeof existing.payload.sha === "string" ? { sha: existing.payload.sha } : {}) }) });
  if (!update.response.ok) return json({ error: "GitHub did not accept the encrypted backup." }, env, 502);
  return json({ repository: session.repository, updatedAt: new Date().toISOString() }, env);
}

async function downloadLatestBackup(request: Request, env: Env) {
  const session = await getSession(request, env);
  if (!session?.repository) return json({ error: "Choose a private backup repository before restoring." }, env, 401);
  const result = await githubJson(`https://api.github.com/repos/${session.repository}/contents/latest.swarlipi.enc`, session.accessToken);
  if (!result.response.ok || result.payload.encoding !== "base64" || typeof result.payload.content !== "string") return json({ error: "No encrypted SwarLipi backup was found in this repository yet." }, env, 404);
  try { return json(JSON.parse(atob(result.payload.content.replace(/\s/g, ""))), env); } catch { return json({ error: "The encrypted backup in this repository is not valid SwarLipi data." }, env, 502); }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return json({ ok: true }, env, 204);
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true }, env);
    if (request.method === "GET" && url.pathname === "/auth/github/start") return startAuthorization(url, env);
    if (request.method === "GET" && url.pathname === "/auth/github/callback") return finishAuthorization(request, url, env);
    if (request.method === "GET" && url.pathname === "/connection") return connectionStatus(request, env);
    if (request.method === "POST" && url.pathname === "/connection/repository") return selectRepository(request, env);
    if (request.method === "POST" && url.pathname === "/backup/latest") return uploadLatestBackup(request, env);
    if (request.method === "GET" && url.pathname === "/backup/latest") return downloadLatestBackup(request, env);
    if (request.method === "DELETE" && url.pathname === "/connection") return json({ disconnected: true }, env);
    return json({ error: "Not found." }, env, 404);
  },
};
