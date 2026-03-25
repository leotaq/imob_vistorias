import "server-only";

import { HttpError } from "@/lib/errors";

export function requireAdminPin(req: Request) {
  const expected = process.env.ADMIN_PIN?.trim();
  if (!expected) {
    throw new HttpError(500, "ADMIN_PIN ausente no ambiente.");
  }

  const got = req.headers.get("x-admin-pin")?.trim() || "";
  if (got !== expected) {
    throw new HttpError(401, "PIN admin inválido.");
  }
}
