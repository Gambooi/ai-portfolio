"use client";

import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { dkParts, fmtDay, fmtTime, HOUR_MS, type HourPoint } from "@/lib/energy";

type Props = {
  points: HourPoint[];
  value: (p: HourPoint) => number | null;
  band: (p: HourPoint) => [number, number] | null;
  isForecast: (p: HourPoint) => boolean;
  color: string;
  format: (v: number) => string;
  now: number;
  highlight?: [number, number][];
  forecastLabel?: (p: HourPoint) => string;
  ariaLabel: string;
};

type Row = { t: number; actual: number | null; forecast: number | null; band: [number, number] | null; p: HourPoint };

export function TimeBandChart({ points, value, band, isForecast, color, format, now, highlight = [], forecastLabel, ariaLabel }: Props) {
  const rows: Row[] = points.map((p, i) => {
    const v = value(p);
    const fc = isForecast(p);
    const next = points[i + 1];
    // The last actual point also starts the forecast line, so the two connect.
    const bridge = !fc && next != null && isForecast(next);
    return { t: p.t, actual: fc ? null : v, forecast: fc || bridge ? v : null, band: band(p), p };
  });

  const midnights = points.filter((p) => p.dkHour === 0).map((p) => p.t);
  const firstForecast = points.find(isForecast)?.t;
  const last = points[points.length - 1]?.t ?? now;

  return (
    <div role="img" aria-label={ariaLabel} className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          {firstForecast != null && (
            <ReferenceArea x1={firstForecast} x2={last} fill="var(--chart-grid)" fillOpacity={0.35} ifOverflow="hidden"
              label={{ value: "Forecast", position: "insideTopLeft", fill: "var(--chart-axis)", fontSize: 11 }} />
          )}
          {highlight.map(([a, b]) => (
            <ReferenceArea key={a} x1={a} x2={b} fill="var(--accent)" fillOpacity={0.22} ifOverflow="hidden" />
          ))}
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} ticks={midnights}
            tickFormatter={(t) => fmtDay(t).split(" ").slice(0, 2).join(" ")} tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
            stroke="var(--chart-grid)" tickLine={false} interval="preserveStartEnd" minTickGap={16} />
          <YAxis tickFormatter={(v) => format(v)} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} width={56}
            axisLine={false} tickLine={false} />
          <Area dataKey="band" stroke="none" fill={color} fillOpacity={0.16} isAnimationActive={false} connectNulls={false}
            activeDot={false} />
          <Line dataKey="actual" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false}
            activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }} />
          <Line dataKey="forecast" stroke={color} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false}
            connectNulls={false} activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }} />
          <ReferenceLine x={now} stroke="var(--foreground)" strokeWidth={1}
            label={{ value: "Now", position: "top", fill: "var(--foreground)", fontSize: 11 }} />
          <Tooltip cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              const row = active && payload?.[0] ? (payload[0].payload as Row) : null;
              if (!row) return null;
              const v = row.actual ?? row.forecast;
              const { hour } = dkParts(row.t);
              return (
                <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-sm">
                  <div className="text-muted">{fmtDay(row.t)} · {String(hour).padStart(2, "0")}:00–{fmtTime(row.t + HOUR_MS)}</div>
                  {v != null && <div className="mt-1 text-sm font-medium text-foreground">{format(v)}</div>}
                  {row.band && <div className="text-muted">80% range {format(row.band[0])} – {format(row.band[1])}</div>}
                  <div className="text-muted">{forecastLabel ? forecastLabel(row.p) : row.p.isForecast ? "Forecast" : "Actual"}</div>
                </div>
              );
            }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
