"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildPoints, DEVICES, fmtDay, fmtKr, fmtTime, HOUR_MS, plan, toBlocks,
  type BacktestReport, type ForecastData, type HourPoint, type PriceMode,
} from "@/lib/energy";
import { TimeBandChart } from "./TimeBandChart";
import { AccuracySection } from "./AccuracySection";

const DEFAULT_DEADLINE: Record<string, { days: number; hour: number }> = {
  ev: { days: 2, hour: 7 },
  heatpump: { days: 1, hour: 23 },
  dishwasher: { days: 1, hour: 7 },
};

function Toggle<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-border p-0.5 text-sm">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1 ${value === o.value ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EnergyOptimizer({ data, report }: { data: ForecastData; report: BacktestReport }) {
  const points = useMemo(() => buildPoints(data), [data]);
  const [now, setNow] = useState(() => Date.parse(data.generated_at));
  useEffect(() => setNow(Date.now()), []);

  const [deviceId, setDeviceId] = useState("ev");
  const device = DEVICES.find((d) => d.id === deviceId)!;
  const [kwh, setKwh] = useState(device.kwh);
  const [kw, setKw] = useState(device.kw);
  const [greenWeight, setGreenWeight] = useState(0.2);
  const [deadlineDays, setDeadlineDays] = useState(DEFAULT_DEADLINE.ev.days);
  const [deadlineHour, setDeadlineHour] = useState(DEFAULT_DEADLINE.ev.hour);
  const [priceMode, setPriceMode] = useState<PriceMode>("pay");
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

  const priceValue = (p: HourPoint) => (priceMode === "pay" ? p.pay : p.spot);
  const priceBand = (p: HourPoint) => (priceMode === "pay" ? p.payBand : p.spotBand);

  const dailyRows = useMemo(() => {
    const byDay = new Map<string, HourPoint[]>();
    for (const p of points) byDay.set(p.dkDate, [...(byDay.get(p.dkDate) ?? []), p]);
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
  }, [points, priceMode]);

  return (
    <div className="mt-10 space-y-10">
      {/* Planner */}
      <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        <h2 className="text-xl font-semibold tracking-tight">Plan when to use power</h2>
        <p className="mt-1 text-sm text-muted">Copenhagen household (DK2, Radius grid). Prices include grid tariffs, taxes and VAT.</p>

        <div className="mt-5 flex flex-wrap gap-2">
          {DEVICES.map((d) => (
            <button key={d.id} onClick={() => selectDevice(d.id)} aria-pressed={d.id === deviceId}
              className={`rounded-lg border px-4 py-2 text-sm ${d.id === deviceId ? "border-accent bg-accent-soft" : "border-border hover:border-accent"}`}>
              {d.name}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">{device.note}</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            <span className="text-muted">Energy needed (kWh)</span>
            <input type="number" min={0.1} step={0.1} value={kwh} onChange={(e) => setKwh(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="text-muted">Power (kW)</span>
            <input type="number" min={0.1} step={0.1} value={kw} onChange={(e) => setKw(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="text-muted">Done by (day)</span>
            <select value={deadlineDays} onChange={(e) => setDeadlineDays(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2">
              {days.map((t, i) => <option key={t} value={i}>{i === 0 ? "Today" : i === 1 ? "Tomorrow" : fmtDay(t)}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-muted">Done by (time)</span>
            <select value={deadlineHour} onChange={(e) => setDeadlineHour(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2">
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
            </select>
          </label>
        </div>

        <label className="mt-5 block text-sm">
          <span className="flex justify-between text-muted"><span>Cheapest</span><span>Greenest</span></span>
          <input type="range" min={0} max={1} step={0.1} value={greenWeight} onChange={(e) => setGreenWeight(Number(e.target.value))}
            className="mt-1 w-full accent-[var(--accent)]" aria-label="Balance between cheapest and greenest" />
        </label>

        {result ? (
          <div className="mt-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg bg-background p-4">
                <div className="text-2xl font-semibold">{fmtKr(result.cost)}</div>
                <div className="text-sm text-muted">estimated cost</div>
              </div>
              <div className="rounded-lg bg-background p-4">
                <div className="text-2xl font-semibold">{fmtKr(Math.max(0, saved))}</div>
                <div className="text-sm text-muted">
                  saved vs starting now{result.nowCost > 0 && saved > 0 ? ` (${Math.round((saved / result.nowCost) * 100)}%)` : ""}
                </div>
              </div>
              <div className="rounded-lg bg-background p-4">
                <div className="text-2xl font-semibold">{result.co2Kg.toFixed(1)} kg CO₂</div>
                <div className="text-sm text-muted">{co2Saved > 0.05 ? `${co2Saved.toFixed(1)} kg less than starting now` : "about the same as starting now"}</div>
              </div>
            </div>
            <ul className="mt-4 space-y-1 text-sm">
              {blocks.map(([a, b]) => (
                <li key={a} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm bg-accent" aria-hidden />
                  <span className="font-medium">{fmtDay(a)}</span>
                  <span className="tabular-nums text-muted">{fmtTime(a)}–{fmtTime(b)} · {Math.round((b - a) / HOUR_MS)} h</span>
                </li>
              ))}
            </ul>
            {result.usesForecast && (
              <p className="mt-3 text-xs text-muted">
                Part of this plan uses forecast prices. Real prices are published around 13:00 the day before, and the plan updates daily.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted">Not enough hours before the deadline. Pick a later time or a higher power.</p>
        )}
      </section>

      {/* Charts */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Electricity price, kr/kWh</h2>
          <Toggle label="Price shown" value={priceMode} onChange={setPriceMode}
            options={[{ value: "pay", label: "What you pay" }, { value: "spot", label: "Spot price" }]} />
        </div>
        <p className="mt-1 text-sm text-muted">
          Solid: actual and published prices. Dashed with band: forecast with 80% range. Highlighted: your plan.
        </p>
        <div className="mt-4 rounded-xl border border-border bg-surface p-3 sm:p-4">
          <TimeBandChart points={points} value={priceValue} band={priceBand} isForecast={(p) => p.isForecast}
            color="var(--series-price)" format={(v) => v.toFixed(2)} now={now} highlight={blocks}
            ariaLabel="Electricity price per hour over the last 7 days and the next 7 days, with forecast ranges" />
        </div>

        <h2 className="mt-8 text-xl font-semibold tracking-tight">CO₂ intensity, g/kWh</h2>
        <p className="mt-1 text-sm text-muted">Measured, then Energinet&apos;s own prognosis for today, then our model.</p>
        <div className="mt-4 rounded-xl border border-border bg-surface p-3 sm:p-4">
          <TimeBandChart points={points} value={(p) => p.co2} band={(p) => p.co2Band} isForecast={(p) => p.co2Source !== "actual"}
            color="var(--series-co2)" format={(v) => v.toFixed(0)} now={now} highlight={blocks}
            forecastLabel={(p) => ({ actual: "Measured", energinet: "Energinet prognosis", model: "Our forecast" })[p.co2Source]}
            ariaLabel="CO2 intensity of electricity per hour over the last 7 days and the next 7 days" />
        </div>

        <button onClick={() => setShowTable((s) => !s)} className="mt-3 text-sm text-accent hover:underline">
          {showTable ? "Hide daily table" : "Show daily table"}
        </button>
        {showTable && (
          <table className="mt-3 w-full text-sm tabular-nums">
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
        <p className="mt-3 text-xs text-muted">
          Updated {fmtDay(Date.parse(data.generated_at))} {fmtTime(Date.parse(data.generated_at))}. Supplier markup and subscriptions are not included.
        </p>
      </section>

      <AccuracySection report={report} />
    </div>
  );
}
