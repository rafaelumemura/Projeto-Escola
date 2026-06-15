import { z } from "zod";
import { isPlanKey, type PaidPlanKey } from "@/lib/billing/plans";

export type HotmartPayload = Record<string, unknown>;

export const HOTMART_EVENTS = {
  activate: new Set<string>(["PURCHASE_APPROVED", "PURCHASE_COMPLETE"]),
  pastDue: new Set<string>(["PURCHASE_DELAYED", "PURCHASE_EXPIRED", "PURCHASE_CANCELED"]),
  suspend: new Set<string>(["PURCHASE_PROTEST", "PURCHASE_REFUNDED", "PURCHASE_CHARGEBACK"]),
  cancelAtPeriodEnd: new Set<string>(["SUBSCRIPTION_CANCELLATION"]),
  switchPlan: new Set<string>(["SWITCH_PLAN"]),
  updateChargeDate: new Set<string>(["UPDATE_SUBSCRIPTION_CHARGE_DATE"])
} as const;

export type HotmartEventContext = {
  payload: HotmartPayload;
  eventId: string;
  eventType: string;
  email: string | null;
  name: string | null;
  productId: string | null;
  productName: string | null;
  offerCode: string | null;
  planId: string | null;
  planName: string | null;
  planKey: PaidPlanKey | null;
  subscriptionId: string | null;
  transactionId: string | null;
  occurredAt: string;
  nextChargeAt: string | null;
};

const payloadSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  event: z.string().min(1),
  data: z.record(z.unknown()).optional()
}).passthrough();

export function parseHotmartPayload(payload: unknown, fallbackEventId: string): HotmartEventContext {
  const parsed = payloadSchema.parse(payload) as HotmartPayload;
  const eventType = String(parsed.event).trim().toUpperCase();
  const selectedPlan = eventType === "SWITCH_PLAN" ? extractCurrentSwitchPlan(parsed) : null;
  const email = extractEmail(parsed);
  const name = extractName(parsed, email);
  const productId = extractFirstString(parsed, [
    ["data", "product", "id"],
    ["data", "product", "ucode"],
    ["data", "product", "code"],
    ["data", "subscription", "product", "id"],
    ["data", "subscription", "product", "ucode"],
    ["data", "subscription", "product", "code"],
    ["product", "id"],
    ["product", "ucode"],
    ["product", "code"]
  ]);
  const productName = extractFirstString(parsed, [
    ["data", "product", "name"],
    ["data", "subscription", "product", "name"],
    ["product", "name"]
  ]);
  const offerCode =
    selectedPlan?.offerCode ||
    extractFirstString(parsed, [
      ["data", "purchase", "offer", "code"],
      ["data", "offer", "code"],
      ["purchase", "offer", "code"],
      ["offer", "code"]
    ]);
  const planId =
    selectedPlan?.id ||
    extractFirstString(parsed, [
      ["data", "subscription", "plan", "id"],
      ["data", "subscription", "plan", "code"],
      ["plan", "id"],
      ["plan", "code"]
    ]);
  const planNames = [
    selectedPlan?.name,
    ...extractStrings(parsed, [
      ["data", "subscription", "plan", "name"],
      ["data", "purchase", "offer", "name"],
      ["data", "offer", "name"],
      ["data", "product", "name"],
      ["plan", "name"],
      ["offer", "name"],
      ["product", "name"]
    ])
  ].filter((value): value is string => Boolean(value));
  const planName = planNames[0] || null;

  return {
    payload: parsed,
    eventId: String(parsed.id || fallbackEventId),
    eventType,
    email,
    name,
    productId,
    productName,
    offerCode,
    planId,
    planName,
    planKey: resolvePlanKey(parsed, { productId, offerCode, planId, planNames }),
    subscriptionId: extractFirstString(parsed, [
      ["data", "subscription", "subscriber", "code"],
      ["data", "subscription", "subscriber_code"],
      ["data", "subscription", "code"],
      ["data", "subscription", "id"],
      ["subscription", "subscriber", "code"],
      ["subscription", "code"],
      ["subscription", "id"]
    ]),
    transactionId: extractFirstString(parsed, [
      ["data", "purchase", "transaction"],
      ["data", "transaction"],
      ["purchase", "transaction"],
      ["transaction"]
    ]),
    occurredAt:
      extractDate(parsed, [
        ["data", "purchase", "approved_date"],
        ["data", "purchase", "order_date"],
        ["data", "event_date"],
        ["creation_date"],
        ["event_date"]
      ]) || new Date().toISOString(),
    nextChargeAt: extractDate(parsed, [
      ["data", "subscription", "date_next_charge"],
      ["data", "subscription", "next_charge_date"],
      ["data", "date_next_charge"],
      ["subscription", "date_next_charge"]
    ])
  };
}

export function isHandledHotmartEvent(eventType: string) {
  return Object.values(HOTMART_EVENTS).some((events) => events.has(eventType));
}

export function isSyntheticHotmartTest(context: HotmartEventContext) {
  const productName = normalizeText(context.productName || "");
  const planName = normalizeText(context.planName || "");
  const offerCode = normalizeText(context.offerCode || "");

  return (
    context.productId === "0" &&
    (offerCode === "test" ||
      productName.includes("test postback") ||
      planName.includes("plano de teste"))
  );
}

