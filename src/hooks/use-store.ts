import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { AuditEvent, ColumnPreference, EntityType } from "@/types";
import { auditRepository, templateConfigRepository } from "@/repositories";
import { preferenceService } from "@/services/preferenceService";

interface Subscribable<T> {
  all(): T[];
  subscribe(cb: () => void): () => void;
}

/** Live view of a repository collection (re-renders on every write, incl. other components). */
export function useCollection<T>(repo: Subscribable<T>): T[] {
  return useSyncExternalStore(repo.subscribe, repo.all, repo.all);
}

export function useTemplateConfig() {
  return useSyncExternalStore(
    templateConfigRepository.subscribe,
    templateConfigRepository.get,
    templateConfigRepository.get,
  );
}

export function useEntityAudit(entityType: EntityType, entityId: string | undefined): AuditEvent[] {
  const all = useCollection(auditRepository);
  return useMemo(
    () =>
      (entityId
        ? all.filter((e) => e.entityType === entityType && e.entityId === entityId)
        : []
      ).sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [all, entityType, entityId],
  );
}

/** GEN-04: column visibility / order / width persisted per user + screen. */
export function useColumnPreference(screen: string, allKeys: string[], defaultHidden: string[]) {
  // Keyed by content so callers may pass fresh arrays each render.
  const keySig = allKeys.join("|");
  const hiddenSig = defaultHidden.join("|");
  const defaults = useMemo<ColumnPreference>(
    () => ({ order: keySig.split("|"), hidden: hiddenSig ? hiddenSig.split("|") : [], widths: {} }),
    [keySig, hiddenSig],
  );
  const [pref, setPref] = useState<ColumnPreference>(() => {
    const saved = preferenceService.getColumns(screen);
    if (!saved) return defaults;
    // Keep newly added columns visible at the end; drop columns that no longer exist.
    const order = [
      ...saved.order.filter((k) => allKeys.includes(k)),
      ...allKeys.filter((k) => !saved.order.includes(k)),
    ];
    return {
      order,
      hidden: saved.hidden.filter((k) => allKeys.includes(k)),
      widths: saved.widths ?? {},
    };
  });
  useEffect(() => {
    preferenceService.saveColumns(screen, pref);
  }, [screen, pref]);
  const reset = () => {
    preferenceService.resetColumns(screen);
    setPref(defaults);
  };
  return { pref, setPref, reset };
}
