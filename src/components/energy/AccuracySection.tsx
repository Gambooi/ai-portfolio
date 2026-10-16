"use client";

import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BacktestReport } from "@/lib/energy";
import { useInView, usePrefersReducedMotion, useTweenedNumber } from "@/lib/motion";

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Headline figure that counts up once when it scrolls into view.
 *  The server HTML shows the real value; the count-up is only armed if the figure starts below the fold. */
function Stat({ value, label, detail }: { value: number; label: string; detail: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el && el.getBoundingClientRect().top > window.innerHeight) setArmed(true);
  }, []);
  const counting = armed && !reduced;
  const tweened = useTweenedNumber(counting && inView ? value : 0, { duration: 700, from: 0, enabled: counting });
  const shown = counting ? tweened : value;
  return (
    <div ref={ref} className="rounded-xl border border-border bg-surface p-5">
      <div className="text-3xl font-semibold tracking-tight" aria-label={pct(value)}>{pct(shown)}</div>
      <div className="mt-1 text-sm font-medium">{label}</div>
      <div className="mt-1 text-xs text-muted">{detail}</div>
    </div>
  );
}

export function AccuracySection({ report }: { report: BacktestReport }) {
  const [showTable, setShowTable] = useState(false);
  const price = report.price;
  // DKK/MWh -> øre/kWh for readability
  const rows = price.per_lead.map((r) => ({ lead: `Day ${r.lead}`, Model: r.mae_model / 10, Baseline: r.mae_baseline / 10, coverage: r.coverage_p10_p90 }));
  const charging = price.charging;

  return (
    <section id="accuracy" className="scroll-mt-6">
      <h2 className="text-2xl font-semibold tracking-tight">How accurate is it?</h2>
      <p className="mt-2 max-w-2xl text-muted">
        Tested on 12 months it never saw ({price.period[0]} to {price.period[1]}). Each month the model was retrained using only data
        available before that month, and compared with a naive forecast: the same hour last week.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat value={price.skill} label="lower price error than naive"
          detail={`Average error ${(price.mae_model / 10).toFixed(0)} vs ${(price.mae_baseline / 10).toFixed(0)} øre/kWh`} />
        {charging && (
          <Stat value={charging.captured_model} label="of the possible savings captured"
            detail={`Charging in the ${charging.hours} cheapest forecast hours. Naive forecast: ${pct(charging.captured_baseline)}`} />
        )}
        <Stat value={price.coverage_p10_p90} label="of actual prices inside the 80% range"
          detail="Target is 80%. Prices shift over time, so the ranges are recalibrated on the last 3 months" />
      </div>

      <div className="mt-8 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-medium">Average price error by days ahead (øre/kWh)</h3>
          <button onClick={() => setShowTable((s) => !s)} className="text-sm text-accent hover:underline">
            {showTable ? "Show chart" : "Show table"}
          </button>
        </div>
        {showTable ? (
          <table className="mt-4 w-full text-sm tabular-nums">
            <thead className="text-left text-muted">
              <tr><th className="py-1 font-normal">Days ahead</th><th className="font-normal">Model</th><th className="font-normal">Naive</th><th className="font-normal">Improvement</th><th className="font-normal">Inside 80% range</th></tr>
            </thead>
            <tbody>
              {price.per_lead.map((r) => (
                <tr key={r.lead} className="border-t border-border">
                  <td className="py-1.5">{r.lead}</td><td>{(r.mae_model / 10).toFixed(1)}</td><td>{(r.mae_baseline / 10).toFixed(1)}</td>
                  <td>{pct(r.skill)}</td><td>{pct(r.coverage_p10_p90)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="mt-4 h-64" role="img" aria-label="Bar chart: model error is lower than the naive forecast for every horizon from 2 to 7 days ahead">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} barGap={2} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="lead" tick={{ fill: "var(--chart-axis)", fontSize: 11 }} stroke="var(--chart-grid)" tickLine={false} />
                <YAxis tick={{ fill: "var(--chart-axis)", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip cursor={{ fill: "var(--chart-grid)", fillOpacity: 0.4 }}
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => `${Number(v).toFixed(1)} øre/kWh`} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Model" fill="var(--series-price)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                <Bar dataKey="Baseline" name="Naive (same hour last week)" fill="var(--series-muted)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-3 text-xs text-muted">
          The error grows the further ahead the model looks, as it should: weather forecasts get less certain. A flat error curve would be a
          sign that future information leaked into training.
        </p>
      </div>

      <p className="mt-4 text-sm text-muted">
        CO₂ intensity: {pct(report.co2.skill)} lower error than naive ({report.co2.mae_model.toFixed(0)} vs {report.co2.mae_baseline.toFixed(0)} g/kWh),
        with {pct(report.co2.coverage_p10_p90)} of actuals inside the 80% range.
      </p>
    </section>
  );
}
