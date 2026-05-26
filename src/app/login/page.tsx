"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, KeyRound, LogIn, Mail, RotateCcw, UserPlus } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

type Mode = "login" | "signup" | "reset";

export default function LoginPage() {
  const router = useRouter();
  const { supabase, user, loading } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
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
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/dashboard");
      }

      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`
          }
        });
        if (error) throw error;
        setMessage("Cadastro criado. Confira seu e-mail se a confirmação estiver ativa no Supabase.");
      }

      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login`
        });
        if (error) throw error;
        setMessage("Enviamos um link de recuperação para o e-mail informado.");
      }
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
          <div className="mb-6 flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-lg bg-leaf text-white">
              <GraduationCap size={26} />
            </span>
            <div>
              <p className="label">PWA SaaS</p>
              <h1 className="text-3xl font-bold">Projeto Escola</h1>
            </div>
          </div>
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
            <div className="mb-3 flex items-center gap-3">
              <GraduationCap className="text-leaf" size={28} />
              <h1 className="text-2xl font-bold">Projeto Escola</h1>
            </div>
            <p className="text-sm text-ink/65">Entre para criar atividades pedagógicas com IA.</p>
          </div>

          <div className="mb-5 grid grid-cols-3 rounded-lg bg-paper p-1">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`rounded-md px-3 py-2 text-xs font-bold ${mode === "login" ? "bg-white shadow-sm" : "text-ink/55"}`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`rounded-md px-3 py-2 text-xs font-bold ${mode === "signup" ? "bg-white shadow-sm" : "text-ink/55"}`}
            >
              Cadastro
            </button>
            <button
              type="button"
              onClick={() => setMode("reset")}
              className={`rounded-md px-3 py-2 text-xs font-bold ${mode === "reset" ? "bg-white shadow-sm" : "text-ink/55"}`}
            >
              Senha
            </button>
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

            {mode !== "reset" ? (
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
            ) : null}

            {message ? <p className="rounded-md bg-mint px-3 py-2 text-sm text-ink/75">{message}</p> : null}

            <button disabled={busy} className="w-full btn-primary">
              {mode === "login" ? <LogIn size={17} /> : mode === "signup" ? <UserPlus size={17} /> : <RotateCcw size={17} />}
              {busy ? "Aguarde..." : mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Recuperar senha"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
