"use client";

import { cheapestWindow, co2Level, currentPoint, dayAverage, fmtDay, fmtTime, type HourPoint } from "@/lib/energy";

export function LiveBadge({ updated }: { updated: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted">
      <span className="relative flex h-2 w-2">
        <span className="pulse-ring absolute inline-flex h-full w-full rounded-full bg-accent" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>
      Live · forecast updated {fmtDay(updated)} {fmtTime(updated)}
    </span>
  );
}

function Tile({ label, value, unit, detail }: { label: string; value: string; unit?: string; detail: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tracking-tight">{value}</span>
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </div>
      <div className="mt-1 text-sm text-muted">{detail}</div>
    </div>
  );
}

export function NowStrip({ points, now, updated }: { points: HourPoint[]; now: number; updated: number }) {
  const cur = currentPoint(points, now);
  const avg = cur ? dayAverage(points, cur) : null;
  const win = cheapestWindow(points, now, 3);

  const diff = cur?.pay != null && avg ? (cur.pay - avg) / avg : null;
  const level = cur?.co2 != null ? co2Level(points, cur.co2) : null;

  return (
    <section aria-label="Right now">
      <LiveBadge updated={updated} />
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Tile label="Price now" value={cur?.pay != null ? cur.pay.toFixed(2) : "–"} unit="kr/kWh"
          detail={diff == null ? "No data for this hour" : (
            <span>
              <span aria-hidden>{diff >= 0 ? "▲" : "▼"}</span> {Math.abs(Math.round(diff * 100))}% {diff >= 0 ? "above" : "below"} today&apos;s average
            </span>
          )} />
        <Tile label="CO₂ now" value={cur?.co2 != null ? cur.co2.toFixed(0) : "–"} unit="g/kWh"
          detail={level ? `${level[0].toUpperCase()}${level.slice(1)} compared with the last 7 days` : "No data for this hour"} />
        <Tile label="Cheapest 3 hours ahead" value={win ? win.avg.toFixed(2) : "–"} unit="kr/kWh"
          detail={win ? `${fmtDay(win.start)}, ${fmtTime(win.start)}–${fmtTime(win.end)}${win.forecast ? " (forecast)" : ""}` : "–"} />
      </div>
    </section>
  );
}
