import { getAnthropicModel } from "@/lib/env";
import { getAnthropicApiKey } from "@/lib/admin/system-settings";
import type { PrintableMaterialPlan } from "@/lib/activities/printable-material";
import type { Json } from "@/lib/database.types";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type AnthropicTextBlock = {
  type: "text";
  text: string;
};

type AnthropicResponse = {
  content?: Array<AnthropicTextBlock | { type: string; [key: string]: unknown }>;
};

export const PRINTABLE_AI_PROMPT_VERSION = "printable-system-prompt-v3";

export type ActivityForVisualBriefing = {
  id?: string | null;
  title?: string | null;
  age_range?: string | null;
  development_area?: string | null;
  objective?: string | null;
  description?: string | null;
  materials?: string | null;
  steps?: unknown;
  bncc_code?: string | null;
};

export type PrintableVisualBriefing = {
  idade: number;
  tema: string;
  objetivo_pedagogico: string;
  area: string;
  tipo_visual_recomendado: string;
  titulo: string;
  instrucao: string;
  conceitos_principais: string[];
  complexidade_visual: "baixa" | "media" | "alta";
  nivel_de_infantilizacao: "alto" | "medio" | "baixo";
};

export async function isMaterialPrintableV2Enabled(userId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("material_printable_v2")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Failed to read material_printable_v2 flag", error);
    return false;
  }

  return data?.material_printable_v2 === true;
}

export async function logPrintableAiGeneration(input: {
  userId: string;
  activityId: string | null;
  briefing: PrintableVisualBriefing | null;
  generationTime: number;
  status: "success" | "failed";
  eventType?: "generation" | "download" | "blocked" | "cache_reuse";
  storageBucket?: string | null;
  storagePath?: string | null;
  errorMessage?: string | null;
}) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("printable_ai_generations").insert({
    user_id: input.userId,
    activity_id: input.activityId,
    briefing_json: (input.briefing || {}) as unknown as Json,
    prompt_version: PRINTABLE_AI_PROMPT_VERSION,
    generation_time: input.generationTime,
    status: input.status,
    event_type: input.eventType || "generation",
    storage_bucket: input.storageBucket || null,
    storage_path: input.storagePath || null,
    error_message: input.errorMessage || null
  });

  if (error) {
    console.error("Failed to log printable AI generation", error);
  }
}

export async function getPrintableAiMonthlyUsage(userId: string, since?: string | null) {
  const admin = createSupabaseAdminClient();
  const { count, error } = await admin
    .from("printable_ai_generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_type", "generation")
    .eq("status", "success")
    .gte("generated_at", since || monthStartInSaoPaulo());

  if (error) {
    console.error("Failed to read printable AI monthly usage", error);
    throw error;
  }

  return count || 0;
}

export async function activityToVisualBriefing(activity: ActivityForVisualBriefing): Promise<PrintableVisualBriefing> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": await getAnthropicApiKey(),
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: getAnthropicModel(),
        max_tokens: 1600,
        temperature: 0.1,
        system:
          "Voce e a IA editorial do Projeto Escola. Transforme uma atividade pedagogica pronta em um briefing visual objetivo para uma pagina A4 imprimivel. Responda somente JSON valido.",
        messages: [
          {
            role: "user",
            content: `
Crie um briefing visual para a atividade abaixo.

Regras:
- A idade e o fator principal da direcao de arte.
- A instrucao deve ser curta e infantil.
- O titulo deve ser generico, pedagogico e reutilizavel. Nunca copie o nome completo da atividade.
- O titulo deve funcionar para outras atividades equivalentes. Exemplo: use "Pares e Impares", nao "Danca dos Numeros: Pares e Impares".
- Nao escreva orientacoes para professor.
- Nao crie a atividade de novo; extraia e organize a direcao visual.

Atividade:
${JSON.stringify(activity, null, 2)}

JSON obrigatorio:
{
  "idade": 5,
  "tema": "festa-junina",
  "objetivo_pedagogico": "objetivo curto",
  "area": "area",
  "tipo_visual_recomendado": "folha de coordenação motora | recorte e colagem | pareamento | contagem | completar",
  "titulo": "titulo pedagogico curto e generico",
  "instrucao": "instrucao curta para a crianca",
  "conceitos_principais": ["conceito 1", "conceito 2"],
  "complexidade_visual": "baixa | media | alta",
  "nivel_de_infantilizacao": "alto | medio | baixo"
}
`
          }
        ]
      })
    });

    if (!response.ok) throw new Error(await response.text());
    const data = (await response.json()) as AnthropicResponse;
    const text = data.content?.find((block): block is AnthropicTextBlock => block.type === "text")?.text || "";
    return normalizeBriefing(JSON.parse(extractJson(text)), activity);
  } catch (error) {
    console.error("Printable AI briefing fallback used", error);
    return fallbackBriefing(activity);
  }
}

