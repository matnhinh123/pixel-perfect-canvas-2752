import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GitBranch,
  History,
  Info,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Route as RouteIcon,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EmptyState,
  Field,
  NativeSelect,
  Panel,
  StatusBadge,
  Tag,
  thClass,
} from "@/components/movex/common";
import { AuditHistoryDrawer } from "@/components/movex/AuditDrawer";
import {
  FormErrorBanner,
  FormPageHeader,
  useUnsavedChangesGuard,
} from "@/components/movex/general/FormPage";
import { useEntityActions } from "@/components/movex/general/useEntityActions";
import { useCollection } from "@/hooks/use-store";
import { costRepository, routeRepository, uid } from "@/repositories";
import { defaultCostLines } from "@/mock-data/rates";
import { auditService } from "@/services/auditService";
import { BusinessRuleError } from "@/services/crudService";
import {
  activeVersion,
  costCrud,
  costService,
  formFromCost,
  latestVersion,
  needsNewVersion,
  newCostForm,
  validateCost,
  type CostForm,
} from "@/services/costService";
import { lineAmount, lineQuantity, snapshotOf, summarize } from "@/services/cost/costMath";
import { formatDate, formatDateTime, formatDuration, formatVnd } from "@/lib/format";
import {
  COST_BASES,
  EDITABLE_COST_CATEGORIES,
  VEHICLE_GROUPS,
  type CostBasis,
  type CostCategory,
  type CostRecord,
  type RouteSnapshot,
  type Status,
  type VehicleGroup,
} from "@/types";

type Mode = "view" | "edit";

export const Route = createFileRoute("/cost/$id")({
  validateSearch: (s: Record<string, unknown>): { mode?: Mode; routeId?: string } => ({
    ...(s["mode"] === "view" || s["mode"] === "edit" ? { mode: s["mode"] } : {}),
    ...(typeof s["routeId"] === "string" ? { routeId: s["routeId"] } : {}),
  }),
  head: ({ params }) => ({
    meta: [
      { title: params.id === "new" ? "Add Cost — MoveX" : "Cost Detail — MoveX" },
      {
        name: "description",
        content: "Route cost with versioning, effective date and cost summary.",
      },
      { property: "og:title", content: "Cost Detail — MoveX" },
      {
        property: "og:description",
        content: "Route cost with versioning, effective date and cost summary.",
      },
    ],
  }),
  component: CostDetailPage,
});

function CostDetailPage() {
  const { id } = Route.useParams();
  const all = useCollection(costRepository);
  const source = id === "new" ? null : (all.find((c) => c.id === id && !c.deleted) ?? null);
  if (id !== "new" && !source)
    return (
      <Panel>
        <EmptyState
          icon={<XCircle className="h-8 w-8" />}
          title="Không tìm thấy bản ghi Cost"
          action={
            <Button asChild size="sm">
              <Link to="/cost">Về danh sách Cost</Link>
            </Button>
          }
        />
      </Panel>
    );
  return <CostEditor key={source?.id ?? "new"} source={source} />;
}

const SUMMARY_ROWS: [keyof ReturnType<typeof summarize>, string][] = [
  ["fixed", "Fixed Cost"],
  ["fuel", "Fuel Cost"],
  ["driver", "Driver Cost"],
  ["toll", "Toll Cost"],
  ["ferry", "Ferry Cost"],
  ["other", "Other Cost"],
];

