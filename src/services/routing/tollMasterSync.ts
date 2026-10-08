// Route save → Toll Station master: tolls the map returned for the route are stored in the master
// (matched by Vietmap ID, then code, then name; inserted when missing) and the route's toll lines
// are linked to the master code ("reconciled").
import { tollStationRepository, uid } from "@/repositories";
import type { TollGateRecord } from "@/mock-data/tollCatalog";
import type { RouteCalculation, RouteRecord, TollStation } from "@/types";
import { auditService, type AuditInput } from "@/services/auditService";
import { stampCreate } from "@/services/crudService";
import { normalizeText } from "./locationSearch";
import { vehicleClassFor } from "./RouteProvider";

/** Only tolls coming from the map / routing provider are synced; manual ones stay on the route only. */
const fromProvider = (t: TollStation) => t.source !== "Manual";

const normName = (s: string) => normalizeText(s).replace(/\s+/g, " ").trim();

/** Toll group index 0..4 the toll was priced for ("Class 3" / "Nhóm 3"), else the route's class. */
function tollGroupIndex(t: TollStation, fallback: number): number {
  const m = /(\d)/.exec(t.vehicleTollGroup ?? "");
  const n = m ? Number(m[1]) - 1 : fallback;
  return n >= 0 && n <= 4 ? n : fallback;
}

const CODE_MAX = 30;

/** Master code built from the toll name (e.g. "Trạm BOT Ninh Lộc" → "BOT-NINH-LOC"), else the toll id. */
function makeCode(t: TollStation, taken: Set<string>): string {
  const fromName = normalizeText(t.name)
    .toUpperCase()
    .replace(/^TRAM\s+/, "")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, CODE_MAX - 4)
    .replace(/-+$/g, "");
  const fromId = String(t.id)
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, "-")
    .slice(0, CODE_MAX - 4);
  const base = fromName || fromId || "TOLL";
  let code = base;
  for (let i = 2; taken.has(code); i++) code = `${base}-${i}`;
  return code;
}

export interface TollMasterSyncResult {
  route: RouteRecord;
  created: TollGateRecord[];
}

/**
 * Save the route's provider tolls (outbound + return) into Toll Station master and link the route's
 * toll lines to the master codes. Returns the route with updated toll lines (not persisted here).
 */
export function syncRouteTollsToMaster(route: RouteRecord): TollMasterSyncResult {
  const legs: (RouteCalculation | null | undefined)[] = [
    route.outbound,
    route.returnLeg,
    ...(route.alternatives ?? []),
  ];
  const tolls = [
    ...legs.flatMap((c) => c?.tollStations ?? []),
    ...(route.customReturn?.tollStations ?? []),
  ].filter(fromProvider);
  if (tolls.length === 0) return { route, created: [] };

  const master = tollStationRepository.all().filter((g) => !g.deleted);
  const taken = new Set(master.map((g) => g.code.toUpperCase()));
  const routeGroup =
    vehicleClassFor(route.vehicleProfile, route.vehicleClass, route.capacityKg) - 1;
  const created: TollGateRecord[] = [];
  /** Toll key → master record, so the same toll on both legs maps to one station. */
  const linked = new Map<string, TollGateRecord>();
  const keyOf = (t: TollStation) => `${t.source}|${t.id}|${normName(t.name)}`;

  const find = (t: TollStation): TollGateRecord | undefined => {
    const pool = [...master, ...created];
    const id = String(t.id ?? "");
    const code = (t.code ?? "").trim().toUpperCase();
    const name = normName(t.name ?? "");
    return (
      (id ? pool.find((g) => !!g.vietmapId && g.vietmapId === id) : undefined) ??
      // Mock provider tolls carry the master record id itself.
      (t.source === "Mock" && id ? pool.find((g) => g.id === id) : undefined) ??
      (code ? pool.find((g) => g.code.toUpperCase() === code) : undefined) ??
      (name ? pool.find((g) => normName(g.name) === name) : undefined)
    );
  };

  // Only the tolls of the legs the route actually uses create master records.
  const used = [
    ...(route.outbound?.tollStations ?? []),
    ...(route.type === "Round Trip"
      ? route.returnMode === "custom" && route.customReturn
        ? route.customReturn.tollStations
        : (route.returnLeg?.tollStations ?? [])
      : []),
  ].filter(fromProvider);

  for (const t of used) {
    const k = keyOf(t);
    if (linked.has(k)) continue;
    const hit = find(t);
    if (hit) {
      linked.set(k, hit);
      continue;
    }
    const vietmap = t.source === "Vietmap";
    const cls = tollGroupIndex(t, routeGroup);
    const prices: TollGateRecord["prices"] = [0, 0, 0, 0, 0];
    prices[cls] = t.price ?? 0;
    const code = makeCode(t, taken);
    taken.add(code);
    const exact =
      Number.isFinite(t.lat) && Number.isFinite(t.lng) && !t.positionApproximate
        ? { lat: t.lat!, lng: t.lng! }
        : { lat: NaN, lng: NaN };
    const rec: TollGateRecord = {
      id: uid("TS-"),
      code,
      name: t.name.trim() || code,
      address: t.address ?? "",
      province: "",
      road: "",
      feeType: t.feeType ?? "Toll",
      ...exact,
      prices,
      ...(vietmap && t.id ? { vietmapId: String(t.id) } : {}),
      source: vietmap ? "Vietmap" : "Manual",
      remark: `Added from route ${route.code}`,
      currency: "VND",
      status: "Active",
      ...stampCreate(),
    };
    created.push(rec);
    linked.set(k, rec);
  }

  if (created.length) {
    tollStationRepository.insertMany(created);
    auditService.logMany(
      created.map((g): AuditInput => ({
        action: "CREATE",
        entityType: "Toll Station",
        entityId: g.id,
        entityLabel: g.code,
        note: g.remark ?? "",
      })),
    );
  }

  const link = (t: TollStation): TollStation => {
    if (!fromProvider(t)) return t;
    const g = linked.get(keyOf(t)) ?? find(t);
    return g ? { ...t, code: g.code, reconciled: true } : t;
  };
  const linkCalc = <C extends { tollStations: TollStation[] }>(c: C): C => ({
    ...c,
    tollStations: c.tollStations.map(link),
  });

  return {
    created,
    route: {
      ...route,
      outbound: route.outbound && linkCalc(route.outbound),
      returnLeg: route.returnLeg && linkCalc(route.returnLeg),
      alternatives: (route.alternatives ?? []).map(linkCalc),
      ...(route.customReturn ? { customReturn: linkCalc(route.customReturn) } : {}),
    },
  };
}
