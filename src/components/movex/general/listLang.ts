// UI language of the shared list components (EntityListPage, DataTable, filters, import).
// Vietnamese by default; a screen with an English UI passes lang="en" to EntityListPage.
import { createContext, useContext } from "react";

export type ListLang = "vi" | "en";

const ListLangContext = createContext<ListLang>("vi");
export const ListLangProvider = ListLangContext.Provider;

/** `t(vi, en)` picks the string for the current list language. */
export function useT() {
  const lang = useContext(ListLangContext);
  const en = lang === "en";
  return { en, t: (vi: string, english: string) => (en ? english : vi) };
}
