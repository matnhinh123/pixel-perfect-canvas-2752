import { useEffect, useRef, type ReactNode } from "react";
import { useBlocker } from "@tanstack/react-router";
import { AlertCircle, Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, type Crumb } from "@/components/movex/common";
import { useConfirm } from "./ConfirmDialog";
import { tr, useT } from "@/lib/i18n";

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
        description: tr(
          "Bạn có thay đổi chưa lưu. Nếu rời trang bây giờ, các thay đổi sẽ bị mất.",
          "If you leave this page now, your changes will be lost.",
        ),
        confirmLabel: tr("Bỏ thay đổi", "Discard changes"),
        cancelLabel: tr("Ở lại trang", "Stay on page"),
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

/** Standard Create/Edit header: [←] Title [badge] ………… [extra] [✕ Cancel] [Save Draft] [💾 Save]. */
export function FormPageHeader({
  crumbs,
  title,
  subtitle,
  badge,
  onBack,
  onCancel,
  onSave,
  onSaveDraft,
  saving,
  dirty,
  readOnly,
  extra,
  saveLabel = "Save",
  rootLabel,
  unsavedLabel,
}: {
  crumbs: Crumb[];
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  onBack: () => void;
  onCancel?: () => void;
  onSave?: () => void;
  onSaveDraft?: () => void;
  saving?: boolean;
  dirty?: boolean;
  readOnly?: boolean;
  extra?: ReactNode;
  saveLabel?: string;
  rootLabel?: string;
  unsavedLabel?: string;
}) {
  const { t } = useT();
  return (
    <PageHeader
      crumbs={crumbs}
      {...(rootLabel ? { rootLabel } : {})}
      onBack={onBack}
      title={title}
      badge={
        <>
          {badge}
          {dirty && !readOnly && (
            <span className="rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-semibold text-warning">
              {unsavedLabel ?? t("Chưa lưu", "Unsaved")}
            </span>
          )}
        </>
      }
      subtitle={subtitle}
      actions={
        <>
          {extra}
          {!readOnly && onCancel && (
            <Button variant="outline" size="lg" onClick={onCancel} disabled={saving}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          )}
          {!readOnly && onSaveDraft && (
            <Button variant="secondary" size="lg" onClick={onSaveDraft} disabled={saving}>
              Save Draft
            </Button>
          )}
          {!readOnly && onSave && (
            <Button size="lg" onClick={onSave} disabled={saving}>
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
