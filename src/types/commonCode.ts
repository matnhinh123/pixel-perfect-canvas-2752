import type { BaseRecord } from "./common";

/**
 * Customizable: options can be added, renamed, deactivated or removed.
 * Fixed: the system runs rules on these values, so options can only be activated / deactivated.
 */
export type CommonCodeKind = "Customizable" | "Fixed";

export interface CommonCodeAttribute {
  code: string;
  name: string;
}

export interface CommonCodeOption {
  /** System-generated, e.g. BP0201. */
  code: string;
  name: string;
  /** Attribute code; for a dependent list it is the parent value (e.g. the Location Type). */
  attribute: string;
  remark: string;
  active: boolean;
}

/** Where a code list is used (read-only, defined by the system). */
export interface CommonCodeUsage {
  module: string;
  screen: string;
  field: string;
}

/** One code list behind a dropdown. Defined by the system: types are never added by users. */
export interface CommonCodeRecord extends BaseRecord {
  /** Type code, e.g. BP02 (also the record id). */
  code: string;
  name: string;
  kind: CommonCodeKind;
  remark: string;
  usage: CommonCodeUsage[];
  /** Attributes an option can carry (DEFAULT, or the parent values of a dependent list). */
  attributes: CommonCodeAttribute[];
  options: CommonCodeOption[];
  /**
   * Option codes the system relies on inside a Customizable list: they cannot be renamed, given
   * another attribute or removed (only deactivated). E.g. TRUCK / HEAD / TRAILER of Vehicle Type.
   */
  lockedOptions?: string[];
}
