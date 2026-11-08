// Amount input with a dot every 3 digits while typing ("1.250.000"), decimals after a comma for a
// foreign currency. The value is a number; NaN = empty. The caret stays after the digit just typed.
import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** "1200000,5" → "1.200.000,5" (vi-VN grouping), and its number (NaN when empty). */
function groupMoney(s: string, decimals = 0) {
  const [int = "", ...rest] = s.replace(/[^\d,]/g, "").split(",");
  const comma = decimals > 0 && s.includes(",");
  const dec = rest.join("").slice(0, decimals);
  if (!int && !comma) return { text: "", value: NaN };
  const n = Number(int || "0");
  return {
    text: n.toLocaleString("vi-VN") + (comma ? `,${dec}` : ""),
    value: Number(`${n}.${dec || "0"}`),
  };
}
/** Text of an amount: "" for NaN (and for 0 when `emptyZero`). */
const moneyText = (v: number, decimals = 0, emptyZero = false) =>
  !Number.isFinite(v) || (emptyZero && !v)
    ? ""
    : v.toLocaleString("vi-VN", { maximumFractionDigits: decimals });

const same = (a: number, b: number) => a === b || (Number.isNaN(a) && Number.isNaN(b));

export function MoneyInput({
  value,
  onChange,
  decimals = 0,
  emptyZero,
  invalid,
  className,
  suffix,
  ...rest
}: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: number;
  onChange: (v: number) => void;
  decimals?: number;
  /** Show 0 as an empty box (the placeholder). */
  emptyZero?: boolean;
  invalid?: boolean;
  /** The unit shown after the box (e.g. the currency). */
  suffix?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => moneyText(value, decimals, emptyZero));
  /** Digits (and comma) left of the caret after the last keystroke. */
  const caret = useRef<number | null>(null);
  useEffect(() => {
    if (!same(groupMoney(text, decimals).value, value) && !(emptyZero && !value && !text))
      setText(moneyText(value, decimals, emptyZero));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (caret.current === null || !el || document.activeElement !== el) return;
    let seen = 0;
    let pos = 0;
    while (pos < text.length && seen < caret.current) {
      if (/[\d,]/.test(text[pos]!)) seen++;
      pos++;
    }
    el.setSelectionRange(pos, pos);
    caret.current = null;
  }, [text]);
  const input = (
    <Input
      ref={ref}
      inputMode={decimals > 0 ? "decimal" : "numeric"}
      placeholder="0"
      {...rest}
      value={text}
      aria-invalid={invalid || rest["aria-invalid"] || undefined}
      onChange={(e) => {
        const at = e.target.selectionStart ?? e.target.value.length;
        caret.current = e.target.value.slice(0, at).replace(/[^\d,]/g, "").length;
        const g = groupMoney(e.target.value, decimals);
        setText(g.text);
        onChange(g.value);
      }}
      className={cn("text-right tabular-nums", suffix && "rounded-r-none", className)}
    />
  );
  return suffix ? (
    <div className="flex">
      {input}
      <span className="flex shrink-0 items-center rounded-r-md border border-l-0 bg-muted px-2 text-xs font-medium text-muted-foreground">
        {suffix}
      </span>
    </div>
  ) : (
    input
  );
}
