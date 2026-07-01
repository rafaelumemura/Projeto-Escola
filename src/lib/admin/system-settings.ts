import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const API_SECRET_DEFINITIONS = [
  { key: "anthropic_api_key", label: "Claude API", envNames: ["ANTHROPIC_API_KEY"] },
  { key: "openai_api_key", label: "OpenAI API", envNames: ["OPENAI_API_KEY"] },
  { key: "image_generation_api_key", label: "API de geração de imagens", envNames: ["IMAGE_GENERATION_API_KEY"] }
] as const;

type SecretKey = (typeof API_SECRET_DEFINITIONS)[number]["key"];
type SecretCacheItem = { value: string; expiresAt: number };

const secretCache = new Map<string, SecretCacheItem>();
const cacheTtlMs = 30_000;

export async function getAnthropicApiKey() {
  return getRuntimeSecret("anthropic_api_key", ["ANTHROPIC_API_KEY"]);
}

export async function getImageGenerationApiKey() {
  const imageSpecific = await getOptionalRuntimeSecret("image_generation_api_key", ["IMAGE_GENERATION_API_KEY"]);
  if (imageSpecific) return imageSpecific;
  return getRuntimeSecret("openai_api_key", ["OPENAI_API_KEY"]);
}

export async function getApiSecretStatuses() {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("admin_system_settings")
    .select("setting_key, encrypted_value, updated_at")
    .in("setting_key", API_SECRET_DEFINITIONS.map((item) => item.key));

  if (error) throw error;
  const stored = new Map((data || []).map((item) => [item.setting_key, item]));

  return API_SECRET_DEFINITIONS.map((definition) => {
    const setting = stored.get(definition.key);
    const configuredInEnvironment = definition.envNames.some((envName) => Boolean(process.env[envName]));
    return {
      key: definition.key,
      label: definition.label,
      configured: Boolean(setting?.encrypted_value || configuredInEnvironment),
      source: setting?.encrypted_value ? "panel" as const : configuredInEnvironment ? "environment" as const : "missing" as const,
      updated_at: setting?.updated_at || null
    };
  });
}

export async function saveApiSecret(key: SecretKey, value: string, adminUserId: string) {
  const normalized = value.trim();
  if (!normalized) return;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("admin_system_settings").upsert({
    setting_key: key,
    encrypted_value: encryptSecret(normalized),
    is_secret: true,
    updated_by: adminUserId,
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
  secretCache.delete(key);
}

export function clearRuntimeSecretCache() {
  secretCache.clear();
}

async function getRuntimeSecret(settingKey: SecretKey, envNames: string[]) {
  const value = await getOptionalRuntimeSecret(settingKey, envNames);
  if (!value) throw new Error(`Configure ${envNames.join(" ou ")} no Painel Administrativo ou na Railway.`);
  return value;
}

async function getOptionalRuntimeSecret(settingKey: SecretKey, envNames: string[]) {
  const cached = secretCache.get(settingKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("admin_system_settings")
      .select("encrypted_value")
      .eq("setting_key", settingKey)
      .maybeSingle();
    if (error) throw error;
    if (data?.encrypted_value) {
      const decrypted = decryptSecret(data.encrypted_value);
      secretCache.set(settingKey, { value: decrypted, expiresAt: Date.now() + cacheTtlMs });
      return decrypted;
    }
  } catch (error) {
    console.error(`Failed to read secure setting ${settingKey}; using environment fallback`, error);
  }

  const environmentValue = envNames.map((name) => process.env[name]).find(Boolean)?.trim();
  if (environmentValue) {
    secretCache.set(settingKey, { value: environmentValue, expiresAt: Date.now() + cacheTtlMs });
    return environmentValue;
  }
  return null;
}

function encryptionKey() {
  const source = process.env.ADMIN_SETTINGS_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!source) throw new Error("Configure ADMIN_SETTINGS_ENCRYPTION_KEY na Railway para salvar chaves pelo painel.");
  return createHash("sha256").update(source).digest();
}

function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptSecret(payload: string) {
  const [version, ivValue, tagValue, encryptedValue] = payload.split(":");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) throw new Error("Formato de segredo inválido.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64")),
    decipher.final()
  ]).toString("utf8");
}
