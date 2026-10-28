// Container Types (Common Code, ISO group codes): the headers' vehicle types and the Salary Range columns.
import type { CommonCodeRecord } from "@/types";
import { commonCodeRepository } from "@/repositories";
import { CC } from "@/mock-data/commonCodes";
import { SEED_CONTAINER_TYPES, type ContainerTypeChoice } from "./cogsVehicle";

/** Active Container Types of a Common Code record (the seed list when there is none). */
export const containerChoicesOf = (rec: CommonCodeRecord | undefined): ContainerTypeChoice[] =>
  rec && !rec.deleted
    ? rec.options
        .filter((o) => o.active && o.name.trim())
        .map((o) => ({ iso: o.name.trim(), size: o.attribute, name: o.values?.["en"] || o.name }))
    : SEED_CONTAINER_TYPES;

/** The live Container Types (outside React). */
export const liveContainerTypes = () =>
  containerChoicesOf(commonCodeRepository.get(CC.CONTAINER_TYPE));
