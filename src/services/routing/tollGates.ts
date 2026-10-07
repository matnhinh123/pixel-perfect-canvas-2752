// Active Toll Station master records for route pricing. Kept free of service imports: the mock
// provider is loaded while repositories are still initialising (seed data), so only lazy access here.
import { tollStationRepository } from "@/repositories";
import type { TollGateRecord } from "@/mock-data/tollCatalog";

export const activeTollGates = (): TollGateRecord[] =>
  tollStationRepository.all().filter((g) => !g.deleted && g.status === "Active");
