import { Lock } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { AuditEvent, EntityType } from "@/types";
import { AUDIT_ACTION_LABEL } from "@/services/auditService";
import { formatDateTime } from "@/lib/format";
import { useEntityAudit } from "@/hooks/use-store";
import { cn } from "@/lib/utils";

const actionTone = (a: AuditEvent["action"]) =>
  a === "DELETE" || a === "DEACTIVATE" || a === "REMOVE_MANUAL_COST" || a === "ROLLBACK"
    ? "bg-destructive"
    : a === "CREATE" || a === "ACTIVATE" || a === "CREATE_VERSION" || a === "IMPORT"
      ? "bg-success"
      : a === "VIEW" || a === "EXPORT"
        ? "bg-muted-foreground"
        : "bg-primary";

export function AuditTimeline({
  entries,
  showEntity,
  english,
}: {
  entries: AuditEvent[];
  showEntity?: boolean;
  english?: boolean;
}) {
  if (entries.length === 0)
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {english ? "No change history yet." : "Chưa có lịch sử thay đổi."}
      </p>
    );
  return (
    <ol className="relative ml-2 border-l-2 border-border">
      {entries.map((e) => (
        <li key={e.id} className="mb-5 ml-5">
          <span
            className={cn(
              "absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-card",
              actionTone(e.action),
            )}
          />
          <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{formatDateTime(e.timestamp)}</span>
            <span>{e.user}</span>
          </div>
          <div className="text-sm font-semibold">
            {e.action === "CREATE"
              ? `Created ${e.entityType}`
              : (AUDIT_ACTION_LABEL[e.action] ?? e.action)}
            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
              {e.action}
            </span>
          </div>
          {showEntity && (
            <div className="text-xs font-medium text-primary">
              {e.entityType} {e.entityLabel}
            </div>
          )}
          {e.field && (
            <div className="mt-1 text-sm">
              <span className="text-muted-foreground">{e.field}: </span>
              {e.oldValue !== undefined && (
                <span className="line-through decoration-muted-foreground/60">{e.oldValue}</span>
              )}
              {e.oldValue !== undefined && e.newValue !== undefined && (
                <span className="mx-1 text-muted-foreground">→</span>
              )}
              {e.newValue !== undefined && <span className="font-medium">{e.newValue}</span>}
            </div>
          )}
          {e.note && <div className="text-xs text-muted-foreground">{e.note}</div>}
        </li>
      ))}
    </ol>
  );
}

/** GEN-02 shared Audit History drawer for any entity. Read-only (audit log is append-only). */
export function AuditHistoryDrawer({
  open,
  onOpenChange,
  entityType,
  entityId,
  title,
  english,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entityType: EntityType;
  entityId: string | undefined;
  title: string;
  /** Screens with an English UI (Routing Detail). */
  english?: boolean;
}) {
  const entries = useEntityAudit(entityType, entityId);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[460px] overflow-y-auto sm:max-w-[460px]">
        <SheetHeader>
          <SheetTitle>{english ? "Change History" : "Lịch sử thay đổi"}</SheetTitle>
          <SheetDescription>
            {entityType} · {title}
          </SheetDescription>
        </SheetHeader>
        <div className="mx-4 mb-4 flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          {english
            ? `Append-only log · ${entries.length} events · cannot be edited or deleted`
            : `Nhật ký chỉ ghi thêm · ${entries.length} sự kiện · không thể sửa hoặc xoá`}
        </div>
        <div className="px-4">
          <AuditTimeline entries={entries} {...(english ? { english } : {})} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
