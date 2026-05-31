import { z } from "zod";
import { getAnthropicModel, requireServerEnv } from "@/lib/env";

type AnthropicTextBlock = {
  type: "text";
  text: string;
};

type AnthropicResponse = {
  content?: Array<AnthropicTextBlock | { type: string; [key: string]: unknown }>;
};

export const printableMaterialItemSchema = z.object({
  type: z.enum(["card", "shape", "label", "token", "cutout", "worksheet"]).default("card"),
  text: z.string().min(1),
  detail: z.string().nullable().optional(),
  quantity: z.coerce.number().int().min(1).max(40).default(1),
  shape: z.enum(["card", "circle", "square", "rectangle", "triangle", "flag"]).default("card"),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#ffffff"),
  accent_color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#2f7d58")
});

export const printableMaterialPageSchema = z.object({
  title: z.string().min(1),
  instructions: z.string().nullable().optional(),
  items: z.array(printableMaterialItemSchema).min(1).max(40)
});

export const printableMaterialPlanSchema = z.object({
  has_material: z.boolean(),
  reason: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  teacher_note: z.string().nullable().optional(),
  pages: z.array(printableMaterialPageSchema).default([])
});

export type PrintableMaterialPlan = z.infer<typeof printableMaterialPlanSchema>;
export type PrintableMaterialPage = z.infer<typeof printableMaterialPageSchema>;
export type PrintableMaterialItem = z.infer<typeof printableMaterialItemSchema>;

type ActivityForMaterial = {
  title?: string | null;
  age_range?: string | null;
  estimated_time?: string | null;
  development_area?: string | null;
  methodology?: string | null;
  activity_type?: string | null;
  environment?: string | null;
  materials?: string | null;
  objective?: string | null;
  bncc_code?: string | null;
  description?: string | null;
  steps?: unknown;
  teacher_tips?: unknown;
  variations?: unknown;
  safety_notes?: string | null;
  evaluation?: string | null;
};

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);

  if (!source || source.trim().length === 0) {
    throw Object.assign(new Error("A IA nao retornou um JSON valido para o material imprimivel."), { status: 502 });
  }

  return JSON.parse(source);
}

function normalizePrintableMaterial(raw: unknown): PrintableMaterialPlan {
  const parsed = printableMaterialPlanSchema.parse(raw);

  if (!parsed.has_material) {
    return {
      ...parsed,
      pages: []
    };
  }

  if (!parsed.pages.length) {
    return {
      has_material: false,
      reason: parsed.reason || "A IA nao encontrou elementos concretos para montar um material imprimivel.",
      title: parsed.title || null,
      teacher_note: parsed.teacher_note || null,
      pages: []
    };
  }

  return parsed;
}

function buildPrompt(activity: ActivityForMaterial) {
  return `
Analise a atividade pedagogica abaixo e decida se ela realmente precisa de material imprimivel.

Atividade:
${JSON.stringify(activity, null, 2)}

Regras:
- Responda apenas com JSON valido, sem markdown.
- Escreva em portugues do Brasil.
- Nao gere material generico.
- has_material deve ser false quando a atividade nao precisar de fichas, pecas, cartoes, moldes, etiquetas, numeros, letras, tabuleiros, folhas ou recortes.
- Se houver material, ele deve ser diretamente pertinente ao passo a passo da atividade.
- O material sera desenhado em PDF com formas, textos e cores simples. Nao dependa de imagens externas.
- Para cada item, escolha quantity apenas quando forem copias reais para imprimir.
- Use cores em hexadecimal.
- O JSON deve usar exatamente este formato:
{
  "has_material": true,
  "reason": "string curta explicando a decisao",
  "title": "string",
  "teacher_note": "string ou null",
  "pages": [
    {
      "title": "string",
      "instructions": "string ou null",
      "items": [
        {
          "type": "card | shape | label | token | cutout | worksheet",
          "text": "texto principal do item",
          "detail": "texto secundario ou null",
          "quantity": 1,
          "shape": "card | circle | square | rectangle | triangle | flag",
          "color": "#ffffff",
          "accent_color": "#2f7d58"
        }
      ]
    }
  ]
}

Se nao houver material:
{
  "has_material": false,
  "reason": "explique em uma frase por que nao precisa de material imprimivel",
  "title": null,
  "teacher_note": null,
  "pages": []
}
`;
}

export async function analyzePrintableMaterialWithClaude(activity: ActivityForMaterial) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": requireServerEnv("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: getAnthropicModel(),
      max_tokens: 2600,
      temperature: 0.25,
      system:
        "Voce e um designer pedagogico especializado em materiais imprimiveis para professores da educacao infantil e fundamental 1. Seja criterioso: so proponha material quando ele ajuda a executar a atividade.",
      messages: [
        {
          role: "user",
          content: buildPrompt(activity)
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw Object.assign(new Error(`Falha ao chamar Claude API para material imprimivel: ${body}`), { status: 502 });
  }

  const data = (await response.json()) as AnthropicResponse;
  const text = data.content?.find((block): block is AnthropicTextBlock => block.type === "text")?.text;

  if (!text) {
    throw Object.assign(new Error("A Claude API nao retornou texto para o material imprimivel."), { status: 502 });
  }

  return normalizePrintableMaterial(extractJson(text));
}