export function createPrintableAiMaterialMarker(activity: ActivityForVisualBriefing): PrintableMaterialPlan {
  return {
    mode: "editorial_html",
    has_material: true,
    reason: "Material imprimivel V2 pronto para geracao por imagem.",
    title: activity.title || "Material imprimivel",
    teacher_note: null,
    art_direction: {
      theme_name: null,
      theme_strength: "strong",
      visual_elements: [],
      avoided_elements: ["dashboard", "documento Word", "apostila simples", "cards frios"],
      mechanics_summary: "Material V2 gerado por GPT Image no momento do download."
    },
    usage_summary: {
      page_count: 1,
      color_mode: "colorido",
      paper_size: "A4",
      techniques: ["GPT Image"],
      ideal_for: "impressao",
      suggestion: "Baixe o PDF para imprimir a folha A4 colorida."
    },
    quality: null,
    generated_file: null,
    editorial: {
      theme: null,
      age: parseAge(activity.age_range),
      objective: activity.objective || null,
      area: activity.development_area || null,
      keywords: [],
      printable_type: "gpt-image-v2",
      required_asset_types: [],
      assets: [],
      html: null,
      composition: null
    },
    pages: []
  };
}

function monthStartInSaoPaulo(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value || String(now.getUTCFullYear());
  const month = parts.find((part) => part.type === "month")?.value || String(now.getUTCMonth() + 1).padStart(2, "0");

  return new Date(`${year}-${month}-01T03:00:00.000Z`).toISOString();
}

function normalizeBriefing(value: Record<string, unknown>, activity: ActivityForVisualBriefing): PrintableVisualBriefing {
  const fallback = fallbackBriefing(activity);
  const idade = clampAge(Number(value.idade || fallback.idade));
  const conceitos = Array.isArray(value.conceitos_principais)
    ? value.conceitos_principais.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 10)
    : fallback.conceitos_principais;

  return {
    idade,
    tema: clean(value.tema || fallback.tema),
    objetivo_pedagogico: clean(value.objetivo_pedagogico || fallback.objetivo_pedagogico),
    area: clean(value.area || fallback.area),
    tipo_visual_recomendado: clean(value.tipo_visual_recomendado || fallback.tipo_visual_recomendado),
    titulo: genericPrintableTitle(clean(value.titulo || fallback.titulo), activity),
    instrucao: clean(value.instrucao || fallback.instrucao),
    conceitos_principais: conceitos.length ? conceitos : fallback.conceitos_principais,
    complexidade_visual: normalizeComplexity(value.complexidade_visual, idade),
    nivel_de_infantilizacao: normalizeInfantilization(value.nivel_de_infantilizacao, idade)
  };
}

function fallbackBriefing(activity: ActivityForVisualBriefing): PrintableVisualBriefing {
  const idade = parseAge(activity.age_range);
  const text = [
    activity.title,
    activity.development_area,
    activity.objective,
    activity.description,
    activity.materials,
    stringify(activity.steps)
  ].filter(Boolean).join(" ");
  const tema = detectTheme(text, activity);

  return {
    idade,
    tema,
    objetivo_pedagogico: clean(activity.objective || activity.description || activity.title || "Desenvolver a proposta pedagogica da atividade."),
    area: clean(activity.development_area || "Area pedagogica"),
    tipo_visual_recomendado: detectVisualType(text),
    titulo: genericPrintableTitle(detectGenericTitle(text, tema), activity),
    instrucao: idade <= 5 ? "Vamos brincar e completar!" : "Complete a atividade com atencao.",
    conceitos_principais: extractConcepts(text),
    complexidade_visual: idade <= 5 ? "baixa" : idade <= 7 ? "media" : "alta",
    nivel_de_infantilizacao: idade <= 5 ? "alto" : idade <= 7 ? "medio" : "baixo"
  };
}

function detectTheme(text: string, activity: ActivityForVisualBriefing) {
  const normalized = text.toLowerCase();
  if (/junina|sao joao|fogueira|milho|bandeirinha|arraia/.test(normalized)) return "festa-junina";
  if (/pascoa|coelho|ovo/.test(normalized)) return "pascoa";
  if (/natureza|arvore|folha|flor|jardim/.test(normalized)) return "natureza";
  if (/numero|numeros|matematica|contagem|pares|impares/.test(normalized)) return "numeros";
  if (/silaba|letra|historia|palavra|linguagem/.test(normalized)) return "linguagem";
  return clean(activity.development_area || "tema pedagogico");
}

