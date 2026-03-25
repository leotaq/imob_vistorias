export function normalizePhone(
  value: string | null | undefined,
  defaultCountryCode = "55",
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const raw = trimmed.replace(/[()\-\s.]/g, "");
  let hadPlus = raw.startsWith("+");
  let digits = raw.replace(/\D/g, "");

  if (!digits) return null;
  if (raw.startsWith("00")) {
    hadPlus = true;
    digits = raw.slice(2).replace(/\D/g, "");
  }

  if (!hadPlus) {
    const countryDigits = defaultCountryCode.replace(/\D/g, "");
    if (!countryDigits) return null;

    if (!digits.startsWith(countryDigits)) {
      digits = `${countryDigits}${digits}`;
    }
  }

  if (digits.length < 10 || digits.length > 15) return null;
  return `+${digits}`;
}
