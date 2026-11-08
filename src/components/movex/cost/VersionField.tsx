// Version of a setup (Salary Range, Fuel Cost): 1 when created, +1 on each save that changes it. The
// picker lists the current version and the earlier ones (when and by whom each was saved); picking an
// earlier one shows the setup as it was then, read-only.
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/movex/common";
import { formatDateTime } from "@/lib/format";
import { versionOf, type Versioned } from "@/services/cost/versions";

/** "v3 · current · 29/10/2026 10:05 · Nhat Pham", then the earlier versions, newest first. */
function versionLabels<D>(r: Versioned<D>): Record<string, string> {
  const cur = versionOf(r);
  const when = (at: string, by: string) =>
    [at ? formatDateTime(at) : "", by].filter(Boolean).join(" · ");
  return {
    [cur]: `v${cur} · current · ${when(r.updatedAt || r.createdAt, r.updatedBy || r.createdBy)}`,
    ...Object.fromEntries(
      (r.history ?? []).map((h) => [h.version, `v${h.version} · ${when(h.savedAt, h.savedBy)}`]),
    ),
  };
}

/** Picks the version shown; `onPick` gets the version (the current one included). */
export function VersionSelect<D>({
  record,
  value,
  onPick,
  className,
}: {
  record: Versioned<D>;
  value: number;
  onPick: (version: number) => void;
  className?: string;
}) {
  const labels = versionLabels(record);
  const options = Object.keys(labels).sort((a, b) => Number(b) - Number(a));
  return (
    <NativeSelect
      value={String(value)}
      onChange={(v) => onPick(Number(v))}
      options={options}
      labels={labels}
      disabled={options.length < 2}
      className={className ?? "h-10 w-full"}
    />
  );
}

/** Banner over an earlier version: read-only, and the way back to the current one. */
export function OldVersionBanner({
  version,
  current,
  savedAt,
  savedBy,
  onBack,
}: {
  version: number;
  current: number;
  savedAt?: string | undefined;
  savedBy?: string | undefined;
  onBack: () => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
      <History className="h-4 w-4 shrink-0 text-warning" />
      <span>
        Viewing <b>version {version}</b>
        {savedAt ? ` (saved ${formatDateTime(savedAt)}${savedBy ? ` by ${savedBy}` : ""})` : ""} —
        read-only. The current version is v{current}.
      </span>
      <Button variant="outline" size="sm" className="ml-auto h-8" onClick={onBack}>
        Back to current version
      </Button>
    </div>
  );
}
