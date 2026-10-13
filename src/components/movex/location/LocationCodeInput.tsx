import { useState } from "react";
import { Tag } from "@/components/movex/common";
import { Input } from "@/components/ui/input";
import { searchStandardCodes, type CodeKind, type StandardCode } from "@/mock-data/standardCodes";
import { useT } from "@/lib/i18n";

/**
 * Location code box. For a UN/LOCODE / IATA Code, typing a code or a place name lists matching
 * codes of that kind from the reference data (narrowed by the chosen country); picking one fills
 * the code and lets the form copy its name / country / spot. A Local Code is typed freely.
 */
export function LocationCodeInput({
  value,
  onChange,
  onPick,
  kind,
  country,
  placeholder,
  invalid,
}: {
  value: string;
  onChange: (code: string) => void;
  onPick: (c: StandardCode) => void;
  kind: CodeKind;
  country: string;
  placeholder: string;
  invalid?: boolean;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const hits = open ? searchStandardCodes(value, { kind, country }) : [];
  // Nothing to suggest when the box already holds exactly one of the codes.
  const shown = hits.length === 1 && hits[0]!.code === value ? [] : hits;

  const pick = (c: StandardCode) => {
    onPick(c);
    setOpen(false);
  };

  return (
    <div className="relative">
      <Input
        placeholder={placeholder}
        maxLength={20}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={shown.length > 0}
        aria-invalid={invalid || undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""));
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (!shown.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % shown.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + shown.length) % shown.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(shown[Math.min(active, shown.length - 1)]!);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {shown.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 max-h-72 w-[min(26rem,90vw)] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <li className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
            {t("Mã chuẩn quốc tế", "International codes")}
          </li>
          {shown.map((c, i) => (
            <li
              key={c.code}
              role="option"
              aria-selected={i === active}
              className={
                "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm " +
                (i === active ? "bg-accent" : "hover:bg-accent/60")
              }
              onMouseEnter={() => setActive(i)}
              // mousedown: pick before the input's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c);
              }}
            >
              <span className="w-14 shrink-0 font-semibold text-primary">{c.code}</span>
              <span className="min-w-0 flex-1 truncate">
                {c.name}
                <span className="text-muted-foreground">
                  {" · "}
                  {c.city || c.functions.join(", ")}
                  {c.country ? ` · ${c.country}` : ` · ${c.iso2}`}
                </span>
              </span>
              <Tag>{c.kind}</Tag>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
