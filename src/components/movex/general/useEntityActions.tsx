import { toast } from "sonner";
import type { BaseRecord } from "@/types";
import type { EntityCrud } from "@/services/crudService";
import { useConfirm } from "./ConfirmDialog";

/** Shared CRUD action handling: confirm → business-rule check → act → toast. No silent failures. */
export function useEntityActions<T extends BaseRecord>(crud: EntityCrud<T> | undefined) {
  const confirm = useConfirm();

  const setStatus = async (rows: T[], status: "Active" | "Inactive") => {
    if (!crud || rows.length === 0) return false;
    const verb = status === "Active" ? "Activate" : "Deactivate";
    const names =
      rows.length === 1
        ? `${crud.entityType} ${crud.labelOf(rows[0]!)}`
        : `${rows.length} ${crud.entityType.toLowerCase()} records`;
    const r = await confirm({
      title: `${verb} ${names}?`,
      description:
        status === "Inactive"
          ? "Bản ghi Inactive vẫn giữ trong lịch sử và báo cáo nhưng không được chọn cho giao dịch mới. Có thể Activate lại sau."
          : "Bản ghi sẽ được dùng lại cho giao dịch mới.",
      confirmLabel: verb,
      tone: status === "Inactive" ? "danger" : "default",
    });
    if (r !== "confirm") return false;
    try {
      const n = crud.setStatus(
        rows.map((x) => x.id),
        status,
      );
      if (n === 0) toast.info(`Nothing to ${verb.toLowerCase()} — already ${status}.`);
      else toast.success(`${verb}d ${n} record${n > 1 ? "s" : ""}`);
      return n > 0;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${verb} failed`);
      return false;
    }
  };

  const requestDelete = async (row: T) => {
    if (!crud) return false;
    const check = crud.checkDelete(row.id);
    if (!check.canDelete) {
      const r = await confirm({
        title: "Không thể xoá",
        description: check.reason,
        hideConfirm: true,
        cancelLabel: "Đóng",
        ...(check.canDeactivate ? { altLabel: "Deactivate thay thế" } : {}),
        tone: "danger",
      });
      if (r === "alt") {
        crud.setStatus([row.id], "Inactive");
        toast.success(`${crud.entityType} ${crud.labelOf(row)} deactivated`);
        return true;
      }
      return false;
    }
    const r = await confirm({
      title: `Delete ${crud.entityType} ${crud.labelOf(row)}?`,
      description: "Đây là soft delete: bản ghi bị ẩn khỏi danh sách nhưng vẫn được giữ để audit.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (r !== "confirm") return false;
    try {
      crud.softDelete(row.id);
      toast.success(`${crud.entityType} ${crud.labelOf(row)} deleted`);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
      return false;
    }
  };

  return { setStatus, requestDelete };
}
