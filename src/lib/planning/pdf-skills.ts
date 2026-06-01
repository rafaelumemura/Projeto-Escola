export const planningPdfSkills = [
  {
    key: "grade",
    name: "Sem skin",
    description: "PDF limpo, sem moldura ilustrada.",
    previewImage: null
  },
  {
    key: "layout_fundo_1",
    name: "Layout Fundo 1",
    description: "Moldura ilustrada para planejamentos com visual infantil.",
    previewImage: "/planning-skin-layout-fundo-1.png"
  },
  {
    key: "layout_fundo_2",
    name: "Layout Fundo 2",
    description: "Moldura ilustrada para planejamentos com visual infantil.",
    previewImage: "/planning-skin-layout-fundo-2.png"
  },
  {
    key: "layout_fundo_3",
    name: "Layout Fundo 3",
    description: "Moldura ilustrada para planejamentos com visual infantil.",
    previewImage: "/planning-skin-layout-fundo-3.png"
  },
  {
    key: "layout_fundo_4",
    name: "Layout Fundo 4",
    description: "Moldura ilustrada para planejamentos com visual infantil.",
    previewImage: "/planning-skin-layout-fundo-4.png"
  },
  {
    key: "layout_fundo_5",
    name: "Layout Fundo 5",
    description: "Moldura ilustrada para planejamentos com visual infantil.",
    previewImage: "/planning-skin-layout-fundo-5.png"
  },
  {
    key: "layout_fundo_6",
    name: "Layout Fundo 6",
    description: "Moldura ilustrada para planejamentos com visual infantil.",
    previewImage: "/planning-skin-layout-fundo-6.png"
  },
  {
    key: "layout_fundo_7",
    name: "Layout Fundo 7",
    description: "Moldura ilustrada para planejamentos com visual infantil.",
    previewImage: "/planning-skin-layout-fundo-7.png"
  },
  {
    key: "layout_fundo_8",
    name: "Layout Fundo 8",
    description: "Moldura ilustrada para planejamentos com visual infantil.",
    previewImage: "/planning-skin-layout-fundo-8.png"
  },
  {
    key: "layout_fundo_9",
    name: "Layout Fundo 9",
    description: "Moldura ilustrada para planejamentos com visual infantil.",
    previewImage: "/planning-skin-layout-fundo-9.png"
  }
] as const;

export type PlanningPdfSkillKey = (typeof planningPdfSkills)[number]["key"];

export function normalizePlanningPdfSkill(value: unknown): PlanningPdfSkillKey {
  return planningPdfSkills.some((skill) => skill.key === value) ? (value as PlanningPdfSkillKey) : "grade";
}
