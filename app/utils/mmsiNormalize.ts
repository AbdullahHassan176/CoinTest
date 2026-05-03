/** Strip non-digits; ship AIS MMSI is 9 digits. Returns null if invalid. */
export function normalizeMmsi(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length === 9) return d;
  return null;
}