function CostEditor({ source }: { source: CostRecord | null }) {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const isNew = !source;
  const readOnly = !isNew && (search.mode ?? "view") === "view";
  const routesAll = useCollection(routeRepository);
  const routes = routesAll.filter((r) => !r.deleted);

  const initial = useMemo<CostForm>(() => {
    if (source) return formFromCost(source);
    const f = newCostForm();
    const r = search.routeId ? routesAll.find((x) => x.id === search.routeId) : undefined;
    if (!r) return f;
    return {
      ...f,
      routeId: r.id,
      vehicleGroup: r.vehicleGroup,
      code: `CST-${r.code.replace(/^RT-/, "")}-${r.vehicleGroup.slice(0, 3).toUpperCase()}`,
      lines: defaultCostLines(r.vehicleGroup).map((l) => ({ ...l, id: uid("L-") })),
    };
  }, [source]); // eslint-disable-line react-hooks/exhaustive-deps

  const [f, setF] = useState<CostForm>(() => structuredClone(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const actions = useEntityActions(costCrud);

  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const guard = useUnsavedChangesGuard(dirty && !readOnly);
  useEffect(() => {
    if (source) auditService.logView("Cost", source.id, source.code);
  }, [source?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (readOnly) setF(structuredClone(initial));
  }, [initial, readOnly]);

  const route = routesAll.find((r) => r.id === f.routeId);
  const liveSnap: RouteSnapshot | null = route?.outbound ? snapshotOf(route) : null;
  const latest = source ? latestVersion(source) : null;
  const active = source ? activeVersion(source) : undefined;
  // View mode shows the saved version exactly as it was released; edit mode uses live route data.
  const snap = readOnly && latest?.routeSnapshot ? latest.routeSnapshot : liveSnap;
  const summary = summarize(f.lines, snap);
  const willVersion = !!source && !readOnly && needsNewVersion(source, f);
  const routeDrift =
    !!latest?.routeSnapshot &&
    !!liveSnap &&
    (latest.routeSnapshot.tollCost !== liveSnap.tollCost ||
      latest.routeSnapshot.distanceKm !== liveSnap.distanceKm ||
      latest.routeSnapshot.ferryCost !== liveSnap.ferryCost);

  const set = <K extends keyof CostForm>(k: K, v: CostForm[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    if (errors[k as string])
      setErrors((e) => {
        const n = { ...e };
        delete n[k as string];
        return n;
      });
  };
  const setLine = (id: string, patch: Partial<CostForm["lines"][number]>) =>
    set(
      "lines",
      f.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );

  const save = (statusOverride?: Status) => {
    setFormError(null);
    const form = statusOverride ? { ...f, status: statusOverride } : f;
    const e = validateCost(form, source ?? undefined);
    if (Object.keys(e).length) {
      setErrors(e);
      setFormError("Chưa thể lưu — vui lòng kiểm tra:");
      toast.error("Vui lòng kiểm tra các trường được đánh dấu.");
      return;
    }
    try {
      const saved = costService.save(form);
      guard.allowNext();
      const v = latestVersion(saved);
      toast.success(
        isNew
          ? `Cost ${saved.code} created (v1)`
          : willVersion
            ? `New version v${v.version} created — v${latest!.version} kept in history`
            : `Cost ${saved.code} saved`,
      );
      void navigate({ to: "/cost/$id", params: { id: saved.id }, search: { mode: "view" } });
    } catch (err) {
      if (err instanceof BusinessRuleError) {
        setErrors(err.fieldErrors);
        setFormError(err.message);
      }
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    }
  };

  const routeOptions = routes.filter((r) => r.outbound || r.id === f.routeId);
  const versionsDesc = source ? [...source.versions].sort((a, b) => b.version - a.version) : [];

  return (
    <div>
      <FormPageHeader
        crumbs={[
          { label: "Cost", to: "/cost" },
          { label: isNew ? "Tạo mới" : readOnly ? source!.code : "Chỉnh sửa" },
        ]}
        title={isNew ? "Tạo mới Cost" : readOnly ? `Cost ${source!.code}` : "Chỉnh sửa Cost"}
        badge={<StatusBadge status={source?.status ?? f.status} />}
        subtitle={source ? source.name : "Chi phí tuyến theo Route + Vehicle Group"}
        dirty={dirty}
        readOnly={readOnly}
        onBack={() => void navigate({ to: "/cost" })}
        onCancel={() =>
          isNew
            ? void navigate({ to: "/cost" })
            : void navigate({
                to: "/cost/$id",
                params: { id: source!.id },
                search: { mode: "view" },
              })
        }
        onSaveDraft={() => save("Draft")}
        onSave={() => save()}
        saveLabel={willVersion ? "Save as new version" : "Save"}
        extra={
          <>
            {route && (
              <Button variant="outline" asChild>
                <Link to="/routing/$id" params={{ id: route.id }} search={{ mode: "view" }}>
                  <RouteIcon className="h-4 w-4" />
                  Mở Route
                </Link>
              </Button>
            )}
            {source && (
              <Button variant="outline" onClick={() => setAuditOpen(true)}>
                <History className="h-4 w-4" />
                Audit History
              </Button>
            )}
            {readOnly &&
              source &&
              (source.status === "Inactive" ? (
                <Button
                  variant="outline"
                  onClick={() => void actions.setStatus([source], "Active")}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Activate
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => void actions.setStatus([source], "Inactive")}
                >
                  <XCircle className="h-4 w-4" />
                  Deactivate
                </Button>
              ))}
            {readOnly && (
              <Button
                onClick={() =>
                  void navigate({
                    to: "/cost/$id",
                    params: { id: source!.id },
                    search: { mode: "edit" },
                  })
                }
              >
                <Pencil className="h-4 w-4" />
                Chỉnh sửa
              </Button>
            )}
          </>
        }
      />
      <FormErrorBanner message={formError} errors={errors} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Route", route ? route.code : "—"],
          ["Vehicle Group", f.vehicleGroup],
          ["Hiệu lực từ", f.effectiveFrom ? formatDate(f.effectiveFrom) : "—"],
          [
            "Phiên bản",
            source
              ? `v${latest!.version} ${latest!.status}${active && active.version !== latest!.version ? ` · Active v${active.version}` : ""}`
              : "v1 (new)",
          ],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="text-xs font-medium text-muted-foreground">{k}</div>
            <div className="mt-1 font-semibold">{v}</div>
          </div>
        ))}
      </div>

      {willVersion && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-info/40 bg-info-soft px-4 py-3 text-sm text-info">
          <GitBranch className="mt-0.5 h-4 w-4" />
          <div>
            Bạn đang sửa phiên bản đã phát hành <b>v{latest!.version}</b> (hiệu lực{" "}
            {formatDate(latest!.effectiveFrom)}). Phiên bản này <b>không</b> bị ghi đè — khi lưu sẽ
            tạo <b>v{latest!.version + 1}</b>. Ngày hiệu lực phải sau{" "}
            {formatDate(latest!.effectiveFrom)}.
          </div>
        </div>
      )}
      {readOnly && routeDrift && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <div>
            Route {route?.code} đã thay đổi sau khi lưu v{latest!.version} (phí cầu đường{" "}
            {formatVnd(latest!.routeSnapshot!.tollCost)} → {formatVnd(liveSnap!.tollCost)}). Số liệu
            dưới đây là snapshot đã lưu; chỉnh sửa và lưu để tạo phiên bản với dữ liệu route mới
            nhất.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-6 xl:col-span-2">
          <Panel title="Route & Vehicle Group">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <Field label="Mã chi phí" required error={errors["code"]}>
                <Input
                  value={f.code}
                  onChange={(e) => set("code", e.target.value.toUpperCase())}
                  aria-invalid={!!errors["code"] || undefined}
                />
              </Field>
              <Field label="Tên" className="lg:col-span-2">
                <Input
                  value={f.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder={
                    route
                      ? `${route.code} · ${f.vehicleGroup}`
                      : "Tự động theo route + vehicle group"
                  }
                />
              </Field>
              <Field
                label="Route"
                required
                error={errors["routeId"]}
                className="lg:col-span-2"
                hint="Chỉ chọn được route đã tính lộ trình trong module Routing."
              >
                <NativeSelect
                  value={f.routeId}
                  invalid={!!errors["routeId"]}
                  onChange={(v) => {
                    const r = routesAll.find((x) => x.id === v);
                    setF((p) => ({
                      ...p,
                      routeId: v,
                      ...(r && isNew
                        ? {
                            vehicleGroup: r.vehicleGroup,
                            lines: defaultCostLines(r.vehicleGroup).map((l) => ({
                              ...l,
                              id: uid("L-"),
                            })),
                          }
                        : {}),
                    }));
                    setErrors((e) => {
                      const n = { ...e };
                      delete n["routeId"];
                      return n;
                    });
                  }}
                  options={["", ...routeOptions.map((r) => r.id)]}
                  labels={{
                    "": "Chọn route…",
                    ...Object.fromEntries(
                      routeOptions.map((r) => [
                        r.id,
                        `${r.code} · ${r.name}${r.status !== "Active" ? ` (${r.status})` : ""}`,
                      ]),
                    ),
                  }}
                />
              </Field>
              <Field label="Vehicle Group" required>
                <NativeSelect
                  value={f.vehicleGroup}
                  onChange={(v) => set("vehicleGroup", v as VehicleGroup)}
                  options={VEHICLE_GROUPS}
                />
              </Field>
              <Field label="Hiệu lực từ" required error={errors["effectiveFrom"]}>
                <Input
                  type="date"
                  value={f.effectiveFrom}
                  onChange={(e) => set("effectiveFrom", e.target.value)}
                  aria-invalid={!!errors["effectiveFrom"] || undefined}
                />
              </Field>
              <Field label="Trạng thái">
                <NativeSelect
                  value={f.status}
                  onChange={(v) => set("status", v as Status)}
                  options={["Draft", "Active", "Inactive"]}
                />
              </Field>
              <Field label="Ghi chú phiên bản">
                <Input
                  value={f.note}
                  onChange={(e) => set("note", e.target.value)}
                  placeholder="VD: Fuel price +6%"
                />
              </Field>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                ["Khoảng cách tuyến", snap ? `${snap.distanceKm} km` : "—"],
                ["Thời gian ước tính", snap ? formatDuration(snap.estimatedTimeMin) : "—"],
                [
                  "Toll Cost (từ Routing)",
                  snap ? formatVnd(snap.tollCost + snap.ferryCost + snap.otherRouteCost) : "—",
                ],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-muted p-3">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    {k}
                  </div>
                  <div className="mt-0.5 font-semibold">{v}</div>
                </div>
              ))}
            </div>
            {route?.type === "Round Trip" && (
              <p className="mt-2 text-xs text-muted-foreground">
                Round Trip: khoảng cách, thời gian và phí cầu đường gồm cả chiều đi và chiều về (mỗi
                chiều tính trạm riêng).
              </p>
            )}
          </Panel>

          <Panel
            title="Dòng chi phí"
            actions={
              !readOnly && (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      set(
                        "lines",
                        defaultCostLines(f.vehicleGroup).map((l) => ({ ...l, id: uid("L-") })),
                      )
                    }
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Lấy lại đơn giá chuẩn
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      set("lines", [
                        ...f.lines,
                        {
                          id: uid("L-"),
                          category: "Other",
                          description: "",
                          basis: "Per trip",
                          rate: 0,
                        },
                      ])
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Thêm dòng
                  </Button>
                </div>
              )
            }
          >
            {errors["lines"] && (
              <p className="mb-2 text-xs font-medium text-destructive">{errors["lines"]}</p>
            )}
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {[
                      "Nhóm",
                      "Diễn giải",
                      "Cách tính",
                      "Đơn giá (₫)",
                      "Số lượng",
                      "Thành tiền",
                      "",
                    ].map((h) => (
                      <TableHead key={h} className={thClass}>
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {f.lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="w-32">
                        <NativeSelect
                          className="w-full"
                          value={l.category}
                          onChange={(v) => setLine(l.id, { category: v as CostCategory })}
                          options={EDITABLE_COST_CATEGORIES}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-9"
                          value={l.description}
                          onChange={(e) => setLine(l.id, { description: e.target.value })}
                          aria-invalid={!l.description.trim() || undefined}
                        />
                      </TableCell>
                      <TableCell className="w-32">
                        <NativeSelect
                          className="w-full"
                          value={l.basis}
                          onChange={(v) => setLine(l.id, { basis: v as CostBasis })}
                          options={COST_BASES}
                        />
                      </TableCell>
                      <TableCell className="w-36">
                        <Input
                          className="h-9"
                          type="number"
                          min={0}
                          value={l.rate}
                          onChange={(e) => setLine(l.id, { rate: Number(e.target.value) })}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {snap
                          ? `${Math.round(lineQuantity(l, snap) * 100) / 100} ${l.basis === "Per km" ? "km" : l.basis === "Per hour" ? "h" : "trip"}`
                          : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-semibold">
                        {snap ? formatVnd(lineAmount(l, snap)) : "—"}
                      </TableCell>
                      <TableCell>
                        {!readOnly && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              set(
                                "lines",
                                f.lines.filter((x) => x.id !== l.id),
                              )
                            }
                            aria-label="Remove line"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {[
                    ["Toll", "Trạm thu phí (chiều đi + chiều về)", snap?.tollCost],
                    ["Ferry", "Phà + chi phí phà thủ công", snap?.ferryCost],
                    ["Other", "Phụ phí thủ công của route", snap?.otherRouteCost],
                  ].map(([c, d, v]) => (
                    <TableRow key={String(c)} className="bg-muted/30">
                      <TableCell>
                        <Tag tone="Auto">{String(c)}</Tag>
                      </TableCell>
                      <TableCell className="text-muted-foreground" colSpan={4}>
                        <span className="flex items-center gap-1">
                          <Lock className="h-3 w-3" />
                          {String(d)} — from Route {route?.code ?? ""}
                        </span>
                      </TableCell>
                      <TableCell className="font-semibold">
                        {v != null ? formatVnd(Number(v)) : "—"}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={5} className="text-right">
                      Total Estimated Cost
                    </TableCell>
                    <TableCell className="font-bold text-primary" colSpan={2}>
                      {formatVnd(summary.total)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </Panel>
        </fieldset>

        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Cost Summary">
            <div className="flex flex-col gap-3">
              {SUMMARY_ROWS.map(([k, label]) => {
                const v = summary[k];
                return (
                  <div key={k}>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-semibold">{formatVnd(v)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${summary.total ? (v / summary.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="mt-2 rounded-lg bg-primary p-4 text-primary-foreground">
                <div className="text-xs opacity-80">Total Estimated Cost</div>
                <div className="text-2xl font-bold">{formatVnd(summary.total)}</div>
                <div className="text-xs opacity-80">
                  {snap
                    ? `${snap.distanceKm} km · ${route?.type ?? ""}`
                    : "Chọn một route đã tính lộ trình"}
                </div>
              </div>
              {!snap && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5" />
                  Chọn route để tính nhiên liệu, tài xế và phí cầu đường.
                </p>
              )}
            </div>
          </Panel>

          <Panel title={`Version History (${versionsDesc.length})`}>
            {versionsDesc.length === 0 ? (
              <p className="text-sm text-muted-foreground">v1 sẽ được tạo khi lưu lần đầu.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {["", "Phiên bản", "Hiệu lực", "Trạng thái", "Tổng"].map((h) => (
                        <TableHead key={h} className={thClass}>
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {versionsDesc.map((v) => (
                      <Fragment key={v.version}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() => setExpanded(expanded === v.version ? null : v.version)}
                        >
                          <TableCell className="w-6 px-2">
                            {expanded === v.version ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </TableCell>
                          <TableCell className="font-semibold">v{v.version}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatDate(v.effectiveFrom)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={v.status} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-medium">
                            {formatVnd(v.totalEstimated)}
                          </TableCell>
                        </TableRow>
                        {expanded === v.version && (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={5} className="text-xs">
                              <div className="mb-1 text-muted-foreground">
                                {v.createdBy} · {formatDateTime(v.createdAt)}
                                {v.note ? ` · “${v.note}”` : ""}
                              </div>
                              {v.lines.map((l) => (
                                <div key={l.id} className="flex justify-between">
                                  <span>
                                    {l.category}: {l.description}
                                  </span>
                                  <span>
                                    {formatVnd(l.rate)} / {l.basis.replace("Per ", "")}
                                  </span>
                                </div>
                              ))}
                              {v.routeSnapshot && (
                                <div className="mt-1 border-t pt-1 text-muted-foreground">
                                  Route snapshot {v.routeSnapshot.routeCode}:{" "}
                                  {v.routeSnapshot.distanceKm} km · toll{" "}
                                  {formatVnd(v.routeSnapshot.tollCost)} · ferry{" "}
                                  {formatVnd(v.routeSnapshot.ferryCost)}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Phiên bản đã phát hành không bị sửa; mọi thay đổi tạo phiên bản mới.
            </p>
          </Panel>
        </div>
      </div>
      {source && (
        <AuditHistoryDrawer
          open={auditOpen}
          onOpenChange={setAuditOpen}
          entityType="Cost"
          entityId={source.id}
          title={source.code}
        />
      )}
    </div>
  );
}
