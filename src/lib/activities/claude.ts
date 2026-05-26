import { getAnthropicModel, requireServerEnv } from "@/lib/env";
import { activitySchema, type ActivityGenerationInput, type ActivityPayload } from "@/lib/activities/types";

type AnthropicTextBlock = {
  type: "text";
  text: string;
};

type AnthropicResponse = {
  content?: Array<AnthropicTextBlock | { type: string; [key: string]: unknown }>;
};

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);

  if (!source || source.trim().length === 0) {
    throw Object.assign(new Error("A IA nao retornou um JSON valido."), { status: 502 });
  }

  return JSON.parse(source);
}

function toStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\n|;/)
      .map((item) => item.replace(/^[-*\d.)\s]+/, "").trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeGeneratedActivity(raw: unknown, input: ActivityGenerationInput): ActivityPayload {
  const object = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};

  return activitySchema.parse({
    title: object.title ?? object.titulo ?? "Atividade personalizada",
    age_range: object.age_range ?? input.age_range,
    estimated_time: object.estimated_time ?? object.tempo_estimado ?? null,
    development_area: object.development_area ?? input.development_area,
    methodology: object.methodology ?? input.methodology,
    activity_type: object.activity_type ?? input.activity_type,
    environment: object.environment ?? input.environment,
    materials: object.materials ?? input.materials,
    objective: object.objective ?? input.objective,
    bncc_code: object.bncc_code ?? object.codigo_bncc ?? null,
    description: object.description ?? object.descricao ?? null,
    steps: toStringArray(object.steps ?? object.passo_a_passo),
    teacher_tips: toStringArray(object.teacher_tips ?? object.dicas_para_o_professor),
    variations: toStringArray(object.variations ?? object.variacoes),
    safety_notes: object.safety_notes ?? object.observacoes_de_seguranca ?? null,
    evaluation: object.evaluation ?? object.avaliacao ?? null,
    raw_ai_response: raw
  });
}

function buildPrompt(input: ActivityGenerationInput) {
  return `
Crie uma atividade pedagogica para educacao infantil ou fundamental 1.

Dados do professor:
- idade/faixa etaria: ${input.age_range}
- metodologia: ${input.methodology}
- area de desenvolvimento/conhecimento: ${input.development_area}
- tipo de atividade: ${input.activity_type}
- ambiente: ${input.environment}
- materiais disponiveis: ${input.materials}
- objetivo: ${input.objective}

Regras:
- responda apenas com JSON valido, sem markdown.
- escreva em portugues do Brasil.
- seja pratico, ludico, seguro e adequado para criancas de 0 a 10 anos.
- inclua BNCC quando aplicavel; se nao houver codigo claro, use null.
- o JSON deve usar exatamente estas chaves:
{
  "title": "string",
  "age_range": "string",
  "estimated_time": "string",
  "development_area": "string",
  "methodology": "string",
  "activity_type": "string",
  "environment": "string",
  "materials": "string",
  "objective": "string",
  "bncc_code": "string ou null",
  "description": "string",
  "steps": ["string"],
  "teacher_tips": ["string"],
  "variations": ["string"],
  "safety_notes": "string",
  "evaluation": "string"
}
`;
}

export async function generateActivityWithClaude(input: ActivityGenerationInput) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": requireServerEnv("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: getAnthropicModel(),
      max_tokens: 2800,
      temperature: 0.7,
      system:
        "Voce e um especialista em pedagogia, BNCC e planejamento de atividades ludicas para professores brasileiros. Gere respostas estruturadas e seguras.",
      messages: [
        {
          role: "user",
          content: buildPrompt(input)
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw Object.assign(new Error(`Falha ao chamar Claude API: ${body}`), { status: 502 });
  }

  const data = (await response.json()) as AnthropicResponse;
  const text = data.content?.find((block): block is AnthropicTextBlock => block.type === "text")?.text;

  if (!text) {
    throw Object.assign(new Error("A Claude API nao retornou texto."), { status: 502 });
  }

  return normalizeGeneratedActivity(extractJson(text), input);
}
