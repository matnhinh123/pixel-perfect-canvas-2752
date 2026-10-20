// Rate basis shared by the Variable Cost and COGS screens (demo values).
import type { Terrain } from "@/types";

/** Reference diesel price (VND / litre). */
export const FUEL_PRICE = 19_500;

/** Terrain adjustment applied to the fuel norm. */
export const TERRAIN_FACTORS: Record<Terrain, number> = { Plain: 1, Highland: 1.15 };
