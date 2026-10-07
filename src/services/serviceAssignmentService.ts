// "Phân công": which department / employee handles a service. Stored per service.
import type { ServiceAssignment, ServiceRecord } from "@/types";
import { serviceAssignmentRepository, uid } from "@/repositories";
import { departmentName, employeeName, employeesOf } from "@/mock-data/staff";
import { formName } from "@/mock-data/templates";
import { auditService } from "./auditService";
import { BusinessRuleError, stampCreate, stampUpdate } from "./crudService";
import { templateOf } from "./serviceCatalogService";
import { tr } from "@/lib/i18n";

export type AssignmentDraft = Pick<
  ServiceAssignment,
  "departmentId" | "employeeId" | "form" | "note" | "status"
>;

export const newAssignmentDraft = (): AssignmentDraft => ({
  departmentId: "",
  employeeId: null,
  form: null,
  note: "",
  status: "Active",
});

const describe = (a: AssignmentDraft) =>
  `${departmentName(a.departmentId)} · ${employeeName(a.employeeId)} · ${formName(a.form)}`;

export function validateAssignment(a: AssignmentDraft, service: ServiceRecord) {
  const e: Record<string, string> = {};
  if (!a.departmentId) e["departmentId"] = tr("Chọn phòng ban.", "Select a department.");
  if (a.employeeId && !employeesOf(a.departmentId).some((x) => x.id === a.employeeId))
    e["employeeId"] = tr(
      "Nhân viên không thuộc phòng ban đã chọn.",
      "The employee does not belong to the selected department.",
    );
  if (a.form && a.form !== templateOf(service))
    e["form"] = tr(
      `Chỉ chọn ${formName(templateOf(service))} cho dịch vụ này.`,
      `Only ${formName(templateOf(service))} can be selected for this service.`,
    );
  return e;
}

export const serviceAssignmentService = {
  forService: (serviceId: string, list = serviceAssignmentRepository.all()) =>
    list.filter((a) => a.serviceId === serviceId && !a.deleted),

  save(service: ServiceRecord, draft: AssignmentDraft, id?: string): ServiceAssignment {
    const errors = validateAssignment(draft, service);
    if (Object.keys(errors).length)
      throw new BusinessRuleError(
        tr("Vui lòng kiểm tra các trường được đánh dấu.", "Please check the highlighted fields."),
        errors,
      );
    const clean = { ...draft, note: draft.note.trim() };
    const base = {
      entityType: "Service" as const,
      entityId: service.id,
      entityLabel: service.code,
    };
    const existing = id ? serviceAssignmentRepository.get(id) : undefined;
    if (!existing) {
      const rec: ServiceAssignment = {
        ...clean,
        id: uid("PC-"),
        serviceId: service.id,
        ...stampCreate(),
      };
      serviceAssignmentRepository.insert(rec);
      auditService.log({
        ...base,
        action: "CREATE",
        field: tr("Phân công", "Assignment"),
        newValue: describe(rec),
      });
      return rec;
    }
    const next = stampUpdate({ ...existing, ...clean });
    serviceAssignmentRepository.update(existing.id, () => next);
    auditService.log({
      ...base,
      action: "UPDATE",
      field: tr("Phân công", "Assignment"),
      oldValue: `${describe(existing)} · ${existing.status}`,
      newValue: `${describe(next)} · ${next.status}`,
    });
    return next;
  },

  /** Assignments are configuration, not transactions: removing one is a soft delete. */
  remove(service: ServiceRecord, id: string) {
    const a = serviceAssignmentRepository.get(id);
    if (!a) return;
    serviceAssignmentRepository.update(id, (p) => stampUpdate({ ...p, deleted: true }));
    auditService.log({
      entityType: "Service",
      entityId: service.id,
      entityLabel: service.code,
      action: "DELETE",
      field: tr("Phân công", "Assignment"),
      oldValue: describe(a),
    });
  },
};
