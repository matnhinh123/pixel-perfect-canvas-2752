// Fare Code + Fare Name of a variable cost setup (Salary Range, Fuel Cost, Toll Fee): two fields side by
// side. Type the Fare Code or the Fare Name of an active Fare Code: the other one is filled in. Only the
// code is kept (an unknown name leaves no Fare Code).
import { SuggestInput } from "@/components/movex/general/SuggestInput";
import type { FarePair } from "@/components/movex/cost/useFarePair";
import { cn } from "@/lib/utils";

const readBox = "flex h-10 items-center text-sm";

/** Fare Code box (read-only: the code alone). */
export function FareCodeInput({
  pair,
  readOnly,
  invalid,
}: {
  pair: FarePair;
  readOnly?: boolean;
  invalid?: boolean;
}) {
  if (readOnly)
    return (
      <div className={cn(readBox, pair.code ? "font-semibold" : "text-muted-foreground")}>
        {pair.code || "Not mapped"}
      </div>
    );
  return (
    <SuggestInput
      value={pair.code}
      onChange={pair.typeCode}
      suggestions={pair.fares.map((x) => x.code)}
      hint={(c) => pair.fares.find((x) => x.code === c)?.name ?? ""}
      placeholder="Enter Fare Code"
      invalid={!!invalid}
      upper
      emptyText="No matching Fare Code"
    />
  );
}

/** Fare Name box (read-only: the name alone). */
export function FareNameInput({
  pair,
  readOnly,
  invalid,
}: {
  pair: FarePair;
  readOnly?: boolean;
  invalid?: boolean;
}) {
  if (readOnly)
    return (
      <div className={cn(readBox, !pair.name && "text-muted-foreground")}>{pair.name || "—"}</div>
    );
  return (
    <SuggestInput
      value={pair.name}
      onChange={pair.typeName}
      suggestions={pair.fares.map((x) => x.name)}
      hint={(n) => pair.fares.find((x) => x.name === n)?.code ?? ""}
      placeholder="Enter Fare Name"
      invalid={!!invalid}
      emptyText="No matching Fare Name"
    />
  );
}
