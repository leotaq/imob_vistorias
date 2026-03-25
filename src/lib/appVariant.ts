export type AppVariant = "legacy" | "beta";

function normalizeVariant(value: string | undefined): AppVariant {
  const normalized = value?.trim().toLowerCase();
  return normalized === "beta" ? "beta" : "legacy";
}

export function getServerAppVariant(): AppVariant {
  return normalizeVariant(
    process.env.APP_VARIANT
    ?? process.env.NEXT_PUBLIC_APP_VARIANT,
  );
}

export function getClientAppVariant(): AppVariant {
  return normalizeVariant(process.env.NEXT_PUBLIC_APP_VARIANT);
}

export function isBetaServerVariant(): boolean {
  return getServerAppVariant() === "beta";
}

export function isBetaClientVariant(): boolean {
  return getClientAppVariant() === "beta";
}
