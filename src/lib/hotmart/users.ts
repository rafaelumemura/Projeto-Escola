import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

const fallbackPassword = "acesso123";

export async function ensureHotmartUser(
  supabase: SupabaseAdminClient,
  email: string,
  name: string
) {
  const normalizedEmail = email.trim().toLowerCase();
  const profileUserId = await findProfileUserId(supabase, normalizedEmail);

  let user = profileUserId ? await getAuthUserById(supabase, profileUserId) : null;
  if (!user) user = await findAuthUserByEmail(supabase, normalizedEmail);

  let created = false;
  if (!user) {
    const result = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password: temporaryPassword(),
      email_confirm: true,
      user_metadata: {
        name,
        origin: "hotmart"
      },
      app_metadata: {
        origin: "hotmart"
      }
    });

    if (result.error || !result.data.user) {
      user = await findAuthUserByEmail(supabase, normalizedEmail);
      if (!user) {
        throw result.error || Object.assign(new Error("Não foi possível criar o usuário no Supabase Auth."), { status: 500 });
      }
    } else {
      user = result.data.user;
      created = true;
    }
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      name,
      email: normalizedEmail,
      ...(created || (!profileUserId && user.app_metadata?.origin === "hotmart")
        ? { password_must_change: true }
        : {})
    },
    { onConflict: "id" }
  );

  if (profileError) {
    throw new Error(`Usuário criado, mas não foi possível salvar o perfil: ${profileError.message}`);
  }

  return {
    userId: user.id,
    created
  };
}

export async function findExistingHotmartUser(
  supabase: SupabaseAdminClient,
  email: string | null
) {
  if (!email) return null;

  const normalizedEmail = email.trim().toLowerCase();
  const profileUserId = await findProfileUserId(supabase, normalizedEmail);
  if (profileUserId) return profileUserId;

  const user = await findAuthUserByEmail(supabase, normalizedEmail);
  return user?.id || null;
}

async function findProfileUserId(supabase: SupabaseAdminClient, email: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id || null;
}

async function getAuthUserById(supabase: SupabaseAdminClient, userId: string) {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) return null;
  return data.user;
}

async function findAuthUserByEmail(supabase: SupabaseAdminClient, email: string): Promise<User | null> {
  const perPage = 1000;

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const user = data.users.find((candidate) => candidate.email?.trim().toLowerCase() === email);
    if (user) return user;
    if (data.users.length < perPage) return null;
  }

  throw new Error("A busca de usuário no Supabase excedeu o limite de páginas.");
}

function temporaryPassword() {
  const password = process.env.HOTMART_TEMP_PASSWORD?.trim() || fallbackPassword;
  if (password.length < 6) {
    throw Object.assign(new Error("HOTMART_TEMP_PASSWORD precisa ter pelo menos 6 caracteres."), { status: 503 });
  }
  return password;
}
