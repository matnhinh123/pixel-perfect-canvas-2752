// Internal Vietmap proxy: /api/vietmap/{status|route|routes|search|place}
// Keeps VIETMAP_API_KEY server-side. Works on any nitro target (Vercel, Cloudflare, Node).
import { createFileRoute } from "@tanstack/react-router";
import type { RouteRequest } from "@/types";
import {
  getVietmapKey,
  vietmapPlace,
  vietmapRoute,
  vietmapRoutes,
  vietmapSearch,
  VietmapHttpError,
} from "@/server/vietmapClient";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const noKey = () =>
  json({ code: "NO_API_KEY", message: "VIETMAP_API_KEY is not configured on the server." }, 503);

const fail = (e: unknown) => {
  if (e instanceof VietmapHttpError) return json({ code: e.code, message: e.message }, e.status);
  return json(
    { code: "ERROR_UNKNOWN", message: e instanceof Error ? e.message : "Unknown error" },
    500,
  );
};

function isRouteRequest(b: unknown): b is RouteRequest {
  const r = b as RouteRequest;
  return (
    !!r &&
    Array.isArray(r.points) &&
    r.points.length >= 2 &&
    r.points.every((p) => typeof p.lat === "number" && typeof p.lng === "number") &&
    ["Car", "Motorcycle", "Truck", "Container"].includes(r.vehicle)
  );
}

export const Route = createFileRoute("/api/vietmap/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const action = params._splat;
        const key = getVietmapKey();
        if (action === "status") return json({ configured: !!key });
        if (!key) return noKey();
        const url = new URL(request.url);
        try {
          if (action === "search") {
            const text = url.searchParams.get("text")?.trim() ?? "";
            if (text.length < 2) return json([]);
            return json(await vietmapSearch(text, key));
          }
          if (action === "place") {
            const refid = url.searchParams.get("refid");
            if (!refid) return json({ code: "INVALID_REQUEST", message: "refid is required" }, 400);
            return json(await vietmapPlace(refid, key));
          }
        } catch (e) {
          return fail(e);
        }
        return json({ code: "NOT_FOUND", message: `Unknown action ${action}` }, 404);
      },
      POST: async ({ request, params }) => {
        const action = params._splat;
        if (action !== "route" && action !== "routes")
          return json({ code: "NOT_FOUND", message: "Unknown action" }, 404);
        const key = getVietmapKey();
        if (!key) return noKey();
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ code: "INVALID_REQUEST", message: "Body must be JSON" }, 400);
        }
        if (!isRouteRequest(body))
          return json(
            {
              code: "INVALID_REQUEST",
              message: "points[>=2] with lat/lng and a valid vehicle are required",
            },
            400,
          );
        try {
          return json(
            action === "routes" ? await vietmapRoutes(body, key) : await vietmapRoute(body, key),
          );
        } catch (e) {
          return fail(e);
        }
      },
    },
  },
});
