"use client";

export async function apiFetch(
  path: string,
  init: RequestInit & { actorId?: string; adminPin?: string } = {},
) {
  const actorId =
    init.actorId ??
    (typeof window !== "undefined"
      ? localStorage.getItem("actorPersonId") || ""
      : "");
  const adminPin =
    init.adminPin ??
    (typeof window !== "undefined"
      ? sessionStorage.getItem("adminPin") || ""
      : "");

  const headers = new Headers(init.headers || {});
  if (actorId) headers.set("X-Actor-Id", actorId);
  if (adminPin) headers.set("X-Admin-Pin", adminPin);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, { ...init, headers, cache: "no-store" });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = (json && json.message) || `HTTP ${res.status}`;
    const err = new Error(msg) as Error & { status?: number; details?: unknown };
    err.status = res.status;
    err.details = json;
    throw err;
  }

  return json;
}
