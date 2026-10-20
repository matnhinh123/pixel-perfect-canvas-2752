import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { AlertTriangle, ArrowRight, LayoutDashboard, Sparkles } from "lucide-react";
import { useCollection } from "@/hooks/use-store";
import {
  businessPartnerRepository,
  commonCodeRepository,
  costRepository,
  locationRepository,
  routeRepository,
  serviceRepository,
  tollStationRepository,
  vehicleMasterRepository,
} from "@/repositories";
import { useVehicleAlertDays, useVehicles } from "@/components/movex/vehicle/useVehicleData";
import { vehicleExpiryAlerts } from "@/services/vehicleMasterService";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MoveX — Home" },
      {
        name: "description",
        content: "MoveX: transport management — Master Data, Operations and Finance.",
      },
      { property: "og:title", content: "MoveX — Home" },
    ],
  }),
  component: Home,
});

type T = (vi: string, en: string) => string;

interface Module {
  to: string;
  label: string;
  icon: string;
  desc: (t: T) => string;
  /** Live record count (omitted for screens without their own records). */
  count?: number;
}

/** Order the data is usually set up in: each step relies on the ones before it. */
const SETUP_FLOW: { to: string; label: string }[] = [
  { to: "/common-code", label: "Common Code" },
  { to: "/business-partner", label: "Business Partner" },
  { to: "/location", label: "Location" },
  { to: "/vehicle", label: "Vehicle" },
  { to: "/toll-station", label: "Toll Station" },
  { to: "/routing", label: "Route Management" },
  { to: "/service", label: "Service" },
  { to: "/cost", label: "Fare Code Management" },
  { to: "/pricing", label: "Pricing" },
];

const live = <R extends { deleted?: boolean }>(rows: R[]) => rows.filter((r) => !r.deleted).length;

