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

  return {
    user: data.user,
    accessToken,
    supabase: authClient
  };
}
