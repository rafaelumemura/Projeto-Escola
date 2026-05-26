import { z } from "zod";

export const methodologies = ["Tradicional", "Construtivista", "Montessori", "Waldorf", "Outra"] as const;
export const activityTypes = ["Individual", "Duplas", "Trios", "Sala toda"] as const;
export const environments = ["Sala de aula", "Pátio", "Área externa", "Casa", "Outro"] as const;

export const activityGenerationInputSchema = z.object({
  age_range: z.string().min(1, "Informe a idade ou faixa etaria."),
  methodology: z.enum(methodologies),
  development_area: z.string().min(1, "Informe a area de desenvolvimento."),
  activity_type: z.enum(activityTypes),
  environment: z.enum(environments),
  materials: z.string().min(1, "Informe os materiais disponiveis."),
  objective: z.string().min(1, "Informe o objetivo da atividade.")
});

export const activitySchema = z.object({
  title: z.string().min(1),
  age_range: z.string().nullable().optional(),
  estimated_time: z.string().nullable().optional(),
  development_area: z.string().nullable().optional(),
  methodology: z.string().nullable().optional(),
  activity_type: z.string().nullable().optional(),
  environment: z.string().nullable().optional(),
  materials: z.string().nullable().optional(),
  objective: z.string().nullable().optional(),
  bncc_code: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  steps: z.array(z.string()).default([]),
  teacher_tips: z.array(z.string()).default([]),
  variations: z.array(z.string()).default([]),
  safety_notes: z.string().nullable().optional(),
  evaluation: z.string().nullable().optional(),
  raw_ai_response: z.unknown().optional()
});

export const activitySaveSchema = activitySchema.extend({
  id: z.string().uuid().optional()
});

export const activityUpdateSchema = activitySchema.partial().extend({
  title: z.string().min(1).optional()
});

export const activityFilterSchema = z.object({
  age_range: z.string().optional(),
  development_area: z.string().optional(),
  methodology: z.string().optional(),
  activity_type: z.string().optional(),
  collection_id: z.string().uuid().optional(),
  created_from: z.string().optional(),
  created_to: z.string().optional()
});

export type ActivityGenerationInput = z.infer<typeof activityGenerationInputSchema>;
export type ActivityPayload = z.infer<typeof activitySchema>;
