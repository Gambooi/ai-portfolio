"use client";

import { useEffect, useRef, useState } from "react";
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { dkParts, fmtDay, fmtTime, HOUR_MS, type HourPoint } from "@/lib/energy";
import { useInView, usePrefersReducedMotion } from "@/lib/motion";

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
  /** Charts with the same syncId share the hover crosshair (points must be the same array). */
  syncId?: string;
  /** Changing this cross-fades the chart instead of redrawing it. */
  fadeKey?: string;
};

type Row = { t: number; actual: number | null; forecast: number | null; band: [number, number] | null; p: HourPoint };

const DRAW_MS = 600;

export function TimeBandChart({
  points, value, band, isForecast, color, format, now, highlight = [], forecastLabel, ariaLabel, syncId, fadeKey,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  // Lines draw in once, the first time the chart is visible; later updates don't redraw.
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (!inView || drawn) return;
    const id = setTimeout(() => setDrawn(true), DRAW_MS + 50);
    return () => clearTimeout(id);
  }, [inView, drawn]);
  const animate = inView && !drawn && !reduced;

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
  const nowPoint = points.find((p) => p.t <= now && now < p.t + HOUR_MS);
  const nowValue = nowPoint ? value(nowPoint) : null;

  return (
    <div ref={ref} role="img" aria-label={ariaLabel} className="h-72 w-full">
      {inView && (
        <div key={fadeKey} className="fade-in h-full w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} syncId={syncId} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              {firstForecast != null && (
                <ReferenceArea x1={firstForecast} x2={last} fill="var(--chart-grid)" fillOpacity={0.35} ifOverflow="hidden"
                  label={{ value: "Forecast", position: "insideTopLeft", fill: "var(--chart-axis)", fontSize: 11 }} />
              )}
              {highlight.map(([a, b], i) => (
                <ReferenceArea key={i} x1={a} x2={b} ifOverflow="hidden"
                  shape={(s: { x: number; y: number; width: number; height: number }) => (
                    <g className="plan-block">
                      <rect x={s.x} y={s.y} width={Math.max(0, s.width)} height={s.height} fill="var(--accent)" fillOpacity={0.22} rx={2} />
                    </g>
                  )} />
              ))}
              <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} ticks={midnights}
                tickFormatter={(t) => fmtDay(t).split(" ").slice(0, 2).join(" ")} tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                stroke="var(--chart-grid)" tickLine={false} interval="preserveStartEnd" minTickGap={16} />
              <YAxis tickFormatter={(v) => format(v)} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} width={56}
                axisLine={false} tickLine={false} />
              <Area dataKey="band" stroke="none" fill={color} fillOpacity={0.16} connectNulls={false} activeDot={false}
                isAnimationActive={animate} animationDuration={DRAW_MS} animationEasing="ease-out" />
              <Line dataKey="actual" stroke={color} strokeWidth={2} dot={false} connectNulls={false}
                activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
                isAnimationActive={animate} animationDuration={DRAW_MS} animationEasing="ease-out" />
              <Line dataKey="forecast" stroke={color} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false}
                activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
                isAnimationActive={animate} animationDuration={DRAW_MS} animationEasing="ease-out" />
              {now >= points[0]?.t && now <= last + HOUR_MS && (
                <ReferenceLine x={now} stroke="var(--foreground)" strokeWidth={1} strokeOpacity={0.5}
                  label={{ value: "Now", position: "top", fill: "var(--foreground)", fontSize: 11 }} />
              )}
              {nowPoint && nowValue != null && (
                <ReferenceDot x={nowPoint.t} y={nowValue} ifOverflow="hidden"
                  shape={(s: { cx?: number; cy?: number }) => (
                    <g>
                      <circle cx={s.cx} cy={s.cy} r={4} fill={color} className="pulse-ring" />
                      <circle cx={s.cx} cy={s.cy} r={4} fill={color} stroke="var(--surface)" strokeWidth={2} />
                    </g>
                  )} />
              )}
              <Tooltip cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }} isAnimationActive={false}
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
      )}
    </div>
  );
}

/** Legend chips shared by both charts. */
export function ChartLegend() {
  const item = "inline-flex items-center gap-1.5";
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Chart legend">
      <li className={item}><svg width="18" height="6" aria-hidden><line x1="0" y1="3" x2="18" y2="3" stroke="currentColor" strokeWidth="2" /></svg>Actual</li>
      <li className={item}><svg width="18" height="6" aria-hidden><line x1="0" y1="3" x2="18" y2="3" stroke="currentColor" strokeWidth="2" strokeDasharray="5 4" /></svg>Forecast</li>
      <li className={item}><span aria-hidden className="h-2.5 w-4 rounded-sm bg-foreground/15" />80% range</li>
      <li className={item}><span aria-hidden className="h-2.5 w-4 rounded-sm bg-accent/40" />Your plan</li>
    </ul>
  );
}
