"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildPoints, DEVICES, fmtDay, fmtTime, HOUR_MS, plan, toBlocks,
  type BacktestReport, type ForecastData, type HourPoint, type PriceMode,
} from "@/lib/energy";
import { useTweenedNumber } from "@/lib/motion";
import { Reveal } from "@/components/motion/Reveal";
import { ChartLegend, TimeBandChart } from "./TimeBandChart";
import { AccuracySection } from "./AccuracySection";
import { NowStrip } from "./NowStrip";
import { Toggle } from "./Toggle";

type Range = "ahead" | "all";

const DEFAULT_DEADLINE: Record<string, { days: number; hour: number }> = {
  ev: { days: 2, hour: 7 },
  heatpump: { days: 1, hour: 23 },
  dishwasher: { days: 1, hour: 7 },
};

const inputClass = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2";

function ResultTile({ value, format, label }: { value: number; format: (v: number) => string; label: React.ReactNode }) {
  const shown = useTweenedNumber(value, { duration: 300 });
  return (
    <div className="rounded-lg bg-background p-3 sm:p-4">
      <div className="text-lg font-semibold tracking-tight sm:text-2xl">{format(shown)}</div>
      <div className="text-xs text-muted sm:text-sm">{label}</div>
    </div>
  );
}

export function EnergyOptimizer({ data, report }: { data: ForecastData; report: BacktestReport }) {
  const points = useMemo(() => buildPoints(data), [data]);
  const updated = Date.parse(data.generated_at);
  const [now, setNow] = useState(updated);
  useEffect(() => setNow(Date.now()), []);

  const [deviceId, setDeviceId] = useState("ev");
  const device = DEVICES.find((d) => d.id === deviceId)!;
  const [kwh, setKwh] = useState(device.kwh);
  const [kw, setKw] = useState(device.kw);
  const [greenWeight, setGreenWeight] = useState(0.2);
  const [deadlineDays, setDeadlineDays] = useState(DEFAULT_DEADLINE.ev.days);
  const [deadlineHour, setDeadlineHour] = useState(DEFAULT_DEADLINE.ev.hour);
  const [priceMode, setPriceMode] = useState<PriceMode>("pay");
  const [range, setRange] = useState<Range>("ahead");
  const [showTable, setShowTable] = useState(false);

  const days = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of points) if (p.t >= now - HOUR_MS && !seen.has(p.dkDate)) seen.set(p.dkDate, p.t);
    return [...seen.values()];
  }, [points, now]);

  const deadline = useMemo(() => {
    const day = days[Math.min(deadlineDays, days.length - 1)];
    const match = points.find((p) => p.t >= day && p.dkHour === deadlineHour);
    return match?.t ?? points[points.length - 1].t + HOUR_MS;
  }, [days, deadlineDays, deadlineHour, points]);

  const selectDevice = (id: string) => {
    const d = DEVICES.find((x) => x.id === id)!;
    setDeviceId(id); setKwh(d.kwh); setKw(d.kw);
    setDeadlineDays(DEFAULT_DEADLINE[id].days); setDeadlineHour(DEFAULT_DEADLINE[id].hour);
  };

  const result = useMemo(
    () => (kwh > 0 && kw > 0 ? plan(points, now, deadline, { ...device, kwh, kw }, greenWeight) : null),
    [points, now, deadline, device, kwh, kw, greenWeight],
  );
  const blocks = result ? toBlocks(result.hours) : [];
  const saved = result ? result.nowCost - result.cost : 0;
  const co2Saved = result ? result.nowCo2Kg - result.co2Kg : 0;

  // Both charts get the same array so their hover crosshairs line up (Recharts syncs by index).
  const chartPoints = useMemo(() => {
    if (range === "all") return points;
    const today = points.find((p) => p.t <= now && now < p.t + HOUR_MS)?.dkDate;
    const start = points.findIndex((p) => p.dkDate === today);
    return start > 0 ? points.slice(start) : points;
  }, [points, range, now]);

  const priceValue = (p: HourPoint) => (priceMode === "pay" ? p.pay : p.spot);
  const priceBand = (p: HourPoint) => (priceMode === "pay" ? p.payBand : p.spotBand);

  const dailyRows = useMemo(() => {
    const byDay = new Map<string, HourPoint[]>();
    for (const p of chartPoints) byDay.set(p.dkDate, [...(byDay.get(p.dkDate) ?? []), p]);
    return [...byDay.values()].map((hs) => {
      const priced = hs.filter((h) => priceValue(h) != null);
      const cheapest = priced.reduce((a, b) => (priceValue(b)! < priceValue(a)! ? b : a), priced[0]);
      const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
      return {
        t: hs[0].t,
        price: avg(priced.map((h) => priceValue(h)!)),
        cheapest,
        co2: avg(hs.filter((h) => h.co2 != null).map((h) => h.co2!)),
        forecast: hs.some((h) => h.isForecast),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartPoints, priceMode]);

  return (
    <div className="mt-10 space-y-12">
      <NowStrip points={points} now={now} updated={updated} />

      <section className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Planner controls: stay in view on desktop so the chart reacts next to them */}
        <aside className="rounded-xl border border-border bg-surface p-5 lg:sticky lg:top-6">
          <h2 className="text-lg font-semibold tracking-tight">Plan when to use power</h2>
          <p className="mt-1 text-xs text-muted">Copenhagen household (DK2, Radius grid). Prices include grid tariffs, taxes and VAT.</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {DEVICES.map((d) => (
              <button key={d.id} onClick={() => selectDevice(d.id)} aria-pressed={d.id === deviceId}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors duration-150 ${d.id === deviceId ? "border-accent bg-accent-soft" : "border-border hover:border-accent"}`}>
                {d.name}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">{device.note}</p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="text-muted">Energy (kWh)</span>
              <input type="number" min={0.1} step={0.1} value={kwh} onChange={(e) => setKwh(Number(e.target.value))} className={inputClass} />
            </label>
            <label className="text-sm">
              <span className="text-muted">Power (kW)</span>
              <input type="number" min={0.1} step={0.1} value={kw} onChange={(e) => setKw(Number(e.target.value))} className={inputClass} />
            </label>
            <label className="text-sm">
              <span className="text-muted">Done by</span>
              <select value={deadlineDays} onChange={(e) => setDeadlineDays(Number(e.target.value))} className={inputClass}>
                {days.map((t, i) => <option key={t} value={i}>{i === 0 ? "Today" : i === 1 ? "Tomorrow" : fmtDay(t)}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-muted">at</span>
              <select value={deadlineHour} onChange={(e) => setDeadlineHour(Number(e.target.value))} className={inputClass}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
              </select>
            </label>
          </div>

          <label className="mt-5 block text-sm">
            <span className="flex justify-between text-muted"><span>Cheapest</span><span>Greenest</span></span>
            <input type="range" min={0} max={1} step={0.1} value={greenWeight} onChange={(e) => setGreenWeight(Number(e.target.value))}
              className="mt-1 w-full accent-[var(--accent)]" aria-label="Balance between cheapest and greenest" />
          </label>
        </aside>

        <div className="min-w-0 space-y-6">
          {/* Result */}
          <div aria-live="polite">
            {result ? (
              <>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <ResultTile value={result.cost} format={(v) => `${v.toFixed(2)} kr`} label="estimated cost" />
                  <ResultTile value={Math.max(0, saved)} format={(v) => `${v.toFixed(2)} kr`}
                    label={<>saved vs starting now{result.nowCost > 0 && saved > 0 ? ` (${Math.round((saved / result.nowCost) * 100)}%)` : ""}</>} />
                  <ResultTile value={result.co2Kg} format={(v) => `${v.toFixed(1)} kg CO₂`}
                    label={co2Saved > 0.05 ? `${co2Saved.toFixed(1)} kg less than now` : "about the same as now"} />
                </div>
                <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  {blocks.map(([a, b]) => (
                    <li key={a} className="fade-in flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm bg-accent" aria-hidden />
                      <span className="font-medium">{fmtDay(a)}</span>
                      <span className="tabular-nums text-muted">{fmtTime(a)}–{fmtTime(b)} · {Math.round((b - a) / HOUR_MS)} h</span>
                    </li>
                  ))}
                </ul>
                {result.usesForecast && (
                  <p className="mt-2 text-xs text-muted">
                    Part of this plan uses forecast prices. Real prices are published around 13:00 the day before, and the plan updates daily.
                  </p>
                )}
              </>
            ) : (
              <p className="rounded-lg bg-background p-4 text-sm text-muted">Not enough hours before the deadline. Pick a later time or a higher power.</p>
            )}
          </div>

          {/* One control row for both charts */}
          <div className="flex flex-wrap items-center gap-3">
            <Toggle label="Price shown" value={priceMode} onChange={setPriceMode}
              options={[{ value: "pay", label: "What you pay" }, { value: "spot", label: "Spot price" }]} />
            <Toggle label="Time range" value={range} onChange={setRange}
              options={[{ value: "ahead", label: "Next 7 days" }, { value: "all", label: "Last 7 + next 7" }]} />
          </div>
          <ChartLegend />

          <div className="rounded-xl border border-border bg-surface p-3 sm:p-4">
            <h3 className="px-1 text-sm font-medium">Electricity price, kr/kWh{priceMode === "spot" ? " (spot, excl. tariffs and VAT)" : ""}</h3>
            <TimeBandChart points={chartPoints} value={priceValue} band={priceBand} isForecast={(p) => p.isForecast}
              color="var(--series-price)" format={(v) => v.toFixed(2)} now={now} highlight={blocks}
              syncId="energy" fadeKey={`${priceMode}-${range}`}
              ariaLabel="Electricity price per hour with forecast ranges and the planned hours highlighted" />
          </div>

          <div className="rounded-xl border border-border bg-surface p-3 sm:p-4">
            <h3 className="px-1 text-sm font-medium">CO₂ intensity, g/kWh</h3>
            <TimeBandChart points={chartPoints} value={(p) => p.co2} band={(p) => p.co2Band} isForecast={(p) => p.co2Source !== "actual"}
              color="var(--series-co2)" format={(v) => v.toFixed(0)} now={now} highlight={blocks}
              syncId="energy" fadeKey={range}
              forecastLabel={(p) => ({ actual: "Measured", energinet: "Energinet prognosis", model: "Our forecast" })[p.co2Source]}
              ariaLabel="CO2 intensity of electricity per hour: measured, Energinet's prognosis for today, then our forecast" />
            <p className="px-1 text-xs text-muted">Measured, then Energinet&apos;s own prognosis for today, then our model.</p>
          </div>

          <div>
            <button onClick={() => setShowTable((s) => !s)} className="text-sm text-accent hover:underline">
              {showTable ? "Hide daily table" : "Show daily table"}
            </button>
            {showTable && (
              <table className="fade-in mt-3 w-full text-sm tabular-nums">
                <thead className="text-left text-muted">
                  <tr><th className="py-1 font-normal">Day</th><th className="font-normal">Avg price</th><th className="font-normal">Cheapest hour</th><th className="font-normal">Avg CO₂</th><th className="font-normal">Data</th></tr>
                </thead>
                <tbody>
                  {dailyRows.map((r) => (
                    <tr key={r.t} className="border-t border-border">
                      <td className="py-1.5">{fmtDay(r.t)}</td>
                      <td>{r.price.toFixed(2)} kr</td>
                      <td>{r.cheapest ? `${fmtTime(r.cheapest.t)} (${priceValue(r.cheapest)!.toFixed(2)} kr)` : "–"}</td>
                      <td>{r.co2.toFixed(0)} g</td>
                      <td className="text-muted">{r.forecast ? "Forecast" : "Actual"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-2 text-xs text-muted">Supplier markup and subscriptions are not included.</p>
          </div>
        </div>
      </section>

      <Reveal>
        <AccuracySection report={report} />
      </Reveal>
    </div>
  );
}
