"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { BillingUsage } from "@/lib/billing/plans";
import type { Database } from "@/lib/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

type AuthContextValue = {
  supabase: SupabaseClient;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  usage: BillingUsage | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  refreshUsage: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [usage, setUsage] = useState<BillingUsage | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      setProfile(null);
      return;
    }

    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    setProfile(data || null);
  }, [supabase]);

  const refreshUsage = useCallback(async () => {
    const {
      data: { session: currentSession }
    } = await supabase.auth.getSession();

    if (!currentSession) {
      setUsage(null);
      return;
    }

    const response = await fetch("/api/billing/usage", {
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${currentSession.access_token}`
      }
    });

    if (!response.ok) {
      setUsage(null);
      return;
    }

    const data = (await response.json()) as { usage: BillingUsage };
    setUsage(data.usage);
  }, [supabase]);

  useEffect(() => {
    let mounted = true;
    const syncBillingAccess = () => {
      refreshUsage().catch(() => setUsage(null));
    };
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") syncBillingAccess();
    };

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await refreshProfile();
      await refreshUsage();
      setLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      refreshProfile().catch(() => setProfile(null));
      if (nextSession) {
        refreshUsage().catch(() => setUsage(null));
      } else {
        setUsage(null);
      }
    });

    window.addEventListener("billing-usage-changed", refreshUsage);
    window.addEventListener("billing-access-changed", refreshUsage);
    window.addEventListener("focus", syncBillingAccess);
    document.addEventListener("visibilitychange", syncWhenVisible);
    const accessInterval = window.setInterval(syncBillingAccess, 30_000);

    return () => {
      mounted = false;
      window.removeEventListener("billing-usage-changed", refreshUsage);
      window.removeEventListener("billing-access-changed", refreshUsage);
      window.removeEventListener("focus", syncBillingAccess);
      document.removeEventListener("visibilitychange", syncWhenVisible);
      window.clearInterval(accessInterval);
      subscription.unsubscribe();
    };
  }, [refreshProfile, refreshUsage, supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({
      supabase,
      session,
      user: session?.user || null,
      profile,
      usage,
      loading,
      refreshProfile,
      refreshUsage,
      signOut: async () => {
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
        setUsage(null);
      }
    }),
    [loading, profile, refreshProfile, refreshUsage, session, supabase, usage]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth precisa ser usado dentro de AuthProvider.");
  }

  return context;
}
