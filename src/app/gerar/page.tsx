import { redirect } from "next/navigation";

export default function GenerateActivityPage() {
  redirect("/atividades?criar=ia");
}
