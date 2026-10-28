import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WeekRow } from "../analytics/rollups";
import { colorFor, fmtHours, fmtMoney, shortDate } from "./format";

// SVG presentation attributes don't resolve CSS variables, so chart colors are read from the theme here.
function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
const theme = () => ({ muted: cssVar("--muted", "#8a8f98"), line: cssVar("--line", "#e3e5e8"), accent: cssVar("--accent", "#4f7cff") });
const axisFor = (muted: string) => ({ stroke: muted, fontSize: 12, tickLine: false, axisLine: false }) as const;
const tooltipStyle = {
  contentStyle: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--text)" },
  labelStyle: { color: "var(--muted)" },
};

export function StackedWeeks({ rows, categories, unit, height = 280 }: { rows: WeekRow[]; categories: string[]; unit: "hours" | "money"; height?: number }) {
  const { muted, line } = theme();
  const axis = axisFor(muted);
  const used = categories.filter((c) => rows.some((r) => (r[c] as number) > 0));
  const fmt = unit === "money" ? fmtMoney : fmtHours;
  if (!used.length) return <p className="empty">Nothing recorded in these weeks yet.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={line} />
        <XAxis dataKey="week" tickFormatter={shortDate} {...axis} />
        <YAxis {...axis} tickFormatter={(v: number) => (unit === "money" ? `$${v}` : `${v}`)} width={48} />
        <Tooltip {...tooltipStyle} labelFormatter={(w) => `Week of ${shortDate(String(w))}`} formatter={(v) => fmt(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {used.map((c) => (
          <Bar key={c} dataKey={c} stackId="a" fill={colorFor(c)} maxBarSize={44} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LineSeries({
  data,
  lines,
  domain,
  height = 260,
}: {
  data: Record<string, number | string | null>[];
  lines: { key: string; label: string; color: string; dashed?: boolean }[];
  domain?: [number, number];
  height?: number;
}) {
  const { muted, line } = theme();
  const axis = axisFor(muted);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={line} />
        <XAxis dataKey="date" tickFormatter={shortDate} {...axis} minTickGap={24} />
        <YAxis {...axis} domain={domain ?? ["auto", "auto"]} width={40} />
        <Tooltip {...tooltipStyle} labelFormatter={(d) => shortDate(String(d))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {lines.map((l) => (
          <Line
            key={l.key}
            dataKey={l.key}
            name={l.label}
            stroke={l.color}
            strokeWidth={l.dashed ? 2.5 : 1.5}
            strokeDasharray={l.dashed ? undefined : "0"}
            strokeOpacity={l.dashed ? 1 : 0.45}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SimpleBars({
  data,
  dataKey,
  label,
  color,
  format,
  height = 220,
}: {
  data: Record<string, number | string | null>[];
  dataKey: string;
  label: string;
  color?: string;
  format?: (v: number) => string;
  height?: number;
}) {
  const { muted, line, accent } = theme();
  const axis = axisFor(muted);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={line} />
        <XAxis dataKey={label} {...axis} />
        <YAxis {...axis} width={40} />
        <Tooltip {...tooltipStyle} formatter={(v) => (format ? format(Number(v)) : v)} />
        <Bar dataKey={dataKey} fill={color ?? accent} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
