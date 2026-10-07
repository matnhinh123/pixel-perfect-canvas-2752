export const formatVnd = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n)) + " ₫";
export const formatNumber = (n: number) => new Intl.NumberFormat("vi-VN").format(n);
export const formatDuration = (min: number) =>
  `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, "0")}m`;
/** Parse "15h 48m", "15h", "48m", "15:48" or plain hours ("15.5") into minutes; null when invalid. */
export const parseDurationText = (text: string): number | null => {
  const s = text.trim().toLowerCase().replace(",", ".");
  let min: number;
  const hm = /^(\d+(?:\.\d+)?)\s*h(?:\s*(\d+)\s*m?)?$/.exec(s);
  const colon = /^(\d+):(\d{1,2})$/.exec(s);
  const mOnly = /^(\d+)\s*m$/.exec(s);
  if (hm) min = Number(hm[1]) * 60 + Number(hm[2] ?? 0);
  else if (colon) min = Number(colon[1]) * 60 + Number(colon[2]);
  else if (mOnly) min = Number(mOnly[1]);
  else if (/^\d+(\.\d+)?$/.test(s)) min = Number(s) * 60;
  else return null;
  return Number.isFinite(min) && min > 0 ? Math.round(min) : null;
};
export const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const formatDate = (ymd: string) => {
  const [y, m, d] = ymd.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : ymd;
};
export const todayYmd = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
