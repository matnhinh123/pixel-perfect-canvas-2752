// The only routing entry point for UI code. Picks Vietmap when the server has a key, otherwise OSRM.
import type {
  LocationSuggestion,
  RouteCalculation,
  RouteRecord,
  RouteRequest,
  RoutePoint,
  TollStation,
} from "@/types";
import { profileNeedsCapacity } from "@/types";
import { findVehicle } from "@/mock-data/vehicles";
import { MOCK_TOLL_GATES } from "@/mock-data/tollCatalog";
import { MockRouteProvider } from "./MockRouteProvider";
import { OsrmRouteProvider } from "./OsrmRouteProvider";
import type { RouteProvider } from "./RouteProvider";
import { RouteProviderError } from "./RouteProvider";
import { isVietmapConfigured, VietmapRouteProvider } from "./VietmapRouteProvider";
import { normalizeText } from "./locationSearch";

const mock = new MockRouteProvider();
let providerPromise: Promise<RouteProvider> | null = null;

export function getRouteProvider(): Promise<RouteProvider> {
  providerPromise ??= isVietmapConfigured().then((ok) =>
    ok ? new VietmapRouteProvider() : new OsrmRouteProvider(),
  );
  return providerPromise;
}

export const hasCoords = (p: RoutePoint) =>
  Number.isFinite(p.lat) && Number.isFinite(p.lng) && !!p.name.trim();

type CalcInput = Pick<
  RouteRecord,
  | "type"
  | "origin"
  | "destination"
  | "waypoints"
  | "returnMode"
  | "returnWaypoints"
  | "vehicleId"
  | "vehicleProfile"
  | "capacityKg"
  | "departureTime"
  | "avoidFerry"
>;

/** Why "Tính lại lộ trình" cannot run yet, or null when the input is complete. */
export function validateRouteInput(r: CalcInput): string | null {
  if (!hasCoords(r.origin)) return "Chọn Điểm đi từ danh sách gợi ý.";
  if (!hasCoords(r.destination)) return "Chọn Điểm đến từ danh sách gợi ý.";
  if (!findVehicle(r.vehicleId)) return "Chọn xe trước khi tính lộ trình.";
  const bad = r.waypoints.findIndex((w) => !hasCoords(w));
  if (bad >= 0) return `Điểm dừng ${bad + 1} chưa có địa điểm — chọn địa điểm hoặc xoá dòng.`;
  return null;
}

const toRequest = (points: RoutePoint[], r: CalcInput): RouteRequest => {
  // Vehicle Master is the source of truth for profile and weight.
  const v = findVehicle(r.vehicleId);
  const vehicle = v?.profile ?? r.vehicleProfile;
  const kg = v?.weightKg ?? r.capacityKg;
  return {
    points: points.map((p) => ({ lat: p.lat, lng: p.lng, name: p.name })),
    vehicle,
    ...(profileNeedsCapacity(vehicle) && kg ? { capacityKg: kg } : {}),
    avoidFerry: r.avoidFerry,
    ...(r.departureTime ? { departureTime: r.departureTime } : {}),
  };
};

/** Match provider toll gates to Toll Station master data by name ("Đã đối chiếu" / "Chưa đối chiếu"). */
function reconcile(stations: TollStation[]): TollStation[] {
  return stations.map((t) => {
    if (t.reconciled !== undefined) return t;
    const n = normalizeText(t.name);
    const g = MOCK_TOLL_GATES.find((x) => {
      const m = normalizeText(x.name);
      return m === n || n.includes(m) || m.includes(n);
    });
    return g ? { ...t, code: g.code, reconciled: true } : { ...t, reconciled: false };
  });
}
const reconcileCalc = (c: RouteCalculation): RouteCalculation => ({
  ...c,
  tollStations: reconcile(c.tollStations),
});

export interface RouteCalcResult {
  alternatives: RouteCalculation[];
  returnLeg: RouteCalculation | null;
}

export const routingService = {
  async providerName() {
    return (await getRouteProvider()).name;
  },

  /** Outbound alternatives: A → waypoints → B. Return (Round Trip): B → return waypoints (or reversed outbound ones) → A. */
  async calculate(r: CalcInput): Promise<RouteCalcResult> {
    const err = validateRouteInput(r);
    if (err) throw new RouteProviderError(err, "INVALID_REQUEST");
    const provider = await getRouteProvider();
    const alternatives = (
      await provider.calculateRoutes(toRequest([r.origin, ...r.waypoints, r.destination], r))
    ).map(reconcileCalc);
    if (alternatives.length === 0)
      throw new RouteProviderError("Không tìm thấy tuyến phù hợp.", "ZERO_RESULTS");
    let returnLeg: RouteCalculation | null = null;
    if (r.type === "Round Trip") {
      const back =
        r.returnMode === "custom"
          ? r.returnWaypoints.filter(hasCoords)
          : [...r.waypoints].reverse();
      returnLeg = reconcileCalc(
        await provider.calculateRoute(toRequest([r.destination, ...back, r.origin], r)),
      );
    }
    return { alternatives, returnLeg };
  },

  async searchLocation(text: string): Promise<LocationSuggestion[]> {
    const provider = await getRouteProvider();
    const [remote, master] = await Promise.all([
      provider.name === "vietmap"
        ? provider.searchLocation(text).catch(() => [])
        : Promise.resolve([]),
      mock.searchLocation(text),
    ]);
    return [...master, ...remote];
  },

  async resolveLocation(s: LocationSuggestion) {
    if (s.source === "master") return s;
    return (await getRouteProvider()).resolveLocation(s);
  },
};
