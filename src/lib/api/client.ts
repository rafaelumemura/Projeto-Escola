"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

type JsonBody = unknown;

export async function apiFetch<T>(
  supabase: SupabaseClient,
  path: string,
  options: Omit<RequestInit, "body"> & { body?: JsonBody } = {}
) {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Sessao expirada. Entre novamente.");
  }

  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(options.headers as Record<string, string> | undefined)
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    if (response.status === 403 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("billing-access-changed"));
    }
    throw new Error(data?.error || "Erro ao chamar API.");
  }

  return (await response.json()) as T;
}

export async function downloadPdf(
  supabase: SupabaseClient,
  path: string,
  body: JsonBody,
  filename: string
) {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Sessao expirada. Entre novamente.");
  }

  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    if (response.status === 403 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("billing-access-changed"));
    }
    throw new Error(data?.error || "Nao foi possivel gerar o PDF.");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
