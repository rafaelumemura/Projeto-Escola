import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { requireServerEnv } from "@/lib/env";

export function createSupabaseAdminClient() {
  return createClient(
    requireServerEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

export function createSupabaseUserClient(accessToken: string) {
  return createClient(
    requireServerEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireServerEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    }
  );
}

export async function getAuthenticatedUser(request: Request): Promise<{
  user: User;
  accessToken: string;
  supabase: ReturnType<typeof createSupabaseUserClient>;
}>;
export async function getAuthenticatedUser(
  request: Request,
  options: { allowInactive?: boolean }
): Promise<{
  user: User;
  accessToken: string;
  supabase: ReturnType<typeof createSupabaseUserClient>;
}>;
export async function getAuthenticatedUser(
  request: Request,
  options: { allowInactive?: boolean } = {}
): Promise<{
  user: User;
  accessToken: string;
  supabase: ReturnType<typeof createSupabaseUserClient>;
}> {
  const header = request.headers.get("authorization") || "";
  const accessToken = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!accessToken) {
    throw Object.assign(new Error("Sessao nao autenticada."), { status: 401 });
  }

  const authClient = createSupabaseUserClient(accessToken);
  const { data, error } = await authClient.auth.getUser(accessToken);

  if (error || !data.user) {
    throw Object.assign(new Error("Sessao invalida ou expirada."), { status: 401 });
  }

  if (!options.allowInactive) {
    await assertUserHasAppAccess(data.user.id);
  }

  return {
    user: data.user,
    accessToken,
    supabase: authClient
  };
}

async function assertUserHasAppAccess(userId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("billing_subscriptions")
    .select("status, current_period_end, grace_ends_at, cancel_at_period_end")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data || !hasCurrentAccess(data)) {
    throw Object.assign(
      new Error("Acesso suspenso. Consulte seu plano para regularizar a conta."),
      { status: 403, code: "BILLING_ACCESS_SUSPENDED" }
    );
  }
}

function hasCurrentAccess(subscription: {
  status: string;
  current_period_end: string;
  grace_ends_at: string | null;
  cancel_at_period_end: boolean;
}) {
  const now = Date.now();
  const periodEnd = new Date(subscription.current_period_end).getTime();
  const graceEnd = subscription.grace_ends_at
    ? new Date(subscription.grace_ends_at).getTime()
    : periodEnd + 24 * 60 * 60 * 1000;

  if (subscription.status === "active") {
    return now <= (subscription.cancel_at_period_end ? periodEnd : graceEnd);
  }

  return subscription.status === "past_due" && now <= graceEnd;
}
