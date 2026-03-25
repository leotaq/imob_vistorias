import "server-only";

import { HttpError } from "@/lib/errors";
import { resolveAuthActor, type Actor } from "@/lib/authActor";

export type { Actor } from "@/lib/authActor";

export async function getActor(req: Request): Promise<Actor | null> {
  const resolved = await resolveAuthActor(req);
  return resolved.status === "approved" ? resolved.actor : null;
}

export async function requireActor(req: Request): Promise<Actor> {
  const resolved = await resolveAuthActor(req);
  if (resolved.status === "approved") return resolved.actor;
  if (resolved.status === "pending") {
    throw new HttpError(403, "Acesso pendente de aprovacao.");
  }
  throw new HttpError(401, "Sessao ausente ou expirada.");
}
