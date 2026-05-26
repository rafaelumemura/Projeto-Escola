import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function created<T>(data: T) {
  return NextResponse.json(data, { status: 201 });
}

export function fail(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Dados invalidos.",
        details: error.flatten()
      },
      { status: 422 }
    );
  }

  const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
  const message = error instanceof Error ? error.message : "Erro inesperado.";

  return NextResponse.json(
    {
      error: message
    },
    { status: Number.isFinite(status) ? status : 500 }
  );
}

export async function readJson<T>(request: Request) {
  try {
    return (await request.json()) as T;
  } catch {
    throw Object.assign(new Error("Corpo da requisicao precisa ser JSON."), { status: 400 });
  }
}
