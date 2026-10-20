import type { ColumnPreference } from "@/types";
import { readJson, writeJson } from "@/repositories/storage";
import { currentUser } from "./session";

// Keys are scoped by user + screen, e.g. "column-preference:routing:u-minhanh".
const colKey = (screen: string) => `column-preference:${screen}:${currentUser.id}`;

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
};