export function requireBuyer(context: HotmartEventContext) {
  if (!context.email || !z.string().email().safeParse(context.email).success) {
    throw httpError("Webhook sem e-mail válido do comprador.", 422);
  }

  return {
    email: context.email,
    name: context.name || context.email.split("@")[0]
  };
}

export function requirePaidPlan(context: HotmartEventContext) {
  if (!context.planKey || context.planKey === "free") {
    throw httpError(
      "Não foi possível identificar o plano. Configure os códigos da oferta ou do plano da Hotmart na Railway.",
      422
    );
  }

  return context.planKey;
}

function resolvePlanKey(
  payload: HotmartPayload,
  identifiers: {
    productId: string | null;
    offerCode: string | null;
    planId: string | null;
    planNames: string[];
  }
): PaidPlanKey | null {
  const directPlan = payload.plan_key || payload.plan;
  if (typeof directPlan === "string" && isPlanKey(directPlan) && directPlan !== "free") {
    return directPlan;
  }

  return (
    planFromConfiguredIdentifier(identifiers.offerCode, "OFFER_CODE") ||
    planFromConfiguredIdentifier(identifiers.planId, "PLAN_ID") ||
    planFromUniqueProductId(identifiers.productId) ||
    identifiers.planNames.map(planFromName).find(Boolean) ||
    null
  );
}

function planFromConfiguredIdentifier(value: string | null, suffix: "OFFER_CODE" | "PLAN_ID") {
  if (!value) return null;

  const matches = paidPlans().filter((plan) =>
    envValues(`HOTMART_${plan.toUpperCase()}_${suffix}`).includes(value)
  );

  return matches.length === 1 ? matches[0] : null;
}

function planFromUniqueProductId(value: string | null) {
  if (!value) return null;

  const matches = paidPlans().filter((plan) =>
    envValues(`HOTMART_${plan.toUpperCase()}_PRODUCT_ID`).includes(value)
  );

  return matches.length === 1 ? matches[0] : null;
}

function planFromName(value: string | null): PaidPlanKey | null {
  if (!value) return null;

  const normalized = normalizeText(value);
  if (/(^|\s)basico(\s|$)/.test(normalized) || /(^|\s)basic(\s|$)/.test(normalized)) return "basic";
  if (/(^|\s)completo(\s|$)/.test(normalized) || /(^|\s)complete(\s|$)/.test(normalized)) return "complete";
  if (/(^|\s)pro(\s|$)/.test(normalized)) return "pro";
  return null;
}

function extractEmail(payload: HotmartPayload) {
  const email =
    extractFirstString(payload, [
      ["data", "buyer", "email"],
      ["data", "subscriber", "email"],
      ["buyer", "email"],
      ["subscriber", "email"],
      ["customer", "email"],
      ["email"]
    ]) || findFirstStringByKey(payload, "email");

  return email?.trim().toLowerCase() || null;
}

function extractName(payload: HotmartPayload, email: string | null) {
  const name =
    extractFirstString(payload, [
      ["data", "buyer", "name"],
      ["data", "subscriber", "name"],
      ["buyer", "name"],
      ["subscriber", "name"],
      ["customer", "name"],
      ["name"]
    ]) || findFirstStringByKey(payload, "name");

  return name?.trim() || email?.split("@")[0] || null;
}

function extractCurrentSwitchPlan(payload: HotmartPayload) {
  const plans = getPath(payload, ["data", "plans"]);
  if (!Array.isArray(plans)) return null;

  const currentPlan = plans.find(
    (plan) => plan && typeof plan === "object" && (plan as Record<string, unknown>).current === true
  );
  if (!currentPlan || typeof currentPlan !== "object") return null;

  const record = currentPlan as Record<string, unknown>;
  const offer = record.offer;
  return {
    id: stringValue(record.id) || stringValue(record.code),
    name: stringValue(record.name),
    offerCode:
      offer && typeof offer === "object"
        ? stringValue((offer as Record<string, unknown>).key) ||
          stringValue((offer as Record<string, unknown>).code)
        : null
  };
}

function extractDate(payload: HotmartPayload, paths: string[][]) {
  for (const path of paths) {
    const parsed = parseDateValue(getPath(payload, path));
    if (parsed) return parsed;
  }
  return null;
}

function parseDateValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && /^\d+$/.test(value.trim())) return parseDateValue(numeric);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
}

function extractFirstString(payload: unknown, paths: string[][]) {
  for (const path of paths) {
    const value = getPath(payload, path);
    const parsed = stringValue(value);
    if (parsed) return parsed;
  }
  return null;
}

function extractStrings(payload: unknown, paths: string[][]) {
  return paths
    .map((path) => stringValue(getPath(payload, path)))
    .filter((value): value is string => Boolean(value));
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
    if (key.toLowerCase() === targetKey) {
      const parsed = stringValue(child);
      if (parsed) return parsed;
    }

    const found = findFirstStringByKey(child, targetKey);
    if (found) return found;
  }

  return null;
}

function stringValue(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function envValues(name: string) {
  return (process.env[name] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function paidPlans(): PaidPlanKey[] {
  return ["basic", "complete", "pro"];
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}
