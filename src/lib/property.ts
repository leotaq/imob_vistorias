export function normalizePropertyCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function buildGoogleMapsSearchUrl(address: string): string | null {
  const cleaned = address.trim();
  if (!cleaned) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleaned)}`;
}

export const PROPERTY_CITY_OPTIONS = ["Taquara", "Parobé", "Igrejinha"] as const;
export type PropertyCity = (typeof PROPERTY_CITY_OPTIONS)[number];

function normalizeComparableText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function normalizePropertyCity(raw: string | null | undefined): PropertyCity | null {
  if (!raw) return null;
  const normalized = normalizeComparableText(raw);
  const city = PROPERTY_CITY_OPTIONS.find(
    (option) => normalizeComparableText(option) === normalized,
  );
  return city ?? null;
}

export function detectPropertyCityFromAddress(address: string): PropertyCity | null {
  const normalizedAddress = normalizeComparableText(address);
  if (!normalizedAddress) return null;
  const city = PROPERTY_CITY_OPTIONS.find((option) =>
    normalizedAddress.includes(normalizeComparableText(option)),
  );
  return city ?? null;
}

export function composePropertyAddress(opts: {
  street: string;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
}): string {
  const street = (opts.street || "").trim();
  if (!street) return "";

  const parts = [street];
  const hasPart = (value: string) =>
    normalizeComparableText(parts.join(", ")).includes(normalizeComparableText(value));

  const number = (opts.number || "").trim();
  if (number && !hasPart(number)) parts.push(number);

  const complement = (opts.complement || "").trim();
  if (complement && !hasPart(complement)) parts.push(complement);

  const neighborhood = (opts.neighborhood || "").trim();
  if (neighborhood && !hasPart(neighborhood)) parts.push(neighborhood);

  const city = (opts.city || "").trim();
  if (city && !hasPart(city)) parts.push(city);

  return parts.join(", ");
}
