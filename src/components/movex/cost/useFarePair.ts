// The Fare Code / Fare Name pair of a form (Salary Range, Fuel Cost, Toll Fee): type either, the other
// one follows; only the code is kept.
import { useEffect, useMemo, useState } from "react";
import { useCollection } from "@/hooks/use-store";
import { costItemRepository } from "@/repositories";
import type { CostItemRecord } from "@/types";

export interface FarePair {
  code: string;
  name: string;
  fares: CostItemRecord[];
  typeCode: (v: string) => void;
  typeName: (v: string) => void;
}

/** The Fare Code / Fare Name pair of a form: `code` is the Fare Code kept on the draft. */
export function useFarePair(code: string, setCode: (code: string) => void): FarePair {
  const all = useCollection(costItemRepository);
  const fares = useMemo(() => all.filter((c) => !c.deleted && c.status === "Active"), [all]);
  const nameOf = (c: string) =>
    all.find((x) => !x.deleted && x.code.toUpperCase() === c.trim().toUpperCase())?.name ?? "";
  const [name, setName] = useState(() => nameOf(code));
  // The code set from outside (Reset, another version): its name follows.
  useEffect(() => {
    const n = nameOf(code);
    if (code && n) setName(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, all]);
  return {
    code,
    name,
    fares,
    typeCode: (v) => {
      setCode(v);
      setName(nameOf(v));
    },
    typeName: (v) => {
      setName(v);
      const hit = fares.find((x) => x.name.toLowerCase() === v.trim().toLowerCase());
      setCode(hit ? hit.code : "");
    },
  };
}
