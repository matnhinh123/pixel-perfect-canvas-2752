import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LOCATION_COUNTRIES } from "@/mock-data/locationCatalog";
import { CODE_KINDS } from "@/mock-data/standardCodes";
import type { LocationMasterRecord } from "@/mock-data/locations";
import {
  fieldLabel,
  provincesFor,
  withCountries,
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

/**
 * Location list quick filters: Status, Code Type, Country, Province/City (only the provinces of
 * the chosen Country). The Advanced Filter is the generic one of every list.
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
        options={[...CODE_KINDS]}
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
    </>
  );
}
