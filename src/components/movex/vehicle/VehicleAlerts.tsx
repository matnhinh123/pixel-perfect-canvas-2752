import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { Input } from "@/components/ui/input";
import { setAlertDays } from "@/services/vehicleMasterService";
import { formatDate } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useVehicleAlertDays, useVehicleExpiryAlerts } from "./useVehicleData";

/** Small "Alert: [30] days" control for the document-expiry threshold. */
export function AlertDaysControl() {
  const { t } = useT();
  const days = useVehicleAlertDays();
  const [text, setText] = useState(String(days));
  useEffect(() => setText(String(days)), [days]);
  const commit = () => {
    const n = Number(text);
    if (n >= 1) setAlertDays(n);
    else setText(String(days));
  };
  return (
    <label
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
      title={t(
        "Cảnh báo khi đăng kiểm / bảo hiểm / phù hiệu sắp hết hạn trong số ngày này.",
        "Warn when registration / insurance / badge expires within this many days.",
      )}
    >
      <BellRing className="h-4 w-4 text-warning" />
      <span>{t("Cảnh báo:", "Alert:")}</span>
      <Input
        inputMode="numeric"
        aria-label={t("Số ngày cảnh báo", "Alert threshold (days)")}
        className="h-8 w-14 px-2 text-center"
        value={text}
        onChange={(e) => setText(e.target.value.replace(/\D/g, "").slice(0, 3))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
      />
      <span>{t("ngày", "days")}</span>
    </label>
  );
}

/** "Expiring documents" section of the notifications popover. Renders nothing when there are none. */
export function ExpiringDocumentsList({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useT();
  const alerts = useVehicleExpiryAlerts();
  const days = useVehicleAlertDays();
  if (!alerts.length) return null;
  return (
    <div className="border-b">
      <div className="flex items-center justify-between bg-warning/10 px-4 py-2 text-sm font-semibold">
        <span>
          {t("Giấy tờ xe sắp hết hạn", "Expiring documents")} ({alerts.length})
        </span>
        <span className="text-xs font-normal text-muted-foreground">
          {t(`≤ ${days} ngày`, `≤ ${days} days`)}
        </span>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {alerts.map((a) => (
          <Link
            key={`${a.vehicle.id}-${a.kind}`}
            to="/vehicle/$id"
            params={{ id: a.vehicle.id }}
            search={{ mode: "view" }}
            onClick={onNavigate}
            className="block border-b px-4 py-2 text-sm last:border-0 hover:bg-accent"
          >
            <div className="flex justify-between gap-2">
              <span className="font-medium text-primary">{a.vehicle.plateNumber}</span>
              <span
                className={cn(
                  "text-xs font-semibold",
                  a.state === "expired" ? "text-destructive" : "text-warning",
                )}
              >
                {a.state === "expired"
                  ? t("Đã hết hạn", "Expired")
                  : a.daysLeft === 0
                    ? t("Hết hạn hôm nay", "Expires today")
                    : t(
                        `Còn ${a.daysLeft} ngày`,
                        `In ${a.daysLeft} day${a.daysLeft === 1 ? "" : "s"}`,
                      )}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {a.label} · {formatDate(a.date)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
