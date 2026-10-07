// UI language of the shared list components (EntityListPage, DataTable, filters, import).
// Follows the app language; a screen can pin it with lang="en" on EntityListPage.
import { createContext, useContext } from "react";
import { useLang, type Lang } from "@/lib/i18n";

export type ListLang = Lang;

const ListLangContext = createContext<ListLang | null>(null);
export const ListLangProvider = ListLangContext.Provider;

/** `t(vi, en)` picks the string for the current list language. */
export function useT() {
  const pinned = useContext(ListLangContext);
  const app = useLang();
  const en = (pinned ?? app) === "en";
  return { en, t: (vi: string, english: string) => (en ? english : vi) };
}
