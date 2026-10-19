import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { DEPARTMENTS, departmentName } from "@/mock-data/staff";
import { formName } from "@/mock-data/templates";
import {
  newAssignmentDraft,
  validateAssignment,
  type AssignmentDraft,
} from "@/services/serviceAssignmentService";
import type { ServiceRecord, Status, TemplateType } from "@/types";
import { useT } from "@/lib/i18n";

/** One assignment row; `id` is set for rows that are already stored. */
export type AssignmentRow = AssignmentDraft & { key: string; id?: string };

let seq = 0;
const newRowKey = () => `a-${++seq}`;

/**
 * Tab "Phân công": departments / employees that handle this service. Read-only without `onChange`
 * (view); in the Create / Edit form rows are edited here and stored when the service is saved.
 */
export function ServiceAssignments({
  rows,
  form,
  service,
  onChange,
}: {
  rows: AssignmentRow[];
  /** Template of the service (the only value an assignment may carry). */
  form: TemplateType | null;
  /** The service as edited, used to validate a row. */
  service: ServiceRecord;
  onChange?: (rows: AssignmentRow[]) => void;
}) {
  const { t } = useT();
  const readOnly = !onChange;
  const [editing, setEditing] = useState<AssignmentRow | "new" | null>(null);

  return (
    <Panel
      title={t("Phân công", "Assignment")}
      bodyClassName="p-0"
      actions={
        readOnly ? undefined : (
          <Button
            variant="outline"
            size="sm"
            className="h-8 border-primary/40 text-primary"
            onClick={() => setEditing("new")}
          >
            <Plus className="h-4 w-4" />
            {t("Thêm phân công", "Add Assignment")}
          </Button>
        )
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          title={t("Chưa có phân công", "No assignments yet")}
          description={t(
            "Thêm phòng ban hoặc nhân viên xử lý dịch vụ này.",
            "Add the departments or employees that handle this service.",
          )}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {[
                t("Phòng ban", "Department"),
                "Default Template",
                t("Ghi chú", "Remark"),
                t("Trạng thái", "Status"),
                ...(readOnly ? [] : [t("Thao tác", "Actions")]),
              ].map((h) => (
                <TableHead key={h} className={thClass}>
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.key}>
                <TableCell className="py-2.5 font-medium">
                  {departmentName(a.departmentId)}
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
                {!readOnly && (
                  <TableCell className="py-1.5">
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={t("Sửa phân công", "Edit assignment")}
                        onClick={() => setEditing(a)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        aria-label={t("Xoá phân công", "Delete assignment")}
                        onClick={() => onChange(rows.filter((x) => x.key !== a.key))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {editing && onChange && (
        <AssignmentDialog
          key={editing === "new" ? "new" : editing.key}
          taken={rows
            .filter((x) => editing === "new" || x.key !== editing.key)
            .map((x) => x.departmentId)}
          service={service}
          form={form}
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(row) => {
            onChange(
              rows.some((x) => x.key === row.key)
                ? rows.map((x) => (x.key === row.key ? row : x))
                : [...rows, row],
            );
            setEditing(null);
          }}
        />
      )}
    </Panel>
  );
}

function AssignmentDialog({
  taken,
  service,
  form,
  initial,
  onClose,
  onSave,
}: {
  /** Departments already assigned to this service (a department is assigned once). */
  taken: string[];
  service: ServiceRecord;
  form: TemplateType | null;
  initial: AssignmentRow | null;
  onClose: () => void;
  onSave: (row: AssignmentRow) => void;
}) {
  const { t } = useT();
  const [d, setD] = useState<AssignmentRow>(
    () => initial ?? { ...newAssignmentDraft(), form, key: newRowKey() },
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
  const save = () => {
    const e = validateAssignment(d, service);
    if (d.departmentId && taken.includes(d.departmentId))
      e["departmentId"] = t(
        "Phòng ban này đã được phân công cho dịch vụ.",
        "This department is already assigned to the service.",
      );
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    onSave({ ...d, employeeId: null, note: d.note.trim() });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {initial
              ? t("Sửa phân công", "Edit Assignment")
              : t("Thêm phân công", "Add Assignment")}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label={t("Phòng ban", "Department")}
            required
            error={errors["departmentId"]}
            className="col-span-2"
          >
            <NativeSelect
              value={d.departmentId}
              invalid={!!errors["departmentId"]}
              onChange={(v) => set("departmentId", v)}
              options={["", ...DEPARTMENTS.map((x) => x.id)]}
              labels={{
                "": t("Chọn phòng ban…", "Select department…"),
                ...Object.fromEntries(DEPARTMENTS.map((x) => [x.id, x.name])),
              }}
            />
          </Field>
          <Field label="Default Template" error={errors["form"]}>
            <NativeSelect
              value={d.form ?? ""}
              onChange={(v) => set("form", (v || null) as AssignmentDraft["form"])}
              options={form ? ["", form] : [""]}
              labels={{ "": "—", ...(form ? { [form]: formName(form) } : {}) }}
            />
          </Field>
          <Field label={t("Trạng thái", "Status")}>
            <NativeSelect
              value={d.status}
              onChange={(v) => set("status", v as Status)}
              options={["Active", "Inactive"]}
            />
          </Field>
          <Field label={t("Ghi chú", "Remark")} className="col-span-2">
            <Input
              value={d.note}
              placeholder={t("VD: Xử lý chính", "E.g. Main handler")}
              onChange={(e) => set("note", e.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
