import { useEffect, useRef, type ReactNode } from "react";
import { useBlocker } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/movex/common";
import { useConfirm } from "./ConfirmDialog";

/**
 * Blocks in-app navigation and tab close while the form is dirty.
 * Call `allowNext()` right before navigating away after a successful save.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const confirm = useConfirm();
  const skip = useRef(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useBlocker({
    shouldBlockFn: async () => {
      if (skip.current || !dirtyRef.current) return false;
      const r = await confirm({
        title: "You have unsaved changes.",
        description: "If you leave this page now, your changes will be lost.",
        confirmLabel: "Discard changes",
        cancelLabel: "Stay on page",
        tone: "danger",
      });
      return r !== "confirm";
    },
    enableBeforeUnload: () => !skip.current && dirtyRef.current,
  });

  // Re-arm the guard once the form is clean again (e.g. after a save, the user edits once more).
  useEffect(() => {
    if (!dirty) skip.current = false;
  }, [dirty]);
  return {
    allowNext: () => {
      skip.current = true;
    },
  };
}

/** Standard Create/Edit header: [Back] Title ………… [extra] [Cancel] [Save Draft] [Save]. */
export function FormPageHeader({
  crumbs,
  title,
  subtitle,
  onBack,
  onCancel,
  onSave,
  onSaveDraft,
  saving,
  dirty,
  readOnly,
  extra,
  saveLabel = "Save",
}: {
  crumbs: { label: string; to?: string }[];
  title: ReactNode;
  subtitle?: ReactNode;
  onBack: () => void;
  onCancel?: () => void;
  onSave?: () => void;
  onSaveDraft?: () => void;
  saving?: boolean;
  dirty?: boolean;
  readOnly?: boolean;
  extra?: ReactNode;
  saveLabel?: string;
}) {
  return (
    <PageHeader
      crumbs={crumbs}
      title={
        <span className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={onBack}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          {title}
          {dirty && !readOnly && (
            <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">
              Unsaved changes
            </span>
          )}
        </span>
      }
      subtitle={subtitle}
      actions={
        <>
          {extra}
          {!readOnly && onCancel && (
            <Button variant="outline" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          )}
          {!readOnly && onSaveDraft && (
            <Button variant="secondary" onClick={onSaveDraft} disabled={saving}>
              Save Draft
            </Button>
          )}
          {!readOnly && onSave && (
            <Button onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saveLabel}
            </Button>
          )}
        </>
      }
    />
  );
}

export function FormErrorBanner({
  message,
  errors,
}: {
  message: string | null;
  errors?: Record<string, string>;
}) {
  if (!message) return null;
  const list = Object.values(errors ?? {});
  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-danger-soft px-4 py-3 text-sm"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div>
        <div className="font-semibold text-destructive">{message}</div>
        {list.length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-foreground/80">
            {list.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
