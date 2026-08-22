import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

import type { EncryptedBackupEnvelope } from "./github-backup";

const GITHUB_ACCOUNT_KEY = "swarlipi.github.account.v1";
const GITHUB_BACKUP_PATH = "latest.swarlipi.enc";
const DEFAULT_GITHUB_APP_CLIENT_ID = "Iv23li7xRW1HbwedSG4u";
const DEFAULT_GITHUB_APP_SLUG = "swarlipi-secure-sync-edu6tron";
const DEFAULT_GITHUB_RELAY_URL = "https://swarlipi-secure-sync.edutron78.workers.dev";

export interface GitHubProfile { login: string; avatarUrl: string | null; }
export interface GitHubSession {
  accessToken: string | null;
  expiresAt: string | null;
  repository: string | null;
  profile: GitHubProfile;
  keepSignedIn: boolean;
  relaySession?: boolean;
  relayToken?: string;
}
export interface GitHubDeviceCode { deviceCode: string; userCode: string; verificationUri: string; expiresAt: number; }

type DeviceCodeResponse = { device_code?: string; user_code?: string; verification_uri?: string; expires_in?: number; error?: string; error_description?: string };
type TokenResponse = { access_token?: string; expires_in?: number; error?: string; error_description?: string };
type RelayConnection = { connected?: boolean; expiresAt?: string | null; repository?: string | null; profile?: { login?: string; avatarUrl?: string | null }; session?: string; error?: string };

function getClientId() { return process.env.EXPO_PUBLIC_GITHUB_APP_CLIENT_ID?.trim() || DEFAULT_GITHUB_APP_CLIENT_ID; }
function getAppSlug() { return process.env.EXPO_PUBLIC_GITHUB_APP_SLUG?.trim() || DEFAULT_GITHUB_APP_SLUG; }
function getRelayServiceUrl() { return process.env.EXPO_PUBLIC_GITHUB_BACKUP_SERVICE_URL?.trim().replace(/\/+$/, "") || DEFAULT_GITHUB_RELAY_URL; }
export function isGitHubRelayConfigured() { return Platform.OS === "web" && Boolean(getRelayServiceUrl()); }

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function bytesToBase64(bytes: Uint8Array) {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    output += alphabet[first >> 2] + alphabet[((first & 3) << 4) | (second >> 4)] + (index + 1 < bytes.length ? alphabet[((second & 15) << 2) | (third >> 6)] : "=") + (index + 2 < bytes.length ? alphabet[third & 63] : "=");
  }
  return output;
}
function base64ToBytes(value: string) {
  const normalized = value.replace(/\s/g, "");
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  const bytes = new Uint8Array((normalized.length / 4) * 3 - padding);
  let outputIndex = 0;
  for (let index = 0; index < normalized.length; index += 4) {
    const chunk = normalized.slice(index, index + 4);
    const first = alphabet.indexOf(chunk[0]); const second = alphabet.indexOf(chunk[1]); const third = chunk[2] === "=" ? 0 : alphabet.indexOf(chunk[2]); const fourth = chunk[3] === "=" ? 0 : alphabet.indexOf(chunk[3]);
    if (first < 0 || second < 0 || third < 0 || fourth < 0) throw new Error("Invalid base64 content.");
    const packed = (first << 18) | (second << 12) | (third << 6) | fourth;
    if (outputIndex < bytes.length) bytes[outputIndex++] = (packed >> 16) & 255;
    if (outputIndex < bytes.length) bytes[outputIndex++] = (packed >> 8) & 255;
    if (outputIndex < bytes.length) bytes[outputIndex++] = packed & 255;
  }
  return bytes;
}
function encodeBase64(value: string) { return bytesToBase64(new TextEncoder().encode(value)); }
function decodeBase64(value: string) { return new TextDecoder().decode(base64ToBytes(value)); }

async function writePersistedSession(session: GitHubSession) {
  const serialized = JSON.stringify(session);
  if (Platform.OS === "web") { globalThis.localStorage?.setItem(GITHUB_ACCOUNT_KEY, serialized); return; }
  await SecureStore.setItemAsync(GITHUB_ACCOUNT_KEY, serialized);
}
async function clearPersistedSession() {
  if (Platform.OS === "web") { globalThis.localStorage?.removeItem(GITHUB_ACCOUNT_KEY); return; }
  await SecureStore.deleteItemAsync(GITHUB_ACCOUNT_KEY);
}

