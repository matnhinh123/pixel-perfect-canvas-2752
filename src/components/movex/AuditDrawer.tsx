import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import type { AuditEntry } from "@/lib/mock-data";

export function AuditTimeline({ entries }: { entries: AuditEntry[] }) {
  return (
    <ol className="relative ml-2 border-l-2 border-border">
      {[...entries].reverse().map((e) => (
        <li key={e.id} className="mb-5 ml-5">
          <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-card bg-primary" />
          <div className="text-sm font-semibold">{e.action}</div>
          {e.entity && <div className="text-xs font-medium text-primary">{e.entity}</div>}
          {e.detail && <div className="text-sm text-muted-foreground">{e.detail}</div>}
          <div className="mt-0.5 text-xs text-muted-foreground">{e.user} · {e.time}</div>
        </li>
      ))}
    </ol>
  );
}

export function AuditDrawer({ open, onOpenChange, title, entries }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; entries: AuditEntry[] }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] overflow-y-auto sm:max-w-[420px]">
        <SheetHeader>
          <SheetTitle>Audit History</SheetTitle>
          <SheetDescription>{title}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 px-4"><AuditTimeline entries={entries} /></div>
      </SheetContent>
    </Sheet>
  );
}
