import "server-only";

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "@/lib/errors";

export function jsonNoStore(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function apiError(err: unknown) {
  if (err instanceof ZodError) {
    return jsonNoStore(
      {
        message: "Dados inválidos na requisição.",
        details: err.flatten(),
      },
      400,
    );
  }

  if (err instanceof HttpError) {
    return jsonNoStore(
      { message: err.message, details: err.details ?? null },
      err.status,
    );
  }

  console.error("Unhandled API error", err);
  return jsonNoStore({ message: "Erro interno." }, 500);
}
