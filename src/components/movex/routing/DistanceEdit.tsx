import { useState } from "react";
import { Check, Pencil, RotateCcw, X } from "lucide-react";

/** "1.781,7 km ✎" — click the pencil to correct the calculated distance; ↺ restores it. */
export function DistanceEdit({
  km,
  adjusted,
  onChange,
}: {
  km: number;
  adjusted: boolean;
  /** `null` restores the calculated distance. */
  onChange: (km: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const commit = () => {
    const v = Math.round(Number(draft.replace(",", ".")) * 10) / 10;
    if (Number.isFinite(v) && v > 0 && v !== km) onChange(v);
    setEditing(false);
  };
  if (editing)
    return (
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          type="number"
          min={0.1}
          step={0.1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-7 w-24 rounded border bg-background px-1.5 text-sm font-semibold"
        />
        <span className="text-sm">km</span>
        <button type="button" aria-label="Save" onClick={commit} className="text-primary">
          <Check className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Cancel"
          onClick={() => setEditing(false)}
          className="text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-semibold">{km} km</span>
      <button
        type="button"
        title="Adjust distance"
        aria-label="Adjust distance"
        onClick={() => {
          setDraft(String(km));
          setEditing(true);
        }}
        className="text-muted-foreground hover:text-primary"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      {adjusted && (
        <button
          type="button"
          title="Restore calculated distance"
          aria-label="Restore calculated distance"
          onClick={() => onChange(null)}
          className="text-muted-foreground hover:text-primary"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}
