import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
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
import {
  EmptyState,
  Field,
  NativeSelect,
  Panel,
  StatusBadge,
  Tag,
  thClass,
} from "@/components/movex/common";
import { useConfirm } from "@/components/movex/general/ConfirmDialog";
import { useCollection } from "@/hooks/use-store";
import { serviceAssignmentRepository } from "@/repositories";
import { DEPARTMENTS, departmentName, employeeName, employeesOf } from "@/mock-data/staff";
import { formName } from "@/mock-data/templates";
import { BusinessRuleError } from "@/services/crudService";
import {
  newAssignmentDraft,
  serviceAssignmentService,
  validateAssignment,
  type AssignmentDraft,
} from "@/services/serviceAssignmentService";
import { templateOf } from "@/services/serviceCatalogService";
import type { ServiceAssignment, ServiceRecord, Status } from "@/types";

/** Tab "Phân công": departments / employees that handle this service. */
export function ServiceAssignments({
  service,
  services,
}: {
  service: ServiceRecord;
  services: ServiceRecord[];
}) {
  const confirm = useConfirm();
  const all = useCollection(serviceAssignmentRepository);
  const rows = serviceAssignmentService.forService(service.id, all);
  const form = templateOf(service, services);
  const [editing, setEditing] = useState<ServiceAssignment | "new" | null>(null);

  const remove = async (a: ServiceAssignment) => {
    const r = await confirm({
      title: "Xoá phân công?",
      description: `${departmentName(a.departmentId)} · ${employeeName(a.employeeId)}`,
      confirmLabel: "Xoá",
      tone: "danger",
    });
    if (r !== "confirm") return;
    serviceAssignmentService.remove(service, a.id);
    toast.success("Đã xoá phân công");
  };

  return (
    <Panel
      title="Phân công"
      bodyClassName="p-0"
      actions={
        <Button
          variant="outline"
          size="sm"
          className="h-8 border-primary/40 text-primary"
          onClick={() => setEditing("new")}
        >
          <Plus className="h-4 w-4" />
          Thêm phân công
        </Button>
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          title="Chưa có phân công"
          description="Thêm phòng ban hoặc nhân viên xử lý dịch vụ này."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {["Phòng ban", "Nhân viên", "Form", "Ghi chú", "Trạng thái", "Thao tác"].map((h) => (
                <TableHead key={h} className={thClass}>
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="py-2.5 font-medium">
                  {departmentName(a.departmentId)}
                </TableCell>
                <TableCell className="py-2.5">
                  {a.employeeId ? (
                    employeeName(a.employeeId)
                  ) : (
                    <span className="text-muted-foreground">Cả phòng</span>
                  )}
                </TableCell>
                <TableCell className="py-2.5">
                  {a.form ? (
                    <Tag tone="tpl">{formName(a.form)}</Tag>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="py-2.5">{a.note || "—"}</TableCell>
                <TableCell className="py-2.5">
                  <StatusBadge status={a.status} />
                </TableCell>
                <TableCell className="py-1.5">
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Sửa phân công"
                      onClick={() => setEditing(a)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      aria-label="Xoá phân công"
                      onClick={() => void remove(a)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {editing && (
        <AssignmentDialog
          key={editing === "new" ? "new" : editing.id}
          service={service}
          form={form}
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Panel>
  );
}

function AssignmentDialog({
  service,
  form,
  initial,
  onClose,
}: {
  service: ServiceRecord;
  form: ServiceRecord["template"];
  initial: ServiceAssignment | null;
  onClose: () => void;
}) {
  const [d, setD] = useState<AssignmentDraft>(() =>
    initial
      ? {
          departmentId: initial.departmentId,
          employeeId: initial.employeeId,
          form: initial.form,
          note: initial.note,
          status: initial.status,
        }
      : { ...newAssignmentDraft(), form },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof AssignmentDraft>(k: K, v: AssignmentDraft[K]) => {
    setD((p) => ({ ...p, [k]: v }));
    setErrors((e) => {
      const n = { ...e };
      delete n[k];
      return n;
    });
  };
  const staff = employeesOf(d.departmentId);

  const save = () => {
    const e = validateAssignment(d, service);
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    try {
      serviceAssignmentService.save(service, d, initial?.id);
      toast.success(initial ? "Đã cập nhật phân công" : "Đã thêm phân công");
      onClose();
    } catch (err) {
      if (err instanceof BusinessRuleError) setErrors(err.fieldErrors);
      else toast.error("Lưu thất bại");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Sửa phân công" : "Thêm phân công"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Phòng ban" required error={errors["departmentId"]}>
            <NativeSelect
              value={d.departmentId}
              invalid={!!errors["departmentId"]}
              onChange={(v) => {
                set("departmentId", v);
                if (d.employeeId && !employeesOf(v).some((x) => x.id === d.employeeId))
                  set("employeeId", null);
              }}
              options={["", ...DEPARTMENTS.map((x) => x.id)]}
              labels={{
                "": "Chọn phòng ban…",
                ...Object.fromEntries(DEPARTMENTS.map((x) => [x.id, x.name])),
              }}
            />
          </Field>
          <Field label="Nhân viên" error={errors["employeeId"]} hint="Bỏ trống = cả phòng">
            <NativeSelect
              value={d.employeeId ?? ""}
              disabled={!d.departmentId}
              onChange={(v) => set("employeeId", v || null)}
              options={["", ...staff.map((x) => x.id)]}
              labels={{
                "": "— Cả phòng",
                ...Object.fromEntries(staff.map((x) => [x.id, x.name])),
              }}
            />
          </Field>
          <Field label="Form" error={errors["form"]}>
            <NativeSelect
              value={d.form ?? ""}
              onChange={(v) => set("form", (v || null) as AssignmentDraft["form"])}
              options={form ? ["", form] : [""]}
              labels={{ "": "—", ...(form ? { [form]: formName(form) } : {}) }}
            />
          </Field>
          <Field label="Trạng thái">
            <NativeSelect
              value={d.status}
              onChange={(v) => set("status", v as Status)}
              options={["Active", "Inactive"]}
            />
          </Field>
          <Field label="Ghi chú" className="col-span-2">
            <Input
              value={d.note}
              placeholder="VD: Xử lý chính"
              onChange={(e) => set("note", e.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
