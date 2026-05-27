import { z } from "zod";
import { fail, ok, readJson } from "@/lib/api/http";
import { isPlanKey, type PaidPlanKey } from "@/lib/billing/plans";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type HotmartPayload = Record<string, unknown>;

const fallbackPassword = "acesso123";

export async function POST(request: Request) {
  try {
    validateWebhookSecret(request);

    const payload = await readJson<HotmartPayload>(request);
    const email = extractEmail(payload);
    const name = extractName(payload, email);
    const planKey = extractPlanKey(payload);
    const mode = payload.mode === "upgrade" ? "upgrade" : "new";
    const providerSubscriptionId = extractFirstString(payload, [
      ["data", "subscription", "subscriber_code"],
      ["data", "subscription", "code"],
      ["data", "purchase", "transaction"],
      ["data", "transaction"],
      ["transaction"]
    ]);

    const supabase = createSupabaseAdminClient();
    const { userId, created } = await ensureHotmartUser(supabase, email, name);

    if (mode === "upgrade" && planKey === "complete") {
      const { error } = await supabase.rpc("upgrade_subscription_to_complete", {
        p_user_id: userId,
        p_provider: "hotmart",
        p_provider_customer_id: email,
        p_provider_subscription_id: providerSubscriptionId
      });
      if (error) throw error;
    } else {
      const { error } = await supabase.rpc("activate_subscription_cycle", {
        p_user_id: userId,
        p_plan_key: planKey,
        p_provider: "hotmart",
        p_provider_customer_id: email,
        p_provider_subscription_id: providerSubscriptionId,
        p_started_at: new Date().toISOString()
      });
      if (error) throw error;
    }

    const profileUpdate: Record<string, string | boolean> = {
      name,
      email,
      plan: planKey
    };

    if (created) profileUpdate.password_must_change = true;

    await supabase.from("profiles").update(profileUpdate).eq("id", userId);

    return ok({
      ok: true,
      user_id: userId,
      email,
      plan_key: planKey,
      created
    });
  } catch (error) {
    return fail(error);
  }
}

function validateWebhookSecret(request: Request) {
  const expectedSecret = process.env.HOTMART_WEBHOOK_SECRET;
  if (!expectedSecret) return;

  const url = new URL(request.url);
  const authorization = request.headers.get("authorization") || "";
  const receivedSecret =
    request.headers.get("x-hotmart-hottok") ||
    request.headers.get("hottok") ||
    request.headers.get("x-webhook-token") ||
    authorization.replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("token");

  if (receivedSecret !== expectedSecret) {
    throw Object.assign(new Error("Webhook nao autorizado."), { status: 401 });
  }
}

async function ensureHotmartUser(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  email: string,
  name: string
) {
  const normalizedEmail = email.toLowerCase();
  const { data: existingProfile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", normalizedEmail)
    .maybeSingle();

  if (profileError) throw profileError;
  if (existingProfile?.id) {
    return {
      userId: existingProfile.id,
      created: false
    };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password: process.env.HOTMART_TEMP_PASSWORD || fallbackPassword,
    email_confirm: true,
    user_metadata: {
      name
    }
  });

  if (error || !data.user) {
    throw error || Object.assign(new Error("Nao foi possivel criar o usuario."), { status: 500 });
  }

  await supabase.from("profiles").upsert({
    id: data.user.id,
    name,
    email: normalizedEmail,
    password_must_change: true
  });

  return {
    userId: data.user.id,
    created: true
  };
}

function extractEmail(payload: HotmartPayload) {
  const email =
    payload.email ||
    extractFirstString(payload, [
      ["data", "buyer", "email"],
      ["data", "subscriber", "email"],
      ["buyer", "email"],
      ["subscriber", "email"],
      ["customer", "email"]
    ]) ||
    findFirstStringByKey(payload, "email");

  if (!email || !z.string().email().safeParse(email).success) {
    throw Object.assign(new Error("Webhook sem e-mail valido do comprador."), { status: 422 });
  }

  return String(email).trim().toLowerCase();
}

function extractName(payload: HotmartPayload, email: string) {
  const name =
    payload.name ||
    extractFirstString(payload, [
      ["data", "buyer", "name"],
      ["data", "subscriber", "name"],
      ["buyer", "name"],
      ["subscriber", "name"],
      ["customer", "name"]
    ]) ||
    findFirstStringByKey(payload, "name");

  return String(name || email.split("@")[0]).trim();
}

function extractPlanKey(payload: HotmartPayload): PaidPlanKey {
  const directPlan = payload.plan_key || payload.plan;
  if (typeof directPlan === "string" && isPlanKey(directPlan) && directPlan !== "free") {
    return directPlan;
  }

  const productId = extractFirstString(payload, [
    ["data", "product", "id"],
    ["data", "product", "ucode"],
    ["data", "product", "code"],
    ["product", "id"],
    ["product", "ucode"],
    ["product", "code"]
  ]);

  const planByProductId = planFromProductId(productId);
  if (planByProductId) return planByProductId;

  const productName =
    extractFirstString(payload, [
      ["data", "product", "name"],
      ["data", "subscription", "plan", "name"],
      ["product", "name"],
      ["plan", "name"]
    ]) || JSON.stringify(payload);

  const normalizedName = normalizePlanText(productName);
  if (normalizedName.includes("basico") || normalizedName.includes("basic")) return "basic";
  if (normalizedName.includes("completo") || normalizedName.includes("complete")) return "complete";
  if (normalizedName.includes("pro")) return "pro";

  throw Object.assign(new Error("Nao foi possivel identificar o plano comprado na Hotmart."), { status: 422 });
}

function planFromProductId(productId?: string | null): PaidPlanKey | null {
  if (!productId) return null;

  const productMap: Array<[PaidPlanKey, string | undefined]> = [
    ["basic", process.env.HOTMART_BASIC_PRODUCT_ID],
    ["complete", process.env.HOTMART_COMPLETE_PRODUCT_ID],
    ["pro", process.env.HOTMART_PRO_PRODUCT_ID]
  ];

  return productMap.find(([, expected]) => expected && expected === productId)?.[0] || null;
}

function extractFirstString(payload: unknown, paths: string[][]) {
  for (const path of paths) {
    const value = getPath(payload, path);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }

  return null;
}

function getPath(payload: unknown, path: string[]) {
  return path.reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object" || !(key in current)) return undefined;
    return (current as Record<string, unknown>)[key];
  }, payload);
}

function findFirstStringByKey(value: unknown, targetKey: string): string | null {
  if (!value || typeof value !== "object") return null;

  for (const [key, child] of Object.entries(value)) {
    if (key.toLowerCase() === targetKey && typeof child === "string" && child.trim()) {
      return child.trim();
    }

    const found = findFirstStringByKey(child, targetKey);
    if (found) return found;
  }

  return null;
}

function normalizePlanText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
