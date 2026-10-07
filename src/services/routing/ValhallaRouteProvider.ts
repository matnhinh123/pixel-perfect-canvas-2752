import { activeTollGates } from "@/services/routing/tollGates";
import { tr } from "@/lib/i18n";
import type {
  LocationSuggestion,
  RouteCalculation,
  RouteInstruction,
  RouteRequest,
  TollStation,
} from "@/types";
import { bboxOf, decodePolyline, nearestVertex } from "./geo";
import {
  RouteProviderError,
  requestTollClass,
  tollClassLabel,
  type RouteProvider,
} from "./RouteProvider";

/** Free public Valhalla (OpenStreetMap) — real road network with a `truck` costing, no API key. */
const VALHALLA = "https://valhalla1.openstreetmap.de/route";

interface ValhallaTrip {
  summary: { length: number; time: number };
  legs: { shape: string; maneuvers?: { instruction: string; length: number; time: number }[] }[];
}

const costingFor = (v: RouteRequest["vehicle"]) =>
  v === "Car" ? "auto" : v === "Motorcycle" ? "motorcycle" : "truck";

export class ValhallaRouteProvider implements RouteProvider {
  readonly name = "valhalla" as const;

  async calculateRoute(req: RouteRequest) {
    const { id: _i, label: _l, recommended: _r, ...best } = (await this.calculateRoutes(req))[0]!;
    return best;
  }

  async calculateRoutes(req: RouteRequest): Promise<RouteCalculation[]> {
    const costing = costingFor(req.vehicle);
    const kg = req.capacityKg ?? (costing === "truck" ? 10000 : 0);
    const truckOptions =
      costing === "truck"
        ? {
            costing_options: {
              truck: {
                weight: Math.max(1, kg / 1000),
                height: req.vehicle === "Container" ? 4.2 : 3.5,
                length: req.vehicle === "Container" ? 12.2 : 8,
                width: 2.5,
                ...(req.avoidFerry ? { use_ferry: 0 } : {}),
              },
            },
          }
        : {};
    // Picked points (ports, depots) often sit off the road network or on truck-restricted streets:
    // snap to the nearest allowed road within `radius` metres, widening the search on failure.
    const post = async (radius: number) => {
      const body = {
        locations: req.points.map((p, i) => ({
          lat: p.lat,
          lon: p.lng,
          radius,
          type: i === 0 || i === req.points.length - 1 ? "break" : "through",
        })),
        costing,
        ...truckOptions,
        // Alternates are only supported for 2-point requests.
        ...(req.points.length === 2 ? { alternates: 2 } : {}),
        directions_options: { language: "vi-VN" },
      };
      try {
        return await fetch(VALHALLA, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch {
        throw new RouteProviderError(
          tr("Không kết nối được dịch vụ tìm đường.", "Could not reach the routing service."),
          "NETWORK",
        );
      }
    };
    let res = await post(500);
    if (res.status === 400) res = await post(3000);
    const json = (await res.json().catch(() => null)) as {
      trip?: ValhallaTrip;
      alternates?: { trip: ValhallaTrip }[];
      error?: string;
    } | null;
    if (!res.ok || !json?.trip)
      throw new RouteProviderError(
        json?.error ??
          tr(
            "Không tìm thấy tuyến đường phù hợp cho xe tải.",
            "No suitable truck route was found.",
          ),
        res.status === 400 ? "ZERO_RESULTS" : "ERROR_UNKNOWN",
      );

    const now = new Date().toISOString();
    return [json.trip, ...(json.alternates ?? []).map((a) => a.trip)].map((t, i) =>
      this.toCalculation(t, req, i, now),
    );
  }

  private toCalculation(
    trip: ValhallaTrip,
    req: RouteRequest,
    i: number,
    calculatedAt: string,
  ): RouteCalculation {
    const geometry: [number, number][] = [];
    const instructions: RouteInstruction[] = [];
    for (const leg of trip.legs) {
      const pts = decodePolyline(leg.shape, 6);
      geometry.push(...(geometry.length ? pts.slice(1) : pts));
      for (const m of leg.maneuvers ?? [])
        instructions.push({
          text: m.instruction,
          distanceM: Math.round(m.length * 1000),
          timeMs: Math.round(m.time * 1000),
        });
    }
    const distance = Math.round(trip.summary.length * 10) / 10;
    const cls = requestTollClass(req);
    const tollStations: TollStation[] =
      cls === null
        ? []
        : activeTollGates()
            .map((g) => ({ g, near: nearestVertex(geometry, g) }))
            // Station coordinates are approximate: a gate within 1 km of the line counts as passed.
            .filter((h) => h.near.km < 1 && !(req.avoidFerry && h.g.feeType === "Ferry"))
            .sort((a, b) => a.near.index - b.near.index)
            .map(({ g }) => ({
              id: g.id,
              code: g.code,
              name: g.name,
              address: g.province,
              feeType: g.feeType,
              price: g.prices[cls]!,
              vehicleTollGroup: tollClassLabel(cls),
              passCount: 1,
              source: "Mock" as const,
              reconciled: true,
              lat: g.lat,
              lng: g.lng,
            }));
    return {
      id: `ALT-${i + 1}`,
      label: tr(`Tuyến ${i + 1}`, `Route ${i + 1}`),
      recommended: i === 0,
      distance,
      estimatedTime: Math.round(trip.summary.time / 60),
      geometry,
      bbox: bboxOf(geometry),
      instructions,
      tollCost: tollStations.reduce((s, t) => s + t.price * t.passCount, 0),
      tollStations,
      warnings: [
        tr(
          "Đường đi theo mạng lưới đường bộ OSM (chế độ xe tải); phí cầu đường ước tính theo danh mục trạm đã biết.",
          "Route follows the OSM road network (truck mode); tolls are estimated from the known toll station list.",
        ),
      ],
      roadTypes: { national: distance, expressway: 0, other: 0 },
      provider: "valhalla",
      calculatedAt,
    };
  }

  // Location search stays on master data (routingService); no remote geocoder is used.
  async searchLocation(): Promise<LocationSuggestion[]> {
    return [];
  }

  async resolveLocation(s: LocationSuggestion) {
    return s;
  }

  async getRouteTolls(req: RouteRequest) {
    const r = await this.calculateRoute(req);
    return { tollCost: r.tollCost, tollStations: r.tollStations };
  }
}
