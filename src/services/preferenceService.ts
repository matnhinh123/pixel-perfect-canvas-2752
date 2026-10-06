import type { ColumnPreference, FilterCondition } from "@/types";
import { readJson, writeJson } from "@/repositories/storage";
import { currentUser } from "./session";

// Keys are scoped by user + screen, e.g. "column-preference:routing:u-minhanh".
const colKey = (screen: string) => `column-preference:${screen}:${currentUser.id}`;
const filterKey = (screen: string) => `recent-filters:${screen}:${currentUser.id}`;

export interface RecentFilter {
  id: string;
  label: string;
  conditions: FilterCondition[];
  savedAt: string;
}

export const preferenceService = {
  getColumns(screen: string): ColumnPreference | null {
    return readJson<ColumnPreference | null>(colKey(screen), null);
  },
  saveColumns(screen: string, pref: ColumnPreference) {
    writeJson(colKey(screen), pref);
  },
  resetColumns(screen: string) {
    writeJson(colKey(screen), null);
  },
  getRecentFilters(screen: string): RecentFilter[] {
    return readJson<RecentFilter[]>(filterKey(screen), []);
  },
  pushRecentFilter(screen: string, f: RecentFilter) {
    const sig = JSON.stringify(
      f.conditions.map(({ field, operator, value, value2 }) => [field, operator, value, value2]),
    );
    const prev = this.getRecentFilters(screen).filter(
      (x) =>
        JSON.stringify(
          x.conditions.map(({ field, operator, value, value2 }) => [
            field,
            operator,
            value,
            value2,
          ]),
        ) !== sig,
    );
    writeJson(filterKey(screen), [f, ...prev].slice(0, 5));
  },
};