function Home() {
  const { t } = useT();
  const partners = useCollection(businessPartnerRepository);
  const locations = useCollection(locationRepository);
  const vehicles = useCollection(vehicleMasterRepository);
  const tolls = useCollection(tollStationRepository);
  const routes = useCollection(routeRepository);
  const services = useCollection(serviceRepository);
  const costs = useCollection(costRepository);
  const codes = useCollection(commonCodeRepository);
  const fleet = useVehicles();
  const days = useVehicleAlertDays();
  const alerts = useMemo(() => vehicleExpiryAlerts(fleet, days), [fleet, days]);
  const expired = alerts.filter((a) => a.state === "expired").length;

  const modules: Module[] = [
    {
      to: "/business-partner",
      label: "Business Partner",
      icon: "💼",
      count: live(partners),
      desc: (t) =>
        t(
          "Khách hàng, nhà cung cấp, thông tin xuất hoá đơn, liên hệ, tài khoản ngân hàng và hạn mức công nợ.",
          "Customers and vendors: invoicing, contacts, bank accounts and credit limits.",
        ),
    },
    {
      to: "/location",
      label: "Location",
      icon: "📍",
      count: live(locations),
      desc: (t) =>
        t(
          "Cảng biển, Depot (ICD), sân bay, kho bãi — mã UN/LOCODE, IATA hoặc Local Code và vị trí trên bản đồ.",
          "Seaports, depots (ICD), airports, warehouses — UN/LOCODE, IATA or local codes and map positions.",
        ),
    },
    {
      to: "/vehicle",
      label: "Vehicle",
      icon: "🚚",
      count: live(vehicles),
      desc: (t) =>
        t(
          "Xe tải, đầu kéo, rơ-moóc: đăng kiểm, bảo hiểm, nhiên liệu, tải trọng và cảnh báo giấy tờ hết hạn.",
          "Trucks, heads, trailers: inspection, insurance, fuel, payload and expiring-document alerts.",
        ),
    },
    {
      to: "/toll-station",
      label: "Toll Station",
      icon: "🏛️",
      count: live(tolls),
      desc: (t) =>
        t(
          "Trạm thu phí BOT và biểu phí theo nhóm xe, dùng để tính chi phí cầu đường của tuyến.",
          "BOT toll stations and fees per vehicle group, used for route toll costs.",
        ),
    },
    {
      to: "/routing",
      label: "Route Management",
      icon: "🗺️",
      count: live(routes),
      desc: (t) =>
        t(
          "Tuyến đường, điểm dừng, quãng đường, thời gian và tổng chi phí cầu đường.",
          "Routes, stops, distance, duration and total toll cost.",
        ),
    },
    {
      to: "/service",
      label: "Service",
      icon: "🧩",
      count: live(services),
      desc: (t) =>
        t(
          "Danh mục dịch vụ vận chuyển dùng cho báo giá và phân công kinh doanh.",
          "Transport services used in quotations and sales assignments.",
        ),
    },
    {
      to: "/cost",
      label: "Cost",
      icon: "🧮",
      count: live(costs),
      desc: (t) =>
        t(
          "Nhóm chi phí, chi phí cố định / biến đổi theo loại xe và giá vốn (COGS).",
          "Cost groups, fixed / variable costs per vehicle type and cost of goods sold.",
        ),
    },
    {
      to: "/pricing",
      label: "Pricing",
      icon: "🏷️",
      desc: (t) => t("Bảng giá bán cho khách hàng.", "Selling price lists for customers."),
    },
    {
      to: "/vendor-tariff",
      label: "Vendor Tariff",
      icon: "📜",
      desc: (t) => t("Biểu giá mua từ nhà cung cấp.", "Purchase tariffs from vendors."),
    },
    {
      to: "/common-code",
      label: "Common Code",
      icon: "📋",
      count: live(codes),
      desc: (t) =>
        t(
          "Danh sách lựa chọn cho mọi ô chọn trong hệ thống — thiết lập một lần, dùng ở mọi màn hình.",
          "The option lists behind every dropdown — set up once, used on every screen.",
        ),
    },
    {
      to: "/exchange-rate",
      label: "Exchange Rate / UoM",
      icon: "💲",
      desc: (t) => t("Tỷ giá và đơn vị tính.", "Exchange rates and units of measure."),
    },
  ];

  const stats: { label: string; value: number; to: string }[] = [
    { label: "Business Partners", value: live(partners), to: "/business-partner" },
    { label: "Locations", value: live(locations), to: "/location" },
    { label: "Vehicles", value: live(vehicles), to: "/vehicle" },
    { label: "Routes", value: live(routes), to: "/routing" },
  ];

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-primary px-6 py-10 text-primary-foreground shadow-sm sm:px-10 lg:py-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 right-40 h-72 w-72 rounded-full bg-brand/30 blur-2xl"
        />
        <div className="relative grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
              <Sparkles className="h-3.5 w-3.5" />
              {t("Chào mừng tới MoveX", "Welcome to MoveX")}
            </span>
            <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl">
              {t("Nền tảng quản lý vận tải MoveX", "MoveX transport management platform")}
            </h1>
            <p className="mt-3 max-w-xl text-base text-white/85">
              {t(
                "Từ dữ liệu nền (đối tác, địa điểm, phương tiện, tuyến đường, chi phí) tới điều phối và tài chính — chọn một phân hệ để bắt đầu.",
                "From master data (partners, locations, vehicles, routes, costs) to operations and finance — pick a module to start.",
              )}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/business-partner"
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground shadow hover:opacity-90"
              >
                {t("Vào Master Data", "Open Master Data")}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-5 py-2.5 text-sm font-semibold hover:bg-white/25"
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {stats.map((s) => (
              <Link
                key={s.label}
                to={s.to}
                className="rounded-xl bg-white/10 p-4 backdrop-blur transition-colors hover:bg-white/20"
              >
                <div className="text-3xl font-bold">{s.value}</div>
                <div className="mt-1 text-sm text-white/80">{s.label}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Needs attention */}
      {alerts.length > 0 && (
        <Link
          to="/vehicle"
          className="flex items-center gap-4 rounded-xl border border-warning/40 bg-warning-soft px-5 py-4 hover:shadow-sm"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">
              {t(
                `${alerts.length} giấy tờ xe cần chú ý`,
                `${alerts.length} vehicle documents need attention`,
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              {t(
                `${expired} đã hết hạn, ${alerts.length - expired} sắp hết hạn trong ${days} ngày (đăng ký / đăng kiểm).`,
                `${expired} expired, ${alerts.length - expired} expiring within ${days} days (registration / inspection).`,
              )}
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      )}

      {/* Modules: the level of "Master Data" in the menu */}
      <section id="modules" className="scroll-mt-6">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-card-title">{t("Phân hệ", "Modules")}</h2>
          <p className="text-sm text-muted-foreground">
            {t(
              "Chọn một phân hệ để mở menu của nó; hoặc mở thẳng một mục bên trong.",
              "Pick a module to open its menu, or jump straight to one of its screens.",
            )}
          </p>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {/* Master Data: the module of this demo */}
          <div className="flex flex-col rounded-xl border bg-card p-6 shadow-sm xl:col-span-2">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-2xl">
                🗂️
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-card-title">Master Data</h3>
                <p className="text-sm text-muted-foreground">
                  {t(
                    "Dữ liệu nền dùng chung cho báo giá, điều phối và tính giá vốn.",
                    "Shared base data for quotations, dispatch and costing.",
                  )}
                </p>
              </div>
              <Link
                to="/business-partner"
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                {t("Mở", "Open")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {modules.map((m) => (
                <Link
                  key={m.to}
                  to={m.to}
                  title={m.desc(t)}
                  className="group flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5 transition-colors hover:border-primary/50 hover:bg-primary/5"
                >
                  <span className="text-xl leading-none">{m.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{m.label}</span>
                    {m.count !== undefined && (
                      <span className="block text-xs text-muted-foreground">
                        {m.count} {t("bản ghi", "records")}
                      </span>
                    )}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </div>

          {/* Modules outside this demo */}
          <div className="grid gap-4">
            {[
              {
                icon: "🚛",
                label: "Operations",
                desc: t(
                  "Nhận đơn, điều phối xe và tài xế, theo dõi chuyến.",
                  "Orders, vehicle / driver dispatch, trip tracking.",
                ),
              },
              {
                icon: "💰",
                label: "Finance",
                desc: t(
                  "Hoá đơn, công nợ, đối soát chi phí và giá vốn.",
                  "Invoicing, receivables / payables, cost reconciliation.",
                ),
              },
            ].map((m) => (
              <div
                key={m.label}
                className="flex items-start gap-4 rounded-xl border border-dashed bg-muted/30 p-6"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-2xl opacity-70">
                  {m.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-muted-foreground">{m.label}</h3>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      {t("Sắp có", "Soon")}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{m.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Setup flow */}
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold text-card-title">
          {t("Master Data — thứ tự thiết lập dữ liệu", "Master Data — setting up the data")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "Mỗi bước dùng dữ liệu của các bước trước — làm theo thứ tự này khi khởi tạo hệ thống.",
            "Each step uses the data of the ones before — follow this order when starting out.",
          )}
        </p>
        <ol className="mt-5 flex flex-wrap items-center gap-2">
          {SETUP_FLOW.map((s, i) => (
            <li key={s.to} className="flex items-center gap-2">
              <Link
                to={s.to}
                className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm font-medium hover:border-primary hover:text-primary"
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold",
                    "bg-primary text-primary-foreground",
                  )}
                >
                  {i + 1}
                </span>
                {s.label}
              </Link>
              {i < SETUP_FLOW.length - 1 && (
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
