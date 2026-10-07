// App UI language (VI / EN). Strings are written inline as t("tiếng Việt", "English"); data such as
// place names, people and seed records is not translated. English by default; the choice is remembered per browser.
import { useSyncExternalStore } from "react";

export type Lang = "vi" | "en";

const KEY = "movex.ui-lang";
const listeners = new Set<() => void>();

const read = (): Lang => {
  try {
    // English unless the user explicitly picked Vietnamese in the language switch.
    return typeof window !== "undefined" && window.localStorage.getItem(KEY) === "vi" ? "vi" : "en";
  } catch {
    return "en";
  }
};

let current: Lang = read();

export const getLang = () => current;

export function setLang(lang: Lang) {
  if (lang === current) return;
  current = lang;
  try {
    window.localStorage.setItem(KEY, lang);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/** Current language, re-rendering when it changes. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, () => "en");
}

/** In components: `const { t } = useT(); t("Lưu", "Save")`. */
export function useT() {
  const lang = useLang();
  const en = lang === "en";
  return { lang, en, t: (vi: string, english: string) => (en ? english : vi) };
}

/** Outside React (services, toasts, validation messages): evaluated when called. */
export const tr = (vi: string, en: string) => (current === "en" ? en : vi);
