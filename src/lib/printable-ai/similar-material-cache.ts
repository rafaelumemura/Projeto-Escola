import { getAnthropicModel } from "@/lib/env";
import { getAnthropicApiKey } from "@/lib/admin/system-settings";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";
import {
  PRINTABLE_AI_PROMPT_VERSION,
  type PrintableVisualBriefing
} from "@/lib/printable-ai/activity-to-visual-briefing";

type CacheCandidate = {
  id: string;
  activity_id: string | null;
  briefing_json: Json;
  prompt_version: string;
  storage_bucket: string | null;
  storage_path: string | null;
  generated_at: string;
};

type NormalizedCandidate = {
  eventId: string;
  activityId: string | null;
  storageBucket: string;
  storagePath: string;
  promptVersion: string;
  generatedAt: string;
  briefing: PrintableVisualBriefing;
};

type AnthropicTextBlock = {
  type: "text";
  text: string;
};

type AnthropicResponse = {
  content?: Array<AnthropicTextBlock | { type: string; [key: string]: unknown }>;
};

const printableMaterialsBucket = "printable-materials";

export async function findSimilarPrintableMaterial(
  briefing: PrintableVisualBriefing,
  currentActivityId: string
) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("printable_ai_generations")
    .select("id, activity_id, briefing_json, prompt_version, storage_bucket, storage_path, generated_at")
    .eq("status", "success")
    .eq("event_type", "generation")
    .eq("prompt_version", PRINTABLE_AI_PROMPT_VERSION)
    .not("storage_path", "is", null)
    .order("generated_at", { ascending: false })
    .limit(80);

  if (error) {
    console.error("Failed to read printable AI cache candidates", error);
    return null;
  }

  const candidates = ((data || []) as CacheCandidate[])
    .map(normalizeCandidate)
    .filter((candidate): candidate is NormalizedCandidate => Boolean(candidate))
    .filter((candidate) => candidate.activityId !== currentActivityId)
    .filter((candidate) => candidate.briefing.idade === briefing.idade)
    .slice(0, 20);

  if (!candidates.length) return null;

  const match = await validateSimilarMaterialWithClaude(briefing, candidates);
  if (!match?.reuse) return null;

  return candidates.find((candidate) => candidate.eventId === match.eventId) || null;
}

function normalizeCandidate(candidate: CacheCandidate): NormalizedCandidate | null {
  if (!candidate.storage_path) return null;
  const briefing = parseBriefing(candidate.briefing_json);
  if (!briefing) return null;

  return {
    eventId: candidate.id,
    activityId: candidate.activity_id,
    storageBucket: candidate.storage_bucket || printableMaterialsBucket,
    storagePath: candidate.storage_path,
    promptVersion: candidate.prompt_version,
    generatedAt: candidate.generated_at,
    briefing
  };
}

function parseBriefing(value: Json): PrintableVisualBriefing | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const idade = Number(source.idade);
  const conceitos = Array.isArray(source.conceitos_principais)
    ? source.conceitos_principais.map(String).filter(Boolean)
    : [];

  if (!Number.isFinite(idade)) return null;

  return {
    idade,
    tema: text(source.tema),
    objetivo_pedagogico: text(source.objetivo_pedagogico),
    area: text(source.area),
    tipo_visual_recomendado: text(source.tipo_visual_recomendado),
    titulo: text(source.titulo),
    instrucao: text(source.instrucao),
    conceitos_principais: conceitos,
    complexidade_visual: normalizeComplexity(source.complexidade_visual),
    nivel_de_infantilizacao: normalizeInfantilization(source.nivel_de_infantilizacao)
  };
}

async function validateSimilarMaterialWithClaude(
  briefing: PrintableVisualBriefing,
  candidates: NormalizedCandidate[]
) {
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
        max_tokens: 1000,
        temperature: 0,
        system:
          "Voce avalia reutilizacao de cache de material pedagogico imprimivel. Seja extremamente conservador. Se houver duvida, responda reuse false. Responda somente JSON valido.",
        messages: [
          {
            role: "user",
            content: `
Material novo:
${JSON.stringify(briefing, null, 2)}

Materiais existentes candidatos:
${JSON.stringify(candidates.map((candidate) => ({
  event_id: candidate.eventId,
  titulo: candidate.briefing.titulo,
  idade: candidate.briefing.idade,
  area: candidate.briefing.area,
  tema: candidate.briefing.tema,
  tipo_visual_recomendado: candidate.briefing.tipo_visual_recomendado,
  objetivo_pedagogico: candidate.briefing.objetivo_pedagogico,
  conceitos_principais: candidate.briefing.conceitos_principais,
  instrucao: candidate.briefing.instrucao
})), null, 2)}

Reutilize apenas se TODOS os criterios forem verdadeiros:
- mesma faixa etaria exata;
- mesma area pedagogica, mesmo com palavras diferentes;
- tema compativel;
- conceitos principais muito proximos;
- objetivo pedagogico equivalente;
- o material existente nao depende de elementos especificos ausentes no material novo;
- o titulo existente e generico o suficiente para se encaixar na nova atividade.

Nao use nota numerica, score ou ranking interno. Escolha no maximo um candidato.

JSON obrigatorio:
{
  "reuse": true,
  "event_id": "id do candidato escolhido ou null",
  "reason": "justificativa curta"
}
`
          }
        ]
      })
    });

    if (!response.ok) throw new Error(await response.text());
    const data = (await response.json()) as AnthropicResponse;
    const textBlock = data.content?.find((block): block is AnthropicTextBlock => block.type === "text");
    const parsed = JSON.parse(extractJson(textBlock?.text || ""));
    const eventId = text(parsed.event_id);

    return {
      reuse: parsed.reuse === true && Boolean(eventId),
      eventId,
      reason: text(parsed.reason)
    };
  } catch (error) {
    console.error("Printable AI similar cache validation failed", error);
    return null;
  }
}

function extractJson(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? value.slice(value.indexOf("{"), value.lastIndexOf("}") + 1);
  if (!source.trim()) throw new Error("Validacao de cache sem JSON valido.");
  return source;
}

function text(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeComplexity(value: unknown): PrintableVisualBriefing["complexidade_visual"] {
  return value === "baixa" || value === "media" || value === "alta" ? value : "media";
}

function normalizeInfantilization(value: unknown): PrintableVisualBriefing["nivel_de_infantilizacao"] {
  return value === "alto" || value === "medio" || value === "baixo" ? value : "medio";
}
