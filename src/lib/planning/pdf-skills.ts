export const planningPdfSkills = [
  {
    key: "layout_fundo_1",
    name: "Layout Fundo 1",
    description: "Moldura ilustrada para planejamentos com visual infantil.",
    previewImage: "/planning-skin-layout-fundo-1.png"
  },
  {
    key: "grade",
    name: "Grade por horário",
    description: "Dias em colunas e horários em linhas, ideal para imprimir a semana em formato de calendário.",
    previewImage: null
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
