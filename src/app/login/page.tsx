"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogIn, Mail } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

export default function LoginPage() {
  const router = useRouter();
  const { supabase, user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, router, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const { data } = await supabase.from("profiles").select("password_must_change").eq("email", email).maybeSingle();
      router.replace(data?.password_must_change ? "/perfil" : "/dashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível concluir a ação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-paper px-4 py-8 lg:grid-cols-[1fr_460px]">
      <section className="hidden items-center justify-center border-r border-ink/10 px-10 lg:flex">
        <div className="max-w-2xl">
          <img src="/simbolo.webp" alt="Projeto Escola" className="mb-8 h-32 max-w-full object-contain object-left" />
          <p className="text-lg leading-8 text-ink/70">
            Gere, salve e organize atividades pedagógicas com IA para educação infantil e fundamental 1.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {["Atividades estruturadas", "Coleções temáticas", "Planejamento"].map((item) => (
              <div key={item} className="rounded-lg border border-ink/10 bg-white p-4 text-sm font-semibold text-ink/75">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center">
        <div className="panel w-full max-w-md p-6">
          <div className="mb-6 lg:hidden">
            <img src="/simbolo.webp" alt="Projeto Escola" className="mb-4 h-20 max-w-full object-contain object-left" />
            <p className="text-sm text-ink/65">Entre para criar atividades pedagógicas com IA.</p>
          </div>

          <div className="mb-5 rounded-lg border border-ink/10 bg-paper px-4 py-3">
            <p className="text-sm font-semibold text-ink">Acesse sua conta</p>
            <p className="mt-1 text-xs leading-5 text-ink/60">Use o e-mail informado na compra e a senha recebida no primeiro acesso.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="label mb-2 block">E-mail</span>
              <span className="relative block">
                <Mail className="pointer-events-none absolute left-3 top-2.5 text-ink/40" size={18} />
                <input
                  className="field pl-10"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </span>
            </label>

            <label className="block">
              <span className="label mb-2 block">Senha</span>
              <span className="relative block">
                <KeyRound className="pointer-events-none absolute left-3 top-2.5 text-ink/40" size={18} />
                <input
                  className="field pl-10"
                  type="password"
                  value={password}
                  minLength={6}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </span>
            </label>

            {message ? <p className="rounded-md bg-mint px-3 py-2 text-sm text-ink/75">{message}</p> : null}

            <button disabled={busy} className="w-full btn-primary">
              <LogIn size={17} />
              {busy ? "Aguarde..." : "Entrar"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