function detectGenericTitle(text: string, theme: string) {
  const normalized = text.toLowerCase();
  if (/par(es)?|impar(es)?|ímpar(es)?/.test(normalized)) return "Pares e Impares";
  if (/contagem|contar|quantidade|numero|numeros/.test(normalized)) return "Contagem";
  if (/silaba|silabas|sílaba|sílabas/.test(normalized)) return "Silabas";
  if (/letra|alfabeto/.test(normalized)) return "Letras";
  if (/coordena[cç][aã]o|caminho|trajeto|pontilhado/.test(normalized)) return "Caminhos";
  if (/classificar|classificacao|categoria/.test(normalized)) return "Classificacao";
  if (/parear|ligar|associar|relacionar/.test(normalized)) return "Associe";
  if (theme === "festa-junina") return "Atividade Junina";
  if (theme === "natureza") return "Natureza";
  if (theme === "linguagem") return "Linguagem";
  if (theme === "numeros") return "Numeros";
  return "Atividade";
}

function genericPrintableTitle(value: string, activity: ActivityForVisualBriefing) {
  const title = clean(value || "Atividade");
  const activityTitle = clean(activity.title || "");
  if (!activityTitle) return limitTitle(title);

  const normalizedTitle = normalizeText(title);
  const normalizedActivityTitle = normalizeText(activityTitle);
  if (normalizedTitle && normalizedTitle !== normalizedActivityTitle && !normalizedActivityTitle.includes(normalizedTitle)) {
    return limitTitle(title);
  }

  const text = [activity.development_area, activity.objective, activity.description, activity.materials, stringify(activity.steps)]
    .filter(Boolean)
    .join(" ");
  return limitTitle(detectGenericTitle(`${activityTitle} ${text}`, detectTheme(`${activityTitle} ${text}`, activity)));
}

function detectVisualType(text: string) {
  const normalized = text.toLowerCase();
  if (/caminho|trajeto|pontilhado|coordena[cç][aã]o motora/.test(normalized)) return "folha de coordenacao motora";
  if (/recorte|recortar|colar|colagem|classificar/.test(normalized)) return "recorte e colagem";
  if (/ligar|associe|associar|parear|relacione/.test(normalized)) return "pareamento";
  if (/contar|contagem|quantidade|numero/.test(normalized)) return "contagem";
  if (/complete|completar|faltando|lacuna|silaba/.test(normalized)) return "completar";
  return "atividade pedagogica visual";
}

function extractConcepts(text: string) {
  const words = clean(text)
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-zÀ-ÿ0-9]/g, ""))
    .filter((word) => word.length > 4)
    .slice(0, 10);
  return [...new Set(words)].slice(0, 8);
}

function normalizeComplexity(value: unknown, idade: number): PrintableVisualBriefing["complexidade_visual"] {
  if (value === "baixa" || value === "media" || value === "alta") return value;
  return idade <= 5 ? "baixa" : idade <= 7 ? "media" : "alta";
}

function normalizeInfantilization(value: unknown, idade: number): PrintableVisualBriefing["nivel_de_infantilizacao"] {
  if (value === "alto" || value === "medio" || value === "baixo") return value;
  return idade <= 5 ? "alto" : idade <= 7 ? "medio" : "baixo";
}

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  if (!source.trim()) throw new Error("Briefing visual sem JSON valido.");
  return source;
}

function parseAge(value: unknown) {
  const text = normalizeText(String(value || ""));
  const wordAges: Record<string, number> = {
    zero: 0,
    um: 1,
    uma: 1,
    dois: 2,
    duas: 2,
    tres: 3,
    três: 3,
    quatro: 4,
    cinco: 5,
    seis: 6,
    sete: 7,
    oito: 8,
    nove: 9,
    dez: 10
  };
  const word = Object.entries(wordAges).find(([key]) => new RegExp(`\\b${key}\\b`).test(text));
  if (word) return clampAge(word[1]);
  const match = text.match(/\d+/);
  return clampAge(match ? Number(match[0]) : 5);
}

function clampAge(value: number) {
  if (!Number.isFinite(value)) return 5;
  return Math.max(0, Math.min(10, Math.round(value)));
}

function clean(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeText(value: unknown) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function limitTitle(value: string) {
  const title = clean(value);
  return title.length > 42 ? `${title.slice(0, 39).trim()}...` : title;
}

function stringify(value: unknown) {
  if (Array.isArray(value)) return value.join(" ");
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return JSON.stringify(value);
  return "";
}
