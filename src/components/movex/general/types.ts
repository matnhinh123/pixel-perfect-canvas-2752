import type { ReactNode } from "react";
import type { CellValue, FieldMeta } from "@/services/filterService";
import type { FilterCondition } from "@/types";

/** Column definition shared by DataTable, filter, column settings and export. */
export interface ListColumn<T> extends FieldMeta {
  /** Raw value used for sort / filter / export (export uses exportValue if provided). */
  value: (row: T) => CellValue;
  render?: (row: T) => ReactNode;
  exportValue?: (row: T) => CellValue;
  defaultHidden?: boolean;
  width?: number;
  sortable?: boolean;
  filterable?: boolean;
  className?: string;
  /** Pinned columns cannot be hidden (e.g. the code column). */
  pinned?: boolean;
}

export interface QuickFilterOption {
  label: string;
  conditions: Omit<FilterCondition, "id">[];
}

export interface QuickFilter {
  key: string;
  allLabel: string;
  options: QuickFilterOption[];
}
