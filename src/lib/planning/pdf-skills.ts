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
    key: "roteiro",
    name: "Roteiro diário",
    description: "Organiza cada dia como um roteiro de aula, com horários, atividade, BNCC e anotações.",
    previewImage: null
  },
  {
    key: "lista",
    name: "Lista compacta",
    description: "Exibe as atividades em uma lista objetiva, boa para conferência rápida e reuniões.",
    previewImage: null
  }
] as const;

export type PlanningPdfSkillKey = (typeof planningPdfSkills)[number]["key"];

export function normalizePlanningPdfSkill(value: unknown): PlanningPdfSkillKey {
  return planningPdfSkills.some((skill) => skill.key === value) ? (value as PlanningPdfSkillKey) : "grade";
}
