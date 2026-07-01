import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient, getAuthenticatedUser } from "@/lib/supabase/server";

export async function requireAdmin(request: Request): Promise<{
  user: User;
  admin: ReturnType<typeof createSupabaseAdminClient>;
}> {
  const { user } = await getAuthenticatedUser(request, { allowInactive: true });
  const admin = createSupabaseAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (error) throw error;
  if (!profile?.is_admin) {
    throw Object.assign(new Error("Acesso restrito a administradores."), { status: 403 });
  }

  return { user, admin };
}
