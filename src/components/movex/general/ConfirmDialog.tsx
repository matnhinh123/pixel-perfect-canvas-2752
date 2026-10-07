import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

export type ConfirmResult = "confirm" | "cancel" | "alt";

export interface ConfirmOptions {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Optional secondary action, e.g. "Deactivate instead". */
  altLabel?: string;
  tone?: "danger" | "default";
  /** Hide the confirm button (e.g. business-rule violation with only an alternative). */
  hideConfirm?: boolean;
}

type ConfirmFn = (o: ConfirmOptions) => Promise<ConfirmResult>;
const Ctx = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((r: ConfirmResult) => void) | null>(null);
  const { t } = useT();

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o);
    return new Promise<ConfirmResult>((res) => {
      resolver.current = res;
    });
  }, []);

  const close = (r: ConfirmResult) => {
    resolver.current?.(r);
    resolver.current = null;
    setOpts(null);
  };

  const danger = opts?.tone === "danger";
  return (
    <Ctx.Provider value={confirm}>
      {children}
      <AlertDialog open={!!opts} onOpenChange={(o) => !o && close("cancel")}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {danger ? (
                <AlertTriangle className="h-5 w-5 text-destructive" />
              ) : (
                <Info className="h-5 w-5 text-primary" />
              )}
              {opts?.title}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm text-muted-foreground">{opts?.description}</div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => close("cancel")}>
              {opts?.cancelLabel ?? t("Huỷ", "Cancel")}
            </Button>
            {opts?.altLabel && (
              <Button variant="secondary" onClick={() => close("alt")}>
                {opts.altLabel}
              </Button>
            )}
            {!opts?.hideConfirm && (
              <Button variant={danger ? "destructive" : "default"} onClick={() => close("confirm")}>
                {opts?.confirmLabel ?? t("Xác nhận", "Confirm")}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Ctx.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const fn = useContext(Ctx);
  if (!fn) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return fn;
}
