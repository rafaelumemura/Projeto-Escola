import { z } from "zod";

export const collectionCreateSchema = z.object({
  name: z.string().min(1, "Informe o nome da colecao."),
  description: z.string().nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Informe uma cor hexadecimal valida.").optional()
});

export const collectionUpdateSchema = collectionCreateSchema.partial();

export const collectionActivitySchema = z.object({
  activity_id: z.string().uuid()
});

export const weeklyPlanCreateSchema = z.object({
  title: z.string().min(1, "Informe o titulo do planejamento."),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional()
});

export const weeklyPlanUpdateSchema = weeklyPlanCreateSchema.partial();

export const weeklyPlanItemCreateSchema = z.object({
  activity_id: z.string().uuid().nullable().optional(),
  date: z.string().min(1, "Informe a data do item."),
  start_time: z.string().nullable().optional(),
  end_time: z.string().nullable().optional(),
  notes: z.string().nullable().optional()
});

export const weeklyPlanItemUpdateSchema = weeklyPlanItemCreateSchema.partial();

export const profileUpdateSchema = z.object({
  name: z.string().min(1, "Informe seu nome.")
});
