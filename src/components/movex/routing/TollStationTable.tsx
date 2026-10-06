import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Link2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, Field, NativeSelect, Tag } from "@/components/movex/common";
import { MOCK_TOLL_GATES, type MockTollGate } from "@/mock-data/tollCatalog";
import { formatVnd } from "@/lib/format";
import type { ManualCost, TollStation } from "@/types";
import { cn } from "@/lib/utils";

export interface TollRow {
  key: string;
  leg: "Outbound" | "Return";
  station: TollStation;
}

function ReconcileBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
        ok ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
      )}
    >
      {ok ? "Đã đối chiếu" : "Chưa đối chiếu"}
    </span>
  );
}

/** Toll stations of the selected route (+ return leg) and manual tolls, with master-data reconciliation. */
export function TollStationTable({
  rows,
  showLeg,
  manualCosts,
  calculated,
  onMap,
  onRemoveManual,
}: {
  rows: TollRow[];
  showLeg?: boolean;
  manualCosts: ManualCost[];
  calculated: boolean;
  onMap: (row: TollRow, gate: MockTollGate) => void;
  onRemoveManual: (id: string) => void;
}) {
  const [mapping, setMapping] = useState<TollRow | null>(null);

  if (rows.length === 0 && manualCosts.length === 0)
    return (
      <EmptyState
        title="Không có trạm thu phí"
        description={
          calculated
            ? "Tuyến được chọn không đi qua trạm thu phí nào."
            : 'Bấm "Tính lại lộ trình" để lấy danh sách trạm.'
        }
      />
    );

  const headers = ["#", "Mã trạm", "Tên trạm", "Vị trí", "Mức phí", "Trạng thái đối chiếu"];
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {headers.map((h) => (
              <TableHead
                key={h}
                className={cn(
                  "h-9 text-sm font-semibold text-foreground",
                  h === "Mức phí" && "text-right",
                )}
              >
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => {
            const t = r.station;
            const ok = t.reconciled !== false;
            return (
              <TableRow key={r.key}>
                <TableCell className="w-10 py-2 text-center">{i + 1}</TableCell>
                <TableCell className="py-2">
                  {t.code ? (
                    <Link
                      to="/toll-station"
                      search={{ q: t.code }}
                      className="font-medium text-primary hover:underline"
                    >
                      {t.code}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="py-2">
                  {t.name}
                  {showLeg && (
                    <span className="ml-2 align-middle">
                      <Tag tone={r.leg}>{r.leg === "Outbound" ? "Chiều đi" : "Chiều về"}</Tag>
                    </span>
                  )}
                </TableCell>
                <TableCell className="py-2 text-muted-foreground">{t.address || "—"}</TableCell>
                <TableCell className="py-2 text-right font-medium">
                  {formatVnd(t.price * t.passCount)}
                </TableCell>
                <TableCell className="py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <ReconcileBadge ok={ok} />
                    {!ok && (
                      <button
                        type="button"
                        onClick={() => setMapping(r)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        Map to Toll Station Master
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {manualCosts.map((m, i) => (
            <TableRow key={m.id}>
              <TableCell className="w-10 py-2 text-center">{rows.length + i + 1}</TableCell>
              <TableCell className="py-2 text-muted-foreground">—</TableCell>
              <TableCell className="py-2">
                {m.reason}
                {m.note && <div className="text-xs text-muted-foreground">{m.note}</div>}
              </TableCell>
              <TableCell className="py-2 text-muted-foreground">{m.costType}</TableCell>
              <TableCell className="py-2 text-right font-medium">{formatVnd(m.amount)}</TableCell>
              <TableCell className="py-2">
                <div className="flex items-center gap-2">
                  <Tag tone="Manual">Thủ công</Tag>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onRemoveManual(m.id)}
                    aria-label="Xoá phí thủ công"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <MapTollDialog
        row={mapping}
        onClose={() => setMapping(null)}
        onConfirm={(gate) => {
          if (mapping) onMap(mapping, gate);
          setMapping(null);
        }}
      />
    </>
  );
}

function MapTollDialog({
  row,
  onClose,
  onConfirm,
}: {
  row: TollRow | null;
  onClose: () => void;
  onConfirm: (gate: MockTollGate) => void;
}) {
  const [gateId, setGateId] = useState("");
  const gate = MOCK_TOLL_GATES.find((g) => g.id === gateId);
  return (
    <Dialog
      open={!!row}
      onOpenChange={(o) => {
        if (!o) {
          setGateId("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Map to Toll Station Master</DialogTitle>
          <DialogDescription>
            Gán trạm “{row?.station.name}” do routing engine trả về với một trạm trong danh mục Toll
            Station.
          </DialogDescription>
        </DialogHeader>
        <Field label="Trạm trong Toll Station Master" required>
          <NativeSelect
            value={gateId}
            onChange={setGateId}
            className="h-10"
            options={["", ...MOCK_TOLL_GATES.map((g) => g.id)]}
            labels={{
              "": "— Chọn trạm —",
              ...Object.fromEntries(
                MOCK_TOLL_GATES.map((g) => [g.id, `${g.code} · ${g.name} (${g.province})`]),
              ),
            }}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            disabled={!gate}
            onClick={() => {
              if (!gate) return;
              setGateId("");
              onConfirm(gate);
            }}
          >
            <Link2 className="h-4 w-4" />
            Đối chiếu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
