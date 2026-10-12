import { useState } from "react";
import { Check, ChevronDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Field } from "@/components/movex/common";
import { MultiSelect } from "@/components/movex/businessPartner/MultiSelect";
import { LOCATION_COUNTRIES, LOCATION_TYPES } from "@/mock-data/locationCatalog";
import type { LocationMasterRecord } from "@/mock-data/locations";
import {
  EMPTY_LOCATION_FILTER,
  fieldLabel,
  filterHasErrors,
  provincesFor,
  rangeError,
  subTypesFor,
  withCountries,
  withTypes,
  type LocationFilter,
} from "@/services/locationFilter";
import { cn } from "@/lib/utils";

type T = (vi: string, en: string) => string;
const ALL = "__all__";
const boxClass =
  "h-10 rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

/** Native quick select: the open list shows plain values; the closed box names the filter on "All". */
function QuickSelect({
  label,
  allText,
  value,
  options,
  onChange,
}: {
  label: string;
  allText: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      aria-label={label}
      title={label}
      onChange={(e) => onChange(e.target.value === ALL ? "" : e.target.value)}
      className={boxClass}
    >
      <option value="" hidden>
        {`${label}: ${allText}`}
      </option>
      <option value={ALL}>{allText}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/** Single choice with a search box (Country / Province/City). */
function SearchSelect({
  label,
  allText,
  value,
  shown,
  options,
  onChange,
  className,
  t,
}: {
  label: string;
  allText: string;
  value: string;
  /** Text in the closed box when it differs from `value` (e.g. "Vietnam +1"). */
  shown?: string;
  options: readonly string[];
  onChange: (v: string) => void;
  className?: string;
  t: T;
}) {
  const [open, setOpen] = useState(false);
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={label}
          aria-label={label}
          className={cn(boxClass, "flex items-center gap-2 text-left", className)}
        >
          <span className={cn("min-w-0 flex-1 truncate", !value && !shown && "text-foreground")}>
            {shown ?? (value || `${label}: ${allText}`)}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder={t("Tìm…", "Search…")} />
          <CommandList>
            <CommandEmpty>{t("Không có kết quả.", "No results.")}</CommandEmpty>
            <CommandGroup>
              <CommandItem value={`__all ${allText}`} onSelect={() => pick("")}>
                <Check className={cn("h-4 w-4", value ? "opacity-0" : "opacity-100")} />
                {allText}
              </CommandItem>
              {options.map((o) => (
                <CommandItem key={o} value={o} onSelect={() => pick(o)}>
                  <Check className={cn("h-4 w-4", value === o ? "opacity-100" : "opacity-0")} />
                  {o}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const dateInputClass = "h-9";

function DateRange({
  label,
  from,
  to,
  onChange,
  t,
}: {
  label: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  t: T;
}) {
  const error = rangeError(from, to);
  return (
    <Field label={label} error={error ?? undefined}>
      <div className="flex items-center gap-2">
        <Input
          type="date"
          className={dateInputClass}
          value={from}
          max={to || undefined}
          aria-label={`${label} ${t("từ", "from")}`}
          aria-invalid={!!error || undefined}
          onChange={(e) => onChange(e.target.value, to)}
        />
        <span className="text-muted-foreground">–</span>
        <Input
          type="date"
          className={dateInputClass}
          value={to}
          min={from || undefined}
          aria-label={`${label} ${t("đến", "to")}`}
          aria-invalid={!!error || undefined}
          onChange={(e) => onChange(from, e.target.value)}
        />
      </div>
    </Field>
  );
}

/** Advanced-panel fields that count on the Filter button badge. */
const panelCount = (f: LocationFilter) =>
  [
    f.countries.length,
    f.provinces.length,
    f.types.length,
    f.subTypes.length,
    f.hasCoordinates,
    f.createdFrom || f.createdTo,
    f.updatedFrom || f.updatedTo,
  ].filter(Boolean).length;

/**
 * Location list toolbar filters: quick filters (Status, Code Type, Country, Province/City)
 * and the Filter panel (Country, Province/City, Location Type, Sub Type, Has Coordinates, Created /
 * Updated At).
 */
export function LocationFilterBar({
  rows,
  value,
  onChange,
  t,
}: {
  rows: LocationMasterRecord[];
  value: LocationFilter;
  onChange: (f: LocationFilter) => void;
  t: T;
}) {
  const allText = t("Tất cả", "All");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LocationFilter>(value);
  const openPanel = (o: boolean) => {
    if (o) setDraft(value);
    setOpen(o);
  };
  const apply = () => {
    if (filterHasErrors(draft)) return;
    onChange(draft);
    setOpen(false);
  };
  const subOptions = subTypesFor(draft.types);
  const count = panelCount(value);
  const country = value.countries;
  const provinces = value.provinces;

  return (
    <>
      <QuickSelect
        label={fieldLabel("status", t)}
        allText={allText}
        value={value.status}
        options={["Active", "Inactive"]}
        onChange={(v) => onChange({ ...value, status: v as LocationFilter["status"] })}
      />
      <QuickSelect
        label={fieldLabel("origin", t)}
        allText={allText}
        value={value.origin}
        options={["Standard", "Internal"]}
        onChange={(v) => onChange({ ...value, origin: v as LocationFilter["origin"] })}
      />
      <SearchSelect
        label={fieldLabel("countries", t)}
        allText={allText}
        value={country.length === 1 ? country[0]! : ""}
        {...(country.length > 1 ? { shown: `${country[0]} +${country.length - 1}` } : {})}
        options={LOCATION_COUNTRIES}
        onChange={(v) => onChange(withCountries(value, v ? [v] : [], rows))}
        className="w-44"
        t={t}
      />
      <SearchSelect
        label={fieldLabel("province", t)}
        allText={allText}
        value={provinces.length === 1 ? provinces[0]! : ""}
        {...(provinces.length > 1 ? { shown: `${provinces[0]} +${provinces.length - 1}` } : {})}
        options={provincesFor(rows, country)}
        onChange={(v) => onChange({ ...value, provinces: v ? [v] : [] })}
        className="w-52"
        t={t}
      />

      <Sheet open={open} onOpenChange={openPanel}>
        <SheetTrigger asChild>
          <Button variant={count ? "secondary" : "outline"} className="h-10">
            <Filter className="h-4 w-4" />
            {t("Bộ lọc", "Filter")}
            {count > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                {count}
              </span>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="space-y-1 border-b px-5 py-4 pr-12 text-left">
            <SheetTitle className="text-base">{t("Bộ lọc nâng cao", "Advanced filter")}</SheetTitle>
            <SheetDescription className="text-xs">
              {t(
                "Tất cả điều kiện được kết hợp bằng AND, cùng với từ khoá tìm kiếm.",
                "All conditions are combined with AND, together with the search keyword.",
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="grid flex-1 content-start gap-y-4 overflow-y-auto p-5">
            <Field label={fieldLabel("countries", t)}>
              <MultiSelect
                value={draft.countries}
                options={LOCATION_COUNTRIES}
                placeholder={allText}
                onChange={(v) => setDraft(withCountries(draft, v, rows))}
              />
            </Field>
            <Field label={fieldLabel("province", t)}>
              <MultiSelect
                value={draft.provinces}
                options={provincesFor(rows, draft.countries)}
                placeholder={allText}
                onChange={(v) => setDraft({ ...draft, provinces: v })}
              />
            </Field>
            <Field label={fieldLabel("types", t)}>
              <MultiSelect
                value={draft.types}
                options={LOCATION_TYPES}
                placeholder={allText}
                onChange={(v) => setDraft(withTypes(draft, v))}
              />
            </Field>
            <Field label={fieldLabel("subTypes", t)}>
              <MultiSelect
                value={draft.subTypes}
                options={subOptions}
                disabled={subOptions.length === 0}
                placeholder={
                  subOptions.length
                    ? allText
                    : t("Không có cho loại đã chọn", "None for the chosen type")
                }
                onChange={(v) => setDraft({ ...draft, subTypes: v })}
              />
            </Field>
            <Field label={fieldLabel("hasCoordinates", t)}>
              <select
                value={draft.hasCoordinates}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    hasCoordinates: e.target.value as LocationFilter["hasCoordinates"],
                  })
                }
                className={cn(boxClass, "h-9 w-full")}
              >
                <option value="">{allText}</option>
                <option value="Yes">{t("Có", "Yes")}</option>
                <option value="No">{t("Không", "No")}</option>
              </select>
            </Field>
            <DateRange
              label={fieldLabel("created", t)}
              from={draft.createdFrom}
              to={draft.createdTo}
              onChange={(createdFrom, createdTo) => setDraft({ ...draft, createdFrom, createdTo })}
              t={t}
            />
            <DateRange
              label={fieldLabel("updated", t)}
              from={draft.updatedFrom}
              to={draft.updatedTo}
              onChange={(updatedFrom, updatedTo) => setDraft({ ...draft, updatedFrom, updatedTo })}
              t={t}
            />
          </div>

          <div className="flex items-center justify-between border-t px-5 py-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setDraft({ ...EMPTY_LOCATION_FILTER, status: draft.status, origin: draft.origin })
              }
            >
              {t("Đặt lại", "Reset")}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                {t("Huỷ", "Cancel")}
              </Button>
              <Button size="sm" onClick={apply} disabled={filterHasErrors(draft)}>
                {t("Áp dụng", "Apply")}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