async function relayRequest<T>(path: string, relayToken?: string, init: RequestInit = {}): Promise<T> {
  const relayUrl = getRelayServiceUrl();
  if (!relayUrl) throw new Error("GitHub web sync is being connected. Please try again after its secure relay is deployed.");
  const response = await fetch(`${relayUrl}${path}`, { ...init, headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(relayToken ? { "X-SwarLipi-Session": relayToken } : {}), ...(init.headers ?? {}) } });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "The secure GitHub connection did not complete. Please try again.");
  return payload;
}

function consumeRelayCallback() {
  if (Platform.OS !== "web") return null;
  const values = new URLSearchParams(globalThis.location?.hash.replace(/^#/, "") ?? "");
  const relayToken = values.get("relaySession");
  if (!relayToken || values.get("githubBackup") !== "connected") return null;
  const keepSignedIn = new URLSearchParams(globalThis.location?.search ?? "").get("githubRelayPersist") === "1";
  globalThis.history?.replaceState({}, "", globalThis.location.pathname);
  return { relayToken, keepSignedIn };
}

async function loadRelaySession(relayToken?: string, keepSignedIn = false): Promise<GitHubSession | null> {
  if (!relayToken || !isGitHubRelayConfigured()) return null;
  try {
    const payload = await relayRequest<RelayConnection>("/connection", relayToken);
    if (!payload.connected || !payload.profile?.login) return null;
    return { accessToken: null, expiresAt: payload.expiresAt ?? null, repository: payload.repository ?? null, profile: { login: payload.profile.login, avatarUrl: payload.profile.avatarUrl ?? null }, keepSignedIn, relaySession: true, relayToken };
  } catch { return null; }
}

export async function loadGitHubSession(): Promise<GitHubSession | null> {
  try {
    const callback = consumeRelayCallback();
    if (callback) {
      const session = await loadRelaySession(callback.relayToken, callback.keepSignedIn);
      if (session?.keepSignedIn) await writePersistedSession(session);
      return session;
    }
    const raw = Platform.OS === "web" ? globalThis.localStorage?.getItem(GITHUB_ACCOUNT_KEY) ?? null : await SecureStore.getItemAsync(GITHUB_ACCOUNT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GitHubSession;
    if (!parsed.profile?.login || (!parsed.accessToken && !parsed.relaySession)) return null;
    if (parsed.relaySession) return loadRelaySession(parsed.relayToken, true);
    if (parsed.expiresAt && Date.parse(parsed.expiresAt) <= Date.now()) { await clearPersistedSession(); return null; }
    return parsed;
  } catch { return null; }
}
export async function persistGitHubSession(session: GitHubSession) { if (session.keepSignedIn) await writePersistedSession(session); else await clearPersistedSession(); }
export async function forgetGitHubSession(_session?: GitHubSession | null) { await clearPersistedSession(); }

async function githubRequest<T>(path: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, { ...init, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${accessToken}`, "X-GitHub-Api-Version": "2022-11-28", ...(init.headers ?? {}) } });
  const payload = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) { if (response.status === 401) throw new Error("Your GitHub session has expired. Sign in again to continue."); throw new Error(payload.message ?? "GitHub did not accept this request."); }
  return payload;
}

export async function beginGitHubRelayLogin(keepSignedIn: boolean) {
  if (Platform.OS !== "web") throw new Error("Secure GitHub web sign-in is not available on this device.");
  const relayUrl = getRelayServiceUrl();
  if (!relayUrl) throw new Error("GitHub web sync is being connected. Please try again after its secure relay is deployed.");
  const returnTo = new URL(`${globalThis.location?.origin ?? "https://edu6tron.github.io"}${globalThis.location?.pathname ?? "/SwarLipi/"}`);
  if (keepSignedIn) returnTo.searchParams.set("githubRelayPersist", "1");
  const start = new URL(`${relayUrl}/auth/github/start`);
  start.searchParams.set("returnTo", returnTo.toString());
  globalThis.location.assign(start.toString());
}

export async function beginGitHubDeviceLogin(): Promise<GitHubDeviceCode> {
  const clientId = getClientId();
  const response = await fetch("https://github.com/login/device/code", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId }).toString() });
  const payload = await response.json() as DeviceCodeResponse;
  if (!response.ok || !payload.device_code || !payload.user_code || !payload.verification_uri) throw new Error(payload.error_description ?? "GitHub could not start the sign-in request.");
  return { deviceCode: payload.device_code, userCode: payload.user_code, verificationUri: payload.verification_uri, expiresAt: Date.now() + (payload.expires_in ?? 900) * 1000 };
}
export async function openGitHubDeviceLogin(verificationUri: string) {
  if (Platform.OS === "web") { globalThis.open(verificationUri, "_blank", "noopener,noreferrer"); return; }
  await WebBrowser.openBrowserAsync(verificationUri, { showTitle: true, toolbarColor: "#171116" });
}
export async function finishGitHubDeviceLogin(deviceCode: string, keepSignedIn: boolean): Promise<GitHubSession> {
  const response = await fetch("https://github.com/login/oauth/access_token", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: getClientId(), device_code: deviceCode, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }).toString() });
  const token = await response.json() as TokenResponse;
  if (!response.ok || !token.access_token) { if (token.error === "authorization_pending") throw new Error("GitHub confirmation is still pending. Finish it in the browser, then check again."); throw new Error(token.error_description ?? "GitHub sign-in could not be completed."); }
  const profile = await githubRequest<{ login: string; avatar_url?: string }>("/user", token.access_token);
  const session: GitHubSession = { accessToken: token.access_token, expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null, repository: null, profile: { login: profile.login, avatarUrl: profile.avatar_url ?? null }, keepSignedIn };
  await persistGitHubSession(session);
  return session;
}

export async function selectPrivateGitHubRepository(session: GitHubSession, repository: string): Promise<GitHubSession> {
  const normalized = repository.trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(normalized)) throw new Error("Use private repository format owner/repository.");
  if (session.relaySession) {
    const result = await relayRequest<{ repository?: string; session?: string }>("/connection/repository", session.relayToken, { method: "POST", body: JSON.stringify({ repository: normalized }) });
    const next = { ...session, repository: result.repository ?? normalized, relayToken: result.session ?? session.relayToken };
    await persistGitHubSession(next); return next;
  }
  if (!session.accessToken) throw new Error("Your GitHub session is unavailable. Sign in again to continue.");
  const details = await githubRequest<{ private?: boolean }>(`/repos/${normalized}`, session.accessToken);
  if (!details.private) throw new Error("Choose a private repository so your encrypted recovery copy stays private.");
  const next = { ...session, repository: normalized }; await persistGitHubSession(next); return next;
}

export async function uploadEncryptedLibrary(session: GitHubSession, envelope: EncryptedBackupEnvelope) {
  if (!session.repository) throw new Error("Choose a private GitHub repository before syncing.");
  if (session.relaySession) { await relayRequest("/backup/latest", session.relayToken, { method: "POST", body: JSON.stringify(envelope) }); return; }
  if (!session.accessToken) throw new Error("Your GitHub session is unavailable. Sign in again to continue.");
  const filePath = `/repos/${session.repository}/contents/${GITHUB_BACKUP_PATH}`;
  let sha: string | undefined;
  try { sha = (await githubRequest<{ sha?: string }>(filePath, session.accessToken)).sha; } catch (error) { if (!(error instanceof Error) || !error.message.includes("Not Found")) throw error; }
  await githubRequest(filePath, session.accessToken, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: `SwarLipi encrypted sync ${envelope.createdAt}`, content: encodeBase64(JSON.stringify(envelope)), ...(sha ? { sha } : {}) }) });
}
export async function fetchEncryptedLibrary(session: GitHubSession): Promise<EncryptedBackupEnvelope> {
  if (!session.repository) throw new Error("Choose a private GitHub repository before restoring.");
  if (session.relaySession) return relayRequest<EncryptedBackupEnvelope>("/backup/latest", session.relayToken);
  if (!session.accessToken) throw new Error("Your GitHub session is unavailable. Sign in again to continue.");
  const result = await githubRequest<{ content?: string; encoding?: string }>(`/repos/${session.repository}/contents/${GITHUB_BACKUP_PATH}`, session.accessToken);
  if (!result.content || result.encoding !== "base64") throw new Error("No encrypted SwarLipi backup was found in this repository yet.");
  try { return JSON.parse(decodeBase64(result.content)) as EncryptedBackupEnvelope; } catch { throw new Error("The encrypted backup in this repository is not valid SwarLipi data."); }
}
export function githubAppInstallUrl() { return `https://github.com/apps/${getAppSlug()}/installations/new`; }
export async function openGitHubAppInstallation() { await openGitHubDeviceLogin(githubAppInstallUrl()); }
