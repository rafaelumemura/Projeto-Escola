import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { fail, ok, readJson } from "@/lib/api/http";
import { requireServerEnv } from "@/lib/env";
import { createSupabaseAdminClient, getAuthenticatedUser } from "@/lib/supabase/server";

const passwordChangeSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(6)
});

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const email = user.email;
    if (!email) {
      throw Object.assign(new Error("E-mail da conta não encontrado."), { status: 400 });
    }

    const payload = passwordChangeSchema.parse(await readJson<unknown>(request));
    const authClient = createClient(
      requireServerEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireServerEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
    const { error: signInError } = await authClient.auth.signInWithPassword({
      email,
      password: payload.current_password
    });

    if (signInError) {
      throw Object.assign(new Error("Senha atual incorreta."), { status: 401 });
    }

    const supabase = createSupabaseAdminClient();
    const { error: passwordError } = await supabase.auth.admin.updateUserById(user.id, {
      password: payload.new_password
    });

    if (passwordError) throw passwordError;

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ password_must_change: false })
      .eq("id", user.id);

    if (profileError) throw profileError;

    return ok({ password_must_change: false });
  } catch (error) {
    return fail(error);
  }
}
