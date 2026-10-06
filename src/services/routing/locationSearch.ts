import type { LocationRecord } from "@/types";

/** Lower-case and strip Vietnamese diacritics so "da nang" matches "Đà Nẵng". */
export const normalizeText = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/**
 * Case/diacritic-insensitive search over code, name, address and province.
 * Ranking: code prefix / name prefix → word prefix in name → name or code contains → address/province contains.
 */
export function searchLocations(
  locations: LocationRecord[],
  text: string,
  limit = 8,
): LocationRecord[] {
  const q = normalizeText(text.trim());
  if (!q) return locations.slice(0, limit);
  const scored: { l: LocationRecord; score: number }[] = [];
  for (const l of locations) {
    const name = normalizeText(l.name);
    const code = normalizeText(l.code ?? "");
    const score =
      (code && code.startsWith(q)) || name.startsWith(q)
        ? 0
        : name.split(/[\s.,()-]+/).some((w) => w.startsWith(q))
          ? 1
          : name.includes(q) || (code && code.includes(q))
            ? 2
            : normalizeText(`${l.address} ${l.province}`).includes(q)
              ? 3
              : -1;
    if (score >= 0) scored.push({ l, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.l.name.localeCompare(b.l.name, "vi"))
    .slice(0, limit)
    .map((x) => x.l);
}
