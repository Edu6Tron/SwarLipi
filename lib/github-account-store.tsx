import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  beginGitHubRelayLogin,
  beginGitHubDeviceLogin,
  finishGitHubDeviceLogin,
  forgetGitHubSession,
  GitHubDeviceCode,
  GitHubSession,
  loadGitHubSession,
  openGitHubDeviceLogin,
  selectPrivateGitHubRepository,
} from "./github-account";
import { Platform } from "react-native";

interface GitHubAccountContextValue {
  accountHydrated: boolean;
  deviceCode: GitHubDeviceCode | null;
  session: GitHubSession | null;
  startSignIn: (keepSignedIn: boolean) => Promise<void>;
  openSignInPage: () => Promise<void>;
  completeSignIn: () => Promise<void>;
  chooseRepository: (repository: string) => Promise<void>;
  logout: () => Promise<void>;
}

const GitHubAccountContext = createContext<GitHubAccountContextValue | null>(null);

export function GitHubAccountProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<GitHubSession | null>(null);
  const [deviceCode, setDeviceCode] = useState<GitHubDeviceCode | null>(null);
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [accountHydrated, setAccountHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    void loadGitHubSession().then((saved) => {
      if (!active) return;
      setSession(saved);
      setKeepSignedIn(saved?.keepSignedIn ?? false);
      setAccountHydrated(true);
    });
    return () => { active = false; };
  }, []);

  const startSignIn = useCallback(async (staySignedIn: boolean) => {
    if (Platform.OS === "web") {
      await beginGitHubRelayLogin(staySignedIn);
      return;
    }
    const next = await beginGitHubDeviceLogin();
    setKeepSignedIn(staySignedIn);
    setDeviceCode(next);
  }, []);

  const openSignInPage = useCallback(async () => {
    if (!deviceCode) throw new Error("Start GitHub sign-in first.");
    await openGitHubDeviceLogin(deviceCode.verificationUri);
  }, [deviceCode]);

  const completeSignIn = useCallback(async () => {
    if (!deviceCode) throw new Error("Start GitHub sign-in first.");
    if (deviceCode.expiresAt <= Date.now()) {
      setDeviceCode(null);
      throw new Error("This GitHub code expired. Start sign-in again.");
    }
    const next = await finishGitHubDeviceLogin(deviceCode.deviceCode, keepSignedIn);
    setSession(next);
    setDeviceCode(null);
  }, [deviceCode, keepSignedIn]);

  const chooseRepository = useCallback(async (repository: string) => {
    if (!session) throw new Error("Sign in with GitHub first.");
    setSession(await selectPrivateGitHubRepository(session, repository));
  }, [session]);

  const logout = useCallback(async () => {
    await forgetGitHubSession(session);
    setSession(null);
    setDeviceCode(null);
    setKeepSignedIn(false);
  }, [session]);

  const value = useMemo<GitHubAccountContextValue>(() => ({ accountHydrated, deviceCode, session, startSignIn, openSignInPage, completeSignIn, chooseRepository, logout }), [accountHydrated, chooseRepository, completeSignIn, deviceCode, logout, openSignInPage, session, startSignIn]);
  return <GitHubAccountContext.Provider value={value}>{children}</GitHubAccountContext.Provider>;
}

export function useGitHubAccount() {
  const context = useContext(GitHubAccountContext);
  if (!context) throw new Error("useGitHubAccount must be used within GitHubAccountProvider.");
  return context;
}
